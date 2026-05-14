<?php
namespace Ignyous\Admin;

/**
 * AdminPages — WP Admin menu pages for Ignyous Bridge.
 *
 * Menu:
 *   Ignyous Bridge → Settings
 *                  → Activity Log
 *                  → Snapshots
 */
class AdminPages {
    public function init() {
        add_action('admin_menu', [$this, 'register_menus']);
        add_action('admin_post_ignyous_restore_snapshot', [$this, 'handle_restore']);
        add_action('admin_post_ignyous_delete_snapshot',  [$this, 'handle_delete_snapshot']);
    }

    public function register_menus() {
        add_menu_page('Ignyous Bridge', 'Ignyous Bridge', 'manage_options', 'ignyous-bridge', [$this, 'page_settings'], 'dashicons-cloud', 80);
        add_submenu_page('ignyous-bridge', 'Settings',     'Settings',     'manage_options', 'ignyous-bridge',    [$this, 'page_settings']);
        add_submenu_page('ignyous-bridge', 'Activity Log', 'Activity Log', 'manage_options', 'ignyous-activity',  [$this, 'page_activity']);
        add_submenu_page('ignyous-bridge', 'Snapshots',    'Snapshots',    'manage_options', 'ignyous-snapshots', [$this, 'page_snapshots']);
    }

    public function page_settings() {
        if (isset($_POST['ignyous_save_key'])  && check_admin_referer('ignyous_settings')) {
            $k = sanitize_text_field($_POST['ignyous_api_key'] ?? '');
            if ($k) update_option('ignyous_bridge_api_key', $k);
        }
        if (isset($_POST['ignyous_regen_key']) && check_admin_referer('ignyous_settings')) {
            update_option('ignyous_bridge_api_key', 'igk_' . bin2hex(random_bytes(16)));
        }
        $key      = get_option('ignyous_bridge_api_key', '');
        $rest_url = rest_url('ignyous/v1/verify');
        $log      = get_option('ignyous_activity_log', []);
        $last_raw = !empty($log) ? max(array_column($log, 'time')) : null;
        // time may be a Unix int OR a datetime string depending on how it was logged
        $last_str = $last_raw ? (is_numeric($last_raw) ? date('Y-m-d H:i:s', (int)$last_raw) : substr((string)$last_raw, 0, 19)) : null;
        ?>
        <div class="wrap"><h1>⚡ Ignyous Bridge — Settings</h1>
        <form method="post"><<?php wp_nonce_field('ignyous_settings'); ?>
        <table class="form-table">
            <tr><th>API Key</th><td>
                <input type="text" name="ignyous_api_key" value="<?php echo esc_attr($key); ?>"
                    class="regular-text code" style="width:420px;font-family:monospace" readonly onclick="this.select()"/>
                <button type="submit" name="ignyous_save_key" class="button">Save</button>
                <button type="submit" name="ignyous_regen_key" class="button button-secondary"
                    onclick="return confirm('Regenerate? You will need to update the key in the Ignyous app.')">↻ Regenerate</button>
            </td></tr>
            <tr><th>Endpoint</th><td><code><?php echo esc_html($rest_url); ?></code></td></tr>
            <tr><th>Status</th><td>
                <?php if ($key): ?>
                    <span style="color:#16a34a;font-weight:600">✅ Configured</span>
                    <?php if ($last_str): ?> — Last request: <?php echo esc_html($last_str); ?><?php endif; ?>
                <?php else: ?>
                    <span style="color:#dc2626;font-weight:600">⚠️ No API key set</span>
                <?php endif; ?>
            </td></tr>
        </table></form></div>
        <?php
    }

    public function page_activity() {
        $log = get_option('ignyous_activity_log', []);
        if (!is_array($log)) $log = [];
        usort($log, function($a,$b){ return ($b['time']??0) - ($a['time']??0); });
        $log = array_slice($log, 0, 200);
        ?>
        <div class="wrap"><h1>📋 Activity Log</h1>
        <p style="color:#666"><?php echo count($log); ?> most recent requests (last 200 shown)</p>
        <table class="widefat striped" style="font-size:13px">
        <thead><tr><th>Date/Time</th><th>Method</th><th>Endpoint</th><th>Status</th><th>IP</th><th>Duration</th></tr></thead>
        <tbody>
        <?php foreach ($log as $e):
            $status = $e['status'] ?? 200;
            $color  = $status >= 400 ? '#dc2626' : ($status >= 300 ? '#d97706' : '#16a34a');
            $raw_t  = $e['time'] ?? null;
            $dt     = $raw_t ? (is_numeric($raw_t) ? date('Y-m-d H:i:s', (int)$raw_t) : substr((string)$raw_t, 0, 19)) : '—';
        ?>
        <tr>
            <td style="white-space:nowrap"><?php echo esc_html($dt); ?></td>
            <td><code><?php echo esc_html($e['method']??''); ?></code></td>
            <td><code><?php echo esc_html($e['endpoint']??''); ?></code>
                <?php if (!empty($e['message'])): ?>
                    <br><small style="color:#666"><?php echo esc_html(substr($e['message'],0,80)); ?></small>
                <?php endif; ?>
            </td>
            <td><span style="color:<?php echo $color; ?>;font-weight:700"><?php echo esc_html($status); ?></span></td>
            <td><?php echo esc_html($e['ip']??''); ?></td>
            <td><?php echo esc_html(($e['duration_ms']??'—').'ms'); ?></td>
        </tr>
        <?php endforeach; ?>
        </tbody></table></div>
        <?php
    }

