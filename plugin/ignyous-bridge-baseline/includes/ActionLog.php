<?php
namespace Ignyous\Baseline;

class ActionLog {

    public static function table(): string {
        global $wpdb;
        return $wpdb->prefix . 'ignyous_actions';
    }

    public static function record(array $row): int {
        global $wpdb;
        $defaults = [
            'change_id'     => '',
            'intent_raw'    => null,
            'intent_parsed' => null,
            'capability'    => null,
            'request'       => null,
            'response'      => null,
            'success'       => 0,
            'error'         => null,
            'duration_ms'   => null,
            'ai_tokens'     => null,
            'created_at'    => current_time('mysql', 1),
        ];
        $row = array_merge($defaults, $row);
        foreach (['intent_parsed', 'request', 'response'] as $k) {
            if (is_array($row[$k]) || is_object($row[$k])) $row[$k] = wp_json_encode($row[$k]);
        }
        $wpdb->insert(self::table(), $row);
        return (int) $wpdb->insert_id;
    }

    public static function list(int $limit = 50): array {
        global $wpdb;
        $limit = max(1, min(500, $limit));
        return $wpdb->get_results(
            $wpdb->prepare('SELECT * FROM ' . self::table() . ' ORDER BY id DESC LIMIT %d', $limit),
            ARRAY_A
        ) ?: [];
    }
}
