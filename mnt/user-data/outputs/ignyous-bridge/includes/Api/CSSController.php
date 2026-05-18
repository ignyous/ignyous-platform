<?php
namespace Ignyous\Api;

/**
 * CSSController — Universal CSS injection for visual changes.
 *
 * Instead of modifying builder-specific data structures for colors/fonts/spacing,
 * this injects CSS into WordPress's Additional CSS (Customizer), which works on
 * EVERY WordPress site regardless of builder, theme, or plugin setup.
 *
 * Uses !important to override builder styles. Tracks injected rules with labeled
 * comments so they can be updated or removed later.
 *
 * Covers: background colors, text colors, font sizes, font families, spacing,
 * borders, visibility, hover states, responsive overrides — anything CSS can do.
 */
class CSSController {

    const MARKER_START = '/* === IGNYOUS MANAGED CSS START === */';
    const MARKER_END   = '/* === IGNYOUS MANAGED CSS END === */';

    public function register_routes() {
        // Inject CSS rules
        register_rest_route('ignyous/v1', '/css/inject', [
            'methods'             => 'POST',
            'callback'            => [$this, 'inject_css'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Get current CSS (both managed and user)
        register_rest_route('ignyous/v1', '/css/current', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_current_css'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Remove managed CSS rules by label
        register_rest_route('ignyous/v1', '/css/remove', [
            'methods'             => 'POST',
            'callback'            => [$this, 'remove_css'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Resolve an element_id to a CSS selector
        register_rest_route('ignyous/v1', '/css/selector', [
            'methods'             => 'GET',
            'callback'            => [$this, 'resolve_selector'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // High-level: update element style (auto-resolves selector)
        register_rest_route('ignyous/v1', '/css/update-style', [
            'methods'             => 'POST',
            'callback'            => [$this, 'update_element_style'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
    }

    /**
     * Inject CSS rules into WordPress Additional CSS.
     *
     * Body: {
     *   rules: [
     *     { selector: ".elementor-element-abc123", properties: { "background-color": "#1a365d", "color": "#fff" }, label: "footer-bg" },
     *     { selector: "h1, h2", properties: { "font-family": "Georgia, serif" }, label: "heading-font" }
     *   ],
     *   raw_css: "optional raw CSS string to inject instead of rules"
     * }
     */
    public function inject_css($request) {
        $body    = $request->get_json_params();
        $rules   = $body['rules']   ?? [];
        $raw_css = $body['raw_css'] ?? '';

        if (empty($rules) && empty($raw_css)) {
            return new \WP_Error('no_css', 'rules or raw_css required', ['status' => 400]);
        }

        // Build CSS from rules
        $new_css_lines = [];
        foreach ($rules as $rule) {
            $selector   = $rule['selector']   ?? '';
            $properties = $rule['properties']  ?? [];
            $label      = $rule['label']       ?? 'unlabeled';

            if (!$selector || empty($properties)) continue;

            $declarations = [];
            foreach ($properties as $prop => $val) {
                // Add !important if not already present
                $val = trim($val);
                if (stripos($val, '!important') === false) {
                    $val .= ' !important';
                }
                $declarations[] = "  {$prop}: {$val};";
            }

            $new_css_lines[] = "/* ignyous:{$label} */";
            $new_css_lines[] = "{$selector} {";
            $new_css_lines[] = implode("\n", $declarations);
            $new_css_lines[] = "}";
            $new_css_lines[] = "";
        }

        if ($raw_css) {
            $new_css_lines[] = "/* ignyous:raw */";
            $new_css_lines[] = $raw_css;
            $new_css_lines[] = "";
        }

        $new_css_block = implode("\n", $new_css_lines);

        // Get existing CSS
        $existing = wp_get_custom_css();

        // Check if we already have a managed section
        if (strpos($existing, self::MARKER_START) !== false) {
            // Extract existing managed block
            $before = substr($existing, 0, strpos($existing, self::MARKER_START));
            $after_marker_end = strpos($existing, self::MARKER_END);
            $after  = $after_marker_end !== false
                ? substr($existing, $after_marker_end + strlen(self::MARKER_END))
                : '';

            // Get existing managed CSS (between markers)
            $managed_start = strpos($existing, self::MARKER_START) + strlen(self::MARKER_START);
            $managed_end   = $after_marker_end ?: strlen($existing);
            $existing_managed = substr($existing, $managed_start, $managed_end - $managed_start);

            // Remove any existing rules with the same labels (update them)
            foreach ($rules as $rule) {
                $label = $rule['label'] ?? 'unlabeled';
                // Remove existing rule block with this label
                $existing_managed = preg_replace(
                    '/\/\* ignyous:' . preg_quote($label, '/') . ' \*\/\n[^\/]*(?=\/\*|$)/s',
                    '',
                    $existing_managed
                );
            }

            // Append new rules
            $managed = trim($existing_managed) . "\n" . $new_css_block;
            $full_css = trim($before) . "\n\n" . self::MARKER_START . "\n" . trim($managed) . "\n" . self::MARKER_END . "\n" . trim($after);
        } else {
            // First time — add managed section at the end
            $full_css = trim($existing) . "\n\n" . self::MARKER_START . "\n" . $new_css_block . self::MARKER_END . "\n";
        }

        // Save
        wp_update_custom_css_post(trim($full_css));

        // Clear caches
        $this->clear_caches();

        return [
            'success'     => true,
            'rules_added' => count($rules) + ($raw_css ? 1 : 0),
            'labels'      => array_map(fn($r) => $r['label'] ?? 'unlabeled', $rules),
            'total_css_length' => strlen($full_css),
        ];
    }

    /**
     * Get current Additional CSS, separated into managed vs user.
     */
    public function get_current_css($request) {
        $full = wp_get_custom_css();

        $managed = '';
        $user    = $full;

        if (strpos($full, self::MARKER_START) !== false) {
            $start = strpos($full, self::MARKER_START) + strlen(self::MARKER_START);
            $end   = strpos($full, self::MARKER_END);
            if ($end !== false) {
                $managed = trim(substr($full, $start, $end - $start));
                $user    = trim(
                    substr($full, 0, strpos($full, self::MARKER_START)) .
                    substr($full, $end + strlen(self::MARKER_END))
                );
            }
        }

        // Parse managed rules into labels
        $labels = [];
        preg_match_all('/\/\* ignyous:([^ ]+) \*\//', $managed, $m);
        if (!empty($m[1])) $labels = $m[1];

        return [
            'success'       => true,
            'managed_css'   => $managed,
            'user_css'      => $user,
            'managed_labels'=> $labels,
            'total_length'  => strlen($full),
        ];
    }

    /**
     * Remove managed CSS rules by label.
     *
     * Body: { labels: ["footer-bg", "heading-font"] } or { all: true }
     */
    public function remove_css($request) {
        $body   = $request->get_json_params();
        $labels = $body['labels'] ?? [];
        $all    = $body['all']    ?? false;

        $full = wp_get_custom_css();

        if ($all) {
            // Remove entire managed block
            $full = preg_replace('/' . preg_quote(self::MARKER_START, '/') . '[\s\S]*?' . preg_quote(self::MARKER_END, '/') . '/', '', $full);
        } else {
            foreach ($labels as $label) {
                $full = preg_replace(
                    '/\/\* ignyous:' . preg_quote($label, '/') . ' \*\/\n[^\/]*(?=\/\*|' . preg_quote(self::MARKER_END, '/') . ')/s',
                    '',
                    $full
                );
            }
        }

        wp_update_custom_css_post(trim($full));
        $this->clear_caches();

        return ['success' => true, 'removed' => $all ? 'all' : $labels];
    }

    /**
     * Resolve an element ID to a CSS selector.
     *
     * GET /css/selector?element_id=abc123&builder=elementor
     * GET /css/selector?element_id=abc123&post_id=2  (auto-detect builder)
     */
    public function resolve_selector($request) {
        $element_id = $request->get_param('element_id') ?? '';
        $builder    = $request->get_param('builder')    ?? '';
        $post_id    = (int) ($request->get_param('post_id') ?? 0);
        $target     = $request->get_param('target')     ?? ''; // "footer", "hero", "header", etc.

        // Auto-detect builder
        if (!$builder && $post_id) {
            $edata = get_post_meta($post_id, '_elementor_data', true);
            if ($edata && strlen($edata) > 10) $builder = 'elementor';
            elseif (get_post_meta($post_id, '_et_builder_version', true)) $builder = 'divi';
            else $builder = 'gutenberg';
        }

        $selectors = [];

        // By element ID
        if ($element_id) {
            switch ($builder) {
                case 'elementor':
                    $selectors[] = ".elementor-element-{$element_id}";
                    break;
                case 'divi':
                    $selectors[] = "#et-boc .et_pb_section_{$element_id}";
                    break;
                default:
                    $selectors[] = "[data-id=\"{$element_id}\"]";
                    break;
            }
        }

        // By semantic target
        if ($target) {
            $target_lower = strtolower($target);
            $semantic_selectors = $this->get_semantic_selectors($target_lower, $builder);
            $selectors = array_merge($selectors, $semantic_selectors);
        }

        return [
            'success'   => true,
            'builder'   => $builder,
            'selectors' => $selectors,
            'primary'   => $selectors[0] ?? null,
        ];
    }

    /**
     * High-level: update an element's style. Auto-resolves the CSS selector.
     *
     * Body: {
     *   post_id: 2,
     *   element_id: "abc123",     // OR
     *   target: "footer",         // semantic target: footer, header, hero, etc.
     *   styles: { "background-color": "#1a365d", "color": "#ffffff", "padding": "40px 20px" },
     *   label: "footer-style"     // tracking label
     * }
     */
    public function update_element_style($request) {
        $body       = $request->get_json_params();
        $post_id    = (int) ($body['post_id']    ?? 0);
        $element_id = trim($body['element_id']   ?? '');
        $target     = trim($body['target']       ?? '');
        $styles     = $body['styles']            ?? [];
        $label      = trim($body['label']        ?? ($target ?: $element_id ?: 'style-update'));

        if (empty($styles)) return new \WP_Error('no_styles', 'styles required', ['status' => 400]);

        // Resolve selector
        $builder = '';
        if ($post_id) {
            $edata = get_post_meta($post_id, '_elementor_data', true);
            if ($edata && strlen($edata) > 10) $builder = 'elementor';
        }

        $selector = '';
        if ($element_id) {
            $selector = $builder === 'elementor' ? ".elementor-element-{$element_id}" : "[data-id=\"{$element_id}\"]";
        } elseif ($target) {
            $sems = $this->get_semantic_selectors(strtolower($target), $builder);
            $selector = $sems[0] ?? '';
        }

        if (!$selector) {
            return new \WP_Error('no_selector', 'Could not resolve CSS selector. Provide element_id or target.', ['status' => 400]);
        }

        // Inject CSS
        $rule = [
            'selector'   => $selector,
            'properties' => $styles,
            'label'      => $label,
        ];

        // Build the CSS
        $declarations = [];
        foreach ($styles as $prop => $val) {
            $val = trim($val);
            if (stripos($val, '!important') === false) $val .= ' !important';
            $declarations[] = "  {$prop}: {$val};";
        }

        $css_block = "/* ignyous:{$label} */\n{$selector} {\n" . implode("\n", $declarations) . "\n}\n";

        // Get existing CSS and update
        $full = wp_get_custom_css();

        if (strpos($full, self::MARKER_START) !== false) {
            $start_pos = strpos($full, self::MARKER_START) + strlen(self::MARKER_START);
            $end_pos   = strpos($full, self::MARKER_END);
            $managed   = substr($full, $start_pos, $end_pos - $start_pos);
            $before    = substr($full, 0, strpos($full, self::MARKER_START));
            $after     = substr($full, $end_pos + strlen(self::MARKER_END));

            // Remove old rule with same label
            $managed = preg_replace(
                '/\/\* ignyous:' . preg_quote($label, '/') . ' \*\/\n[^\/]*(?=\/\*|$)/s',
                '',
                $managed
            );

            $managed = trim($managed) . "\n" . $css_block;
            $full = trim($before) . "\n\n" . self::MARKER_START . "\n" . $managed . self::MARKER_END . "\n" . trim($after);
        } else {
            $full = trim($full) . "\n\n" . self::MARKER_START . "\n" . $css_block . self::MARKER_END . "\n";
        }

        wp_update_custom_css_post(trim($full));
        $this->clear_caches();

        return [
            'success'     => true,
            'selector'    => $selector,
            'label'       => $label,
            'styles'      => $styles,
            'builder'     => $builder,
            'page_title'  => $post_id ? get_the_title($post_id) : null,
        ];
    }

    // ─── Semantic Selectors ──────────────────────────────────────────

    /**
     * Map semantic targets (footer, header, hero) to CSS selectors.
     * These cover the most common themes and builders.
     */
    private function get_semantic_selectors(string $target, string $builder = ''): array {
        $map = [
            'footer' => [
                'footer', '.site-footer', '#footer', '.footer-area', '.footer-widget-area',
                '.elementor-location-footer', '#colophon', '.ast-footer-overlay',
                '.et_pb_section:last-child', '.fusion-footer', '#wrapper_footer',
            ],
            'header' => [
                'header', '.site-header', '#masthead', '.header-area',
                '.elementor-location-header', '#et-top-navigation',
                '.fusion-header', '.avada-header',
            ],
            'hero' => [
                '.hero', '.hero-section', '.banner', '.page-header',
                '.elementor-section:first-child', '.et_pb_section:first-child',
            ],
            'sidebar' => [
                '.sidebar', '#secondary', '.widget-area', 'aside',
            ],
            'menu' => [
                '.main-navigation', '.primary-menu', '#site-navigation',
                '.elementor-nav-menu', '.et_pb_menu',
            ],
            'body' => [
                'body',
            ],
            'headings' => [
                'h1, h2, h3, h4, h5, h6',
            ],
            'buttons' => [
                '.elementor-button', '.et_pb_button', '.wp-block-button__link',
                'button, .button, input[type="submit"]',
            ],
            'links' => [
                'a',
            ],
        ];

        return $map[$target] ?? [".{$target}"];
    }

    // ─── Cache Clearing ──────────────────────────────────────────────

    private function clear_caches() {
        // Elementor
        if (class_exists('\Elementor\Plugin') && isset(\Elementor\Plugin::$instance->files_manager)) {
            \Elementor\Plugin::$instance->files_manager->clear_cache();
        }
        do_action('elementor/core/files/clear_cache');

        // Common cache plugins
        if (function_exists('wp_cache_clear_cache')) wp_cache_clear_cache();
        if (function_exists('w3tc_flush_all'))        w3tc_flush_all();
        if (function_exists('rocket_clean_domain'))   rocket_clean_domain();
        if (function_exists('sg_cachepress_purge_cache')) sg_cachepress_purge_cache();
        if (class_exists('LiteSpeed_Cache_API'))      \LiteSpeed_Cache_API::purge_all();
        if (function_exists('wpfc_clear_all_cache'))  wpfc_clear_all_cache();

        wp_cache_flush();
    }

    // ─── Auth ────────────────────────────────────────────────────────

    public function check_permission($request = null) {
        $stored = get_option('ignyous_bridge_api_key', '');
        if (empty($stored)) return false;

        $xkey = '';
        if (function_exists('getallheaders')) {
            foreach (getallheaders() as $k => $v) { if (strtolower($k) === 'x-ignyous-key') { $xkey = $v; break; } }
        }
        if (empty($xkey)) $xkey = $_SERVER['HTTP_X_IGNYOUS_KEY'] ?? '';
        if (!empty($xkey) && hash_equals($stored, trim($xkey))) return true;

        $auth = '';
        if (function_exists('getallheaders')) {
            foreach (getallheaders() as $k => $v) { if (strtolower($k) === 'authorization') { $auth = $v; break; } }
        }
        if (empty($auth)) $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if (preg_match('/Bearer\s+(.+)/i', $auth, $m) && hash_equals($stored, trim($m[1]))) return true;

        $api_key = $request ? ($request->get_param('api_key') ?? '') : '';
        if (!empty($api_key) && hash_equals($stored, trim($api_key))) return true;

        return false;
    }
}
