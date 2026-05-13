<?php
namespace Ignyous\Api;

/**
 * OptionsController — general-purpose DB scanner and updater.
 *
 * Endpoints:
 *   GET  /ignyous/v1/options/scan?query=<text>        — find where text is stored, with confidence
 *   POST /ignyous/v1/options/update                    — update a specific option field
 */
class OptionsController {
    public function register_routes() {
        register_rest_route('ignyous/v1', '/options/scan', [
            'methods'             => 'GET',
            'callback'            => [$this, 'scan_options'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route('ignyous/v1', '/options/update', [
            'methods'             => 'POST',
            'callback'            => [$this, 'update_option_field'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route('ignyous/v1', '/content/find', [
            'methods'             => 'GET',
            'callback'            => [$this, 'find_content'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route('ignyous/v1', '/content/replace', [
            'methods'             => 'POST',
            'callback'            => [$this, 'replace_content'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
    }

    /**
     * Scan wp_options for a query string.
     * Returns matches with: option_name, field_path, current_value, context, confidence (0–100).
     */
    public function scan_options($request) {
        global $wpdb;
        $query = sanitize_text_field($request->get_param('query') ?? '');
        if (strlen($query) < 2) {
            return new \WP_Error('query_too_short', 'query must be at least 2 characters', ['status' => 400]);
        }

        $like   = '%' . $wpdb->esc_like($query) . '%';
        $rows   = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT option_name, option_value FROM {$wpdb->options}
                 WHERE option_value LIKE %s
                   AND option_name NOT LIKE '\_%'
                   AND option_name NOT LIKE '%transient%'
                   AND option_name NOT LIKE '%session%'
                   AND option_name NOT LIKE '%_nonce%'
                 LIMIT 50",
                $like
            )
        );

        $results = [];
        foreach ($rows as $row) {
            $matches = $this->find_matches_in_value($row->option_name, $row->option_value, $query);
            foreach ($matches as $match) {
                $results[] = $match;
            }
        }

        // Also search post meta for common content areas
        $meta_rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT pm.meta_key, pm.meta_value, p.post_title, p.post_type, pm.post_id
                 FROM {$wpdb->postmeta} pm
                 JOIN {$wpdb->posts} p ON p.ID = pm.post_id
                 WHERE pm.meta_value LIKE %s
                   AND p.post_status = 'publish'
                 LIMIT 20",
                $like
            )
        );

        foreach ($meta_rows as $row) {
            $results[] = [
                'source'        => 'post_meta',
                'option_name'   => null,
                'post_id'       => (int) $row->post_id,
                'post_title'    => $row->post_title,
                'post_type'     => $row->post_type,
                'meta_key'      => $row->meta_key,
                'field_path'    => 'post_meta:' . $row->post_id . ':' . $row->meta_key,
                'current_value' => $this->extract_context($row->meta_value, $query),
                'confidence'    => $this->score_confidence($row->meta_key, $row->meta_value, $query, 'meta'),
                'update_method' => 'post_meta',
            ];
        }

        // Sort by confidence desc
        usort($results, fn($a, $b) => $b['confidence'] - $a['confidence']);

        return ['success' => true, 'query' => $query, 'count' => count($results), 'matches' => $results];
    }

    private function find_matches_in_value($option_name, $option_value, $query) {
        $matches = [];

        if (is_serialized($option_value)) {
            $data = @unserialize($option_value);
            if (is_array($data)) {
                $flat = $this->flatten_array($data);
                foreach ($flat as $path => $val) {
                    if (is_string($val) && stripos($val, $query) !== false) {
                        $confidence = $this->score_confidence($path, $val, $query, 'serialized_option');
                        $matches[] = [
                            'source'        => 'serialized_option',
                            'option_name'   => $option_name,
                            'field_path'    => $option_name . '.' . $path,
                            'array_key'     => $path,
                            'current_value' => $this->extract_context($val, $query),
                            'full_value'    => strlen($val) < 500 ? $val : substr($val, 0, 500) . '…',
                            'confidence'    => $confidence,
                            'update_method' => 'serialized_field',
                        ];
                    }
                }
                return $matches;
            }
        }

        // Plain string option
        if (stripos($option_value, $query) !== false) {
            $matches[] = [
                'source'        => 'option',
                'option_name'   => $option_name,
                'field_path'    => $option_name,
                'array_key'     => null,
                'current_value' => $this->extract_context($option_value, $query),
                'full_value'    => strlen($option_value) < 500 ? $option_value : substr($option_value, 0, 500) . '…',
                'confidence'    => $this->score_confidence($option_name, $option_value, $query, 'option'),
                'update_method' => 'option',
            ];
        }

        return $matches;
    }

    /** Flatten nested array to dot-notation paths */
    private function flatten_array($arr, $prefix = '', $depth = 0) {
        $flat = [];
        if ($depth > 6 || !is_array($arr)) return $flat;
        foreach ($arr as $k => $v) {
            $key = $prefix ? $prefix . '.' . $k : (string) $k;
            if (is_array($v)) {
                $flat = array_merge($flat, $this->flatten_array($v, $key, $depth + 1));
            } elseif (is_string($v) || is_numeric($v)) {
                $flat[$key] = (string) $v;
            }
        }
        return $flat;
    }

    /** Extract context snippet (50 chars before/after the match) */
    private function extract_context($val, $query) {
        $pos = stripos($val, $query);
        if ($pos === false) return substr($val, 0, 120);
        $start  = max(0, $pos - 40);
        $end    = min(strlen($val), $pos + strlen($query) + 40);
        $snip   = substr($val, $start, $end - $start);
        return ($start > 0 ? '…' : '') . $snip . ($end < strlen($val) ? '…' : '');
    }

    /** Score confidence that this match is the canonical place to update */
    private function score_confidence($key, $value, $query, $source) {
        $score = 50; // base

        // High-confidence keys for content types
        $high_keys = ['phone', 'email', 'address', 'logo', 'site_name', 'blogname', 'tagline',
                      'footer_text', 'footer_text1', 'copyright', 'contact'];
        foreach ($high_keys as $hk) {
            if (stripos((string) $key, $hk) !== false) { $score += 30; break; }
        }

        // Prefer shorter, direct values (more likely the canonical source)
        if (strlen($value) < 200) $score += 15;
        if (strlen($value) < 50)  $score += 10;

        // Prefer plain options over serialized
        if ($source === 'option')    $score += 10;
        if ($source === 'meta')      $score -= 5;

        // Penalise transient/cache options
        if (stripos((string) $key, 'cache') !== false) $score -= 30;
        if (stripos((string) $key, 'log')   !== false) $score -= 10;

        return min(100, max(0, $score));
    }

    /**
     * Update a specific field identified by the scan endpoint.
     * Body: { field_path, new_value, update_method, option_name?, array_key?, post_id?, meta_key? }
     */
    public function update_option_field($request) {
        $body          = $request->get_json_params();
        $update_method = $body['update_method'] ?? '';
        $new_value     = $body['new_value']     ?? '';
        $field_path    = $body['field_path']    ?? '';

        switch ($update_method) {
            case 'option':
                $name = $body['option_name'] ?? '';
                if (!$name) return new \WP_Error('missing', 'option_name required', ['status' => 400]);
                $old = get_option($name);
                update_option($name, $new_value);
                return ['success' => true, 'updated' => $name, 'old' => $old, 'new' => $new_value];

            case 'serialized_field':
                $name     = $body['option_name'] ?? '';
                $arr_key  = $body['array_key']   ?? '';
                if (!$name || !$arr_key) return new \WP_Error('missing', 'option_name and array_key required', ['status' => 400]);
                $raw  = get_option($name);
                if (!is_serialized($raw)) return new \WP_Error('not_serialized', 'Option is not serialized', ['status' => 400]);
                $data = @unserialize($raw);
                if (!is_array($data)) return new \WP_Error('parse_error', 'Could not parse serialized data', ['status' => 400]);
                $old = $this->get_nested($data, $arr_key);
                $this->set_nested($data, $arr_key, $new_value);
                update_option($name, $data);
                return ['success' => true, 'updated' => $field_path, 'old' => $old, 'new' => $new_value];

            case 'post_meta':
                $post_id  = (int) ($body['post_id']  ?? 0);
                $meta_key = $body['meta_key'] ?? '';
                if (!$post_id || !$meta_key) return new \WP_Error('missing', 'post_id and meta_key required', ['status' => 400]);
                $old = get_post_meta($post_id, $meta_key, true);
                update_post_meta($post_id, $meta_key, $new_value);
                return ['success' => true, 'updated' => $field_path, 'old' => $old, 'new' => $new_value];

            default:
                return new \WP_Error('unknown_method', 'Unknown update_method: ' . $update_method, ['status' => 400]);
        }
    }

    /** Get value from nested array using dot-notation path */
    private function get_nested($arr, $path) {
        $keys = explode('.', $path);
        $cur  = $arr;
        foreach ($keys as $k) {
            if (!is_array($cur) || !array_key_exists($k, $cur)) return null;
            $cur = $cur[$k];
        }
        return $cur;
    }

    /** Set value in nested array using dot-notation path */
    private function set_nested(&$arr, $path, $value) {
        $keys = explode('.', $path);
        $cur  = &$arr;
        foreach ($keys as $k) {
            if (!is_array($cur)) $cur = [];
            if (!array_key_exists($k, $cur)) $cur[$k] = [];
            $cur = &$cur[$k];
        }
        $cur = $value;
    }

    /**
     * Find content in posts, pages, and meta (for phone numbers, emails, addresses, etc.)
     * Confidence-scored so AI can decide what to update.
     */
    public function find_content($request) {
        global $wpdb;
        $query = sanitize_text_field($request->get_param('query') ?? '');
        if (strlen($query) < 2) return new \WP_Error('too_short', 'query too short', ['status' => 400]);

        $like    = '%' . $wpdb->esc_like($query) . '%';
        $results = [];

        // Search post content
        $posts = $wpdb->get_results($wpdb->prepare(
            "SELECT ID, post_title, post_type, post_status, post_content
             FROM {$wpdb->posts}
             WHERE post_content LIKE %s AND post_status IN ('publish','draft') LIMIT 20",
            $like
        ));
        foreach ($posts as $p) {
            $results[] = [
                'source'       => 'post_content',
                'post_id'      => (int) $p->ID,
                'post_title'   => $p->post_title,
                'post_type'    => $p->post_type,
                'post_status'  => $p->post_status,
                'context'      => $this->extract_context($p->post_content, $query),
                'update_url'   => admin_url("post.php?post={$p->ID}&action=edit"),
                'confidence'   => 80,
                'update_method' => 'post_content',
            ];
        }

        return ['success' => true, 'query' => $query, 'count' => count($results), 'matches' => $results];
    }

    /**
     * Replace content across posts, pages, and options.
     * Body: { find, replace, scope: 'all'|'posts'|'options' }
     */
    public function replace_content($request) {
        global $wpdb;
        $body    = $request->get_json_params();
        $find    = $body['find']    ?? '';
        $replace = $body['replace'] ?? '';
        $scope   = $body['scope']   ?? 'all';

        if (strlen($find) < 2) return new \WP_Error('too_short', 'find must be at least 2 chars', ['status' => 400]);

        $updated = [];

        if (in_array($scope, ['all', 'posts'])) {
            // Update post content
            $posts = $wpdb->get_results($wpdb->prepare(
                "SELECT ID, post_content FROM {$wpdb->posts}
                 WHERE post_content LIKE %s AND post_status IN ('publish','draft') LIMIT 100",
                '%' . $wpdb->esc_like($find) . '%'
            ));
            foreach ($posts as $p) {
                $new_content = str_ireplace($find, $replace, $p->post_content);
                $wpdb->update($wpdb->posts, ['post_content' => $new_content], ['ID' => $p->ID]);
                $updated[] = ['type' => 'post', 'id' => $p->ID];
            }
        }

        return [
            'success'       => true,
            'find'          => $find,
            'replace'       => $replace,
            'updated_count' => count($updated),
            'updated'       => $updated,
        ];
    }

    public function check_permission() {
        $stored = get_option('ignyous_bridge_api_key', '');
        if (empty($stored)) return false;
        $auth = '';
        if (function_exists('getallheaders')) {
            foreach (getallheaders() as $k => $v) { if (strtolower($k) === 'authorization') { $auth = $v; break; } }
        }
        if (empty($auth)) $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        // Also check X-Ignyous-Key
        $xkey = '';
        if (function_exists('getallheaders')) {
            foreach (getallheaders() as $k => $v) { if (strtolower($k) === 'x-ignyous-key') { $xkey = $v; break; } }
        }
        if (empty($xkey)) $xkey = $_SERVER['HTTP_X_IGNYOUS_KEY'] ?? '';
        if (!empty($xkey) && hash_equals($stored, trim($xkey))) return true;
        if (preg_match('/Bearer\s+(.+)/i', $auth, $m)) return hash_equals($stored, trim($m[1]));
        return false;
    }
}
