<?php
/**
 * Plugin Name: Ignyous Bridge (Baseline)
 * Description: Minimal, debuggable connector. Edits flow through theme-specific adapters (Twenty Twenty-Five, Astra, Kadence) when available, with per-block edits via Gutenberg's parser, per-change snapshots and full action log.
 * Version:     3.5.0-phase5
 * Author:      Ignyous AI
 * Author URI:  https://ignyous.ai
 * License:     GPL v2 or later
 * Text Domain: ignyous-bridge
 *
 * Phase 5 — theme dispatcher with adapters for Twenty Twenty-Five (and any
 * block theme via theme.json), Astra (classic, astra-settings option),
 * and Kadence (block theme, kadence_global_palette + kadence_settings).
 */

if (!defined('ABSPATH')) exit;

define('IGNYOUS_BL_VERSION', '3.5.0-phase5');
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
