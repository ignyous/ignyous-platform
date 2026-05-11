<?php
/**
 * ignyous Bridge — Gravity Forms & WPForms Extended
 * Full CRUD: forms, fields, entries, notifications, confirmations
 */

add_action('rest_api_init', function() {
    $p = 'ignyous_check_permission';
    register_rest_route('ignyous/v1', '/gf/forms',               ['methods'=>['GET','POST'],         'callback'=>'ignyous_gf_forms',        'permission_callback'=>$p]);
    register_rest_route('ignyous/v1', '/gf/forms/(?P<id>\d+)',   ['methods'=>['GET','PATCH','DELETE'],'callback'=>'ignyous_gf_form_single', 'permission_callback'=>$p]);
    register_rest_route('ignyous/v1', '/gf/entries/(?P<id>\d+)', ['methods'=>'GET',                  'callback'=>'ignyous_gf_entries',      'permission_callback'=>$p]);
    register_rest_route('ignyous/v1', '/gf/entry/(?P<id>\d+)',   ['methods'=>'GET',                  'callback'=>'ignyous_gf_entry_single', 'permission_callback'=>$p]);
    register_rest_route('ignyous/v1', '/gf/stats/(?P<id>\d+)',   ['methods'=>'GET',                  'callback'=>'ignyous_gf_stats',        'permission_callback'=>$p]);

    register_rest_route('ignyous/v1', '/wpf/forms',              ['methods'=>['GET','POST'],         'callback'=>'ignyous_wpf_forms',       'permission_callback'=>$p]);
    register_rest_route('ignyous/v1', '/wpf/forms/(?P<id>\d+)', ['methods'=>['GET','PATCH'],         'callback'=>'ignyous_wpf_form_single', 'permission_callback'=>$p]);
    register_rest_route('ignyous/v1', '/wpf/entries/(?P<id>\d+)',['methods'=>'GET',                  'callback'=>'ignyous_wpf_entries',     'permission_callback'=>$p]);
});

// ══════════════════════════════════════════════════════════════
// GRAVITY FORMS
// ══════════════════════════════════════════════════════════════

function ignyous_gf_forms(WP_REST_Request $req) {
    if (!class_exists('GFAPI')) return ignyous_plugin_missing('Gravity Forms');

    if ($req->get_method() === 'GET') {
        $forms = GFAPI::get_forms();
        $out = array_map(function($f) {
            $entry_count = GFAPI::count_entries($f['id']);
            return [
                'id'          => $f['id'],
                'title'       => $f['title'],
                'active'      => $f['is_active'],
                'field_count' => count($f['fields'] ?? []),
                'entry_count' => $entry_count,
                'shortcode'   => '[gravityform id="'.$f['id'].'" title="false"]',
                'created'     => $f['date_created'],
            ];
        }, $forms);
        return ignyous_ok(['forms' => $out, 'total' => count($out)]);
    }

    // POST — create form from field definitions
    $p      = $req->get_json_params();
    $fields = ignyous_gf_build_fields($p['fields'] ?? []);
    $form   = [
        'title'         => sanitize_text_field($p['title'] ?? 'New Form'),
        'fields'        => $fields,
        'button'        => ['type' => 'text', 'text' => $p['submit_text'] ?? 'Submit'],
        'confirmations' => [1 => ['id'=>1,'name'=>'Default','type'=>'message','message'=>$p['confirmation'] ?? '<p>Thank you for your message!</p>','isDefault'=>true]],
        'notifications' => ignyous_gf_build_notifications($p),
    ];
    $id = GFAPI::add_form($form);
    if (is_wp_error($id)) return new WP_Error('gf_error', $id->get_error_message(), ['status'=>500]);
    return ignyous_ok(['id'=>$id,'shortcode'=>'[gravityform id="'.$id.'" title="false"]','message'=>'Form created']);
}

function ignyous_gf_form_single(WP_REST_Request $req) {
    if (!class_exists('GFAPI')) return ignyous_plugin_missing('Gravity Forms');
    $id = intval($req->get_param('id'));

    if ($req->get_method() === 'GET') {
        $form = GFAPI::get_form($id);
        if (!$form) return new WP_Error('not_found','Form not found',['status'=>404]);
        return ignyous_ok(['form' => $form]);
    }
    if ($req->get_method() === 'PATCH') {
        $p    = $req->get_json_params();
        $form = GFAPI::get_form($id);
        if (!empty($p['title']))         $form['title']    = sanitize_text_field($p['title']);
        if (!empty($p['submit_text']))   $form['button']['text'] = sanitize_text_field($p['submit_text']);
        if (!empty($p['confirmation']))  $form['confirmations'][1]['message'] = wp_kses_post($p['confirmation']);
        if (!empty($p['active']))        $form['is_active'] = (bool)$p['active'];
        if (!empty($p['fields']))        $form['fields']   = ignyous_gf_build_fields($p['fields']);
        GFAPI::update_form($form);
        return ignyous_ok(['message'=>'Form updated']);
    }
    if ($req->get_method() === 'DELETE') {
        GFAPI::delete_form($id);
        return ignyous_ok(['message'=>'Form deleted']);
    }
}

