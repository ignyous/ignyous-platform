<?php
/**
 * Ignyous AI Bridge — Universal Content Scanner
 * Finds ANY content across all WordPress storage locations.
 * Pattern-aware: phone numbers (15+ formats), emails, URLs
 * Safe: excludes timestamps, plugin internals, serialized keys
 *
 * Endpoints:
 *   POST /ignyous/v1/scan/content  — scan for text/patterns
 *   POST /ignyous/v1/scan/replace  — find and replace across the site
 */

add_action('rest_api_init', function() {
    $p = 'ignyous_check_permission';
    register_rest_route('ignyous/v1', '/scan/content', [
        'methods'  => 'POST',
        'callback' => 'ignyous_scan_content',
        'permission_callback' => $p,
    ]);
    register_rest_route('ignyous/v1', '/scan/replace', [
        'methods'  => 'POST',
        'callback' => 'ignyous_scan_replace',
        'permission_callback' => $p,
    ]);
});

// ═══════════════════════════════════════════════════════════════
// CONTENT SCANNER
// ═══════════════════════════════════════════════════════════════

function ignyous_scan_content(WP_REST_Request $req) {
    $p       = $req->get_json_params();
    $query   = $p['query']   ?? '';     // exact text to find
    $pattern = $p['pattern'] ?? '';     // 'phone', 'email', 'url', 'date', or custom regex
    $scope   = $p['scope']   ?? 'all'; // 'all', 'pages', 'posts', 'options', 'forms'

    if (!$query && !$pattern) {
        return new WP_Error('no_query', 'Provide query (text) or pattern (phone/email/url)', ['status' => 400]);
    }

    $matches = [];

    // Build regex based on pattern type
    $regex = '';
    if ($pattern === 'phone') {
        // Matches 15+ phone formats: (555) 555-5555, 555-555-5555, 555.555.5555, +1 555 555 5555, etc.
        $regex = '/(?<!\d)(?:'
            . '(?:\+?1[\s.-]?)?'                           // optional +1 prefix
            . '(?:'
            . '\(\d{3}\)[\s.-]?\d{3}[\s.-]?\d{4}'          // (555) 555-5555
            . '|\d{3}[\s.-]\d{3}[\s.-]\d{4}'               // 555-555-5555 or 555.555.5555
            . '|\d{3}[\s.-]\d{4}'                           // 555-5555 (7-digit)
            . '|\d{10,11}'                                  // 5555555555 or 15555555555
            . ')'
            . ')(?!\d)/';
    } elseif ($pattern === 'email') {
        $regex = '/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/';
    } elseif ($pattern === 'url') {
        $regex = '/https?:\/\/[^\s<>"\']+/i';
    } elseif ($pattern === 'date') {
        // MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD, Month DD YYYY
        $regex = '/(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})/i';
    } elseif ($pattern) {
        // Custom regex passed directly
        $regex = $pattern;
    }

    // ── Scan published pages ───────────────────────────────────
    if (in_array($scope, ['all', 'pages'])) {
        $pages = get_posts(['post_type' => 'page', 'posts_per_page' => -1, 'post_status' => 'any']);
        foreach ($pages as $page) {
            $content = $page->post_content;
            // Also check Elementor data
            $el_data = get_post_meta($page->ID, '_elementor_data', true);
            $full_text = $content . ' ' . ($el_data ?: '');

            $found = ignyous_find_in_text($full_text, $query, $regex);
            foreach ($found as $match) {
                $matches[] = [
                    'value'    => $match['value'],
                    'context'  => $match['context'],
                    'location' => 'page',
                    'pageId'   => $page->ID,
                    'pageTitle'=> $page->post_title,
                    'pageStatus' => $page->post_status,
                ];
            }
        }
    }

    // ── Scan posts ─────────────────────────────────────────────
    if (in_array($scope, ['all', 'posts'])) {
        $posts = get_posts(['post_type' => 'post', 'posts_per_page' => -1, 'post_status' => 'any']);
        foreach ($posts as $post) {
            $full_text = $post->post_content;
            $el_data   = get_post_meta($post->ID, '_elementor_data', true);
            if ($el_data) $full_text .= ' ' . $el_data;

            $found = ignyous_find_in_text($full_text, $query, $regex);
            foreach ($found as $match) {
                $matches[] = [
                    'value'    => $match['value'],
                    'context'  => $match['context'],
                    'location' => 'post',
                    'pageId'   => $post->ID,
                    'pageTitle'=> $post->post_title,
                ];
            }
        }
    }

    // ── Scan post meta (carefully) ─────────────────────────────
    if (in_array($scope, ['all', 'pages', 'posts'])) {
        global $wpdb;
        // Only scan visible meta keys (skip internal WP/plugin keys)
        $skip_prefixes = ['_edit_', '_wp_', '_oembed', '_transient', '_encloseme', '_pingme'];
        $meta_rows = $wpdb->get_results(
            "SELECT pm.meta_id, pm.post_id, pm.meta_key, pm.meta_value, p.post_title, p.post_type 
             FROM {$wpdb->postmeta} pm 
             JOIN {$wpdb->posts} p ON p.ID = pm.post_id 
             WHERE p.post_status IN ('publish','draft')
             AND LENGTH(pm.meta_value) > 5 
             AND LENGTH(pm.meta_value) < 50000
             LIMIT 5000"
        );
        foreach ($meta_rows as $row) {
            // Skip internal meta
            $skip = false;
            foreach ($skip_prefixes as $prefix) {
                if (strpos($row->meta_key, $prefix) === 0) { $skip = true; break; }
            }
            if ($skip) continue;

            $text = ignyous_maybe_unserialize_text($row->meta_value);
            $found = ignyous_find_in_text($text, $query, $regex);
            foreach ($found as $match) {
                // Filter out false positives: timestamps, version numbers, IDs
                if ($pattern === 'phone' && ignyous_is_false_phone($match['value'], $row->meta_key)) continue;

                $matches[] = [
                    'value'     => $match['value'],
                    'context'   => $match['context'],
                    'location'  => 'postmeta',
                    'pageId'    => (int) $row->post_id,
                    'pageTitle' => $row->post_title,
                    'metaKey'   => $row->meta_key,
                ];
            }
        }
    }

    // ── Scan WordPress options ──────────────────────────────────
    if (in_array($scope, ['all', 'options'])) {
        global $wpdb;
        $safe_options = [
            'blogname', 'blogdescription', 'admin_email', 'home', 'siteurl',
            'widget_%', 'sidebars_widgets', 'nav_menu_%', 'theme_mods_%',
        ];
        // Scan options that could contain visible content
        $opts = $wpdb->get_results(
            "SELECT option_name, option_value FROM {$wpdb->options}
             WHERE autoload != 'no'
             AND LENGTH(option_value) > 5
             AND LENGTH(option_value) < 100000
             AND option_name NOT LIKE '_transient_%'
             AND option_name NOT LIKE '_site_transient_%'
             LIMIT 500"
        );
        foreach ($opts as $opt) {
            $text  = ignyous_maybe_unserialize_text($opt->option_value);
            $found = ignyous_find_in_text($text, $query, $regex);
            foreach ($found as $match) {
                if ($pattern === 'phone' && ignyous_is_false_phone($match['value'], $opt->option_name)) continue;

                $matches[] = [
                    'value'      => $match['value'],
                    'context'    => $match['context'],
                    'location'   => 'option',
                    'optionName' => $opt->option_name,
                ];
            }
        }
    }

    // ── Scan form content ──────────────────────────────────────
    if (in_array($scope, ['all', 'forms'])) {
        // CF7 forms are stored as posts
        $cf7_forms = get_posts(['post_type' => 'wpcf7_contact_form', 'posts_per_page' => -1]);
        foreach ($cf7_forms as $form) {
            $text  = $form->post_content;
            $found = ignyous_find_in_text($text, $query, $regex);
            foreach ($found as $match) {
                $matches[] = [
                    'value'    => $match['value'],
                    'context'  => $match['context'],
                    'location' => 'form',
                    'formId'   => $form->ID,
                    'formTitle'=> $form->post_title,
                    'formPlugin' => 'cf7',
                ];
            }
        }
    }

    // ── Deduplicate by value + location ─────────────────────────
    $unique = [];
    $counts = [];
    foreach ($matches as $m) {
        $key = $m['value'] . '|' . ($m['pageId'] ?? '') . '|' . ($m['optionName'] ?? '') . '|' . ($m['metaKey'] ?? '');
        if (!isset($unique[$key])) {
            $unique[$key] = $m;
            $counts[$m['value']] = ($counts[$m['value']] ?? 0) + 1;
        }
    }
    $results = array_values($unique);

    // ── Group by value for summary ─────────────────────────────
    $grouped = [];
    foreach ($results as $r) {
        $val = $r['value'];
        if (!isset($grouped[$val])) {
            $grouped[$val] = ['value' => $val, 'count' => 0, 'locations' => []];
        }
        $grouped[$val]['count']++;
        $loc = $r['pageTitle'] ?? $r['optionName'] ?? $r['formTitle'] ?? 'unknown';
        if (!in_array($loc, $grouped[$val]['locations'])) {
            $grouped[$val]['locations'][] = $loc;
        }
    }
    $summary = array_values($grouped);
    usort($summary, fn($a, $b) => $b['count'] <=> $a['count']);

    return [
        'success'     => true,
        'query'       => $query ?: $pattern,
        'total'       => count($results),
        'unique_values' => count($summary),
        'matches'     => array_slice($results, 0, 100), // cap at 100 for response size
        'summary'     => array_slice($summary, 0, 30),
    ];
}

