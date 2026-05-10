<?php
/**
 * ignyous Bridge — Surgical Element Editing Extension
 * Supports: image upload, page structure reading, element targeting,
 *           property updates (bg color, bg image, padding, text, etc.),
 *           section reordering — for Elementor, Divi, WPBakery, Avada, Gutenberg
 *
 * INSTALL: Paste into ignyous-bridge.php before the closing ?>
 */

add_action('rest_api_init', function() {
    $p = 'ignyous_check_permission';

    // Image upload
    register_rest_route('ignyous/v1', '/media', [
        'methods' => 'POST', 'callback' => 'ignyous_upload_media', 'permission_callback' => $p,
    ]);

    // Page structure (simplified tree of sections + settings)
    register_rest_route('ignyous/v1', '/pages/(?P<id>\d+)/structure', [
        'methods' => 'GET', 'callback' => 'ignyous_get_page_structure', 'permission_callback' => $p,
    ]);

    // Update a specific element by ID
    register_rest_route('ignyous/v1', '/pages/(?P<id>\d+)/element/(?P<element>[a-zA-Z0-9_\-]+)', [
        'methods' => 'PATCH', 'callback' => 'ignyous_update_element', 'permission_callback' => $p,
    ]);

    // Find element by description and update
    register_rest_route('ignyous/v1', '/pages/(?P<id>\d+)/element/find', [
        'methods' => 'POST', 'callback' => 'ignyous_find_and_update_element', 'permission_callback' => $p,
    ]);

    // Reorder sections (array of IDs in new order)
    register_rest_route('ignyous/v1', '/pages/(?P<id>\d+)/reorder', [
        'methods' => 'POST', 'callback' => 'ignyous_reorder_sections', 'permission_callback' => $p,
    ]);

    // Move a section by index delta
    register_rest_route('ignyous/v1', '/pages/(?P<id>\d+)/move-section', [
        'methods' => 'POST', 'callback' => 'ignyous_move_section', 'permission_callback' => $p,
    ]);
});

// ═══════════════════════════════════════════════════════════════
// IMAGE UPLOAD
// ═══════════════════════════════════════════════════════════════

function ignyous_upload_media(WP_REST_Request $req) {
    $params    = $req->get_json_params();
    $image_data = $params['imageData'] ?? ''; // base64 string (may include data:image/xxx;base64, prefix)
    $image_name = sanitize_file_name($params['imageName'] ?? 'upload-' . time() . '.jpg');

    // Strip data URI prefix if present
    if (preg_match('/^data:([^;]+);base64,/', $image_data, $m)) {
        $mime       = $m[1];
        $image_data = preg_replace('/^data:[^;]+;base64,/', '', $image_data);
    } else {
        $mime = 'image/jpeg';
    }

    $decoded = base64_decode($image_data);
    if (!$decoded) return new WP_Error('invalid_image', 'Could not decode image data', ['status' => 400]);

    // Upload to WP uploads directory
    $upload = wp_upload_bits($image_name, null, $decoded);
    if (!empty($upload['error'])) return new WP_Error('upload_error', $upload['error'], ['status' => 500]);

    // Create attachment post
    $attachment = [
        'post_mime_type' => $mime,
        'post_title'     => preg_replace('/\.[^.]+$/', '', $image_name),
        'post_content'   => '',
        'post_status'    => 'inherit',
    ];
    $attach_id  = wp_insert_attachment($attachment, $upload['file']);
    require_once ABSPATH . 'wp-admin/includes/image.php';
    $attach_data = wp_generate_attachment_metadata($attach_id, $upload['file']);
    wp_update_attachment_metadata($attach_id, $attach_data);

    return [
        'success'    => true,
        'message'    => 'Image uploaded',
        'data'       => [
            'id'  => $attach_id,
            'url' => $upload['url'],
            'file'=> $upload['file'],
        ],
    ];
}

// ═══════════════════════════════════════════════════════════════
// PAGE STRUCTURE READER
// ═══════════════════════════════════════════════════════════════

