<?php
namespace Ignyous\Api;

/**
 * MediaController — handles image/logo upload and application.
 *
 * Theme option names (from source analysis):
 *   Oshin / Be Themes  → 'be_themes_data'  (global $be_themes_data)
 *                         confirmed in functions/be-themes-options-config.php:
 *                         'opt_name' => 'be_themes_data'
 *   Logo fields: logo, logo_sticky, logo_transparent, logo_transparent_light,
 *                logo_sidebar, left-strip-logo
 *                Each field: { url, id, height, width, thumbnail }
 */
class MediaController {
    // ── Theme option registry (add more themes here as their source is analysed) ──
    private static $KNOWN_THEME_OPTIONS = [
        'be_themes_data',     // Oshin / Be Themes (Brand Exponents) ✓ confirmed
        // add more here: 'avada_options', 'woodmart_settings', etc.
    ];

    // ── Logo field IDs in Oshin/Be — all are {url, id, width, height, thumbnail} arrays ──
    private static $LOGO_FIELD_IDS = [
        'logo',                  // main logo (always update this)
        'logo_sticky',           // sticky header logo
        'logo_transparent',      // dark transparent logo
        'logo_transparent_light',// light transparent logo
        'logo_sidebar',          // sidebar/slidebar logo
        'left-strip-logo',       // left strip logo
    ];

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

