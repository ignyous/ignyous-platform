<?php
namespace Ignyous\Api;

/**
 * ContentGraphScanner — Builds a structured "content graph" of the entire site.
 *
 * The graph tells the AI:
 *   - What sections exist on each page (hero, services, testimonials, pricing, CTA, FAQ, team, contact, stats)
 *   - What elements are inside each section (widgets, columns, text blocks)
 *   - Element IDs for direct targeting
 *   - Item counts for repeating patterns (e.g., "4 service boxes")
 *   - Global content locations (phone numbers, emails, addresses)
 *   - Site capabilities (what can and can't be edited)
 *
 * This is the foundation for:
 *   - Structural editing (remove/reorder elements)
 *   - Content-aware responses ("which service box?")
 *   - Memory persistence (AI remembers site structure across sessions)
 */
class ContentGraphScanner {

    public function register_routes() {
        register_rest_route('ignyous/v1', '/content-graph', [
            'methods'             => 'GET',
            'callback'            => [$this, 'build_content_graph'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        register_rest_route('ignyous/v1', '/content-graph/page/(?P<page_id>\d+)', [
            'methods'             => 'GET',
            'callback'            => [$this, 'scan_single_page'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
    }

    /**
     * Build the full content graph for the site.
     */
    public function build_content_graph($request) {
        $start = microtime(true);

        // 1. Site-level intelligence
        $site_info = $this->get_site_intelligence();

        // 2. Scan all published pages
        $pages = get_posts([
            'post_type'      => ['page', 'post'],
            'post_status'    => 'publish',
            'posts_per_page' => 30,
            'orderby'        => 'menu_order date',
            'order'          => 'ASC',
        ]);

        $page_graphs = [];
        $global_phones  = [];
        $global_emails  = [];
        $global_forms   = [];

        foreach ($pages as $page) {
            $pg = $this->scan_page($page);
            $page_graphs[] = $pg;

            // Aggregate global content
            foreach ($pg['phones'] as $ph) {
                $global_phones[$ph['value']][] = ['page_id' => $page->ID, 'page_title' => $page->post_title, 'context' => $ph['context']];
            }
            foreach ($pg['emails'] as $em) {
                $global_emails[$em['value']][] = ['page_id' => $page->ID, 'page_title' => $page->post_title];
            }
            foreach ($pg['forms'] as $f) {
                $global_forms[] = array_merge($f, ['page_id' => $page->ID, 'page_title' => $page->post_title]);
            }
        }

        // 3. Scan global areas (header/footer widgets, menus)
        $menu_data   = $this->scan_menus();
        $widget_data = $this->scan_widgets();

        // Aggregate phones/emails from widgets
        foreach ($widget_data['phones'] as $ph) {
            $global_phones[$ph['value']][] = ['location' => 'widget', 'context' => $ph['context']];
        }

        // 4. Build capabilities matrix
        $capabilities = $this->build_capabilities($site_info);

        $duration_ms = round((microtime(true) - $start) * 1000);

        return [
            'success'      => true,
            'scanned_at'   => gmdate('c'),
            'duration_ms'  => $duration_ms,
            'site'         => $site_info,
            'pages'        => $page_graphs,
            'global_content' => [
                'phones' => $this->format_global_content($global_phones),
                'emails' => $this->format_global_content($global_emails),
                'forms'  => $global_forms,
            ],
            'menus'        => $menu_data,
            'capabilities' => $capabilities,
        ];
    }

    /**
     * Scan a single page (for targeted re-scans after edits).
     */
    public function scan_single_page($request) {
        $page_id = (int) $request['page_id'];
        $page    = get_post($page_id);
        if (!$page) return new \WP_Error('not_found', 'Page not found', ['status' => 404]);

        return ['success' => true, 'page' => $this->scan_page($page)];
    }

    // ─── Core Page Scanner ───────────────────────────────────────────

    private function scan_page(\WP_Post $page): array {
        $builder  = $this->detect_page_builder($page->ID);
        $sections = [];
        $phones   = [];
        $emails   = [];
        $forms    = [];
        $text_preview = '';

        if ($builder === 'elementor') {
            $raw = get_post_meta($page->ID, '_elementor_data', true);
            $data = json_decode($raw, true);
            if (is_array($data)) {
                $sections = $this->classify_elementor_sections($data, $page->ID);
                $text_preview = $this->extract_text_from_elementor($data, 300);
            }
        } else {
            // Gutenberg/Classic — extract from post_content
            $text_preview = wp_strip_all_tags($page->post_content);
            $text_preview = preg_replace('/\s+/', ' ', $text_preview);
            $text_preview = mb_substr(trim($text_preview), 0, 300);
            $sections = $this->classify_gutenberg_sections($page->post_content);
        }

        // Extract global content
        $full_text = $text_preview ?: wp_strip_all_tags($page->post_content);
        $phones = $this->extract_phones($full_text);
        $emails = $this->extract_emails($full_text);
        $forms  = $this->detect_forms_on_page($page);

        // Determine if this is the front page
        $front_page_id = (int) get_option('page_on_front');
        $is_front_page = ($page->ID === $front_page_id);

        return [
            'id'           => $page->ID,
            'title'        => $page->post_title,
            'slug'         => $page->post_name,
            'url'          => get_permalink($page->ID),
            'is_front_page'=> $is_front_page,
            'builder'      => $builder,
            'sections'     => $sections,
            'section_count'=> count($sections),
            'preview'      => mb_substr($text_preview, 0, 200),
            'phones'       => $phones,
            'emails'       => $emails,
            'forms'        => $forms,
        ];
    }

    // ─── Elementor Section Classifier ────────────────────────────────

    private function classify_elementor_sections(array $elements, int $page_id, int $depth = 0): array {
        $sections = [];

        foreach ($elements as $idx => $el) {
            $type     = $el['elType'] ?? '';
            $id       = $el['id'] ?? '';
            $settings = $el['settings'] ?? [];
            $children = $el['elements'] ?? [];

            // Only classify top-level containers/sections (depth 0-1)
            if ($depth > 1) continue;

            if (in_array($type, ['section', 'container'])) {
                $section = [
                    'element_id'   => $id,
                    'element_type' => $type,
                    'position'     => $idx + 1,
                    'type'         => 'unknown',
                    'label'        => '',
                    'items'        => [],
                    'item_count'   => 0,
                ];

                // Analyze children to classify
                $child_widgets = $this->collect_widgets($children);
                $child_text    = $this->extract_text_from_elementor([$el], 500);
                $widget_types  = array_column($child_widgets, 'widgetType');
                $widget_counts = array_count_values($widget_types);

                // ── Classification heuristics ──

                // Hero: first section with heading and button
                if ($idx === 0 && $this->has_widget_type($child_widgets, 'heading') && $this->has_widget_type($child_widgets, 'button')) {
                    $section['type']  = 'hero';
                    $section['label'] = 'Hero Section';
                    $heading = $this->find_first_widget($child_widgets, 'heading');
                    $section['content'] = [
                        'heading'    => $heading['settings']['title'] ?? '',
                        'subheading' => $this->find_text_widget($child_widgets) ?? '',
                    ];
                }
                // Services: 3-6 repeated image-box or icon-box widgets
                elseif (($widget_counts['image-box'] ?? 0) >= 3 || ($widget_counts['icon-box'] ?? 0) >= 3) {
                    $box_type = ($widget_counts['image-box'] ?? 0) >= 3 ? 'image-box' : 'icon-box';
                    $boxes = array_filter($child_widgets, fn($w) => $w['widgetType'] === $box_type);
                    $section['type']  = 'services';
                    $section['label'] = 'Services Section';
                    $section['item_count'] = count($boxes);
                    $section['items'] = array_values(array_map(fn($w) => [
                        'element_id'  => $w['id'],
                        'title'       => $w['settings']['title_text'] ?? $w['settings']['title'] ?? '(untitled)',
                        'description' => mb_substr($w['settings']['description_text'] ?? $w['settings']['description'] ?? '', 0, 80),
                    ], $boxes));
                }
                // Testimonials
                elseif (($widget_counts['testimonial'] ?? 0) >= 1 || stripos($child_text, 'testimonial') !== false || stripos($child_text, 'review') !== false) {
                    $section['type']  = 'testimonials';
                    $section['label'] = 'Testimonials Section';
                    $testimonials = array_filter($child_widgets, fn($w) => $w['widgetType'] === 'testimonial');
                    $section['item_count'] = count($testimonials) ?: 1;
                    $section['items'] = array_values(array_map(fn($w) => [
                        'element_id'  => $w['id'],
                        'name'        => $w['settings']['testimonial_name'] ?? '(unnamed)',
                        'content'     => mb_substr($w['settings']['testimonial_content'] ?? '', 0, 60),
                        'job'         => $w['settings']['testimonial_job'] ?? '',
                        'has_image'   => !empty($w['settings']['testimonial_image']['url'] ?? ''),
                    ], $testimonials));
                }
                // Pricing
                elseif (($widget_counts['price-table'] ?? 0) >= 1 || ($widget_counts['price-list'] ?? 0) >= 1 || preg_match('/\$\d+|\d+\.\d{2}|\/month|\/year|pricing/i', $child_text)) {
                    $section['type']  = 'pricing';
                    $section['label'] = 'Pricing Section';
                }
                // Contact form
                elseif ($this->has_widget_type($child_widgets, 'form') || $this->has_widget_type($child_widgets, 'shortcode') && stripos($child_text, 'form') !== false) {
                    $section['type']  = 'contact';
                    $section['label'] = 'Contact Section';
                }
                // FAQ
                elseif (($widget_counts['accordion'] ?? 0) >= 1 || ($widget_counts['toggle'] ?? 0) >= 1 || stripos($child_text, 'FAQ') !== false || stripos($child_text, 'frequently asked') !== false) {
                    $section['type']  = 'faq';
                    $section['label'] = 'FAQ Section';
                    $accordions = array_filter($child_widgets, fn($w) => in_array($w['widgetType'], ['accordion', 'toggle']));
                    $section['item_count'] = count($accordions) ?: 1;
                }
                // Team
                elseif (stripos($child_text, 'team') !== false || stripos($child_text, 'staff') !== false || stripos($child_text, 'our people') !== false) {
                    $section['type']  = 'team';
                    $section['label'] = 'Team Section';
                }
                // CTA
                elseif ($this->has_widget_type($child_widgets, 'button') && count($child_widgets) <= 4) {
                    $section['type']  = 'cta';
                    $section['label'] = 'Call to Action';
                }
                // Stats/Counters
                elseif (($widget_counts['counter'] ?? 0) >= 2) {
                    $section['type']  = 'stats';
                    $section['label'] = 'Stats/Numbers Section';
                    $section['item_count'] = $widget_counts['counter'];
                }
                // Heading-only section
                elseif (count($child_widgets) <= 2 && $this->has_widget_type($child_widgets, 'heading')) {
                    $heading = $this->find_first_widget($child_widgets, 'heading');
                    $section['type']  = 'heading';
                    $section['label'] = $heading['settings']['title'] ?? 'Section Heading';
                }
                // Generic content
                else {
                    $section['type']  = 'content';
                    $section['label'] = 'Content Section';
                    $section['item_count'] = count($children);

                    // Footer detection: last section + contains copyright/social/contact keywords
                    if ($idx === count($elements) - 1 || $idx >= count($elements) - 2) {
                        $lower_text = strtolower($child_text);
                        if (strpos($lower_text, 'copyright') !== false || strpos($lower_text, '©') !== false ||
                            strpos($lower_text, 'all rights') !== false || strpos($lower_text, 'footer') !== false ||
                            (strpos($lower_text, 'social') !== false && strpos($lower_text, 'follow') !== false)) {
                            $section['type']  = 'footer';
                            $section['label'] = 'Footer Section';
                        }
                    }
                }

                // Add text preview for all sections
                $section['preview'] = mb_substr(trim($child_text), 0, 120);

                $sections[] = $section;
            }
        }

        return $sections;
    }

    // ─── Gutenberg Section Classifier ────────────────────────────────

    private function classify_gutenberg_sections(string $content): array {
        $sections = [];
        // Split by Gutenberg block comments
        if (preg_match_all('/<!-- wp:(\w+(?:\/\w+)?)\s*(\{[^}]*\})?\s*-->(.+?)<!-- \/wp:\1\s*-->/s', $content, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $idx => $m) {
                $block_type = $m[1];
                $text = wp_strip_all_tags($m[3] ?? '');
                $text = preg_replace('/\s+/', ' ', trim($text));

                $type = 'content';
                if (in_array($block_type, ['cover', 'media-text']) && $idx === 0) $type = 'hero';
                elseif ($block_type === 'columns') $type = 'columns';
                elseif (in_array($block_type, ['wpforms/form-selector', 'contact-form-7/contact-form-selector', 'gravityforms/form'])) $type = 'contact';
                elseif (stripos($text, 'FAQ') !== false) $type = 'faq';

                $sections[] = [
                    'element_type' => 'block',
                    'block_type'   => $block_type,
                    'position'     => $idx + 1,
                    'type'         => $type,
                    'label'        => ucfirst(str_replace(['/', '-'], ' ', $block_type)),
                    'preview'      => mb_substr($text, 0, 120),
                ];
            }
        }
        return $sections;
    }

    // ─── Widget Helpers ──────────────────────────────────────────────

    /**
     * Recursively collect all widgets from an Elementor element tree.
     */
    private function collect_widgets(array $elements): array {
        $widgets = [];
        foreach ($elements as $el) {
            if (($el['elType'] ?? '') === 'widget') {
                $widgets[] = $el;
            }
            if (!empty($el['elements'])) {
                $widgets = array_merge($widgets, $this->collect_widgets($el['elements']));
            }
        }
        return $widgets;
    }

    private function has_widget_type(array $widgets, string $type): bool {
        foreach ($widgets as $w) {
            if (($w['widgetType'] ?? '') === $type) return true;
        }
        return false;
    }

    private function find_first_widget(array $widgets, string $type): ?array {
        foreach ($widgets as $w) {
            if (($w['widgetType'] ?? '') === $type) return $w;
        }
        return null;
    }

    private function find_text_widget(array $widgets): ?string {
        foreach ($widgets as $w) {
            if (($w['widgetType'] ?? '') === 'text-editor') {
                return wp_strip_all_tags($w['settings']['editor'] ?? '');
            }
        }
        return null;
    }

    // ─── Text Extraction ─────────────────────────────────────────────

    private function extract_text_from_elementor(array $elements, int $max_len = 500): string {
        $text = '';
        foreach ($elements as $el) {
            $settings = $el['settings'] ?? [];
            // Common text fields
            foreach (['title', 'title_text', 'editor', 'description_text', 'description', 'testimonial_content', 'testimonial_name'] as $field) {
                if (!empty($settings[$field])) {
                    $clean = wp_strip_all_tags($settings[$field]);
                    $text .= ' ' . $clean;
                }
            }
            // Recurse
            if (!empty($el['elements'])) {
                $text .= ' ' . $this->extract_text_from_elementor($el['elements'], $max_len);
            }
            if (mb_strlen($text) > $max_len) break;
        }
        return preg_replace('/\s+/', ' ', trim(mb_substr($text, 0, $max_len)));
    }

    // ─── Global Content Extraction ───────────────────────────────────

    private function extract_phones(string $text): array {
        $phones = [];
        if (preg_match_all('/[\(]?\d{3}[\)\.\-\s]?\s?\d{3}[\-.\s]?\d{4}/', $text, $matches)) {
            foreach (array_unique($matches[0]) as $ph) {
                $phones[] = ['value' => trim($ph), 'context' => 'page content'];
            }
        }
        return $phones;
    }

    private function extract_emails(string $text): array {
        $emails = [];
        if (preg_match_all('/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/', $text, $matches)) {
            foreach (array_unique($matches[0]) as $em) {
                $emails[] = ['value' => $em];
            }
        }
        return $emails;
    }

    private function detect_forms_on_page(\WP_Post $page): array {
        $forms = [];
        $content = $page->post_content;

        // Contact Form 7
        if (preg_match_all('/\[contact-form-7[^\]]*id="(\d+)"[^\]]*title="([^"]*)"/', $content, $m, PREG_SET_ORDER)) {
            foreach ($m as $match) {
                $forms[] = ['plugin' => 'cf7', 'form_id' => (int) $match[1], 'title' => $match[2]];
            }
        }
        // WPForms
        if (preg_match_all('/\[wpforms\s+id="(\d+)"/', $content, $m, PREG_SET_ORDER)) {
            foreach ($m as $match) {
                $forms[] = ['plugin' => 'wpforms', 'form_id' => (int) $match[1], 'title' => get_the_title($match[1])];
            }
        }
        // Gravity Forms
        if (preg_match_all('/\[gravityform\s+id="?(\d+)"?/', $content, $m, PREG_SET_ORDER)) {
            foreach ($m as $match) {
                $forms[] = ['plugin' => 'gravity', 'form_id' => (int) $match[1], 'title' => ''];
            }
        }
        // Elementor form widget
        $elementor_raw = get_post_meta($page->ID, '_elementor_data', true);
        if ($elementor_raw && stripos($elementor_raw, '"widgetType":"form"') !== false) {
            $forms[] = ['plugin' => 'elementor_form', 'form_id' => null, 'title' => 'Elementor Form'];
        }

        return $forms;
    }

    // ─── Site Intelligence ───────────────────────────────────────────

    private function get_site_intelligence(): array {
        $active_plugins = get_option('active_plugins', []);
        $theme          = wp_get_theme();

        $info = [
            'wp_version'     => get_bloginfo('version'),
            'site_name'      => get_bloginfo('name'),
            'site_url'       => get_site_url(),
            'theme'          => $theme->get('Name'),
            'child_theme'    => is_child_theme(),
            'builder'        => $this->detect_active_builder($active_plugins),
            'cache_plugin'   => $this->detect_plugin_category($active_plugins, ['wp-fastest-cache', 'w3-total-cache', 'wp-super-cache', 'litespeed-cache', 'sg-cachepress', 'autoptimize', 'wp-rocket']),
            'seo_plugin'     => $this->detect_plugin_category($active_plugins, ['wordpress-seo', 'seo-by-rank-math', 'all-in-one-seo-pack', 'squirrly-seo']),
            'forms_plugin'   => $this->detect_plugin_category($active_plugins, ['wpforms-lite', 'wpforms', 'contact-form-7', 'gravityforms', 'fluentform', 'formidable', 'ninja-forms']),
            'ecommerce'      => $this->detect_plugin_category($active_plugins, ['woocommerce', 'easy-digital-downloads', 'surecart']),
            'events_plugin'  => $this->detect_plugin_category($active_plugins, ['the-events-calendar', 'modern-events-calendar', 'events-manager']),
            'membership'     => $this->detect_plugin_category($active_plugins, ['memberpress', 'paid-memberships-pro', 'ultimate-member']),
            'page_count'     => wp_count_posts('page')->publish,
            'post_count'     => wp_count_posts('post')->publish,
            'menu_count'     => count(get_nav_menu_locations()),
            'front_page_id'  => (int) get_option('page_on_front'),
            'blog_page_id'   => (int) get_option('page_for_posts'),
        ];

        return $info;
    }

    private function detect_active_builder(array $plugins): string {
        foreach ($plugins as $p) {
            if (strpos($p, 'elementor') !== false) return 'elementor';
            if (strpos($p, 'divi') !== false) return 'divi';
            if (strpos($p, 'fusion') !== false || strpos($p, 'avada') !== false) return 'avada';
            if (strpos($p, 'js_composer') !== false || strpos($p, 'wpbakery') !== false) return 'wpbakery';
            if (strpos($p, 'beaver-builder') !== false) return 'beaver';
            if (strpos($p, 'bricks') !== false) return 'bricks';
            if (strpos($p, 'oxygen') !== false) return 'oxygen';
            if (strpos($p, 'breakdance') !== false) return 'breakdance';
            if (strpos($p, 'tatsu') !== false) return 'tatsu';
        }
        return 'gutenberg';
    }

    private function detect_plugin_category(array $active, array $slugs): ?string {
        foreach ($active as $p) {
            foreach ($slugs as $slug) {
                if (strpos($p, $slug) !== false) return $slug;
            }
        }
        return null;
    }

    private function detect_page_builder(int $page_id): string {
        $elementor = get_post_meta($page_id, '_elementor_data', true);
        if ($elementor && strlen($elementor) > 10) return 'elementor';
        $divi = get_post_meta($page_id, '_et_builder_version', true);
        if ($divi) return 'divi';
        return 'gutenberg';
    }

    // ─── Menus & Widgets ─────────────────────────────────────────────

    private function scan_menus(): array {
        $locations = get_nav_menu_locations();
        $menus = [];
        foreach ($locations as $location => $menu_id) {
            if (!$menu_id) continue;
            $menu_obj = wp_get_nav_menu_object($menu_id);
            $items    = wp_get_nav_menu_items($menu_id);
            $menus[]  = [
                'location'   => $location,
                'name'       => $menu_obj ? $menu_obj->name : '',
                'item_count' => is_array($items) ? count($items) : 0,
                'items'      => is_array($items) ? array_slice(array_map(fn($i) => [
                    'title' => $i->title,
                    'url'   => $i->url,
                    'type'  => $i->type,
                ], $items), 0, 15) : [],
            ];
        }
        return $menus;
    }

    private function scan_widgets(): array {
        $sidebars = wp_get_sidebars_widgets();
        $phones = [];
        $count = 0;
        foreach ($sidebars as $sidebar_id => $widgets) {
            if ($sidebar_id === 'wp_inactive_widgets' || !is_array($widgets)) continue;
            $count += count($widgets);
            foreach ($widgets as $widget_id) {
                $text = $this->get_widget_text($widget_id);
                if ($text) {
                    foreach ($this->extract_phones($text) as $ph) {
                        $ph['context'] = "widget ($sidebar_id)";
                        $phones[] = $ph;
                    }
                }
            }
        }
        return ['count' => $count, 'phones' => $phones];
    }

    private function get_widget_text(string $widget_id): string {
        if (preg_match('/^(.+)-(\d+)$/', $widget_id, $m)) {
            $instances = get_option('widget_' . $m[1], []);
            $instance  = $instances[(int) $m[2]] ?? [];
            return ($instance['text'] ?? '') . ' ' . ($instance['content'] ?? '') . ' ' . ($instance['title'] ?? '');
        }
        return '';
    }

    // ─── Capabilities Matrix ─────────────────────────────────────────

    private function build_capabilities(array $site_info): array {
        $builder = $site_info['builder'];
        $full_builders = ['elementor', 'gutenberg', 'divi', 'avada'];

        return [
            'can_edit_text'      => true,
            'can_edit_images'    => true,
            'can_edit_seo'      => !empty($site_info['seo_plugin']),
            'can_edit_forms'    => !empty($site_info['forms_plugin']),
            'can_clear_cache'   => !empty($site_info['cache_plugin']),
            'can_add_sections'  => in_array($builder, $full_builders),
            'can_remove_elements' => in_array($builder, ['elementor']),
            'can_reorder_elements'=> in_array($builder, ['elementor']),
            'can_edit_ecommerce'=> !empty($site_info['ecommerce']),
            'can_edit_events'   => !empty($site_info['events_plugin']),
            'builder_support'   => in_array($builder, $full_builders) ? 'full' : 'partial',
            'builder_name'      => $builder,
        ];
    }

    // ─── Formatting ──────────────────────────────────────────────────

    private function format_global_content(array $grouped): array {
        $result = [];
        foreach ($grouped as $value => $locations) {
            $result[] = ['value' => $value, 'found_in' => $locations, 'count' => count($locations)];
        }
        return $result;
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

        // Fallback: api_key in query or body
        $api_key = $request ? ($request->get_param('api_key') ?? '') : '';
        if (!empty($api_key) && hash_equals($stored, trim($api_key))) return true;

        return false;
    }
}