function ignyous_get_page_structure(WP_REST_Request $req) {
    $id   = intval($req->get_param('id'));
    $post = get_post($id);
    if (!$post) return new WP_Error('not_found', 'Page not found', ['status' => 404]);

    $builder  = ignyous_detect_page_builder_v2($id, $post->post_content);
    $structure = [];

    switch ($builder) {
        case 'elementor':
            $raw  = get_post_meta($id, '_elementor_data', true);
            $data = $raw ? json_decode($raw, true) : [];
            $structure = ignyous_elementor_structure($data);
            break;
        case 'divi':
        case 'wpbakery':
        case 'avada':
        case 'gutenberg':
            $structure = ignyous_shortcode_structure($post->post_content, $builder);
            break;
        case 'beaver':
            $data = get_post_meta($id, '_fl_builder_data', true);
            $structure = ignyous_beaver_structure($data);
            break;
    }

    return [
        'success'   => true,
        'data'      => [
            'builder'   => $builder,
            'page_id'   => $id,
            'sections'  => $structure,
            'section_count' => count($structure),
        ],
    ];
}

// Elementor: flatten to readable section list with key settings
function ignyous_elementor_structure($elements, $depth = 0) {
    $out = [];
    if (!is_array($elements)) return $out;
    foreach ($elements as $el) {
        if (!isset($el['id'])) continue;
        $type = $el['elType'] ?? 'unknown';
        $wtype = $el['widgetType'] ?? null;
        $s = $el['settings'] ?? [];

        $item = [
            'id'          => $el['id'],
            'type'        => $wtype ?? $type,   // 'section', 'column', 'heading', 'image', etc.
            'depth'       => $depth,
            'label'       => $s['_title'] ?? ($wtype ?? $type),
            'settings'    => [
                'background_color' => $s['background_color'] ?? ($s['background_overlay_color'] ?? ''),
                'background_image' => $s['background_image']['url'] ?? '',
                'padding'          => $s['padding'] ?? [],
                'title'            => $s['title']   ?? ($s['editor'] ?? ''),
                'text'             => isset($s['editor']) ? wp_strip_all_tags($s['editor']) : '',
                'image_url'        => $s['image']['url'] ?? '',
                'link'             => $s['link']['url'] ?? '',
                'css_classes'      => $s['css_classes'] ?? '',
            ],
        ];

        $out[] = $item;
        if (!empty($el['elements'])) {
            $out = array_merge($out, ignyous_elementor_structure($el['elements'], $depth + 1));
        }
    }
    return $out;
}

// Shortcode-based builders: extract sections with their attributes
function ignyous_shortcode_structure($content, $builder) {
    $sections = [];
    $patterns = [
        'divi'    => '/\[et_pb_section([^\]]*)\]/i',
        'wpbakery'=> '/\[vc_row([^\]]*)\]/i',
        'avada'   => '/\[fusion_builder_container([^\]]*)\]/i',
        'gutenberg'=> '/<!--\s*wp:group([^-]*?)-->/i',
    ];
    $pattern = $patterns[$builder] ?? $patterns['divi'];

    preg_match_all($pattern, $content, $matches, PREG_OFFSET_CAPTURE);

    foreach ($matches[0] as $i => $match) {
        $attrs_str = $matches[1][$i][0] ?? '';
        preg_match_all('/(\w+)=["\']([^"\']*)["\']/', $attrs_str, $attr_matches);
        $attrs = array_combine($attr_matches[1], $attr_matches[2]);

        $section_id = 'section_' . ($i + 1);
        $sections[] = [
            'id'       => $section_id,
            'index'    => $i,
            'type'     => 'section',
            'label'    => "Section " . ($i + 1),
            'settings' => [
                'background_color' => $attrs['background_color'] ?? ($attrs['background'] ?? ''),
                'background_image' => $attrs['background_image'] ?? '',
                'padding'          => ($attrs['custom_padding'] ?? ($attrs['padding'] ?? '')),
                'full_width'       => $attrs['full_width'] ?? ($attrs['hundred_percent'] ?? ''),
                'admin_label'      => $attrs['admin_label'] ?? '',
                'raw_attrs'        => $attrs,
            ],
            'offset'   => $match[1],  // character offset in post_content
        ];
    }
    return $sections;
}

