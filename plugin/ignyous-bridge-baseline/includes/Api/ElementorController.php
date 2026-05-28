<?php
namespace Ignyous\Baseline\Api;

use Ignyous\Baseline\Auth;
use Ignyous\Baseline\Snapshots;
use Ignyous\Baseline\ActionLog;

/**
 * Phase 6B — Read the Elementor element tree of a page.
 *
 *   GET /pages/{id}/elementor  → { built_with_elementor, count, elements: [...] }
 *
 * Elementor stores its data as JSON in the `_elementor_data` post meta:
 *   [ { id, elType:'section'|'column'|'container'|'widget', widgetType?, settings:{}, elements:[] }, ... ]
 *
 * We flatten it to a list parallel to the Gutenberg /blocks endpoint:
 *   { path, id, elType, widgetType, label, text, depth, setting_keys, has_inner }
 *
 * Addressing: Elementor element `id`s are stable 7-char hashes — the preferred
 * key for later patching (survives reorders). We ALSO emit a dotted positional
 * `path` (e.g. "0.1.2") for parity with /blocks and for positional resolution.
 *
 * This phase is READ ONLY. Patching arrives in 6C (text) / 6D (styles).
 */
class ElementorController {

    const DATA_META_KEY = '_elementor_data';
    const MODE_META_KEY = '_elementor_edit_mode';

    /**
     * Widget text-content settings keys, in priority order. The first present
     * non-empty one becomes the element's `text` preview. Repeater keys
     * (value is an array of rows) are handled specially below.
     */
    const TEXT_KEYS = [
        'title',              // heading, many widgets
        'editor',             // text-editor (HTML)
        'text',               // button, icon-list rows
        'title_text',         // icon-box, image-box
        'description_text',   // icon-box, image-box
        'testimonial_content',// testimonial
        'testimonial_name',   // testimonial
        'alert_title',        // alert
        'alert_description',  // alert
        'description',        // generic
        'caption',            // image
    ];

    /** Repeater settings whose rows hold text (key => [row text fields]). */
    const REPEATER_TEXT = [
        'tabs'      => ['tab_title', 'tab_content'],   // tabs, accordion, toggle
        'icon_list' => ['text'],                        // icon-list
    ];

    /**
     * Primary editable text setting per widget type (the one a bare
     * "change the X to Y" should target). Widgets with a secondary field
     * (e.g. icon-box description) can be reached with op.field.
     * Value: [primary_key, is_html].
     */
    const PRIMARY_TEXT = [
        'heading'       => ['title', false],
        'text-editor'   => ['editor', true],
        'button'        => ['text', false],
        'icon-box'      => ['title_text', false],
        'image-box'     => ['title_text', false],
        'testimonial'   => ['testimonial_content', false],
        'alert'         => ['alert_title', false],
        'call-to-action'=> ['title', false],
        'icon-list'     => ['__repeater_icon_list', false], // handled specially
    ];

    /** Which secondary fields are allowed via op.field, per widget (field => is_html). */
    const ALLOWED_FIELDS = [
        'heading'     => ['title' => false],
        'text-editor' => ['editor' => true],
        'button'      => ['text' => false],
        'icon-box'    => ['title_text' => false, 'description_text' => true],
        'image-box'   => ['title_text' => false, 'description_text' => true],
        'testimonial' => ['testimonial_content' => true, 'testimonial_name' => false, 'testimonial_job' => false],
        'alert'       => ['alert_title' => false, 'alert_description' => true],
        'call-to-action' => ['title' => false, 'description' => true],
    ];

    public function register(): void {
        register_rest_route('ignyous/v1', '/pages/(?P<id>\d+)/elementor', [
            [
                'methods'             => 'GET',
                'permission_callback' => [Auth::class, 'check'],
                'callback'            => [$this, 'listElements'],
            ],
            [
                'methods'             => 'PATCH',
                'permission_callback' => [Auth::class, 'check'],
                'callback'            => [$this, 'patchElement'],
            ],
        ]);
    }

