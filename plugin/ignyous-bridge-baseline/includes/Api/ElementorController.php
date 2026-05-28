<?php
namespace Ignyous\Baseline\Api;

use Ignyous\Baseline\Auth;

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

    public function register(): void {
        register_rest_route('ignyous/v1', '/pages/(?P<id>\d+)/elementor', [
            'methods'             => 'GET',
            'permission_callback' => [Auth::class, 'check'],
            'callback'            => [$this, 'listElements'],
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
