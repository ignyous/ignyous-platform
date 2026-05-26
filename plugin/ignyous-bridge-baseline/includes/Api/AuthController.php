<?php
namespace Ignyous\Baseline\Api;

use Ignyous\Baseline\Auth;

class AuthController {

    public function register(): void {
        // /ping — open, returns site info + setup_token (only useful before /setup ran)
        register_rest_route('ignyous/v1', '/ping', [
            'methods'             => 'GET',
            'permission_callback' => '__return_true',
            'callback'            => [$this, 'ping'],
        ]);

        // /setup — claim the site using the setup_token, set the API key.
        register_rest_route('ignyous/v1', '/setup', [
            'methods'             => 'POST',
            'permission_callback' => '__return_true',
            'callback'            => [$this, 'setup'],
            'args'                => [
                'setup_token' => ['required' => true, 'type' => 'string'],
                'api_key'     => ['required' => true, 'type' => 'string'],
            ],
        ]);

        // /verify — quick auth-required handshake the platform uses on every load.
        register_rest_route('ignyous/v1', '/verify', [
            'methods'             => 'GET',
            'permission_callback' => [Auth::class, 'check'],
            'callback'            => [$this, 'verify'],
        ]);
    }

    public function ping(\WP_REST_Request $req): \WP_REST_Response {
        $hasKey = (bool) get_option('ignyous_bl_api_key');
        return new \WP_REST_Response([
            'plugin'         => 'ignyous-bridge-baseline',
            'plugin_version' => IGNYOUS_BL_VERSION,
            'connected'      => $hasKey,
            'setup_token'    => $hasKey ? null : (string) get_option('ignyous_bl_setup_token'),
            'site_url'       => home_url(),
            'site_name'      => get_bloginfo('name'),
            'wp_version'     => get_bloginfo('version'),
            'theme'          => wp_get_theme()->get('Name'),
        ]);
    }

    public function setup(\WP_REST_Request $req) {
        $providedToken = (string) $req->get_param('setup_token');
        $newKey        = (string) $req->get_param('api_key');
        $storedToken   = (string) get_option('ignyous_bl_setup_token');

        if (!$storedToken || !hash_equals($storedToken, $providedToken)) {
            return new \WP_Error('ignyous_bad_setup_token', 'Setup token is invalid or already used.', ['status' => 403]);
        }
        if (strlen($newKey) < 32) {
            return new \WP_Error('ignyous_key_too_short', 'API key must be at least 32 characters.', ['status' => 400]);
        }

        update_option('ignyous_bl_api_key', $newKey);
        // Burn the setup token — site can only be claimed once
        delete_option('ignyous_bl_setup_token');

        return new \WP_REST_Response([
            'success'   => true,
            'message'   => 'Site claimed. API key stored.',
            'site_url'  => home_url(),
            'site_name' => get_bloginfo('name'),
        ]);
    }

    public function verify(\WP_REST_Request $req): \WP_REST_Response {
        return new \WP_REST_Response([
            'success' => true,
            'data'    => [
                'plugin_version' => IGNYOUS_BL_VERSION,
                'site_url'       => home_url(),
                'site_name'      => get_bloginfo('name'),
                'wp_version'     => get_bloginfo('version'),
                'theme'          => wp_get_theme()->get('Name'),
            ],
        ]);
    }
}
