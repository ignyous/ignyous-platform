<?php
/**
 * ignyous Bridge — Popular Plugins Extension
 * Supports: WP Rocket, LiteSpeed, UpdraftPlus, Wordfence, Smush,
 *           Slider Revolution, TablePress, CF7, WPForms, Gravity Forms,
 *           ACF, Mailchimp, MonsterInsights, WPML/Polylang, Jetpack,
 *           WooCommerce (extended), Really Simple SSL
 *
 * INSTALL: Paste into ignyous-bridge.php before the closing ?>
 */

add_action('rest_api_init', function() {
    $p = 'ignyous_check_permission';
    $routes = [
        // Cache
        ['cache/status',                  'GET',          'ignyous_cache_status'],
        ['cache/clear_all',               'POST',         'ignyous_cache_clear_all'],
        // Forms
        ['forms',                         ['GET','POST'], 'ignyous_forms_handler'],
        // ACF
        ['acf',                           ['GET','PATCH'], 'ignyous_acf_handler'],
        // UpdraftPlus
        ['plugins/updraftplus/backup',    'POST',         'ignyous_updraftplus_backup'],
        ['plugins/updraftplus/backups',   'GET',          'ignyous_updraftplus_list'],
        // Wordfence
        ['plugins/wordfence/status',      'GET',          'ignyous_wordfence_status'],
        ['plugins/wordfence/scan',        'POST',         'ignyous_wordfence_scan'],
        ['plugins/wordfence/blocked-ips', 'GET',          'ignyous_wordfence_blocked'],
        ['plugins/wordfence/unblock-ip',  'POST',         'ignyous_wordfence_unblock'],
        // Smush
        ['plugins/smush/status',          'GET',          'ignyous_smush_status'],
        ['plugins/smush/optimize',        'POST',         'ignyous_smush_optimize'],
        // Slider Revolution
        ['plugins/revslider/sliders',     'GET',          'ignyous_revslider_list'],
        ['plugins/revslider/slide',       ['GET','POST','PATCH'], 'ignyous_revslider_slide'],
        // TablePress
        ['plugins/tablepress/tables',     'GET',          'ignyous_tablepress_list'],
        ['plugins/tablepress/table',      ['GET','POST','PATCH'], 'ignyous_tablepress_handler'],
        // WooCommerce extended
        ['woo/products',                  'GET',          'ignyous_woo_products'],
        ['woo/product',                   'POST',         'ignyous_woo_create_product'],
        ['woo/orders',                    'GET',          'ignyous_woo_orders'],
        ['woo/coupon',                    'POST',         'ignyous_woo_create_coupon'],
        ['woo/products/bulk-price',       'PATCH',        'ignyous_woo_bulk_price'],
        // Mailchimp
        ['plugins/mailchimp/stats',       'GET',          'ignyous_mailchimp_stats'],
        // SSL
        ['plugins/ssl/status',            'GET',          'ignyous_ssl_status'],
        ['plugins/ssl/force',             'POST',         'ignyous_ssl_force'],
        // Multilingual
        ['plugins/multilingual/languages','GET',          'ignyous_multilingual_languages'],
        ['plugins/multilingual/translate','POST',         'ignyous_multilingual_translate'],
    ];
    foreach ($routes as [$path, $methods, $cb]) {
        register_rest_route('ignyous/v1', "/$path", ['methods' => $methods, 'callback' => $cb, 'permission_callback' => $p]);
    }
});

// ═══════════════════════════════════════════════════════════════
// CACHE MANAGEMENT — supports WP Rocket, LiteSpeed, W3TC, Super Cache
// ═══════════════════════════════════════════════════════════════
function ignyous_cache_status() {
    $active = [];
    if (function_exists('rocket_clean_domain'))       $active[] = 'WP Rocket';
    if (class_exists('LiteSpeed_Cache_API'))          $active[] = 'LiteSpeed Cache';
    if (function_exists('w3tc_flush_all'))            $active[] = 'W3 Total Cache';
    if (function_exists('wp_cache_clear_cache'))      $active[] = 'WP Super Cache';
    if (function_exists('wpo_cache_flush'))           $active[] = 'WP Optimize';
    return ['success' => true, 'data' => ['active_cache_plugins' => $active]];
}