function ignyous_gf_entries(WP_REST_Request $req) {
    if (!class_exists('GFAPI')) return ignyous_plugin_missing('Gravity Forms');
    $form_id = intval($req->get_param('id'));
    $paging  = ['offset'=>0,'page_size'=>intval($req->get_param('per_page')?:20)];
    $entries = GFAPI::get_entries($form_id,[],$paging);
    $form    = GFAPI::get_form($form_id);
    // Map field IDs to labels
    $field_map = [];
    foreach ($form['fields'] ?? [] as $f) $field_map[$f->id] = $f->label;

    $out = array_map(function($e) use ($field_map) {
        $data = [];
        foreach ($e as $k => $v) if (is_numeric($k) && isset($field_map[$k])) $data[$field_map[$k]] = $v;
        return ['id'=>$e['id'],'date'=>$e['date_created'],'ip'=>$e['ip'],'status'=>$e['status'],'data'=>$data];
    }, $entries);
    return ignyous_ok(['entries'=>$out,'total'=>GFAPI::count_entries($form_id),'form_title'=>$form['title']]);
}

function ignyous_gf_entry_single(WP_REST_Request $req) {
    if (!class_exists('GFAPI')) return ignyous_plugin_missing('Gravity Forms');
    $entry = GFAPI::get_entry(intval($req->get_param('id')));
    return is_wp_error($entry) ? new WP_Error('not_found','Entry not found',['status'=>404]) : ignyous_ok(['entry'=>$entry]);
}

function ignyous_gf_stats(WP_REST_Request $req) {
    if (!class_exists('GFAPI')) return ignyous_plugin_missing('Gravity Forms');
    $id = intval($req->get_param('id'));
    $total   = GFAPI::count_entries($id);
    $unread  = GFAPI::count_entries($id,['status'=>'active','is_read'=>false]);
    $starred = GFAPI::count_entries($id,['status'=>'active','is_starred'=>true]);
    return ignyous_ok(['total'=>$total,'unread'=>$unread,'starred'=>$starred]);
}

// Build GF fields array from AI-generated field definitions
function ignyous_gf_build_fields(array $fields) {
    $gf_fields = [];
    $id = 1;
    foreach ($fields as $f) {
        $type = $f['type'] ?? 'text';
        $gf_type_map = ['text'=>'text','email'=>'email','phone'=>'phone','textarea'=>'textarea','select'=>'select','checkbox'=>'checkbox','radio'=>'radio','name'=>'name','address'=>'address','date'=>'date','number'=>'number','file'=>'fileupload','url'=>'website'];
        $gf_type = $gf_type_map[$type] ?? 'text';
        $field = GF_Fields::create(['type'=>$gf_type,'id'=>$id,'label'=>sanitize_text_field($f['label']??'Field'),'isRequired'=>!empty($f['required']),'size'=>'medium']);
        if (!empty($f['placeholder'])) $field->placeholder = $f['placeholder'];
        if (!empty($f['options']) && in_array($type,['select','checkbox','radio'])) {
            $choices = array_map(fn($o,) => ['text'=>$o,'value'=>$o,'isSelected'=>false], $f['options']);
            $field->choices = $choices;
        }
        if ($type === 'name') {
            $field->nameFormat = 'simple';
        }
        $gf_fields[] = $field;
        $id++;
    }
    return $gf_fields;
}

function ignyous_gf_build_notifications(array $p) {
    $admin_email = get_option('admin_email');
    return [1 => ['id'=>1,'isActive'=>true,'name'=>'Admin Notification','to'=>$admin_email,'from'=>$admin_email,'fromName'=>'{form_title}','replyTo'=>'{admin_email}','subject'=>'New Form Entry: {form_title}','message'=>'{all_fields}','conditionalLogic'=>false]];
}

// ══════════════════════════════════════════════════════════════
// WPFORMS
// ══════════════════════════════════════════════════════════════

