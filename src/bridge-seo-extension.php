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

// ═══════════════════════════════════════════════════════════════════
// GLOBAL THEME SETTINGS — Elementor Kit + Avada + Generic
// ═══════════════════════════════════════════════════════════════════
add_action('rest_api_init', function() {
    register_rest_route('ignyous/v1', '/theme/global', [
        'methods'             => ['GET', 'PATCH'],
        'callback'            => 'ignyous_theme_global_handler',
        'permission_callback' => 'ignyous_check_permission',
    ]);
    register_rest_route('ignyous/v1', '/theme/global/fonts', [
        'methods'             => 'GET',
        'callback'            => 'ignyous_get_google_fonts',
        'permission_callback' => 'ignyous_check_permission',
    ]);
});

function ignyous_theme_global_handler(WP_REST_Request $req) {
    $builder = ignyous_detect_theme_builder();

    if ($req->get_method() === 'GET') {
        return ignyous_get_global_settings($builder);
    }

    // PATCH — update global settings
    $updates = $req->get_json_params();
    return ignyous_update_global_settings($builder, $updates);
}

function ignyous_detect_theme_builder() {
    // Check active theme
    $theme = wp_get_theme()->get_stylesheet();
    $theme_name = strtolower(wp_get_theme()->get('Name'));

    if (strpos($theme_name, 'avada') !== false || $theme === 'Avada' || function_exists('avada_prime')) return 'avada';
    if (get_option('elementor_active_kit') || class_exists('\Elementor\Plugin')) return 'elementor';
    if (strpos($theme_name, 'divi') !== false || function_exists('et_get_option')) return 'divi';
    if (function_exists('generate_get_option')) return 'generatepress';
    if (function_exists('kadence_get_option')) return 'kadence';
    return 'generic';
}

// ── READ global settings ─────────────────────────────────────────
function ignyous_get_global_settings($builder) {
    $settings = [];

    switch ($builder) {
        case 'elementor':
            // Read from Elementor Kit (Global Style)
            $kit_id   = get_option('elementor_active_kit');
            $kit_data = $kit_id ? get_post_meta($kit_id, '_elementor_page_settings', true) : [];
            if (!$kit_data) $kit_data = [];

            $settings = [
                'builder'              => 'elementor',
                'primary_color'        => $kit_data['system_colors'][0]['color'] ?? '#6EC1E4',
                'secondary_color'      => $kit_data['system_colors'][1]['color'] ?? '#54595F',
                'accent_color'         => $kit_data['system_colors'][2]['color'] ?? '#7A7A7A',
                'text_color'           => $kit_data['system_colors'][3]['color'] ?? '#000000',
                'body_font_family'     => $kit_data['system_typography'][0]['typography_font_family'] ?? 'Roboto',
                'body_font_size'       => $kit_data['system_typography'][0]['typography_font_size']['size'] ?? 16,
                'heading_font_family'  => $kit_data['system_typography'][1]['typography_font_family'] ?? 'Roboto',
                'heading_font_weight'  => $kit_data['system_typography'][1]['typography_font_weight'] ?? '600',
                'link_color'           => $kit_data['link_color'] ?? '#6EC1E4',
                'heading_color'        => $kit_data['heading_color'] ?? '',
                'kit_id'               => $kit_id,
                'raw_kit'              => $kit_data,
                'system_colors'        => $kit_data['system_colors'] ?? [],
                'system_typography'    => $kit_data['system_typography'] ?? [],
                'custom_colors'        => $kit_data['custom_colors'] ?? [],
            ];
            break;

        case 'avada':
            // Avada stores options in 'avada_options' WP option
            $avada = get_option('avada_options', []);
            if (!$avada) $avada = function_exists('Avada') ? Avada()->settings->get_all_options() : [];
            $settings = [
                'builder'              => 'avada',
                'primary_color'        => $avada['primary_color']             ?? '#65bc7b',
                'secondary_color'      => $avada['body_typography']['color']  ?? '#333333',
                'link_color'           => $avada['link_color']                ?? '#65bc7b',
                'heading_color'        => $avada['h1_typography']['color']    ?? '',
                'body_font_family'     => $avada['body_typography']['font-family'] ?? 'PTSans',
                'body_font_size'       => $avada['body_typography']['font-size']   ?? '15px',
                'heading_font_family'  => $avada['h1_typography']['font-family']   ?? 'Helvetica Neue',
                'heading_font_weight'  => $avada['h1_typography']['font-weight']   ?? '700',
                'button_background_color' => $avada['button_accent_color']    ?? '#65bc7b',
                'button_text_color'    => $avada['button_accent_hover_color'] ?? '#ffffff',
                'raw'                  => array_slice($avada, 0, 30),
            ];
            break;

        case 'divi':
            $divi_settings = get_option('et_divi', []);
            $settings = [
                'builder'              => 'divi',
                'primary_color'        => $divi_settings['accent_color']       ?? '#2ea3f2',
                'body_font_family'     => $divi_settings['body_font']          ?? 'Open Sans',
                'body_font_size'       => ($divi_settings['body_font_size']    ?? '14') . 'px',
                'heading_font_family'  => $divi_settings['header_font']        ?? '',
                'heading_color'        => $divi_settings['header_color']       ?? '#666666',
                'link_color'           => $divi_settings['link_color']         ?? '#2ea3f2',
            ];
            break;

        default:
            // Try to get theme customizer settings
            $mods = get_theme_mods();
            $settings = [
                'builder'          => $builder,
                'primary_color'    => $mods['accent_color'] ?? $mods['primary_color'] ?? get_theme_mod('background_color', '#ffffff'),
                'body_font_family' => $mods['body_font'] ?? '',
                'raw_mods'         => array_slice($mods, 0, 20),
            ];
    }

    return ['success' => true, 'data' => $settings, 'builder' => $builder];
}

