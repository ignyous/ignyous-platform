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
        $log[] = "Template: " . get_template() . " | Stylesheet: " . get_stylesheet();

        if (empty($base64)) return new \WP_Error('no_image', 'image_base64 required', ['status' => 400]);
        $decoded = base64_decode($base64);
        if (!$decoded || strlen($decoded) < 100) return new \WP_Error('bad_base64', 'Invalid base64', ['status' => 400]);
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

        $log[] = "Uploaded → ID:{$attachment_id} | URL:{$url}";
        $log[] = "Dimensions: " . ($meta['width'] ?? '?') . "×" . ($meta['height'] ?? '?') . "px";
        $log[] = "Thumbnail:  " . ($thumb[0] ?? 'none');

        $updated = [];
        if ($set_logo) {
            [$updated, $apply_log] = $this->apply_logo($attachment_id, $url, $meta, $thumb);
            $log = array_merge($log, $apply_log);
        }

        return [
            'success'           => true,
            'id'                => $attachment_id,
            'url'               => $url,
            'message'           => $set_logo
                ? 'Logo uploaded. Applied to ' . count($updated) . ' location(s). See debug log.'
                : 'Image uploaded to Media Library.',
            'locations_updated' => $updated,
            'debug_log'         => $log,
        ];
    }

    private function apply_logo($id, $url, $meta, $thumb) {
        global $wpdb;
        $updated = [];
        $log     = [];
        $log[]   = "";
        $log[]   = "=== Applying Logo ===";

        // 1. WordPress standard
        $old = get_theme_mod('custom_logo', 'not set');
        set_theme_mod('custom_logo', $id);
        $verify    = get_theme_mod('custom_logo');
        $updated[] = 'theme_mod:custom_logo';
        $log[]     = "[1] theme_mod:custom_logo → {$id} (was:{$old}, verified:{$verify})";

        update_option('site_logo', $id);
        $updated[] = 'option:site_logo';
        $log[]     = "[2] option:site_logo → {$id}";

        // 2. Find the Redux/theme options row —
        //    Strategy: scan ALL wp_options for large serialized arrays that have a 'logo' sub-array
        $log[] = "";
        $log[] = "=== Scanning ALL wp_options for logo arrays ===";

        // Pull ALL non-autoload options that are large enough to be theme options
        // We can't rely on LIKE because the serialized format might vary
        $rows = $wpdb->get_results(
            "SELECT option_name, LENGTH(option_value) as len
             FROM {$wpdb->options}
             WHERE LENGTH(option_value) > 500
               AND option_name NOT LIKE '\_%'
               AND option_name NOT LIKE '%transient%'
               AND option_name NOT LIKE '%cache%'
               AND option_name NOT LIKE '%session%'
               AND option_name NOT LIKE '%nonce%'
               AND option_name NOT LIKE 'cron'
             ORDER BY len DESC
             LIMIT 60"
        );

        $log[] = "Found " . count($rows) . " large options to inspect";
        $log[] = "Option names (by size): " . implode(', ', array_map(fn($r) => $r->option_name . '(' . $r->len . ')', array_slice($rows, 0, 15)));

        $found_option = null;
        // Known plugin option names to skip — these are never theme logo options
        $skip_options = [
            'revslider', 'revslider_installedversion', 'revslider_update',
            'revslider_purchase_code', 'revslider_checked', 'revslider_demo',
            'wp_user_roles', 'widget_', 'sidebars_widgets', 'nav_menu',
            'active_plugins', 'rewrite_rules', 'wp_mail_smtp',
        ];

        foreach ($rows as $row) {
            // Skip known plugin options by prefix/name
            $skip = false;
            foreach ($skip_options as $prefix) {
                if (stripos($row->option_name, $prefix) !== false) { $skip = true; break; }
            }
            if ($skip) {
                $log[] = "  [{$row->option_name}] → skipped (known plugin option)";
                continue;
            }

            // Use get_option() so WordPress handles unserialize safely
            $val = get_option($row->option_name);

            // Must be a plain PHP array (not stdClass object, not scalar)
            if (!is_array($val)) {
                $log[] = "  [{$row->option_name}] → " . gettype($val) . ", skipping";
                continue;
            }

            // Must have a 'logo' key that is itself an array with 'url' and 'id'
            if (!isset($val['logo']) || !is_array($val['logo'])
                || !array_key_exists('url', $val['logo'])
                || !array_key_exists('id', $val['logo'])
            ) {
                $log[] = "  [{$row->option_name}] → array/{" . count($val) . " keys}, no logo→{url,id} structure";
                continue;
            }

            // False-positive check 1: logo.id must be numeric (WordPress attachment ID)
            $logo_id_val = $val['logo']['id'];
            if (!empty($logo_id_val) && !is_numeric($logo_id_val)) {
                $log[] = "  [{$row->option_name}] → has logo.id='{$logo_id_val}' but it's not numeric — likely a plugin logo, skipping";
                continue;
            }

            // False-positive check 2: logo.url must look like an image file (if set)
            $logo_url_val = $val['logo']['url'];
            if (!empty($logo_url_val)) {
                $ext = strtolower(pathinfo(parse_url($logo_url_val, PHP_URL_PATH), PATHINFO_EXTENSION));
                if (!in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', ''])) {
                    $log[] = "  [{$row->option_name}] → logo.url='{$logo_url_val}' has non-image extension '{$ext}' — skipping";
                    continue;
                }
            }

            // False-positive check 3: the array should look like theme settings.
            // Theme options (Redux/Kirki/etc.) typically contain typography/color/header keys.
            $theme_indicators = ['last_tab', 'color_scheme', 'opt-header-type', 'opt-header-color',
                                  'navigation_text', 'body_text', 'footer_text', 'footer-style',
                                  'h1', 'h2', 'h3', 'button_font', 'blog_style'];
            $indicator_count = 0;
            foreach ($theme_indicators as $indicator) {
                if (array_key_exists($indicator, $val)) $indicator_count++;
            }
            if ($indicator_count === 0) {
                $top_keys = implode(', ', array_slice(array_keys($val), 0, 6));
                $log[] = "  [{$row->option_name}] → has logo→{url,id} but 0 theme indicators — likely a plugin, skipping. Keys: {$top_keys}";
                continue;
            }

            // All checks passed
            $found_option  = $row->option_name;
            $cur_url = $val['logo']['url'] ?? '(empty)';
            $cur_id  = $val['logo']['id']  ?? '(empty)';
            $log[] = "";
            $log[] = "✅ FOUND theme logo array in [{$found_option}] ({$row->len} bytes, {$indicator_count} theme indicators)";
            $log[] = "   Current: url={$cur_url} | id={$cur_id}";
            $log[] = "   New:     url={$url} | id={$id}";

                // Also log any other logo-variant keys (logo_sticky, etc.)
                $logo_keys = array_filter(array_keys($val), fn($k) => is_string($k) && stripos($k, 'logo') !== false && is_array($val[$k]));
                $log[] = "   Other logo-variant keys: " . (empty($logo_keys) ? 'none' : implode(', ', $logo_keys));

                // Update logo fields directly — no references
                $val['logo']['url'] = $url;
                $val['logo']['id']  = (string) $id;
                if (!empty($meta['width']))  $val['logo']['width']  = (string) $meta['width'];
                if (!empty($meta['height'])) $val['logo']['height'] = (string) $meta['height'];
                if (!empty($thumb[0]))       $val['logo']['thumbnail'] = $thumb[0];

                // Force save: delete then re-add to bypass WordPress "no change" optimisation
                wp_cache_delete($found_option, 'options');
                delete_option($found_option);
                add_option($found_option, $val, '', 'yes');

                // Verify
                wp_cache_delete($found_option, 'options');
                $check = get_option($found_option);
                $saved_url = $check['logo']['url'] ?? 'NOT FOUND';
                $saved_id  = $check['logo']['id']  ?? 'NOT FOUND';

                if ($saved_url === $url) {
                    $log[]     = "   ✅ VERIFIED SAVED — url={$saved_url}";
                    $updated[] = "serialized_option:{$found_option}";
                } else {
                    $log[] = "   ❌ SAVE FAILED — expected url={$url}, got url={$saved_url}";
                    // Try update_option as fallback
                    update_option($found_option, $val);
                    wp_cache_delete($found_option, 'options');
                    $check2     = get_option($found_option);
                    $saved_url2 = $check2['logo']['url'] ?? 'NOT FOUND';
                    $log[] = "   Retry via update_option: url={$saved_url2}";
                    if ($saved_url2 === $url) $updated[] = "serialized_option:{$found_option}";
                }

                break; // Found it — stop scanning
            }
        }

        if (!$found_option) {
            $log[] = "";
            $log[] = "❌ No logo array found in any option. Dumping top 20 option names for manual inspection:";
            foreach (array_slice($rows, 0, 20) as $row) {
                $val = get_option($row->option_name);
                $type = gettype($val);
                $keys = is_array($val) ? 'keys[' . count($val) . ']: ' . implode(',', array_slice(array_keys($val), 0, 8)) : substr((string)$val, 0, 80);
                $log[] = "   [{$row->option_name}] {$type} — {$keys}";
            }
            $log[] = "";
            $log[] = "ACTION NEEDED: Share this log so we can identify the correct option name.";
        }

        // 3. Elementor
        $kit_id = get_option('elementor_active_kit');
        if ($kit_id) {
            $kit_meta = get_post_meta($kit_id, '_elementor_page_settings', true);
            $log[] = "[E] Elementor kit {$kit_id}, has custom_logo: " . (is_array($kit_meta) && isset($kit_meta['custom_logo']) ? 'YES' : 'NO');
            if (is_array($kit_meta) && array_key_exists('custom_logo', $kit_meta)) {
                $kit_meta['custom_logo'] = ['id' => $id, 'url' => $url];
                update_post_meta($kit_id, '_elementor_page_settings', $kit_meta);
                $updated[] = 'elementor:kit';
                $log[] = "    → Updated Elementor kit logo";
            }
        }

        return [array_values(array_unique($updated)), $log];
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
        if (preg_match('/Bearer\s+(.+)/i', $auth)) {
            preg_match('/Bearer\s+(.+)/i', $auth, $m);
            return hash_equals($stored, trim($m[1]));
        }
        return false;
    }
}