function ignyous_beaver_structure($data) {
    $out = [];
    if (!$data) return $out;
    $rows = is_array($data) ? $data : [];
    $i = 0;
    foreach ($rows as $row_id => $row) {
        $out[] = [
            'id'       => $row_id,
            'index'    => $i++,
            'type'     => 'row',
            'label'    => 'Row ' . $i,
            'settings' => [
                'background_color' => $row->settings->bg_color ?? '',
                'background_image' => $row->settings->bg_image ?? '',
                'padding'          => ($row->settings->padding_top ?? '') . ' ' . ($row->settings->padding_bottom ?? ''),
            ],
        ];
    }
    return $out;
}

function ignyous_detect_page_builder_v2($id, $content) {
    $el = get_post_meta($id, '_elementor_data', true);
    if (!empty($el)) return 'elementor';
    if (get_post_meta($id, '_et_pb_use_builder', true) === 'on') return 'divi';
    if (!empty(get_post_meta($id, '_fl_builder_data', true))) return 'beaver';
    if (strpos($content, '[vc_row') !== false) return 'wpbakery';
    if (strpos($content, '[fusion_builder') !== false) return 'avada';
    if (has_blocks($content)) return 'gutenberg';
    return 'gutenberg';
}

// ═══════════════════════════════════════════════════════════════
// ELEMENT UPDATE — by ID
// ═══════════════════════════════════════════════════════════════

function ignyous_update_element(WP_REST_Request $req) {
    $page_id    = intval($req->get_param('id'));
    $element_id = $req->get_param('element');
    $params     = $req->get_json_params();
    $updates    = $params['updates'] ?? [];
    $post       = get_post($page_id);
    if (!$post) return new WP_Error('not_found', 'Page not found', ['status' => 404]);

    $builder = ignyous_detect_page_builder_v2($page_id, $post->post_content);

    switch ($builder) {
        case 'elementor':
            return ignyous_elementor_update_element($page_id, $element_id, $updates);
        case 'beaver':
            return ignyous_beaver_update_element($page_id, $element_id, $updates);
        default:
            return ignyous_shortcode_update_element($page_id, $post->post_content, $builder, $element_id, $updates);
    }
}

// Elementor: find element by ID in JSON tree and update settings
function ignyous_elementor_update_element($page_id, $element_id, $updates) {
    $raw  = get_post_meta($page_id, '_elementor_data', true);
    $data = $raw ? json_decode($raw, true) : [];
    if (!$data) return new WP_Error('no_data', 'No Elementor data found', ['status' => 404]);

    $found = false;
    ignyous_elementor_walk($data, function(&$el) use ($element_id, $updates, &$found) {
        if ($el['id'] === $element_id) {
            $found = true;
            foreach ($updates as $key => $value) {
                switch ($key) {
                    case 'background_color':
                        $el['settings']['background_background'] = 'classic';
                        $el['settings']['background_color']      = $value;
                        break;
                    case 'background_image':
                        // $value = ['url' => '...', 'id' => 123]
                        $el['settings']['background_background'] = 'classic';
                        $el['settings']['background_image']      = is_array($value) ? $value : ['url' => $value, 'id' => ''];
                        break;
                    case 'background_image_url':
                        $el['settings']['background_background'] = 'classic';
                        $el['settings']['background_image']      = ['url' => $value, 'id' => ''];
                        break;
                    case 'padding':
                        $el['settings']['padding'] = is_array($value) ? $value : ['top'=>$value,'right'=>$value,'bottom'=>$value,'left'=>$value,'unit'=>'px'];
                        break;
                    case 'title':
                    case 'text':
                        if (isset($el['settings']['title']))  $el['settings']['title']  = $value;
                        if (isset($el['settings']['editor'])) $el['settings']['editor'] = $value;
                        break;
                    case 'image_url':
                        $el['settings']['image'] = ['url' => $value, 'id' => ''];
                        break;
                    case 'link':
                        $el['settings']['link'] = ['url' => $value, 'is_external' => false];
                        break;
                    case 'text_color':
                        $el['settings']['title_color']  = $value;
                        $el['settings']['color']        = $value;
                        break;
                    default:
                        $el['settings'][$key] = $value;
                }
            }
        }
    });

    if (!$found) return new WP_Error('element_not_found', "Element {$element_id} not found in page", ['status' => 404]);

    update_post_meta($page_id, '_elementor_data', wp_slash(wp_json_encode($data)));
    if (class_exists('\Elementor\Plugin')) \Elementor\Plugin::$instance->files_manager->clear_cache();
    wp_update_post(['ID' => $page_id, 'post_status' => 'publish']);

    return ['success' => true, 'message' => "Element {$element_id} updated", 'updated_keys' => array_keys($updates)];
}

