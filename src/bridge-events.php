<?php
/**
 * ignyous Bridge — Events Calendar Plugins
 * Supports: The Events Calendar, Events Manager, MEC, Amelia, Simply Schedule
 */

add_action('rest_api_init', function() {
    $p = 'ignyous_check_permission';
    register_rest_route('ignyous/v1', '/events',             ['methods'=>['GET','POST'],        'callback'=>'ignyous_events_handler',       'permission_callback'=>$p]);
    register_rest_route('ignyous/v1', '/events/(?P<id>\d+)',['methods'=>['GET','PATCH','DELETE'],'callback'=>'ignyous_event_single',        'permission_callback'=>$p]);
    register_rest_route('ignyous/v1', '/events/upcoming',    ['methods'=>'GET',                 'callback'=>'ignyous_events_upcoming',      'permission_callback'=>$p]);
    register_rest_route('ignyous/v1', '/events/plugin',      ['methods'=>'GET',                 'callback'=>'ignyous_events_detect_plugin', 'permission_callback'=>$p]);
    register_rest_route('ignyous/v1', '/bookings',           ['methods'=>'GET',                 'callback'=>'ignyous_bookings_handler',     'permission_callback'=>$p]);
    register_rest_route('ignyous/v1', '/bookings/services',  ['methods'=>'GET',                 'callback'=>'ignyous_booking_services',     'permission_callback'=>$p]);
});

// ── Detect which events plugin is active ──────────────────────
function ignyous_detect_events_plugin() {
    if (class_exists('Tribe__Events__Main'))       return 'the-events-calendar';
    if (class_exists('EM_Events'))                 return 'events-manager';
    if (class_exists('MEC_feature_event'))         return 'modern-events-calendar';
    if (class_exists('Ai1ec_App'))                 return 'all-in-one-event-calendar';
    if (defined('EVENTIN_VERSION'))                return 'eventin';
    return 'none';
}

// ══════════════════════════════════════════════════════════════
// UNIFIED EVENTS HANDLER
// ══════════════════════════════════════════════════════════════

function ignyous_events_handler(WP_REST_Request $req) {
    $plugin = ignyous_detect_events_plugin();

    if ($req->get_method() === 'GET') {
        $args = [
            'per_page' => intval($req->get_param('per_page') ?: 20),
            'status'   => $req->get_param('status') ?: 'upcoming',
        ];
        return ignyous_ok(['events' => ignyous_get_events($plugin, $args), 'plugin' => $plugin]);
    }

    // POST — create event
    $p = $req->get_json_params();
    return ignyous_create_event($plugin, $p);
}

function ignyous_event_single(WP_REST_Request $req) {
    $id     = intval($req->get_param('id'));
    $plugin = ignyous_detect_events_plugin();

    if ($req->get_method() === 'GET') {
        return ignyous_ok(['event' => ignyous_get_event($plugin, $id)]);
    }
    if ($req->get_method() === 'PATCH') {
        return ignyous_update_event($plugin, $id, $req->get_json_params());
    }
    if ($req->get_method() === 'DELETE') {
        wp_delete_post($id, true);
        return ignyous_ok(['message' => "Event $id deleted"]);
    }
}

function ignyous_events_upcoming() {
    $plugin = ignyous_detect_events_plugin();
    $events = ignyous_get_events($plugin, ['per_page' => 10, 'status' => 'upcoming']);
    return ignyous_ok(['events' => $events, 'plugin' => $plugin, 'count' => count($events)]);
}

function ignyous_events_detect_plugin() {
    $plugin = ignyous_detect_events_plugin();
    $info   = ['plugin' => $plugin, 'installed' => $plugin !== 'none'];
    if ($plugin === 'the-events-calendar') {
        $info['version'] = Tribe__Events__Main::VERSION;
        $info['event_count'] = wp_count_posts('tribe_events')->publish;
    }
    return ignyous_ok($info);
}

// ══════════════════════════════════════════════════════════════
// THE EVENTS CALENDAR (Tribe)
// ══════════════════════════════════════════════════════════════

