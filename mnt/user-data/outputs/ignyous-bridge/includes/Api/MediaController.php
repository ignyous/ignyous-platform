<?php
namespace Ignyous\Api;

class MediaController {
    public function register_routes() {
        register_rest_route('ignyous/v1', '/media/upload', [
            'methods'             => 'POST',
            'callback'            => [$this, 'upload_image'],
            'permission_callback' => '__return_true',  // auth done inside callback
        ]);
        register_rest_route('ignyous/v1', '/media/logo-info', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_logo_info'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
    }

    /** Verify the request is from ignyous — check header AND body */
    private function verify_request($request) {
        $stored_key = get_option('ignyous_bridge_api_key', '');
        if (empty($stored_key)) return false;

        // Helper to get all request headers reliably
        $all_headers = [];
        if (function_exists('getallheaders')) {
            foreach (getallheaders() as $k => $v) {
                $all_headers[strtolower($k)] = $v;
            }
        }
        // Also check $_SERVER for nginx/fastcgi environments
        foreach ($_SERVER as $k => $v) {
            if (strpos($k, 'HTTP_') === 0) {
                $name = strtolower(str_replace('_', '-', substr($k, 5)));
                if (!isset($all_headers[$name])) $all_headers[$name] = $v;
            }
        }

        // 1. X-Ignyous-Key header (preferred — avoids WP Application Password conflicts)
        if (!empty($all_headers['x-ignyous-key'])) {
            if (hash_equals($stored_key, trim($all_headers['x-ignyous-key']))) return true;
        }

        // 2. Authorization: Bearer header
        $auth = $all_headers['authorization'] ?? '';
        if (preg_match('/Bearer\s+(.+)/i', $auth, $m)) {
            if (hash_equals($stored_key, trim($m[1]))) return true;
        }

        // 3. api_key in request body (fallback when headers are stripped)
        $body = $request->get_json_params();
        if (!empty($body['api_key']) && hash_equals($stored_key, $body['api_key'])) {
            return true;
        }

        // 4. api_key as query param (last resort)
        $qp = $request->get_query_params();
        if (!empty($qp['api_key']) && hash_equals($stored_key, $qp['api_key'])) {
            return true;
        }

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

        if (empty($base64)) {
            return new \WP_Error('no_image', 'image_base64 is required', ['status' => 400]);
        }

        $decoded = base64_decode($base64);
        if ($decoded === false || strlen($decoded) < 100) {
            return new \WP_Error('bad_base64', 'Invalid or empty base64 image data', ['status' => 400]);
        }

        require_once ABSPATH . 'wp-admin/includes/image.php';
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';

        // Write to temp file in WP uploads dir
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
        $updated  = [];

        if ($set_logo) {
            $updated = $this->set_logo_everywhere($attachment_id, $url);
        }

        return [
            'success'            => true,
            'id'                 => $attachment_id,
            'url'                => $url,
            'message'            => $set_logo
                ? 'Logo uploaded and applied to ' . count($updated) . ' location(s)!'
                : 'Image uploaded to Media Library.',
            'locations_updated'  => $updated,
        ];
    }

    private function set_logo_everywhere($attachment_id, $url) {
        $updated = [];

        // 1. WordPress core custom_logo (Customizer / most themes)
        set_theme_mod('custom_logo', $attachment_id);
        $updated[] = 'theme_mod:custom_logo';

        // 2. site_logo option (FSE / block themes)
        update_option('site_logo', $attachment_id);
        $updated[] = 'option:site_logo';

        // 3. Scan existing theme_mods for common logo keys
        $theme_mods = get_theme_mods();
        $logo_keys  = ['logo', 'logo_image', 'logo_url', 'header_logo', 'site_logo_url', 'logo_img'];
        foreach ($logo_keys as $key) {
            if (array_key_exists($key, $theme_mods)) {
                set_theme_mod($key, $url);
                $updated[] = 'theme_mod:' . $key;
            }
        }

        // 4. Scan wp_options for common logo option names
        $option_keys = ['logo', 'logo_url', 'site_logo_url', 'header_logo', 'logo_image_url', 'custom_logo_url'];
        foreach ($option_keys as $key) {
            if (get_option($key) !== false) {
                update_option($key, $url);
                $updated[] = 'option:' . $key;
            }
        }

        // 5. Elementor kit settings (if active)
        if (defined('ELEMENTOR_VERSION') || is_plugin_active('elementor/elementor.php')) {
            $kit_id = get_option('elementor_active_kit');
            if ($kit_id) {
                $meta = get_post_meta($kit_id, '_elementor_page_settings', true);
                if (is_array($meta) && array_key_exists('custom_logo', $meta)) {
                    $meta['custom_logo'] = ['id' => $attachment_id, 'url' => $url];
                    update_post_meta($kit_id, '_elementor_page_settings', $meta);
                    $updated[] = 'elementor:kit';
                }
            }
        }

        return $updated;
    }

    public function get_logo_info($request) {
        $logo_id  = get_theme_mod('custom_logo');
        $logo_url = $logo_id ? wp_get_attachment_url($logo_id) : get_option('site_logo_url', '');
        return [
            'success'       => true,
            'logo_id'       => $logo_id,
            'logo_url'      => $logo_url,
            'current_theme' => wp_get_theme()->get('Name'),
        ];
    }

    public function check_permission() {
        $stored_key = get_option('ignyous_bridge_api_key', '');
        if (empty($stored_key)) return false;

        $auth_header = '';
        if (function_exists('getallheaders')) {
            $headers = getallheaders();
            foreach ($headers as $name => $value) {
                if (strtolower($name) === 'authorization') { $auth_header = $value; break; }
            }
        }
        if (empty($auth_header)) {
            $auth_header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        }
        if (preg_match('/Bearer\s+(.+)/i', $auth_header, $m)) {
            return hash_equals($stored_key, trim($m[1]));
        }
        return false;
    }
}
