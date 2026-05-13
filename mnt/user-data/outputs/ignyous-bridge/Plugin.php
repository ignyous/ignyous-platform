<?php
/**
 * Plugin Name: Ignyous Bridge
 * Description: Connects your WordPress site to the Ignyous AI platform
 * Version:     2.1.0
 * Author:      Ignyous AI
 * Author URI:  https://ignyous.ai
 * License:     GPL v2 or later
 * Text Domain: ignyous-bridge
 */

if (!defined('ABSPATH')) exit;

define('IGNYOUS_VERSION', '2.1.0');
define('IGNYOUS_DIR',     plugin_dir_path(__FILE__));
define('IGNYOUS_URL',     plugin_dir_url(__FILE__));
define('IGNYOUS_LOG_KEY', 'ignyous_activity_log');

// Autoloader
spl_autoload_register(function ($class) {
    if (strpos($class, 'Ignyous\\') === 0) {
        $file = IGNYOUS_DIR . 'includes/' . str_replace(['Ignyous\\', '\\'], ['', '/'], $class) . '.php';
        if (file_exists($file)) require $file;
    }
});

class IgnyousBridge {
    private static $instance = null;
    public static function getInstance() {
        if (!self::$instance) self::$instance = new self();
        return self::$instance;
    }

    public function __construct() {
        add_action('rest_api_init',    [$this, 'register_routes']);
        add_action('admin_menu',       [$this, 'add_menu']);
        add_action('admin_init',       [$this, 'register_settings']);
        add_filter('rest_pre_dispatch', [$this, 'log_api_request'], 10, 3);
        register_activation_hook(__FILE__,   [$this, 'activate']);
        register_deactivation_hook(__FILE__, [$this, 'deactivate']);
    }

    public function activate() {
        // Generate key on first install
        if (!get_option('ignyous_bridge_api_key')) {
            update_option('ignyous_bridge_api_key', bin2hex(random_bytes(32)));
        }
        $this->create_service_user();
    }

    public function deactivate() { /* keep key on deactivate */ }

    public function register_routes() {
        (new \Ignyous\Api\SiteController())->register_routes();
        (new \Ignyous\Api\PagesController())->register_routes();
        (new \Ignyous\Api\PluginsController())->register_routes();
        (new \Ignyous\Api\AuthController())->register_routes();
        (new \Ignyous\Api\MediaController())->register_routes();
        (new \Ignyous\Api\OptionsController())->register_routes();
    }

    public function add_menu() {
        add_options_page('Ignyous Bridge', 'Ignyous Bridge', 'manage_options', 'ignyous-bridge', [$this, 'render_settings']);
    }

    public function register_settings() {
        register_setting('ignyous_bridge', 'ignyous_bridge_api_key', ['sanitize_callback' => 'sanitize_text_field']);
    }

