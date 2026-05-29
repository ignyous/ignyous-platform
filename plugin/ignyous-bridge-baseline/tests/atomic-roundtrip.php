<?php
// Synthetic-fixture round-trip test for Phase 6F atomic widget read/write.
// Drives the REAL ElementorController via stubbed WordPress collaborators.
// Validates internal consistency + that we emit the shapes verified vs source.
// (Does NOT prove Elementor accepts them — that needs a real V4 export.)

namespace Ignyous\Baseline {
    class Auth {
        public static function check() { return true; }
        public static function changeId($r) { return 'chg_test'; }
        public static function intentRaw($r) { return ''; }
        public static function aiTokens($r) { return 0; }
    }
    class Snapshots {
        public static $opened = [];
        public static function open($c, $t, $id, $before, $label) { self::$opened[] = $label; return 'snap_' . count(self::$opened); }
        public static function close($id, $after) {}
    }
    class ActionLog { public static function record($a) {} }
}

namespace {
    $GLOBALS['__meta'] = [];
    function get_post($id) { return (object) ['ID' => $id]; }
    function get_post_meta($id, $key, $single = false) { return $GLOBALS['__meta'][$key] ?? ''; }
    function update_metadata($t, $id, $key, $val) { $GLOBALS['__meta'][$key] = $val; return true; }
    function update_option($k, $v) { return true; }
    function delete_option($k) { return true; }
    function wp_slash($v) { return $v; }
    function wp_json_encode($v) { return json_encode($v); }
    function wp_kses_post($s) { return $s; }
    function wp_strip_all_tags($s) { return trim(preg_replace('/<[^>]*>/', '', (string) $s)); }
    if (!function_exists('mb_substr')) { function mb_substr($s, $start, $len = null) { return $len === null ? substr($s, $start) : substr($s, $start, $len); } }

    class WP_REST_Request implements ArrayAccess {
        public $body; public $params = [];
        function __construct($body, $id) { $this->body = $body; $this->params['id'] = $id; }
        function get_json_params() { return $this->body; }
        function get_param($k) { return $this->params[$k] ?? null; }
        #[\ReturnTypeWillChange] function offsetGet($k) { return $this->params[$k] ?? null; }
        #[\ReturnTypeWillChange] function offsetExists($k) { return isset($this->params[$k]); }
        #[\ReturnTypeWillChange] function offsetSet($k, $v) { $this->params[$k] = $v; }
        #[\ReturnTypeWillChange] function offsetUnset($k) { unset($this->params[$k]); }
    }
    class WP_REST_Response { public $data; public $status; function __construct($d, $s = 200) { $this->data = $d; $this->status = $s; } }
    class WP_Error { public $code, $msg, $d; function __construct($c, $m, $d = []) { $this->code = $c; $this->msg = $m; $this->d = $d; } }

    require __DIR__ . '/../includes/Api/ElementorController.php';
    use Ignyous\Baseline\Api\ElementorController;

    // ---- assertion helpers ----
    $PASS = 0; $FAIL = 0;
    function ok($cond, $label) {
        global $PASS, $FAIL;
        if ($cond) { $PASS++; echo "  PASS  $label\n"; }
        else       { $FAIL++; echo "  FAIL  $label\n"; }
    }
    function tree()  { return json_decode($GLOBALS['__meta']['_elementor_data'], true); }
    function setTree($t) { $GLOBALS['__meta']['_elementor_edit_mode'] = 'builder'; $GLOBALS['__meta']['_elementor_data'] = json_encode($t); }

    // ---- synthetic atomic page (shapes per verified Elementor source) ----
    setTree([
        ['id' => 'div0001', 'version' => '0.0', 'elType' => 'e-div-block', 'isInner' => false,
         'settings' => [], 'editor_settings' => ['title' => 'Hero'], 'interactions' => [], 'styles' => [], 'elements' => [
            ['id' => 'hd0001', 'version' => '0.0', 'elType' => 'e-heading', 'isInner' => false,
             'settings' => ['title' => ['$$type' => 'html-v3', 'value' => ['content' => ['$$type' => 'string', 'value' => 'Old Heading']]]],
             'editor_settings' => [], 'interactions' => [], 'styles' => [], 'elements' => []],
            ['id' => 'pg0001', 'version' => '0.0', 'elType' => 'e-paragraph', 'isInner' => false,
             'settings' => ['paragraph' => ['$$type' => 'html-v3', 'value' => ['content' => ['$$type' => 'string', 'value' => 'Old body text']]]],
             'editor_settings' => [], 'interactions' => [], 'styles' => [], 'elements' => []],
            ['id' => 'bt0001', 'version' => '0.0', 'elType' => 'e-button', 'isInner' => false,
             'settings' => ['text' => ['$$type' => 'html-v3', 'value' => ['content' => ['$$type' => 'string', 'value' => 'Click here']]]],
             'editor_settings' => [], 'interactions' => [], 'styles' => [], 'elements' => []],
        ]],
    ]);

    $c = new ElementorController();
    $patch = function ($id, $op) use ($c) {
        $c->patchElement(new WP_REST_Request(['target' => ['by' => 'id', 'id' => $id], 'op' => $op], 7));
    };
    $list = function () use ($c) {
        return $c->listElements(new WP_REST_Request([], 7))->data['elements'];
    };

