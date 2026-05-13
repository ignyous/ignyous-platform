<?php
namespace Ignyous\Api;

class MediaController {
    public function register_routes() {
        register_rest_route('ignyous/v1', '/media/upload', [
            'methods'             => 'POST',
            'callback'            => [$this, 'upload_image'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
    }

    public function upload_image($request) {
        $body       = $request->get_json_params();
        $base64     = $body['image_base64'] ?? '';
        $media_type = $body['media_type']   ?? 'image/png';
        $file_name  = $body['file_name']    ?? 'upload-' . time() . '.png';
        $set_logo   = !empty($body['set_as_logo']);

        if (empty($base64)) {
            return new \WP_Error('no_image', 'image_base64 is required', ['status' => 400]);
        }

        $decoded = base64_decode($base64);
        if ($decoded === false) {
            return new \WP_Error('bad_base64', 'Invalid base64 data', ['status' => 400]);
        }

        // Write to temp file
        $tmp = wp_tempnam($file_name);
        file_put_contents($tmp, $decoded);

        $file_array = [
            'name'     => $file_name,
            'type'     => $media_type,
            'tmp_name' => $tmp,
            'error'    => 0,
            'size'     => strlen($decoded),
        ];

        require_once ABSPATH . 'wp-admin/includes/image.php';
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';

        $attachment_id = media_handle_sideload($file_array, 0, sanitize_text_field($file_name));
        @unlink($tmp);

        if (is_wp_error($attachment_id)) {
            return new \WP_Error('upload_failed', $attachment_id->get_error_message(), ['status' => 500]);
        }

        $url = wp_get_attachment_url($attachment_id);

        if ($set_logo) {
            set_theme_mod('custom_logo', $attachment_id);
            update_option('site_logo', $attachment_id);
        }

        return [
            'success' => true,
            'id'      => $attachment_id,
            'url'     => $url,
            'message' => $set_logo ? 'Logo uploaded and applied!' : 'Image uploaded successfully.',
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
