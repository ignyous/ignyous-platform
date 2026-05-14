<?php
namespace Ignyous\Api;

/**
 * OptionsController — general-purpose DB scanner, updater, and plugin knowledge store.
 *
 * Endpoints:
 *   GET  /ignyous/v1/options/scan?query=<text>   — find where text is stored, confidence-scored
 *   POST /ignyous/v1/options/update               — update a specific option field
 *   POST /ignyous/v1/elementor/logo-size          — set Elementor logo width via kit custom CSS
 *   GET  /ignyous/v1/plugin-knowledge             — retrieve stored plugin knowledge map
 *   POST /ignyous/v1/plugin-knowledge             — save/merge plugin knowledge
 */
class OptionsController {
    const KNOWLEDGE_OPTION = 'ignyous_plugin_knowledge';

    public function register_routes() {
        register_rest_route('ignyous/v1', '/options/scan', [
            'methods'             => 'GET',
            'callback'            => [$this, 'scan_options'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route('ignyous/v1', '/options/update', [
            'methods'             => 'POST',
            'callback'            => [$this, 'update_option_field'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route('ignyous/v1', '/content/find', [
            'methods'             => 'GET',
            'callback'            => [$this, 'find_content'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route('ignyous/v1', '/content/replace', [
            'methods'             => 'POST',
            'callback'            => [$this, 'replace_content'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        // Elementor-specific: set logo width via custom CSS in kit
        register_rest_route('ignyous/v1', '/elementor/logo-size', [
            'methods'             => 'POST',
            'callback'            => [$this, 'set_elementor_logo_size'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        // Plugin knowledge store
        register_rest_route('ignyous/v1', '/plugin-knowledge', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_plugin_knowledge'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route('ignyous/v1', '/plugin-knowledge', [
            'methods'             => 'POST',
            'callback'            => [$this, 'save_plugin_knowledge'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
    }

    // ── Elementor logo sizing ─────────────────────────────────────────────
    /**
     * Set logo width for Elementor sites by injecting CSS into the active kit.
     * Elementor has no native logo-width control (free version).
     * We write .elementor-site-logo img { max-width: Xpx !important; } into custom_css.
     *
     * Body: { width_px: 180 }  (or scale_percent: 50)
     */
    public function set_elementor_logo_size($request) {
        $body       = $request->get_json_params();
        $width_px   = (int) ($body['width_px']     ?? 0);
        $scale_pct  = (float) ($body['scale_percent'] ?? 0);

        $kit_id = get_option('elementor_active_kit');
        if (!$kit_id) return new \WP_Error('no_kit', 'Elementor active kit not found', ['status' => 404]);

        // If scale_percent, get current logo dimensions to calculate target width
        if ($scale_pct > 0 && !$width_px) {
            $logo_id = get_theme_mod('custom_logo');
            if ($logo_id) {
                $meta = wp_get_attachment_metadata($logo_id);
                $orig_w = (int) ($meta['width'] ?? 0);
                if ($orig_w) $width_px = (int) round($orig_w * $scale_pct / 100);
            }
        }

        if (!$width_px) return new \WP_Error('missing', 'width_px or scale_percent required', ['status' => 400]);

        $settings = get_post_meta($kit_id, '_elementor_page_settings', true);
        if (!is_array($settings)) $settings = [];

        $existing_css = $settings['custom_css'] ?? '';
        // Remove any existing ignyous logo-size rule
        $existing_css = preg_replace('/\/\*\s*ignyous-logo-size\s*\*\/.*?\/\*\s*end-ignyous-logo-size\s*\*\//s', '', $existing_css);
        $existing_css = trim($existing_css);

        $new_rule = "\n/* ignyous-logo-size */\n.elementor-site-logo img { max-width: {$width_px}px !important; }\n/* end-ignyous-logo-size */";
        $settings['custom_css'] = $existing_css . $new_rule;

        update_post_meta($kit_id, '_elementor_page_settings', $settings);

        // Flush Elementor CSS cache so the new CSS is generated
        delete_post_meta($kit_id, '_elementor_css');
        do_action('elementor/core/files/clear_cache');

        return [
            'success'    => true,
            'kit_id'     => $kit_id,
            'width_px'   => $width_px,
            'css_added'  => $new_rule,
            'message'    => "Logo max-width set to {$width_px}px via Elementor kit custom CSS.",
        ];
    }

    // ── Plugin knowledge store ────────────────────────────────────────────
    public function get_plugin_knowledge($request) {
        $knowledge = get_option(self::KNOWLEDGE_OPTION, []);
        return ['success' => true, 'knowledge' => $knowledge];
    }

    public function save_plugin_knowledge($request) {
        $body      = $request->get_json_params();
        $new_data  = $body['knowledge'] ?? [];
        $existing  = get_option(self::KNOWLEDGE_OPTION, []);
        $merged    = array_merge($existing, $new_data); // merge by plugin slug key
        update_option(self::KNOWLEDGE_OPTION, $merged);
        return ['success' => true, 'saved_keys' => array_keys($new_data), 'total_plugins_known' => count($merged)];
    }


    /**
     * Scan wp_options for a query string.
     * Returns matches with: option_name, field_path, current_value, context, confidence (0–100).
     */
    public function scan_options($request) {
        global $wpdb;
        $query = sanitize_text_field($request->get_param('query') ?? '');
        if (strlen($query) < 2) {
            return new \WP_Error('query_too_short', 'query must be at least 2 characters', ['status' => 400]);
        }

        $like   = '%' . $wpdb->esc_like($query) . '%';
        $rows   = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT option_name, option_value FROM {$wpdb->options}
                 WHERE option_value LIKE %s
                   AND option_name NOT LIKE '\_%'
                   AND option_name NOT LIKE '%transient%'
                   AND option_name NOT LIKE '%session%'
                   AND option_name NOT LIKE '%_nonce%'
                 LIMIT 50",
                $like
            )
        );

        $results = [];
        foreach ($rows as $row) {
            $matches = $this->find_matches_in_value($row->option_name, $row->option_value, $query);
            foreach ($matches as $match) {
                $results[] = $match;
            }
        }

        // Also search post meta for common content areas
        $meta_rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT pm.meta_key, pm.meta_value, p.post_title, p.post_type, pm.post_id
                 FROM {$wpdb->postmeta} pm
                 JOIN {$wpdb->posts} p ON p.ID = pm.post_id
                 WHERE pm.meta_value LIKE %s
                   AND p.post_status = 'publish'
                 LIMIT 20",
                $like
            )
        );

        foreach ($meta_rows as $row) {
            $results[] = [
                'source'        => 'post_meta',
                'option_name'   => null,
                'post_id'       => (int) $row->post_id,
                'post_title'    => $row->post_title,
                'post_type'     => $row->post_type,
                'meta_key'      => $row->meta_key,
                'field_path'    => 'post_meta:' . $row->post_id . ':' . $row->meta_key,
                'current_value' => $this->extract_context($row->meta_value, $query),
                'confidence'    => $this->score_confidence($row->meta_key, $row->meta_value, $query, 'meta'),
                'update_method' => 'post_meta',
            ];
        }

        // Sort by confidence desc
        usort($results, function($a, $b) { return $b['confidence'] - $a['confidence']; });

        return ['success' => true, 'query' => $query, 'count' => count($results), 'matches' => $results];
    }

    private function find_matches_in_value($option_name, $option_value, $query) {
        $matches = [];

        if (is_serialized($option_value)) {
            $data = @unserialize($option_value);
            if (is_array($data)) {
                $flat = $this->flatten_array($data);
                foreach ($flat as $path => $val) {
                    if (is_string($val) && stripos($val, $query) !== false) {
                        $confidence = $this->score_confidence($path, $val, $query, 'serialized_option');
                        $matches[] = [
                            'source'        => 'serialized_option',
                            'option_name'   => $option_name,
                            'field_path'    => $option_name . '.' . $path,
                            'array_key'     => $path,
                            'current_value' => $this->extract_context($val, $query),
                            'full_value'    => strlen($val) < 500 ? $val : substr($val, 0, 500) . '…',
                            'confidence'    => $confidence,
                            'update_method' => 'serialized_field',
                        ];
                    }
                }
                return $matches;
            }
        }

        // Plain string option
        if (stripos($option_value, $query) !== false) {
            $matches[] = [
                'source'        => 'option',
                'option_name'   => $option_name,
                'field_path'    => $option_name,
                'array_key'     => null,
                'current_value' => $this->extract_context($option_value, $query),
                'full_value'    => strlen($option_value) < 500 ? $option_value : substr($option_value, 0, 500) . '…',
                'confidence'    => $this->score_confidence($option_name, $option_value, $query, 'option'),
                'update_method' => 'option',
            ];
        }

        return $matches;
    }

    /** Flatten nested array to dot-notation paths */
    private function flatten_array($arr, $prefix = '', $depth = 0) {
        $flat = [];
        if ($depth > 6 || !is_array($arr)) return $flat;
        foreach ($arr as $k => $v) {
            $key = $prefix ? $prefix . '.' . $k : (string) $k;
            if (is_array($v)) {
                $flat = array_merge($flat, $this->flatten_array($v, $key, $depth + 1));
            } elseif (is_string($v) || is_numeric($v)) {
                $flat[$key] = (string) $v;
            }
        }
        return $flat;
    }

    /** Extract context snippet (50 chars before/after the match) */
    private function extract_context($val, $query) {
        $pos = stripos($val, $query);
        if ($pos === false) return substr($val, 0, 120);
        $start  = max(0, $pos - 40);
        $end    = min(strlen($val), $pos + strlen($query) + 40);
        $snip   = substr($val, $start, $end - $start);
        return ($start > 0 ? '…' : '') . $snip . ($end < strlen($val) ? '…' : '');
    }

    /** Score confidence that this match is the canonical place to update */
    private function score_confidence($key, $value, $query, $source) {
        $score = 50; // base

        // High-confidence keys for content types
        $high_keys = ['phone', 'email', 'address', 'logo', 'site_name', 'blogname', 'tagline',
                      'footer_text', 'footer_text1', 'copyright', 'contact'];
        foreach ($high_keys as $hk) {
            if (stripos((string) $key, $hk) !== false) { $score += 30; break; }
        }

        // Prefer shorter, direct values (more likely the canonical source)
        if (strlen($value) < 200) $score += 15;
        if (strlen($value) < 50)  $score += 10;

        // Prefer plain options over serialized
        if ($source === 'option')    $score += 10;
        if ($source === 'meta')      $score -= 5;

        // Penalise transient/cache options
        if (stripos((string) $key, 'cache') !== false) $score -= 30;
        if (stripos((string) $key, 'log')   !== false) $score -= 10;

        return min(100, max(0, $score));
    }

    /**
     * Update a specific field identified by the scan endpoint.
     * Body: { field_path, new_value, update_method, option_name?, array_key?, post_id?, meta_key? }
     */
    public function update_option_field($request) {
        $body          = $request->get_json_params();
        $update_method = $body['update_method'] ?? '';
        $new_value     = $body['new_value']     ?? '';
        $field_path    = $body['field_path']    ?? '';

        switch ($update_method) {
            case 'option':
                $name = $body['option_name'] ?? '';
                if (!$name) return new \WP_Error('missing', 'option_name required', ['status' => 400]);
                $old = get_option($name);
                update_option($name, $new_value);
                return ['success' => true, 'updated' => $name, 'old' => $old, 'new' => $new_value];

            case 'serialized_field':
                $name    = $body['option_name'] ?? '';
                $arr_key = $body['array_key']   ?? '';
                if (!$name || !$arr_key) return new \WP_Error('missing', 'option_name and array_key required', ['status' => 400]);

                // get_option() returns an already-unserialized PHP value — do NOT check is_serialized()
                $data = get_option($name, null);
                if ($data === null) return new \WP_Error('not_found', "Option '{$name}' does not exist", ['status' => 404]);
                if (!is_array($data)) return new \WP_Error('not_array', "Option '{$name}' is not an array (type: " . gettype($data) . ")", ['status' => 400]);

                $old = $this->get_nested($data, $arr_key);

                // Smart sanitization: if the old value (or new value) is a plain number
                // but new value has CSS units (px, em, %, rem) — strip the unit.
                // Handles theme fields like "opt-logo-max-width" that store "180" not "180px".
                $sanitized_value = $new_value;
                if (preg_match('/^(\d+(?:\.\d+)?)\s*(px|em|rem|%|pt|vh|vw)$/i', trim($new_value), $m)) {
                    // New value has a unit — check if old value was unitless or empty
                    if ($old === '' || $old === null || is_numeric($old)) {
                        $sanitized_value = $m[1]; // strip the unit
                    }
                }

                $this->set_nested($data, $arr_key, $sanitized_value);

                // Force save: clear cache, delete, re-add (bypasses WP "no change" skip)
                wp_cache_delete($name, 'options');
                delete_option($name);
                add_option($name, $data, '', 'yes');
                wp_cache_delete($name, 'options');

                // Verify
                $saved = get_option($name);
                $saved_val = $this->get_nested($saved, $arr_key);
                if ($saved_val != $sanitized_value) {
                    // Fallback to update_option
                    update_option($name, $data);
                    wp_cache_delete($name, 'options');
                    $saved = get_option($name);
                    $saved_val = $this->get_nested($saved, $arr_key);
                }
                $note = ($sanitized_value !== $new_value) ? " (unit stripped: '{$new_value}'→'{$sanitized_value}')" : '';
                return ['success' => true, 'updated' => $field_path, 'old' => $old, 'new' => $saved_val, 'note' => $note];

            case 'post_meta':
                $post_id  = (int) ($body['post_id']  ?? 0);
                $meta_key = $body['meta_key'] ?? '';
                if (!$post_id || !$meta_key) return new \WP_Error('missing', 'post_id and meta_key required', ['status' => 400]);
                $old = get_post_meta($post_id, $meta_key, true);
                update_post_meta($post_id, $meta_key, $new_value);
                return ['success' => true, 'updated' => $field_path, 'old' => $old, 'new' => $new_value];

            default:
                return new \WP_Error('unknown_method', 'Unknown update_method: ' . $update_method, ['status' => 400]);
        }
    }

    /** Get value from nested array using dot-notation path */
    private function get_nested($arr, $path) {
        $keys = explode('.', $path);
        $cur  = $arr;
        foreach ($keys as $k) {
            if (!is_array($cur) || !array_key_exists($k, $cur)) return null;
            $cur = $cur[$k];
        }
        return $cur;
    }

    /** Set value in nested array using dot-notation path */
    private function set_nested(&$arr, $path, $value) {
        $keys = explode('.', $path);
        $cur  = &$arr;
        foreach ($keys as $k) {
            if (!is_array($cur)) $cur = [];
            if (!array_key_exists($k, $cur)) $cur[$k] = [];
            $cur = &$cur[$k];
        }
        $cur = $value;
    }

    /**
     * Find content in posts, pages, and meta (for phone numbers, emails, addresses, etc.)
     * Confidence-scored so AI can decide what to update.
     */
    public function find_content($request) {
        global $wpdb;
        $query   = sanitize_text_field($request->get_param('query') ?? '');
        $page_id = (int) ($request->get_param('page_id') ?? 0);
        if (strlen($query) < 2) return new \WP_Error('too_short', 'query too short', ['status' => 400]);

        $results = [];
        $variants = $this->get_quote_variants($query);

        foreach ($variants as $variant) {
            $like = '%' . $wpdb->esc_like($variant) . '%';

            // 1. Search post_content
            $where  = $page_id ? $wpdb->prepare("AND ID = %d", $page_id) : '';
            $posts  = $wpdb->get_results($wpdb->prepare(
                "SELECT ID, post_title, post_type, post_status, post_content
                 FROM {$wpdb->posts}
                 WHERE post_content LIKE %s AND post_status IN ('publish','draft') {$where} LIMIT 20",
                $like
            ));
            foreach ($posts as $p) {
                $results[] = [
                    'source' => 'post_content', 'post_id' => (int) $p->ID,
                    'post_title' => $p->post_title, 'post_type' => $p->post_type,
                    'context' => $this->extract_context($p->post_content, $variant),
                    'confidence' => 80, 'found_variant' => $variant,
                ];
            }

            // 2. Search _elementor_data post meta
            $meta_where = $page_id ? $wpdb->prepare("AND pm.post_id = %d", $page_id) : '';
            $meta_rows  = $wpdb->get_results($wpdb->prepare(
                "SELECT pm.post_id, pm.meta_value, p.post_title
                 FROM {$wpdb->postmeta} pm
                 JOIN {$wpdb->posts} p ON p.ID = pm.post_id
                 WHERE pm.meta_key = '_elementor_data' AND pm.meta_value LIKE %s
                   AND p.post_status IN ('publish','draft') {$meta_where} LIMIT 20",
                $like
            ));
            foreach ($meta_rows as $r) {
                // Skip if we already found this page in post_content
                $already = false;
                foreach ($results as $res) { if ($res['post_id'] === (int) $r->post_id) { $already = true; break; } }
                if (!$already) {
                    $results[] = [
                        'source' => 'elementor_data', 'post_id' => (int) $r->post_id,
                        'post_title' => $r->post_title, 'post_type' => 'page',
                        'context' => $this->extract_context($r->meta_value, $variant),
                        'confidence' => 90, 'found_variant' => $variant,
                    ];
                }
            }
        }

        // Deduplicate by post_id
        $seen = [];
        $unique = array_filter($results, function($r) use (&$seen) {
            if (in_array($r['post_id'], $seen)) return false;
            $seen[] = $r['post_id'];
            return true;
        });

        return ['success' => true, 'query' => $query, 'count' => count($unique), 'matches' => array_values($unique)];
    }

    /**
     * Replace content across posts. Searches both post_content AND _elementor_data.
     * Body: { find, replace, scope, page_id? }
     */
    public function replace_content($request) {
        global $wpdb;
        $body    = $request->get_json_params();
        $find    = $body['find']    ?? '';
        $replace = $body['replace'] ?? '';
        $scope   = $body['scope']   ?? 'all';
        $page_id = (int) ($body['page_id'] ?? 0);

        if (strlen($find) < 2) return new \WP_Error('too_short', 'find must be at least 2 chars', ['status' => 400]);

        $updated  = [];
        $variants = $this->get_quote_variants($find);
        $where    = $page_id ? $wpdb->prepare("AND ID = %d", $page_id) : '';

        if (in_array($scope, ['all', 'posts'])) {
            // Try each quote variant
            foreach ($variants as $variant) {
                $like  = '%' . $wpdb->esc_like($variant) . '%';

                // 1. Replace in post_content
                $posts = $wpdb->get_results($wpdb->prepare(
                    "SELECT ID, post_content FROM {$wpdb->posts}
                     WHERE post_content LIKE %s AND post_status IN ('publish','draft') {$where} LIMIT 100",
                    $like
                ));
                foreach ($posts as $p) {
                    $new = str_replace($variant, $replace, $p->post_content);
                    if ($new !== $p->post_content) {
                        $wpdb->update($wpdb->posts, ['post_content' => $new], ['ID' => $p->ID]);
                        $updated[] = ['type' => 'post_content', 'id' => (int) $p->ID];
                    }
                }

                // 2. Replace in _elementor_data post meta
                $meta_where = $page_id ? $wpdb->prepare("AND pm.post_id = %d", $page_id) : '';
                $meta_rows  = $wpdb->get_results($wpdb->prepare(
                    "SELECT pm.post_id, pm.meta_value
                     FROM {$wpdb->postmeta} pm
                     JOIN {$wpdb->posts} p ON p.ID = pm.post_id
                     WHERE pm.meta_key = '_elementor_data' AND pm.meta_value LIKE %s
                       AND p.post_status IN ('publish','draft') {$meta_where} LIMIT 100",
                    $like
                ));
                foreach ($meta_rows as $r) {
                    // Skip if already updated this post via post_content
                    $already = false;
                    foreach ($updated as $u) { if ($u['id'] === (int) $r->post_id) { $already = true; break; } }
                    if ($already) continue;

                    $new = str_replace($variant, $replace, $r->meta_value);
                    if ($new !== $r->meta_value) {
                        update_post_meta($r->post_id, '_elementor_data', wp_slash($new));
                        // Also clear Elementor CSS cache for this post
                        delete_post_meta($r->post_id, '_elementor_css');
                        $updated[] = ['type' => 'elementor_data', 'id' => (int) $r->post_id];
                    }
                }
            }
        }

        // Flush Elementor CSS if any Elementor posts were updated
        $has_elementor = !empty(array_filter($updated, function($u) { return $u['type'] === 'elementor_data'; }));
        if ($has_elementor) do_action('elementor/core/files/clear_cache');

        $scope_label = $page_id ? "page ID {$page_id}" : 'all pages';
        return [
            'success'       => true,
            'find'          => $find,
            'replace'       => $replace,
            'updated_count' => count($updated),
            'updated'       => $updated,
            'scope'         => $scope_label,
            'sources_used'  => array_unique(array_column($updated, 'type')),
        ];
    }

    /**
     * Return ALL encoding variants of a string to search in the database.
     * Elementor stores text as JSON, so apostrophes become \u2019 (6-char literal).
     * We try: straight, curly UTF-8, JSON-escaped (\u2019 literal), HTML entities.
     */
    private function get_quote_variants($str) {
        $variants   = [$str];
        $map = [
            // straight apostrophe → all encoded forms
            "'"   => ["\u{2019}", "\u{2018}", '\u2019', '\u2018', '&#039;', '&#8217;', '&apos;'],
            // curly right apostrophe → straight and JSON literal
            "\u{2019}" => ["'", '\u2019', '&#8217;'],
            // curly left apostrophe
            "\u{2018}" => ["'", '\u2018', '&#8216;'],
            // straight double quote → curly and JSON
            '"'   => ["\u{201C}", "\u{201D}", '\u201c', '\u201d', '&quot;', '&#34;'],
            // curly double quotes
            "\u{201C}" => ['"', '\u201c'],
            "\u{201D}" => ['"', '\u201d'],
            // em dash
            '—'   => ['\u2014', '&#8212;', '&mdash;'],
            // en dash
            '–'   => ['\u2013', '&#8211;', '&ndash;'],
            // ellipsis
            '…'   => ['\u2026', '&#8230;', '&hellip;', '...'],
        ];

        foreach ($map as $char => $replacements) {
            if (strpos($str, $char) !== false) {
                foreach ($replacements as $alt) {
                    $v = str_replace($char, $alt, $str);
                    if ($v !== $str) $variants[] = $v;
                }
            }
        }
        return array_unique($variants);
    }

    /**
     * Replace content. Searches and updates:
     * 1. post_content (WordPress/Gutenberg)
     * 2. _elementor_data post meta (Elementor pages)
     *
     * When Elementor data is found, ALSO updates post_content for consistency.
     * Tries all punctuation encoding variants automatically.
     *
     * Body: { find, replace, scope, page_id? }
     */
    public function replace_content($request) {
        global $wpdb;
        $body    = $request->get_json_params();
        $find    = $body['find']    ?? '';
        $replace = $body['replace'] ?? '';
        $scope   = $body['scope']   ?? 'all';
        $page_id = (int) ($body['page_id'] ?? 0);

        if (strlen($find) < 2) return new \WP_Error('too_short', 'find must be at least 2 chars', ['status' => 400]);

        $updated       = [];
        $variants      = $this->get_quote_variants($find);
        $page_where    = $page_id ? $wpdb->prepare("AND ID = %d", $page_id) : '';
        $meta_where_pg = $page_id ? $wpdb->prepare("AND pm.post_id = %d", $page_id) : '';

        if (!in_array($scope, ['all', 'posts'])) {
            return ['success' => true, 'find' => $find, 'replace' => $replace, 'updated_count' => 0, 'updated' => [], 'scope' => 'none'];
        }

        // Track which post IDs were already handled via Elementor data (to avoid double-processing)
        $elementor_updated_ids = [];

        // ── 1. Elementor _elementor_data (searched first — authoritative for Elementor pages) ──
        foreach ($variants as $variant) {
            $like = '%' . $wpdb->esc_like($variant) . '%';
            $meta_where_var = $meta_where_pg;
            $rows = $wpdb->get_results($wpdb->prepare(
                "SELECT pm.post_id, pm.meta_value
                 FROM {$wpdb->postmeta} pm
                 JOIN {$wpdb->posts} p ON p.ID = pm.post_id
                 WHERE pm.meta_key = '_elementor_data'
                   AND pm.meta_value LIKE %s
                   AND p.post_status IN ('publish','draft')
                   {$meta_where_var}
                 LIMIT 100",
                $like
            ));
            foreach ($rows as $r) {
                if (in_array((int) $r->post_id, $elementor_updated_ids)) continue;

                $new_meta = str_replace($variant, $replace, $r->meta_value);
                if ($new_meta === $r->meta_value) continue;

                update_post_meta($r->post_id, '_elementor_data', wp_slash($new_meta));
                delete_post_meta($r->post_id, '_elementor_css');

                // Also update post_content to keep in sync (Elementor renders from _elementor_data
                // but post_content is used by search engines and some themes)
                $post = get_post($r->post_id);
                if ($post && stripos($post->post_content, $variant) !== false) {
                    $new_content = str_replace($variant, $replace, $post->post_content);
                    $wpdb->update($wpdb->posts, ['post_content' => $new_content], ['ID' => $r->post_id]);
                }

                $elementor_updated_ids[] = (int) $r->post_id;
                $updated[] = ['type' => 'elementor_data', 'id' => (int) $r->post_id];
            }
        }

        // ── 2. post_content (non-Elementor pages, Gutenberg, Classic Editor) ──
        foreach ($variants as $variant) {
            $like = '%' . $wpdb->esc_like($variant) . '%';
            $posts = $wpdb->get_results($wpdb->prepare(
                "SELECT ID, post_content FROM {$wpdb->posts}
                 WHERE post_content LIKE %s
                   AND post_status IN ('publish','draft')
                   {$page_where}
                 LIMIT 100",
                $like
            ));
            foreach ($posts as $p) {
                if (in_array((int) $p->ID, $elementor_updated_ids)) continue; // already handled via Elementor
                $new = str_replace($variant, $replace, $p->post_content);
                if ($new === $p->post_content) continue;
                $wpdb->update($wpdb->posts, ['post_content' => $new], ['ID' => $p->ID]);
                $updated[] = ['type' => 'post_content', 'id' => (int) $p->ID];
            }
        }

        // Flush Elementor CSS cache if any Elementor posts updated
        if (!empty($elementor_updated_ids)) {
            do_action('elementor/core/files/clear_cache');
        }

        $scope_label  = $page_id ? "page ID {$page_id}" : 'all pages';
        $sources_used = array_unique(array_column($updated, 'type'));

        return [
            'success'       => true,
            'find'          => $find,
            'replace'       => $replace,
            'updated_count' => count($updated),
            'updated'       => $updated,
            'scope'         => $scope_label,
            'sources_used'  => $sources_used,
            'variants_tried' => count($variants),
        ];
    }

    public function check_permission() {
        $stored = get_option('ignyous_bridge_api_key', '');
        if (empty($stored)) return false;
        $auth = '';
        if (function_exists('getallheaders')) {
            foreach (getallheaders() as $k => $v) { if (strtolower($k) === 'authorization') { $auth = $v; break; } }
        }
        if (empty($auth)) $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        // Also check X-Ignyous-Key
        $xkey = '';
        if (function_exists('getallheaders')) {
            foreach (getallheaders() as $k => $v) { if (strtolower($k) === 'x-ignyous-key') { $xkey = $v; break; } }
        }
        if (empty($xkey)) $xkey = $_SERVER['HTTP_X_IGNYOUS_KEY'] ?? '';
        if (!empty($xkey) && hash_equals($stored, trim($xkey))) return true;
        if (preg_match('/Bearer\s+(.+)/i', $auth, $m)) return hash_equals($stored, trim($m[1]));
        return false;
    }
}