    echo "── READ (initial) ──\n";
    $els = $list();
    $byId = []; foreach ($els as $e) $byId[$e['id']] = $e;
    ok(count($els) === 4, 'flatten sees all 4 atomic elements');
    ok($byId['hd0001']['is_atomic'] === true, 'e-heading flagged is_atomic');
    ok($byId['hd0001']['schema_version'] === '0.0', 'schema_version surfaced');
    ok($byId['hd0001']['widgetType'] === 'e-heading', 'atomic widgetType = elType');
    ok($byId['hd0001']['text'] === 'Old Heading', 'unwrapped html-v3 heading text');
    ok($byId['pg0001']['text'] === 'Old body text', 'unwrapped paragraph text');
    ok($byId['div0001']['label'] === 'Hero', 'editor_settings.title used as label');

    echo "\n── WRITE set_text (heading) ──\n";
    $patch('hd0001', ['type' => 'set_text', 'value' => 'New Heading']);
    $t = tree();
    $h = $t[0]['elements'][0];
    ok($h['settings']['title']['$$type'] === 'html-v3', 'text prop keeps html-v3 $$type');
    ok($h['settings']['title']['value']['content']['$$type'] === 'string', 'inner content is string prop');
    ok($h['settings']['title']['value']['content']['value'] === 'New Heading', 'heading text written');

    echo "\n── WRITE set_style color.text (heading, creates local style) ──\n";
    $patch('hd0001', ['type' => 'set_style', 'category' => 'color', 'name' => 'text', 'value' => '#ff0000']);
    $t = tree(); $h = $t[0]['elements'][0];
    ok(!empty($h['styles']), 'styles map created on element');
    $sid = array_key_first($h['styles']);
    ok($h['settings']['classes']['$$type'] === 'classes', 'classes binding prop created');
    ok(in_array($sid, $h['settings']['classes']['value'], true), 'classes value references the local style id');
    $v0 = $h['styles'][$sid]['variants'][0];
    ok($v0['meta']['breakpoint'] === null && $v0['meta']['state'] === null, 'base variant meta breakpoint/state null');
    ok($h['styles'][$sid]['type'] === 'class', 'style type=class');
    ok(($v0['props']['color']['$$type'] ?? null) === 'color', 'color prop $$type=color');
    ok(($v0['props']['color']['value'] ?? null) === '#ff0000', 'color value written');

    echo "\n── WRITE set_style font-size + reuse same local style ──\n";
    $patch('hd0001', ['type' => 'set_style', 'category' => 'typography', 'name' => 'fontSize', 'value' => '28px']);
    $t = tree(); $h = $t[0]['elements'][0];
    ok(count($h['styles']) === 1, 'reuses existing local style (no duplicate)');
    $sid = array_key_first($h['styles']);
    $props = $h['styles'][$sid]['variants'][0]['props'];
    ok(($props['font-size']['$$type'] ?? null) === 'size', 'font-size prop $$type=size');
    ok(($props['font-size']['value'] ?? null) == ['size' => 28.0, 'unit' => 'px'], 'font-size value {size,unit}');
    ok(isset($props['color']), 'earlier color prop preserved');

    echo "\n── WRITE set_style padding on e-div-block (dimensions logical sides) ──\n";
    $patch('div0001', ['type' => 'set_style', 'category' => 'spacing', 'name' => 'padding', 'value' => '24px']);
    $t = tree(); $d = $t[0];
    $sid = array_key_first($d['styles']);
    $pad = $d['styles'][$sid]['variants'][0]['props']['padding'] ?? null;
    ok(($pad['$$type'] ?? null) === 'dimensions', 'padding prop $$type=dimensions');
    $keys = array_keys($pad['value'] ?? []);
    ok($keys === ['block-start', 'inline-end', 'block-end', 'inline-start'], 'logical side keys present');
    ok(($pad['value']['block-start']['$$type'] ?? null) === 'size', 'each side is a size prop');

    echo "\n── WRITE set_style background on e-button (composite) ──\n";
    $patch('bt0001', ['type' => 'set_style', 'category' => 'color', 'name' => 'background', 'value' => '#2563eb']);
    $t = tree(); $b = $t[0]['elements'][2];
    $sid = array_key_first($b['styles']);
    $bg = $b['styles'][$sid]['variants'][0]['props']['background'] ?? null;
    ok(($bg['$$type'] ?? null) === 'background', 'background composite $$type=background');
    ok(($bg['value']['color']['$$type'] ?? null) === 'color', 'background.color is a color prop');
    ok(($bg['value']['color']['value'] ?? null) === '#2563eb', 'background color value written');

    echo "\n── CLEAR set_style color.text ──\n";
    $patch('hd0001', ['type' => 'clear_style', 'category' => 'color', 'name' => 'text']);
    $t = tree(); $h = $t[0]['elements'][0];
    $sid = array_key_first($h['styles']);
    $props = $h['styles'][$sid]['variants'][0]['props'];
    ok(!isset($props['color']), 'color prop removed on clear');
    ok(isset($props['font-size']), 'font-size prop untouched by color clear');

    echo "\n── ROUND-TRIP stability + read reflects writes ──\n";
    $els = $list(); $byId = []; foreach ($els as $e) $byId[$e['id']] = $e;
    ok($byId['hd0001']['text'] === 'New Heading', 'read reflects new heading text');
    $enc1 = $GLOBALS['__meta']['_elementor_data'];
    $enc2 = json_encode(json_decode($enc1, true));
    ok($enc1 === $enc2, 'JSON encode/decode is stable (no shape drift)');

    echo "\n========================================\n";
    echo "  RESULT: $PASS passed, $FAIL failed\n";
    echo "========================================\n";
    exit($FAIL === 0 ? 0 : 1);
}
