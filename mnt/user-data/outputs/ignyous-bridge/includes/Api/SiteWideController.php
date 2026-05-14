<?php
namespace Ignyous\Api;

/**
 * SiteWideController — Search and replace content across EVERY storage location:
 *   - post_content (all published pages/posts)
 *   - _elementor_data (Elementor builder JSON)
 *   - wp_options (site settings, widget data)
 *   - theme_mods (Customizer settings)
 *   - nav_menu_items (menu labels & URLs)
 *
 * Used by routines like "change my phone number everywhere" or "update my email site-wide".
 */
class SiteWideController {

    public function register_routes() {
        register_rest_route('ignyous/v1', '/site-wide/search', [
            'methods'             => 'GET',
            'callback'            => [$this, 'search_everywhere'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route('ignyous/v1', '/site-wide/replace', [
            'methods'             => 'POST',
            'callback'            => [$this, 'replace_everywhere'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route('ignyous/v1', '/site-wide/logo', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_logo_info'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route('ignyous/v1', '/site-wide/logo', [
            'methods'             => 'POST',
            'callback'            => [$this, 'update_logo'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
    }

    /**
     * Search everywhere for a query string or pattern.
     *
     * GET /site-wide/search?query=845-876-6586
     * GET /site-wide/search?pattern=phone    (auto-detects all phone numbers)
     * GET /site-wide/search?pattern=email    (auto-detects all emails)
     */
    public function search_everywhere($request) {
        $query   = $request->get_param('query') ?? '';
        $pattern = $request->get_param('pattern') ?? '';

        if (!$query && !$pattern) {
            return new \WP_Error('missing_query', 'Provide query or pattern', ['status' => 400]);
        }

        $results = [
            'posts'      => [],
            'options'    => [],
            'theme_mods' => [],
            'menus'      => [],
            'widgets'    => [],
        ];

        // If pattern mode, extract values first
        if ($pattern === 'phone') {
            return $this->find_all_phones();
        } elseif ($pattern === 'email') {
            return $this->find_all_emails();
        }

        // Exact text search across all locations
        $results['posts']      = $this->search_posts($query);
        $results['options']    = $this->search_options($query);
        $results['theme_mods'] = $this->search_theme_mods($query);
        $results['menus']      = $this->search_menus($query);
        $results['widgets']    = $this->search_widgets($query);

        $total = array_sum(array_map('count', $results));

        return [
            'success'     => true,
            'query'       => $query,
            'total_found' => $total,
            'locations'   => $results,
        ];
    }

    /**
     * Replace a value everywhere it appears.
     *
     * POST /site-wide/replace { find: "old text", replace: "new text" }
     */
    public function replace_everywhere($request) {
        $body    = $request->get_json_params();
        $find    = $body['find']    ?? '';
        $replace = $body['replace'] ?? '';

        if (!$find) return new \WP_Error('missing_find', 'find text required', ['status' => 400]);

        $changes = [
            'posts'      => 0,
            'options'    => 0,
            'theme_mods' => 0,
            'menus'      => 0,
            'widgets'    => 0,
            'details'    => [],
        ];

        // 1. Posts — post_content and _elementor_data
        $changes['posts'] = $this->replace_in_posts($find, $replace, $changes['details']);

        // 2. wp_options
        $changes['options'] = $this->replace_in_options($find, $replace, $changes['details']);

        // 3. Theme mods
        $changes['theme_mods'] = $this->replace_in_theme_mods($find, $replace, $changes['details']);

        // 4. Menus
        $changes['menus'] = $this->replace_in_menus($find, $replace, $changes['details']);

        // 5. Widgets
        $changes['widgets'] = $this->replace_in_widgets($find, $replace, $changes['details']);

        // Clear all caches
        $this->clear_all_caches();

        $total = $changes['posts'] + $changes['options'] + $changes['theme_mods'] + $changes['menus'] + $changes['widgets'];

        return [
            'success'       => true,
            'find'          => $find,
            'replace'       => $replace,
            'total_replaced'=> $total,
            'breakdown'     => $changes,
        ];
    }

    // ─── Post Search/Replace ─────────────────────────────────────────

    private function search_posts(string $query): array {
        global $wpdb;
        $like = '%' . $wpdb->esc_like($query) . '%';
        $results = [];

        // post_content
        $posts = $wpdb->get_results($wpdb->prepare(
            "SELECT ID, post_title, post_type FROM {$wpdb->posts}
             WHERE post_status = 'publish' AND post_content LIKE %s
             LIMIT 20", $like
        ));
        foreach ($posts as $p) {
            $results[] = ['type' => 'post_content', 'post_id' => $p->ID, 'title' => $p->post_title, 'post_type' => $p->post_type];
        }

        // _elementor_data
        $meta = $wpdb->get_results($wpdb->prepare(
            "SELECT pm.post_id, p.post_title FROM {$wpdb->postmeta} pm
             JOIN {$wpdb->posts} p ON p.ID = pm.post_id
             WHERE pm.meta_key = '_elementor_data' AND pm.meta_value LIKE %s AND p.post_status = 'publish'
             LIMIT 20", $like
        ));
        foreach ($meta as $m) {
            $results[] = ['type' => 'elementor_data', 'post_id' => $m->post_id, 'title' => $m->post_title];
        }

        return $results;
    }

    private function replace_in_posts(string $find, string $replace, array &$details): int {
        global $wpdb;
        $count = 0;
        $like  = '%' . $wpdb->esc_like($find) . '%';

        // post_content
        $posts = $wpdb->get_results($wpdb->prepare(
            "SELECT ID, post_title, post_content FROM {$wpdb->posts}
             WHERE post_status = 'publish' AND post_content LIKE %s", $like
        ));
        foreach ($posts as $p) {
            $new_content = str_replace($find, $replace, $p->post_content);
            if ($new_content !== $p->post_content) {
                $wpdb->update($wpdb->posts, ['post_content' => $new_content], ['ID' => $p->ID]);
                $count++;
                $details[] = ['location' => 'post_content', 'post_id' => $p->ID, 'title' => $p->post_title];
            }
        }

        // _elementor_data
        $meta = $wpdb->get_results($wpdb->prepare(
            "SELECT pm.meta_id, pm.post_id, pm.meta_value, p.post_title FROM {$wpdb->postmeta} pm
             JOIN {$wpdb->posts} p ON p.ID = pm.post_id
             WHERE pm.meta_key = '_elementor_data' AND pm.meta_value LIKE %s AND p.post_status = 'publish'", $like
        ));
        foreach ($meta as $m) {
            // Try all quote variants
            $variants = $this->get_quote_variants($find);
            $new_val  = $m->meta_value;
            foreach ($variants as $v) {
                $new_val = str_replace($v, $replace, $new_val);
            }
            if ($new_val !== $m->meta_value) {
                $wpdb->update($wpdb->postmeta, ['meta_value' => $new_val], ['meta_id' => $m->meta_id]);
                $count++;
                $details[] = ['location' => 'elementor_data', 'post_id' => $m->post_id, 'title' => $m->post_title];

                // Clear Elementor cache for this post
                delete_post_meta($m->post_id, '_elementor_css');
                delete_post_meta($m->post_id, '_elementor_page_assets');
            }
        }

        return $count;
    }

    // ─── Options Search/Replace ──────────────────────────────────────

    private function search_options(string $query): array {
        global $wpdb;
        $like = '%' . $wpdb->esc_like($query) . '%';
        $results = [];

        $opts = $wpdb->get_results($wpdb->prepare(
            "SELECT option_name, option_value FROM {$wpdb->options}
             WHERE option_value LIKE %s AND option_name NOT LIKE '\\_transient%%'
             AND option_name NOT LIKE 'cron' AND option_name NOT LIKE '\\_site_transient%%'
             LIMIT 20", $like
        ));
        foreach ($opts as $o) {
            $results[] = ['type' => 'option', 'name' => $o->option_name, 'preview' => mb_substr($o->option_value, 0, 100)];
        }
        return $results;
    }

    private function replace_in_options(string $find, string $replace, array &$details): int {
        global $wpdb;
        $count = 0;
        $like  = '%' . $wpdb->esc_like($find) . '%';

        // Skip transients, cron, and internal WordPress options
        $skip = ['cron', 'active_plugins', 'uninstall_plugins', 'auto_core_update_notified',
                 'recently_activated', 'rewrite_rules', 'db_version'];

        $opts = $wpdb->get_results($wpdb->prepare(
            "SELECT option_name, option_value FROM {$wpdb->options}
             WHERE option_value LIKE %s AND option_name NOT LIKE '\\_transient%%'
             AND option_name NOT LIKE '\\_site_transient%%'", $like
        ));

        foreach ($opts as $o) {
            if (in_array($o->option_name, $skip)) continue;

            $is_serialized = is_serialized($o->option_value);
            $new_val = $o->option_value;

            if ($is_serialized) {
                $unserialized = maybe_unserialize($o->option_value);
                $json = json_encode($unserialized);
                if (stripos($json, $find) !== false) {
                    // Replace in the serialized structure
                    $new_json = str_replace($find, $replace, $json);
                    $new_unserialized = json_decode($new_json, true);
                    if ($new_unserialized !== null) {
                        $new_val = maybe_serialize($new_unserialized);
                    }
                }
            } else {
                $new_val = str_replace($find, $replace, $o->option_value);
            }

            if ($new_val !== $o->option_value) {
                update_option($o->option_name, maybe_unserialize($new_val));
                $count++;
                $details[] = ['location' => 'option', 'name' => $o->option_name];
            }
        }

        return $count;
    }

    // ─── Theme Mods Search/Replace ───────────────────────────────────

    private function search_theme_mods(string $query): array {
        $mods = get_theme_mods();
        $results = [];
        if (is_array($mods)) {
            foreach ($mods as $key => $val) {
                $str = is_string($val) ? $val : json_encode($val);
                if (stripos($str, $query) !== false) {
                    $results[] = ['type' => 'theme_mod', 'key' => $key, 'preview' => mb_substr($str, 0, 100)];
                }
            }
        }
        return $results;
    }

    private function replace_in_theme_mods(string $find, string $replace, array &$details): int {
        $mods  = get_theme_mods();
        $count = 0;
        if (is_array($mods)) {
            foreach ($mods as $key => $val) {
                if (is_string($val) && strpos($val, $find) !== false) {
                    set_theme_mod($key, str_replace($find, $replace, $val));
                    $count++;
                    $details[] = ['location' => 'theme_mod', 'key' => $key];
                }
            }
        }
        return $count;
    }

    // ─── Menu Search/Replace ─────────────────────────────────────────

    private function search_menus(string $query): array {
        $results = [];
        $locations = get_nav_menu_locations();
        foreach ($locations as $loc => $menu_id) {
            if (!$menu_id) continue;
            $items = wp_get_nav_menu_items($menu_id);
            if (!is_array($items)) continue;
            foreach ($items as $item) {
                if (stripos($item->title, $query) !== false || stripos($item->url, $query) !== false) {
                    $results[] = ['type' => 'menu_item', 'menu_location' => $loc, 'item_id' => $item->ID, 'title' => $item->title, 'url' => $item->url];
                }
            }
        }
        return $results;
    }

    private function replace_in_menus(string $find, string $replace, array &$details): int {
        $count = 0;
        $locations = get_nav_menu_locations();
        foreach ($locations as $loc => $menu_id) {
            if (!$menu_id) continue;
            $items = wp_get_nav_menu_items($menu_id);
            if (!is_array($items)) continue;
            foreach ($items as $item) {
                $changed = false;
                if (strpos($item->title, $find) !== false) {
                    update_post_meta($item->ID, '_menu_item_title', str_replace($find, $replace, $item->title));
                    wp_update_post(['ID' => $item->ID, 'post_title' => str_replace($find, $replace, $item->title)]);
                    $changed = true;
                }
                if (strpos($item->url, $find) !== false) {
                    update_post_meta($item->ID, '_menu_item_url', str_replace($find, $replace, $item->url));
                    $changed = true;
                }
                if ($changed) {
                    $count++;
                    $details[] = ['location' => 'menu', 'menu_location' => $loc, 'item' => $item->title];
                }
            }
        }
        return $count;
    }

    // ─── Widget Search/Replace ───────────────────────────────────────

    private function search_widgets(string $query): array {
        $results   = [];
        $sidebars  = wp_get_sidebars_widgets();
        foreach ($sidebars as $sidebar_id => $widgets) {
            if ($sidebar_id === 'wp_inactive_widgets' || !is_array($widgets)) continue;
            foreach ($widgets as $widget_id) {
                if (preg_match('/^(.+)-(\d+)$/', $widget_id, $m)) {
                    $instances = get_option('widget_' . $m[1], []);
                    $instance  = $instances[(int) $m[2]] ?? [];
                    $json      = json_encode($instance);
                    if (stripos($json, $query) !== false) {
                        $results[] = ['type' => 'widget', 'sidebar' => $sidebar_id, 'widget_id' => $widget_id, 'preview' => mb_substr(wp_strip_all_tags($json), 0, 100)];
                    }
                }
            }
        }
        return $results;
    }

    private function replace_in_widgets(string $find, string $replace, array &$details): int {
        $count    = 0;
        $sidebars = wp_get_sidebars_widgets();
        foreach ($sidebars as $sidebar_id => $widgets) {
            if ($sidebar_id === 'wp_inactive_widgets' || !is_array($widgets)) continue;
            foreach ($widgets as $widget_id) {
                if (preg_match('/^(.+)-(\d+)$/', $widget_id, $m)) {
                    $option_name = 'widget_' . $m[1];
                    $instances   = get_option($option_name, []);
                    $idx         = (int) $m[2];
                    if (!isset($instances[$idx])) continue;

                    $json    = json_encode($instances[$idx]);
                    $new_json = str_replace($find, $replace, $json);
                    if ($new_json !== $json) {
                        $instances[$idx] = json_decode($new_json, true);
                        update_option($option_name, $instances);
                        $count++;
                        $details[] = ['location' => 'widget', 'sidebar' => $sidebar_id, 'widget_id' => $widget_id];
                    }
                }
            }
        }
        return $count;
    }

    // ─── Pattern Finders ─────────────────────────────────────────────

    private function find_all_phones(): array {
        $phone_regex = '/[\(]?\d{3}[\)\.\-\s]?\s?\d{3}[\-.\s]?\d{4}/';
        return $this->find_by_pattern($phone_regex, 'phone');
    }

    private function find_all_emails(): array {
        $email_regex = '/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/';
        return $this->find_by_pattern($email_regex, 'email');
    }

    private function find_by_pattern(string $regex, string $label): array {
        $all_found = []; // value => [locations]

        // Posts
        $posts = get_posts(['post_type' => ['page', 'post'], 'post_status' => 'publish', 'posts_per_page' => 50]);
        foreach ($posts as $p) {
            $text = wp_strip_all_tags($p->post_content);
            // Also check Elementor data
            $edata = get_post_meta($p->ID, '_elementor_data', true);
            if ($edata) $text .= ' ' . wp_strip_all_tags(preg_replace('/<[^>]+>/', ' ', $edata));

            if (preg_match_all($regex, $text, $matches)) {
                foreach (array_unique($matches[0]) as $val) {
                    $val = trim($val);
                    $all_found[$val][] = ['location' => 'page', 'page_id' => $p->ID, 'page_title' => $p->post_title];
                }
            }
        }

        // Theme mods
        $mods = get_theme_mods();
        if (is_array($mods)) {
            $mods_str = json_encode($mods);
            if (preg_match_all($regex, $mods_str, $matches)) {
                foreach (array_unique($matches[0]) as $val) {
                    $all_found[trim($val)][] = ['location' => 'theme_customizer'];
                }
            }
        }

        // Widgets
        $sidebars = wp_get_sidebars_widgets();
        foreach ($sidebars as $sid => $widgets) {
            if ($sid === 'wp_inactive_widgets' || !is_array($widgets)) continue;
            foreach ($widgets as $wid) {
                if (preg_match('/^(.+)-(\d+)$/', $wid, $m)) {
                    $instances = get_option('widget_' . $m[1], []);
                    $inst = $instances[(int) $m[2]] ?? [];
                    $json = json_encode($inst);
                    if (preg_match_all($regex, $json, $matches)) {
                        foreach (array_unique($matches[0]) as $val) {
                            $all_found[trim($val)][] = ['location' => "widget ($sid)"];
                        }
                    }
                }
            }
        }

        // Options (limited — skip transients)
        global $wpdb;
        $opts = $wpdb->get_results(
            "SELECT option_name, option_value FROM {$wpdb->options}
             WHERE option_name NOT LIKE '_transient%' AND option_name NOT LIKE '_site_transient%'
             AND LENGTH(option_value) < 10000 LIMIT 200"
        );
        foreach ($opts as $o) {
            if (preg_match_all($regex, $o->option_value, $matches)) {
                foreach (array_unique($matches[0]) as $val) {
                    $all_found[trim($val)][] = ['location' => "option:{$o->option_name}"];
                }
            }
        }

        // Format
        $formatted = [];
        foreach ($all_found as $value => $locations) {
            $formatted[] = ['value' => $value, 'found_in' => $locations, 'count' => count($locations)];
        }

        return ['success' => true, 'pattern' => $label, 'total_unique' => count($formatted), 'results' => $formatted];
    }

    // ─── Logo ────────────────────────────────────────────────────────

    public function get_logo_info($request) {
        $custom_logo_id = get_theme_mod('custom_logo');
        $logo_url       = $custom_logo_id ? wp_get_attachment_url($custom_logo_id) : null;
        $site_icon_id   = get_option('site_icon');
        $site_icon_url  = $site_icon_id ? wp_get_attachment_url($site_icon_id) : null;

        return [
            'success'        => true,
            'custom_logo_id' => $custom_logo_id ?: null,
            'custom_logo_url'=> $logo_url,
            'site_icon_id'   => $site_icon_id ?: null,
            'site_icon_url'  => $site_icon_url,
            'site_title'     => get_bloginfo('name'),
            'site_tagline'   => get_bloginfo('description'),
        ];
    }

    public function update_logo($request) {
        $body = $request->get_json_params();
        $attachment_id = (int) ($body['attachment_id'] ?? 0);

        if (!$attachment_id || !wp_attachment_is_image($attachment_id)) {
            return new \WP_Error('invalid_image', 'Valid attachment_id required', ['status' => 400]);
        }

        set_theme_mod('custom_logo', $attachment_id);

        return [
            'success'  => true,
            'logo_id'  => $attachment_id,
            'logo_url' => wp_get_attachment_url($attachment_id),
        ];
    }

    // ─── Quote Variants (for Elementor encoded text) ─────────────────

    private function get_quote_variants(string $str): array {
        $variants = [$str];
        $map = [
            "'"    => ["\u{2019}", "\u{2018}", '\u2019', '\u2018'],
            "\u{2019}" => ["'", '\u2019'],
            "\u{2018}" => ["'", '\u2018'],
            '"'    => ["\u{201C}", "\u{201D}", '\u201C', '\u201D'],
        ];
        foreach ($map as $char => $alts) {
            if (strpos($str, $char) !== false) {
                foreach ($alts as $alt) {
                    $variants[] = str_replace($char, $alt, $str);
                }
            }
        }
        return array_unique($variants);
    }

    // ─── Cache Clearing ──────────────────────────────────────────────

    private function clear_all_caches() {
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

        // WP object cache
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