// ═══════════════════════════════════════════════════════════════
// FIND & REPLACE
// ═══════════════════════════════════════════════════════════════

function ignyous_scan_replace(WP_REST_Request $req) {
    $p       = $req->get_json_params();
    $find    = $p['find']    ?? '';
    $replace = $p['replace'] ?? '';
    $scope   = $p['scope']   ?? 'all';
    $targets = $p['targets'] ?? []; // optional: specific pageIds/optionNames to limit scope

    if (!$find) return new WP_Error('no_find', 'Provide find text', ['status' => 400]);

    $replaced = 0;
    global $wpdb;

    // ── Replace in post content ────────────────────────────────
    if (in_array($scope, ['all', 'pages', 'posts'])) {
        $post_types = [];
        if (in_array($scope, ['all', 'pages'])) $post_types[] = 'page';
        if (in_array($scope, ['all', 'posts'])) $post_types[] = 'post';

        $placeholders = implode(',', array_fill(0, count($post_types), '%s'));
        $posts = $wpdb->get_results($wpdb->prepare(
            "SELECT ID, post_content FROM {$wpdb->posts} WHERE post_type IN ($placeholders) AND post_content LIKE %s",
            ...array_merge($post_types, ['%' . $wpdb->esc_like($find) . '%'])
        ));

        foreach ($posts as $post) {
            if (!empty($targets) && !in_array($post->ID, $targets)) continue;
            $new_content = str_replace($find, $replace, $post->post_content);
            if ($new_content !== $post->post_content) {
                $wpdb->update($wpdb->posts, ['post_content' => $new_content], ['ID' => $post->ID]);
                clean_post_cache($post->ID);
                $replaced++;
            }

            // Also replace in Elementor data
            $el_data = get_post_meta($post->ID, '_elementor_data', true);
            if ($el_data && strpos($el_data, $find) !== false) {
                $new_el = str_replace($find, $replace, $el_data);
                update_post_meta($post->ID, '_elementor_data', wp_slash($new_el));
                $replaced++;
            }
        }
    }

    // ── Replace in post meta ───────────────────────────────────
    if (in_array($scope, ['all', 'pages', 'posts'])) {
        $metas = $wpdb->get_results($wpdb->prepare(
            "SELECT meta_id, post_id, meta_key, meta_value FROM {$wpdb->postmeta}
             WHERE meta_value LIKE %s AND meta_key NOT LIKE '\\_wp\\_%' AND meta_key NOT LIKE '\\_edit\\_%'",
            '%' . $wpdb->esc_like($find) . '%'
        ));
        foreach ($metas as $meta) {
            if (!empty($targets) && !in_array($meta->post_id, $targets)) continue;
            $new_val = ignyous_safe_replace_in_serialized($meta->meta_value, $find, $replace);
            if ($new_val !== $meta->meta_value) {
                $wpdb->update($wpdb->postmeta, ['meta_value' => $new_val], ['meta_id' => $meta->meta_id]);
                $replaced++;
            }
        }
    }

    // ── Replace in options ─────────────────────────────────────
    if (in_array($scope, ['all', 'options'])) {
        $opts = $wpdb->get_results($wpdb->prepare(
            "SELECT option_name, option_value FROM {$wpdb->options}
             WHERE option_value LIKE %s
             AND option_name NOT LIKE '\\_transient\\_%'
             AND option_name NOT LIKE '\\_site_transient\\_%'",
            '%' . $wpdb->esc_like($find) . '%'
        ));
        foreach ($opts as $opt) {
            if (!empty($targets) && !in_array($opt->option_name, $targets)) continue;
            $new_val = ignyous_safe_replace_in_serialized($opt->option_value, $find, $replace);
            if ($new_val !== $opt->option_value) {
                update_option($opt->option_name, $new_val);
                $replaced++;
            }
        }
    }

    // ── Replace in CF7 forms ───────────────────────────────────
    if (in_array($scope, ['all', 'forms'])) {
        $cf7 = $wpdb->get_results($wpdb->prepare(
            "SELECT ID, post_content FROM {$wpdb->posts} WHERE post_type = 'wpcf7_contact_form' AND post_content LIKE %s",
            '%' . $wpdb->esc_like($find) . '%'
        ));
        foreach ($cf7 as $form) {
            $new = str_replace($find, $replace, $form->post_content);
            if ($new !== $form->post_content) {
                $wpdb->update($wpdb->posts, ['post_content' => $new], ['ID' => $form->ID]);
                $replaced++;
            }
        }
    }

    // ── Clear all caches ───────────────────────────────────────
    wp_cache_flush();
    if (function_exists('rocket_clean_domain'))   rocket_clean_domain();
    if (class_exists('LiteSpeed_Cache_API'))      LiteSpeed_Cache_API::purge_all();
    if (function_exists('w3tc_flush_all'))        w3tc_flush_all();
    if (function_exists('wp_cache_clear_cache'))  wp_cache_clear_cache();
    if (class_exists('WpFastestCache') && method_exists('WpFastestCache', 'deleteCache')) {
        (new WpFastestCache())->deleteCache();
    }
    if (class_exists('\Elementor\Plugin')) {
        \Elementor\Plugin::$instance->files_manager->clear_cache();
    }

    return [
        'success'      => true,
        'find'         => $find,
        'replace'      => $replace,
        'replacements' => $replaced,
        'cache_cleared' => true,
    ];
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function ignyous_find_in_text($text, $query, $regex) {
    $results = [];
    if (!$text || strlen($text) < 3) return $results;

    if ($regex) {
        // Pattern-based search
        if (preg_match_all($regex, $text, $m, PREG_OFFSET_CAPTURE)) {
            foreach ($m[0] as $match) {
                $value  = trim($match[0]);
                $offset = $match[1];
                $start  = max(0, $offset - 30);
                $len    = min(strlen($text) - $start, strlen($value) + 60);
                $context = substr($text, $start, $len);
                // Clean context (strip HTML/shortcodes for readability)
                $context = wp_strip_all_tags($context);
                $context = preg_replace('/\s+/', ' ', $context);
                $results[] = ['value' => $value, 'context' => trim($context)];
            }
        }
    } elseif ($query) {
        // Exact text search (case-insensitive)
        $pos    = 0;
        $lower  = strtolower($text);
        $search = strtolower($query);
        while (($found = strpos($lower, $search, $pos)) !== false) {
            $actual  = substr($text, $found, strlen($query));
            $start   = max(0, $found - 30);
            $len     = min(strlen($text) - $start, strlen($query) + 60);
            $context = wp_strip_all_tags(substr($text, $start, $len));
            $context = preg_replace('/\s+/', ' ', $context);
            $results[] = ['value' => $actual, 'context' => trim($context)];
            $pos = $found + strlen($query);
        }
    }

    return $results;
}

function ignyous_is_false_phone($value, $context_key) {
    // Filter out false positive phone matches
    $numeric = preg_replace('/\D/', '', $value);

    // Too short or too long to be a phone number
    if (strlen($numeric) < 7 || strlen($numeric) > 15) return true;

    // Looks like a timestamp (10 digits starting with 1, common for Unix timestamps)
    if (strlen($numeric) === 10 && $numeric[0] === '1' && intval(substr($numeric, 0, 4)) > 1900) {
        // Could be a timestamp if it's in a timestamp-like meta key
        $ts_keys = ['time', 'date', 'timestamp', 'modified', 'created', 'updated', 'last_', 'backup', 'cron', 'schedule'];
        foreach ($ts_keys as $tk) {
            if (stripos($context_key, $tk) !== false) return true;
        }
    }

    // Common false positive meta keys
    $false_keys = ['_edit_lock', '_edit_last', 'updraft_', 'wpseo', '_transient', 'cron', 'auto_draft', 'revision'];
    foreach ($false_keys as $fk) {
        if (stripos($context_key, $fk) !== false) return true;
    }

    return false;
}

function ignyous_maybe_unserialize_text($value) {
    // If serialized, extract visible text values
    if (is_serialized($value)) {
        $unserialized = @unserialize($value);
        if (is_array($unserialized) || is_object($unserialized)) {
            return ignyous_flatten_to_text($unserialized);
        }
    }
    return $value;
}

function ignyous_flatten_to_text($data, $depth = 0) {
    if ($depth > 5) return '';
    $texts = [];
    if (is_array($data) || is_object($data)) {
        foreach ((array)$data as $v) {
            $texts[] = ignyous_flatten_to_text($v, $depth + 1);
        }
    } elseif (is_string($data) && strlen($data) > 3) {
        $texts[] = $data;
    }
    return implode(' ', array_filter($texts));
}

function ignyous_safe_replace_in_serialized($value, $find, $replace) {
    if (is_serialized($value)) {
        // For serialized data, we need to update string lengths
        // Simple approach: unserialize, replace in strings, reserialize
        $data = @unserialize($value);
        if ($data !== false) {
            $data = ignyous_deep_replace($data, $find, $replace);
            return serialize($data);
        }
    }
    // Plain text replacement
    return str_replace($find, $replace, $value);
}

function ignyous_deep_replace($data, $find, $replace) {
    if (is_string($data)) {
        return str_replace($find, $replace, $data);
    }
    if (is_array($data)) {
        foreach ($data as $k => $v) {
            $data[$k] = ignyous_deep_replace($v, $find, $replace);
        }
    }
    if (is_object($data)) {
        foreach (get_object_vars($data) as $k => $v) {
            $data->$k = ignyous_deep_replace($v, $find, $replace);
        }
    }
    return $data;
}
