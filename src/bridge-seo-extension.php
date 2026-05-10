<?php
/**
 * ignyous Bridge — SEO Extension
 * Supports: Yoast SEO, RankMath, and fallback meta fields
 * 
 * INSTALL: Paste into ignyous-bridge.php before the closing ?>
 */

add_action('rest_api_init', function() {
    register_rest_route('ignyous/v1', '/pages/(?P<id>\d+)/seo', [
        'methods'             => ['GET', 'POST'],
        'callback'            => 'ignyous_seo_handler',
        'permission_callback' => 'ignyous_check_permission',
    ]);
    register_rest_route('ignyous/v1', '/seo/audit', [
        'methods'             => 'GET',
        'callback'            => 'ignyous_seo_audit',
        'permission_callback' => 'ignyous_check_permission',
    ]);
});

// ── Detect which SEO plugin is active ────────────────────────────
function ignyous_detect_seo_plugin() {
    if (is_plugin_active('wordpress-seo/wp-seo.php') || defined('WPSEO_VERSION')) return 'yoast';
    if (is_plugin_active('seo-by-rank-math/rank-math.php') || class_exists('RankMath')) return 'rankmath';
    if (is_plugin_active('all-in-one-seo-pack/all_in_one_seo_pack.php')) return 'aioseo';
    return 'none';
}

// ── GET: read SEO fields for a page ──────────────────────────────
function ignyous_seo_handler(WP_REST_Request $req) {
    $id     = intval($req->get_param('id'));
    $post   = get_post($id);
    if (!$post) return new WP_Error('not_found', 'Page not found', ['status' => 404]);

    $plugin = ignyous_detect_seo_plugin();

    if ($req->get_method() === 'GET') {
        $data = ignyous_read_seo_fields($id, $plugin);
        return ['success' => true, 'data' => array_merge($data, ['plugin' => $plugin, 'page_id' => $id])];
    }

    // POST — write SEO fields
    $params = $req->get_json_params();
    ignyous_write_seo_fields($id, $plugin, $params);

    // Clear SEO plugin caches
    ignyous_clear_seo_cache($id, $plugin);

    return ['success' => true, 'message' => "SEO fields updated via {$plugin}", 'plugin' => $plugin];
}

// ── Read SEO fields (plugin-aware) ────────────────────────────────
function ignyous_read_seo_fields($post_id, $plugin) {
    $content = get_post_field('post_content', $post_id);
    $has_h1  = (bool) preg_match('/<h1[\s>]/i', $content);
    $images  = ignyous_get_images_without_alt($content);

    switch ($plugin) {
        case 'yoast':
            return [
                'seo_title'        => get_post_meta($post_id, '_yoast_wpseo_title',        true) ?: '',
                'meta_description' => get_post_meta($post_id, '_yoast_wpseo_metadesc',     true) ?: '',
                'focus_keyword'    => get_post_meta($post_id, '_yoast_wpseo_focuskw',      true) ?: '',
                'og_title'         => get_post_meta($post_id, '_yoast_wpseo_opengraph-title',       true) ?: '',
                'og_description'   => get_post_meta($post_id, '_yoast_wpseo_opengraph-description', true) ?: '',
                'canonical'        => get_post_meta($post_id, '_yoast_wpseo_canonical',     true) ?: '',
                'no_index'         => (bool) get_post_meta($post_id, '_yoast_wpseo_meta-robots-noindex', true),
                'schema_type'      => get_post_meta($post_id, '_yoast_wpseo_schema_page_type', true) ?: '',
                'has_h1'           => $has_h1,
                'has_schema'       => (bool) get_post_meta($post_id, '_yoast_wpseo_schema_page_type', true),
                'images_missing_alt' => count($images),
            ];

        case 'rankmath':
            return [
                'seo_title'        => get_post_meta($post_id, 'rank_math_title',          true) ?: '',
                'meta_description' => get_post_meta($post_id, 'rank_math_description',    true) ?: '',
                'focus_keyword'    => get_post_meta($post_id, 'rank_math_focus_keyword',  true) ?: '',
                'og_title'         => get_post_meta($post_id, 'rank_math_og_title',        true) ?: '',
                'og_description'   => get_post_meta($post_id, 'rank_math_og_description', true) ?: '',
                'canonical'        => get_post_meta($post_id, 'rank_math_canonical_url',  true) ?: '',
                'no_index'         => (bool) get_post_meta($post_id, 'rank_math_robots',  true),
                'schema_json_ld'   => get_post_meta($post_id, 'rank_math_schema_',        true) ?: '',
                'has_h1'           => $has_h1,
                'has_schema'       => (bool) get_post_meta($post_id, 'rank_math_schema_', true),
                'images_missing_alt' => count($images),
                'seo_score'        => get_post_meta($post_id, 'rank_math_seo_score',      true) ?: 0,
            ];

        default:
            return [
                'seo_title'        => '',
                'meta_description' => '',
                'focus_keyword'    => '',
                'og_title'         => '',
                'og_description'   => '',
                'has_h1'           => $has_h1,
                'has_schema'       => false,
                'images_missing_alt' => count($images),
            ];
    }
}

