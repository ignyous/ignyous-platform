<?php
namespace Ignyous\Baseline\Api;

use Ignyous\Baseline\Auth;
use Ignyous\Baseline\Snapshots;
use Ignyous\Baseline\ActionLog;

/**
 * Phase 1 — Media.
 *
 * Endpoints:
 *   POST   /media/upload                   { filename, mime, data_base64, alt? }
 *   GET    /media?limit=20                 list recent attachments
 *   DELETE /media/{id}                     trash an attachment (with snapshot for undo)
 *   PATCH  /pages/{id}/featured-image      { attachment_id|null }
 *   PATCH  /options/site_logo              { attachment_id|null }
 *   PATCH  /pages/{id}/replace-first-image { url, alt? }   (swaps first wp:image block)
 *
 * Every write opens a snapshot BEFORE the change and closes it AFTER.
 * Restores are wired through SnapshotController.
 */
class MediaController {

    /** Hard cap to protect the WP server. 8 MB base64-decoded. */
    const MAX_BYTES = 8 * 1024 * 1024;

    /** Allowed image mimes (Phase 1: images only). */
    const ALLOWED_MIMES = [
        'image/jpeg' => 'jpg',
        'image/png'  => 'png',
        'image/gif'  => 'gif',
        'image/webp' => 'webp',
        'image/svg+xml' => 'svg',
    ];

    public function register(): void {
        register_rest_route('ignyous/v1', '/media/upload', [
            'methods'             => 'POST',
            'permission_callback' => [Auth::class, 'check'],
            'callback'            => [$this, 'upload'],
        ]);

        register_rest_route('ignyous/v1', '/media', [
            'methods'             => 'GET',
            'permission_callback' => [Auth::class, 'check'],
            'callback'            => [$this, 'list'],
            'args'                => [
                'limit' => ['type' => 'integer', 'default' => 20],
            ],
        ]);

        register_rest_route('ignyous/v1', '/media/(?P<id>\d+)', [
            'methods'             => 'DELETE',
            'permission_callback' => [Auth::class, 'check'],
            'callback'            => [$this, 'delete'],
        ]);

        register_rest_route('ignyous/v1', '/pages/(?P<id>\d+)/featured-image', [
            'methods'             => 'PATCH',
            'permission_callback' => [Auth::class, 'check'],
            'callback'            => [$this, 'patchFeaturedImage'],
        ]);

        register_rest_route('ignyous/v1', '/options/site_logo', [
            'methods'             => 'PATCH',
            'permission_callback' => [Auth::class, 'check'],
            'callback'            => [$this, 'patchSiteLogo'],
        ]);

        register_rest_route('ignyous/v1', '/pages/(?P<id>\d+)/replace-first-image', [
            'methods'             => 'PATCH',
            'permission_callback' => [Auth::class, 'check'],
            'callback'            => [$this, 'replaceFirstImage'],
        ]);
    }

    // ------------------------------------------------------------------ upload

