<?php
namespace Ignyous\Api;

class SiteController {
    public function register_routes() {
        register_rest_route('ignyous/v1', '/site', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_site_info'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route('ignyous/v1', '/verify', [
            'methods'             => 'GET',
            'callback'            => [$this, 'verify_connection'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
    }

    public function get_site_info($request) {
        $all_plugins    = get_plugins();
        $active_slugs   = get_option('active_plugins', []);
        $plugins_data   = [];
        foreach ($all_plugins as $slug => $data) {
            $plugins_data[] = [
                'slug'    => $slug,
                'name'    => $data['Name'],
                'version' => $data['Version'],
                'active'  => in_array($slug, $active_slugs, true),
            ];
        }

        $theme = wp_get_theme();

        // Return the structure dashboard/siteProfile.ts expects:
        // siteRes.data.site  (the nested shape)
        return [
            'success' => true,
            'data'    => [
                'site' => [
                    'name'        => get_bloginfo('name'),
                    'url'         => get_home_url(),
                    'description' => get_bloginfo('description'),
                    'admin_email' => get_option('admin_email'),
                    'wp_version'  => get_bloginfo('version'),
                    'theme'       => $theme->get('Name'),
                ],
                'wordpress' => [
                    'version' => get_bloginfo('version'),
                ],
                'theme' => [
                    'name'    => $theme->get('Name'),
                    'slug'    => $theme->get_stylesheet(),
                    'version' => $theme->get('Version'),
                ],
                'plugins' => $plugins_data,
                'content' => [
                    'pages'        => (int) wp_count_posts('page')->publish,
                    'posts'        => (int) wp_count_posts('post')->publish,
                    'active_pages' => (int) wp_count_posts('page')->publish,
                ],
            ],
        ];
    }

    public function verify_connection($request) {
        return [
            'success' => true,
            'message' => 'Connection verified',
            'data'    => [
                'site_name'         => get_bloginfo('name'),
                'site_url'          => get_home_url(),
                'wordpress_version' => get_bloginfo('version'),
            ],
        ];
    }

    public function check_permission() {
        $api_key = get_option('ignyous_bridge_api_key', '');
        if (empty($api_key)) return false;
        $headers     = getallheaders();
        $auth_header = $headers['Authorization'] ?? '';
        if (preg_match('/Bearer\s+(.+)/i', $auth_header, $m)) {
            return hash_equals($api_key, trim($m[1]));
        }
        return false;
    }
}

// ── Media upload endpoint ────────────────────────────────────────
// (registered in register_routes below — added as a second class)