// ── Write SEO fields (plugin-aware) ───────────────────────────────
function ignyous_write_seo_fields($post_id, $plugin, $params) {
    $map = [];
    switch ($plugin) {
        case 'yoast':
            $map = [
                'seo_title'        => '_yoast_wpseo_title',
                'meta_description' => '_yoast_wpseo_metadesc',
                'focus_keyword'    => '_yoast_wpseo_focuskw',
                'og_title'         => '_yoast_wpseo_opengraph-title',
                'og_description'   => '_yoast_wpseo_opengraph-description',
                'canonical'        => '_yoast_wpseo_canonical',
                'schema_type'      => '_yoast_wpseo_schema_page_type',
            ];
            break;
        case 'rankmath':
            $map = [
                'seo_title'        => 'rank_math_title',
                'meta_description' => 'rank_math_description',
                'focus_keyword'    => 'rank_math_focus_keyword',
                'og_title'         => 'rank_math_og_title',
                'og_description'   => 'rank_math_og_description',
                'canonical'        => 'rank_math_canonical_url',
                'schema_json_ld'   => 'rank_math_schema_',
            ];
            break;
        default:
            // Fallback: write to standard WordPress post meta + custom fields
            $map = [
                'seo_title'        => '_ignyous_seo_title',
                'meta_description' => '_ignyous_meta_description',
                'focus_keyword'    => '_ignyous_focus_keyword',
                'og_title'         => '_ignyous_og_title',
                'og_description'   => '_ignyous_og_description',
            ];
            break;
    }

    foreach ($map as $key => $meta_key) {
        if (isset($params[$key]) && $params[$key] !== '') {
            update_post_meta($post_id, $meta_key, sanitize_text_field($params[$key]));
        }
    }

    // Also update H1 in page content if suggested
    if (!empty($params['suggested_h1'])) {
        $content = get_post_field('post_content', $post_id);
        // Replace or insert H1
        if (preg_match('/<h1[^>]*>.*?<\/h1>/is', $content)) {
            $content = preg_replace('/<h1[^>]*>.*?<\/h1>/is', '<h1>' . esc_html($params['suggested_h1']) . '</h1>', $content, 1);
        } else {
            $content = '<h1>' . esc_html($params['suggested_h1']) . '</h1>' . "\n" . $content;
        }
        wp_update_post(['ID' => $post_id, 'post_content' => $content]);
    }
}

// ── Clear SEO plugin caches ────────────────────────────────────────
function ignyous_clear_seo_cache($post_id, $plugin) {
    switch ($plugin) {
        case 'yoast':
            if (class_exists('WPSEO_Utils')) WPSEO_Utils::clear_cache();
            break;
        case 'rankmath':
            if (class_exists('\RankMath\Helper')) \RankMath\Helper::clear_cache($post_id);
            break;
    }
    clean_post_cache($post_id);
    wp_cache_flush();
}

// ── Audit all pages ───────────────────────────────────────────────
function ignyous_seo_audit(WP_REST_Request $req) {
    $plugin = ignyous_detect_seo_plugin();
    $pages  = get_posts(['post_type' => ['page', 'post'], 'posts_per_page' => 50, 'post_status' => 'publish']);
    $audit  = [];

    foreach ($pages as $page) {
        $seo     = ignyous_read_seo_fields($page->ID, $plugin);
        $issues  = [];
        if (empty($seo['seo_title']))        $issues[] = 'Missing SEO title';
        if (empty($seo['meta_description'])) $issues[] = 'Missing meta description';
        if (empty($seo['focus_keyword']))    $issues[] = 'No focus keyword';
        if (empty($seo['og_title']))         $issues[] = 'No Open Graph title';
        if (!$seo['has_h1'])                 $issues[] = 'Missing H1 heading';
        if ($seo['images_missing_alt'] > 0)  $issues[] = $seo['images_missing_alt'] . ' image(s) missing alt text';
        $audit[] = ['id' => $page->ID, 'title' => $page->post_title, 'link' => get_permalink($page->ID), 'seo' => $seo, 'issues' => $issues];
    }

    return ['success' => true, 'plugin' => $plugin, 'data' => ['pages' => $audit, 'total' => count($audit)]];
}

// ── Get images without alt text ───────────────────────────────────
function ignyous_get_images_without_alt($content) {
    preg_match_all('/<img[^>]*>/i', $content, $matches);
    $missing = [];
    foreach ($matches[0] as $img) {
        if (!preg_match('/alt=["\'][^"\']+["\']/', $img)) {
            $missing[] = $img;
        }
    }
    return $missing;
}