    public function render_settings() {
        $key    = get_option('ignyous_bridge_api_key', '');
        $logs   = get_option(IGNYOUS_LOG_KEY, []);
        $status = $this->self_verify($key);
        ?>
        <div class="wrap" style="max-width:900px">
          <h1 style="display:flex;align-items:center;gap:10px">
            <img src="<?= IGNYOUS_URL ?>assets/icon.png" width="28" style="border-radius:6px" onerror="this.style.display='none'">
            Ignyous Bridge <span style="font-size:13px;color:#666;font-weight:400">v<?= IGNYOUS_VERSION ?></span>
          </h1>

          <!-- STATUS CARD -->
          <div style="background:<?= $status ? '#f0fdf4' : '#fef2f2' ?>;border:1px solid <?= $status ? '#86efac' : '#fca5a5' ?>;border-radius:10px;padding:16px 20px;margin:16px 0;display:flex;align-items:center;gap:12px">
            <span style="font-size:22px"><?= $status ? '✅' : '❌' ?></span>
            <div>
              <strong><?= $status ? 'Connected & Verified' : 'Not Connected' ?></strong><br>
              <span style="font-size:13px;color:#555"><?= $status ? 'Plugin is active and API is reachable from ignyous.ai' : 'Check your API key and ensure ignyous.ai can reach this site' ?></span>
            </div>
          </div>

          <!-- API KEY SETTINGS -->
          <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin-bottom:20px">
            <h2 style="margin-top:0">API Key</h2>
            <p style="color:#666;font-size:13px">This key authenticates ignyous.ai to your site. Keep it secret.</p>
            <form method="post" action="options.php">
              <?php settings_fields('ignyous_bridge'); ?>
              <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                <input type="text" name="ignyous_bridge_api_key" value="<?= esc_attr($key) ?>"
                  style="flex:1;min-width:300px;font-family:monospace;font-size:13px;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px" />
                <?php submit_button('Save Key', 'primary', 'submit', false); ?>
                <button type="button" onclick="regenerateKey()" class="button">Regenerate</button>
              </div>
            </form>
            <script>
            function regenerateKey(){
              if(!confirm('Generate a new key? You will need to reconnect ignyous.ai after.')) return;
              fetch('<?= rest_url('ignyous/v1/auth/regenerate') ?>', {
                method:'POST', headers:{'Content-Type':'application/json','X-WP-Nonce':'<?= wp_create_nonce('wp_rest') ?>'}
              }).then(r=>r.json()).then(d=>{ if(d.api_key) { document.querySelector('[name=ignyous_bridge_api_key]').value=d.api_key; alert('New key generated. Save it and reconnect ignyous.ai.'); } });
            }
            </script>
          </div>

          <!-- ACTIVITY LOG -->
          <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:20px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
              <h2 style="margin:0">Activity Log <span style="font-size:13px;font-weight:400;color:#888">(last <?= count($logs) ?> entries)</span></h2>
              <a href="?page=ignyous-bridge&clear_log=1" class="button button-small" onclick="return confirm('Clear all logs?')">Clear</a>
            </div>
            <?php
            // Handle clear
            if (!empty($_GET['clear_log']) && current_user_can('manage_options')) {
                update_option(IGNYOUS_LOG_KEY, []);
                $logs = [];
                echo '<div class="notice notice-success"><p>Log cleared.</p></div>';
            }
            if (empty($logs)): ?>
              <p style="color:#888;font-size:13px">No activity logged yet. API calls will appear here.</p>
            <?php else: ?>
              <div style="overflow:auto;max-height:500px">
                <table class="widefat striped" style="font-size:12px">
                  <thead>
                    <tr><th>Time</th><th>Method</th><th>Endpoint</th><th>Status</th><th>IP</th><th>Duration</th></tr>
                  </thead>
                  <tbody>
                    <?php foreach (array_reverse($logs) as $entry): ?>
                    <tr>
                      <td style="white-space:nowrap"><?= esc_html($entry['time'] ?? '') ?></td>
                      <td><code><?= esc_html($entry['method'] ?? '') ?></code></td>
                      <td><code><?= esc_html($entry['endpoint'] ?? '') ?></code></td>
                      <td>
                        <span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;background:<?= ($entry['status'] ?? 200) < 400 ? '#dcfce7' : '#fee2e2' ?>;color:<?= ($entry['status'] ?? 200) < 400 ? '#16a34a' : '#dc2626' ?>">
                          <?= esc_html($entry['status'] ?? '?') ?>
                        </span>
                        <?php if (!empty($entry['error'])): ?>
                          <span style="color:#dc2626;margin-left:6px" title="<?= esc_attr($entry['error']) ?>">⚠ <?= esc_html(substr($entry['error'], 0, 60)) ?></span>
                        <?php endif; ?>
                      </td>
                      <td><?= esc_html($entry['ip'] ?? '') ?></td>
                      <td><?= esc_html($entry['duration_ms'] ?? '') ?>ms</td>
                    </tr>
                    <?php endforeach; ?>
                  </tbody>
                </table>
              </div>
            <?php endif; ?>
          </div>
        </div>
        <?php
    }

    /** Log every ignyous REST API call */
    public function log_api_request($result, $server, $request) {
        if (strpos($request->get_route(), '/ignyous/v1/') === false) return $result;
        $start = microtime(true);
        add_filter('rest_post_dispatch', function ($response) use ($request, $start) {
            $logs   = get_option(IGNYOUS_LOG_KEY, []);
            $logs[] = [
                'time'        => current_time('Y-m-d H:i:s'),
                'method'      => $request->get_method(),
                'endpoint'    => $request->get_route(),
                'status'      => $response->get_status(),
                'ip'          => $_SERVER['REMOTE_ADDR'] ?? '',
                'duration_ms' => round((microtime(true) - $start) * 1000),
                'error'       => $response->get_status() >= 400 ? ($response->get_data()['message'] ?? '') : '',
            ];
            // Keep last 200 entries
            if (count($logs) > 200) $logs = array_slice($logs, -200);
            update_option(IGNYOUS_LOG_KEY, $logs);
            return $response;
        }, 10, 1);
        return $result;
    }

    private function self_verify($key) {
        if (empty($key)) return false;
        $r = wp_remote_get(rest_url('ignyous/v1/verify'), [
            'headers' => ['Authorization' => 'Bearer ' . $key],
            'timeout' => 5,
        ]);
        return !is_wp_error($r) && wp_remote_retrieve_response_code($r) === 200;
    }

    private function create_service_user() {
        if (get_user_by('login', 'ignyous-service')) return;
        $id = wp_create_user('ignyous-service', wp_generate_password(32), 'service@ignyous.local');
        if (!is_wp_error($id)) {
            $user = new WP_User($id);
            $user->set_role('administrator');
        }
    }
}

IgnyousBridge::getInstance();
