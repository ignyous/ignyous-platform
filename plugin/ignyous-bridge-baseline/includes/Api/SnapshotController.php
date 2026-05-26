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
