<?php
/**
 * ignyous Bridge — Payment Plugins
 * Supports: Easy Digital Downloads, GiveWP, WooCommerce Subscriptions,
 *           WooCommerce Payments, Stripe, PayPal, Square
 */

add_action('rest_api_init', function() {
    $p = 'ignyous_check_permission';
    register_rest_route('ignyous/v1', '/edd/products',        ['methods'=>['GET','POST'],          'callback'=>'ignyous_edd_products',    'permission_callback'=>$p]);
    register_rest_route('ignyous/v1', '/edd/orders',          ['methods'=>'GET',                   'callback'=>'ignyous_edd_orders',      'permission_callback'=>$p]);
    register_rest_route('ignyous/v1', '/edd/discounts',       ['methods'=>['GET','POST'],          'callback'=>'ignyous_edd_discounts',   'permission_callback'=>$p]);
    register_rest_route('ignyous/v1', '/edd/stats',           ['methods'=>'GET',                   'callback'=>'ignyous_edd_stats',       'permission_callback'=>$p]);
    register_rest_route('ignyous/v1', '/give/forms',          ['methods'=>['GET','POST'],          'callback'=>'ignyous_give_forms',      'permission_callback'=>$p]);
    register_rest_route('ignyous/v1', '/give/stats',          ['methods'=>'GET',                   'callback'=>'ignyous_give_stats',      'permission_callback'=>$p]);
    register_rest_route('ignyous/v1', '/give/donors',         ['methods'=>'GET',                   'callback'=>'ignyous_give_donors',     'permission_callback'=>$p]);
    register_rest_route('ignyous/v1', '/woo/subscriptions',   ['methods'=>'GET',                   'callback'=>'ignyous_woo_subs',        'permission_callback'=>$p]);
    register_rest_route('ignyous/v1', '/woo/subscriptions/(?P<id>\d+)', ['methods'=>['PATCH'],    'callback'=>'ignyous_woo_sub_update',  'permission_callback'=>$p]);
    register_rest_route('ignyous/v1', '/payments/gateways',   ['methods'=>'GET',                   'callback'=>'ignyous_payment_gateways','permission_callback'=>$p]);
    register_rest_route('ignyous/v1', '/payments/revenue',    ['methods'=>'GET',                   'callback'=>'ignyous_revenue_stats',   'permission_callback'=>$p]);
});

// ══════════════════════════════════════════════════════════════
// EASY DIGITAL DOWNLOADS
// ══════════════════════════════════════════════════════════════

function ignyous_edd_products(WP_REST_Request $req) {
    if (!class_exists('Easy_Digital_Downloads')) return ignyous_pw_missing('Easy Digital Downloads');

    if ($req->get_method() === 'POST') {
        $p  = $req->get_json_params();
        $id = wp_insert_post(['post_title'=>sanitize_text_field($p['name']??'New Download'),'post_content'=>wp_kses_post($p['description']??''),'post_type'=>'download','post_status'=>$p['status']??'publish']);
        if (!is_wp_error($id)) {
            if (!empty($p['price']))    update_post_meta($id,'edd_price',floatval($p['price']));
            if (!empty($p['sku']))      update_post_meta($id,'_edd_download_product_notes',$p['sku']);
            if (!empty($p['files']))    update_post_meta($id,'edd_download_files',$p['files']);
            if (!empty($p['categories'])) wp_set_object_terms($id,(array)$p['categories'],'download_category');
            if (!empty($p['tags']))       wp_set_object_terms($id,(array)$p['tags'],'download_tag');
        }
        return is_wp_error($id) ? new WP_Error('edd_error',$id->get_error_message(),['status'=>500]) : ignyous_pw_ok(['id'=>$id,'title'=>get_the_title($id),'permalink'=>get_permalink($id),'message'=>'Download created']);
    }

    $args     = ['post_type'=>'download','posts_per_page'=>intval($req->get_param('per_page')??20),'post_status'=>'publish','orderby'=>'date','order'=>'DESC'];
    $posts    = get_posts($args);
    $products = array_map(function($p) {
        $price = edd_get_download_price($p->ID);
        $sales = edd_get_download_sales_stats($p->ID);
        return ['id'=>$p->ID,'name'=>$p->post_title,'price'=>$price,'sales'=>$sales,'permalink'=>get_permalink($p->ID),'categories'=>wp_get_post_terms($p->ID,'download_category',['fields'=>'names'])];
    }, $posts);
    return ignyous_pw_ok(['products'=>$products,'total'=>wp_count_posts('download')->publish]);
}

function ignyous_edd_orders(WP_REST_Request $req) {
    if (!function_exists('edd_get_orders')) return ignyous_pw_missing('EDD');
    $orders = edd_get_orders(['number'=>intval($req->get_param('per_page')??20),'status'=>$req->get_param('status')?:['complete','pending','refunded']]);
    $out = array_map(fn($o) => ['id'=>$o->get_id(),'status'=>$o->get_status(),'total'=>$o->get_total(),'date'=>$o->get_date_created(),'email'=>$o->get_email(),'ip'=>$o->get_ip()], $orders);
    return ignyous_pw_ok(['orders'=>$out,'total'=>count($out)]);
}

