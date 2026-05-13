<?php
namespace Ignyous\Api;

class MediaController {
    public function register_routes() {
        register_rest_route('ignyous/v1', '/media/upload', [
            'methods'             => 'POST',
            'callback'            => [$this, 'upload_image'],
            'permission_callback' => '__return_true',
        ]);
        register_rest_route('ignyous/v1', '/media/logo-info', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_logo_info'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
    }

    private function verify_request($request) {
        $stored = get_option('ignyous_bridge_api_key', '');
        if (empty($stored)) return false;

        $headers = [];
        if (function_exists('getallheaders')) {
            foreach (getallheaders() as $k => $v) $headers[strtolower($k)] = $v;
        }
        foreach ($_SERVER as $k => $v) {
            if (strpos($k, 'HTTP_') === 0) {
                $name = strtolower(str_replace('_', '-', substr($k, 5)));
                if (!isset($headers[$name])) $headers[$name] = $v;
            }
        }

        if (!empty($headers['x-ignyous-key']) && hash_equals($stored, trim($headers['x-ignyous-key']))) return true;
        $auth = $headers['authorization'] ?? '';
        if (preg_match('/Bearer\s+(.+)/i', $auth, $m) && hash_equals($stored, trim($m[1]))) return true;
        $body = $request->get_json_params();
        if (!empty($body['api_key']) && hash_equals($stored, $body['api_key'])) return true;
        $qp = $request->get_query_params();
        if (!empty($qp['api_key']) && hash_equals($stored, $qp['api_key'])) return true;
        return false;
    }

    public function upload_image($request) {
        if (!$this->verify_request($request)) {
            return new \WP_Error('rest_forbidden', 'Invalid or missing API key.', ['status' => 401]);
        }

        $body       = $request->get_json_params();
        $base64     = $body['image_base64'] ?? '';
        $media_type = $body['media_type']   ?? 'image/png';
        $file_name  = sanitize_file_name($body['file_name'] ?? ('upload-' . time() . '.png'));
        $set_logo   = !empty($body['set_as_logo']);

        if (empty($base64)) return new \WP_Error('no_image', 'image_base64 is required', ['status' => 400]);

        $decoded = base64_decode($base64);
        if ($decoded === false || strlen($decoded) < 100) {
            return new \WP_Error('bad_base64', 'Invalid base64 image data', ['status' => 400]);
        }

        require_once ABSPATH . 'wp-admin/includes/image.php';
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';

        $tmp = tempnam(sys_get_temp_dir(), 'ignyous_');
        file_put_contents($tmp, $decoded);

        $file_array = [
            'name'     => $file_name,
            'type'     => $media_type,
            'tmp_name' => $tmp,
            'error'    => 0,
            'size'     => strlen($decoded),
        ];

        $attachment_id = media_handle_sideload($file_array, 0, sanitize_text_field($file_name));
        @unlink($tmp);

        if (is_wp_error($attachment_id)) {
            return new \WP_Error('upload_failed', $attachment_id->get_error_message(), ['status' => 500]);
        }

        $url      = wp_get_attachment_url($attachment_id);
        $meta     = wp_get_attachment_metadata($attachment_id);
        $thumb    = wp_get_attachment_image_src($attachment_id, 'thumbnail');
        $updated  = [];

        if ($set_logo) {
            $updated = $this->set_logo_everywhere($attachment_id, $url, $meta, $thumb);
        }

        return [
            'success'           => true,
            'id'                => $attachment_id,
            'url'               => $url,
            'message'           => $set_logo
                ? 'Logo uploaded and applied to ' . count($updated) . ' location(s)!'
                : 'Image uploaded to Media Library.',
            'locations_updated' => $updated,
        ];
    }

    private function set_logo_everywhere($id, $url, $meta, $thumb) {
        $updated = [];

        // 1. WordPress core custom_logo
        set_theme_mod('custom_logo', $id);
        $updated[] = 'theme_mod:custom_logo';

        // 2. site_logo option (FSE/block themes)
        update_option('site_logo', $id);
        $updated[] = 'option:site_logo';

        // 3. Scan existing theme_mods for known logo keys
        $mods = get_theme_mods();
        foreach (['logo', 'logo_image', 'logo_url', 'header_logo', 'site_logo_url'] as $key) {
            if (array_key_exists($key, $mods)) {
                set_theme_mod($key, $url);
                $updated[] = 'theme_mod:' . $key;
            }
        }

        // 4. Scan wp_options for standalone logo options
        foreach (['logo', 'logo_url', 'header_logo', 'site_logo_url', 'custom_logo_url'] as $key) {
            if (get_option($key) !== false) {
                update_option($key, $url);
                $updated[] = 'option:' . $key;
            }
        }

        // 5. Scan ALL options for serialized arrays containing logo structures
        $serialized = $this->find_and_update_serialized_logo($id, $url, $meta, $thumb);
        $updated    = array_merge($updated, $serialized);

        // 6. Elementor kit
        $kit_id = get_option('elementor_active_kit');
        if ($kit_id) {
            $kit_meta = get_post_meta($kit_id, '_elementor_page_settings', true);
            if (is_array($kit_meta) && array_key_exists('custom_logo', $kit_meta)) {
                $kit_meta['custom_logo'] = ['id' => $id, 'url' => $url];
                update_post_meta($kit_id, '_elementor_page_settings', $kit_meta);
                $updated[] = 'elementor:kit';
            }
        }

        return array_values(array_unique($updated));
    }

    /**
     * Scan all wp_options for serialized arrays that contain logo data structures.
     * This handles complex theme options (Oshin/Be, Avada, etc.) that store
     * the logo as a nested array inside a single serialized option.
     */
    private function find_and_update_serialized_logo($new_id, $new_url, $meta, $thumb) {
        global $wpdb;
        $updated = [];

        // Find options whose serialized value contains an array with a 'logo' key
        // that itself has 'url' and 'id' sub-keys (classic theme options pattern)
        $rows = $wpdb->get_results(
            "SELECT option_name, option_value FROM {$wpdb->options}
             WHERE option_value LIKE '%\"logo\"%\"url\"%'
               AND option_value LIKE '%\"id\"%'
               AND option_name NOT LIKE '\_%'
               AND option_name NOT LIKE '%transient%'
               AND option_name NOT LIKE '%session%'
             LIMIT 20"
        );

        foreach ($rows as $row) {
            if (!is_serialized($row->option_value)) continue;

            $data = @unserialize($row->option_value);
            if (!is_array($data)) continue;

            $changed = $this->update_logo_key_in_array($data, $new_id, $new_url, $meta, $thumb);
            if ($changed) {
                update_option($row->option_name, $data);
                $updated[] = 'serialized_option:' . $row->option_name;
            }
        }

        return $updated;
    }

    /**
     * Recursively find and update logo array structures within a nested PHP array.
     * Returns true if anything was changed.
     */
    private function update_logo_key_in_array(&$arr, $id, $url, $meta, $thumb, $depth = 0) {
        if ($depth > 5 || !is_array($arr)) return false;
        $changed = false;

        foreach ($arr as $key => &$val) {
            // Found a key called 'logo' (or logo_sticky, logo_transparent, etc.) that is an array
            // with a 'url' sub-key — this is the classic theme options logo structure
            if (is_string($key) && strpos($key, 'logo') !== false && is_array($val)) {
                if (isset($val['url']) && isset($val['id'])) {
                    // This matches the pattern: logo => [url, id, width, height, thumbnail]
                    // Only update the MAIN logo (logo_sticky, logo_transparent are for specific states)
                    if ($key === 'logo') {
                        $val['url'] = $new_url;
                        $val['id']  = (string) $id;
                        if ($meta && !empty($meta['width']))  $val['width']  = (string) $meta['width'];
                        if ($meta && !empty($meta['height'])) $val['height'] = (string) $meta['height'];
                        if ($thumb && !empty($thumb[0]))      $val['thumbnail'] = $thumb[0];
                        $changed = true;
                    }
                } elseif (is_array($val) && $depth < 3) {
                    // Recurse into nested arrays
                    if ($this->update_logo_key_in_array($val, $id, $url, $meta, $thumb, $depth + 1)) {
                        $changed = true;
                    }
                }
            } elseif (is_array($val) && $depth < 3) {
                if ($this->update_logo_key_in_array($val, $id, $url, $meta, $thumb, $depth + 1)) {
                    $changed = true;
                }
            }
        }

        return $changed;
    }

    public function get_logo_info($request) {
        $logo_id  = get_theme_mod('custom_logo');
        $logo_url = $logo_id ? wp_get_attachment_url($logo_id) : '';
        return ['success' => true, 'logo_id' => $logo_id, 'logo_url' => $logo_url, 'theme' => wp_get_theme()->get('Name')];
    }

    public function check_permission() {
        $stored = get_option('ignyous_bridge_api_key', '');
        if (empty($stored)) return false;
        $auth = '';
        if (function_exists('getallheaders')) {
            foreach (getallheaders() as $k => $v) { if (strtolower($k) === 'authorization') { $auth = $v; break; } }
        }
        if (empty($auth)) $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if (preg_match('/Bearer\s+(.+)/i', $auth, $m)) return hash_equals($stored, trim($m[1]));
        return false;
    }
}
