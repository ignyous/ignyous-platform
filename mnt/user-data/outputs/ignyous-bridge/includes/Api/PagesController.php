<?php
namespace Ignyous\Api;

class PagesController {
    public function register_routes() {
        register_rest_route('ignyous/v1', '/pages', [
            'methods' => 'GET',
            'callback' => [$this, 'get_pages'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
    }

    public function get_pages($request) {
        $pages = get_posts([
            'post_type' => 'page',
            'posts_per_page' => -1,
            'post_status' => ['publish', 'draft'],
        ]);

        $data = [];
        foreach ($pages as $page) {
            $data[] = [
                'id' => $page->ID,
                'title' => $page->post_title,
                'slug' => $page->post_name,
                'status' => $page->post_status,
                'link' => get_permalink($page->ID),
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
