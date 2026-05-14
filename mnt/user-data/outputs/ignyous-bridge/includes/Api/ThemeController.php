<?php
namespace Ignyous\Api;

/**
 * ThemeController — scans theme CSS files and manages custom CSS.
 *
 * GET  /ignyous/v1/theme/scan-css?query=logo    — search style.css for matching rules
 * POST /ignyous/v1/theme/custom-css             — add/update a CSS rule in WP custom CSS or Elementor kit
 */
class ThemeController {
    public function register_routes() {
        register_rest_route('ignyous/v1', '/theme/scan-css', [
            'methods'             => 'GET',
            'callback'            => [$this, 'scan_css'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route('ignyous/v1', '/theme/custom-css', [
            'methods'             => 'POST',
            'callback'            => [$this, 'update_custom_css'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
    }

    /**
     * Scan child and parent theme style.css files for rules matching a query.
     * Returns matched rules with their selector and full declaration block.
     */
    public function scan_css($request) {
        $query    = sanitize_text_field($request->get_param('query') ?? 'logo');
        $results  = [];

        $sources = [
            'child_theme'  => get_stylesheet_directory() . '/style.css',
            'parent_theme' => get_template_directory()   . '/style.css',
        ];

        foreach ($sources as $source => $path) {
            if (!file_exists($path)) continue;
            $css     = file_get_contents($path);
            $matches = $this->find_css_rules($css, $query);
            foreach ($matches as $match) {
                $match['source']   = $source;
                $match['file']     = $path;
                $results[] = $match;
            }
        }

        // Also check WP custom CSS
        $wp_css = wp_get_custom_css();
        if ($wp_css && stripos($wp_css, $query) !== false) {
            $matches = $this->find_css_rules($wp_css, $query);
            foreach ($matches as $match) {
                $match['source'] = 'wp_custom_css';
                $results[] = $match;
            }
        }

        // Check Elementor kit custom CSS
        $kit_id = get_option('elementor_active_kit');
        if ($kit_id) {
            $kit_meta = get_post_meta($kit_id, '_elementor_page_settings', true);
            $kit_css  = is_array($kit_meta) ? ($kit_meta['custom_css'] ?? '') : '';
            if ($kit_css && stripos($kit_css, $query) !== false) {
                $matches = $this->find_css_rules($kit_css, $query);
                foreach ($matches as $match) {
                    $match['source'] = 'elementor_kit_css';
                    $results[] = $match;
                }
            }
        }

        return [
            'success' => true,
            'query'   => $query,
            'count'   => count($results),
            'matches' => $results,
        ];
    }

    /**
     * Find all CSS rules in $css that contain $query in the selector or declaration.
     * Returns array of { selector, declaration, full_rule, line_number }.
     */
    private function find_css_rules($css, $query) {
        $matches = [];
        // Match full CSS rule blocks: selector { ... }
        preg_match_all('/([^{}]+\{[^{}]*\})/s', $css, $all_rules);
        foreach ($all_rules[1] as $rule) {
            if (stripos($rule, $query) !== false) {
                // Parse selector and declaration
                $brace_pos   = strpos($rule, '{');
                $selector    = trim(substr($rule, 0, $brace_pos));
                $declaration = trim(substr($rule, $brace_pos + 1, strrpos($rule, '}') - $brace_pos - 1));
                $matches[] = [
                    'selector'    => $selector,
                    'declaration' => $declaration,
                    'full_rule'   => trim($rule),
                ];
            }
        }
        return $matches;
    }

    /**
     * Add or update a CSS rule in WP custom CSS or Elementor kit.
     * Body: { selector, declaration, target: 'wp'|'elementor' }
     *
     * If the selector already exists in the target, replaces its declaration.
     * Otherwise appends the new rule.
     *
     * Marks ignyous-managed rules with /* ignyous-managed: <selector> * /
     */
    public function update_custom_css($request) {
        $body        = $request->get_json_params();
        $selector    = trim($body['selector']    ?? '');
        $declaration = trim($body['declaration'] ?? '');
        $target      = $body['target'] ?? 'auto'; // 'wp', 'elementor', 'auto'

        if (!$selector || !$declaration) {
            return new \WP_Error('missing', 'selector and declaration required', ['status' => 400]);
        }

        // Auto-detect target
        if ($target === 'auto') {
            $kit_id = get_option('elementor_active_kit');
            $target = $kit_id ? 'elementor' : 'wp';
        }

        $new_rule = "/* ignyous-managed: {$selector} */\n{$selector} {\n{$declaration}\n}";

        if ($target === 'elementor') {
            $kit_id = get_option('elementor_active_kit');
            if (!$kit_id) return new \WP_Error('no_kit', 'No active Elementor kit', ['status' => 404]);

            $settings    = get_post_meta($kit_id, '_elementor_page_settings', true);
            if (!is_array($settings)) $settings = [];
            $existing    = $settings['custom_css'] ?? '';

            // Remove any existing ignyous rule for this selector
            $existing = preg_replace('/\/\*\s*ignyous-managed:\s*' . preg_quote($selector, '/') . '\s*\*\/\s*' . preg_quote($selector, '/') . '\s*\{[^}]*\}/s', '', $existing);
            $existing = trim($existing);

            $settings['custom_css'] = $existing . "\n\n" . $new_rule;
            update_post_meta($kit_id, '_elementor_page_settings', $settings);

            // Flush Elementor CSS cache
            delete_post_meta($kit_id, '_elementor_css');
            do_action('elementor/core/files/clear_cache');

            return ['success' => true, 'target' => 'elementor', 'selector' => $selector, 'css_added' => $new_rule];
        }

        // WP custom CSS (Customizer → Additional CSS)
        $existing = wp_get_custom_css() ?: '';
        $existing = preg_replace('/\/\*\s*ignyous-managed:\s*' . preg_quote($selector, '/') . '\s*\*\/\s*' . preg_quote($selector, '/') . '\s*\{[^}]*\}/s', '', $existing);
        $existing = trim($existing);
        $new_css  = $existing . "\n\n" . $new_rule;
        wp_update_custom_css_post($new_css);

        return ['success' => true, 'target' => 'wp_custom_css', 'selector' => $selector, 'css_added' => $new_rule];
    }

    public function check_permission() {
        $stored = get_option('ignyous_bridge_api_key', '');
        if (empty($stored)) return false;
        $xkey = $_SERVER['HTTP_X_IGNYOUS_KEY'] ?? '';
        if (!empty($xkey) && hash_equals($stored, trim($xkey))) return true;
        $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (preg_match('/Bearer\s+(.+)/i', $auth, $m)) return hash_equals($stored, trim($m[1]));
        return false;
    }
}
