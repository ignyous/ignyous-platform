<?php
namespace Ignyous\Api;

/**
 * EnrichedScanner — Deep scan of site configuration, theme options, builder settings,
 * and visual properties. This is the "read" layer that powers reliable "write" operations.
 *
 * What it captures:
 *   - Theme Customizer values (colors, fonts, logo, header/footer settings)
 *   - Theme-specific options (Oshine, Avada, Divi, Astra, etc.)
 *   - Elementor global settings (colors, fonts, kits)
 *   - Per-widget visual settings (colors, backgrounds, fonts, images)
 *   - WooCommerce summary (products, categories, currency)
 *   - Form plugin details (fields, notifications)
 *   - Menu structure with full details
 *   - Gutenberg block inventory
 *
 * The AI uses this to answer questions like:
 *   "What color is the footer background?"
 *   "What font are the headings using?"
 *   "How many products are in the store?"
 *   "What fields does the contact form have?"
 */
class EnrichedScanner {

    public function register_routes() {
        register_rest_route('ignyous/v1', '/enriched-scan', [
            'methods'             => 'GET',
            'callback'            => [$this, 'full_enriched_scan'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route('ignyous/v1', '/enriched-scan/theme-options', [
            'methods'             => 'GET',
            'callback'            => [$this, 'scan_theme_options'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route('ignyous/v1', '/enriched-scan/builder-settings', [
            'methods'             => 'GET',
            'callback'            => [$this, 'scan_builder_settings'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route('ignyous/v1', '/enriched-scan/woocommerce', [
            'methods'             => 'GET',
            'callback'            => [$this, 'scan_woocommerce'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route('ignyous/v1', '/enriched-scan/forms', [
            'methods'             => 'GET',
            'callback'            => [$this, 'scan_forms_detailed'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route('ignyous/v1', '/enriched-scan/page/(?P<page_id>\d+)/widgets', [
            'methods'             => 'GET',
            'callback'            => [$this, 'scan_page_widgets_detailed'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
    }

    /**
     * Full enriched scan — everything the AI needs to know about this site.
     */
    public function full_enriched_scan($request) {
        $start = microtime(true);

        $result = [
            'success'       => true,
            'scanned_at'    => gmdate('c'),
            'theme'         => $this->scan_theme_options_internal(),
            'builder'       => $this->scan_builder_settings_internal(),
            'pages'         => $this->scan_pages_enriched(),
            'woocommerce'   => $this->scan_woocommerce_internal(),
            'forms'         => $this->scan_forms_internal(),
            'menus'         => $this->scan_menus_detailed(),
            'duration_ms'   => round((microtime(true) - $start) * 1000),
        ];

        return $result;
    }

    // ─── Theme Options ───────────────────────────────────────────────

    public function scan_theme_options($request) {
        return ['success' => true, 'theme' => $this->scan_theme_options_internal()];
    }

    private function scan_theme_options_internal(): array {
        $theme = wp_get_theme();
        $mods  = get_theme_mods();

        $result = [
            'name'        => $theme->get('Name'),
            'slug'        => $theme->get_stylesheet(),
            'parent'      => is_child_theme() ? $theme->parent()->get('Name') : null,
            'version'     => $theme->get('Version'),
            'customizer'  => [],
            'theme_options'=> [],
        ];

        // Customizer values (common across all themes)
        $customizer = [
            'custom_logo_url' => null,
            'site_icon_url'   => null,
            'background_color'=> get_theme_mod('background_color', ''),
            'header_textcolor'=> get_theme_mod('header_textcolor', ''),
        ];

        $logo_id = get_theme_mod('custom_logo');
        if ($logo_id) $customizer['custom_logo_url'] = wp_get_attachment_url($logo_id);
        $icon_id = get_option('site_icon');
        if ($icon_id) $customizer['site_icon_url'] = wp_get_attachment_url($icon_id);

        // Extract color/font-related mods
        if (is_array($mods)) {
            foreach ($mods as $key => $val) {
                if (!is_string($val) && !is_numeric($val)) continue;
                $lower_key = strtolower($key);
                if (strpos($lower_key, 'color') !== false || strpos($lower_key, 'font') !== false ||
                    strpos($lower_key, 'background') !== false || strpos($lower_key, 'header') !== false ||
                    strpos($lower_key, 'footer') !== false || strpos($lower_key, 'logo') !== false ||
                    strpos($lower_key, 'layout') !== false || strpos($lower_key, 'width') !== false) {
                    $customizer[$key] = $val;
                }
            }
        }
        $result['customizer'] = $customizer;

        // Theme-specific options
        $theme_slug = strtolower($theme->get_stylesheet());
        $parent_slug = is_child_theme() ? strtolower($theme->parent()->get_stylesheet()) : '';
        $result['theme_options'] = $this->scan_theme_specific_options($theme_slug, $parent_slug);
        $result['framework'] = $this->detect_theme_framework($theme_slug, $parent_slug);

        return $result;
    }

    /**
     * Detect and read theme-specific option frameworks.
     */
    private function scan_theme_specific_options(string $slug, string $parent_slug): array {
        $opts = [];
        $effective_slug = $parent_slug ?: $slug;

        // Oshine theme
        if (strpos($effective_slug, 'oshine') !== false || strpos($slug, 'oshine') !== false) {
            $opts['framework'] = 'oshine';
            // Oshine uses be_themes_options in wp_options
            $oshine = get_option('be_themes_options', []);
            if (is_array($oshine)) {
                $opts['raw_option_name'] = 'be_themes_options';
                // Extract key visual settings
                $visual_keys = [
                    'body_bg_color', 'body_text_color', 'body_link_color',
                    'heading_color', 'heading_font', 'body_font',
                    'header_bg_color', 'header_text_color', 'header_style',
                    'footer_bg_color', 'footer_text_color', 'footer_style',
                    'sidebar_bg_color', 'primary_color', 'secondary_color',
                    'menu_style', 'logo_height', 'logo_width',
                    'page_title_bg_color', 'page_title_text_color',
                    'button_bg_color', 'button_text_color', 'button_hover_bg',
                    'layout_style', 'container_width',
                ];
                foreach ($visual_keys as $k) {
                    if (isset($oshine[$k]) && $oshine[$k] !== '') {
                        $opts[$k] = $oshine[$k];
                    }
                }
                // Also get all keys for completeness
                $opts['all_keys'] = array_keys($oshine);
            }
        }
        // Avada theme
        elseif (strpos($effective_slug, 'avada') !== false) {
            $opts['framework'] = 'avada_fusion';
            $avada = get_option('fusion_options', []);
            if (is_array($avada)) {
                $opts['raw_option_name'] = 'fusion_options';
                $keys = ['primary_color', 'header_bg_color', 'footer_bg_color', 'body_typography',
                         'h1_typography', 'h2_typography', 'nav_typography', 'logo', 'logo_retina'];
                foreach ($keys as $k) {
                    if (isset($avada[$k])) $opts[$k] = $avada[$k];
                }
            }
        }
        // Divi theme
        elseif (strpos($effective_slug, 'divi') !== false) {
            $opts['framework'] = 'divi';
            $opts['raw_option_name'] = 'et_divi';
            $divi_keys = ['accent_color', 'header_color', 'primary_nav_bg',
                          'footer_bg', 'body_font_size', 'header_font_size', 'logo'];
            foreach ($divi_keys as $k) {
                $val = et_get_option($k, null);
                if ($val !== null) $opts[$k] = $val;
            }
        }
        // Astra theme
        elseif (strpos($effective_slug, 'astra') !== false) {
            $opts['framework'] = 'astra';
            $opts['raw_option_name'] = 'astra-settings';
            $astra = get_option('astra-settings', []);
            if (is_array($astra)) {
                $keys = ['theme-color', 'link-color', 'text-color', 'heading-base-color',
                         'site-layout', 'header-bg-obj-responsive', 'footer-bg-obj'];
                foreach ($keys as $k) {
                    if (isset($astra[$k])) $opts[$k] = $astra[$k];
                }
            }
        }
        // GeneratePress
        elseif (strpos($effective_slug, 'generatepress') !== false) {
            $opts['framework'] = 'generatepress';
            $gp_settings = get_option('generate_settings', []);
            if (is_array($gp_settings)) {
                $opts['raw_option_name'] = 'generate_settings';
                foreach ($gp_settings as $k => $v) {
                    if (strpos($k, 'color') !== false || strpos($k, 'font') !== false) {
                        $opts[$k] = $v;
                    }
                }
            }
        }
        // Generic: try common option names
        else {
            $generic_options = [
                "{$slug}_options", "{$slug}_settings", "{$slug}_theme_options",
                "theme_{$slug}", "theme_options", "theme_settings",
            ];
            foreach ($generic_options as $opt_name) {
                $val = get_option($opt_name);
                if ($val && (is_array($val) || is_object($val))) {
                    $opts['framework'] = 'generic';
                    $opts['raw_option_name'] = $opt_name;
                    if (is_array($val)) {
                        $opts['all_keys'] = array_keys($val);
                        // Extract visual keys
                        foreach ($val as $k => $v) {
                            if (is_string($v) && (strpos($k, 'color') !== false || strpos($k, 'font') !== false ||
                                strpos($k, 'background') !== false || strpos($k, 'logo') !== false)) {
                                $opts[$k] = $v;
                            }
                        }
                    }
                    break;
                }
            }
        }

        return $opts;
    }

    private function detect_theme_framework(string $slug, string $parent): string {
        $effective = $parent ?: $slug;
        if (strpos($effective, 'oshine') !== false) return 'oshine (be_themes)';
        if (strpos($effective, 'avada') !== false)  return 'avada (fusion)';
        if (strpos($effective, 'divi') !== false)   return 'divi (elegant_themes)';
        if (strpos($effective, 'astra') !== false)  return 'astra';
        if (strpos($effective, 'generatepress') !== false) return 'generatepress';
        if (strpos($effective, 'oceanwp') !== false) return 'oceanwp';
        if (strpos($effective, 'kadence') !== false) return 'kadence';
        return 'standard';
    }

    // ─── Builder Settings ────────────────────────────────────────────

    public function scan_builder_settings($request) {
        return ['success' => true, 'builder' => $this->scan_builder_settings_internal()];
    }

    private function scan_builder_settings_internal(): array {
        $active = get_option('active_plugins', []);
        $result = ['name' => 'gutenberg', 'global_settings' => []];

        // Elementor
        foreach ($active as $p) {
            if (strpos($p, 'elementor') !== false) {
                $result['name'] = 'elementor';
                $result['version'] = defined('ELEMENTOR_VERSION') ? ELEMENTOR_VERSION : 'unknown';

                // Global colors and fonts from Elementor Kit
                $kit_id = get_option('elementor_active_kit');
                if ($kit_id) {
                    $kit_data = get_post_meta($kit_id, '_elementor_page_settings', true);
                    if (is_array($kit_data)) {
                        // System colors
                        if (!empty($kit_data['system_colors'])) {
                            $result['global_colors'] = array_map(fn($c) => [
                                'id' => $c['_id'] ?? '',
                                'title' => $c['title'] ?? '',
                                'color' => $c['color'] ?? '',
                            ], $kit_data['system_colors']);
                        }
                        // System fonts
                        if (!empty($kit_data['system_typography'])) {
                            $result['global_fonts'] = array_map(fn($f) => [
                                'id' => $f['_id'] ?? '',
                                'title' => $f['title'] ?? '',
                                'family' => $f['typography_font_family'] ?? '',
                                'size' => $f['typography_font_size']['size'] ?? '',
                                'weight' => $f['typography_font_weight'] ?? '',
                            ], $kit_data['system_typography']);
                        }
                        // Body/heading defaults
                        $result['body_font'] = $kit_data['body_typography_typography'] ?? null;
                        $result['body_font_family'] = $kit_data['body_typography_font_family'] ?? null;
                        $result['body_color'] = $kit_data['body_color'] ?? null;
                        $result['heading_color'] = $kit_data['heading_color'] ?? null;
                        $result['link_color'] = $kit_data['link_normal_color'] ?? null;
                        $result['button_bg'] = $kit_data['button_background_color'] ?? null;
                        $result['button_color'] = $kit_data['button_text_color'] ?? null;
                    }
                }

                // Elementor general settings
                $result['default_scheme_color'] = get_option('elementor_scheme_color', []);
                $result['container_width'] = get_option('elementor_container_width', 1140);
                $result['space_between_widgets'] = get_option('elementor_space_between_widgets', 20);
                break;
            }
        }

        // Divi
        foreach ($active as $p) {
            if (strpos($p, 'divi') !== false) {
                $result['name'] = 'divi';
                break;
            }
        }

        return $result;
    }

    // ─── Enriched Page Scan ──────────────────────────────────────────

    private function scan_pages_enriched(): array {
        $pages = get_posts([
            'post_type'      => ['page'],
            'post_status'    => 'publish',
            'posts_per_page' => 15,
            'orderby'        => 'menu_order date',
            'order'          => 'ASC',
        ]);

        $front_id = (int) get_option('page_on_front');
        $results  = [];

        foreach ($pages as $page) {
            $builder = 'gutenberg';
            $edata   = get_post_meta($page->ID, '_elementor_data', true);
            if ($edata && strlen($edata) > 10) $builder = 'elementor';

            $pg = [
                'id'            => $page->ID,
                'title'         => $page->post_title,
                'slug'          => $page->post_name,
                'is_front_page' => ($page->ID === $front_id),
                'builder'       => $builder,
                'widgets'       => [],
            ];

            if ($builder === 'elementor') {
                $data = json_decode($edata, true);
                if (is_array($data)) {
                    $pg['widgets'] = $this->collect_widgets_enriched($data);
                }
            } else {
                $pg['blocks'] = $this->parse_gutenberg_blocks($page->post_content);
            }

            $results[] = $pg;
        }

        return $results;
    }

    /**
     * Collect ALL widgets from Elementor data with their visual settings.
     */
    private function collect_widgets_enriched(array $elements, string $parent_id = '', int $depth = 0): array {
        $widgets = [];

        foreach ($elements as $idx => $el) {
            $type     = $el['elType'] ?? '';
            $id       = $el['id'] ?? '';
            $settings = $el['settings'] ?? [];
            $children = $el['elements'] ?? [];

            $entry = [
                'element_id'   => $id,
                'type'         => $type,
                'parent_id'    => $parent_id,
                'depth'        => $depth,
                'position'     => $idx + 1,
            ];

            // Extract visual properties for containers/sections
            if (in_array($type, ['section', 'container'])) {
                $entry['background'] = $this->extract_background($settings);
                $entry['padding']    = $this->extract_spacing($settings, 'padding');
                $entry['margin']     = $this->extract_spacing($settings, 'margin');
                $entry['child_count']= count($children);
            }

            // Extract widget-specific settings
            if ($type === 'widget') {
                $wtype = $el['widgetType'] ?? '';
                $entry['widget_type'] = $wtype;
                $entry['visual'] = $this->extract_widget_visual_settings($wtype, $settings);
                $entry['content'] = $this->extract_widget_content($wtype, $settings);
            }

            $widgets[] = $entry;

            // Recurse (limit depth for performance)
            if (!empty($children) && $depth < 4) {
                $child_widgets = $this->collect_widgets_enriched($children, $id, $depth + 1);
                $widgets = array_merge($widgets, $child_widgets);
            }
        }

        return $widgets;
    }

    /**
     * Extract background settings from an Elementor element.
     */
    private function extract_background(array $s): ?array {
        $bg = [];
        if (!empty($s['background_color']))       $bg['color'] = $s['background_color'];
        if (!empty($s['background_background']))  $bg['type'] = $s['background_background']; // classic|gradient
        if (!empty($s['background_image']['url']))$bg['image'] = $s['background_image']['url'];
        if (!empty($s['background_gradient_angle'])) $bg['gradient_angle'] = $s['background_gradient_angle'];
        if (!empty($s['background_color_b']))     $bg['gradient_color_b'] = $s['background_color_b'];
        // Overlay
        if (!empty($s['background_overlay_color'])) $bg['overlay_color'] = $s['background_overlay_color'];
        return !empty($bg) ? $bg : null;
    }

    /**
     * Extract padding/margin from Elementor element.
     */
    private function extract_spacing(array $s, string $type): ?array {
        $key = $type;
        if (isset($s[$key]) && is_array($s[$key])) {
            $p = $s[$key];
            return [
                'top'    => $p['top'] ?? '', 'right' => $p['right'] ?? '',
                'bottom' => $p['bottom'] ?? '', 'left' => $p['left'] ?? '',
                'unit'   => $p['unit'] ?? 'px',
            ];
        }
        return null;
    }

    /**
     * Extract visual settings (colors, fonts, sizes) from widget settings.
     */
    private function extract_widget_visual_settings(string $wtype, array $s): array {
        $visual = [];

        // Common color fields
        $color_fields = [
            'title_color', 'text_color', 'description_color', 'name_text_color',
            'content_text_color', 'button_background_color', 'button_text_color',
            'icon_color', 'primary_color', 'secondary_color',
        ];
        foreach ($color_fields as $f) {
            if (!empty($s[$f])) $visual[$f] = $s[$f];
        }

        // Typography
        foreach (['typography', 'title_typography', 'description_typography', 'content_typography', 'name_typography'] as $tf) {
            if (!empty($s["{$tf}_font_family"])) $visual["{$tf}_font"] = $s["{$tf}_font_family"];
            if (!empty($s["{$tf}_font_size"]['size'])) $visual["{$tf}_size"] = $s["{$tf}_font_size"]['size'] . ($s["{$tf}_font_size"]['unit'] ?? 'px');
            if (!empty($s["{$tf}_font_weight"])) $visual["{$tf}_weight"] = $s["{$tf}_font_weight"];
        }

        // Background
        $bg = $this->extract_background($s);
        if ($bg) $visual['background'] = $bg;

        return $visual;
    }

    /**
     * Extract content (text, images, links) from widget settings.
     */
    private function extract_widget_content(string $wtype, array $s): array {
        $content = [];

        switch ($wtype) {
            case 'heading':
                $content['title'] = $s['title'] ?? '';
                $content['tag']   = $s['header_size'] ?? 'h2';
                $content['link']  = $s['link']['url'] ?? null;
                break;

            case 'text-editor':
                $raw = $s['editor'] ?? '';
                $content['html']  = mb_substr($raw, 0, 200);
                $content['text']  = mb_substr(wp_strip_all_tags($raw), 0, 150);
                break;

            case 'image':
                $content['url']   = $s['image']['url'] ?? '';
                $content['id']    = $s['image']['id'] ?? null;
                $content['alt']   = $s['image']['alt'] ?? '';
                $content['link']  = $s['link_to'] ?? '';
                break;

            case 'image-box':
                $content['title']       = $s['title_text'] ?? '';
                $content['description'] = mb_substr($s['description_text'] ?? '', 0, 100);
                $content['image_url']   = $s['image']['url'] ?? '';
                $content['image_id']    = $s['image']['id'] ?? null;
                break;

            case 'icon-box':
                $content['title']       = $s['title_text'] ?? '';
                $content['description'] = mb_substr($s['description_text'] ?? '', 0, 100);
                $content['icon']        = $s['selected_icon']['value'] ?? '';
                break;

            case 'testimonial':
                $content['name']      = $s['testimonial_name'] ?? '';
                $content['content']   = mb_substr($s['testimonial_content'] ?? '', 0, 100);
                $content['job']       = $s['testimonial_job'] ?? '';
                $content['image_url'] = $s['testimonial_image']['url'] ?? '';
                $content['image_id']  = $s['testimonial_image']['id'] ?? null;
                break;

            case 'button':
                $content['text'] = $s['text'] ?? '';
                $content['url']  = $s['link']['url'] ?? '';
                break;

            case 'form':
                $content['form_name'] = $s['form_name'] ?? '';
                $fields = $s['form_fields'] ?? [];
                $content['fields'] = array_map(fn($f) => [
                    'label'    => $f['field_label'] ?? '',
                    'type'     => $f['field_type'] ?? '',
                    'required' => !empty($f['required']),
                    'id'       => $f['custom_id'] ?? $f['_id'] ?? '',
                ], is_array($fields) ? $fields : []);
                break;

            case 'counter':
                $content['ending_number'] = $s['ending_number'] ?? '';
                $content['title'] = $s['title'] ?? '';
                $content['prefix'] = $s['prefix'] ?? '';
                $content['suffix'] = $s['suffix'] ?? '';
                break;

            default:
                // Generic: grab title and editor fields
                if (!empty($s['title'])) $content['title'] = $s['title'];
                if (!empty($s['editor'])) $content['text'] = mb_substr(wp_strip_all_tags($s['editor'] ?? ''), 0, 100);
                break;
        }

        return $content;
    }

    // ─── Gutenberg Block Parser ──────────────────────────────────────

    private function parse_gutenberg_blocks(string $content): array {
        $blocks = [];
        if (!function_exists('parse_blocks')) return $blocks;

        $parsed = parse_blocks($content);
        foreach ($parsed as $block) {
            if (empty($block['blockName'])) continue;
            $b = [
                'type'  => $block['blockName'],
                'attrs' => $block['attrs'] ?? [],
            ];

            // Extract text content
            $inner_html = $block['innerHTML'] ?? '';
            $text = wp_strip_all_tags($inner_html);
            if ($text) $b['text'] = mb_substr(trim(preg_replace('/\s+/', ' ', $text)), 0, 120);

            // Extract visual attrs
            if (!empty($block['attrs']['backgroundColor'])) $b['bg_color'] = $block['attrs']['backgroundColor'];
            if (!empty($block['attrs']['textColor'])) $b['text_color'] = $block['attrs']['textColor'];
            if (!empty($block['attrs']['style'])) $b['style'] = $block['attrs']['style'];
            if (!empty($block['attrs']['fontSize'])) $b['font_size'] = $block['attrs']['fontSize'];

            // Inner blocks count
            if (!empty($block['innerBlocks'])) {
                $b['inner_block_count'] = count($block['innerBlocks']);
                $b['inner_blocks'] = array_map(fn($ib) => [
                    'type' => $ib['blockName'] ?? '',
                    'text' => mb_substr(wp_strip_all_tags($ib['innerHTML'] ?? ''), 0, 60),
                ], array_slice($block['innerBlocks'], 0, 6));
            }

            $blocks[] = $b;
        }

        return $blocks;
    }

    // ─── WooCommerce ─────────────────────────────────────────────────

    public function scan_woocommerce($request) {
        return ['success' => true, 'woocommerce' => $this->scan_woocommerce_internal()];
    }

    private function scan_woocommerce_internal(): ?array {
        if (!class_exists('WooCommerce')) return null;

        $product_counts = wp_count_posts('product');
        $categories = get_terms(['taxonomy' => 'product_cat', 'hide_empty' => false]);

        // Get recent products summary
        $products = get_posts([
            'post_type' => 'product', 'post_status' => 'publish',
            'posts_per_page' => 20, 'orderby' => 'date', 'order' => 'DESC',
        ]);

        $product_list = [];
        foreach ($products as $p) {
            $wc = wc_get_product($p->ID);
            if (!$wc) continue;
            $product_list[] = [
                'id'           => $p->ID,
                'name'         => $p->post_title,
                'price'        => $wc->get_regular_price(),
                'sale_price'   => $wc->get_sale_price() ?: null,
                'on_sale'      => $wc->is_on_sale(),
                'stock_status' => $wc->get_stock_status(),
                'type'         => $wc->get_type(),
                'categories'   => wp_get_post_terms($p->ID, 'product_cat', ['fields' => 'names']),
            ];
        }

        return [
            'active'       => true,
            'currency'     => get_woocommerce_currency(),
            'total_products'=> $product_counts->publish ?? 0,
            'categories'   => is_array($categories) ? array_map(fn($c) => ['id' => $c->term_id, 'name' => $c->name, 'count' => $c->count], $categories) : [],
            'products'     => $product_list,
            'shop_page_id' => (int) get_option('woocommerce_shop_page_id'),
            'cart_page_id' => (int) get_option('woocommerce_cart_page_id'),
            'checkout_page_id' => (int) get_option('woocommerce_checkout_page_id'),
        ];
    }

    // ─── Forms ───────────────────────────────────────────────────────

    public function scan_forms_detailed($request) {
        return ['success' => true, 'forms' => $this->scan_forms_internal()];
    }

    private function scan_forms_internal(): array {
        $forms = [];

        // Gravity Forms
        if (class_exists('GFAPI')) {
            $gf = \GFAPI::get_forms();
            foreach ($gf as $form) {
                $fields = array_map(fn($f) => [
                    'id'       => $f->id,
                    'label'    => $f->label,
                    'type'     => $f->type,
                    'required' => !empty($f->isRequired),
                ], $form['fields'] ?? []);

                $forms[] = [
                    'plugin'        => 'gravity_forms',
                    'form_id'       => $form['id'],
                    'title'         => $form['title'],
                    'field_count'   => count($fields),
                    'fields'        => $fields,
                    'notifications' => array_map(fn($n) => [
                        'name' => $n['name'] ?? '', 'to' => $n['to'] ?? '', 'event' => $n['event'] ?? '',
                    ], array_values($form['notifications'] ?? [])),
                ];
            }
        }

        // WPForms
        $wpforms = get_posts(['post_type' => 'wpforms', 'posts_per_page' => 20, 'post_status' => 'publish']);
        foreach ($wpforms as $wf) {
            $data = json_decode($wf->post_content, true);
            if (!$data) continue;
            $fields = [];
            foreach (($data['fields'] ?? []) as $f) {
                $fields[] = [
                    'id' => $f['id'] ?? '', 'label' => $f['label'] ?? '',
                    'type' => $f['type'] ?? '', 'required' => !empty($f['required']),
                ];
            }
            $forms[] = [
                'plugin' => 'wpforms', 'form_id' => $wf->ID, 'title' => $data['settings']['form_title'] ?? $wf->post_title,
                'field_count' => count($fields), 'fields' => $fields,
            ];
        }

        // Contact Form 7
        $cf7 = get_posts(['post_type' => 'wpcf7_contact_form', 'posts_per_page' => 20]);
        foreach ($cf7 as $form) {
            $forms[] = [
                'plugin' => 'cf7', 'form_id' => $form->ID, 'title' => $form->post_title,
                'form_content' => $form->post_content,
            ];
        }

        return $forms;
    }

    // ─── Menus ───────────────────────────────────────────────────────

    private function scan_menus_detailed(): array {
        $locations = get_nav_menu_locations();
        $menus = [];
        foreach ($locations as $loc => $menu_id) {
            if (!$menu_id) continue;
            $menu_obj = wp_get_nav_menu_object($menu_id);
            $items = wp_get_nav_menu_items($menu_id);
            $menus[] = [
                'location' => $loc, 'name' => $menu_obj ? $menu_obj->name : '',
                'items' => is_array($items) ? array_map(fn($i) => [
                    'id' => $i->ID, 'title' => $i->title, 'url' => $i->url,
                    'type' => $i->type, 'parent' => (int) $i->menu_item_parent,
                ], $items) : [],
            ];
        }
        return $menus;
    }

    // ─── Per-page widget scan ────────────────────────────────────────

    public function scan_page_widgets_detailed($request) {
        $page_id = (int) $request['page_id'];
        $edata   = get_post_meta($page_id, '_elementor_data', true);
        $data    = json_decode($edata ?: '[]', true);
        if (!is_array($data)) return ['success' => false, 'message' => 'No Elementor data'];

        return [
            'success'    => true,
            'page_id'    => $page_id,
            'page_title' => get_the_title($page_id),
            'widgets'    => $this->collect_widgets_enriched($data),
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