    public function upload(\WP_REST_Request $req) {
        $changeId = Auth::changeId($req);
        $started  = microtime(true);

        $body = $req->get_json_params() ?: [];
        $filename = isset($body['filename']) ? sanitize_file_name($body['filename']) : '';
        $mime     = isset($body['mime'])     ? strtolower((string) $body['mime']) : '';
        $alt      = isset($body['alt'])      ? sanitize_text_field((string) $body['alt']) : '';
        $b64      = isset($body['data_base64']) ? (string) $body['data_base64'] : '';

        if (!$filename || !$mime || !$b64) {
            return $this->fail($changeId, 'media.upload', $started, 'missing_fields', ['have' => array_keys($body)]);
        }
        if (!isset(self::ALLOWED_MIMES[$mime])) {
            return $this->fail($changeId, 'media.upload', $started, 'mime_not_allowed', ['mime' => $mime]);
        }

        // strip data URL prefix if the platform sent one
        if (strpos($b64, ',') !== false && stripos($b64, 'base64,') !== false) {
            $b64 = substr($b64, strpos($b64, ',') + 1);
        }
        $bytes = base64_decode($b64, true);
        if ($bytes === false) {
            return $this->fail($changeId, 'media.upload', $started, 'invalid_base64');
        }
        if (strlen($bytes) > self::MAX_BYTES) {
            return $this->fail($changeId, 'media.upload', $started, 'too_large', ['bytes' => strlen($bytes), 'max' => self::MAX_BYTES]);
        }

        // Ensure the filename extension matches the declared mime
        $ext = self::ALLOWED_MIMES[$mime];
        if (!preg_match('/\.' . preg_quote($ext, '/') . '$/i', $filename)) {
            $filename = preg_replace('/\.[^.]+$/', '', $filename) . '.' . $ext;
            if (!$filename || $filename === '.' . $ext) $filename = 'upload-' . time() . '.' . $ext;
        }

        // Need WP media handling functions
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';
        require_once ABSPATH . 'wp-admin/includes/image.php';

        $upload = wp_upload_bits($filename, null, $bytes);
        if (!empty($upload['error'])) {
            return $this->fail($changeId, 'media.upload', $started, 'wp_upload_bits_failed', ['detail' => $upload['error']]);
        }

        $attachment = [
            'post_mime_type' => $mime,
            'post_title'     => preg_replace('/\.[^.]+$/', '', basename($upload['file'])),
            'post_content'   => '',
            'post_status'    => 'inherit',
        ];
        $attachId = wp_insert_attachment($attachment, $upload['file']);
        if (is_wp_error($attachId) || !$attachId) {
            return $this->fail($changeId, 'media.upload', $started, 'wp_insert_attachment_failed');
        }

        $meta = wp_generate_attachment_metadata($attachId, $upload['file']);
        wp_update_attachment_metadata($attachId, $meta);
        if ($alt) update_post_meta($attachId, '_wp_attachment_image_alt', $alt);

        // Snapshot row so the upload itself can be undone (delete attachment).
        // before_value is empty; after_value = attachment id.
        $snapId = Snapshots::open($changeId, 'attachment_created', (string) $attachId, '', 'Uploaded ' . basename($upload['file']));
        Snapshots::close($snapId, (string) $attachId);

        $url = wp_get_attachment_url($attachId);
        $duration = (int) round((microtime(true) - $started) * 1000);

        ActionLog::record([
            'change_id'     => $changeId,
            'intent_raw'    => Auth::intentRaw($req),
            'intent_parsed' => ['filename' => $filename, 'mime' => $mime, 'bytes' => strlen($bytes)],
            'capability'    => 'media.upload',
            'request'       => ['filename' => $filename, 'mime' => $mime, 'bytes' => strlen($bytes), 'alt' => $alt],
            'response'      => ['attachment_id' => $attachId, 'url' => $url, 'snapshot_id' => $snapId],
            'success'       => 1,
            'duration_ms'   => $duration,
            'ai_tokens'     => Auth::aiTokens($req),
        ]);

        return new \WP_REST_Response([
            'success'       => true,
            'change_id'     => $changeId,
            'attachment_id' => $attachId,
            'url'           => $url,
            'mime'          => $mime,
            'bytes'         => strlen($bytes),
            'snapshot_id'   => $snapId,
        ], 201);
    }

    // -------------------------------------------------------------------- list

    public function list(\WP_REST_Request $req): \WP_REST_Response {
        $limit = max(1, min(100, (int) ($req->get_param('limit') ?: 20)));
        $posts = get_posts([
            'post_type'      => 'attachment',
            'post_status'    => 'inherit',
            'posts_per_page' => $limit,
            'orderby'        => 'date',
            'order'          => 'DESC',
            'post_mime_type' => array_keys(self::ALLOWED_MIMES),
        ]);
        $out = [];
        foreach ($posts as $p) {
            $out[] = [
                'id'    => $p->ID,
                'title' => $p->post_title,
                'mime'  => $p->post_mime_type,
                'url'   => wp_get_attachment_url($p->ID),
                'alt'   => get_post_meta($p->ID, '_wp_attachment_image_alt', true),
                'date'  => $p->post_date_gmt,
            ];
        }
        return new \WP_REST_Response(['media' => $out]);
    }