function ignyous_tribe_get_events($args) {
    $query_args = [
        'post_type'      => 'tribe_events',
        'posts_per_page' => $args['per_page'] ?? 20,
        'post_status'    => 'publish',
        'orderby'        => 'meta_value',
        'meta_key'       => '_EventStartDate',
        'order'          => 'ASC',
    ];
    if (($args['status'] ?? '') === 'upcoming') {
        $query_args['meta_query'] = [['key'=>'_EventStartDate','value'=>current_time('mysql'),'compare'=>'>=','type'=>'DATETIME']];
    }
    $posts = get_posts($query_args);
    return array_map(function($p) {
        return [
            'id'          => $p->ID,
            'title'       => $p->post_title,
            'description' => wp_strip_all_tags($p->post_content),
            'start'       => get_post_meta($p->ID,'_EventStartDate',true),
            'end'         => get_post_meta($p->ID,'_EventEndDate',true),
            'all_day'     => (bool)get_post_meta($p->ID,'_EventAllDay',true),
            'venue'       => ignyous_tribe_get_venue($p->ID),
            'url'         => get_post_meta($p->ID,'_EventURL',true),
            'permalink'   => get_permalink($p->ID),
            'image'       => get_the_post_thumbnail_url($p->ID,'medium'),
            'cost'        => get_post_meta($p->ID,'_EventCost',true),
            'categories'  => wp_get_post_terms($p->ID,'tribe_events_cat',['fields'=>'names']),
        ];
    }, $posts);
}

function ignyous_tribe_get_venue($event_id) {
    $venue_id = get_post_meta($event_id,'_EventVenueID',true);
    if (!$venue_id) return null;
    return ['name'=>get_the_title($venue_id),'address'=>get_post_meta($venue_id,'_VenueAddress',true),'city'=>get_post_meta($venue_id,'_VenueCity',true),'state'=>get_post_meta($venue_id,'_VenueStateProvince',true)];
}

function ignyous_tribe_create_event($p) {
    $event_id = wp_insert_post([
        'post_title'   => sanitize_text_field($p['title'] ?? 'New Event'),
        'post_content' => wp_kses_post($p['description'] ?? ''),
        'post_status'  => 'publish',
        'post_type'    => 'tribe_events',
    ]);
    if (is_wp_error($event_id)) return new WP_Error('event_error',$event_id->get_error_message(),['status'=>500]);

    $start = $p['start_date'] ?? (date('Y-m-d').' '.($p['start_time']??'09:00:00'));
    $end   = $p['end_date']   ?? (date('Y-m-d').' '.($p['end_time']  ??'17:00:00'));

    update_post_meta($event_id,'_EventStartDate',$start);
    update_post_meta($event_id,'_EventEndDate',$end);
    update_post_meta($event_id,'_EventStartDateUTC',get_gmt_from_date($start));
    update_post_meta($event_id,'_EventEndDateUTC',get_gmt_from_date($end));
    update_post_meta($event_id,'_EventTimezone',get_option('timezone_string'));
    if (!empty($p['cost']))    update_post_meta($event_id,'_EventCost',sanitize_text_field($p['cost']));
    if (!empty($p['url']))     update_post_meta($event_id,'_EventURL',esc_url($p['url']));
    if (!empty($p['all_day'])) update_post_meta($event_id,'_EventAllDay',1);

    // Set venue if provided
    if (!empty($p['venue'])) {
        $venue_id = wp_insert_post(['post_title'=>sanitize_text_field($p['venue']),'post_type'=>'tribe_venue','post_status'=>'publish']);
        if (!is_wp_error($venue_id)) {
            if (!empty($p['address'])) update_post_meta($venue_id,'_VenueAddress',sanitize_text_field($p['address']));
            if (!empty($p['city']))    update_post_meta($venue_id,'_VenueCity',sanitize_text_field($p['city']));
            update_post_meta($event_id,'_EventVenueID',$venue_id);
        }
    }

    // Categories
    if (!empty($p['categories'])) {
        $terms = array_map('sanitize_text_field',(array)$p['categories']);
        wp_set_object_terms($event_id,$terms,'tribe_events_cat',false);
    }

    // Featured image
    if (!empty($p['image_url'])) ignyous_set_featured_image_from_url($event_id,$p['image_url']);

    return ignyous_ok(['id'=>$event_id,'title'=>get_the_title($event_id),'permalink'=>get_permalink($event_id),'start'=>$start,'end'=>$end,'message'=>'Event created']);
}

