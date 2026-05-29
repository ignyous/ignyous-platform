<?php
namespace Ignyous\Baseline\Themes;

use Ignyous\Baseline\Snapshots;

/**
 * GeneratePress theme adapter.
 *
 * Storage model (verified against GeneratePress 3.6.x source):
 *
 *  - Single option 'generate_settings' (array, merged with generate_get_defaults()).
 *
 *  - Colors live in generate_settings. On a fresh 3.x install their DEFAULTS are
 *    CSS-variable references into the global color system, e.g.
 *      'background_color' => 'var(--base-2)'
 *      'text_color'       => 'var(--contrast)'
 *      'link_color'       => 'var(--accent)'
 *    Writing a literal hex to these keys overrides the var() and works directly.
 *
 *  - Global colors: generate_settings['global_colors'] = [ {name,slug,color}, ... ].
 *    Default slugs: contrast, contrast-2, contrast-3, base, base-2, base-3, accent.
 *    'accent' is the brand/primary color (#1e73be default) and the default
 *    link_color references var(--accent), so updating accent cascades to links.
 *
 *  - Typography (3.x "dynamic typography"): generate_settings['typography'] =
 *    array of rule objects keyed by 'selector'. We target:
 *      selector 'body'         → body font
 *      selector 'all-headings' → heading font
 *    Each rule carries fontFamily + the full default rule shape.
 *
 * Generic capability mapping:
 *   primary_color    → global_colors[slug=accent].color
 *   text_color       → generate_settings['text_color']      (literal hex)
 *   background_color → generate_settings['background_color'] (literal hex)
 *   link_color       → generate_settings['link_color']       (literal hex)
 *   heading_font     → typography rule selector 'all-headings' fontFamily
 *   body_font        → typography rule selector 'body' fontFamily
 */
class GeneratePressAdapter extends ThemeAdapter {

    const OPTION_KEY   = 'generate_settings';
    const ACCENT_SLUG  = 'accent';
    const SEL_BODY     = 'body';
    const SEL_HEADINGS = 'all-headings';

    public function slug(): string { return 'generatepress'; }
    public function name(): string { return 'GeneratePress'; }

    public function matches(string $stylesheet, string $template): bool {
        if ($template === 'generatepress' || $stylesheet === 'generatepress') return true;
        if (defined('GENERATE_VERSION')) return true;
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
        $opt = $this->getSettings();
        return [
            'current' => [
                'primary_color'    => $this->globalColor($opt, self::ACCENT_SLUG),
                'text_color'       => $this->str($opt, 'text_color'),
                'background_color' => $this->str($opt, 'background_color'),
                'link_color'       => $this->str($opt, 'link_color'),
                'heading_font'     => $this->typographyFamily($opt, self::SEL_HEADINGS),
                'body_font'        => $this->typographyFamily($opt, self::SEL_BODY),
            ],
            'raw' => [
                'option_key'       => self::OPTION_KEY,
                'generate_version' => defined('GENERATE_VERSION') ? GENERATE_VERSION : null,
                'global_color_slugs' => array_map(fn($c) => $c['slug'] ?? null, $opt['global_colors'] ?? []),
                'dynamic_typography' => !empty($opt['use_dynamic_typography']),
            ],
        ];
    }

