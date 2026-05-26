<?php
namespace Ignyous\Baseline\Api;

use Ignyous\Baseline\Auth;
use Ignyous\Baseline\Snapshots;
use Ignyous\Baseline\ActionLog;

/**
 * Phase 2 — Per-block edits via Gutenberg's own parser.
 *
 *   GET   /pages/{id}/blocks           → flat indexed list with paths
 *   PATCH /pages/{id}/blocks           → body { path, op: {...} }
 *
 * Path format: dotted integer path. "2" = third top-level block.
 * "2.1" = second innerBlock of the third top-level block. "2.1.0" → and so on.
 *
 * Supported ops (Phase 2):
 *   { "type": "set_text",  "value": "..." }   — replaces visible text of heading|paragraph|button|list-item
 *   { "type": "set_attr",  "name": "...", "value": "..." } — sets a block attr (e.g. level, url, alt)
 *   { "type": "set_html",  "value": "..." }   — replaces the block's innerHTML wholesale (advanced)
 *
 * Snapshots: we snapshot the whole post_content (existing 'page_content' type → free undo).
 */
class BlocksController {

    /** Block types whose text we know how to edit safely. */
    const TEXT_EDITABLE = [
        'core/heading', 'core/paragraph', 'core/button', 'core/list-item',
        'core/quote', 'core/preformatted', 'core/verse',
    ];

    public function register(): void {
        register_rest_route('ignyous/v1', '/pages/(?P<id>\d+)/blocks', [
            [
                'methods'             => 'GET',
                'permission_callback' => [Auth::class, 'check'],
                'callback'            => [$this, 'listBlocks'],
            ],
            [
                'methods'             => 'PATCH',
                'permission_callback' => [Auth::class, 'check'],
                'callback'            => [$this, 'patchBlock'],
            ],
        ]);
    }

    // ----------------------------------------------------------------- list

    public function listBlocks(\WP_REST_Request $req) {
        $postId = (int) $req['id'];
        $post   = get_post($postId);
        if (!$post) return new \WP_Error('ignyous_page_not_found', 'Page not found.', ['status' => 404]);

        $blocks = parse_blocks($post->post_content);
        $flat   = [];
        $this->flatten($blocks, '', $flat, 0);

        return new \WP_REST_Response([
            'page_id' => $postId,
            'count'   => count($flat),
            'blocks'  => $flat,
        ]);
    }

    /**
     * Walk the nested block tree, emit a flat list with dotted paths.
     * Each entry: { path, type, text, attrs, has_inner, depth }
     */
    private function flatten(array $blocks, string $prefix, array &$out, int $depth): void {
        foreach ($blocks as $i => $b) {
            // parse_blocks emits empty-name entries for raw HTML / whitespace between blocks — skip them
            if (empty($b['blockName'])) {
                if (!empty($b['innerBlocks'])) {
                    // Shouldn't happen, but defensive
                    $this->flatten($b['innerBlocks'], $prefix === '' ? (string) $i : $prefix . '.' . $i, $out, $depth + 1);
                }
                continue;
            }
            $path = $prefix === '' ? (string) $i : $prefix . '.' . $i;
            $out[] = [
                'path'      => $path,
                'type'      => $b['blockName'],
                'text'      => $this->extractText($b),
                'attrs'     => $b['attrs'] ?? new \stdClass(),
                'has_inner' => !empty($b['innerBlocks']),
                'depth'     => $depth,
            ];
            if (!empty($b['innerBlocks'])) {
                $this->flatten($b['innerBlocks'], $path, $out, $depth + 1);
            }
        }
    }

    /** Best-effort extraction of human-visible text from a block, capped at 200 chars. */
    private function extractText(array $b): string {
        $html = $b['innerHTML'] ?? '';
        if (!$html && !empty($b['innerContent'])) {
            $html = implode('', array_filter($b['innerContent'], 'is_string'));
        }
        $text = trim(wp_strip_all_tags($html));
        return mb_substr($text, 0, 200);
    }

    // ---------------------------------------------------------------- patch