    // ------------------------------------------------------------------ delete

    public function delete(\WP_REST_Request $req) {
        $id = (int) $req['id'];
        $changeId = Auth::changeId($req);
        $started  = microtime(true);

        $post = get_post($id);
        if (!$post || $post->post_type !== 'attachment') {
            return $this->fail($changeId, 'media.delete', $started, 'not_found', ['id' => $id]);
        }

        // We can't truly undo a hard delete (the bytes are gone). Snapshot a marker so
        // the action log shows what we removed; restore for this type is a no-op with a warning.
        $marker = [
            'id'    => $id,
            'title' => $post->post_title,
            'mime'  => $post->post_mime_type,
            'url'   => wp_get_attachment_url($id),
        ];
        $snapId = Snapshots::open($changeId, 'attachment_deleted', (string) $id, wp_json_encode($marker), 'Deleted ' . $post->post_title);

        $result = wp_delete_attachment($id, true);
        if (!$result) {
            return $this->fail($changeId, 'media.delete', $started, 'wp_delete_attachment_failed', ['id' => $id]);
        }
        Snapshots::close($snapId, wp_json_encode(['deleted' => true]));

        $duration = (int) round((microtime(true) - $started) * 1000);
        ActionLog::record([
            'change_id'   => $changeId,
            'intent_raw'  => Auth::intentRaw($req),
            'capability'  => 'media.delete',
            'request'     => ['id' => $id],
            'response'    => ['deleted' => true, 'snapshot_id' => $snapId],
            'success'     => 1,
            'duration_ms' => $duration,
            'ai_tokens'   => Auth::aiTokens($req),
        ]);

        return new \WP_REST_Response(['success' => true, 'change_id' => $changeId, 'deleted' => $id, 'snapshot_id' => $snapId]);
    }

    // ---------------------------------------------------------- featured image

    public function patchFeaturedImage(\WP_REST_Request $req) {
        $postId   = (int) $req['id'];
        $changeId = Auth::changeId($req);
        $started  = microtime(true);
        $body     = $req->get_json_params() ?: [];
        $attachId = array_key_exists('attachment_id', $body) ? $body['attachment_id'] : null;

        if (!get_post($postId)) {
            return $this->fail($changeId, 'pages.featured_image', $started, 'page_not_found', ['id' => $postId]);
        }
        if ($attachId !== null && $attachId !== '' && $attachId !== 0) {
            $attachId = (int) $attachId;
            $att = get_post($attachId);
            if (!$att || $att->post_type !== 'attachment') {
                return $this->fail($changeId, 'pages.featured_image', $started, 'attachment_not_found', ['id' => $attachId]);
            }
        } else {
            $attachId = 0; // clearing
        }

        $before = get_post_meta($postId, '_thumbnail_id', true);
        $snapId = Snapshots::open($changeId, 'post_meta', $postId . '|_thumbnail_id', (string) $before, 'Featured image (post ' . $postId . ')');

        if ($attachId) {
            $ok = set_post_thumbnail($postId, $attachId);
        } else {
            $ok = delete_post_thumbnail($postId);
        }
        $after = get_post_meta($postId, '_thumbnail_id', true);
        Snapshots::close($snapId, (string) $after);

        if (!$ok && (string) $before === (string) $after) {
            // unchanged — still successful, just nothing to do
        }

        $duration = (int) round((microtime(true) - $started) * 1000);
        ActionLog::record([
            'change_id'   => $changeId,
            'intent_raw'  => Auth::intentRaw($req),
            'capability'  => 'pages.featured_image',
            'request'     => ['post_id' => $postId, 'attachment_id' => $attachId],
            'response'    => ['before' => $before, 'after' => $after, 'snapshot_id' => $snapId],
            'success'     => 1,
            'duration_ms' => $duration,
            'ai_tokens'   => Auth::aiTokens($req),
        ]);

        return new \WP_REST_Response([
            'success'     => true,
            'change_id'   => $changeId,
            'before'      => $before,
            'after'       => $after,
            'url'         => $attachId ? wp_get_attachment_url($attachId) : null,
            'snapshot_id' => $snapId,
        ]);
    }

