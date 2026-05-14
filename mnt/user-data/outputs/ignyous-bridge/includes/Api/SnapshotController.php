<?php
namespace Ignyous\Api;

/**
 * SnapshotController — lightweight DB snapshots before every change.
 *
 * Stores up to 50 snapshots in wp_options as 'ignyous_snapshots'.
 * Each snapshot captures enough data to restore the previous state.
 *
 * Endpoints:
 *   GET  /ignyous/v1/snapshots              — list snapshots
 *   POST /ignyous/v1/snapshots              — create a snapshot before a change
 *   POST /ignyous/v1/snapshots/{id}/restore — restore a specific snapshot
 *   DELETE /ignyous/v1/snapshots/{id}       — delete a snapshot
 */
class SnapshotController {
    const OPTION_KEY = 'ignyous_snapshots';
    const MAX_SNAPS  = 50;

    public function register_routes() {
        register_rest_route('ignyous/v1', '/snapshots', [
            ['methods' => 'GET',  'callback' => [$this, 'list_snapshots'],  'permission_callback' => [$this, 'check_permission']],
            ['methods' => 'POST', 'callback' => [$this, 'create_snapshot'], 'permission_callback' => [$this, 'check_permission']],
        ]);
        register_rest_route('ignyous/v1', '/snapshots/(?P<id>[a-zA-Z0-9_]+)/restore', [
            'methods'             => 'POST',
            'callback'            => [$this, 'restore_snapshot'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route('ignyous/v1', '/snapshots/(?P<id>[a-zA-Z0-9_]+)', [
            'methods'             => 'DELETE',
            'callback'            => [$this, 'delete_snapshot'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
    }

    // ── List ──────────────────────────────────────────────────────────────
    public function list_snapshots($request) {
        $snaps = $this->get_snapshots();
        // Return newest first
        usort($snaps, function($a, $b) { return $b['timestamp'] - $a['timestamp']; });
        return ['success' => true, 'count' => count($snaps), 'snapshots' => $snaps];
    }

    // ── Create ─────────────────────────────────────────────────────────────
    /**
     * Body: {
     *   type:        'option' | 'serialized_field' | 'post_content' | 'post_meta' | 'elementor_kit' | 'general',
     *   description: 'Human-readable label, e.g. "Logo max-width update"',
     *   -- for option / serialized_field:
     *   option_name: string,  array_key?: string,
     *   -- for post_content / post_meta:
     *   post_id: int,  meta_key?: string,
     *   -- for elementor_kit:
     *   kit_id?: int, css_key?: string,
     * }
     */
    public function create_snapshot($request) {
        $body = $request->get_json_params();
        $type = $body['type'] ?? 'general';
        $desc = sanitize_text_field($body['description'] ?? 'Site change');

        $id        = 'snap_' . time() . '_' . substr(md5(uniqid()), 0, 6);
        $snapshot  = [
            'id'          => $id,
            'timestamp'   => time(),
            'type'        => $type,
            'description' => $desc,
            'data'        => [],
        ];

        // Capture the BEFORE state based on type
        switch ($type) {
            case 'option':
                $name = $body['option_name'] ?? '';
                $snapshot['data'] = [
                    'option_name' => $name,
                    'old_value'   => get_option($name),
                ];
                break;

            case 'serialized_field':
                $name     = $body['option_name'] ?? '';
                $arr_key  = $body['array_key']   ?? '';
                $data     = get_option($name);
                $cur_val  = null;
                if (is_array($data) && $arr_key) {
                    $parts  = explode('.', $arr_key);
                    $cur    = $data;
                    foreach ($parts as $k) { if (!is_array($cur) || !isset($cur[$k])) break; $cur = $cur[$k]; }
                    $cur_val = $cur;
                }
                $snapshot['data'] = [
                    'option_name' => $name,
                    'array_key'   => $arr_key,
                    'old_value'   => $cur_val,
                    'full_option' => $data, // keep full copy for safe restore
                ];
                break;

            case 'post_content':
                $post_id = (int) ($body['post_id'] ?? 0);
                $post    = get_post($post_id);
                $snapshot['data'] = [
                    'post_id'      => $post_id,
                    'post_title'   => $post->post_title ?? '',
                    'post_content' => $post->post_content ?? '',
                    'post_status'  => $post->post_status ?? '',
                ];
                break;

            case 'post_meta':
                $post_id  = (int) ($body['post_id']  ?? 0);
                $meta_key = $body['meta_key'] ?? '';
                $snapshot['data'] = [
                    'post_id'   => $post_id,
                    'meta_key'  => $meta_key,
                    'old_value' => get_post_meta($post_id, $meta_key, true),
                ];
                break;

            case 'elementor_kit':
                $kit_id   = (int) ($body['kit_id'] ?? get_option('elementor_active_kit'));
                $css_key  = $body['css_key'] ?? 'custom_css';
                $settings = get_post_meta($kit_id, '_elementor_page_settings', true);
                $snapshot['data'] = [
                    'kit_id'   => $kit_id,
                    'css_key'  => $css_key,
                    'settings' => $settings,
                ];
                break;

            case 'content_replace':
                // Capture affected posts before replacement
                $find  = $body['find'] ?? '';
                $posts = [];
                if ($find) {
                    global $wpdb;
                    $like  = '%' . $wpdb->esc_like($find) . '%';
                    $rows  = $wpdb->get_results($wpdb->prepare(
                        "SELECT ID, post_content FROM {$wpdb->posts} WHERE post_content LIKE %s AND post_status IN ('publish','draft') LIMIT 20",
                        $like
                    ));
                    foreach ($rows as $r) $posts[] = ['ID' => $r->ID, 'post_content' => $r->post_content];
                }
                $snapshot['data'] = ['find' => $find, 'affected_posts' => $posts];
                break;

            default:
                $snapshot['data'] = ['raw' => $body];
        }

        // Save
        $snaps   = $this->get_snapshots();
        $snaps[] = $snapshot;
        // Trim to MAX_SNAPS (keep newest)
        usort($snaps, function($a, $b) { return $b['timestamp'] - $a['timestamp']; });
        $snaps = array_slice($snaps, 0, self::MAX_SNAPS);
        update_option(self::OPTION_KEY, $snaps);

        return ['success' => true, 'snapshot_id' => $id, 'snapshot' => $snapshot];
    }

    // ── Restore ───────────────────────────────────────────────────────────
    public function restore_snapshot($request) {
        $id    = $request->get_param('id');
        $snaps = $this->get_snapshots();
        $snap  = null;
        foreach ($snaps as $s) { if ($s['id'] === $id) { $snap = $s; break; } }

        if (!$snap) return new \WP_Error('not_found', "Snapshot {$id} not found", ['status' => 404]);

        $data = $snap['data'];
        $type = $snap['type'];

        switch ($type) {
            case 'option':
                update_option($data['option_name'], $data['old_value']);
                break;

            case 'serialized_field':
                // Restore full option copy (safest approach)
                wp_cache_delete($data['option_name'], 'options');
                delete_option($data['option_name']);
                add_option($data['option_name'], $data['full_option'], '', 'yes');
                wp_cache_delete($data['option_name'], 'options');
                break;

            case 'post_content':
                wp_update_post(['ID' => $data['post_id'], 'post_content' => $data['post_content']]);
                break;

            case 'post_meta':
                update_post_meta($data['post_id'], $data['meta_key'], $data['old_value']);
                break;

            case 'elementor_kit':
                update_post_meta($data['kit_id'], '_elementor_page_settings', $data['settings']);
                delete_post_meta($data['kit_id'], '_elementor_css');
                do_action('elementor/core/files/clear_cache');
                break;

            case 'content_replace':
                foreach ($data['affected_posts'] as $p) {
                    wp_update_post(['ID' => $p['ID'], 'post_content' => $p['post_content']]);
                }
                break;

            default:
                return new \WP_Error('unknown_type', "Don't know how to restore type: {$type}", ['status' => 400]);
        }

        // Flush caches
        wp_cache_flush();

        return [
            'success'     => true,
            'restored_id' => $id,
            'type'        => $type,
            'description' => $snap['description'],
            'message'     => "Restored: {$snap['description']}",
        ];
    }

    // ── Delete ────────────────────────────────────────────────────────────
    public function delete_snapshot($request) {
        $id    = $request->get_param('id');
        $snaps = array_filter($this->get_snapshots(), function($s) use ($id) { return $s['id'] !== $id; });
        update_option(self::OPTION_KEY, array_values($snaps));
        return ['success' => true, 'deleted' => $id];
    }

    private function get_snapshots() {
        $snaps = get_option(self::OPTION_KEY, []);
        return is_array($snaps) ? $snaps : [];
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