    public function patchBlock(\WP_REST_Request $req) {
        $postId   = (int) $req['id'];
        $changeId = Auth::changeId($req);
        $started  = microtime(true);
        $body     = $req->get_json_params() ?: [];

        $path = isset($body['path']) ? (string) $body['path'] : '';
        $op   = isset($body['op']) && is_array($body['op']) ? $body['op'] : null;

        if ($path === '' || !$op || empty($op['type'])) {
            return $this->fail($changeId, 'blocks.patch', $started, 'missing_fields', ['have' => array_keys($body)]);
        }

        $post = get_post($postId);
        if (!$post) return $this->fail($changeId, 'blocks.patch', $started, 'page_not_found', ['id' => $postId]);

        $beforeContent = (string) $post->post_content;
        $blocks = parse_blocks($beforeContent);

        $target = &$this->resolvePath($blocks, $path);
        if ($target === null) {
            return $this->fail($changeId, 'blocks.patch', $started, 'block_path_not_found', ['path' => $path]);
        }

        $opType  = (string) $op['type'];
        $opError = null;

        switch ($opType) {
            case 'set_text': {
                $val = isset($op['value']) ? (string) $op['value'] : '';
                $opError = $this->setBlockText($target, $val);
                break;
            }
            case 'set_attr': {
                $name  = isset($op['name'])  ? (string) $op['name']  : '';
                $value = $op['value'] ?? null;
                if (!$name) { $opError = 'missing_attr_name'; break; }
                if (!is_array($target['attrs'])) $target['attrs'] = [];
                if ($value === null || $value === '') {
                    unset($target['attrs'][$name]);
                } else {
                    $target['attrs'][$name] = $value;
                }
                break;
            }
            case 'set_html': {
                $val = isset($op['value']) ? (string) $op['value'] : '';
                $target['innerHTML'] = $val;
                $target['innerContent'] = [$val];
                break;
            }
            default:
                $opError = 'unknown_op_type';
        }

        if ($opError) {
            return $this->fail($changeId, 'blocks.patch', $started, $opError, ['path' => $path, 'op' => $op, 'block_type' => $target['blockName'] ?? null]);
        }

        $afterContent = serialize_blocks($blocks);

        // Open snapshot AFTER we know we'll write
        $snapId = Snapshots::open($changeId, 'page_content', (string) $postId, $beforeContent, 'Block patch (' . $path . ' / ' . $opType . ')');
        $r = wp_update_post(['ID' => $postId, 'post_content' => wp_slash($afterContent)], true);
        if (is_wp_error($r)) {
            Snapshots::close($snapId, $beforeContent);
            return $this->fail($changeId, 'blocks.patch', $started, 'wp_update_post_failed', ['detail' => $r->get_error_message()]);
        }
        $afterSaved = get_post_field('post_content', $postId, 'raw');
        Snapshots::close($snapId, $afterSaved);

        $duration = (int) round((microtime(true) - $started) * 1000);
        ActionLog::record([
            'change_id'     => $changeId,
            'intent_raw'    => Auth::intentRaw($req),
            'intent_parsed' => ['path' => $path, 'op' => $op],
            'capability'    => 'blocks.patch',
            'request'       => ['post_id' => $postId, 'path' => $path, 'op' => $op],
            'response'      => [
                'block_type'  => $target['blockName'] ?? null,
                'snapshot_id' => $snapId,
                'bytes_before'=> strlen($beforeContent),
                'bytes_after' => strlen($afterSaved),
            ],
            'success'       => 1,
            'duration_ms'   => $duration,
            'ai_tokens'     => Auth::aiTokens($req),
        ]);

        return new \WP_REST_Response([
            'success'     => true,
            'change_id'   => $changeId,
            'path'        => $path,
            'block_type'  => $target['blockName'] ?? null,
            'snapshot_id' => $snapId,
            'preview'     => $this->extractText($target),
        ]);
    }

