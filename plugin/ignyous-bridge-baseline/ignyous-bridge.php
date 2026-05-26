<?php
/**
 * Plugin Name: Ignyous Bridge (Baseline)
 * Description: Minimal, debuggable connector for the Ignyous platform. Edit site title, page content, theme colors & fonts with per-change snapshots and a full action log.
 * Version:     3.0.0-baseline
 * Author:      Ignyous AI
 * Author URI:  https://ignyous.ai
 * License:     GPL v2 or later
 * Text Domain: ignyous-bridge
 *
 * Phase 0 of the rebuild. Five capability controllers + Snapshots + ActionLog.
 * Anything not handled here falls through to a future global-CSS controller (Tier 3).
 */

if (!defined('ABSPATH')) exit;

define('IGNYOUS_BL_VERSION', '3.0.0-baseline');
define('IGNYOUS_BL_FILE',    __FILE__);
define('IGNYOUS_BL_DIR',     plugin_dir_path(__FILE__));
define('IGNYOUS_BL_URL',     plugin_dir_url(__FILE__));

// PSR-4-ish autoloader for the Ignyous\Baseline\ namespace
spl_autoload_register(function ($class) {
    if (strpos($class, 'Ignyous\\Baseline\\') !== 0) return;
    $rel  = substr($class, strlen('Ignyous\\Baseline\\'));
    $path = IGNYOUS_BL_DIR . 'includes/' . str_replace('\\', '/', $rel) . '.php';
    if (file_exists($path)) require $path;
});

register_activation_hook(__FILE__,   ['Ignyous\\Baseline\\Activator', 'activate']);
register_deactivation_hook(__FILE__, ['Ignyous\\Baseline\\Activator', 'deactivate']);

add_action('plugins_loaded', function () {
    Ignyous\Baseline\Plugin::instance()->boot();
});
