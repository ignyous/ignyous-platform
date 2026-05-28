<?php
namespace Ignyous\Baseline\Api;

use Ignyous\Baseline\Auth;
use Ignyous\Baseline\Snapshots;
use Ignyous\Baseline\ActionLog;

class SnapshotController {

    public function register(): void {
        register_rest_route('ignyous/v1', '/snapshots', [
            'methods'             => 'GET',
            'permission_callback' => [Auth::class, 'check'],
            'callback'            => [$this, 'list'],
            'args'                => [
                'limit'     => ['type' => 'integer', 'default' => 50],
                'change_id' => ['type' => 'string'],
            ],
        ]);

        register_rest_route('ignyous/v1', '/snapshots/(?P<id>\d+)/restore', [
            'methods'             => 'POST',
            'permission_callback' => [Auth::class, 'check'],
            'callback'            => [$this, 'restore'],
        ]);

        // Restore everything tied to a single change_id (entire user action).
        register_rest_route('ignyous/v1', '/snapshots/restore-change/(?P<change_id>[A-Za-z0-9_-]+)', [
            'methods'             => 'POST',
            'permission_callback' => [Auth::class, 'check'],
            'callback'            => [$this, 'restoreChange'],
        ]);
    }

    public function list(\WP_REST_Request $req): \WP_REST_Response {
        $limit = (int) ($req->get_param('limit') ?: 50);
        $cid   = $req->get_param('change_id');
        $rows  = Snapshots::list($limit, $cid ?: null);
        return new \WP_REST_Response(['snapshots' => $rows]);
    }

    public function restore(\WP_REST_Request $req) {
        $id   = (int) $req['id'];
        $snap = Snapshots::get($id);
        if (!$snap) return new \WP_Error('ignyous_snap_not_found', 'Snapshot not found.', ['status' => 404]);

        $result = $this->applyRestore($snap);
        if (is_wp_error($result)) return $result;

        Snapshots::markRestored($id);

        $newChangeId = Auth::changeId($req);
        ActionLog::record([
            'change_id'  => $newChangeId,
            'intent_raw' => 'undo snapshot ' . $id,
            'capability' => 'snapshots.restore',
            'request'    => ['snapshot_id' => $id],
            'response'   => $result,
            'success'    => 1,
        ]);

        return new \WP_REST_Response(['success' => true, 'restored' => $result]);
    }

    public function restoreChange(\WP_REST_Request $req) {
        $changeId = preg_replace('/[^A-Za-z0-9_-]/', '', (string) $req['change_id']);
        if (!$changeId) return new \WP_Error('ignyous_bad_change_id', 'Bad change_id.', ['status' => 400]);

        $rows = Snapshots::list(500, $changeId);
        if (!$rows) return new \WP_Error('ignyous_no_snaps', 'No snapshots for that change.', ['status' => 404]);

        $restored = [];
        $errors   = [];
        // Restore newest first within a change (safe for now since each row is independent)
        foreach ($rows as $row) {
            $r = $this->applyRestore($row);
            if (is_wp_error($r)) {
                $errors[$row['id']] = $r->get_error_message();
            } else {
                Snapshots::markRestored((int) $row['id']);
                $restored[] = $r;
            }
        }

        $ok = empty($errors);
        ActionLog::record([
            'change_id'  => Auth::changeId($req),
            'intent_raw' => 'undo change ' . $changeId,
            'capability' => 'snapshots.restore_change',
            'request'    => ['change_id' => $changeId],
            'response'   => ['restored' => $restored, 'errors' => $errors],
            'success'    => $ok ? 1 : 0,
            'error'      => $ok ? null : wp_json_encode($errors),
        ]);

        return new \WP_REST_Response([
            'success'  => $ok,
            'restored' => $restored,
            'errors'   => (object) $errors,
        ], $ok ? 200 : 207);
    }

