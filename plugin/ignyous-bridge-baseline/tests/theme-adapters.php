<?php
// Fixture test for theme adapters: drives real read()/patch() through stubbed
// WordPress storage and asserts writes land on the VERIFIED storage primitives.
// Catches "wrote to the wrong key/backend" bugs (e.g. Kadence theme_mod routing,
// Astra body-font-family vs font-family-body).

namespace Ignyous\Baseline {
    class Snapshots {
        public static function open($c, $t, $k, $b, $d = null) { return 1; }
        public static function close($id, $a) {}
    }
}

namespace {
    $GLOBALS['__opt'] = [];
    $GLOBALS['__mod'] = [];
    $GLOBALS['__filter'] = [];           // filter_name => forced return
    function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['__opt']) ? $GLOBALS['__opt'][$k] : $d; }
    function update_option($k, $v) { $GLOBALS['__opt'][$k] = $v; return true; }
    function delete_option($k) { unset($GLOBALS['__opt'][$k]); return true; }
    function delete_transient($k) { return true; }
    function get_theme_mod($k, $d = false) { return array_key_exists($k, $GLOBALS['__mod']) ? $GLOBALS['__mod'][$k] : $d; }
    function set_theme_mod($k, $v) { $GLOBALS['__mod'][$k] = $v; }
    function get_stylesheet() { return 'activetheme'; }
    function apply_filters($name, $value) { return $GLOBALS['__filter'][$name] ?? $value; }
    function wp_json_encode($v) { return json_encode($v); }

    $base = __DIR__ . '/../includes/Themes/';
    require $base . 'ThemeAdapter.php';
    require $base . 'AstraAdapter.php';
    require $base . 'KadenceAdapter.php';
    require $base . 'GeneratePressAdapter.php';

    use Ignyous\Baseline\Themes\AstraAdapter;
    use Ignyous\Baseline\Themes\KadenceAdapter;
    use Ignyous\Baseline\Themes\GeneratePressAdapter;

    $PASS = 0; $FAIL = 0;
    function ok($c, $l) { global $PASS, $FAIL; if ($c) { $PASS++; echo "  PASS  $l\n"; } else { $FAIL++; echo "  FAIL  $l\n"; } }
    function reset_store() { $GLOBALS['__opt'] = []; $GLOBALS['__mod'] = []; $GLOBALS['__filter'] = []; }

    // ───────────────────────── Astra ─────────────────────────
    echo "── Astra ──\n";
    reset_store();
    $a = new AstraAdapter();
    $a->patch(['primary_color' => '#ff0000', 'body_font' => 'Inter', 'heading_font' => 'Poppins'], 'chg');
    $s = $GLOBALS['__opt']['astra-settings'];
    ok(($s['theme-color'] ?? null) === '#ff0000', 'primary → theme-color literal');
    ok(($s['body-font-family'] ?? null) === 'Inter', 'body_font → body-font-family (correct key)');
    ok(!isset($s['font-family-body']), 'does NOT write legacy font-family-body');
    ok(($s['headings-font-family'] ?? null) === 'Poppins', 'heading_font → headings-font-family (correct key)');
    ok(($s['font-family-h1'] ?? null) === 'Poppins', 'heading_font also fills per-heading h1');

    // ─────────────────────── Kadence (theme_mod default) ───────────────────────
    echo "\n── Kadence (default theme_mod backend) ──\n";
    reset_store();
    $k = new KadenceAdapter();
    $r = $k->patch([
        'primary_color' => '#123456', 'text_color' => '#222222', 'background_color' => '#ffffff',
        'link_color' => '#0000ff', 'body_font' => 'Roboto', 'heading_font' => 'Lora',
    ], 'chg');
    ok(($k->read()['raw']['option_type']) === 'theme_mod', 'default backend is theme_mod');
    ok(!isset($GLOBALS['__opt']['kadence_settings']), 'does NOT write kadence_settings option in theme_mod mode');
    ok(($GLOBALS['__mod']['base_font']['color'] ?? null) === '#222222', 'text_color → theme_mod base_font.color');
    ok(($GLOBALS['__mod']['base_font']['family'] ?? null) === 'Roboto', 'body_font → theme_mod base_font.family');
    ok(($GLOBALS['__mod']['content_background']['desktop']['color'] ?? null) === '#ffffff', 'background → content_background.desktop.color');
    ok(($GLOBALS['__mod']['link_color']['highlight'] ?? null) === '#0000ff', 'link_color → link_color.highlight');
    ok(($GLOBALS['__mod']['heading_font']['family'] ?? null) === 'Lora', 'heading_font → theme_mod heading_font.family');
    $pal = json_decode($GLOBALS['__opt']['kadence_global_palette'], true);
    ok(($pal['palette'][0]['color'] ?? null) === '#123456', 'primary → kadence_global_palette palette1 option');
    ok(!isset($GLOBALS['__mod']['body_background']), 'does NOT use legacy body_background key');

    // ─────────────────────── Kadence (option backend via filter) ───────────────────────
    echo "\n── Kadence (option backend) ──\n";
    reset_store();
    $GLOBALS['__filter']['kadence_theme_option_type'] = 'option';
    $k = new KadenceAdapter();
    $k->patch(['text_color' => '#0a0a0a'], 'chg');
    ok(($GLOBALS['__opt']['kadence_settings']['base_font']['color'] ?? null) === '#0a0a0a', 'option mode writes kadence_settings option');
    ok(!isset($GLOBALS['__mod']['base_font']), 'option mode does NOT touch theme mods');

    // ───────────────────────── GeneratePress ─────────────────────────
    echo "\n── GeneratePress ──\n";
    reset_store();
    // seed defaults: accent global color + existing body typography rule
    $GLOBALS['__opt']['generate_settings'] = [
        'global_colors' => [['name' => 'Accent', 'slug' => 'accent', 'color' => '#1e73be']],
        'typography'    => [['selector' => 'body', 'fontFamily' => 'System Default']],
    ];
    $g = new GeneratePressAdapter();
    $g->patch([
        'primary_color' => '#abcdef', 'text_color' => '#111111', 'background_color' => '#fafafa',
        'link_color' => '#ff8800', 'body_font' => 'Nunito', 'heading_font' => 'Merriweather',
    ], 'chg');
    $gs = $GLOBALS['__opt']['generate_settings'];
    ok(($gs['global_colors'][0]['color'] ?? null) === '#abcdef', 'primary → global_colors accent.color');
    ok(($gs['text_color'] ?? null) === '#111111', 'text_color → generate_settings.text_color literal');
    ok(($gs['background_color'] ?? null) === '#fafafa', 'background → background_color literal');
    ok(($gs['link_color'] ?? null) === '#ff8800', 'link_color → link_color literal');
    $bodyRule = null; $headRule = null;
    foreach ($gs['typography'] as $rule) {
        if (($rule['selector'] ?? null) === 'body') $bodyRule = $rule;
        if (($rule['selector'] ?? null) === 'all-headings') $headRule = $rule;
    }
    ok(($bodyRule['fontFamily'] ?? null) === 'Nunito', 'body_font → typography body rule (updated in place)');
    ok(count($gs['typography']) === 2, 'heading rule appended (no body duplicate)');
    ok(($headRule['fontFamily'] ?? null) === 'Merriweather', 'heading_font → new all-headings rule');
    ok(($headRule['fontSizeUnit'] ?? null) === 'px', 'new rule carries full default shape');

    echo "\n========================================\n";
    echo "  RESULT: $PASS passed, $FAIL failed\n";
    echo "========================================\n";
    exit($FAIL === 0 ? 0 : 1);
}