function ignyous_edd_discounts(WP_REST_Request $req) {
    if (!function_exists('edd_get_discounts')) return ignyous_pw_missing('EDD');
    if ($req->get_method() === 'POST') {
        $p  = $req->get_json_params();
        $id = edd_store_discount(['name'=>sanitize_text_field($p['name']??'Discount'),'code'=>strtoupper(sanitize_text_field($p['code']??'SAVE'.rand(10,99))),'type'=>$p['type']??'percent','amount'=>floatval($p['amount']??10),'uses'=>0,'max_uses'=>intval($p['max_uses']??0),'start'=>$p['start']??'','expiration'=>$p['expiration']??'','status'=>'active']);
        return ignyous_pw_ok(['id'=>$id,'message'=>'Discount code created']);
    }
    $discounts = edd_get_discounts(['posts_per_page'=>20]);
    $out = array_map(fn($d) => ['id'=>$d->ID,'name'=>$d->post_title,'code'=>get_post_meta($d->ID,'_edd_discount_code',true),'amount'=>get_post_meta($d->ID,'_edd_discount_amount',true),'type'=>get_post_meta($d->ID,'_edd_discount_type',true),'uses'=>get_post_meta($d->ID,'_edd_discount_uses',true),'expiry'=>get_post_meta($d->ID,'_edd_discount_expiration',true)], (array)$discounts);
    return ignyous_pw_ok(['discounts'=>$out]);
}

function ignyous_edd_stats() {
    if (!function_exists('edd_get_total_earnings')) return ignyous_pw_missing('EDD');
    return ignyous_pw_ok(['total_earnings'=>edd_get_total_earnings(),'total_sales'=>edd_get_total_sales(),'earnings_today'=>edd_get_earnings_by_date(null,date('j'),date('n'),date('Y')),'products'=>wp_count_posts('download')->publish]);
}

// ══════════════════════════════════════════════════════════════
// GIVEWP — DONATION PLUGIN
// ══════════════════════════════════════════════════════════════

function ignyous_give_forms(WP_REST_Request $req) {
    if (!function_exists('give_get_forms')) return ignyous_pw_missing('GiveWP');
    if ($req->get_method() === 'POST') {
        $p  = $req->get_json_params();
        $id = wp_insert_post(['post_title'=>sanitize_text_field($p['title']??'Donate'),'post_type'=>'give_forms','post_status'=>'publish','post_content'=>wp_kses_post($p['description']??'')]);
        if (!is_wp_error($id)) {
            update_post_meta($id,'_give_set_price',floatval($p['suggested_amount']??25));
            update_post_meta($id,'_give_custom_amount',$p['custom_amount']??'enabled');
            update_post_meta($id,'_give_form_goal_option',!empty($p['goal'])?'enabled':'disabled');
            if (!empty($p['goal'])) update_post_meta($id,'_give_set_goal',floatval($p['goal']));
        }
        return ignyous_pw_ok(['id'=>$id,'shortcode'=>'[give_form id="'.$id.'"]','message'=>'Donation form created']);
    }
    $forms = give_get_forms(['number'=>20]);
    $out   = array_map(fn($f) => ['id'=>$f->ID,'title'=>$f->post_title,'goal'=>give_get_form_goal($f->ID),'total_donated'=>give_get_total_form_earnings($f->ID),'donor_count'=>give_get_form_donor_count($f->ID),'shortcode'=>'[give_form id="'.$f->ID.'"]'], (array)$forms);
    return ignyous_pw_ok(['forms'=>$out]);
}

function ignyous_give_stats() {
    if (!class_exists('Give')) return ignyous_pw_missing('GiveWP');
    global $wpdb;
    $total = $wpdb->get_var("SELECT SUM(total_amount) FROM {$wpdb->prefix}give_revenue");
    $count = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->prefix}give_donors");
    return ignyous_pw_ok(['total_raised'=>$total,'total_donors'=>$count,'currency'=>give_get_currency()]);
}

function ignyous_give_donors() {
    if (!class_exists('Give_DB_Donors')) return ignyous_pw_missing('GiveWP');
    $db     = new Give_DB_Donors();
    $donors = $db->get_donors(['number'=>20,'orderby'=>'total_donations','order'=>'DESC']);
    $out    = array_map(fn($d) => ['id'=>$d->id,'name'=>$d->name,'email'=>$d->email,'total_donated'=>$d->purchase_value,'donations'=>$d->purchase_count], (array)$donors);
    return ignyous_pw_ok(['donors'=>$out]);
}

// ══════════════════════════════════════════════════════════════
// WOOCOMMERCE SUBSCRIPTIONS
// ══════════════════════════════════════════════════════════════