function ignyous_cache_clear_all() {
    $cleared = [];
    // WP Rocket
    if (function_exists('rocket_clean_domain')) { rocket_clean_domain(); $cleared[] = 'WP Rocket'; }
    // LiteSpeed Cache
    if (class_exists('LiteSpeed_Cache_API')) { LiteSpeed_Cache_API::purge_all(); $cleared[] = 'LiteSpeed'; }
    // W3 Total Cache
    if (function_exists('w3tc_flush_all')) { w3tc_flush_all(); $cleared[] = 'W3TC'; }
    // WP Super Cache
    if (function_exists('wp_cache_clear_cache')) { wp_cache_clear_cache(); $cleared[] = 'WP Super Cache'; }
    // WP Fastest Cache
    if (class_exists('WpFastestCache') && method_exists('WpFastestCache', 'deleteCache')) { (new WpFastestCache())->deleteCache(); $cleared[] = 'WP Fastest Cache'; }
    // Autoptimize
    if (class_exists('autoptimizeCache')) { autoptimizeCache::clearall(); $cleared[] = 'Autoptimize'; }
    // WP native cache
    wp_cache_flush();
    // Nginx helper
    do_action('rt_nginx_helper_purge_all');
    // Varnish
    do_action('varnish_http_purge');
    if (empty($cleared)) $cleared[] = 'WordPress object cache';
    return ['success' => true, 'message' => 'Cache cleared: ' . implode(', ', $cleared), 'data' => ['cleared' => $cleared]];
}

// ═══════════════════════════════════════════════════════════════
// FORMS — Contact Form 7, WPForms, Gravity Forms
// ═══════════════════════════════════════════════════════════════
function ignyous_forms_handler(WP_REST_Request $req) {
    $action = $req->get_param('action') ?? ($req->get_json_params()['action'] ?? 'list_forms');

    if ($action === 'list_forms') {
        $forms = [];
        // CF7
        if (class_exists('WPCF7_ContactForm')) {
            foreach (WPCF7_ContactForm::find() as $form) {
                $forms[] = ['id'=>$form->id(),'title'=>$form->title(),'plugin'=>'cf7','shortcode'=>'[contact-form-7 id="'.$form->id().'"]'];
            }
        }
        // WPForms
        if (function_exists('wpforms')) {
            $wf = wpforms()->form->get('', ['fields'=>'ID,post_title']);
            foreach ((array)$wf as $f) $forms[] = ['id'=>$f->ID,'title'=>$f->post_title,'plugin'=>'wpforms','shortcode'=>'[wpforms id="'.$f->ID.'"]'];
        }
        // Gravity Forms
        if (class_exists('GFAPI')) {
            foreach (GFAPI::get_forms() as $f) $forms[] = ['id'=>$f['id'],'title'=>$f['title'],'plugin'=>'gravityforms','shortcode'=>'[gravityform id="'.$f['id'].'"]'];
        }
        return ['success' => true, 'data' => ['forms' => $forms, 'count' => count($forms)]];
    }

    if ($action === 'submissions') {
        $form_id = intval($req->get_param('formId'));
        $entries = [];
        if (class_exists('GFAPI')) {
            $raw = GFAPI::get_entries($form_id, [], null, ['offset'=>0,'page_size'=>20]);
            foreach ((array)$raw as $e) $entries[] = ['id'=>$e['id'],'date'=>$e['date_created'],'data'=>array_filter($e, fn($k) => is_numeric($k), ARRAY_FILTER_USE_KEY)];
        }
        return ['success' => true, 'data' => ['entries' => $entries, 'form_id' => $form_id]];
    }

    if ($action === 'create_form') {
        $params  = $req->get_json_params();
        $plugin  = $params['plugin'] ?? 'cf7';
        $formDef = $params['formDef'] ?? [];
        if ($plugin === 'cf7' && class_exists('WPCF7_ContactForm')) {
            $template = '';
            foreach ($formDef['fields'] ?? [] as $f) {
                $template .= ignyous_cf7_field($f) . "\n";
            }
            $template .= '[submit "Send Message"]';
            $form = WPCF7_ContactForm::get_template(['title' => $formDef['title'] ?? 'New Form']);
            $form->set_properties(['form' => $template]);
            $form->save();
            return ['success' => true, 'message' => 'CF7 form created', 'data' => ['id' => $form->id(), 'shortcode' => '[contact-form-7 id="'.$form->id().'"]']];
        }
        return ['success' => false, 'message' => 'Plugin not available for form creation'];
    }

    return new WP_Error('unknown_action', 'Unknown action', ['status' => 400]);
}