function ignyous_tribe_update_event($id,$p) {
    $update = ['ID'=>$id];
    if (!empty($p['title']))       $update['post_title']   = sanitize_text_field($p['title']);
    if (!empty($p['description'])) $update['post_content'] = wp_kses_post($p['description']);
    if (!empty($p['status']))      $update['post_status']  = $p['status'];
    wp_update_post($update);
    if (!empty($p['start_date'])) update_post_meta($id,'_EventStartDate',$p['start_date']);
    if (!empty($p['end_date']))   update_post_meta($id,'_EventEndDate',$p['end_date']);
    if (!empty($p['cost']))       update_post_meta($id,'_EventCost',sanitize_text_field($p['cost']));
    if (!empty($p['url']))        update_post_meta($id,'_EventURL',esc_url($p['url']));
    return ignyous_ok(['message'=>'Event updated','id'=>$id]);
}

// ══════════════════════════════════════════════════════════════
// EVENTS MANAGER
// ══════════════════════════════════════════════════════════════

function ignyous_em_get_events($args) {
    if (!class_exists('EM_Events')) return [];
    $events = EM_Events::get(['limit'=>$args['per_page']??20,'scope'=>($args['status']??'')!=='all'?'future':'all','status'=>1]);
    return array_map(fn($e) => [
        'id'=>$e->event_id,'title'=>$e->event_name,'description'=>wp_strip_all_tags($e->event_content??''),
        'start'=>$e->event_start_date.' '.($e->event_start_time??''),'end'=>$e->event_end_date.' '.($e->event_end_time??''),
        'location'=>$e->get_location()?->location_name,'permalink'=>$e->get_permalink(),
        'spaces'=>$e->event_spaces,'bookings'=>$e->get_bookings_count()??0,
    ], (array)$events);
}

function ignyous_em_create_event($p) {
    if (!class_exists('EM_Event')) return ignyous_plugin_missing('Events Manager');
    $event = new EM_Event();
    $event->event_name         = sanitize_text_field($p['title']??'New Event');
    $event->post_content       = wp_kses_post($p['description']??'');
    $event->event_start_date   = $p['start_date']??date('Y-m-d');
    $event->event_end_date     = $p['end_date']??date('Y-m-d');
    $event->event_start_time   = $p['start_time']??'09:00:00';
    $event->event_end_time     = $p['end_time']??'17:00:00';
    $event->event_spaces       = intval($p['spaces']??100);
    $event->event_rsvp         = !empty($p['rsvp'])?1:0;
    $saved = $event->save();
    if (!$saved) return new WP_Error('em_error','Could not save event',['status'=>500]);
    return ignyous_ok(['id'=>$event->event_id,'title'=>$event->event_name,'permalink'=>$event->get_permalink(),'message'=>'Event created']);
}

// ══════════════════════════════════════════════════════════════
// MEC (Modern Events Calendar)
// ══════════════════════════════════════════════════════════════

function ignyous_mec_get_events($args) {
    $posts = get_posts(['post_type'=>'mec-events','posts_per_page'=>$args['per_page']??20,'post_status'=>'publish','orderby'=>'date','order'=>'ASC']);
    return array_map(fn($p) => [
        'id'=>$p->ID,'title'=>$p->post_title,
        'start'=>get_post_meta($p->ID,'mec_start_date',true),'end'=>get_post_meta($p->ID,'mec_end_date',true),
        'permalink'=>get_permalink($p->ID),'image'=>get_the_post_thumbnail_url($p->ID,'medium'),
    ], $posts);
}

function ignyous_mec_create_event($p) {
    $id = wp_insert_post(['post_title'=>sanitize_text_field($p['title']??'New Event'),'post_content'=>wp_kses_post($p['description']??''),'post_type'=>'mec-events','post_status'=>'publish']);
    if (!is_wp_error($id)) {
        update_post_meta($id,'mec_start_date',$p['start_date']??date('Y-m-d'));
        update_post_meta($id,'mec_end_date',$p['end_date']??date('Y-m-d'));
        update_post_meta($id,'mec_start_time_hour',$p['start_hour']??'9');
        update_post_meta($id,'mec_end_time_hour',$p['end_hour']??'17');
    }
    return ignyous_ok(['id'=>$id,'message'=>'MEC event created']);
}