function ignyous_woo_subs(WP_REST_Request $req) {
    if (!function_exists('wcs_get_subscriptions')) return ignyous_pw_missing('WooCommerce Subscriptions');
    $status = $req->get_param('status') ?: 'any';
    $subs   = wcs_get_subscriptions(['subscription_status'=>$status,'subscriptions_per_page'=>20,'orderby'=>'start_date','order'=>'DESC']);
    $out = array_map(fn($s) => ['id'=>$s->get_id(),'status'=>$s->get_status(),'total'=>$s->get_total(),'period'=>$s->get_billing_period(),'next_payment'=>$s->get_date('next_payment'),'customer'=>$s->get_billing_first_name().' '.$s->get_billing_last_name(),'start_date'=>$s->get_date('start')], (array)$subs);
    return ignyous_pw_ok(['subscriptions'=>$out,'total'=>count($out)]);
}

function ignyous_woo_sub_update(WP_REST_Request $req) {
    if (!function_exists('wcs_get_subscription')) return ignyous_pw_missing('WooCommerce Subscriptions');
    $id  = intval($req->get_param('id'));
    $p   = $req->get_json_params();
    $sub = wcs_get_subscription($id);
    if (!$sub) return new WP_Error('not_found','Subscription not found',['status'=>404]);
    if (!empty($p['status'])) {
        switch ($p['status']) {
            case 'active':    $sub->update_status('active');    break;
            case 'on-hold':   $sub->update_status('on-hold');   break;
            case 'cancelled': $sub->update_status('cancelled'); break;
        }
    }
    return ignyous_pw_ok(['id'=>$id,'status'=>$sub->get_status(),'message'=>'Subscription updated']);
}

// ══════════════════════════════════════════════════════════════
// PAYMENT GATEWAYS STATUS
// ══════════════════════════════════════════════════════════════

function ignyous_payment_gateways() {
    $gateways = [];

    // WooCommerce gateways
    if (class_exists('WooCommerce')) {
        $wc_gateways = WC()->payment_gateways()->payment_gateways();
        foreach ($wc_gateways as $id => $gw) {
            $gateways[] = ['id'=>$id,'name'=>$gw->method_title,'enabled'=>$gw->enabled==='yes','description'=>$gw->method_description,'platform'=>'woocommerce'];
        }
    }

    // WooCommerce Payments (Stripe-based)
    if (class_exists('WC_Payments')) {
        $account = WC_Payments::get_account_service();
        $gateways[] = ['id'=>'woocommerce_payments','name'=>'WooCommerce Payments','enabled'=>true,'connected'=>$account->is_stripe_connected(),'platform'=>'woocommerce'];
    }

    // EDD gateways
    if (function_exists('edd_get_payment_gateways')) {
        foreach (edd_get_payment_gateways() as $id => $gw) {
            $gateways[] = ['id'=>$id,'name'=>$gw['admin_label'],'enabled'=>edd_is_gateway_active($id),'platform'=>'edd'];
        }
    }

    // Stripe standalone check
    if (class_exists('WC_Stripe')) {
        $stripe_settings = get_option('woocommerce_stripe_settings',[]);
        $gateways[] = ['id'=>'stripe','name'=>'Stripe','enabled'=>($stripe_settings['enabled']??'no')==='yes','test_mode'=>($stripe_settings['testmode']??'no')==='yes','platform'=>'woocommerce'];
    }

    return ignyous_pw_ok(['gateways'=>$gateways,'count'=>count($gateways)]);
}

// ══════════════════════════════════════════════════════════════
// UNIFIED REVENUE REPORT
// ══════════════════════════════════════════════════════════════

function ignyous_revenue_stats() {
    $report = ['sources'=>[],'total'=>0,'currency'=>''];

    // WooCommerce
    if (class_exists('WooCommerce')) {
        global $wpdb;
        $woo_total = $wpdb->get_var("SELECT SUM(meta_value) FROM {$wpdb->postmeta} pm JOIN {$wpdb->posts} p ON p.ID=pm.post_id WHERE pm.meta_key='_order_total' AND p.post_status='wc-completed' AND p.post_type='shop_order'");
        $report['sources'][] = ['name'=>'WooCommerce','total'=>floatval($woo_total),'currency'=>get_woocommerce_currency()];
        $report['total']    += floatval($woo_total);
        $report['currency']  = get_woocommerce_currency();
    }

    // EDD
    if (function_exists('edd_get_total_earnings')) {
        $edd_total = edd_get_total_earnings();
        $report['sources'][] = ['name'=>'Easy Digital Downloads','total'=>floatval($edd_total),'currency'=>give_get_currency()];
        $report['total']    += floatval($edd_total);
    }

    // GiveWP
    if (class_exists('Give')) {
        global $wpdb;
        $give_total = $wpdb->get_var("SELECT SUM(total_amount) FROM {$wpdb->prefix}give_revenue");
        $report['sources'][] = ['name'=>'GiveWP Donations','total'=>floatval($give_total),'currency'=>give_get_currency()];
        $report['total']    += floatval($give_total);
    }

    return ignyous_pw_ok($report);
}

function ignyous_pw_missing($name) { return new WP_Error('plugin_missing',"$name is not installed or active",['status'=>404]); }
function ignyous_pw_ok($data)      { return ['success'=>true,'data'=>$data]; }