function ignyous_cf7_field($f) {
    $req  = !empty($f['required']) ? '*' : '';
    $name = strtolower(preg_replace('/[^a-z0-9]/i', '-', $f['label'] ?? 'field'));
    switch ($f['type'] ?? 'text') {
        case 'email':    return "[email{$req} {$name} placeholder \"{$f['label']}\"]";
        case 'tel':      return "[tel{$req} {$name} placeholder \"{$f['label']}\"]";
        case 'textarea': return "[textarea{$req} {$name} placeholder \"{$f['label']}\"]";
        case 'select':   $opts = implode(' ', array_map(fn($o) => '"'.$o.'"', $f['options'] ?? [])); return "[select{$req} {$name} {$opts}]";
        default:         return "[text{$req} {$name} placeholder \"{$f['label']}\"]";
    }
}

// ═══════════════════════════════════════════════════════════════
// ADVANCED CUSTOM FIELDS
// ═══════════════════════════════════════════════════════════════
function ignyous_acf_handler(WP_REST_Request $req) {
    if (!function_exists('get_fields')) return new WP_Error('acf_missing', 'ACF not installed', ['status' => 404]);

    $post_id = intval($req->get_param('postId') ?? ($req->get_json_params()['postId'] ?? 0));

    if ($req->get_method() === 'GET') {
        $fields  = get_fields($post_id) ?: [];
        $schema  = function_exists('acf_get_fields') ? acf_get_fields($post_id) : [];
        return ['success' => true, 'data' => ['fields' => $fields, 'schema' => $schema, 'post_id' => $post_id]];
    }

    // PATCH — update field(s)
    $params = $req->get_json_params();
    $updated = [];
    if (isset($params['fieldKey'], $params['fieldValue'])) {
        update_field($params['fieldKey'], $params['fieldValue'], $post_id);
        $updated[] = $params['fieldKey'];
    }
    if (!empty($params['fields'])) {
        foreach ($params['fields'] as $key => $val) {
            update_field($key, $val, $post_id);
            $updated[] = $key;
        }
    }
    return ['success' => true, 'message' => 'Updated fields: ' . implode(', ', $updated), 'data' => ['updated' => $updated]];
}

// ═══════════════════════════════════════════════════════════════
// UPDRAFTPLUS
// ═══════════════════════════════════════════════════════════════
function ignyous_updraftplus_backup(WP_REST_Request $req) {
    if (!class_exists('UpdraftPlus')) return new WP_Error('missing', 'UpdraftPlus not installed', ['status' => 404]);
    global $updraftplus;
    $updraftplus->boot_backup(true, true, true, true, true);
    return ['success' => true, 'message' => 'Backup started — check UpdraftPlus > Existing Backups'];
}

function ignyous_updraftplus_list() {
    if (!class_exists('UpdraftPlus_Storage_Methods_Interface')) return new WP_Error('missing', 'UpdraftPlus not installed', ['status' => 404]);
    $backups = UpdraftPlus_Storage_Methods_Interface::list_backups();
    return ['success' => true, 'data' => ['backups' => array_slice((array)$backups, 0, 10)]];
}

// ═══════════════════════════════════════════════════════════════
// WORDFENCE
// ═══════════════════════════════════════════════════════════════
function ignyous_wordfence_status() {
    if (!class_exists('wordfence')) return new WP_Error('missing', 'Wordfence not installed', ['status' => 404]);
    return ['success' => true, 'data' => [
        'firewall_enabled' => (bool) wfConfig::get('firewallEnabled'),
        'login_security'   => (bool) wfConfig::get('loginSecurityEnabled'),
        'scan_scheduled'   => (bool) wfConfig::get('scheduledScansEnabled'),
        'last_scan'        => wfConfig::get('lastScanCompleted'),
        'blocked_attacks'  => wfConfig::get('totalIPsBlocked'),
    ]];
}

function ignyous_wordfence_scan() {
    if (!class_exists('wordfence')) return new WP_Error('missing', 'Wordfence not installed', ['status' => 404]);
    do_action('wordfence_start_scan');
    return ['success' => true, 'message' => 'Wordfence scan initiated'];
}