    // --------------------------------------------------------------- site logo

    public function patchSiteLogo(\WP_REST_Request $req) {
        $changeId = Auth::changeId($req);
        $started  = microtime(true);
        $body     = $req->get_json_params() ?: [];
        $attachId = array_key_exists('attachment_id', $body) ? $body['attachment_id'] : null;

        if ($attachId !== null && $attachId !== '' && $attachId !== 0) {
            $attachId = (int) $attachId;
            $att = get_post($attachId);
            if (!$att || $att->post_type !== 'attachment') {
                return $this->fail($changeId, 'options.site_logo', $started, 'attachment_not_found', ['id' => $attachId]);
            }
        } else {
            $attachId = 0;
        }

        $before = get_option('site_logo');
        $snapId = Snapshots::open($changeId, 'option', 'site_logo', $before, 'Site logo');
        if ($attachId) {
            update_option('site_logo', $attachId);
        } else {
            delete_option('site_logo');
        }
        $after = get_option('site_logo');
        Snapshots::close($snapId, $after);

        $duration = (int) round((microtime(true) - $started) * 1000);
        ActionLog::record([
            'change_id'   => $changeId,
            'intent_raw'  => Auth::intentRaw($req),
            'capability'  => 'options.site_logo',
            'request'     => ['attachment_id' => $attachId],
            'response'    => ['before' => $before, 'after' => $after, 'snapshot_id' => $snapId],
            'success'     => 1,
            'duration_ms' => $duration,
            'ai_tokens'   => Auth::aiTokens($req),
        ]);

        return new \WP_REST_Response([
            'success'     => true,
            'change_id'   => $changeId,
            'before'      => $before,
            'after'       => $after,
            'url'         => $attachId ? wp_get_attachment_url($attachId) : null,
            'snapshot_id' => $snapId,
        ]);
    }

    // ----------------------------------------------- replace first image block

    public function replaceFirstImage(\WP_REST_Request $req) {
        $postId   = (int) $req['id'];
        $changeId = Auth::changeId($req);
        $started  = microtime(true);
        $body     = $req->get_json_params() ?: [];
        $url      = isset($body['url']) ? esc_url_raw((string) $body['url']) : '';
        $alt      = isset($body['alt']) ? sanitize_text_field((string) $body['alt']) : null;
        $attachId = isset($body['attachment_id']) ? (int) $body['attachment_id'] : 0;

        if (!$url) {
            return $this->fail($changeId, 'pages.replace_first_image', $started, 'missing_url');
        }
        $post = get_post($postId);
        if (!$post) {
            return $this->fail($changeId, 'pages.replace_first_image', $started, 'page_not_found', ['id' => $postId]);
        }

        $content = (string) $post->post_content;
        $patched = $this->swapFirstImage($content, $url, $alt, $attachId);

        if ($patched === null) {
            return $this->fail($changeId, 'pages.replace_first_image', $started, 'no_image_block_found', ['post_id' => $postId]);
        }

        $snapId = Snapshots::open($changeId, 'page_content', (string) $postId, $content, 'Replace first image (post ' . $postId . ')');
        $result = wp_update_post(['ID' => $postId, 'post_content' => wp_slash($patched)], true);
        if (is_wp_error($result)) {
            Snapshots::close($snapId, $content); // mark close with no-op so it's a clean failure
            return $this->fail($changeId, 'pages.replace_first_image', $started, 'wp_update_post_failed', ['detail' => $result->get_error_message()]);
        }
        $after = get_post_field('post_content', $postId, 'raw');
        Snapshots::close($snapId, $after);

        $duration = (int) round((microtime(true) - $started) * 1000);
        ActionLog::record([
            'change_id'   => $changeId,
            'intent_raw'  => Auth::intentRaw($req),
            'capability'  => 'pages.replace_first_image',
            'request'     => ['post_id' => $postId, 'url' => $url, 'attachment_id' => $attachId, 'alt' => $alt],
            'response'    => ['snapshot_id' => $snapId, 'bytes_before' => strlen($content), 'bytes_after' => strlen($after)],
            'success'     => 1,
            'duration_ms' => $duration,
            'ai_tokens'   => Auth::aiTokens($req),
        ]);

        return new \WP_REST_Response([
            'success'     => true,
            'change_id'   => $changeId,
            'url'         => $url,
            'snapshot_id' => $snapId,
        ]);
    }

