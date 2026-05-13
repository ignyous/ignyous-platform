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
        $log        = [];

        $log[] = "=== Ignyous Logo Upload Debug ===";
        $log[] = "File: {$file_name} | Type: {$media_type} | Set as logo: " . ($set_logo ? 'YES' : 'NO');
        $log[] = "Site: " . home_url() . " | Theme: " . wp_get_theme()->get('Name');

        if (empty($base64)) return new \WP_Error('no_image', 'image_base64 is required', ['status' => 400]);

        $decoded = base64_decode($base64);
        if ($decoded === false || strlen($decoded) < 100) {
            return new \WP_Error('bad_base64', 'Invalid base64 image data', ['status' => 400]);
        }
        $log[] = "Base64 decoded: " . number_format(strlen($decoded)) . " bytes";

        require_once ABSPATH . 'wp-admin/includes/image.php';
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';

        $tmp = tempnam(sys_get_temp_dir(), 'ignyous_');
        file_put_contents($tmp, $decoded);

        $file_array    = ['name' => $file_name, 'type' => $media_type, 'tmp_name' => $tmp, 'error' => 0, 'size' => strlen($decoded)];
        $attachment_id = media_handle_sideload($file_array, 0, sanitize_text_field($file_name));
        @unlink($tmp);

        if (is_wp_error($attachment_id)) {
            $log[] = "UPLOAD FAILED: " . $attachment_id->get_error_message();
            return new \WP_Error('upload_failed', $attachment_id->get_error_message(), ['status' => 500]);
        }

        $url   = wp_get_attachment_url($attachment_id);
        $meta  = wp_get_attachment_metadata($attachment_id);
        $thumb = wp_get_attachment_image_src($attachment_id, 'thumbnail');

        $log[] = "Uploaded to Media Library:";
        $log[] = "  ID:  {$attachment_id}";
        $log[] = "  URL: {$url}";
        $log[] = "  Dimensions: " . ($meta['width'] ?? '?') . " x " . ($meta['height'] ?? '?') . "px";
        $log[] = "  Thumbnail:  " . ($thumb[0] ?? 'none');

        $updated = [];
        if ($set_logo) {
            [$updated, $logo_log] = $this->set_logo_everywhere($attachment_id, $url, $meta, $thumb);
            $log = array_merge($log, $logo_log);
        }

        return [
            'success'           => true,
            'id'                => $attachment_id,
            'url'               => $url,
            'message'           => $set_logo
                ? 'Logo uploaded and applied to ' . count($updated) . ' location(s).'
                : 'Image uploaded to Media Library.',
            'locations_updated' => $updated,
            'debug_log'         => $log,
        ];
    }

    private function set_logo_everywhere($id, $url, $meta, $thumb) {
        $updated = [];
        $log     = [];
        $log[]   = "";
        $log[]   = "=== Applying Logo to All Locations ===";

        // 1. WordPress core custom_logo (theme_mod)
        $old = get_theme_mod('custom_logo', 'not set');
        set_theme_mod('custom_logo', $id);
        $verify = get_theme_mod('custom_logo');
        $updated[] = 'theme_mod:custom_logo';
        $log[] = "[1] theme_mod: custom_logo → {$id} (was: {$old}, verify: {$verify})";

        // 2. site_logo option
        $old = get_option('site_logo', 'not set');
        update_option('site_logo', $id);
        $verify = get_option('site_logo');
        $updated[] = 'option:site_logo';
        $log[] = "[2] option: site_logo → {$id} (was: {$old}, verify: {$verify})";

        // 3. Standalone string logo options
        $standalone = ['logo_url', 'header_logo', 'site_logo_url', 'custom_logo_url'];
        foreach ($standalone as $key) {
            $existing = get_option($key, '__NOTSET__');
            if ($existing !== '__NOTSET__') {
                update_option($key, $url);
                $updated[] = "option:{$key}";
                $log[] = "[3] option: {$key} → {$url} (was: {$existing})";
            }
        }

        // 4. Serialized theme options scanner
        $log[] = "";
        $log[] = "=== Scanning for Serialized Theme Options ===";
        [$serial_updated, $serial_log] = $this->scan_serialized_logo($id, $url, $meta, $thumb);
        $log     = array_merge($log, $serial_log);
        $updated = array_merge($updated, $serial_updated);

        // 5. Elementor kit
        $kit_id = get_option('elementor_active_kit');
        if ($kit_id) {
            $kit_meta = get_post_meta($kit_id, '_elementor_page_settings', true);
            $has_key  = is_array($kit_meta) && array_key_exists('custom_logo', $kit_meta);
            $log[] = "";
            $log[] = "[5] Elementor kit ID: {$kit_id} | has custom_logo: " . ($has_key ? 'YES' : 'NO');
            if ($has_key) {
                $kit_meta['custom_logo'] = ['id' => $id, 'url' => $url];
                update_post_meta($kit_id, '_elementor_page_settings', $kit_meta);
                $updated[] = 'elementor:kit';
                $log[] = "    → Updated Elementor kit custom_logo";
            }
        } else {
            $log[] = "[5] Elementor: not active";
        }

        return [array_values(array_unique($updated)), $log];
    }

    private function scan_serialized_logo($new_id, $new_url, $meta, $thumb) {
        global $wpdb;
        $updated = [];
        $log     = [];

        // --- STEP A: Direct check of well-known theme option names ---
        $known_names = [
            'be_options',        // Oshin / Be theme
            'oshin_options',
            'avada_options',
            'theme_options',
            'redux_options',
            get_option('template') . '_options',   // e.g. oshin_options
            get_template() . '_options',
        ];
        $known_names = array_filter(array_unique($known_names));
        $log[] = "Step A: Checking " . count($known_names) . " known theme option names: " . implode(', ', $known_names);

        foreach ($known_names as $name) {
            $val = get_option($name, '__NOTSET__');
            if ($val === '__NOTSET__' || !is_array($val)) {
                $log[] = "  [{$name}] → " . ($val === '__NOTSET__' ? 'does not exist' : 'exists but not an array');
                continue;
            }
            $log[] = "  [{$name}] → found! Array with " . count($val) . " keys";
            $result = $this->try_update_logo_in_option($name, $val, $new_id, $new_url, $meta, $thumb, $log);
            if ($result) $updated[] = "serialized_option:{$name}";
        }

        // --- STEP B: SQL scan for any option with logo array structure ---
        $log[] = "";
        $log[] = "Step B: SQL scan for options containing logo array pattern";

        // Search for both quoted formats: PHP serialized uses s:N:"key"; format
        $patterns = [
            '%logo%url%id%',                // broad search
            '%"logo";a:%',                  // specific: logo key with array value
        ];

        $found_names = [];
        foreach ($patterns as $pattern) {
            $names = $wpdb->get_col(
                $wpdb->prepare(
                    "SELECT DISTINCT option_name FROM {$wpdb->options}
                     WHERE option_value LIKE %s
                       AND option_name NOT LIKE '\_%'
                       AND option_name NOT LIKE '%transient%'
                       AND option_name NOT LIKE '%cache%'
                       AND option_name NOT LIKE '%session%'
                     LIMIT 30",
                    $pattern
                )
            );
            $log[] = "  Pattern [{$pattern}]: found " . count($names) . " option(s): " . implode(', ', array_slice($names, 0, 10));
            $found_names = array_merge($found_names, $names);
        }

        $found_names = array_diff(array_unique($found_names), $known_names); // skip already-checked
        $log[] = "  New candidates from SQL (not already checked): " . (empty($found_names) ? 'none' : implode(', ', $found_names));

        foreach ($found_names as $name) {
            $val = get_option($name);
            if (!is_array($val)) {
                $log[] = "  [{$name}] → not an array, skipping";
                continue;
            }
            $log[] = "  [{$name}] → array with " . count($val) . " keys";
            $result = $this->try_update_logo_in_option($name, $val, $new_id, $new_url, $meta, $thumb, $log);
            if ($result) $updated[] = "serialized_option:{$name}";
        }

        return [$updated, $log];
    }

    /**
     * Try to update the 'logo' key in a theme options array.
     * Returns true if the option was successfully updated.
     */
    private function try_update_logo_in_option($option_name, $data, $new_id, $new_url, $meta, $thumb, &$log) {
        // Find all keys that look like logo arrays
        $logo_keys = [];
        foreach ($data as $key => $val) {
            if (is_string($key)
                && stripos($key, 'logo') !== false
                && is_array($val)
                && array_key_exists('url', $val)
                && array_key_exists('id', $val)
            ) {
                $logo_keys[] = $key;
            }
        }

        $log[] = "    Logo-array keys in [{$option_name}]: " . (empty($logo_keys) ? 'NONE' : implode(', ', $logo_keys));

        if (!in_array('logo', $logo_keys)) {
            $log[] = "    No 'logo' key found — skipping";
            return false;
        }

        $cur_url = $data['logo']['url'] ?? '(empty)';
        $cur_id  = $data['logo']['id']  ?? '(empty)';
        $log[]   = "    Current logo: url={$cur_url} | id={$cur_id}";
        $log[]   = "    New logo:     url={$new_url} | id={$new_id}";

        // Direct assignment — no references, no recursion
        $data['logo']['url'] = $new_url;
        $data['logo']['id']  = (string) $new_id;
        if (!empty($meta['width']))  $data['logo']['width']  = (string) $meta['width'];
        if (!empty($meta['height'])) $data['logo']['height'] = (string) $meta['height'];
        if (!empty($thumb[0]))       $data['logo']['thumbnail'] = $thumb[0];

        // Force update even if WordPress thinks value is unchanged
        // by deleting then re-adding
        delete_option($option_name);
        $added = add_option($option_name, $data, '', 'yes');
        if (!$added) {
            // If add_option fails (option already exists somehow), use update_option
            update_option($option_name, $data);
        }

        // Verify
        wp_cache_delete($option_name, 'options');  // clear WordPress object cache
        $verify   = get_option($option_name);
        $saved_url = is_array($verify) && isset($verify['logo']['url']) ? $verify['logo']['url'] : 'NOT FOUND';
        $saved_id  = is_array($verify) && isset($verify['logo']['id'])  ? $verify['logo']['id']  : 'NOT FOUND';

        $success = ($saved_url === $new_url);
        $log[] = "    " . ($success ? "✅ SUCCESS" : "❌ FAILED") . " — Verified url={$saved_url} | id={$saved_id}";

        return $success;
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
            foreach (getallheaders() as $k => $v) if (strtolower($k) === 'authorization') { $auth = $v; break; }
        }
        if (empty($auth)) $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        $xkey = '';
        if (function_exists('getallheaders')) {
            foreach (getallheaders() as $k => $v) if (strtolower($k) === 'x-ignyous-key') { $xkey = $v; break; }
        }
        if (empty($xkey)) $xkey = $_SERVER['HTTP_X_IGNYOUS_KEY'] ?? '';
        if (!empty($xkey) && hash_equals($stored, trim($xkey))) return true;
        if (preg_match('/Bearer\s+(.+)/i', $auth, $m)) return hash_equals($stored, trim($m[1]));
        return false;
    }
}
