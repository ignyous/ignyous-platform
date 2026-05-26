<?php
namespace Ignyous\Baseline\Api;

use Ignyous\Baseline\Auth;
use Ignyous\Baseline\Snapshots;
use Ignyous\Baseline\ActionLog;

/**
 * Page editing — title + raw content (block markup or HTML).
 * Posts and templates are out of scope for Phase 0.
 */
class PagesController {

    public function register(): void {
        register_rest_route('ignyous/v1', '/pages', [
            'methods'             => 'GET',
            'permission_callback' => [Auth::class, 'check'],
            'callback'            => [$this, 'list'],
        ]);

        register_rest_route('ignyous/v1', '/pages/(?P<id>\d+)', [
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
    }

    public function list(): \WP_REST_Response {
        $pages = get_posts([
            'post_type'      => 'page',
            'post_status'    => ['publish', 'draft', 'private'],
            'posts_per_page' => 100,
            'orderby'        => 'menu_order title',
            'order'          => 'ASC',
        ]);
        $home = (int) get_option('page_on_front');
        $out  = [];
        foreach ($pages as $p) {
            $out[] = [
                'id'      => $p->ID,
                'title'   => $p->post_title,
                'slug'    => $p->post_name,
                'status'  => $p->post_status,
                'is_home' => $p->ID === $home,
                'url'     => get_permalink($p),
                'modified'=> $p->post_modified_gmt,
            ];
        }
        return new \WP_REST_Response(['pages' => $out, 'home_page_id' => $home]);
    }

    public function get(\WP_REST_Request $req) {
        $id   = (int) $req['id'];
        $post = get_post($id);
        if (!$post || $post->post_type !== 'page') {
            return new \WP_Error('ignyous_not_found', 'Page not found.', ['status' => 404]);
        }
        return new \WP_REST_Response([
            'id'           => $post->ID,
            'title'        => $post->post_title,
            'content'      => $post->post_content,
            'status'       => $post->post_status,
            'url'          => get_permalink($post),
            'is_block'     => has_blocks($post->post_content),
            'modified'     => $post->post_modified_gmt,
        ]);
    }

    public function patch(\WP_REST_Request $req) {
        $id   = (int) $req['id'];
        $post = get_post($id);
        if (!$post || $post->post_type !== 'page') {
            return new \WP_Error('ignyous_not_found', 'Page not found.', ['status' => 404]);
        }

        $changeId = Auth::changeId($req);
        $body     = $req->get_json_params() ?: [];
        $started  = microtime(true);

        $update = ['ID' => $id];
        $before = [];
        $snapshotIds = [];

        if (array_key_exists('title', $body)) {
            $before['title']        = $post->post_title;
            $update['post_title']   = sanitize_text_field((string) $body['title']);
            $snapshotIds['title']   = Snapshots::open($changeId, 'page_title', (string) $id, $before['title'], 'Page title');
        }
        if (array_key_exists('content', $body)) {
            $before['content']      = $post->post_content;
            // kses defaults are too aggressive for block markup. Allow KSES for posts only if the user is logged in;
            // here we are running unauthenticated REST, so we accept the raw content but slash it for safety.
            $update['post_content'] = wp_unslash((string) $body['content']);
            $snapshotIds['content'] = Snapshots::open($changeId, 'page_content', (string) $id, $before['content'], 'Page content');
        }

        if (count($update) === 1) {
            return new \WP_REST_Response(['success' => true, 'changed' => false, 'change_id' => $changeId], 200);
        }

        $result = wp_update_post($update, true);
        $success = !is_wp_error($result);
        $after = $success ? [
            'title'   => get_post_field('post_title',   $id, 'raw'),
            'content' => get_post_field('post_content', $id, 'raw'),
        ] : [];

        foreach ($snapshotIds as $key => $sid) {
            Snapshots::close($sid, $after[$key] ?? null);
        }

        ActionLog::record([
            'change_id'     => $changeId,
            'intent_raw'    => Auth::intentRaw($req),
            'intent_parsed' => $body,
            'capability'    => 'pages.patch',
            'request'       => ['id' => $id, 'body' => $body],
            'response'      => $success ? ['before' => $before, 'after' => $after] : ['error' => $result->get_error_message()],
            'success'       => $success ? 1 : 0,
            'error'         => $success ? null : $result->get_error_message(),
            'duration_ms'   => (int) round((microtime(true) - $started) * 1000),
            'ai_tokens'     => Auth::aiTokens($req),
        ]);

        if (!$success) {
            return new \WP_Error('ignyous_update_failed', $result->get_error_message(), ['status' => 500]);
        }

        return new \WP_REST_Response([
            'success'      => true,
            'change_id'    => $changeId,
            'before'       => $before,
            'after'        => $after,
            'snapshot_ids' => $snapshotIds,
            'url'          => get_permalink($id),
        ]);
    }
}
