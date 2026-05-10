<?php
/**
 * ignyous Bridge — Full Builder Extension
 * Supports: Elementor, Beaver Builder, Divi, WPBakery, Avada
 * 
 * INSTALL: Paste into ignyous-bridge.php before the closing ?>
 */

add_action('rest_api_init', function() {
    // Elementor: append native sections
    register_rest_route('ignyous/v1', '/pages/(?P<id>\d+)/elementor-append', [
        'methods' => 'POST',
        'callback' => 'ignyous_elementor_append',
        'permission_callback' => 'ignyous_check_permission',
    ]);
    // Beaver Builder: append native rows
    register_rest_route('ignyous/v1', '/pages/(?P<id>\d+)/beaver', [
        'methods' => ['GET', 'POST'],
        'callback' => 'ignyous_beaver_handler',
        'permission_callback' => 'ignyous_check_permission',
    ]);
    // Universal builder-data detection
    register_rest_route('ignyous/v1', '/pages/(?P<id>\d+)/builder-data', [
        'methods' => 'GET',
        'callback' => 'ignyous_get_builder_data',
        'permission_callback' => 'ignyous_check_permission',
    ]);
});

// ── Detect builder for a page ──────────────────────────────────────
function ignyous_get_builder_data(WP_REST_Request $req) {
    $id   = intval($req->get_param('id'));
    $post = get_post($id);
    if (!$post) return new WP_Error('not_found', 'Page not found', ['status' => 404]);

    $el_data  = get_post_meta($id, '_elementor_data', true);
    $divi     = get_post_meta($id, '_et_pb_use_builder', true);
    $beaver   = get_post_meta($id, '_fl_builder_data', true);
    $content  = $post->post_content;

    $builder = 'gutenberg';
    if (!empty($el_data)) $builder = 'elementor';
    elseif ($divi === 'on') $builder = 'divi';
    elseif (!empty($beaver)) $builder = 'beaver';
    elseif (strpos($content, '[vc_row') !== false) $builder = 'wpbakery';
    elseif (strpos($content, '[fusion_builder') !== false) $builder = 'avada';
    elseif (has_blocks($content)) $builder = 'gutenberg';

    return [
        'success' => true,
        'data' => [
            'builder'      => $builder,
            'has_elementor'=> !empty($el_data),
            'has_beaver'   => !empty($beaver),
            'has_blocks'   => has_blocks($content),
            'page_id'      => $id,
        ],
    ];
}

// ── Elementor: append sections from JSON ──────────────────────────
function ignyous_elementor_append(WP_REST_Request $req) {
    $id       = intval($req->get_param('id'));
    $post     = get_post($id);
    if (!$post) return new WP_Error('not_found', 'Page not found', ['status' => 404]);

    $params   = $req->get_json_params();
    $new_elements = $params['elements'] ?? [];  // array of Elementor section objects
    $label    = sanitize_text_field($params['label'] ?? 'ignyous Section');

    // Get existing data
    $existing_raw  = get_post_meta($id, '_elementor_data', true);
    $existing_data = $existing_raw ? json_decode($existing_raw, true) : [];
    if (!is_array($existing_data)) $existing_data = [];

    // Append new sections
    foreach ($new_elements as $element) {
        if (empty($element['id'])) $element['id'] = ignyous_gen_id();
        $existing_data[] = $element;
    }

    // Save
    update_post_meta($id, '_elementor_data', wp_slash(wp_json_encode($existing_data)));
    update_post_meta($id, '_elementor_edit_mode', 'builder');
    update_post_meta($id, '_elementor_version', '3.0.0'); // minimum version marker

    // Clear Elementor caches
    if (class_exists('\Elementor\Plugin')) {
        \Elementor\Plugin::$instance->files_manager->clear_cache();
    }
    wp_update_post(['ID' => $id, 'post_status' => 'publish', 'post_content' => $post->post_content]);

    return ['success' => true, 'message' => "Added " . count($new_elements) . " section(s) to Elementor page", 'page_id' => $id];
}

// ── Beaver Builder: read and append rows ──────────────────────────
function ignyous_beaver_handler(WP_REST_Request $req) {
    $id   = intval($req->get_param('id'));
    $post = get_post($id);
    if (!$post) return new WP_Error('not_found', 'Page not found', ['status' => 404]);

    if ($req->get_method() === 'GET') {
        $data = get_post_meta($id, '_fl_builder_data', true);
        return ['success' => true, 'data' => ['rows' => $data ? ignyous_beaver_to_array($data) : []]];
    }

    // POST — append new rows
    $params   = $req->get_json_params();
    $new_rows = $params['rows'] ?? [];  // JSON object of row_id => row_data

    // Get existing Beaver data
    $existing = get_post_meta($id, '_fl_builder_data', true);
    $existing = $existing ? (array) $existing : [];

    // Merge new rows
    foreach ($new_rows as $row_id => $row_data) {
        $existing[$row_id] = ignyous_array_to_beaver_obj($row_data);
    }

    // Save as PHP serialized (Beaver's format)
    update_post_meta($id, '_fl_builder_data', $existing);
    update_post_meta($id, '_fl_builder_draft', $existing);
    update_post_meta($id, '_fl_enabled', '1');

    // Publish page
    wp_update_post(['ID' => $id, 'post_status' => 'publish']);

    // Clear Beaver cache
    if (class_exists('FLBuilderModel')) {
        FLBuilderModel::delete_asset_cache_for_post($id);
    }

    return ['success' => true, 'message' => 'Added ' . count($new_rows) . ' row(s) to Beaver Builder page', 'page_id' => $id];
}

// ── Helpers ───────────────────────────────────────────────────────
function ignyous_gen_id($len = 8) {
    return substr(str_shuffle('abcdefghijklmnopqrstuvwxyz0123456789'), 0, $len);
}

function ignyous_beaver_to_array($data) {
    if (is_array($data)) return $data;
    if (is_string($data)) return maybe_unserialize($data);
    return (array) $data;
}

function ignyous_array_to_beaver_obj($data) {
    if (is_array($data)) {
        $obj = new stdClass();
        foreach ($data as $k => $v) {
            $obj->$k = ignyous_array_to_beaver_obj($v);
        }
        return $obj;
    }
    return $data;
}
