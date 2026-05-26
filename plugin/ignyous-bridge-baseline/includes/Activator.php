<?php
namespace Ignyous\Baseline;

class Activator {
    const DB_VERSION = '1';

    public static function activate(): void {
        global $wpdb;
        $charset = $wpdb->get_charset_collate();
        $snapshots = $wpdb->prefix . 'ignyous_snapshots';
        $actions   = $wpdb->prefix . 'ignyous_actions';

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        dbDelta("CREATE TABLE $snapshots (
            id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            change_id     VARCHAR(36)     NOT NULL,
            target_type   VARCHAR(40)     NOT NULL,
            target_key    VARCHAR(191)    NOT NULL,
            before_value  LONGTEXT        NULL,
            after_value   LONGTEXT        NULL,
            description   VARCHAR(255)    NULL,
            restored_at   DATETIME        NULL,
            created_at    DATETIME        NOT NULL,
            PRIMARY KEY  (id),
            KEY change_id (change_id),
            KEY target    (target_type, target_key)
        ) $charset;");

        dbDelta("CREATE TABLE $actions (
            id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            change_id       VARCHAR(36)     NOT NULL,
            intent_raw      TEXT            NULL,
            intent_parsed   LONGTEXT        NULL,
            capability      VARCHAR(80)     NULL,
            request         LONGTEXT        NULL,
            response        LONGTEXT        NULL,
            success         TINYINT(1)      NOT NULL DEFAULT 0,
            error           TEXT            NULL,
            duration_ms     INT             NULL,
            ai_tokens       INT             NULL,
            created_at      DATETIME        NOT NULL,
            PRIMARY KEY (id),
            KEY change_id (change_id)
        ) $charset;");

        // First-time setup token so the platform can claim this site without manual key entry
        if (!get_option('ignyous_bl_setup_token')) {
            update_option('ignyous_bl_setup_token', wp_generate_password(32, false, false));
        }
        if (!get_option('ignyous_bl_api_key')) {
            // Generated on first /setup call from the platform; left blank until then
            update_option('ignyous_bl_api_key', '');
        }
        update_option('ignyous_bl_db_version', self::DB_VERSION);
    }

    public static function deactivate(): void {
        // Intentionally leave tables — uninstall.php removes them
    }
}
