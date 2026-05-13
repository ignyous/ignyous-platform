<?php
namespace Ignyous\Api;

class MediaController {
    public function register_routes() {
        register_rest_route('ignyous/v1', '/media/upload', [
            'methods'             => 'POST',
            'callback'            => [$this, 'upload_image'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route('ignyous/v1', '/media/logo-info', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_logo_info'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
    }

    public function upload_image($request) {
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

        // Write to temp file
        $upload_dir = wp_upload_dir();
        $tmp_path   = $upload_dir['path'] . '/' . $file_name;
        $written    = file_put_contents($tmp_path, $decoded);

        if ($written === false) {
            return new \WP_Error('write_failed', 'Could not write image file to uploads directory', ['status' => 500]);
        }

        require_once ABSPATH . 'wp-admin/includes/image.php';
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';

        $file_array = [
            'name'     => $file_name,
            'type'     => $media_type,
            'tmp_name' => $tmp_path,
            'error'    => 0,
            'size'     => strlen($decoded),
        ];

        $attachment_id = media_handle_sideload($file_array, 0, sanitize_text_field($file_name));

        if (is_wp_error($attachment_id)) {
            @unlink($tmp_path);
            return new \WP_Error('upload_failed', $attachment_id->get_error_message(), ['status' => 500]);
        }

        @unlink($tmp_path);

        $url     = wp_get_attachment_url($attachment_id);
        $updated = [];

        if ($set_logo) {
            $updated = $this->set_logo_everywhere($attachment_id, $url);
        }

        return [
            'success' => true,
            'id'      => $attachment_id,
            'url'     => $url,
            'message' => $set_logo
                ? 'Logo uploaded and applied to ' . count($updated) . ' location(s)!'
                : 'Image uploaded to Media Library.',
            'locations_updated' => $updated,
        ];
    }

    /**
     * Set the logo in every known WordPress location.
     */
    private function set_logo_everywhere($attachment_id, $url) {
        $updated = [];

        // 1. WordPress core custom_logo (Customizer)
        set_theme_mod('custom_logo', $attachment_id);
        $updated[] = 'theme_mod:custom_logo';

        // 2. site_logo option (used by some themes + FSE)
        update_option('site_logo', $attachment_id);
        $updated[] = 'option:site_logo';

        // 3. Scan active theme options for common logo keys
        $theme_mods = get_theme_mods();
        $logo_keys  = ['logo', 'logo_image', 'logo_url', 'header_logo', 'site_logo_url', 'logo_img'];
        foreach ($logo_keys as $key) {
            if (isset($theme_mods[$key])) {
                set_theme_mod($key, $url);
                $updated[] = 'theme_mod:' . $key;
            }
        }

        // 4. Scan wp_options table for common logo option names
        global $wpdb;
        $option_keys = ['logo', 'logo_url', 'site_logo_url', 'header_logo', 'logo_image_url', 'custom_logo_url'];
        foreach ($option_keys as $key) {
            $val = get_option($key);
            if ($val !== false) {
                update_option($key, $url);
                $updated[] = 'option:' . $key;
            }
        }

        // 5. Elementor global settings (if Elementor active)
        if (is_plugin_active('elementor/elementor.php') || defined('ELEMENTOR_VERSION')) {
            $el_settings = get_option('elementor_globals', []);
            if (!empty($el_settings)) {
                // Elementor stores site logo as a URL in kit settings
                $this->update_elementor_logo($attachment_id, $url);
                $updated[] = 'elementor:kit';
            }
        }

        return $updated;
    }

    private function update_elementor_logo($attachment_id, $url) {
        global $wpdb;
        // Find the Elementor active kit
        $kit_id = get_option('elementor_active_kit');
        if (!$kit_id) return;

        $meta = get_post_meta($kit_id, '_elementor_page_settings', true);
        if (is_array($meta)) {
            if (isset($meta['custom_logo'])) {
                $meta['custom_logo'] = ['id' => $attachment_id, 'url' => $url];
                update_post_meta($kit_id, '_elementor_page_settings', $meta);
            }
        }
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
        $api_key = get_option('ignyous_bridge_api_key', '');
        if (empty($api_key)) return false;
        $headers     = getallheaders();
        $auth_header = $headers['Authorization'] ?? '';
        if (preg_match('/Bearer\s+(.+)/i', $auth_header, $m)) {
            return hash_equals($api_key, trim($m[1]));
        }
        return false;
    }
}
