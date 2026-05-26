<?php
namespace Ignyous\Baseline\Admin;

class SettingsPage {

    public function register(): void {
        add_options_page(
            'Ignyous Bridge',
            'Ignyous Bridge',
            'manage_options',
            'ignyous-bridge-baseline',
            [$this, 'render']
        );
    }

    public function render(): void {
        if (!current_user_can('manage_options')) return;

        $apiKey      = (string) get_option('ignyous_bl_api_key', '');
        $setupToken  = (string) get_option('ignyous_bl_setup_token', '');
        $hasKey      = !empty($apiKey);
        $pingUrl     = rest_url('ignyous/v1/ping');
        $verifyUrl   = rest_url('ignyous/v1/verify');

        ?>
        <div class="wrap">
            <h1>Ignyous Bridge (Baseline)</h1>
            <p>Version <?php echo esc_html(IGNYOUS_BL_VERSION); ?>. Phase 0 — basic text/color/page editing with full snapshots.</p>

            <h2>Connection</h2>
            <table class="form-table">
                <tr>
                    <th>Status</th>
                    <td>
                        <?php if ($hasKey): ?>
                            <strong style="color:#1E7B4B">Claimed</strong> — this site has been connected to the Ignyous platform.
                        <?php else: ?>
                            <strong style="color:#92400E">Awaiting setup</strong> — connect this site from your Ignyous dashboard.
                        <?php endif; ?>
                    </td>
                </tr>
                <tr>
                    <th>Ping URL</th>
                    <td><code><?php echo esc_html($pingUrl); ?></code></td>
                </tr>
                <tr>
                    <th>Verify URL</th>
                    <td><code><?php echo esc_html($verifyUrl); ?></code></td>
                </tr>
                <?php if (!$hasKey && $setupToken): ?>
                <tr>
                    <th>Setup token</th>
                    <td><code><?php echo esc_html($setupToken); ?></code>
                    <p class="description">The platform reads this from <code>/ping</code> automatically. It's burned after first use.</p></td>
                </tr>
                <?php endif; ?>
            </table>

            <h2>Reset</h2>
            <form method="post">
                <?php wp_nonce_field('ignyous_bl_reset'); ?>
                <p>
                    <button type="submit" name="ignyous_bl_reset" class="button" onclick="return confirm('Disconnect this site? The platform will need to re-claim it.')">
                        Disconnect &amp; regenerate setup token
                    </button>
                </p>
            </form>
            <?php $this->maybeHandleReset(); ?>
        </div>
        <?php
    }

    private function maybeHandleReset(): void {
        if (empty($_POST['ignyous_bl_reset'])) return;
        if (!check_admin_referer('ignyous_bl_reset')) return;
        if (!current_user_can('manage_options')) return;

        update_option('ignyous_bl_api_key', '');
        update_option('ignyous_bl_setup_token', wp_generate_password(32, false, false));
        echo '<div class="notice notice-success"><p>Site disconnected. A new setup token has been generated. Reload this page to see it.</p></div>';
    }
}
