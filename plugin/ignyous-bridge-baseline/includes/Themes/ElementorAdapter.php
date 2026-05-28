<?php
namespace Ignyous\Baseline\Themes;

use Ignyous\Baseline\Snapshots;

/**
 * Elementor adapter.
 *
 * Elementor is a PLUGIN, not a theme, but its "Kit" (global styles) sit at the
 * top of the cascade for any page built with Elementor. So when Elementor is
 * active we route theme.patch through the active kit's settings instead of
 * the underlying theme's storage.
 *
 * The Kit is a regular Elementor document (`elementor_library` post type with
 * meta `_elementor_template_type = 'kit'`). Its settings live in the post meta
 * `_elementor_page_settings` as a serialized PHP array. Defaults are merged in
 * at read time by Elementor's controls system, so the stored value can be a
 * sparse array; we always write the FULL system_colors / system_typography
 * repeater to avoid merge gaps.
 *
 * Mappings (generic capability → kit setting key):
 *   primary_color    → system_colors[_id=primary].color  +  h1_color..h6_color
 *   text_color       → system_colors[_id=text].color     +  body_color
 *   background_color → body_background_background='classic' + body_background_color
 *   link_color       → system_colors[_id=accent].color   +  link_normal_color
 *   heading_font     → system_typography[_id=primary].typography_font_family
 *                       + h1..h6 typography_font_family
 *   body_font        → system_typography[_id=text].typography_font_family
 *                       + body_typography_font_family
 *
 * Snapshots: we use 'post_meta' restore type with key '{kit_id}|_elementor_page_settings'
 * so undo is one-shot and the existing SnapshotController code path handles it.
 *
 * After write, we clear Elementor's CSS cache via Plugin::$instance->files_manager
 * so the next page load regenerates with the new values.
 */
class ElementorAdapter extends ThemeAdapter {

    const KIT_META_KEY = '_elementor_page_settings';

    /** Default system_colors when the kit has never been customized. From elementor/core/kits/documents/tabs/global-colors.php. */
    const DEFAULT_SYSTEM_COLORS = [
        ['_id' => 'primary',   'title' => 'Primary',   'color' => '#6EC1E4'],
        ['_id' => 'secondary', 'title' => 'Secondary', 'color' => '#54595F'],
        ['_id' => 'text',      'title' => 'Text',      'color' => '#7A7A7A'],
        ['_id' => 'accent',    'title' => 'Accent',    'color' => '#61CE70'],
    ];

    /** Defaults for system_typography. From elementor/core/kits/documents/tabs/global-typography.php. */
    const DEFAULT_SYSTEM_TYPOGRAPHY = [
        ['_id' => 'primary',   'title' => 'Primary',   'typography_typography' => 'custom', 'typography_font_family' => 'Roboto',      'typography_font_weight' => '600'],
        ['_id' => 'secondary', 'title' => 'Secondary', 'typography_typography' => 'custom', 'typography_font_family' => 'Roboto Slab', 'typography_font_weight' => '400'],
        ['_id' => 'text',      'title' => 'Text',      'typography_typography' => 'custom', 'typography_font_family' => 'Roboto',      'typography_font_weight' => '400'],
        ['_id' => 'accent',    'title' => 'Accent',    'typography_typography' => 'custom', 'typography_font_family' => 'Roboto',      'typography_font_weight' => '500'],
    ];

    public function slug(): string { return 'elementor'; }
    public function name(): string { return 'Elementor (Kit)'; }

    /**
     * Match on Elementor being active — theme doesn't matter. Returns true when
     * Elementor core is loaded AND there's an active kit we can write to.
     * Note: dispatcher should list this adapter FIRST so it wins over theme adapters.
     */
    public function matches(string $stylesheet, string $template): bool {
        if (!defined('ELEMENTOR_VERSION')) return false;
        if (!class_exists('\Elementor\Plugin')) return false;
        return $this->getActiveKitId() > 0;
    }

    public function capabilities(): array {
        return [
            'primary_color'    => true,
            'text_color'       => true,
            'background_color' => true,
            'link_color'       => true,
            'heading_font'     => true,
            'body_font'        => true,
        ];
    }