function ignyous_elementor_walk(&$elements, $callback) {
    if (!is_array($elements)) return;
    foreach ($elements as &$el) {
        $callback($el);
        if (!empty($el['elements'])) ignyous_elementor_walk($el['elements'], $callback);
    }
}

// Shortcode-based: update attributes on the nth section/row
function ignyous_shortcode_update_element($page_id, $content, $builder, $element_id, $updates) {
    // element_id for shortcode builders = 'section_N' (1-indexed)
    $index = intval(str_replace('section_', '', $element_id)) - 1;

    $tag_map = [
        'divi'    => 'et_pb_section',
        'wpbakery'=> 'vc_row',
        'avada'   => 'fusion_builder_container',
    ];
    $tag = $tag_map[$builder] ?? 'et_pb_section';

    $pattern   = '/(\[' . preg_quote($tag, '/') . ')([^\]]*?)(\])/i';
    $count     = 0;
    $new_content = preg_replace_callback($pattern, function($m) use ($index, $updates, &$count) {
        if ($count++ !== $index) return $m[0];
        $attrs_str = $m[2];
        // Update or insert each setting
        foreach ($updates as $key => $value) {
            $attr_key = ignyous_map_setting_to_shortcode_attr($key);
            if (preg_match('/(' . preg_quote($attr_key, '/') . ')=["\'][^"\']*["\']/', $attrs_str)) {
                $attrs_str = preg_replace(
                    '/(' . preg_quote($attr_key, '/') . ')=["\'][^"\']*["\']/',
                    $attr_key . '="' . esc_attr($value) . '"',
                    $attrs_str
                );
            } else {
                $attrs_str .= ' ' . $attr_key . '="' . esc_attr($value) . '"';
            }
        }
        return $m[1] . $attrs_str . $m[3];
    }, $content);

    wp_update_post(['ID' => $page_id, 'post_content' => $new_content, 'post_status' => 'publish']);
    return ['success' => true, 'message' => "Section {$element_id} updated (builder: {$builder})"];
}

function ignyous_map_setting_to_shortcode_attr($key) {
    return [
        'background_color' => 'background_color',
        'background_image' => 'background_image',
        'background_image_url' => 'background_image',
        'padding'          => 'custom_padding',
        'text_color'       => 'text_color',
        'full_width'       => 'full_width',
    ][$key] ?? $key;
}

function ignyous_beaver_update_element($page_id, $row_id, $updates) {
    $data = get_post_meta($page_id, '_fl_builder_data', true);
    if (!$data || !isset($data[$row_id])) return new WP_Error('not_found', "Row {$row_id} not found", ['status' => 404]);

    foreach ($updates as $key => $value) {
        switch ($key) {
            case 'background_color': $data[$row_id]->settings->bg_color = $value; break;
            case 'background_image_url': $data[$row_id]->settings->bg_image = $value; break;
            case 'padding': $data[$row_id]->settings->padding_top = $value; $data[$row_id]->settings->padding_bottom = $value; break;
            default: $data[$row_id]->settings->$key = $value;
        }
    }

    update_post_meta($page_id, '_fl_builder_data', $data);
    update_post_meta($page_id, '_fl_builder_draft', $data);
    if (class_exists('FLBuilderModel')) FLBuilderModel::delete_asset_cache_for_post($page_id);
    return ['success' => true, 'message' => "Row {$row_id} updated"];
}

// ═══════════════════════════════════════════════════════════════
// FIND ELEMENT BY DESCRIPTION + UPDATE
// ═══════════════════════════════════════════════════════════════