    /**
     * Walk a dotted path into the (nested) block array and return a reference.
     * Returns null (by reference) if not found.
     */
    private function &resolvePath(array &$blocks, string $path) {
        $null = null;
        $parts = array_map('intval', explode('.', $path));
        $current = &$blocks;
        $node = null;
        foreach ($parts as $depth => $idx) {
            // Re-key non-block-name entries away so the index aligns with what we emitted in listBlocks
            $named = [];
            foreach ($current as $k => &$b) {
                if (!empty($b['blockName'])) $named[] = &$b;
            }
            unset($b);

            if (!isset($named[$idx])) return $null;
            $node = &$named[$idx];

            if ($depth === count($parts) - 1) {
                return $node;
            }
            if (empty($node['innerBlocks']) || !is_array($node['innerBlocks'])) return $null;
            $current = &$node['innerBlocks'];
        }
        return $null;
    }

    /**
     * Replace the visible text in a text-editable block. Returns null on success,
     * or an error string. Strategy: locate the inner element of the type we expect
     * (h1-h6, p, a.wp-block-button__link, li) and swap its text node, preserving the wrapper.
     */
    private function setBlockText(array &$block, string $newText): ?string {
        $type = $block['blockName'] ?? '';
        if (!in_array($type, self::TEXT_EDITABLE, true)) {
            return 'block_type_not_text_editable:' . $type;
        }
        $html = $block['innerHTML'] ?? '';
        if (!$html && !empty($block['innerContent'])) {
            $html = implode('', array_filter($block['innerContent'], 'is_string'));
        }
        // Escape user input the same way Gutenberg does — encode <, >, & but keep simple text
        $escaped = esc_html($newText);

        $newHtml = null;
        switch ($type) {
            case 'core/heading': {
                // <h2 ...>TEXT</h2>  level lives in attrs.level, default 2
                $newHtml = preg_replace('/(<h[1-6]\b[^>]*>)([\s\S]*?)(<\/h[1-6]>)/i', '${1}' . $escaped . '${3}', $html, 1, $n);
                if (!$n) return 'heading_tag_not_found';
                break;
            }
            case 'core/paragraph': {
                $newHtml = preg_replace('/(<p\b[^>]*>)([\s\S]*?)(<\/p>)/i', '${1}' . $escaped . '${3}', $html, 1, $n);
                if (!$n) return 'paragraph_tag_not_found';
                break;
            }
            case 'core/button': {
                // Button is <div class="wp-block-button"><a class="wp-block-button__link...">TEXT</a></div>
                $newHtml = preg_replace('/(<a\b[^>]*wp-block-button__link[^>]*>)([\s\S]*?)(<\/a>)/i', '${1}' . $escaped . '${3}', $html, 1, $n);
                if (!$n) return 'button_link_not_found';
                break;
            }
            case 'core/list-item': {
                $newHtml = preg_replace('/(<li\b[^>]*>)([\s\S]*?)(<\/li>)/i', '${1}' . $escaped . '${3}', $html, 1, $n);
                if (!$n) return 'list_item_tag_not_found';
                break;
            }
            case 'core/quote':
            case 'core/preformatted':
            case 'core/verse': {
                // These wrap their content in <blockquote>, <pre>, <pre> respectively. We replace only the FIRST
                // text container child if obvious; otherwise fall back to replacing the wrapper's innerHTML.
                $newHtml = preg_replace('/(<(?:blockquote|pre)\b[^>]*>)([\s\S]*?)(<\/(?:blockquote|pre)>)/i', '${1}' . $escaped . '${3}', $html, 1, $n);
                if (!$n) return 'wrapper_not_found';
                break;
            }
            default:
                return 'unsupported_block_type:' . $type;
        }

        $block['innerHTML']    = $newHtml;
        $block['innerContent'] = [$newHtml];
        return null;
    }

    // -------------------------------------------------------------- helpers

    private function fail(string $changeId, string $capability, float $started, string $error, array $detail = []): \WP_REST_Response {
        $duration = (int) round((microtime(true) - $started) * 1000);
        ActionLog::record([
            'change_id'   => $changeId,
            'capability'  => $capability,
            'request'     => $detail,
            'response'    => ['error' => $error, 'detail' => $detail],
            'success'     => 0,
            'error'       => $error,
            'duration_ms' => $duration,
        ]);
        return new \WP_REST_Response([
            'success'   => false,
            'change_id' => $changeId,
            'error'     => $error,
            'detail'    => $detail,
        ], 400);
    }
}