    public function read(): array {
        $kitId    = $this->getActiveKitId();
        $settings = $this->readKitSettings($kitId);

        $sysColors = $this->ensureRepeater($settings['system_colors'] ?? [], self::DEFAULT_SYSTEM_COLORS);
        $sysTypo   = $this->ensureRepeater($settings['system_typography'] ?? [], self::DEFAULT_SYSTEM_TYPOGRAPHY);

        return [
            'current' => [
                'primary_color'    => $this->colorFromRepeater($sysColors, 'primary'),
                'text_color'       => $settings['body_color'] ?? $this->colorFromRepeater($sysColors, 'text'),
                'background_color' => $this->isClassicBg($settings) ? ($settings['body_background_color'] ?? null) : null,
                'link_color'       => $settings['link_normal_color'] ?? $this->colorFromRepeater($sysColors, 'accent'),
                'heading_font'     => $settings['h1_typography_font_family'] ?? $this->fontFromRepeater($sysTypo, 'primary'),
                'body_font'        => $settings['body_typography_font_family'] ?? $this->fontFromRepeater($sysTypo, 'text'),
            ],
            'raw' => [
                'kit_id'             => $kitId,
                'elementor_version'  => defined('ELEMENTOR_VERSION') ? ELEMENTOR_VERSION : null,
                'pro_version'        => defined('ELEMENTOR_PRO_VERSION') ? ELEMENTOR_PRO_VERSION : null,
                'has_active_kit'     => $kitId > 0,
                'stored_setting_keys'=> array_keys($settings),
            ],
        ];
    }

    public function patch(array $body, string $changeId): array {
        $applied = [];
        $errors  = [];
        $snapIds = [];

        $kitId = $this->getActiveKitId();
        if (!$kitId) {
            foreach (array_keys($body) as $k) $errors[$k] = 'no_active_kit';
            return ['applied' => [], 'errors' => $errors, 'snapshot_ids' => [], 'current' => [], 'success' => false];
        }

        $before = $this->readKitSettings($kitId);
        $next   = $before;

        // Ensure the full repeaters are present (write full arrays — Elementor's repeater
        // merge with defaults is by index, not _id, so partial writes drop entries)
        $next['system_colors']     = $this->ensureRepeater($next['system_colors']     ?? [], self::DEFAULT_SYSTEM_COLORS);
        $next['system_typography'] = $this->ensureRepeater($next['system_typography'] ?? [], self::DEFAULT_SYSTEM_TYPOGRAPHY);

        if (array_key_exists('primary_color', $body)) {
            $v = $this->sanitizeColor($body['primary_color']);
            if ($v) {
                $this->setRepeaterField($next['system_colors'], 'primary', 'color', $v);
                // Theme style headings — set h1..h6 color so non-global widgets pick it up
                for ($i = 1; $i <= 6; $i++) $next['h' . $i . '_color'] = $v;
                $applied['primary_color'] = $v;
            } else $errors['primary_color'] = 'invalid_color';
        }

        if (array_key_exists('text_color', $body)) {
            $v = $this->sanitizeColor($body['text_color']);
            if ($v) {
                $this->setRepeaterField($next['system_colors'], 'text', 'color', $v);
                $next['body_color'] = $v;
                $applied['text_color'] = $v;
            } else $errors['text_color'] = 'invalid_color';
        }

        if (array_key_exists('background_color', $body)) {
            $v = $this->sanitizeColor($body['background_color']);
            if ($v) {
                $next['body_background_background'] = 'classic';
                $next['body_background_color']      = $v;
                $applied['background_color'] = $v;
            } else $errors['background_color'] = 'invalid_color';
        }

        if (array_key_exists('link_color', $body)) {
            $v = $this->sanitizeColor($body['link_color']);
            if ($v) {
                $this->setRepeaterField($next['system_colors'], 'accent', 'color', $v);
                $next['link_normal_color'] = $v;
                $applied['link_color'] = $v;
            } else $errors['link_color'] = 'invalid_color';
        }

        if (array_key_exists('heading_font', $body)) {
            $v = trim((string) $body['heading_font']);
            $this->setRepeaterField($next['system_typography'], 'primary', 'typography_font_family', $v);
            $this->setRepeaterField($next['system_typography'], 'primary', 'typography_typography',  'custom');
            // Theme style — set h1..h6 typography_font_family so legacy widgets w/o globals pick it up
            for ($i = 1; $i <= 6; $i++) {
                $next['h' . $i . '_typography_typography']  = 'custom';
                $next['h' . $i . '_typography_font_family'] = $v;
            }
            $applied['heading_font'] = $v;
        }

        if (array_key_exists('body_font', $body)) {
            $v = trim((string) $body['body_font']);
            $this->setRepeaterField($next['system_typography'], 'text', 'typography_font_family', $v);
            $this->setRepeaterField($next['system_typography'], 'text', 'typography_typography',  'custom');
            $next['body_typography_typography']  = 'custom';
            $next['body_typography_font_family'] = $v;
            $applied['body_font'] = $v;
        }

        // Snapshot the whole kit settings meta as JSON (existing post_meta restore handles it)
        $snapKey   = $kitId . '|' . self::KIT_META_KEY;
        $beforeStr = wp_json_encode($before ?: new \stdClass());
        $snapId    = Snapshots::open($changeId, 'post_meta', $snapKey, $beforeStr, 'Elementor kit settings');
        update_metadata('post', $kitId, self::KIT_META_KEY, wp_slash($next));
        Snapshots::close($snapId, wp_json_encode($next));
        $snapIds[] = $snapId;

        // Clear Elementor's compiled CSS cache so the next page load regenerates
        $this->clearElementorCache();

        $after = $this->readKitSettings($kitId);
        $afterColors = $this->ensureRepeater($after['system_colors']     ?? [], self::DEFAULT_SYSTEM_COLORS);
        $afterTypo   = $this->ensureRepeater($after['system_typography'] ?? [], self::DEFAULT_SYSTEM_TYPOGRAPHY);

        return [
            'applied'      => $applied,
            'errors'       => $errors,
            'snapshot_ids' => $snapIds,
            'current'      => [
                'primary_color'    => $this->colorFromRepeater($afterColors, 'primary'),
                'text_color'       => $after['body_color'] ?? $this->colorFromRepeater($afterColors, 'text'),
                'background_color' => $this->isClassicBg($after) ? ($after['body_background_color'] ?? null) : null,
                'link_color'       => $after['link_normal_color'] ?? $this->colorFromRepeater($afterColors, 'accent'),
                'heading_font'     => $after['h1_typography_font_family'] ?? $this->fontFromRepeater($afterTypo, 'primary'),
                'body_font'        => $after['body_typography_font_family'] ?? $this->fontFromRepeater($afterTypo, 'text'),
            ],
            'success' => empty($errors),
        ];
    }