// ── WRITE global settings ────────────────────────────────────────
function ignyous_update_global_settings($builder, $updates) {
    $changed = [];

    switch ($builder) {
        case 'elementor':
            $kit_id   = get_option('elementor_active_kit');
            if (!$kit_id) return ['success' => false, 'message' => 'No Elementor Kit found'];
            $kit_data = get_post_meta($kit_id, '_elementor_page_settings', true) ?: [];

            // Update system colors
            if (!empty($kit_data['system_colors'])) {
                foreach ($kit_data['system_colors'] as &$color) {
                    $key = ignyous_el_color_key($color['title'] ?? '');
                    if ($key && isset($updates[$key])) {
                        $color['color'] = sanitize_hex_color($updates[$key]);
                        $changed[] = $color['title'];
                    }
                }
            }
            // Set global primary/accent directly
            if (!empty($updates['primary_color'])) {
                if (empty($kit_data['system_colors'])) $kit_data['system_colors'] = [];
                // Ensure first color is primary
                if (!empty($kit_data['system_colors'][0])) {
                    $kit_data['system_colors'][0]['color'] = sanitize_hex_color($updates['primary_color']);
                    $changed[] = 'primary_color';
                }
            }
            if (!empty($updates['accent_color']) && !empty($kit_data['system_colors'][2])) {
                $kit_data['system_colors'][2]['color'] = sanitize_hex_color($updates['accent_color']);
                $changed[] = 'accent_color';
            }

            // Update typography
            $font_keys = ['body_font_family' => 0, 'heading_font_family' => 1];
            foreach ($font_keys as $key => $idx) {
                if (!empty($updates[$key]) && !empty($kit_data['system_typography'][$idx])) {
                    $kit_data['system_typography'][$idx]['typography_font_family'] = sanitize_text_field($updates[$key]);
                    // Queue Google Font for enqueue
                    ignyous_queue_google_font($updates[$key]);
                    $changed[] = $key;
                }
            }
            if (!empty($updates['body_font_size']) && !empty($kit_data['system_typography'][0])) {
                $kit_data['system_typography'][0]['typography_font_size'] = ['size' => intval($updates['body_font_size']), 'unit' => 'px'];
                $changed[] = 'body_font_size';
            }
            if (!empty($updates['heading_font_weight']) && !empty($kit_data['system_typography'][1])) {
                $kit_data['system_typography'][1]['typography_font_weight'] = sanitize_text_field($updates['heading_font_weight']);
                $changed[] = 'heading_font_weight';
            }

            // Generic overrides
            foreach (['link_color', 'heading_color'] as $k) {
                if (!empty($updates[$k])) { $kit_data[$k] = sanitize_hex_color($updates[$k]); $changed[] = $k; }
            }

            update_post_meta($kit_id, '_elementor_page_settings', $kit_data);
            // Clear Elementor CSS cache
            if (class_exists('\Elementor\Plugin')) \Elementor\Plugin::$instance->files_manager->clear_cache();
            break;

        case 'avada':
            $avada = get_option('avada_options', []);
            $map = [
                'primary_color'        => 'primary_color',
                'link_color'           => 'link_color',
                'button_background_color' => 'button_accent_color',
                'button_text_color'    => 'button_accent_hover_color',
            ];
            foreach ($map as $from => $to) {
                if (!empty($updates[$from])) { $avada[$to] = sanitize_hex_color($updates[$from]); $changed[] = $from; }
            }
            // Font updates
            if (!empty($updates['body_font_family'])) {
                $avada['body_typography']['font-family'] = sanitize_text_field($updates['body_font_family']);
                ignyous_queue_google_font($updates['body_font_family']);
                $changed[] = 'body_font_family';
            }
            if (!empty($updates['heading_font_family'])) {
                foreach (['h1_typography','h2_typography','h3_typography'] as $h) {
                    $avada[$h]['font-family'] = sanitize_text_field($updates['heading_font_family']);
                }
                ignyous_queue_google_font($updates['heading_font_family']);
                $changed[] = 'heading_font_family';
            }
            update_option('avada_options', $avada);
            // Clear Avada CSS cache
            if (class_exists('Avada_Compiler')) Avada_Compiler::build_css();
            break;

        case 'divi':
            $divi = get_option('et_divi', []);
            if (!empty($updates['primary_color']))    $divi['accent_color']    = sanitize_hex_color($updates['primary_color']);
            if (!empty($updates['body_font_family'])) { $divi['body_font'] = sanitize_text_field($updates['body_font_family']); ignyous_queue_google_font($updates['body_font_family']); }
            if (!empty($updates['link_color']))       $divi['link_color']      = sanitize_hex_color($updates['link_color']);
            update_option('et_divi', $divi);
            et_update_option('divi_mod_builder_custom_css', '');
            $changed = array_keys($updates);
            break;

        default:
            // Generic: use theme customizer
            foreach ($updates as $k => $v) {
                set_theme_mod($k, sanitize_text_field($v));
                $changed[] = $k;
            }
    }

    // Always flush WP cache
    wp_cache_flush();

    return ['success' => true, 'message' => 'Global settings updated: ' . implode(', ', $changed), 'changed' => $changed, 'builder' => $builder];
}

