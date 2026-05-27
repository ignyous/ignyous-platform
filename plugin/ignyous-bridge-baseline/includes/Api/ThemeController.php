<?php
namespace Ignyous\Baseline\Api;

use Ignyous\Baseline\Auth;
use Ignyous\Baseline\ActionLog;
use Ignyous\Baseline\Themes\ThemeDispatcher;

/**
 * Global theme styles. Phase 5 routes through ThemeDispatcher which picks the
 * right per-theme adapter (Astra, Kadence, BlockTheme, or Unsupported).
 *
 *   GET  /theme/styles   — current values + supported capabilities
 *   PATCH /theme/styles  — apply { primary_color, text_color, background_color, link_color, heading_font, body_font }
 *   GET  /theme/info     — debug: which adapter is active and why
 */
class ThemeController {

    public function register(): void {
        register_rest_route('ignyous/v1', '/theme/styles', [
            [
                'methods'             => 'GET',
                'permission_callback' => [Auth::class, 'check'],
                'callback'            => [$this, 'get'],
            ],
            [
                'methods'             => 'PATCH',
                'permission_callback' => [Auth::class, 'check'],
                'callback'            => [$this, 'patch'],
            ],
        ]);
        register_rest_route('ignyous/v1', '/theme/info', [
            'methods'             => 'GET',
            'permission_callback' => [Auth::class, 'check'],
            'callback'            => [$this, 'info'],
        ]);
    }

    public function get(): \WP_REST_Response {
        $dispatcher = new ThemeDispatcher();
        $adapter    = $dispatcher->pick();
        $state      = $adapter->read();
        return new \WP_REST_Response([
            'adapter' => [
                'slug'         => $adapter->slug(),
                'name'         => $adapter->name(),
                'capabilities' => $adapter->capabilities(),
            ],
            'current' => $state['current'],
            'raw'     => $state['raw'],
            // Back-compat: keep the is_block_theme flag the platform UI checks
            'is_block_theme' => function_exists('wp_is_block_theme') && wp_is_block_theme(),
        ]);
    }

    public function patch(\WP_REST_Request $req) {
        $changeId   = Auth::changeId($req);
        $body       = $req->get_json_params() ?: [];
        $started    = microtime(true);

        $dispatcher = new ThemeDispatcher();
        $adapter    = $dispatcher->pick();

        // Filter body to only the keys this adapter actually supports so we
        // return clean "not_supported" errors instead of silently dropping
        $caps       = $adapter->capabilities();
        $supported  = [];
        $rejected   = [];
        foreach ($body as $k => $v) {
            if (!empty($caps[$k])) $supported[$k] = $v;
            else                   $rejected[$k]  = 'not_supported_by_' . $adapter->slug();
        }

        $result = $supported
            ? $adapter->patch($supported, $changeId)
            : ['applied' => [], 'errors' => [], 'snapshot_ids' => [], 'current' => $adapter->read()['current'], 'success' => true];

        $errors = array_merge($rejected, $result['errors'] ?? []);
        $ok     = !empty($result['success']) && empty($errors);

        $duration = (int) round((microtime(true) - $started) * 1000);
        ActionLog::record([
            'change_id'     => $changeId,
            'intent_raw'    => Auth::intentRaw($req),
            'intent_parsed' => $body,
            'capability'    => 'theme.patch',
            'request'       => ['adapter' => $adapter->slug(), 'body' => $body],
            'response'      => [
                'applied'      => $result['applied'] ?? [],
                'errors'       => $errors,
                'snapshot_ids' => $result['snapshot_ids'] ?? [],
            ],
            'success'       => $ok ? 1 : 0,
            'error'         => $ok ? null : (string) array_key_first($errors),
            'duration_ms'   => $duration,
            'ai_tokens'     => Auth::aiTokens($req),
        ]);

        return new \WP_REST_Response([
            'success'      => $ok,
            'change_id'    => $changeId,
            'adapter'      => $adapter->slug(),
            'applied'      => $result['applied'] ?? [],
            'errors'       => $errors,
            'snapshot_ids' => $result['snapshot_ids'] ?? [],
            'current'      => $result['current'] ?? [],
            'message'      => $result['message'] ?? null,
        ], $ok ? 200 : 200); // We return 200 even on partial errors so the platform can render them next to applied keys
    }

    public function info(): \WP_REST_Response {
        $dispatcher = new ThemeDispatcher();
        return new \WP_REST_Response($dispatcher->info());
    }
}
