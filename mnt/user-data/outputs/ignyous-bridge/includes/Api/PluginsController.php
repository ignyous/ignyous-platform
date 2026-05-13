<?php
namespace Ignyous\Api;

class PluginsController {
    public function register_routes() {
        register_rest_route('ignyous/v1', '/plugins', [
            'methods' => 'GET',
            'callback' => [$this, 'get_plugins'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
    }

    public function get_plugins($request) {
        $all_plugins = get_plugins();
        $active_plugins = get_option('active_plugins', []);

        $data = [];
        foreach ($all_plugins as $slug => $plugin) {
            $is_active = in_array($slug, $active_plugins, true);
            $data[] = [
                'slug' => $slug,
                'name' => $plugin['Name'],
                'version' => $plugin['Version'],
                'active' => $is_active,
                'description' => $plugin['Description'],
            ];
        }

        return [
            'success' => true,
            'data' => $data,
        ];
    }

    public function check_permission() {
        $api_key = get_option('ignyous_bridge_api_key', '');
        
        if (empty($api_key)) {
            return false;
        }

        $headers = getallheaders();
        $auth_header = $headers['Authorization'] ?? '';
        
        if (preg_match('/Bearer\s+(.+)/i', $auth_header, $matches)) {
            return hash_equals($api_key, $matches[1]);
        }
        
        return false;
    }
}