        $log[] = "=== Ignyous Logo Upload ===";
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
            return ['success' => false, 'error' => $attachment_id->get_error_message(), 'debug_log' => $log];
        }

        $url   = wp_get_attachment_url($attachment_id);
        $meta  = wp_get_attachment_metadata($attachment_id);
        $thumb = wp_get_attachment_image_src($attachment_id, 'thumbnail');

        $log[] = "Uploaded → ID:{$attachment_id} | URL:{$url}";
        $log[] = "Dimensions: " . ($meta['width'] ?? '?') . "x" . ($meta['height'] ?? '?') . "px | Thumb: " . ($thumb[0] ?? 'none');

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
                ? 'Logo applied to ' . count($updated) . ' location(s). See debug log.'
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

        // 1. WordPress core custom_logo theme_mod
        $old_mod = get_theme_mod('custom_logo', 'not set');
        set_theme_mod('custom_logo', $id);
        $updated[] = 'theme_mod:custom_logo';
        $log[] = "[1] theme_mod:custom_logo → {$id} (was: {$old_mod})";

        // 2. site_logo option (FSE / block themes)
        update_option('site_logo', $id);
        $updated[] = 'option:site_logo';
        $log[] = "[2] option:site_logo → {$id}";

        // 3. Theme options — try known names first (fast path), then broad scan
        $log[] = "";
        $log[] = "=== Theme Options Scanner ===";

        $theme_option_name = null;

        // --- Fast path: check known theme option names from source analysis ---
        $candidates = array_unique(array_filter(array_merge(
            self::$KNOWN_THEME_OPTIONS,
            [get_template() . '_data', get_stylesheet() . '_data']
        )));
        $log[] = "Fast path — checking: " . implode(', ', $candidates);

        foreach ($candidates as $name) {
            $val = get_option($name, '__NOTSET__');
            if ($val === '__NOTSET__') { $log[] = "  [{$name}] not found"; continue; }
            if (!is_array($val))       { $log[] = "  [{$name}] exists but not array"; continue; }
            if (!isset($val['logo']) || !is_array($val['logo'])) { $log[] = "  [{$name}] array/" . count($val) . " keys, no logo sub-array"; continue; }
            $log[] = "  [{$name}] ✅ FOUND logo sub-array! (" . count($val) . " total keys)";
            $theme_option_name = $name;
            break;
        }

        // --- Fallback: scan all large options ---
        if (!$theme_option_name) {
            $log[] = "Fast path failed. Running broad scan of large wp_options…";
            $rows = $wpdb->get_results(
                "SELECT option_name, LENGTH(option_value) as len
                 FROM {$wpdb->options}
                 WHERE LENGTH(option_value) > 1000
                   AND option_name NOT LIKE '\_%'
                   AND option_name NOT LIKE '%transient%'
                   AND option_name NOT LIKE '%cache%'
                 ORDER BY len DESC LIMIT 60"
            );
            $skip = ['revslider','wp_user_roles','widget_','sidebars_widgets','nav_menu','active_plugins','rewrite_rules'];
            foreach ($rows as $row) {
                $do_skip = false;
                foreach ($skip as $s) { if (stripos($row->option_name, $s) !== false) { $do_skip = true; break; } }
                if ($do_skip) continue;

                $val = get_option($row->option_name);
                if (!is_array($val) || !isset($val['logo']) || !is_array($val['logo'])) continue;

                // Validate: theme indicators
                $theme_keys = ['last_tab','color_scheme','opt-header-type','body_text','footer_text','h1','h2'];
                $hits = 0;
                foreach ($theme_keys as $tk) { if (array_key_exists($tk, $val)) $hits++; }
                if ($hits === 0) { $log[] = "  [{$row->option_name}] has logo but no theme indicators, skipping"; continue; }

                $log[] = "  [{$row->option_name}] ✅ FOUND via broad scan ({$hits} theme indicators)";
                $theme_option_name = $row->option_name;
                break;
            }
        }

        // --- Update all logo fields in the found option ---
        if ($theme_option_name) {
            $val = get_option($theme_option_name);
            $log[] = "";
            $log[] = "Updating logo fields in [{$theme_option_name}]…";

            // Build the new logo field value
            $new_logo_val = [
                'url'       => $url,
                'id'        => (string) $id,
                'width'     => (string) ($meta['width']  ?? ''),
                'height'    => (string) ($meta['height'] ?? ''),
                'thumbnail' => $thumb[0] ?? '',
            ];

            foreach (self::$LOGO_FIELD_IDS as $field) {
                if (!array_key_exists($field, $val)) {
                    $log[] = "  [{$field}] — not in option, skipping";
                    continue;
                }
                $old_url = is_array($val[$field]) ? ($val[$field]['url'] ?? '(empty)') : (string)$val[$field];

                if ($field === 'logo') {
                    // Always update main logo
                    $val[$field] = $new_logo_val;
                    $log[] = "  [{$field}] updated: {$old_url} → {$url}";
                } else {
                    // For variants, only update if they already have a value set
                    // (empty logo_sticky means "use main logo" — don't override that)
                    $existing_url = is_array($val[$field]) ? ($val[$field]['url'] ?? '') : '';
                    if (!empty($existing_url)) {
                        $val[$field] = $new_logo_val;
                        $log[] = "  [{$field}] updated (had existing value): {$existing_url} → {$url}";
                    } else {
                        $log[] = "  [{$field}] skipped (empty = inherits main logo)";
                    }
                }
            }

            // Force save: clear cache, delete, re-add
            wp_cache_delete($theme_option_name, 'options');
            delete_option($theme_option_name);
            add_option($theme_option_name, $val, '', 'yes');
            wp_cache_delete($theme_option_name, 'options');

            // Verify
            $check     = get_option($theme_option_name);
            $saved_url = is_array($check) && isset($check['logo']['url']) ? $check['logo']['url'] : 'NOT FOUND';
            if ($saved_url === $url) {
                $log[]     = "✅ Verified save — logo.url = {$saved_url}";
                $updated[] = "theme_option:{$theme_option_name}[logo]";
            } else {
                $log[] = "❌ Verification failed — expected {$url}, got {$saved_url}";
                // Retry with update_option
                update_option($theme_option_name, $val);
                wp_cache_delete($theme_option_name, 'options');
                $check2     = get_option($theme_option_name);
                $saved_url2 = is_array($check2) && isset($check2['logo']['url']) ? $check2['logo']['url'] : 'NOT FOUND';
                $log[] = "  Retry update_option → {$saved_url2}";
                if ($saved_url2 === $url) $updated[] = "theme_option:{$theme_option_name}[logo]";
            }
        } else {
            $log[] = "❌ Could not find theme options in database. Please share this debug log.";
        }

        // 4. Elementor
        $kit_id = get_option('elementor_active_kit');
        if ($kit_id) {
            $kit_meta = get_post_meta($kit_id, '_elementor_page_settings', true);
            if (is_array($kit_meta) && array_key_exists('custom_logo', $kit_meta)) {
                $kit_meta['custom_logo'] = ['id' => $id, 'url' => $url];
                update_post_meta($kit_id, '_elementor_page_settings', $kit_meta);
                $updated[] = 'elementor:kit';
                $log[] = "[E] Elementor kit logo updated";
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
        if (preg_match('/Bearer\s+(.+)/i', $auth, $m)) return hash_equals($stored, trim($m[1]));
        return false;
    }
}