    /** Decode and apply a single snapshot row. Returns ['target_type', 'target_key', 'restored_to'] or WP_Error. */
    private function applyRestore(array $snap) {
        $type = $snap['target_type'];
        $key  = $snap['target_key'];
        $val  = $snap['before_value'];

        switch ($type) {
            case 'option':
                update_option($key, $this->maybeJsonDecode($val));
                return ['target_type' => $type, 'target_key' => $key, 'restored_to' => get_option($key)];

            case 'page_title':
                $r = wp_update_post(['ID' => (int) $key, 'post_title' => (string) $val], true);
                if (is_wp_error($r)) return $r;
                return ['target_type' => $type, 'target_key' => $key, 'restored_to' => get_post_field('post_title', (int) $key, 'raw')];

            case 'page_content':
                $r = wp_update_post(['ID' => (int) $key, 'post_content' => wp_unslash((string) $val)], true);
                if (is_wp_error($r)) return $r;
                return ['target_type' => $type, 'target_key' => $key, 'restored_to' => 'page_content (' . strlen($val) . ' chars)'];

            case 'post_meta':
                // target_key format: "{post_id}|{meta_key}"
                $parts = explode('|', $key, 2);
                if (count($parts) !== 2) return new \WP_Error('ignyous_bad_meta_key', 'post_meta key must be "post_id|meta_key".', ['status' => 500]);
                [$postId, $metaKey] = [(int) $parts[0], $parts[1]];
                if ($val === '' || $val === null || $val === '0') {
                    delete_post_meta($postId, $metaKey);
                } else {
                    update_post_meta($postId, $metaKey, $this->maybeJsonDecode($val));
                }
                return ['target_type' => $type, 'target_key' => $key, 'restored_to' => get_post_meta($postId, $metaKey, true)];

            case 'attachment_created':
                // Undo an upload = delete the attachment we created.
                $attachId = (int) $key;
                if (!get_post($attachId)) {
                    return ['target_type' => $type, 'target_key' => $key, 'restored_to' => 'already_gone'];
                }
                $deleted = wp_delete_attachment($attachId, true);
                if (!$deleted) return new \WP_Error('ignyous_attachment_delete_failed', 'Could not delete attachment ' . $attachId, ['status' => 500]);
                return ['target_type' => $type, 'target_key' => $key, 'restored_to' => 'deleted'];

            case 'attachment_deleted':
                // Hard-deleted bytes are gone — we can't restore the file. Return a noted no-op.
                return ['target_type' => $type, 'target_key' => $key, 'restored_to' => 'cannot_undo_hard_delete', 'note' => 'Attachment file was permanently removed; re-upload required.'];

            case 'global_styles':
                $data = json_decode($val, true);
                if (!is_array($data)) return new \WP_Error('ignyous_bad_snapshot', 'Snapshot before_value is not valid JSON.', ['status' => 500]);
                $data['isGlobalStylesUserThemeJSON'] = true;
                $r = wp_update_post([
                    'ID'           => (int) $key,
                    'post_content' => wp_slash(wp_json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)),
                ], true);
                if (is_wp_error($r)) return $r;
                if (class_exists('WP_Theme_JSON_Resolver') && method_exists('WP_Theme_JSON_Resolver', 'clean_cached_data')) {
                    \WP_Theme_JSON_Resolver::clean_cached_data();
                }
                return ['target_type' => $type, 'target_key' => $key, 'restored_to' => 'global_styles'];

            case 'elementor_data':
                // _elementor_data is stored as a JSON STRING (not a PHP array), so we
                // write it back verbatim with wp_slash — never json-decode it.
                $r = update_metadata('post', (int) $key, '_elementor_data', wp_slash((string) $val));
                // Clear Elementor compiled CSS so the restore is visible immediately
                if (class_exists('\\Elementor\\Plugin') && isset(\Elementor\Plugin::$instance->files_manager)) {
                    try { \Elementor\Plugin::$instance->files_manager->clear_cache(); } catch (\Throwable $e) {}
                }
                if (function_exists('delete_post_meta_by_key')) {
                    delete_post_meta_by_key('_elementor_css');
                    delete_post_meta_by_key('_elementor_element_cache');
                }
                return ['target_type' => $type, 'target_key' => $key, 'restored_to' => 'elementor_data (' . strlen((string) $val) . ' chars)'];

            default:
                return new \WP_Error('ignyous_unknown_target', 'Cannot restore target_type=' . $type, ['status' => 400]);
        }
    }

    private function maybeJsonDecode($v) {
        if (!is_string($v)) return $v;
        $d = json_decode($v, true);
        return ($d !== null && json_last_error() === JSON_ERROR_NONE) ? $d : $v;
    }
}
