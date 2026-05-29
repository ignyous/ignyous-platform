<?php
namespace Ignyous\Baseline\Themes;

use Ignyous\Baseline\Snapshots;

/**
 * Kadence theme adapter.
 *
 * Storage model (verified against Kadence 1.5.x source):
 *
 *  - Brand palette: option 'kadence_global_palette' (JSON).
 *      { "active": "...", "palette": [ {"color","slug","name"}, ... ] }
 *      palette1 = primary brand color.
 *
 *  - Everything else (colors, fonts) is read through Kadence's option() helper,
 *    whose backend depends on get_option_type():
 *      apply_filters('kadence_theme_option_type', 'theme_mod')  → DEFAULT 'theme_mod'
 *    So on a standard install Kadence reads settings via get_theme_mod($key),
 *    NOT from the 'kadence_settings' option. We honor the same backend on write,
 *    falling back to the 'kadence_settings' option only when a site opts into
 *    'option' mode. (An earlier version wrote only the option and was ignored.)
 *
 *  - Setting value shapes (verified):
 *      base_font          => [ 'family','google','weight','variant','color', ... ]
 *                            body TEXT color lives in base_font['color'].
 *      heading_font       => [ 'family' => ... ]
 *      content_background => [ 'desktop' => [ 'color' => <hex|slug> ], ... ]   (responsive)
 *      link_color         => [ 'highlight' => <hex|slug>, 'style' => 'standard', ... ]
 *
 * Generic capability mapping:
 *   primary_color    → kadence_global_palette[palette1]
 *   text_color       → base_font['color']
 *   background_color → content_background['desktop']['color']
 *   link_color       → link_color['highlight']
 *   heading_font     → heading_font['family']
 *   body_font        → base_font['family']
 */
class KadenceAdapter extends ThemeAdapter {

    const PALETTE_OPTION  = 'kadence_global_palette';
    const SETTINGS_OPTION = 'kadence_settings';
    const PRIMARY_SLUG    = 'palette1';

    public function slug(): string { return 'kadence'; }
    public function name(): string { return 'Kadence'; }

    public function matches(string $stylesheet, string $template): bool {
        if ($template === 'kadence' || $stylesheet === 'kadence') return true;
        if (defined('KADENCE_VERSION')) return true;
        return false;
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
        $palette = $this->readPalette();
        return [
            'current' => [
                'primary_color'    => $this->paletteColor($palette, self::PRIMARY_SLUG),
                'text_color'       => $this->subColor($this->getSetting('base_font'), 'color'),
                'background_color' => $this->bgColor($this->getSetting('content_background')),
                'link_color'       => $this->subColor($this->getSetting('link_color'), 'highlight'),
                'heading_font'     => $this->familyOf($this->getSetting('heading_font')),
                'body_font'        => $this->familyOf($this->getSetting('base_font')),
            ],
            'raw' => [
                'option_type'     => $this->optionType(),
                'option_name'     => $this->optionName(),
                'palette_active'  => $palette['active'] ?? null,
                'palette_slugs'   => array_map(fn($c) => $c['slug'] ?? null, $palette['palette'] ?? []),
                'kadence_version' => defined('KADENCE_VERSION') ? KADENCE_VERSION : null,
            ],
        ];
    }

