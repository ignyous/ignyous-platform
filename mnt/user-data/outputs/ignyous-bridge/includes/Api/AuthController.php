<?php
namespace Ignyous\Api;

class AuthController {
    public function register_routes() {
        register_rest_route('ignyous/v1', '/auth/setup', [
            'methods'             => 'POST',
            'callback'            => [$this, 'setup_api_key'],
            'permission_callback' => '__return_true',
        ]);
        register_rest_route('ignyous/v1', '/auth/regenerate', [
            'methods'             => 'POST',
            'callback'            => [$this, 'regenerate_key'],
            'permission_callback' => function() { return current_user_can('manage_options'); },
        ]);
    }

    public function setup_api_key($request) {
        $body    = $request->get_json_params();
        $api_key = sanitize_text_field($body['api_key'] ?? '');
        if (empty($api_key) || strlen($api_key) < 20)
            return new \WP_Error('invalid_key', 'Invalid API key', ['status' => 400]);
        update_option('ignyous_bridge_api_key', $api_key);
        return ['success' => true, 'message' => 'API key saved', 'api_key' => $api_key];
    }

    public function regenerate_key() {
        $key = bin2hex(random_bytes(32));
        update_option('ignyous_bridge_api_key', $key);
        return ['success' => true, 'api_key' => $key];
    }
}
