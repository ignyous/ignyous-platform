<?php
namespace Ignyous\Api;

/**
 * CacheController — discovers and purges all installed cache plugins.
 *
 * On first run, scans the site's plugins to find cache-clearing methods,
 * saves them to wp_options as 'ignyous_cache_methods' for instant use next time.
 *
 * Supports out-of-the-box:
 *   SiteGround Speed Optimizer, W3 Total Cache, WP Super Cache,
 *   WP Rocket, LiteSpeed Cache, Cloudflare, Autoptimize, Cache Enabler
 *
 * Auto-discovers any unknown cache plugin by scanning its PHP files.
 */
class CacheController {
    const METHODS_OPTION = 'ignyous_cache_methods';
    const DISCOVERED_AT  = 'ignyous_cache_discovered_at';

    public function register_routes() {
        register_rest_route('ignyous/v1', '/cache/purge', [
            'methods'             => 'POST',
            'callback'            => [$this, 'purge'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        register_rest_route('ignyous/v1', '/cache/discover', [
            'methods'             => 'POST',
            'callback'            => [$this, 'discover_and_save'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
    }

    // ── Purge ─────────────────────────────────────────────────────────────
    public function purge($request) {
        $log     = [];
        $purged  = [];
        $failed  = [];

        // Load saved discovery data (or run discovery now if stale/missing)
        $saved_at = get_option(self::DISCOVERED_AT, 0);
        $stale    = (time() - (int) $saved_at) > 7 * DAY_IN_SECONDS;
        if ($stale || !get_option(self::METHODS_OPTION)) {
            $log[] = 'Cache methods stale or missing — running discovery first…';
            $this->run_discovery($log);
        }

        $methods = get_option(self::METHODS_OPTION, []);
        $log[]   = 'Loaded ' . count($methods) . ' cache method(s): ' . implode(', ', array_column($methods, 'label'));

        foreach ($methods as $method) {
            $result = $this->call_method($method, $log);
            if ($result) $purged[] = $method['label'];
            else          $failed[] = $method['label'];
        }

        // Always flush WordPress object cache
        wp_cache_flush();
        $log[] = 'wp_cache_flush() called';

        // Always delete transients older than 0 seconds
        global $wpdb;
        $wpdb->query("DELETE FROM {$wpdb->options} WHERE option_name LIKE '%_transient_%' AND option_value < " . time());
        $log[] = 'Expired transients deleted';

        return [
            'success' => true,
            'purged'  => $purged,
            'failed'  => $failed,
            'log'     => $log,
            'message' => empty($purged)
                ? 'Object cache flushed. No additional cache plugins found.'
                : 'Purged: ' . implode(', ', $purged),
        ];
    }

    // ── Discovery ─────────────────────────────────────────────────────────
    public function discover_and_save($request) {
        $log = [];
        $methods = $this->run_discovery($log);
        return ['success' => true, 'methods_found' => count($methods), 'methods' => $methods, 'log' => $log];
    }

    private function run_discovery(&$log) {
        $log[]   = 'Starting cache plugin discovery…';
        $methods = [];

        // ── 1. Known plugins — check by exact function/class existence ───────
        $known = [
            // SiteGround Speed Optimizer (sg-cachepress)
            [
                'label'  => 'SiteGround Speed Optimizer',
                'slug'   => 'sg-cachepress',
                'checks' => [
                    ['type' => 'static_method', 'class' => 'SiteGround_Speed_Optimizer\\Supercacher\\Supercacher', 'method' => 'purge_cache'],
                    ['type' => 'static_method', 'class' => 'SiteGround_Speed_Optimizer\\Supercacher\\Supercacher', 'method' => 'flush_cache'],
                    ['type' => 'static_method', 'class' => 'SG_CachePress_Supercacher', 'method' => 'purge_cache'],     // older
                    ['type' => 'action',         'hook'  => 'sg_cachepress_purge_cache'],
                    ['type' => 'function',       'func'  => 'sg_cachepress_purge_cache'],
                ],
            ],
            // SiteGround Optimizer (newer branding)
            [
                'label'  => 'SiteGround Optimizer',
                'slug'   => 'sg-cachepress',
                'checks' => [
                    ['type' => 'static_method', 'class' => 'SiteGround_Speed_Optimizer\\Supercacher\\Supercacher', 'method' => 'purge_cache'],
                ],
            ],
            // W3 Total Cache
            [
                'label'  => 'W3 Total Cache',
                'slug'   => 'w3-total-cache',
                'checks' => [
                    ['type' => 'function', 'func' => 'w3tc_flush_all'],
                    ['type' => 'function', 'func' => 'w3tc_pgcache_flush'],
                ],
            ],
            // WP Super Cache
            [
                'label'  => 'WP Super Cache',
                'slug'   => 'wp-super-cache',
                'checks' => [
                    ['type' => 'function', 'func' => 'wp_cache_clear_cache'],
                    ['type' => 'function', 'func' => 'prune_super_cache'],
                ],
            ],
            // WP Rocket
            [
                'label'  => 'WP Rocket',
                'slug'   => 'wp-rocket',
                'checks' => [
                    ['type' => 'function', 'func' => 'rocket_clean_domain'],
                    ['type' => 'function', 'func' => 'rocket_clean_files'],
                ],
            ],
            // LiteSpeed Cache
            [
                'label'  => 'LiteSpeed Cache',
                'slug'   => 'litespeed-cache',
                'checks' => [
                    ['type' => 'static_method', 'class' => 'LiteSpeed_Cache_API', 'method' => 'purge_all'],
                    ['type' => 'static_method', 'class' => 'LiteSpeed\\Core',      'method' => 'purge_all'],
                    ['type' => 'action',         'hook'  => 'litespeed_purge_all'],
                    ['type' => 'function',       'func'  => 'litespeed_purge_all'],
                ],
            ],
            // Autoptimize
            [
                'label'  => 'Autoptimize',
                'slug'   => 'autoptimize',
                'checks' => [
                    ['type' => 'static_method', 'class' => 'autoptimizeCache', 'method' => 'clearall'],
                    ['type' => 'action',         'hook'  => 'autoptimize_action_cachepurged'],
                ],
            ],
            // Cache Enabler
            [
                'label'  => 'Cache Enabler',
                'slug'   => 'cache-enabler',
                'checks' => [
                    ['type' => 'static_method', 'class' => 'Cache_Enabler', 'method' => 'clear_total_cache'],
                    ['type' => 'action',         'hook'  => 'ce_clear_cache'],
                ],
            ],
        ];

        foreach ($known as $plugin) {
            $is_active = is_plugin_active($plugin['slug'] . '/' . $plugin['slug'] . '.php')
                      || $this->is_any_plugin_active_by_slug($plugin['slug']);

            if (!$is_active) {
                $log[] = "  [{$plugin['label']}] not active, skipping";
                continue;
            }

            $log[] = "  [{$plugin['label']}] ACTIVE — testing methods…";
            $working = $this->find_working_method($plugin['checks'], $log);
            if ($working) {
                $working['label'] = $plugin['label'];
                $methods[] = $working;
                $log[] = "    ✅ Found working method: " . json_encode($working);
            } else {
                $log[] = "    ⚠️ Active but no known method worked — will try file scan";
                $scanned = $this->scan_plugin_files($plugin['slug'], $log);
                if ($scanned) {
                    $scanned['label'] = $plugin['label'];
                    $methods[] = $scanned;
                }
            }
        }

        // ── 2. Auto-discover unknown cache plugins ────────────────────────
        $log[] = '';
        $log[] = 'Scanning for unknown cache plugins…';
        $active_plugins = get_option('active_plugins', []);
        $known_slugs    = array_column($known, 'slug');

        foreach ($active_plugins as $plugin_file) {
            $slug = explode('/', $plugin_file)[0];
            if (in_array($slug, $known_slugs)) continue;
            if (!preg_match('/cache|speed|optim|minif|rocket|accelerat/i', $slug)) continue;

            $log[] = "  [unknown:{$slug}] Looks like a cache plugin — scanning files…";
            $scanned = $this->scan_plugin_files($slug, $log);
            if ($scanned) {
                $scanned['label'] = $slug;
                $methods[] = $scanned;
            }
        }

        // ── Save to DB ────────────────────────────────────────────────────
        update_option(self::METHODS_OPTION, $methods);
        update_option(self::DISCOVERED_AT, time());
        $log[] = '';
        $log[] = 'Saved ' . count($methods) . ' method(s) to ignyous_cache_methods';

        return $methods;
    }

    /**
     * Scan a plugin's PHP files for cache-purge functions/methods.
     * Returns the first callable method found, or null.
     */
    private function scan_plugin_files($slug, &$log) {
        $plugin_dir = WP_PLUGIN_DIR . '/' . $slug;
        if (!is_dir($plugin_dir)) { $log[] = "    Directory not found: {$plugin_dir}"; return null; }

        // Gather PHP files (up to 30, largest first — main files tend to be bigger)
        $files = [];
        $iter  = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($plugin_dir, \FilesystemIterator::SKIP_DOTS));
        foreach ($iter as $file) {
            if ($file->getExtension() === 'php') $files[] = ['path' => $file->getPathname(), 'size' => $file->getSize()];
        }
        usort($files, function($a, $b) { return $b['size'] - $a['size']; });
        $files = array_slice($files, 0, 30);
        $log[] = "    Scanning " . count($files) . " PHP files in {$slug}";

        $purge_patterns = [
            // Function names
            '/function\s+((?:\w+_)?(?:purge|flush|clear)_(?:all|cache|page|everything)[_\w]*)\s*\(/i',
            // Static methods
            '/(?:public\s+static|static\s+public)\s+function\s+((?:purge|flush|clear)[_\w]*)\s*\(/i',
        ];

        $class_patterns = [
            '/^(?:class|abstract\s+class)\s+(\w+)/m',
        ];

        foreach ($files as $file_info) {
            $content = @file_get_contents($file_info['path']);
            if (!$content) continue;

            // Find class name
            $class = null;
            foreach ($class_patterns as $cp) {
                if (preg_match($cp, $content, $m)) { $class = $m[1]; break; }
            }

            foreach ($purge_patterns as $pp) {
                if (preg_match_all($pp, $content, $m)) {
                    foreach ($m[1] as $name) {
                        if ($class && method_exists($class, $name)) {
                            $log[] = "    Found static method: {$class}::{$name}";
                            return ['type' => 'static_method', 'class' => $class, 'method' => $name];
                        }
                        if (function_exists($name)) {
                            $log[] = "    Found function: {$name}";
                            return ['type' => 'function', 'func' => $name];
                        }
                        // Record as potential — might need autoload
                        $log[] = "    Potential: {$class}::{$name} (not yet loaded)";
                    }
                }
            }
        }
        return null;
    }

    private function find_working_method($checks, &$log) {
        foreach ($checks as $check) {
            switch ($check['type']) {
                case 'function':
                    if (function_exists($check['func'])) return $check;
                    break;
                case 'static_method':
                    if (class_exists($check['class']) && method_exists($check['class'], $check['method'])) return $check;
                    break;
                case 'action':
                    // WordPress actions always "exist", so check if plugin hook has any registered handlers
                    if (has_action($check['hook'])) return $check;
                    break;
            }
        }
        return null;
    }

    private function call_method($method, &$log) {
        try {
            switch ($method['type']) {
                case 'function':
                    if (function_exists($method['func'])) {
                        call_user_func($method['func']);
                        $log[] = "Called {$method['func']}()";
                        return true;
                    }
                    break;
                case 'static_method':
                    if (class_exists($method['class']) && method_exists($method['class'], $method['method'])) {
                        call_user_func([$method['class'], $method['method']]);
                        $log[] = "Called {$method['class']}::{$method['method']}()";
                        return true;
                    }
                    break;
                case 'action':
                    do_action($method['hook']);
                    $log[] = "Fired do_action('{$method['hook']}')";
                    return true;
            }
        } catch (\Exception $e) {
            $log[] = "Error calling {$method['label']}: " . $e->getMessage();
        }
        return false;
    }

    private function is_any_plugin_active_by_slug($slug) {
        $active = get_option('active_plugins', []);
        foreach ($active as $plugin) {
            if (strpos($plugin, $slug . '/') === 0 || $plugin === $slug . '.php') return true;
        }
        return false;
    }

    public function check_permission() {
        $stored = get_option('ignyous_bridge_api_key', '');
        if (empty($stored)) return false;
        $auth = '';
        if (function_exists('getallheaders')) {
            foreach (getallheaders() as $k => $v) if (strtolower($k) === 'authorization') { $auth = $v; break; }
        }
        if (empty($auth)) $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        $xkey = $_SERVER['HTTP_X_IGNYOUS_KEY'] ?? '';
        if (!empty($xkey) && hash_equals($stored, trim($xkey))) return true;
        if (preg_match('/Bearer\s+(.+)/i', $auth, $m)) return hash_equals($stored, trim($m[1]));
        return false;
    }
}
