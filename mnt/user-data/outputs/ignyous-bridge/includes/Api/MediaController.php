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

    // ── Auth ──────────────────────────────────────────────────────────────
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

    // ── Upload + apply logo ───────────────────────────────────────────────
    public function upload_image($request) {
        if (!$this->verify_request($request)) {
            return new \WP_Error('rest_forbidden', 'Invalid or missing API key.', ['status' => 401]);
        }

        $body       = $request->get_json_params();
        $base64     = $body['image_base64'] ?? '';
        $media_type = $body['media_type']   ?? 'image/png';
        $file_name  = sanitize_file_name($body['file_name'] ?? ('upload-' . time() . '.png'));
        $set_logo   = !empty($body['set_as_logo']);
        $debug      = [];

        $debug[] = "▶ Upload started: {$file_name} ({$media_type}), set_as_logo=" . ($set_logo ? 'true' : 'false');

        if (empty($base64)) return new \WP_Error('no_image', 'image_base64 is required', ['status' => 400]);

        $decoded = base64_decode($base64);
        if ($decoded === false || strlen($decoded) < 100) {
            return new \WP_Error('bad_base64', 'Invalid base64 image data', ['status' => 400]);
        }
        $debug[] = "  ✓ Base64 decoded: " . strlen($decoded) . " bytes";

        require_once ABSPATH . 'wp-admin/includes/image.php';
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';

        $tmp = tempnam(sys_get_temp_dir(), 'ignyous_');
        file_put_contents($tmp, $decoded);
        $debug[] = "  ✓ Written to temp file: {$tmp}";

        $file_array = ['name' => $file_name, 'type' => $media_type, 'tmp_name' => $tmp, 'error' => 0, 'size' => strlen($decoded)];
        $attachment_id = media_handle_sideload($file_array, 0, sanitize_text_field($file_name));
        @unlink($tmp);

        if (is_wp_error($attachment_id)) {
            $debug[] = "  ✗ media_handle_sideload failed: " . $attachment_id->get_error_message();
            return new \WP_Error('upload_failed', $attachment_id->get_error_message() . ' | Debug: ' . implode(' | ', $debug), ['status' => 500]);
        }

        $url   = wp_get_attachment_url($attachment_id);
        $meta  = wp_get_attachment_metadata($attachment_id);
        $thumb = wp_get_attachment_image_src($attachment_id, 'thumbnail');

        $debug[] = "  ✓ Uploaded to Media Library — ID: {$attachment_id}, URL: {$url}";
        $debug[] = "    Dimensions: " . ($meta['width'] ?? '?') . "×" . ($meta['height'] ?? '?') . ", Thumbnail: " . ($thumb[0] ?? 'none');

        $updated = [];
        if ($set_logo) {
            [$updated, $logo_debug] = $this->set_logo_everywhere($attachment_id, $url, $meta, $thumb);
            $debug = array_merge($debug, $logo_debug);
        }

        return [
            'success'           => true,
            'id'                => $attachment_id,
            'url'               => $url,
            'message'           => $set_logo
                ? 'Logo uploaded and applied to ' . count($updated) . ' location(s). See debug log for details.'
                : 'Image uploaded to Media Library.',
            'locations_updated' => $updated,
            'debug_log'         => $debug,
        ];
    }

    private function set_logo_everywhere($id, $url, $meta, $thumb) {
        $updated = [];
        $log     = [];

        // 1. WordPress core custom_logo
        $old_logo = get_theme_mod('custom_logo');
        set_theme_mod('custom_logo', $id);
        $updated[] = 'theme_mod:custom_logo';
        $log[]     = "▶ [theme_mod:custom_logo] old={$old_logo} → new={$id}";

        // 2. site_logo option
        $old_site_logo = get_option('site_logo');
        update_option('site_logo', $id);
        $updated[] = 'option:site_logo';
        $log[]     = "▶ [option:site_logo] old={$old_site_logo} → new={$id}";

        // 3. Known standalone logo options (URL-based)
        foreach (['logo', 'logo_url', 'header_logo', 'site_logo_url', 'custom_logo_url', 'logo_image_url'] as $key) {
            $existing = get_option($key, null);
            if ($existing !== null && $existing !== false) {
                update_option($key, $url);
                $updated[] = "option:{$key}";
                $log[]     = "▶ [option:{$key}] old={$existing} → new={$url}";
            }
        }

        // 4. Scan ALL theme_mods for logo keys
        $mods = get_theme_mods();
        foreach ($mods as $key => $val) {
            if (is_string($key) && stripos($key, 'logo') !== false && $key !== 'custom_logo') {
                $log[] = "  Checking theme_mod [{$key}]: " . (is_array($val) ? 'array' : substr((string)$val, 0, 60));
            }
        }

        // 5. Serialized option scanner — safe version using get_option()
        $serialized_log = $this->scan_and_update_serialized_logo($id, $url, $meta, $thumb);
        $updated_from_serialized = array_filter($serialized_log, fn($l) => strpos($l, '✓ UPDATED') !== false);
        foreach ($serialized_log as $line) $log[] = $line;
        foreach ($updated_from_serialized as $line) {
            preg_match('/option_name=(\S+)/', $line, $m);
            if (!empty($m[1])) $updated[] = "serialized_option:{$m[1]}";
        }

        // 6. Elementor kit
        $kit_id = get_option('elementor_active_kit');
        if ($kit_id) {
            $kit_meta = get_post_meta($kit_id, '_elementor_page_settings', true);
            $log[] = "▶ Elementor kit ID: {$kit_id}, has custom_logo key: " . (is_array($kit_meta) && isset($kit_meta['custom_logo']) ? 'yes' : 'no');
            if (is_array($kit_meta) && array_key_exists('custom_logo', $kit_meta)) {
                $kit_meta['custom_logo'] = ['id' => $id, 'url' => $url];
                update_post_meta($kit_id, '_elementor_page_settings', $kit_meta);
                $updated[] = 'elementor:kit';
                $log[] = "  ✓ UPDATED Elementor kit custom_logo";
            }
        }

        return [array_values(array_unique($updated)), $log];
    }

    /**
     * Safely scan wp_options for serialized arrays containing {logo: {url, id, ...}} structure.
     * Uses get_option() (not raw SQL) for reading to avoid deserialization issues.
     * Uses direct array key assignment (no references) to avoid PHP foreach reference bugs.
     */
    private function scan_and_update_serialized_logo($new_id, $new_url, $meta, $thumb) {
        global $wpdb;
        $log = [];

        $log[] = "▶ Scanning serialized options for logo arrays…";

        // Find candidate option names via SQL (just names, not values)
        $candidate_names = $wpdb->get_col(
            "SELECT option_name FROM {$wpdb->options}
             WHERE option_value LIKE '%\"logo\";a:%'
               AND option_name NOT LIKE '\_%'
               AND option_name NOT LIKE '%transient%'
               AND option_name NOT LIKE '%session%'
             LIMIT 20"
        );

        $log[] = "  Found " . count($candidate_names) . " candidate option(s): " . implode(', ', array_slice($candidate_names, 0, 10));

        foreach ($candidate_names as $option_name) {
            $log[] = "";
            $log[] = "  ▶ Checking option: [{$option_name}]";

            // Use get_option() — WordPress safely unserializes this
            $data = get_option($option_name);

            if (!is_array($data)) {
                $log[] = "    ✗ Skipped — not an array after get_option()";
                continue;
            }

            $log[] = "    Array with " . count($data) . " top-level keys";

            // Look for logo key(s) with the {url, id, width, height, thumbnail} structure
            $found_logos = $this->find_logo_arrays_in($data);
            $log[] = "    Logo array keys found: " . (empty($found_logos) ? 'none' : implode(', ', array_keys($found_logos)));

            if (empty($found_logos)) {
                $log[] = "    ✗ No logo arrays — skipping";
                continue;
            }

            // Show current values
            foreach ($found_logos as $key => $val) {
                $current_url = $val['url'] ?? '(empty)';
                $current_id  = $val['id']  ?? '(empty)';
                $log[] = "    Key [{$key}]: url={$current_url}, id={$current_id}";
            }

            // Update ONLY the 'logo' key (not logo_sticky/logo_transparent which are typically empty)
            if (!isset($found_logos['logo'])) {
                $log[] = "    ✗ No 'logo' key specifically — skipping update to avoid corrupting other logo fields";
                continue;
            }

            $current_logo_url = $data['logo']['url'] ?? '';
            $current_logo_id  = $data['logo']['id']  ?? '';

            $log[] = "    ▶ Attempting update of [{$option_name}][logo]";
            $log[] = "      Current: url={$current_logo_url}, id={$current_logo_id}";
            $log[] = "      New:     url={$new_url}, id={$new_id}";

            // Direct assignment — NO foreach references, no recursion
            $data['logo']['url'] = $new_url;
            $data['logo']['id']  = (string) $new_id;
            if (!empty($meta['width']))  $data['logo']['width']  = (string) $meta['width'];
            if (!empty($meta['height'])) $data['logo']['height'] = (string) $meta['height'];
            if (!empty($thumb[0]))       $data['logo']['thumbnail'] = $thumb[0];

            // Write back
            $result = update_option($option_name, $data);
            $log[] = "    update_option() returned: " . ($result ? 'true (changed)' : 'false (no change or error)');

            // Verify it was actually saved
            $verify = get_option($option_name);
            $saved_url = is_array($verify) && isset($verify['logo']['url']) ? $verify['logo']['url'] : 'NOT FOUND';
            $saved_id  = is_array($verify) && isset($verify['logo']['id'])  ? $verify['logo']['id']  : 'NOT FOUND';
            $log[] = "    ✓ UPDATED option_name={$option_name} — Verified: url={$saved_url}, id={$saved_id}";

            if ($saved_url !== $new_url) {
                $log[] = "    ✗ WARNING: Saved URL does not match! Expected {$new_url}, got {$saved_url}";
            }
        }

        return $log;
    }

    /**
     * Find all top-level keys that look like logo arrays: {url, id, ...}
     * Returns only the DIRECT children of $arr, not recursive.
     */
    private function find_logo_arrays_in($arr) {
        $found = [];
        foreach ($arr as $key => $val) {
            if (is_string($key)
                && stripos($key, 'logo') !== false
                && is_array($val)
                && array_key_exists('url', $val)
                && array_key_exists('id', $val)
            ) {
                $found[$key] = $val;
            }
        }
        return $found;
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
