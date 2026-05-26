<?php
namespace Ignyous\Baseline;

class Plugin {
    private static $instance;
    public static function instance(): self {
        if (!self::$instance) self::$instance = new self();
        return self::$instance;
    }

    public function boot(): void {
        add_action('rest_api_init', [$this, 'registerRoutes']);
        add_action('admin_menu',    [$this, 'registerAdminPage']);

        // CORS for the platform — allow the dashboard to call us cross-origin
        add_action('rest_api_init', function () {
            remove_filter('rest_pre_serve_request', 'rest_send_cors_headers');
            add_filter('rest_pre_serve_request', function ($value) {
                $origin = get_http_origin();
                if ($origin) {
                    header('Access-Control-Allow-Origin: ' . esc_url_raw($origin));
                    header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
                    header('Access-Control-Allow-Headers: Authorization, Content-Type, X-Ignyous-Change-Id, X-Ignyous-Intent, X-Ignyous-Ai-Tokens');
                    header('Access-Control-Allow-Credentials: true');
                }
                return $value;
            });
        }, 15);
    }

    public function registerRoutes(): void {
        (new Api\AuthController())->register();
        (new Api\SiteController())->register();
        (new Api\OptionsController())->register();
        (new Api\PagesController())->register();
        (new Api\ThemeController())->register();
        (new Api\MediaController())->register();
        (new Api\BlocksController())->register();
        (new Api\SnapshotController())->register();
        (new Api\ActionLogController())->register();
    }

    public function registerAdminPage(): void {
        (new Admin\SettingsPage())->register();
    }
}
