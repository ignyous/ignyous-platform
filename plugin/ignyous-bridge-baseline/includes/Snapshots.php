<?php
namespace Ignyous\Baseline;

/**
 * One snapshot row per atomic change. before_value is captured BEFORE the write,
 * after_value AFTER. Restore writes before_value back and marks restored_at.
 */
class Snapshots {

    public static function table(): string {
        global $wpdb;
        return $wpdb->prefix . 'ignyous_snapshots';
    }

    /**
     * Open a snapshot — write the BEFORE value, return the snapshot id.
     * Pass the change_id from the request so all related snapshots cluster.
     */
    public static function open(string $changeId, string $targetType, string $targetKey, $beforeValue, ?string $description = null): int {
        global $wpdb;
        $wpdb->insert(self::table(), [
            'change_id'   => $changeId,
            'target_type' => $targetType,
            'target_key'  => $targetKey,
            'before_value'=> is_string($beforeValue) ? $beforeValue : wp_json_encode($beforeValue),
            'description' => $description ? mb_substr($description, 0, 255) : null,
            'created_at'  => current_time('mysql', 1),
        ]);
        return (int) $wpdb->insert_id;
    }

    /** Close a snapshot with the AFTER value once the write succeeds. */
    public static function close(int $id, $afterValue): void {
        global $wpdb;
        $wpdb->update(self::table(), [
            'after_value' => is_string($afterValue) ? $afterValue : wp_json_encode($afterValue),
        ], ['id' => $id]);
    }

    public static function get(int $id): ?array {
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . self::table() . ' WHERE id = %d', $id), ARRAY_A);
        return $row ?: null;
    }

    public static function list(int $limit = 50, ?string $changeId = null): array {
        global $wpdb;
        $limit = max(1, min(200, $limit));
        if ($changeId) {
            return $wpdb->get_results(
                $wpdb->prepare('SELECT * FROM ' . self::table() . ' WHERE change_id = %s ORDER BY id DESC LIMIT %d', $changeId, $limit),
                ARRAY_A
            ) ?: [];
        }
        return $wpdb->get_results(
            $wpdb->prepare('SELECT * FROM ' . self::table() . ' ORDER BY id DESC LIMIT %d', $limit),
            ARRAY_A
        ) ?: [];
    }

    public static function markRestored(int $id): void {
        global $wpdb;
        $wpdb->update(self::table(), ['restored_at' => current_time('mysql', 1)], ['id' => $id]);
    }
}