    /**
     * Swap the first <!-- wp:image --> block's src (and optionally alt + id).
     * Returns the modified content, or null if no image block was found.
     */
    private function swapFirstImage(string $content, string $newUrl, ?string $newAlt, int $newAttachId): ?string {
        // Find the first wp:image block (with or without attrs JSON)
        if (!preg_match('/<!--\s*wp:image(\s+(\{.*?\}))?\s*-->([\s\S]*?)<!--\s*\/wp:image\s*-->/', $content, $m, PREG_OFFSET_CAPTURE)) {
            return null;
        }
        $fullMatch  = $m[0][0];
        $matchStart = $m[0][1];
        $attrsJson  = $m[2][0] ?? '';
        $inner      = $m[3][0];

        // Update block attrs JSON (id, sizeSlug stay; only id swaps if we have one)
        $attrs = [];
        if ($attrsJson) {
            $decoded = json_decode($attrsJson, true);
            if (is_array($decoded)) $attrs = $decoded;
        }
        if ($newAttachId > 0) $attrs['id'] = $newAttachId;
        $newAttrs = $attrs ? ' ' . wp_json_encode($attrs, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) : '';

        // Swap the src attribute in the inner <img>
        $newInner = preg_replace(
            '/(<img\b[^>]*\bsrc=")[^"]*(")/',
            '${1}' . esc_url($newUrl) . '${2}',
            $inner,
            1,
            $count
        );
        if (!$count) {
            // No img tag inside; rebuild a minimal one
            $altAttr = $newAlt !== null ? ' alt="' . esc_attr($newAlt) . '"' : '';
            $newInner = "\n<figure class=\"wp-block-image\"><img src=\"" . esc_url($newUrl) . "\"" . $altAttr . "/></figure>\n";
        } elseif ($newAlt !== null) {
            // Update alt if present, else append
            $hadAlt = preg_match('/<img\b[^>]*\balt="/', $newInner);
            if ($hadAlt) {
                $newInner = preg_replace(
                    '/(<img\b[^>]*\balt=")[^"]*(")/',
                    '${1}' . esc_attr($newAlt) . '${2}',
                    $newInner,
                    1
                );
            } else {
                $newInner = preg_replace('/<img\b/', '<img alt="' . esc_attr($newAlt) . '"', $newInner, 1);
            }
        }

        $rebuilt = '<!-- wp:image' . $newAttrs . ' -->' . $newInner . '<!-- /wp:image -->';
        return substr($content, 0, $matchStart) . $rebuilt . substr($content, $matchStart + strlen($fullMatch));
    }

    // ----------------------------------------------------------------- helpers

    private function fail(string $changeId, string $capability, float $started, string $error, array $detail = []): \WP_REST_Response {
        $duration = (int) round((microtime(true) - $started) * 1000);
        ActionLog::record([
            'change_id'   => $changeId,
            'capability'  => $capability,
            'request'     => $detail,
            'response'    => ['error' => $error, 'detail' => $detail],
            'success'     => 0,
            'error'       => $error,
            'duration_ms' => $duration,
        ]);
        return new \WP_REST_Response([
            'success'   => false,
            'change_id' => $changeId,
            'error'     => $error,
            'detail'    => $detail,
        ], 400);
    }
}