function ignyous_wpf_forms(WP_REST_Request $req) {
    if (!function_exists('wpforms')) return ignyous_plugin_missing('WPForms');

    if ($req->get_method() === 'GET') {
        $forms = wpforms()->form->get('',['fields'=>'ID,post_title,post_date','posts_per_page'=>50]);
        $out   = [];
        foreach ((array)$forms as $f) {
            $data    = wpforms()->form->get($f->ID, ['content_only'=>true]);
            $entries = wpforms()->entry->get_entries(['form_id'=>$f->ID,'number'=>0]);
            $out[] = ['id'=>$f->ID,'title'=>$f->post_title,'field_count'=>count($data['fields']??[]),'entry_count'=>$entries,'shortcode'=>'[wpforms id="'.$f->ID.'"]','created'=>$f->post_date];
        }
        return ignyous_ok(['forms'=>$out,'total'=>count($out)]);
    }

    // POST — create WPForms form
    $p      = $req->get_json_params();
    $fields = ignyous_wpf_build_fields($p['fields'] ?? []);
    $form   = wpforms()->form->add(sanitize_text_field($p['title']??'New Form'),['fields'=>$fields,'settings'=>['form_title'=>$p['title']??'New Form','submit_text'=>$p['submit_text']??'Submit','notification_enable'=>1,'notification_email'=>'{admin_email}','notification_subject'=>'New Entry: {form_name}','notification_message'=>'{all_fields}','confirmation_type'=>'message','confirmation_message'=>wp_kses_post($p['confirmation']??'<p>Thanks! We\'ll be in touch.</p>')]]);
    return ignyous_ok(['id'=>$form,'shortcode'=>'[wpforms id="'.$form.'"]','message'=>'WPForms form created']);
}

function ignyous_wpf_form_single(WP_REST_Request $req) {
    if (!function_exists('wpforms')) return ignyous_plugin_missing('WPForms');
    $id   = intval($req->get_param('id'));
    $form = wpforms()->form->get($id, ['content_only'=>true]);
    if (!$form) return new WP_Error('not_found','Form not found',['status'=>404]);

    if ($req->get_method() === 'GET') return ignyous_ok(['form'=>$form]);

    $p = $req->get_json_params();
    if (!empty($p['title']))      $form['settings']['form_title'] = sanitize_text_field($p['title']);
    if (!empty($p['submit_text']))$form['settings']['submit_text'] = sanitize_text_field($p['submit_text']);
    if (!empty($p['fields']))     $form['fields'] = ignyous_wpf_build_fields($p['fields']);
    wpforms()->form->update($id,$form);
    return ignyous_ok(['message'=>'Form updated']);
}

function ignyous_wpf_entries(WP_REST_Request $req) {
    if (!function_exists('wpforms')) return ignyous_plugin_missing('WPForms');
    $form_id = intval($req->get_param('id'));
    $entries = wpforms()->entry->get_entries(['form_id'=>$form_id,'number'=>20]);
    $form    = wpforms()->form->get($form_id,['content_only'=>true]);
    $fields  = $form['fields'] ?? [];

    $out = array_map(function($e) use ($fields) {
        $data   = maybe_unserialize($e->fields);
        $pretty = [];
        foreach ((array)$data as $fid => $fdata) {
            $label = $fields[$fid]['label'] ?? "Field $fid";
            $pretty[$label] = $fdata['value'] ?? '';
        }
        return ['id'=>$e->entry_id,'date'=>$e->date,'ip'=>$e->ip_address,'data'=>$pretty];
    }, (array)$entries);
    return ignyous_ok(['entries'=>$out,'total'=>count($out),'form_title'=>$form['settings']['form_title']??'']);
}

function ignyous_wpf_build_fields(array $fields) {
    $out = [];
    $id  = 1;
    $type_map = ['text'=>'text','email'=>'email','phone'=>'phone','textarea'=>'textarea','select'=>'select','checkbox'=>'checkbox','radio'=>'radio','name'=>'name','address'=>'address','date'=>'date','number'=>'number'];
    foreach ($fields as $f) {
        $type = $type_map[$f['type']??'text'] ?? 'text';
        $field = ['id'=>$id,'type'=>$type,'label'=>sanitize_text_field($f['label']??'Field'),'required'=>!empty($f['required'])?'1':''];
        if (!empty($f['placeholder'])) $field['placeholder'] = $f['placeholder'];
        if (!empty($f['options'])) $field['choices'] = array_map(fn($o) => ['label'=>$o,'value'=>$o], $f['options']);
        $out[$id] = $field;
        $id++;
    }
    return $out;
}

function ignyous_plugin_missing($name) { return new WP_Error('plugin_missing', "$name is not installed or active", ['status'=>404]); }
function ignyous_ok($data) { return ['success'=>true,'data'=>$data]; }