function ignyous_find_and_update_element(WP_REST_Request $req) {
    $page_id     = intval($req->get_param('id'));
    $params      = $req->get_json_params();
    $description = strtolower($params['description'] ?? '');
    $updates     = $params['updates'] ?? [];
    $post        = get_post($page_id);
    if (!$post) return new WP_Error('not_found', 'Page not found', ['status' => 404]);

    $builder = ignyous_detect_page_builder_v2($page_id, $post->post_content);

    if ($builder === 'elementor') {
        $raw  = get_post_meta($page_id, '_elementor_data', true);
        $data = $raw ? json_decode($raw, true) : [];
        $target_id = ignyous_elementor_find_by_description($data, $description);
        if ($target_id) {
            return ignyous_elementor_update_element($page_id, $target_id, $updates);
        }
    }

    // Fallback: match by index keywords ("first section", "last section", "contact section", etc.)
    $structure = ignyous_shortcode_structure($post->post_content, $builder);
    $target_index = ignyous_match_section_by_description($structure, $description);
    if ($target_index !== null) {
        $element_id = 'section_' . ($target_index + 1);
        return ignyous_shortcode_update_element($page_id, $post->post_content, $builder, $element_id, $updates);
    }

    return new WP_Error('not_found', "Could not find element matching: '{$description}'", ['status' => 404]);
}

function ignyous_elementor_find_by_description($elements, $description, &$found_id = null) {
    if (!is_array($elements)) return null;
    $keywords = explode(' ', $description);
    foreach ($elements as $el) {
        $label    = strtolower($el['settings']['_title'] ?? '');
        $wtype    = strtolower($el['widgetType'] ?? $el['elType'] ?? '');
        $text     = strtolower($el['settings']['title'] ?? ($el['settings']['editor'] ?? ''));
        $combined = $label . ' ' . $wtype . ' ' . $text;

        $matches = 0;
        foreach ($keywords as $kw) {
            if (strlen($kw) > 3 && strpos($combined, $kw) !== false) $matches++;
        }
        if ($matches > 0) return $el['id'];

        // Positional: "first", "second", "last", "header", "hero", "footer"
        if ((strpos($description, 'header') !== false || strpos($description, 'hero') !== false || strpos($description, 'first') !== false) && $el['elType'] === 'section') {
            return $el['id'];
        }

        if (!empty($el['elements'])) {
            $inner = ignyous_elementor_find_by_description($el['elements'], $description);
            if ($inner) return $inner;
        }
    }
    return null;
}