// ══════════════════════════════════════════════════════════════
// UNIFIED DISPATCHER
// ══════════════════════════════════════════════════════════════

function ignyous_get_events($plugin,$args) {
    switch ($plugin) {
        case 'the-events-calendar': return ignyous_tribe_get_events($args);
        case 'events-manager':      return ignyous_em_get_events($args);
        case 'modern-events-calendar': return ignyous_mec_get_events($args);
        default:
            // Generic WP fallback — look for any events post type
            foreach (['tribe_events','em_events','mec-events','events'] as $pt) {
                if (post_type_exists($pt)) {
                    $posts = get_posts(['post_type'=>$pt,'posts_per_page'=>$args['per_page']??20,'post_status'=>'publish']);
                    return array_map(fn($p) => ['id'=>$p->ID,'title'=>$p->post_title,'permalink'=>get_permalink($p->ID)], $posts);
                }
            }
            return [];
    }
}

function ignyous_create_event($plugin,$p) {
    switch ($plugin) {
        case 'the-events-calendar':    return ignyous_tribe_create_event($p);
        case 'events-manager':         return ignyous_em_create_event($p);
        case 'modern-events-calendar': return ignyous_mec_create_event($p);
        default: return new WP_Error('no_events_plugin','No supported events plugin found',['status'=>404]);
    }
}

function ignyous_get_event($plugin,$id) {
    $post = get_post($id);
    if (!$post) return null;
    $base = ['id'=>$id,'title'=>$post->post_title,'description'=>wp_strip_all_tags($post->post_content),'permalink'=>get_permalink($id)];
    if ($plugin === 'the-events-calendar') {
        $base['start'] = get_post_meta($id,'_EventStartDate',true);
        $base['end']   = get_post_meta($id,'_EventEndDate',true);
        $base['venue'] = ignyous_tribe_get_venue($id);
        $base['cost']  = get_post_meta($id,'_EventCost',true);
    }
    return $base;
}

function ignyous_update_event($plugin,$id,$p) {
    if ($plugin === 'the-events-calendar') return ignyous_tribe_update_event($id,$p);
    // Generic update for other plugins
    $update = ['ID'=>$id];
    if (!empty($p['title']))       $update['post_title']   = sanitize_text_field($p['title']);
    if (!empty($p['description'])) $update['post_content'] = wp_kses_post($p['description']);
    wp_update_post($update);
    return ignyous_ok(['message'=>'Event updated']);
}

// ══════════════════════════════════════════════════════════════
// BOOKINGS (Amelia, Simply Schedule)
// ══════════════════════════════════════════════════════════════

function ignyous_bookings_handler() {
    if (!defined('AMELIA_VERSION')) return ignyous_ok(['bookings'=>[],'note'=>'Amelia not installed']);
    global $wpdb;
    $table    = $wpdb->prefix.'amelia_appointments';
    $bookings = $wpdb->get_results("SELECT id,serviceId,providerId,bookingStart,bookingEnd,status FROM $table ORDER BY bookingStart DESC LIMIT 20");
    return ignyous_ok(['bookings'=>$bookings,'total'=>$wpdb->get_var("SELECT COUNT(*) FROM $table")]);
}

function ignyous_booking_services() {
    if (!defined('AMELIA_VERSION')) return ignyous_ok(['services'=>[]]);
    global $wpdb;
    $services = $wpdb->get_results("SELECT id,name,price,duration,minCapacity,maxCapacity,status FROM {$wpdb->prefix}amelia_services WHERE status='visible'");
    return ignyous_ok(['services'=>$services]);
}

// ── Helper: set featured image from URL ──────────────────────
function ignyous_set_featured_image_from_url($post_id,$url) {
    $tmp  = download_url($url);
    if (is_wp_error($tmp)) return;
    $file = ['name'=>basename($url),'tmp_name'=>$tmp];
    $id   = media_handle_sideload($file,$post_id);
    if (!is_wp_error($id)) set_post_thumbnail($post_id,$id);
    @unlink($tmp);
}