    public function listElements(\WP_REST_Request $req) {
        $postId = (int) $req['id'];
        $post   = get_post($postId);
        if (!$post) return new \WP_Error('ignyous_page_not_found', 'Page not found.', ['status' => 404]);

        $editMode = get_post_meta($postId, self::MODE_META_KEY, true);
        $rawData  = get_post_meta($postId, self::DATA_META_KEY, true);

        $builtWith = ($editMode === 'builder') && !empty($rawData);
        if (!$builtWith) {
            return new \WP_REST_Response([
                'page_id'               => $postId,
                'built_with_elementor'  => false,
                'edit_mode'             => $editMode ?: null,
                'count'                 => 0,
                'elements'              => [],
                'hint'                  => 'This page is not built with Elementor. Use the Gutenberg /blocks endpoint instead.',
            ]);
        }

        $data = is_string($rawData) ? json_decode($rawData, true) : $rawData;
        if (!is_array($data)) {
            return new \WP_REST_Response([
                'page_id'              => $postId,
                'built_with_elementor' => true,
                'count'                => 0,
                'elements'             => [],
                'error'                => 'elementor_data_unparseable',
            ], 200);
        }

        $flat = [];
        $this->flatten($data, '', $flat, 0);

        return new \WP_REST_Response([
            'page_id'              => $postId,
            'built_with_elementor' => true,
            'elementor_version'    => defined('ELEMENTOR_VERSION') ? ELEMENTOR_VERSION : null,
            'count'                => count($flat),
            'elements'             => $flat,
        ]);
    }

    // ---------------------------------------------------------------- patch

    public function patchElement(\WP_REST_Request $req) {
        $postId   = (int) $req['id'];
        $changeId = Auth::changeId($req);
        $started  = microtime(true);
        $body     = $req->get_json_params() ?: [];

        $target = isset($body['target']) && is_array($body['target']) ? $body['target'] : null;
        $op     = isset($body['op']) && is_array($body['op']) ? $body['op'] : null;

        if (!$target || !$op || empty($op['type'])) {
            return $this->fail($changeId, 'elementor.patch', $started, 'missing_fields', ['have' => array_keys($body)]);
        }
        if ($op['type'] !== 'set_text') {
            return $this->fail($changeId, 'elementor.patch', $started, 'unsupported_op', ['op' => $op['type']]);
        }

        $post = get_post($postId);
        if (!$post) return $this->fail($changeId, 'elementor.patch', $started, 'page_not_found', ['id' => $postId]);

        $rawBefore = get_post_meta($postId, self::DATA_META_KEY, true);
        $tree = is_string($rawBefore) ? json_decode($rawBefore, true) : $rawBefore;
        if (!is_array($tree)) {
            return $this->fail($changeId, 'elementor.patch', $started, 'elementor_data_unparseable');
        }

        // Locate the element (by id preferred, else by path)
        $found = $this->locate($tree, $target);
        if ($found === null) {
            return $this->fail($changeId, 'elementor.patch', $started, 'element_not_found', ['target' => $target]);
        }
        // $found is a reference into $tree
        $widgetType = isset($found['widgetType']) ? (string) $found['widgetType'] : '';
        if ($found['elType'] !== 'widget' || $widgetType === '') {
            return $this->fail($changeId, 'elementor.patch', $started, 'not_a_widget', ['elType' => $found['elType'] ?? null]);
        }

        // Determine which settings field to write
        $newText = (string) ($op['value'] ?? '');
        $field   = isset($op['field']) ? (string) $op['field'] : null;
        [$writeKey, $isHtml, $fieldErr] = $this->resolveField($widgetType, $field);
        if ($fieldErr) {
            return $this->fail($changeId, 'elementor.patch', $started, $fieldErr, ['widgetType' => $widgetType, 'field' => $field]);
        }

        // Sanitize value: HTML fields get wp_kses_post, plain fields get sanitize_text_field
        $clean = $isHtml ? wp_kses_post($newText) : sanitize_text_field($newText);

        if (!isset($found['settings']) || !is_array($found['settings'])) $found['settings'] = [];
        $found['settings'][$writeKey] = $clean;

        // Re-encode the whole tree (must be JSON string, slashed)
        $jsonAfter = wp_json_encode($tree);

        // Snapshot before/after via dedicated elementor_data restore type
        $snapId = Snapshots::open($changeId, 'elementor_data', (string) $postId, is_string($rawBefore) ? $rawBefore : wp_json_encode($rawBefore), 'Elementor element text (' . $widgetType . ')');
        update_metadata('post', $postId, self::DATA_META_KEY, wp_slash($jsonAfter));
        Snapshots::close($snapId, $jsonAfter);

        $this->clearElementorCache();

        $duration = (int) round((microtime(true) - $started) * 1000);
        ActionLog::record([
            'change_id'     => $changeId,
            'intent_raw'    => Auth::intentRaw($req),
            'intent_parsed' => ['target' => $target, 'op' => $op],
            'capability'    => 'elementor.patch',
            'request'       => ['post_id' => $postId, 'target' => $target, 'op' => $op, 'write_key' => $writeKey],
            'response'      => ['widget_type' => $widgetType, 'snapshot_id' => $snapId, 'is_html' => $isHtml],
            'success'       => 1,
            'duration_ms'   => $duration,
            'ai_tokens'     => Auth::aiTokens($req),
        ]);

        return new \WP_REST_Response([
            'success'     => true,
            'change_id'   => $changeId,
            'widget_type' => $widgetType,
            'write_key'   => $writeKey,
            'snapshot_id' => $snapId,
            'preview'     => mb_substr(trim(wp_strip_all_tags($clean)), 0, 120),
        ]);
    }