function ignyous_el_color_key($title) {
    $map = ['Primary' => 'primary_color', 'Secondary' => 'secondary_color', 'Text' => 'text_color', 'Accent' => 'accent_color'];
    return $map[$title] ?? null;
}

function ignyous_queue_google_font($font_family) {
    // Add to list of fonts to be loaded — store in option for front-end enqueue
    $fonts = get_option('ignyous_google_fonts', []);
    if (!in_array($font_family, $fonts)) {
        $fonts[] = $font_family;
        update_option('ignyous_google_fonts', $fonts);
    }
}

// Enqueue Google Fonts that were set via ignyous
add_action('wp_enqueue_scripts', function() {
    $fonts = get_option('ignyous_google_fonts', []);
    if (!empty($fonts)) {
        $query = implode('|', array_map(fn($f) => str_replace(' ', '+', $f) . ':300,400,500,600,700,800', $fonts));
        wp_enqueue_style('ignyous-google-fonts', 'https://fonts.googleapis.com/css2?family=' . urlencode($query) . '&display=swap');
    }
});

function ignyous_get_google_fonts() {
    // Return a curated list of popular Google Fonts
    $fonts = ['Inter','DM Sans','Plus Jakarta Sans','Outfit','Nunito','Lato','Poppins','Raleway','Montserrat','Oswald','Playfair Display','Merriweather','Cormorant Garamond','Libre Baskerville','Source Serif 4','Space Grotesk','Syne','Cabinet Grotesk','Clash Display','Satoshi'];
    return ['success' => true, 'data' => ['fonts' => $fonts]];
}
