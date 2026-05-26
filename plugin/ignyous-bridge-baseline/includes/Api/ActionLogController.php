<?php
namespace Ignyous\Baseline\Api;

use Ignyous\Baseline\Auth;
use Ignyous\Baseline\ActionLog;

class ActionLogController {

    public function register(): void {
        register_rest_route('ignyous/v1', '/actions', [
            'methods'             => 'GET',
            'permission_callback' => [Auth::class, 'check'],
            'callback'            => [$this, 'list'],
            'args'                => ['limit' => ['type' => 'integer', 'default' => 50]],
        ]);
    }

    public function list(\WP_REST_Request $req): \WP_REST_Response {
        $limit = (int) ($req->get_param('limit') ?: 50);
        return new \WP_REST_Response(['actions' => ActionLog::list($limit)]);
    }
}
