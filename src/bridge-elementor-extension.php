<?php
/**
 * ignyous Bridge — Elementor Extension
 * Add these functions to your ignyous-bridge plugin (ignyous-bridge.php)
 * 
 * INSTALLATION:
 * 1. In WP Admin → Plugins → ignyous Bridge → Edit (or via FTP)
 * 2. Paste this code before the closing ?> or before the last register_rest_route call
 */

// ── Register Elementor endpoint ────────────────────────────────────
add_action('rest_api_init', function() {
    register_rest_route('ignyous/v1', '/pages/(?P<id>\d+)/elementor', [
        'methods'  => ['GET', 'POST'],
        'callback' => 'ignyous_elementor_handler',
        'permission_callback' => 'ignyous_check_permission', // reuse existing auth check
    ]);
    register_rest_route('ignyous/v1', '/pages/(?P<id>\d+)/builder-data', [
        'methods'  => ['GET', 'POST'],
        'callback' => 'ignyous_builder_data_handler',
        'permission_callback' => 'ignyous_check_permission',
    ]);
});

/**
 * GET: Return full Elementor JSON data for a page
 * POST: Append an HTML widget section to an Elementor page
 */
function ignyous_elementor_handler(WP_REST_Request $request) {
    $page_id = intval($request->get_param('id'));
    $post    = get_post($page_id);
    if (!$post) return new WP_Error('not_found', 'Page not found', ['status' => 404]);

    if ($request->get_method() === 'GET') {
        $elementor_data = get_post_meta($page_id, '_elementor_data', true);
        $edit_mode      = get_post_meta($page_id, '_elementor_edit_mode', true);
        return [
            'success' => true,
            'data'    => [
                'elementor_data' => $elementor_data ? json_decode($elementor_data, true) : null,
                'edit_mode'      => $edit_mode,
                'is_elementor'   => !empty($elementor_data),
            ],
        ];
    }

    // POST — append an HTML widget section
    $params  = $request->get_json_params();
    $html    = sanitize_text_field($params['html'] ?? '');
    $label   = sanitize_text_field($params['label'] ?? 'ignyous Section');
    $full_html = wp_kses_post($params['html'] ?? ''); // allow full HTML

    // Get existing Elementor data
    $existing_raw  = get_post_meta($page_id, '_elementor_data', true);
    $existing_data = $existing_raw ? json_decode($existing_raw, true) : [];
    if (!is_array($existing_data)) $existing_data = [];

    // Build a new Elementor section with an HTML widget
    $section_id = 'ignyous_' . uniqid();
    $widget_id  = 'ignyous_w_' . uniqid();

    $new_section = [
        'id'       => $section_id,
        'elType'   => 'section',
        'settings' => [
            '_title' => $label . ' (ignyous)',
            'layout' => 'full_width',
        ],
        'elements' => [[
            'id'       => 'col_' . uniqid(),
            'elType'   => 'column',
            'settings' => ['_column_size' => 100],
            'elements' => [[
                'id'         => $widget_id,
                'elType'     => 'widget',
                'widgetType' => 'html',
                'settings'   => [
                    'html' => $full_html,
                    '_title' => $label,
                ],
                'elements' => [],
            ]],
        ]],
        'isInner' => false,
    ];

    $existing_data[] = $new_section;

    // Save back to Elementor meta
    update_post_meta($page_id, '_elementor_data', wp_slash(json_encode($existing_data)));
    update_post_meta($page_id, '_elementor_edit_mode', 'builder');

    // Clear Elementor cache for this page
    if (class_exists('\Elementor\Plugin')) {
        \Elementor\Plugin::$instance->files_manager->clear_cache();
    }

    // Also update post status to publish
    wp_update_post(['ID' => $page_id, 'post_status' => 'publish']);

    return [
        'success' => true,
        'message' => 'Section added to Elementor page',
        'data'    => ['section_id' => $section_id, 'page_id' => $page_id],
    ];
}

/**
 * Generic builder data endpoint — detects builder and returns/writes appropriately
 */
function ignyous_builder_data_handler(WP_REST_Request $request) {
    $page_id = intval($request->get_param('id'));
    $post    = get_post($page_id);
    if (!$post) return new WP_Error('not_found', 'Page not found', ['status' => 404]);

    // Detect builder
    $elementor_data = get_post_meta($page_id, '_elementor_data', true);
    $divi_enabled   = get_post_meta($page_id, '_et_pb_use_builder', true);
    $beaver_data    = get_post_meta($page_id, '_fl_builder_data', true);

    $builder = 'gutenberg';
    if (!empty($elementor_data))              $builder = 'elementor';
    elseif ($divi_enabled === 'on')           $builder = 'divi';
    elseif (!empty($beaver_data))             $builder = 'beaver';
    elseif (has_blocks($post->post_content))  $builder = 'gutenberg';

    if ($request->get_method() === 'GET') {
        return [
            'success' => true,
            'data' => [
                'builder'        => $builder,
                'post_content'   => $post->post_content,
                'elementor_data' => $elementor_data ? json_decode($elementor_data, true) : null,
                'has_blocks'     => has_blocks($post->post_content),
            ],
        ];
    }

    return ['success' => false, 'message' => 'Use the builder-specific endpoint'];
}
