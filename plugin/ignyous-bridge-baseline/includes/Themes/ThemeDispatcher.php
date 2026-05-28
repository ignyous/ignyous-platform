<?php
namespace Ignyous\Baseline\Themes;

/**
 * Picks the right adapter for the active WordPress theme.
 *
 * Order of priority:
 *   1. Theme-specific adapters (Astra, Kadence) — they detect by template/stylesheet slug
 *      or by their well-known constants.
 *   2. BlockThemeAdapter — any theme that wp_is_block_theme() returns true for
 *      (Twenty Twenty-Five, custom block themes, etc).
 *   3. UnsupportedThemeAdapter — returns 409 with a clear "we can't edit this theme
 *      globally; per-block edits still work" message.
 */
class ThemeDispatcher {

    /** @var ThemeAdapter[] */
    private array $adapters;

    public function __construct() {
        // Order matters — first match wins.
        // Elementor is a plugin, not a theme, but its kit overrides what the
        // theme would render for Elementor-built pages — so it goes first.
        // Theme adapters still run on non-Elementor sites.
        $this->adapters = [
            new ElementorAdapter(),
            new AstraAdapter(),
            new KadenceAdapter(),
            new BlockThemeAdapter(),
        ];
    }

    public function pick(): ThemeAdapter {
        $stylesheet = get_stylesheet();
        $template   = get_template();
        foreach ($this->adapters as $a) {
            if ($a->matches($stylesheet, $template)) return $a;
        }
        return new UnsupportedThemeAdapter($stylesheet, $template);
    }

    public function info(): array {
        $picked = $this->pick();
        return [
            'active_stylesheet' => get_stylesheet(),
            'active_template'   => get_template(),
            'theme_name'        => function_exists('wp_get_theme') ? (string) wp_get_theme()->get('Name') : null,
            'theme_version'     => function_exists('wp_get_theme') ? (string) wp_get_theme()->get('Version') : null,
            'is_block_theme'    => function_exists('wp_is_block_theme') && wp_is_block_theme(),
            'adapter'           => [
                'slug'         => $picked->slug(),
                'name'         => $picked->name(),
                'capabilities' => $picked->capabilities(),
            ],
            'available_adapters' => array_map(fn($a) => ['slug' => $a->slug(), 'name' => $a->name()], $this->adapters),
        ];
    }
}