    public function patch(array $body, string $changeId): array {
        $applied = [];
        $errors  = [];
        $snapIds = [];

        // ── Palette write (primary_color) — always a real option ──
        if (array_key_exists('primary_color', $body)) {
            $v = $this->sanitizeColor($body['primary_color']);
            if ($v) {
                $beforePalette = $this->readPalette();
                $nextPalette   = $this->paletteSet($beforePalette, self::PRIMARY_SLUG, $v);
                $snap = Snapshots::open($changeId, 'option', self::PALETTE_OPTION, wp_json_encode($beforePalette), 'Kadence palette');
                update_option(self::PALETTE_OPTION, wp_json_encode($nextPalette));
                Snapshots::close($snap, wp_json_encode($nextPalette));
                $snapIds[] = $snap;
                $applied['primary_color'] = $v;
            } else $errors['primary_color'] = 'invalid_color';
        }

        // ── Build the set of changed settings (each a full value) ──
        $changes = [];

        // base_font carries BOTH body text color and body font family.
        if (array_key_exists('text_color', $body) || array_key_exists('body_font', $body)) {
            $bf = $this->getSettingArray('base_font');
            if (array_key_exists('text_color', $body)) {
                $v = $this->sanitizeColor($body['text_color']);
                if ($v) { $bf['color'] = $v; $applied['text_color'] = $v; }
                else    $errors['text_color'] = 'invalid_color';
            }
            if (array_key_exists('body_font', $body)) {
                $v = trim((string) $body['body_font']);
                $bf['family'] = $v;
                if (!array_key_exists('google', $bf))  $bf['google']  = false; // don't force webfont load
                if (empty($bf['weight']))  $bf['weight']  = '400';
                if (empty($bf['variant'])) $bf['variant'] = 'regular';
                $applied['body_font'] = $v;
            }
            $changes['base_font'] = $bf;
        }

        if (array_key_exists('background_color', $body)) {
            $v = $this->sanitizeColor($body['background_color']);
            if ($v) {
                $cb = $this->getSettingArray('content_background');
                if (!isset($cb['desktop']) || !is_array($cb['desktop'])) $cb['desktop'] = [];
                $cb['desktop']['color'] = $v;
                $changes['content_background'] = $cb;
                $applied['background_color'] = $v;
            } else $errors['background_color'] = 'invalid_color';
        }

        if (array_key_exists('link_color', $body)) {
            $v = $this->sanitizeColor($body['link_color']);
            if ($v) {
                $lc = $this->getSettingArray('link_color');
                $lc['highlight'] = $v;
                if (empty($lc['style'])) $lc['style'] = 'standard';
                $changes['link_color'] = $lc;
                $applied['link_color'] = $v;
            } else $errors['link_color'] = 'invalid_color';
        }

        if (array_key_exists('heading_font', $body)) {
            $v = trim((string) $body['heading_font']);
            $hf = $this->getSettingArray('heading_font');
            $hf['family'] = $v;
            $changes['heading_font'] = $hf;
            $applied['heading_font'] = $v;
        }

        // ── Persist changed settings honoring Kadence's storage backend ──
        if (!empty($changes)) {
            $snapIds = array_merge($snapIds, $this->writeChanges($changes, $changeId));
        }

        // Cache busts — Kadence regenerates CSS on option/theme_mod change, but clear safe keys.
        delete_transient('kadence_dynamic_css');
        delete_option('kadence_dynamic_css');

        $palette = $this->readPalette();
        return [
            'applied'      => $applied,
            'errors'       => $errors,
            'snapshot_ids' => $snapIds,
            'current'      => [
                'primary_color'    => $this->paletteColor($palette, self::PRIMARY_SLUG),
                'text_color'       => $this->subColor($this->getSetting('base_font'), 'color'),
                'background_color' => $this->bgColor($this->getSetting('content_background')),
                'link_color'       => $this->subColor($this->getSetting('link_color'), 'highlight'),
                'heading_font'     => $this->familyOf($this->getSetting('heading_font')),
                'body_font'        => $this->familyOf($this->getSetting('base_font')),
            ],
            'success' => empty($errors),
        ];
    }

    // ----------------------------------------------------------- storage backend

    /** 'theme_mod' (Kadence default) or 'option'. */
    private function optionType(): string {
        $t = function_exists('apply_filters') ? apply_filters('kadence_theme_option_type', 'theme_mod') : 'theme_mod';
        return $t === 'option' ? 'option' : 'theme_mod';
    }

    private function optionName(): string {
        return function_exists('apply_filters')
            ? (string) apply_filters('kadence_theme_option_name', self::SETTINGS_OPTION)
            : self::SETTINGS_OPTION;
    }