    // --------------------------------------------------------------- helpers

    private function getActiveKitId(): int {
        // Direct option read — works even when ::$instance isn't bootstrapped (e.g. our REST hits before init)
        $id = (int) get_option('elementor_active_kit', 0);
        if ($id > 0) return $id;
        // Fallback: ask Elementor if it's loaded
        if (class_exists('\Elementor\Plugin') && isset(\Elementor\Plugin::$instance->kits_manager)) {
            return (int) \Elementor\Plugin::$instance->kits_manager->get_active_id();
        }
        return 0;
    }

    private function readKitSettings(int $kitId): array {
        if (!$kitId) return [];
        $v = get_post_meta($kitId, self::KIT_META_KEY, true);
        return is_array($v) ? $v : [];
    }

    /**
     * Make sure a repeater entry for every default _id exists. Preserves any
     * existing user values; fills missing entries with defaults.
     */
    private function ensureRepeater(array $current, array $defaults): array {
        $byId = [];
        foreach ($current as $entry) {
            if (is_array($entry) && isset($entry['_id'])) $byId[(string) $entry['_id']] = $entry;
        }
        $out = [];
        foreach ($defaults as $def) {
            $id = (string) $def['_id'];
            $out[] = isset($byId[$id]) ? array_merge($def, $byId[$id]) : $def;
            unset($byId[$id]);
        }
        // Append any custom entries (user-created colors/fonts not in defaults)
        foreach ($byId as $entry) $out[] = $entry;
        return $out;
    }

    private function colorFromRepeater(array $repeater, string $id): ?string {
        foreach ($repeater as $entry) {
            if (isset($entry['_id'], $entry['color']) && $entry['_id'] === $id) {
                return is_string($entry['color']) ? $entry['color'] : null;
            }
        }
        return null;
    }

    private function fontFromRepeater(array $repeater, string $id): ?string {
        foreach ($repeater as $entry) {
            if (isset($entry['_id'], $entry['typography_font_family']) && $entry['_id'] === $id) {
                return is_string($entry['typography_font_family']) ? $entry['typography_font_family'] : null;
            }
        }
        return null;
    }

    private function setRepeaterField(array &$repeater, string $id, string $field, $value): void {
        foreach ($repeater as &$entry) {
            if (isset($entry['_id']) && $entry['_id'] === $id) {
                $entry[$field] = $value;
                return;
            }
        }
        // Not found — append a new entry. (Shouldn't happen because ensureRepeater ran first.)
        $repeater[] = ['_id' => $id, $field => $value];
    }

    private function isClassicBg(array $settings): bool {
        return isset($settings['body_background_background']) && $settings['body_background_background'] === 'classic';
    }

    /**
     * Clear Elementor's compiled CSS cache so freshly-saved kit values appear immediately.
     * Defensive: any of these may be unavailable in older Elementor versions.
     */
    private function clearElementorCache(): void {
        if (class_exists('\Elementor\Plugin') && isset(\Elementor\Plugin::$instance->files_manager)) {
            try {
                \Elementor\Plugin::$instance->files_manager->clear_cache();
            } catch (\Throwable $e) { /* swallow — cache clear failure is non-fatal */ }
        }
        // Belt-and-suspenders: also delete the post-css meta key directly.
        if (function_exists('delete_post_meta_by_key')) {
            delete_post_meta_by_key('_elementor_css');
        }
        // Elementor 3.x also stores element render cache here
        if (function_exists('delete_post_meta_by_key')) {
            delete_post_meta_by_key('_elementor_element_cache');
        }
    }
}