    /**
     * Resolve which settings key to write for a widget + optional explicit field.
     * Returns [writeKey, isHtml, errorStringOrNull].
     */
    private function resolveField(string $widgetType, ?string $field): array {
        if ($field !== null && $field !== '') {
            $allowed = self::ALLOWED_FIELDS[$widgetType] ?? null;
            if ($allowed === null || !array_key_exists($field, $allowed)) {
                return [null, false, 'field_not_allowed_for_widget'];
            }
            return [$field, (bool) $allowed[$field], null];
        }
        $primary = self::PRIMARY_TEXT[$widgetType] ?? null;
        if ($primary === null) {
            return [null, false, 'widget_text_not_editable'];
        }
        if ($primary[0] === '__repeater_icon_list') {
            return [null, false, 'repeater_edit_not_supported_in_6c'];
        }
        return [$primary[0], (bool) $primary[1], null];
    }

    /**
     * Find an element in the tree by target {by:'id',id} or {by:'path',path}.
     * Returns a REFERENCE to the element array, or null.
     */
    private function &locate(array &$tree, array $target) {
        $null = null;
        $by = $target['by'] ?? (isset($target['id']) ? 'id' : (isset($target['path']) ? 'path' : null));

        if ($by === 'id') {
            $id = (string) ($target['id'] ?? '');
            if ($id === '') return $null;
            $ref = &$this->findById($tree, $id);
            return $ref;
        }
        if ($by === 'path') {
            $path = (string) ($target['path'] ?? '');
            if ($path === '') return $null;
            $ref = &$this->findByPath($tree, $path);
            return $ref;
        }
        return $null;
    }

    private function &findById(array &$elements, string $id) {
        $null = null;
        foreach ($elements as &$el) {
            if (!is_array($el)) continue;
            if (isset($el['id']) && (string) $el['id'] === $id) {
                return $el;
            }
            if (!empty($el['elements']) && is_array($el['elements'])) {
                $ref = &$this->findById($el['elements'], $id);
                if ($ref !== null) return $ref;
            }
        }
        return $null;
    }