    /** Read one Kadence setting from whichever backend is active. Null if unset. */
    private function getSetting(string $key) {
        if ($this->optionType() === 'option') {
            $opts = get_option($this->optionName(), []);
            $opts = is_array($opts) ? $opts : [];
            return array_key_exists($key, $opts) ? $opts[$key] : null;
        }
        return get_theme_mod($key, null);
    }

    private function getSettingArray(string $key): array {
        $v = $this->getSetting($key);
        return is_array($v) ? $v : [];
    }

    /**
     * Write a batch of settings to the active backend with ONE snapshot.
     *  - option mode: snapshot + update the kadence_settings option (merged).
     *  - theme_mod mode: snapshot the whole theme_mods_{stylesheet} option, then set_theme_mod each.
     */
    private function writeChanges(array $changes, string $changeId): array {
        if ($this->optionType() === 'option') {
            $name   = $this->optionName();
            $before = get_option($name, []);
            $before = is_array($before) ? $before : [];
            $next   = array_merge($before, $changes);
            $snap = Snapshots::open($changeId, 'option', $name, wp_json_encode($before ?: new \stdClass()), 'Kadence settings');
            update_option($name, $next);
            Snapshots::close($snap, wp_json_encode($next));
            return [$snap];
        }
        // theme_mod backend: theme mods are stored in the option theme_mods_{stylesheet}.
        $modsKey = 'theme_mods_' . (function_exists('get_stylesheet') ? get_stylesheet() : 'kadence');
        $before  = get_option($modsKey, []);
        $snap = Snapshots::open($changeId, 'option', $modsKey, wp_json_encode($before ?: new \stdClass()), 'Kadence theme mods');
        foreach ($changes as $key => $val) {
            set_theme_mod($key, $val);
        }
        Snapshots::close($snap, wp_json_encode(get_option($modsKey, [])));
        return [$snap];
    }

    // ----------------------------------------------------------- palette helpers

    private function readPalette(): array {
        $raw = get_option(self::PALETTE_OPTION, '');
        if (is_string($raw) && $raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) return $decoded;
        }
        if (is_array($raw)) return $raw;
        return [
            'active'  => 'base',
            'palette' => [
                ['color' => '#3182CE', 'slug' => 'palette1', 'name' => 'Palette Color 1'],
            ],
        ];
    }

    private function paletteColor(array $palette, string $slug): ?string {
        foreach (($palette['palette'] ?? []) as $c) {
            if (isset($c['slug']) && $c['slug'] === $slug) return $c['color'] ?? null;
        }
        return null;
    }

    private function paletteSet(array $palette, string $slug, string $value): array {
        $found = false;
        foreach (($palette['palette'] ?? []) as $i => $c) {
            if (isset($c['slug']) && $c['slug'] === $slug) {
                $palette['palette'][$i]['color'] = $value;
                $found = true;
                break;
            }
        }
        if (!$found) {
            $palette['palette'][] = ['color' => $value, 'slug' => $slug, 'name' => 'Palette Color ' . substr($slug, -1)];
        }
        return $palette;
    }

    // ----------------------------------------------------------- value extractors

    /** Pull a string color from a sub-key of a setting array (or palette slug string). */
    private function subColor($setting, string $sub): ?string {
        if (!is_array($setting)) return is_string($setting) ? $setting : null;
        $v = $setting[$sub] ?? null;
        return is_string($v) ? $v : null;
    }

    /** content_background is responsive: prefer desktop.color. */
    private function bgColor($setting): ?string {
        if (!is_array($setting)) return is_string($setting) ? $setting : null;
        if (isset($setting['desktop']['color']) && is_string($setting['desktop']['color'])) return $setting['desktop']['color'];
        if (isset($setting['color']) && is_string($setting['color'])) return $setting['color'];
        return null;
    }

    private function familyOf($setting): ?string {
        if (!is_array($setting)) return null;
        return isset($setting['family']) && is_string($setting['family']) ? $setting['family'] : null;
    }
}
