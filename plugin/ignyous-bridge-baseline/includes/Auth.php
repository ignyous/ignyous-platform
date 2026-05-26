<?php
namespace Ignyous\Baseline;

class Auth {
    /**
     * Permission callback for protected routes.
     * Accepts Bearer <key> in Authorization header, or ?api_key= for tests.
     */
    public static function check(\WP_REST_Request $req) {
        $stored = (string) get_option('ignyous_bl_api_key', '');
        if (!$stored) {
            return new \WP_Error('ignyous_not_set_up', 'API key not configured yet. Run /setup first.', ['status' => 503]);
        }
        $provided = self::extractKey($req);
        if (!$provided) {
            return new \WP_Error('ignyous_missing_key', 'Missing Authorization: Bearer <key>', ['status' => 401]);
        }
        if (!hash_equals($stored, $provided)) {
            return new \WP_Error('ignyous_bad_key', 'API key does not match.', ['status' => 403]);
        }
        return true;
    }

    public static function extractKey(\WP_REST_Request $req): string {
        $h = $req->get_header('authorization');
        if ($h && stripos($h, 'Bearer ') === 0) return trim(substr($h, 7));
        $q = $req->get_param('api_key');
        return $q ? (string) $q : '';
    }

    /** Read the change-id the platform sends with every write so snapshot + action log can be correlated. */
    public static function changeId(\WP_REST_Request $req): string {
        $cid = $req->get_header('x_ignyous_change_id') ?: $req->get_header('X-Ignyous-Change-Id');
        if ($cid) return preg_replace('/[^A-Za-z0-9_-]/', '', $cid);
        return wp_generate_uuid4();
    }

    public static function intentRaw(\WP_REST_Request $req): ?string {
        $h = $req->get_header('x_ignyous_intent') ?: $req->get_header('X-Ignyous-Intent');
        return $h ? (string) $h : null;
    }

    public static function aiTokens(\WP_REST_Request $req): ?int {
        $h = $req->get_header('x_ignyous_ai_tokens') ?: $req->get_header('X-Ignyous-Ai-Tokens');
        return $h !== null && $h !== '' ? (int) $h : null;
    }
}