function ignyous_match_section_by_description($sections, $description) {
    if (strpos($description, 'first')   !== false || strpos($description, 'header') !== false || strpos($description, 'hero') !== false) return 0;
    if (strpos($description, 'last')    !== false || strpos($description, 'footer') !== false) return count($sections) - 1;
    if (strpos($description, 'second')  !== false) return min(1, count($sections) - 1);
    if (strpos($description, 'third')   !== false) return min(2, count($sections) - 1);
    if (strpos($description, 'contact') !== false) {
        foreach ($sections as $i => $s) {
            if (stripos($s['settings']['admin_label'] ?? '', 'contact') !== false) return $i;
        }
        return count($sections) - 2; // second to last is often contact
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════
// SECTION REORDERING
// ═══════════════════════════════════════════════════════════════

function ignyous_reorder_sections(WP_REST_Request $req) {
    $page_id  = intval($req->get_param('id'));
    $params   = $req->get_json_params();
    $new_order = $params['newOrder'] ?? []; // array of element IDs in desired order
    $post     = get_post($page_id);
    if (!$post) return new WP_Error('not_found', 'Page not found', ['status' => 404]);

    $builder = ignyous_detect_page_builder_v2($page_id, $post->post_content);

    if ($builder === 'elementor') {
        $raw  = get_post_meta($page_id, '_elementor_data', true);
        $data = $raw ? json_decode($raw, true) : [];
        // Build lookup table
        $by_id = [];
        foreach ($data as $el) $by_id[$el['id']] = $el;
        // Reorder
        $reordered = [];
        foreach ($new_order as $id) {
            if (isset($by_id[$id])) $reordered[] = $by_id[$id];
        }
        // Add any sections not in the new order at the end
        foreach ($data as $el) {
            if (!in_array($el['id'], $new_order)) $reordered[] = $el;
        }
        update_post_meta($page_id, '_elementor_data', wp_slash(wp_json_encode($reordered)));
        if (class_exists('\Elementor\Plugin')) \Elementor\Plugin::$instance->files_manager->clear_cache();
        return ['success' => true, 'message' => 'Sections reordered'];
    }

    // Shortcode builders: extract top-level blocks and reorder
    if (in_array($builder, ['divi', 'wpbakery', 'avada', 'gutenberg'])) {
        $result = ignyous_shortcode_reorder($post->post_content, $builder, $new_order);
        wp_update_post(['ID' => $page_id, 'post_content' => $result, 'post_status' => 'publish']);
        return ['success' => true, 'message' => 'Sections reordered'];
    }

    return new WP_Error('unsupported', 'Reordering not supported for this builder', ['status' => 400]);
}

function ignyous_move_section(WP_REST_Request $req) {
    $page_id = intval($req->get_param('id'));
    $params  = $req->get_json_params();
    $from    = intval($params['fromIndex'] ?? 0);
    $to      = intval($params['toIndex']   ?? 0);
    $post    = get_post($page_id);
    if (!$post) return new WP_Error('not_found', 'Page not found', ['status' => 404]);

    $builder = ignyous_detect_page_builder_v2($page_id, $post->post_content);

    if ($builder === 'elementor') {
        $raw  = get_post_meta($page_id, '_elementor_data', true);
        $data = $raw ? json_decode($raw, true) : [];
        if ($from < 0 || $from >= count($data) || $to < 0 || $to >= count($data)) {
            return new WP_Error('out_of_bounds', 'Index out of bounds', ['status' => 400]);
        }
        $item = array_splice($data, $from, 1);
        array_splice($data, $to, 0, $item);
        update_post_meta($page_id, '_elementor_data', wp_slash(wp_json_encode($data)));
        if (class_exists('\Elementor\Plugin')) \Elementor\Plugin::$instance->files_manager->clear_cache();
        return ['success' => true, 'message' => "Section moved from position {$from} to {$to}"];
    }

    // Shortcode builders
    $content  = ignyous_move_shortcode_block($post->post_content, $builder, $from, $to);
    wp_update_post(['ID' => $page_id, 'post_content' => $content, 'post_status' => 'publish']);
    return ['success' => true, 'message' => "Section moved from position {$from} to {$to}"];
}

function ignyous_shortcode_reorder($content, $builder, $new_order) {
    // new_order is array like ['section_2','section_1','section_3']
    $order_indices = array_map(fn($id) => intval(str_replace('section_', '', $id)) - 1, $new_order);
    $blocks = ignyous_split_top_level_blocks($content, $builder);
    $reordered = [];
    foreach ($order_indices as $i) {
        if (isset($blocks[$i])) $reordered[] = $blocks[$i];
    }
    foreach ($blocks as $i => $b) {
        if (!in_array($i, $order_indices)) $reordered[] = $b;
    }
    return implode("\n\n", $reordered);
}

function ignyous_move_shortcode_block($content, $builder, $from, $to) {
    $blocks = ignyous_split_top_level_blocks($content, $builder);
    if ($from < 0 || $from >= count($blocks) || $to < 0 || $to >= count($blocks)) return $content;
    $item = array_splice($blocks, $from, 1);
    array_splice($blocks, $to, 0, $item);
    return implode("\n\n", $blocks);
}

function ignyous_split_top_level_blocks($content, $builder) {
    $open_tags = [
        'divi'    => ['et_pb_section',         '/et_pb_section'],
        'wpbakery'=> ['vc_row',                '/vc_row'],
        'avada'   => ['fusion_builder_container','/fusion_builder_container'],
        'gutenberg'=> ['!-- wp:group',          '!-- /wp:group'],
    ];
    list($open, $close) = $open_tags[$builder] ?? $open_tags['divi'];

    $blocks = [];
    $pos    = 0;
    while (($start = strpos($content, '[' . $open, $pos)) !== false || ($start = strpos($content, '<' . $open, $pos)) !== false) {
        $end = strpos($content, '[' . $close . ']', $start);
        if ($end === false) break;
        $end   += strlen('[' . $close . ']');
        $blocks[] = substr($content, $start, $end - $start);
        $pos = $end;
    }
    return $blocks ?: [$content];
}