    public function patch(array $body, string $changeId): array {
        $before  = $this->getSettings();
        $next     = is_array($before) ? $before : [];
        $applied  = [];
        $errors   = [];

        if (array_key_exists('primary_color', $body)) {
            $v = $this->sanitizeColor($body['primary_color']);
            if ($v) { $this->setGlobalColor($next, self::ACCENT_SLUG, $v); $applied['primary_color'] = $v; }
            else    $errors['primary_color'] = 'invalid_color';
        }
        if (array_key_exists('text_color', $body)) {
            $v = $this->sanitizeColor($body['text_color']);
            if ($v) { $next['text_color'] = $v; $applied['text_color'] = $v; }
            else    $errors['text_color'] = 'invalid_color';
        }
        if (array_key_exists('background_color', $body)) {
            $v = $this->sanitizeColor($body['background_color']);
            if ($v) { $next['background_color'] = $v; $applied['background_color'] = $v; }
            else    $errors['background_color'] = 'invalid_color';
        }
        if (array_key_exists('link_color', $body)) {
            $v = $this->sanitizeColor($body['link_color']);
            if ($v) { $next['link_color'] = $v; $applied['link_color'] = $v; }
            else    $errors['link_color'] = 'invalid_color';
        }
        if (array_key_exists('heading_font', $body)) {
            $v = trim((string) $body['heading_font']);
            $this->setTypographyFamily($next, self::SEL_HEADINGS, $v);
            $applied['heading_font'] = $v;
        }
        if (array_key_exists('body_font', $body)) {
            $v = trim((string) $body['body_font']);
            $this->setTypographyFamily($next, self::SEL_BODY, $v);
            $applied['body_font'] = $v;
        }

        $snapId = Snapshots::open($changeId, 'option', self::OPTION_KEY, wp_json_encode($before ?: new \stdClass()), 'GeneratePress settings');
        $ok     = update_option(self::OPTION_KEY, $next);
        Snapshots::close($snapId, wp_json_encode($next));

        // GeneratePress regenerates dynamic CSS on settings change; clear known caches.
        delete_option('generate_dynamic_css_output');
        delete_option('generate_dynamic_css_cache');

        $after = $this->getSettings();
        return [
            'applied'      => $applied,
            'errors'       => $errors,
            'snapshot_ids' => [$snapId],
            'current'      => [
                'primary_color'    => $this->globalColor($after, self::ACCENT_SLUG),
                'text_color'       => $this->str($after, 'text_color'),
                'background_color' => $this->str($after, 'background_color'),
                'link_color'       => $this->str($after, 'link_color'),
                'heading_font'     => $this->typographyFamily($after, self::SEL_HEADINGS),
                'body_font'        => $this->typographyFamily($after, self::SEL_BODY),
            ],
            'success' => $ok || empty($errors),
        ];
    }

    // --------------------------------------------------------------- helpers

    private function getSettings(): array {
        $v = get_option(self::OPTION_KEY, []);
        return is_array($v) ? $v : [];
    }

    private function str(array $opt, string $k): ?string {
        if (!isset($opt[$k])) return null;
        return is_string($opt[$k]) ? $opt[$k] : (is_scalar($opt[$k]) ? (string) $opt[$k] : null);
    }

    private function globalColor(array $opt, string $slug): ?string {
        foreach (($opt['global_colors'] ?? []) as $c) {
            if (isset($c['slug']) && $c['slug'] === $slug) return $c['color'] ?? null;
        }
        return null;
    }

    private function setGlobalColor(array &$opt, string $slug, string $value): void {
        if (!isset($opt['global_colors']) || !is_array($opt['global_colors'])) $opt['global_colors'] = [];
        foreach ($opt['global_colors'] as $i => $c) {
            if (isset($c['slug']) && $c['slug'] === $slug) { $opt['global_colors'][$i]['color'] = $value; return; }
        }
        $opt['global_colors'][] = ['name' => ucfirst($slug), 'slug' => $slug, 'color' => $value];
    }

    private function typographyFamily(array $opt, string $selector): ?string {
        foreach (($opt['typography'] ?? []) as $rule) {
            if (is_array($rule) && ($rule['selector'] ?? null) === $selector) {
                return isset($rule['fontFamily']) && is_string($rule['fontFamily']) && $rule['fontFamily'] !== '' ? $rule['fontFamily'] : null;
            }
        }
        return null;
    }

    private function setTypographyFamily(array &$opt, string $selector, string $family): void {
        if (!isset($opt['typography']) || !is_array($opt['typography'])) $opt['typography'] = [];
        foreach ($opt['typography'] as $i => $rule) {
            if (is_array($rule) && ($rule['selector'] ?? null) === $selector) {
                $opt['typography'][$i]['fontFamily'] = $family;
                return;
            }
        }
        $opt['typography'][] = array_merge($this->typographyRuleDefaults(), [
            'selector'   => $selector,
            'fontFamily' => $family,
        ]);
    }

    /** Full default typography rule shape (matches GeneratePress Typography::get_defaults()). */
    private function typographyRuleDefaults(): array {
        return [
            'selector' => '', 'customSelector' => '', 'fontFamily' => '', 'fontWeight' => '',
            'textTransform' => '', 'textDecoration' => '', 'fontStyle' => '', 'fontSize' => '',
            'fontSizeTablet' => '', 'fontSizeMobile' => '', 'fontSizeUnit' => 'px',
            'lineHeight' => '', 'lineHeightTablet' => '', 'lineHeightMobile' => '', 'lineHeightUnit' => '',
            'letterSpacing' => '', 'letterSpacingTablet' => '', 'letterSpacingMobile' => '', 'letterSpacingUnit' => 'px',
            'marginBottom' => '', 'marginBottomTablet' => '', 'marginBottomMobile' => '', 'marginBottomUnit' => 'px',
        ];
    }
}
