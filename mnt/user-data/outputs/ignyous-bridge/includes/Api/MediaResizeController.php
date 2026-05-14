<?php
namespace Ignyous\Api;

/**
 * MediaResizeController
 * Resizes images in the media library.
 * Always makes a copy — the original is never modified.
 */
class MediaResizeController {
    public function register_routes() {
        register_rest_route('ignyous/v1', '/media/resize', [
            'methods'             => 'POST',
            'callback'            => [$this, 'resize'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
    }

    public function resize($request) {
        $body          = $request->get_json_params();
        $attachment_id = (int) ($body['attachment_id'] ?? 0);
        $target_width  = (int) ($body['width']  ?? 0);
        $target_height = (int) ($body['height'] ?? 0);
        $scale_pct    = (float) ($body['scale_percent'] ?? 0); // e.g. 50 = half size

        if (!$attachment_id) return new \WP_Error('missing', 'attachment_id required', ['status' => 400]);
        if (!$target_width && !$target_height && !$scale_pct) {
            return new \WP_Error('missing', 'width, height, or scale_percent required', ['status' => 400]);
        }

        require_once ABSPATH . 'wp-admin/includes/image.php';
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';

        // Get original file
        $orig_path = get_attached_file($attachment_id);
        if (!$orig_path || !file_exists($orig_path)) {
            return new \WP_Error('not_found', "Attachment {$attachment_id} file not found: {$orig_path}", ['status' => 404]);
        }

        $orig_url  = wp_get_attachment_url($attachment_id);
        $orig_meta = wp_get_attachment_metadata($attachment_id);
        $orig_w    = (int) ($orig_meta['width']  ?? 0);
        $orig_h    = (int) ($orig_meta['height'] ?? 0);

        // Calculate target dimensions
        if ($scale_pct > 0) {
            $target_width  = (int) round($orig_w * $scale_pct / 100);
            $target_height = (int) round($orig_h * $scale_pct / 100);
        } elseif ($target_width && !$target_height) {
            // Proportional from width
            $target_height = $orig_h > 0 ? (int) round($target_width * $orig_h / $orig_w) : 0;
        } elseif ($target_height && !$target_width) {
            // Proportional from height
            $target_width = $orig_w > 0 ? (int) round($target_height * $orig_w / $orig_h) : 0;
        }

        // Copy original file with a new name
        $pathinfo  = pathinfo($orig_path);
        $copy_name = $pathinfo['filename'] . "-{$target_width}x{$target_height}." . $pathinfo['extension'];
        $copy_path = $pathinfo['dirname'] . '/' . $copy_name;
        if (!copy($orig_path, $copy_path)) {
            return new \WP_Error('copy_failed', "Could not copy {$orig_path} → {$copy_path}", ['status' => 500]);
        }

        // Resize the copy
        $editor = wp_get_image_editor($copy_path);
        if (is_wp_error($editor)) {
            @unlink($copy_path);
            return new \WP_Error('editor_failed', $editor->get_error_message(), ['status' => 500]);
        }
        $editor->resize($target_width, $target_height, false); // false = no crop
        $saved = $editor->save($copy_path);
        if (is_wp_error($saved)) {
            @unlink($copy_path);
            return new \WP_Error('save_failed', $saved->get_error_message(), ['status' => 500]);
        }

        // Register as a new media library attachment (copy of original)
        $orig_post       = get_post($attachment_id);
        $new_title       = ($orig_post->post_title ?? 'Image') . " ({$target_width}×{$target_height})";
        $new_attachment  = [
            'post_mime_type' => get_post_mime_type($attachment_id),
            'post_title'     => $new_title,
            'post_content'   => '',
            'post_status'    => 'inherit',
            'post_parent'    => $orig_post->post_parent ?? 0,
        ];
        $new_id = wp_insert_attachment($new_attachment, $copy_path);
        if (is_wp_error($new_id)) {
            @unlink($copy_path);
            return new \WP_Error('insert_failed', $new_id->get_error_message(), ['status' => 500]);
        }
        $new_meta = wp_generate_attachment_metadata($new_id, $copy_path);
        wp_update_attachment_metadata($new_id, $new_meta);

        $new_url = wp_get_attachment_url($new_id);

        return [
            'success'          => true,
            'original_id'      => $attachment_id,
            'original_url'     => $orig_url,
            'original_size'    => "{$orig_w}×{$orig_h}",
            'new_id'           => $new_id,
            'new_url'          => $new_url,
            'new_size'         => "{$target_width}×{$target_height}",
            'message'          => "Resized copy created: {$target_width}×{$target_height}px. Original preserved as ID {$attachment_id}.",
        ];
    }

    public function check_permission() {
        $stored = get_option('ignyous_bridge_api_key', '');
        if (empty($stored)) return false;
        $xkey = $_SERVER['HTTP_X_IGNYOUS_KEY'] ?? '';
        if (!empty($xkey) && hash_equals($stored, trim($xkey))) return true;
        $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (preg_match('/Bearer\s+(.+)/i', $auth, $m)) return hash_equals($stored, trim($m[1]));
        return false;
    }
}