function ignyous_wordfence_blocked() {
    if (!class_exists('wfBlock')) return ['success' => true, 'data' => ['blocked' => [], 'note' => 'Wordfence not available']];
    $blocks = wfBlock::getBlocks(20);
    return ['success' => true, 'data' => ['blocked' => $blocks, 'count' => count($blocks)]];
}

function ignyous_wordfence_unblock(WP_REST_Request $req) {
    $ip = sanitize_text_field($req->get_json_params()['ip'] ?? '');
    if (class_exists('wfBlock')) wfBlock::unblockIP($ip);
    return ['success' => true, 'message' => "Unblocked IP: $ip"];
}

// ═══════════════════════════════════════════════════════════════
// SMUSH / IMAGE OPTIMIZATION
// ═══════════════════════════════════════════════════════════════
function ignyous_smush_status() {
    if (!class_exists('WP_Smush')) return ['success' => true, 'data' => ['installed' => false]];
    $stats = WP_Smush::get_instance()->core()->stats;
    return ['success' => true, 'data' => ['installed' => true, 'images_smushed' => $stats['total_images'] ?? 0, 'savings_bytes' => $stats['bytes'] ?? 0]];
}

function ignyous_smush_optimize() {
    if (class_exists('WP_Smush')) do_action('smush_background_process');
    if (class_exists('Imagify_Bulk')) Imagify_Bulk::get_instance()->process_all(1);
    return ['success' => true, 'message' => 'Image optimization queued'];
}

// ═══════════════════════════════════════════════════════════════
// SLIDER REVOLUTION
// ═══════════════════════════════════════════════════════════════
function ignyous_revslider_list() {
    if (!class_exists('RevSlider')) return new WP_Error('missing', 'Slider Revolution not installed', ['status' => 404]);
    $revslider = new RevSlider();
    $sliders   = $revslider->getArrSliders();
    $out = array_map(fn($s) => ['id'=>$s->getID(),'title'=>$s->getTitle(),'alias'=>$s->getAlias(),'slide_count'=>count($s->getSlides())], $sliders);
    return ['success' => true, 'data' => ['sliders' => $out]];
}

function ignyous_revslider_slide(WP_REST_Request $req) {
    if (!class_exists('RevSliderSlide')) return new WP_Error('missing', 'Slider Revolution not installed', ['status' => 404]);
    $params = $req->get_json_params();
    if ($req->get_method() === 'PATCH') {
        $slide = new RevSliderSlide();
        $slide->initByID($params['slideId']);
        $params_obj = $params['slide'] ?? [];
        if (!empty($params_obj['title']))       $slide->updateTitle($params_obj['title']);
        if (!empty($params_obj['bg_color']))    $slide->updateParam('slide_bg_color', $params_obj['bg_color']);
        if (!empty($params_obj['bg_image_url']))$slide->updateParam('slide_image', $params_obj['bg_image_url']);
        return ['success' => true, 'message' => 'Slide updated'];
    }
    return ['success' => false, 'message' => 'Not implemented'];
}

// ═══════════════════════════════════════════════════════════════
// TABLEPRESS
// ═══════════════════════════════════════════════════════════════
function ignyous_tablepress_list() {
    if (!class_exists('TablePress')) return new WP_Error('missing', 'TablePress not installed', ['status' => 404]);
    $tables = TablePress::$model_table->load_all();
    $out    = array_map(fn($t) => ['id'=>$t['id'],'name'=>$t['name'],'rows'=>$t['options']['last_modified_time'],'shortcode'=>"[table id=$t[id] /]"], array_values($tables));
    return ['success' => true, 'data' => ['tables' => $out]];
}

function ignyous_tablepress_handler(WP_REST_Request $req) {
    if (!class_exists('TablePress')) return new WP_Error('missing', 'TablePress not installed', ['status' => 404]);
    $params = $req->get_json_params();

    if ($req->get_method() === 'GET') {
        $id = $req->get_param('id');
        $t  = TablePress::$model_table->load($id);
        return ['success' => true, 'data' => $t];
    }

    if ($req->get_method() === 'POST') {
        $table = TablePress::$model_table->get_table_template();
        $table['name'] = sanitize_text_field($params['name'] ?? 'New Table');
        $table['data'] = $params['data'] ?? [['']];
        $id = TablePress::$model_table->save($table);
        return ['success' => true, 'message' => 'Table created', 'data' => ['id' => $id, 'shortcode' => "[table id=$id /]"]];
    }

    if ($req->get_method() === 'PATCH') {
        $t = TablePress::$model_table->load($params['id']);
        if (!empty($params['data'])) $t['data'] = $params['data'];
        if (!empty($params['name'])) $t['name'] = sanitize_text_field($params['name']);
        TablePress::$model_table->save($t);
        return ['success' => true, 'message' => 'Table updated'];
    }
    return ['success' => false];
}

