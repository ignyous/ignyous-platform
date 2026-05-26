<?php
namespace Ignyous\Baseline\Api;

use Ignyous\Baseline\Auth;

class SiteController {

    public function register(): void {
        register_rest_route('ignyous/v1', '/site', [
            'methods'             => 'GET',
            'permission_callback' => [Auth::class, 'check'],
            'callback'            => [$this, 'get'],
        ]);
    }

    public function get(\WP_REST_Request $req): \WP_REST_Response {
        $theme = wp_get_theme();
        return new \WP_REST_Response([
            'site_url'    => home_url(),
            'admin_url'   => admin_url(),
            'site_title'  => get_bloginfo('name'),
            'tagline'     => get_bloginfo('description'),
            'wp_version'  => get_bloginfo('version'),
            'plugin_version' => IGNYOUS_BL_VERSION,
            'theme' => [
                'name'        => $theme->get('Name'),
                'stylesheet'  => get_stylesheet(),  // active theme slug
                'template'    => get_template(),
                'version'     => $theme->get('Version'),
                'is_block_theme' => function_exists('wp_is_block_theme') ? wp_is_block_theme() : false,
            ],
            'home_page_id' => (int) get_option('page_on_front'),
            'show_on_front' => get_option('show_on_front'),
        ]);
    }
}
