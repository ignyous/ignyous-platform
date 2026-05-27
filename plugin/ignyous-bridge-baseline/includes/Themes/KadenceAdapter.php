<?php
namespace Ignyous\Baseline\Themes;

use Ignyous\Baseline\Snapshots;

/**
 * Kadence theme adapter.
 *
 * Storage in Kadence:
 *   - 'kadence_global_palette'  option, JSON-encoded.
 *       Shape: { "active": "base", "palette": [ {"color","slug","name"}, ... ] }
 *       Slugs are typically palette1..palette9, plus base white/black.
 *       palette1 = primary brand color in default setups.
 *   - 'kadence_settings'        option, serialized array.
 *       'text_color', 'header_site_text_color', 'body_background',
 *       'heading_font_family', 'base_font_family' (each an array with
 *       { family, variant, subset, weight, ... })
 *
 * For Phase 5 we handle:
 *   primary_color    → kadence_global_palette[palette1]
 *   text_color       → kadence_settings['text_color']
 *   background_color → kadence_settings['body_background']
 *   heading_font     → kadence_settings['heading_font'] family
 *   body_font        → kadence_settings['base_font']    family
 *
 * Kadence clears its own CSS cache when these options change via update_option hooks.
 */
class KadenceAdapter extends ThemeAdapter {

    const PALETTE_OPTION = 'kadence_global_palette';
    const SETTINGS_OPTION = 'kadence_settings';
    const PRIMARY_SLUG = 'palette1';

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
            'link_color'       => false,    // Kadence uses per-element link colors — defer
            'heading_font'     => true,
            'body_font'        => true,
        ];
    }

    public function read(): array {
        $palette  = $this->readPalette();
        $settings = $this->readSettings();
        return [
            'current' => [
                'primary_color'    => $this->paletteColor($palette, self::PRIMARY_SLUG),
                'text_color'       => $this->settingsColor($settings, 'text_color'),
                'background_color' => $this->settingsColor($settings, 'body_background'),
                'heading_font'     => $this->settingsFontFamily($settings, 'heading_font'),
                'body_font'        => $this->settingsFontFamily($settings, 'base_font'),
            ],
            'raw' => [
                'palette_active' => $palette['active'] ?? null,
                'palette_slugs'  => array_map(fn($c) => $c['slug'] ?? null, $palette['palette'] ?? []),
                'settings_keys'  => array_keys($settings),
                'kadence_version' => defined('KADENCE_VERSION') ? KADENCE_VERSION : null,
            ],
        ];
    }

    public function patch(array $body, string $changeId): array {
        $applied = [];
        $errors  = [];
        $snapIds = [];

        // ─ Palette write (primary_color) ─
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

        // ─ Settings writes (everything else) ─
        $touchesSettings = array_intersect_key($body, array_flip([
            'text_color', 'background_color', 'heading_font', 'body_font',
        ]));
        if (!empty($touchesSettings)) {
            $beforeSettings = $this->readSettings();
            $nextSettings   = $beforeSettings;

            if (array_key_exists('text_color', $body)) {
                $v = $this->sanitizeColor($body['text_color']);
                if ($v) {
                    $nextSettings['text_color'] = $this->wrapColor($v);
                    $applied['text_color'] = $v;
                } else $errors['text_color'] = 'invalid_color';
            }
            if (array_key_exists('background_color', $body)) {
                $v = $this->sanitizeColor($body['background_color']);
                if ($v) {
                    $nextSettings['body_background'] = $this->wrapColor($v);
                    $applied['background_color'] = $v;
                } else $errors['background_color'] = 'invalid_color';
            }
            if (array_key_exists('heading_font', $body)) {
                $v = trim((string) $body['heading_font']);
                $existing = isset($nextSettings['heading_font']) && is_array($nextSettings['heading_font']) ? $nextSettings['heading_font'] : [];
                $existing['family'] = $v;
                if (empty($existing['variant'])) $existing['variant'] = 'regular';
                if (empty($existing['subset']))  $existing['subset']  = 'latin';
                $nextSettings['heading_font'] = $existing;
                $applied['heading_font'] = $v;
            }
            if (array_key_exists('body_font', $body)) {
                $v = trim((string) $body['body_font']);
                $existing = isset($nextSettings['base_font']) && is_array($nextSettings['base_font']) ? $nextSettings['base_font'] : [];
                $existing['family'] = $v;
                if (empty($existing['variant'])) $existing['variant'] = 'regular';
                if (empty($existing['subset']))  $existing['subset']  = 'latin';
                $nextSettings['base_font'] = $existing;
                $applied['body_font'] = $v;
            }

            $snap = Snapshots::open($changeId, 'option', self::SETTINGS_OPTION, wp_json_encode($beforeSettings ?: new \stdClass()), 'Kadence settings');
            update_option(self::SETTINGS_OPTION, $nextSettings);
            Snapshots::close($snap, wp_json_encode($nextSettings));
            $snapIds[] = $snap;
        }

        // Cache busts — Kadence stores rendered CSS under transient/option keys; clear safe ones
        delete_transient('kadence_dynamic_css');
        delete_option('kadence_dynamic_css');

        // Re-read so 'current' reflects what's actually stored
        $palette  = $this->readPalette();
        $settings = $this->readSettings();

        return [
            'applied'      => $applied,
            'errors'       => $errors,
            'snapshot_ids' => $snapIds,
            'current'      => [
                'primary_color'    => $this->paletteColor($palette, self::PRIMARY_SLUG),
                'text_color'       => $this->settingsColor($settings, 'text_color'),
                'background_color' => $this->settingsColor($settings, 'body_background'),
                'heading_font'     => $this->settingsFontFamily($settings, 'heading_font'),
                'body_font'        => $this->settingsFontFamily($settings, 'base_font'),
            ],
            'success' => empty($errors),
        ];
    }

    // --------------------------------------------------------------- helpers

    private function readPalette(): array {
        $raw = get_option(self::PALETTE_OPTION, '');
        if (is_string($raw) && $raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) return $decoded;
        }
        if (is_array($raw)) return $raw;
        // Default skeleton matching Kadence's first install state
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

    private function readSettings(): array {
        $v = get_option(self::SETTINGS_OPTION, []);
        return is_array($v) ? $v : [];
    }

    private function settingsColor(array $s, string $key): ?string {
        if (!isset($s[$key])) return null;
        $v = $s[$key];
        if (is_string($v)) return $v;
        if (is_array($v) && isset($v['color'])) return is_string($v['color']) ? $v['color'] : null;
        return null;
    }

    private function settingsFontFamily(array $s, string $key): ?string {
        if (!isset($s[$key]) || !is_array($s[$key])) return null;
        return isset($s[$key]['family']) && is_string($s[$key]['family']) ? $s[$key]['family'] : null;
    }

    /** Kadence often stores color values as { color: '#xxx' }. Use the wrapped shape for consistency. */
    private function wrapColor(string $hex): array {
        return ['color' => $hex];
    }
}