    public function page_snapshots() {
        $snaps = get_option('ignyous_snapshots', []);
        if (!is_array($snaps)) $snaps = [];
        usort($snaps, function($a,$b){ return ($b['timestamp']??0) - ($a['timestamp']??0); });

        $type_icons = [
            'serialized_field' => '🔧 Theme Option', 'option' => '⚙️ Option',
            'post_content' => '📄 Page', 'post_meta' => '🏷 Meta',
            'elementor_kit' => '⚡ Elementor', 'content_replace' => '🔁 Replace', 'general' => '📦',
        ];
        ?>
        <div class="wrap"><h1>📦 Snapshots & Rollback</h1>
        <p style="color:#666"><?php echo count($snaps); ?> snapshot(s) — taken automatically before AI changes.</p>

        <?php if (!empty($_GET['restored'])): ?>
            <div class="notice notice-success is-dismissible"><p>✅ Restored: <?php echo esc_html($_GET['restored']); ?></p></div>
        <?php endif; ?>
        <?php if (!empty($_GET['deleted'])): ?>
            <div class="notice notice-info is-dismissible"><p>🗑 Snapshot deleted.</p></div>
        <?php endif; ?>

        <?php if (empty($snaps)): ?>
            <p><em>No snapshots yet. They are created automatically before AI changes.</em></p>
        <?php else: ?>
        <table class="widefat striped" style="font-size:13px">
        <thead><tr><th>Date/Time</th><th>Type</th><th>Description</th><th>Details</th><th>Actions</th></tr></thead>
        <tbody>
        <?php foreach ($snaps as $snap):
            $raw_ts  = $snap['timestamp'] ?? null;
            $dt      = $raw_ts ? (is_numeric($raw_ts) ? date('Y-m-d H:i:s', (int)$raw_ts) : substr((string)$raw_ts, 0, 19)) : '—';
            $type    = $snap['type'] ?? 'general';
            $data    = $snap['data'] ?? [];
            $details = [];
            if (!empty($data['option_name']))  $details[] = 'Option: '  . $data['option_name'];
            if (!empty($data['array_key']))    $details[] = 'Key: '     . $data['array_key'];
            if (!empty($data['post_title']))   $details[] = 'Page: '    . $data['post_title'];
            if (!empty($data['find']))         $details[] = 'Find: "'   . substr($data['find'],0,35) . '"';
        ?>
        <tr>
            <td style="white-space:nowrap"><?php echo esc_html($dt); ?></td>
            <td><?php echo esc_html($type_icons[$type] ?? $type); ?></td>
            <td><?php echo esc_html($snap['description']??''); ?></td>
            <td style="color:#666;font-size:12px"><?php echo esc_html(implode(' | ', $details)); ?></td>
            <td style="white-space:nowrap">
                <form method="post" action="<?php echo admin_url('admin-post.php'); ?>" style="display:inline">
                    <?php wp_nonce_field('ignyous_restore_'.$snap['id'], 'ignyous_nonce'); ?>
                    <input type="hidden" name="action" value="ignyous_restore_snapshot">
                    <input type="hidden" name="snapshot_id" value="<?php echo esc_attr($snap['id']); ?>">
                    <input type="submit" class="button button-primary button-small" value="↩ Restore"
                        onclick="return confirm('Restore to this point? Current content will be overwritten.')">
                </form>
                <form method="post" action="<?php echo admin_url('admin-post.php'); ?>" style="display:inline;margin-left:4px">
                    <?php wp_nonce_field('ignyous_del_'.$snap['id'], 'ignyous_nonce'); ?>
                    <input type="hidden" name="action" value="ignyous_delete_snapshot">
                    <input type="hidden" name="snapshot_id" value="<?php echo esc_attr($snap['id']); ?>">
                    <input type="submit" class="button button-small" value="🗑" style="color:#dc2626"
                        onclick="return confirm('Delete this snapshot?')">
                </form>
            </td>
        </tr>
        <?php endforeach; ?>
        </tbody></table>
        <?php endif; ?>
        </div>
        <?php
    }

    public function handle_restore() {
        $id = sanitize_text_field($_POST['snapshot_id'] ?? '');
        if (!$id || !check_admin_referer('ignyous_restore_'.$id, 'ignyous_nonce')) wp_die('Invalid');

        $snaps = get_option('ignyous_snapshots', []);
        $snap  = null;
        foreach ($snaps as $s) { if ($s['id'] === $id) { $snap = $s; break; } }
        if (!$snap) wp_die('Not found');

        require_once dirname(__DIR__) . '/Api/SnapshotController.php';
        $ctrl = new \Ignyous\Api\SnapshotController();
        $req  = new \WP_REST_Request('POST');
        $req->set_param('id', $id);
        $result = $ctrl->restore_snapshot($req);
        wp_cache_flush();

        $msg = is_wp_error($result) ? 'Error: '.$result->get_error_message() : ($result['description'] ?? $id);
        wp_redirect(admin_url('admin.php?page=ignyous-snapshots&restored='.urlencode($msg)));
        exit;
    }

    public function handle_delete_snapshot() {
        $id = sanitize_text_field($_POST['snapshot_id'] ?? '');
        if (!$id || !check_admin_referer('ignyous_del_'.$id, 'ignyous_nonce')) wp_die('Invalid');
        $snaps = array_values(array_filter(get_option('ignyous_snapshots', []), function($s) use($id){ return $s['id'] !== $id; }));
        update_option('ignyous_snapshots', $snaps);
        wp_redirect(admin_url('admin.php?page=ignyous-snapshots&deleted=1'));
        exit;
    }
}
