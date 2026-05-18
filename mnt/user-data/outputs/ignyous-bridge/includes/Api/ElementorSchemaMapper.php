<?php
namespace Ignyous\Api;

/**
 * ElementorSchemaMapper — Maps Elementor's complete data model by querying its internal registries.
 *
 * Instead of hardcoding widget fields, this dynamically reads:
 *   - Every registered widget type and its controls (settings)
 *   - Section/column/container structure and their settings
 *   - Control types (color, typography, slider, dimensions, select, etc.)
 *   - Default values for every setting
 *   - CSS selectors for each control
 *   - Responsive variants (_tablet, _mobile)
 *
 * This lets us:
 *   - CREATE new sections/containers/widgets with proper defaults
 *   - UPDATE any widget setting we want (not just hardcoded ones)
 *   - Know the exact field names for every property
 *   - Generate valid Elementor JSON for new elements
 */
class ElementorSchemaMapper {

    public function register_routes() {
        // Full schema dump
        register_rest_route('ignyous/v1', '/elementor/schema', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_full_schema'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Single widget schema
        register_rest_route('ignyous/v1', '/elementor/schema/widget/(?P<widget_type>[a-z0-9_-]+)', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_widget_schema'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Create element template (returns valid JSON for a new element)
        register_rest_route('ignyous/v1', '/elementor/create-element', [
            'methods'             => 'POST',
            'callback'            => [$this, 'create_element_template'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Insert element into a page
        register_rest_route('ignyous/v1', '/elementor/insert-element', [
            'methods'             => 'POST',
            'callback'            => [$this, 'insert_element'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
    }

    /**
     * Get the full Elementor schema — all widget types, element types, and their controls.
     */
    public function get_full_schema($request) {
        if (!class_exists('\Elementor\Plugin')) {
            return new \WP_Error('no_elementor', 'Elementor not active', ['status' => 400]);
        }

        $compact = $request->get_param('compact') === 'true';

        $schema = [
            'success'       => true,
            'elementor_version' => ELEMENTOR_VERSION,
            'element_types' => $this->get_element_types(),
            'widgets'       => $this->get_all_widget_schemas($compact),
            'global_settings' => $this->get_global_settings(),
            'creation_guide'=> $this->get_creation_guide(),
        ];

        return $schema;
    }

    /**
     * Get schema for a specific widget type.
     */
    public function get_widget_schema($request) {
        if (!class_exists('\Elementor\Plugin')) {
            return new \WP_Error('no_elementor', 'Elementor not active', ['status' => 400]);
        }

        $widget_type = $request['widget_type'];
        $manager = \Elementor\Plugin::$instance->widgets_manager;
        $widget = $manager->get_widget_types($widget_type);

        if (!$widget) {
            return new \WP_Error('not_found', "Widget type '$widget_type' not found", ['status' => 404]);
        }

        return [
            'success' => true,
            'widget'  => $this->map_widget($widget, false),
        ];
    }

    /**
     * Create a template for a new Elementor element with proper defaults.
     *
     * Body: {
     *   type: "section" | "container" | "widget",
     *   widget_type: "heading" | "text-editor" | etc. (required for widgets),
     *   settings: { optional overrides },
     *   columns: 3  (for sections: how many columns to create)
     * }
     */
    public function create_element_template($request) {
        if (!class_exists('\Elementor\Plugin')) {
            return new \WP_Error('no_elementor', 'Elementor not active', ['status' => 400]);
        }

        $body        = $request->get_json_params();
        $type        = $body['type']        ?? 'widget';
        $widget_type = $body['widget_type'] ?? '';
        $settings    = $body['settings']    ?? [];
        $columns     = (int) ($body['columns'] ?? 2);
        $preset      = $body['preset']      ?? null;

        $element = null;

        switch ($type) {
            case 'section':
                $element = $this->build_section($columns, $settings);
                break;

            case 'container':
                $element = $this->build_container($settings);
                break;

            case 'widget':
                if (!$widget_type) return new \WP_Error('missing_type', 'widget_type required', ['status' => 400]);
                $element = $this->build_widget($widget_type, $settings);
                break;

            case 'preset':
                $element = $this->build_preset($preset, $settings);
                break;
        }

        if (!$element) {
            return new \WP_Error('build_failed', 'Could not create element', ['status' => 400]);
        }

        return ['success' => true, 'element' => $element];
    }

    /**
     * Insert a new element into a page's Elementor data.
     *
     * Body: {
     *   post_id: 2,
     *   element: { the element JSON from create_element_template },
     *   position: "end" | "start" | number (1-based index),
     *   parent_id: "optional parent element_id to insert inside"
     * }
     */
    public function insert_element($request) {
        $body      = $request->get_json_params();
        $post_id   = (int) ($body['post_id'] ?? 0);
        $element   = $body['element']        ?? null;
        $position  = $body['position']       ?? 'end';
        $parent_id = $body['parent_id']      ?? null;

        if (!$post_id || !$element) {
            return new \WP_Error('missing_fields', 'post_id and element required', ['status' => 400]);
        }

        $raw  = get_post_meta($post_id, '_elementor_data', true);
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            return new \WP_Error('no_data', 'No Elementor data', ['status' => 404]);
        }

        if ($parent_id) {
            // Insert inside a specific parent
            $data = $this->insert_into_parent($data, $parent_id, $element, $position);
        } else {
            // Insert at root level
            if ($position === 'start') {
                array_unshift($data, $element);
            } elseif (is_numeric($position)) {
                $idx = max(0, min((int) $position - 1, count($data)));
                array_splice($data, $idx, 0, [$element]);
            } else {
                $data[] = $element;
            }
        }

        update_post_meta($post_id, '_elementor_data', wp_slash(json_encode($data)));

        // Clear caches
        delete_post_meta($post_id, '_elementor_css');
        delete_post_meta($post_id, '_elementor_page_assets');
        do_action('elementor/core/files/clear_cache');
        if (isset(\Elementor\Plugin::$instance->files_manager)) {
            \Elementor\Plugin::$instance->files_manager->clear_cache();
        }
        $upload_dir = wp_upload_dir();
        $css_dir = trailingslashit($upload_dir['basedir']) . 'elementor/css/';
        if (is_dir($css_dir)) {
            foreach (glob($css_dir . '*.css') as $file) { @unlink($file); }
        }

        return [
            'success'    => true,
            'post_id'    => $post_id,
            'page_title' => get_the_title($post_id),
            'element_id' => $element['id'] ?? 'unknown',
            'position'   => $position,
        ];
    }

    // ─── Schema Extraction ───────────────────────────────────────────

    /**
     * Get all element types and their structure.
     */
    private function get_element_types(): array {
        return [
            'section' => [
                'description' => 'Top-level row container (legacy). Contains columns.',
                'settings'    => $this->get_section_settings(),
                'children'    => ['column'],
                'css_selector'=> '.elementor-section',
            ],
            'column' => [
                'description' => 'Column inside a section. Contains widgets.',
                'settings'    => $this->get_column_settings(),
                'children'    => ['widget', 'section'],
                'css_selector'=> '.elementor-column',
            ],
            'container' => [
                'description' => 'Flexbox container (new). Can contain widgets or other containers.',
                'settings'    => $this->get_container_settings(),
                'children'    => ['widget', 'container'],
                'css_selector'=> '.e-con',
            ],
            'widget' => [
                'description' => 'Content element (heading, text, image, button, etc).',
                'children'    => [],
                'css_selector'=> '.elementor-widget',
            ],
        ];
    }

    /**
     * Get all registered widget types and their controls.
     */
    private function get_all_widget_schemas(bool $compact = false): array {
        $manager = \Elementor\Plugin::$instance->widgets_manager;
        $types   = $manager->get_widget_types();
        $schemas = [];

        foreach ($types as $name => $widget) {
            $schemas[$name] = $this->map_widget($widget, $compact);
        }

        return $schemas;
    }

    /**
     * Map a single widget's controls to our schema format.
     */
    private function map_widget($widget, bool $compact = false): array {
        $result = [
            'name'        => $widget->get_name(),
            'title'       => $widget->get_title(),
            'icon'        => $widget->get_icon(),
            'categories'  => $widget->get_categories(),
        ];

        // Get controls (this initializes them)
        try {
            // Ensure controls are registered
            $controls_stack = $widget->get_stack();
            $controls = $controls_stack['controls'] ?? [];
        } catch (\Exception $e) {
            $controls = [];
        }

        if (empty($controls)) {
            // Fallback: try getting controls directly
            try {
                $controls = $widget->get_controls();
            } catch (\Exception $e) {
                $controls = [];
            }
        }

        $mapped_controls = [];
        $content_fields  = [];
        $style_fields    = [];

        foreach ($controls as $control_id => $control) {
            // Skip internal/hidden controls
            if (strpos($control_id, '_') === 0 && strpos($control_id, '_css') !== 0) continue;

            $mapped = [
                'type'    => $control['type'] ?? 'unknown',
                'label'   => $control['label'] ?? $control_id,
            ];

            if (!$compact) {
                if (isset($control['default']) && $control['default'] !== '') {
                    $mapped['default'] = $control['default'];
                }
                if (!empty($control['options'])) {
                    $mapped['options'] = $control['options'];
                }
                if (!empty($control['selector'])) {
                    $mapped['css_selector'] = $control['selector'];
                }
                if (!empty($control['responsive'])) {
                    $mapped['responsive'] = true;
                }
            }

            // Categorize by tab
            $tab = $control['tab'] ?? 'content';
            if ($tab === 'style' || strpos($control_id, 'color') !== false ||
                strpos($control_id, 'typography') !== false ||
                strpos($control_id, 'background') !== false) {
                $style_fields[$control_id] = $mapped;
            } else {
                $content_fields[$control_id] = $mapped;
            }
        }

        $result['content_fields'] = $content_fields;
        $result['style_fields']   = $style_fields;
        $result['total_controls'] = count($content_fields) + count($style_fields);

        return $result;
    }

    // ─── Section/Column/Container Settings ───────────────────────────

    private function get_section_settings(): array {
        return [
            'structure'           => ['type' => 'select', 'desc' => 'Column layout (10=1col, 20=2col, 30=3col, etc)'],
            'layout'              => ['type' => 'select', 'options' => ['boxed', 'full_width'], 'default' => 'boxed'],
            'content_width'       => ['type' => 'slider', 'desc' => 'Content area width'],
            'gap'                 => ['type' => 'select', 'options' => ['default','no','narrow','extended','wide','wider'], 'default' => 'default'],
            'height'              => ['type' => 'select', 'options' => ['default','full','min-height','fit'], 'default' => 'default'],
            'min_height'          => ['type' => 'slider', 'desc' => 'Minimum height'],
            'background_background' => ['type' => 'select', 'options' => ['','classic','gradient','video','slideshow']],
            'background_color'    => ['type' => 'color'],
            'background_image'    => ['type' => 'media', 'desc' => '{url, id}'],
            'background_overlay_color' => ['type' => 'color'],
            'border_border'       => ['type' => 'select', 'options' => ['','solid','double','dotted','dashed','groove']],
            'border_width'        => ['type' => 'dimensions', 'desc' => '{top,right,bottom,left,unit}'],
            'border_color'        => ['type' => 'color'],
            'border_radius'       => ['type' => 'dimensions'],
            'padding'             => ['type' => 'dimensions', 'desc' => '{top,right,bottom,left,unit,isLinked}'],
            'margin'              => ['type' => 'dimensions'],
        ];
    }

    private function get_column_settings(): array {
        return [
            '_column_size'        => ['type' => 'number', 'desc' => 'Width percentage (e.g., 33, 50, 100)'],
            '_inline_size'        => ['type' => 'number', 'desc' => 'Custom width percentage'],
            'content_position'    => ['type' => 'select', 'options' => ['','top','center','bottom']],
            'background_background' => ['type' => 'select'],
            'background_color'    => ['type' => 'color'],
            'padding'             => ['type' => 'dimensions'],
            'margin'              => ['type' => 'dimensions'],
        ];
    }

    private function get_container_settings(): array {
        return [
            'flex_direction'      => ['type' => 'select', 'options' => ['row','column','row-reverse','column-reverse'], 'default' => 'row'],
            'flex_wrap'           => ['type' => 'select', 'options' => ['nowrap','wrap','wrap-reverse'], 'default' => 'nowrap'],
            'justify_content'     => ['type' => 'select', 'options' => ['flex-start','center','flex-end','space-between','space-around','space-evenly']],
            'align_items'         => ['type' => 'select', 'options' => ['flex-start','center','flex-end','stretch']],
            'gap'                 => ['type' => 'slider', 'desc' => 'Gap between children'],
            'content_width'       => ['type' => 'select', 'options' => ['boxed','full'], 'default' => 'boxed'],
            'width'               => ['type' => 'slider', 'desc' => 'Container width'],
            'min_height'          => ['type' => 'slider'],
            'overflow'            => ['type' => 'select', 'options' => ['','hidden','auto']],
            'background_background' => ['type' => 'select'],
            'background_color'    => ['type' => 'color'],
            'background_image'    => ['type' => 'media'],
            'padding'             => ['type' => 'dimensions'],
            'margin'              => ['type' => 'dimensions'],
            'border_border'       => ['type' => 'select'],
            'border_color'        => ['type' => 'color'],
            'border_radius'       => ['type' => 'dimensions'],
            'box_shadow_box_shadow' => ['type' => 'box_shadow'],
        ];
    }

    // ─── Element Building ────────────────────────────────────────────

    private function generate_id(): string {
        return substr(md5(uniqid(mt_rand(), true)), 0, 7);
    }

    private function build_section(int $columns, array $settings): array {
        $cols = [];
        $col_size = floor(100 / max(1, $columns));

        for ($i = 0; $i < $columns; $i++) {
            $cols[] = [
                'id'       => $this->generate_id(),
                'elType'   => 'column',
                'settings' => ['_column_size' => $col_size, '_inline_size' => null],
                'elements' => [],
            ];
        }

        return [
            'id'       => $this->generate_id(),
            'elType'   => 'section',
            'settings' => array_merge([
                'layout'    => 'boxed',
                'gap'       => 'default',
                'structure' => ($columns * 10) . '',
            ], $settings),
            'elements' => $cols,
        ];
    }

    private function build_container(array $settings): array {
        return [
            'id'       => $this->generate_id(),
            'elType'   => 'container',
            'settings' => array_merge([
                'flex_direction'  => 'row',
                'content_width'   => 'boxed',
                'flex_wrap'       => 'nowrap',
            ], $settings),
            'elements' => [],
            'isInner'  => false,
        ];
    }

    private function build_widget(string $widget_type, array $settings): array {
        // Get default settings from widget definition
        $defaults = $this->get_widget_defaults($widget_type);

        return [
            'id'         => $this->generate_id(),
            'elType'     => 'widget',
            'widgetType' => $widget_type,
            'settings'   => array_merge($defaults, $settings),
            'elements'   => [],
        ];
    }

    /**
     * Build common presets (hero section, services grid, testimonials, CTA, etc.)
     */
    private function build_preset(?string $preset, array $settings): ?array {
        switch ($preset) {
            case 'hero':
                $section = $this->build_container(array_merge([
                    'background_background' => 'classic',
                    'background_color'      => '#1a365d',
                    'padding'               => ['top' => '80', 'bottom' => '80', 'unit' => 'px', 'isLinked' => false],
                    'flex_direction'         => 'column',
                    'align_items'            => 'center',
                ], $settings));

                $section['elements'] = [
                    $this->build_widget('heading', [
                        'title'       => $settings['heading'] ?? 'Your Headline Here',
                        'header_size' => 'h1',
                        'align'       => 'center',
                        'title_color' => '#ffffff',
                    ]),
                    $this->build_widget('text-editor', [
                        'editor' => '<p style="text-align: center;">' . ($settings['subheading'] ?? 'Your subheading text goes here') . '</p>',
                    ]),
                    $this->build_widget('button', [
                        'text'             => $settings['button_text'] ?? 'Get Started',
                        'link'             => ['url' => $settings['button_url'] ?? '#', 'is_external' => false],
                        'align'            => 'center',
                    ]),
                ];
                return $section;

            case 'services':
                $count = (int) ($settings['count'] ?? 3);
                $section = $this->build_container([
                    'flex_direction' => 'row',
                    'flex_wrap'      => 'wrap',
                    'gap'            => ['size' => 20, 'unit' => 'px'],
                    'padding'        => ['top' => '60', 'bottom' => '60', 'unit' => 'px', 'isLinked' => false],
                ]);

                for ($i = 1; $i <= $count; $i++) {
                    $section['elements'][] = $this->build_widget('image-box', [
                        'title_text'       => $settings["service_{$i}_title"] ?? "Service {$i}",
                        'description_text' => $settings["service_{$i}_desc"] ?? 'Description of this service.',
                    ]);
                }
                return $section;

            case 'testimonials':
                $count = (int) ($settings['count'] ?? 3);
                $section = $this->build_container([
                    'flex_direction' => 'row',
                    'gap'            => ['size' => 30, 'unit' => 'px'],
                    'padding'        => ['top' => '60', 'bottom' => '60', 'unit' => 'px', 'isLinked' => false],
                ]);

                for ($i = 1; $i <= $count; $i++) {
                    $section['elements'][] = $this->build_widget('testimonial', [
                        'testimonial_name'    => $settings["name_{$i}"] ?? "Client {$i}",
                        'testimonial_content' => $settings["content_{$i}"] ?? 'Great experience working with this team!',
                        'testimonial_job'     => $settings["job_{$i}"] ?? '',
                    ]);
                }
                return $section;

            case 'cta':
                $section = $this->build_container(array_merge([
                    'background_background' => 'classic',
                    'background_color'      => '#e94560',
                    'padding'               => ['top' => '60', 'bottom' => '60', 'unit' => 'px', 'isLinked' => false],
                    'flex_direction'         => 'column',
                    'align_items'            => 'center',
                ], $settings));

                $section['elements'] = [
                    $this->build_widget('heading', [
                        'title'       => $settings['heading'] ?? 'Ready to Get Started?',
                        'header_size' => 'h2',
                        'align'       => 'center',
                        'title_color' => '#ffffff',
                    ]),
                    $this->build_widget('button', [
                        'text'  => $settings['button_text'] ?? 'Contact Us',
                        'link'  => ['url' => $settings['button_url'] ?? '/contact'],
                        'align' => 'center',
                    ]),
                ];
                return $section;

            default:
                return null;
        }
    }

    /**
     * Get default settings for a widget type.
     */
    private function get_widget_defaults(string $type): array {
        $defaults = [
            'heading'      => ['title' => 'Heading', 'header_size' => 'h2'],
            'text-editor'  => ['editor' => '<p>Your text here.</p>'],
            'image'        => ['image' => ['url' => '', 'id' => '']],
            'button'       => ['text' => 'Click Here', 'link' => ['url' => '#']],
            'image-box'    => ['title_text' => 'Title', 'description_text' => 'Description'],
            'icon-box'     => ['title_text' => 'Title', 'description_text' => 'Description'],
            'testimonial'  => ['testimonial_name' => 'Name', 'testimonial_content' => 'Testimonial text.'],
            'counter'      => ['starting_number' => 0, 'ending_number' => 100, 'title' => 'Counter'],
            'divider'      => ['style' => 'solid'],
            'spacer'       => ['space' => ['size' => 50, 'unit' => 'px']],
            'form'         => ['form_name' => 'Contact Form'],
        ];

        return $defaults[$type] ?? [];
    }

    // ─── Helper: Insert into parent ──────────────────────────────────

    private function insert_into_parent(array $elements, string $parent_id, array $new_element, $position): array {
        for ($i = 0; $i < count($elements); $i++) {
            if (($elements[$i]['id'] ?? '') === $parent_id) {
                $children = $elements[$i]['elements'] ?? [];
                if ($position === 'start') {
                    array_unshift($children, $new_element);
                } elseif (is_numeric($position)) {
                    $idx = max(0, min((int) $position - 1, count($children)));
                    array_splice($children, $idx, 0, [$new_element]);
                } else {
                    $children[] = $new_element;
                }
                $elements[$i]['elements'] = $children;
                return $elements;
            }
            if (!empty($elements[$i]['elements'])) {
                $elements[$i]['elements'] = $this->insert_into_parent($elements[$i]['elements'], $parent_id, $new_element, $position);
            }
        }
        return $elements;
    }

    // ─── Global Settings ─────────────────────────────────────────────

    private function get_global_settings(): array {
        $kit_id = get_option('elementor_active_kit');
        $result = [];

        if ($kit_id) {
            $kit_settings = get_post_meta($kit_id, '_elementor_page_settings', true);
            if (is_array($kit_settings)) {
                $result['kit_id'] = $kit_id;

                // How to update global settings
                $result['update_method'] = 'update_post_meta($kit_id, "_elementor_page_settings", array_merge($existing, $new))';

                // Current global values
                $global_keys = [
                    'system_colors', 'custom_colors', 'system_typography', 'custom_typography',
                    'body_color', 'heading_color', 'link_normal_color', 'link_hover_color',
                    'body_typography_font_family', 'body_typography_font_size',
                    'button_background_color', 'button_text_color',
                    'container_width', 'space_between_widgets',
                    'page_title_selector', 'active_breakpoints',
                ];

                foreach ($global_keys as $key) {
                    if (isset($kit_settings[$key])) {
                        $result[$key] = $kit_settings[$key];
                    }
                }
            }
        }

        return $result;
    }

    // ─── Creation Guide ──────────────────────────────────────────────

    private function get_creation_guide(): array {
        return [
            'hierarchy' => [
                'legacy' => 'Document → Section → Column → Widget',
                'modern' => 'Document → Container → Widget (or nested Container)',
                'note'   => 'Use Container (flexbox) for new elements. Section/Column is legacy.',
            ],
            'required_fields' => [
                'all_elements' => ['id' => 'string (7 char hex)', 'elType' => 'section|column|container|widget', 'settings' => 'object', 'elements' => 'array'],
                'widgets_only' => ['widgetType' => 'string (e.g., heading, text-editor, image)'],
            ],
            'id_generation' => 'Use substr(md5(uniqid(mt_rand(), true)), 0, 7)',
            'responsive' => [
                'pattern'  => 'Append _tablet or _mobile to any setting key for responsive overrides.',
                'example'  => 'padding → padding_tablet → padding_mobile',
            ],
            'available_presets' => ['hero', 'services', 'testimonials', 'cta'],
        ];
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
