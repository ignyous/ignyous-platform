<?php
if (!defined('WP_UNINSTALL_PLUGIN')) exit;

global $wpdb;
$wpdb->query("DROP TABLE IF EXISTS {$wpdb->prefix}ignyous_snapshots");
$wpdb->query("DROP TABLE IF EXISTS {$wpdb->prefix}ignyous_actions");

delete_option('ignyous_bl_api_key');
delete_option('ignyous_bl_setup_token');
delete_option('ignyous_bl_db_version');