// ═══════════════════════════════════════════════════════════════
// WOOCOMMERCE EXTENDED
// ═══════════════════════════════════════════════════════════════
function ignyous_woo_products(WP_REST_Request $req) {
    if (!class_exists('WooCommerce')) return new WP_Error('missing', 'WooCommerce not installed', ['status' => 404]);
    $args  = ['post_type'=>'product','posts_per_page'=>intval($req->get_param('per_page')?:20),'post_status'=>'publish'];
    $query = new WP_Query($args);
    $out   = [];
    foreach ($query->posts as $p) {
        $product = wc_get_product($p->ID);
        $out[] = ['id'=>$p->ID,'name'=>$p->post_title,'price'=>$product->get_price(),'stock'=>$product->get_stock_quantity(),'status'=>$p->post_status,'sku'=>$product->get_sku()];
    }
    return ['success'=>true,'data'=>['products'=>$out,'total'=>$query->found_posts]];
}

function ignyous_woo_orders(WP_REST_Request $req) {
    if (!class_exists('WooCommerce')) return new WP_Error('missing', 'WooCommerce not installed', ['status' => 404]);
    $args   = ['limit'=>20,'status'=>$req->get_param('status')?:'any'];
    $orders = wc_get_orders($args);
    $out = array_map(fn($o) => ['id'=>$o->get_id(),'status'=>$o->get_status(),'total'=>$o->get_total(),'date'=>$o->get_date_created()->date('Y-m-d'),'customer'=>$o->get_billing_first_name().' '.$o->get_billing_last_name()], $orders);
    return ['success'=>true,'data'=>['orders'=>$out]];
}

function ignyous_woo_create_coupon(WP_REST_Request $req) {
    if (!class_exists('WC_Coupon')) return new WP_Error('missing', 'WooCommerce not installed', ['status' => 404]);
    $p = $req->get_json_params();
    $coupon = new WC_Coupon();
    $coupon->set_code(strtoupper(sanitize_text_field($p['code'] ?? 'SALE'.rand(100,999))));
    $coupon->set_discount_type($p['discount_type'] ?? 'percent');
    $coupon->set_amount($p['amount'] ?? 10);
    if (!empty($p['date_expires'])) $coupon->set_date_expires(strtotime($p['date_expires']));
    if (!empty($p['usage_limit']))  $coupon->set_usage_limit(intval($p['usage_limit']));
    if (!empty($p['description']))  $coupon->set_description(sanitize_text_field($p['description']));
    $id = $coupon->save();
    return ['success'=>true,'message'=>'Coupon created','data'=>['id'=>$id,'code'=>$coupon->get_code()]];
}

function ignyous_woo_create_product(WP_REST_Request $req) {
    if (!class_exists('WC_Product_Simple')) return new WP_Error('missing', 'WooCommerce not installed', ['status' => 404]);
    $p       = $req->get_json_params();
    $product = new WC_Product_Simple();
    $product->set_name(sanitize_text_field($p['name'] ?? 'New Product'));
    $product->set_description(wp_kses_post($p['description'] ?? ''));
    $product->set_short_description(wp_kses_post($p['short_description'] ?? ''));
    $product->set_regular_price($p['regular_price'] ?? '');
    $product->set_sku(sanitize_text_field($p['sku'] ?? ''));
    $product->set_status($p['status'] ?? 'publish');
    $id = $product->save();
    return ['success'=>true,'message'=>'Product created','data'=>['id'=>$id,'name'=>$product->get_name()]];
}