    private function &findByPath(array &$elements, string $path) {
        $null = null;
        $parts = array_map('intval', explode('.', $path));
        $current = &$elements;
        $node = null;
        foreach ($parts as $depth => $idx) {
            // Re-index to only count valid elements (parity with flatten which skips invalid)
            $valid = [];
            foreach ($current as $k => &$e) {
                if (is_array($e) && !empty($e['elType'])) $valid[] = &$e;
            }
            unset($e);
            if (!isset($valid[$idx])) return $null;
            $node = &$valid[$idx];
            if ($depth === count($parts) - 1) return $node;
            if (empty($node['elements']) || !is_array($node['elements'])) return $null;
            $current = &$node['elements'];
        }
        return $null;
    }

    private function clearElementorCache(): void {
        if (class_exists('\\Elementor\\Plugin') && isset(\Elementor\Plugin::$instance->files_manager)) {
            try { \Elementor\Plugin::$instance->files_manager->clear_cache(); } catch (\Throwable $e) {}
        }
        if (function_exists('delete_post_meta_by_key')) {
            delete_post_meta_by_key('_elementor_css');
            delete_post_meta_by_key('_elementor_element_cache');
        }
    }

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
        return new \WP_REST_Response(['success' => false, 'change_id' => $changeId, 'error' => $error, 'detail' => $detail], 400);
    }

    // --------------------------------------------------------------- read helpers

    /**
     * Walk the nested element tree, emitting a flat list with dotted paths.
     */
    private function flatten(array $elements, string $prefix, array &$out, int $depth): void {
        foreach ($elements as $i => $el) {
            if (!is_array($el) || empty($el['elType'])) continue;

            $path       = $prefix === '' ? (string) $i : $prefix . '.' . $i;
            $elType     = (string) $el['elType'];
            $widgetType = isset($el['widgetType']) ? (string) $el['widgetType'] : null;
            $settings   = isset($el['settings']) && is_array($el['settings']) ? $el['settings'] : [];

            $out[] = [
                'path'         => $path,
                'id'           => isset($el['id']) ? (string) $el['id'] : null,
                'elType'       => $elType,
                'widgetType'   => $widgetType,
                'label'        => $this->humanLabel($elType, $widgetType),
                'text'         => $this->extractText($settings),
                'depth'        => $depth,
                'has_inner'    => !empty($el['elements']),
                'setting_keys' => array_slice(array_keys($settings), 0, 40),
            ];

            if (!empty($el['elements']) && is_array($el['elements'])) {
                $this->flatten($el['elements'], $path, $out, $depth + 1);
            }
        }
    }

    /** Human-friendly label: 'Heading', 'Button', 'Section', 'Container', 'Column'. */
    private function humanLabel(string $elType, ?string $widgetType): string {
        if ($elType === 'widget' && $widgetType) {
            return ucwords(str_replace(['-', '_'], ' ', $widgetType));
        }
        return ucfirst($elType);
    }

    /** Best-effort visible text for an element, capped at 200 chars. */
    private function extractText(array $settings): string {
        // Plain text keys first
        foreach (self::TEXT_KEYS as $key) {
            if (!empty($settings[$key]) && is_string($settings[$key])) {
                $text = trim(wp_strip_all_tags($settings[$key]));
                if ($text !== '') return mb_substr($text, 0, 200);
            }
        }
        // Repeater rows (tabs, icon-list, etc.)
        foreach (self::REPEATER_TEXT as $rptKey => $fields) {
            if (!empty($settings[$rptKey]) && is_array($settings[$rptKey])) {
                $pieces = [];
                foreach ($settings[$rptKey] as $row) {
                    if (!is_array($row)) continue;
                    foreach ($fields as $f) {
                        if (!empty($row[$f]) && is_string($row[$f])) {
                            $pieces[] = trim(wp_strip_all_tags($row[$f]));
                        }
                    }
                }
                $joined = trim(implode(' · ', array_filter($pieces)));
                if ($joined !== '') return mb_substr($joined, 0, 200);
            }
        }
        return '';
    }
}