function ignyous_woo_bulk_price(WP_REST_Request $req) {
    $p = $req->get_json_params();
    $change   = floatval($p['change'] ?? 0);
    $type     = $p['type'] ?? 'percent'; // 'percent' or 'fixed'
    $category = $p['category'] ?? '';
    $args = ['post_type'=>'product','posts_per_page'=>-1,'post_status'=>'publish'];
    if ($category) $args['tax_query'] = [['taxonomy'=>'product_cat','field'=>'name','terms'=>[$category]]];
    $query = new WP_Query($args);
    $updated = 0;
    foreach ($query->posts as $post) {
        $product = wc_get_product($post->ID);
        $price   = floatval($product->get_regular_price());
        if (!$price) continue;
        $new_price = $type === 'percent' ? $price * (1 + $change/100) : $price + $change;
        $product->set_regular_price(number_format($new_price, 2, '.', ''));
        $product->save(); $updated++;
    }
    return ['success'=>true,'message'=>"Updated $updated product prices",'data'=>['updated'=>$updated]];
}

// ═══════════════════════════════════════════════════════════════
// MAILCHIMP
// ═══════════════════════════════════════════════════════════════
function ignyous_mailchimp_stats() {
    $api_key = get_option('mc4wp_api_key') ?: get_option('mailchimp_api_key');
    if (!$api_key) return ['success'=>false,'message'=>'Mailchimp API key not set in plugin settings'];
    $dc  = substr($api_key, strpos($api_key, '-') + 1);
    $res = wp_remote_get("https://{$dc}.api.mailchimp.com/3.0/lists", ['headers'=>['Authorization'=>"apikey $api_key"]]);
    if (is_wp_error($res)) return ['success'=>false,'message'=>$res->get_error_message()];
    $data = json_decode(wp_remote_retrieve_body($res), true);
    $lists = array_map(fn($l) => ['id'=>$l['id'],'name'=>$l['name'],'subscribers'=>$l['stats']['member_count'],'open_rate'=>$l['stats']['open_rate']], $data['lists'] ?? []);
    return ['success'=>true,'data'=>['lists'=>$lists,'total_subscribers'=>array_sum(array_column($lists,'subscribers'))]];
}

// ═══════════════════════════════════════════════════════════════
// SSL
// ═══════════════════════════════════════════════════════════════
function ignyous_ssl_status() {
    $url     = get_site_url();
    $is_ssl  = str_starts_with($url, 'https');
    $forced  = (bool) get_option('rlrsssl_force_ssl');
    return ['success'=>true,'data'=>['is_https'=>$is_ssl,'force_ssl'=>$forced,'site_url'=>$url,'mixed_content_fixer'=>class_exists('RSSSL_MIXED_CONTENT_FIXER')]];
}

function ignyous_ssl_force() {
    update_option('rlrsssl_force_ssl', 1);
    $url = get_site_url();
    if (!str_starts_with($url, 'https')) { update_option('siteurl', str_replace('http://', 'https://', $url)); update_option('home', str_replace('http://', 'https://', get_option('home'))); }
    return ['success'=>true,'message'=>'SSL forced — site now redirects HTTP to HTTPS'];
}

// ═══════════════════════════════════════════════════════════════
// MULTILINGUAL (WPML / Polylang)
// ═══════════════════════════════════════════════════════════════
function ignyous_multilingual_languages() {
    $languages = [];
    if (function_exists('icl_get_languages')) {
        foreach (icl_get_languages() as $lang) $languages[] = ['code'=>$lang['code'],'name'=>$lang['native_name'],'active'=>$lang['active'],'url'=>$lang['url']];
    } elseif (function_exists('pll_languages_list')) {
        foreach (pll_languages_list(['fields'=>'']) as $lang) $languages[] = ['code'=>$lang->slug,'name'=>$lang->name,'active'=>true];
    }
    return ['success'=>true,'data'=>['languages'=>$languages,'plugin'=>function_exists('icl_get_languages')?'wpml':(function_exists('pll_languages_list')?'polylang':'none')]];
}

function ignyous_multilingual_translate(WP_REST_Request $req) {
    $p        = $req->get_json_params();
    $post_id  = intval($p['pageId'] ?? 0);
    $language = sanitize_text_field($p['language'] ?? '');
    $content  = wp_kses_post($p['content'] ?? '');
    // Create translated post
    $new_id = wp_insert_post(['post_content'=>$content,'post_status'=>'draft','post_type'=>get_post_type($post_id),'post_title'=>get_the_title($post_id).' ('.$language.')']);
    if (function_exists('pll_set_post_language')) pll_set_post_language($new_id, $language);
    return ['success'=>true,'message'=>"Translated draft created for language: $language",'data'=>['new_post_id'=>$new_id]];
}
