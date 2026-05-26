<?php
namespace Ignyous\Baseline\Api;

use Ignyous\Baseline\Auth;
use Ignyous\Baseline\Snapshots;
use Ignyous\Baseline\ActionLog;

/**
 * Global theme styles for block themes (Twenty Twenty-Four / Five / etc).
 *
 * Storage in WP: user-level theme.json overrides live in a `wp_global_styles`
 * post for the active theme. Use WP_Theme_JSON_Resolver to find it.
 *
 * Phase-0 capabilities:
 *   - primary_color   → styles.color.background overridden via the theme palette slug,
 *                        OR settings.color.palette[]/styles.elements.button — depends on theme.
 *                        For 2025 we set the user palette slot "accent" plus styles.elements.button.color.background.
 *   - heading_font    → styles.elements.heading.typography.fontFamily (uses theme's font slug)
 *   - body_font       → styles.typography.fontFamily
 *
 * For classic themes we return is_block_theme=false and the platform falls through
 * to a future Customizer / global-CSS controller. We do NOT fake it in Phase 0.
 */
class ThemeController {

    public function register(): void {
        register_rest_route('ignyous/v1', '/theme/styles', [
            [
                'methods'             => 'GET',
                'permission_callback' => [Auth::class, 'check'],
                'callback'            => [$this, 'get'],
            ],
            [
                'methods'             => 'PATCH',
                'permission_callback' => [Auth::class, 'check'],
                'callback'            => [$this, 'patch'],
            ],
        ]);
    }

    private function userGlobalStylesPostId(): ?int {
        if (!class_exists('WP_Theme_JSON_Resolver')) return null;
        $id = \WP_Theme_JSON_Resolver::get_user_global_styles_post_id();
        if ($id) return (int) $id;
        // Fallback: lookup by post type and theme
        $stylesheet = get_stylesheet();
        $posts = get_posts([
            'post_type'      => 'wp_global_styles',
            'post_status'    => 'publish',
            'tax_query'      => [[
                'taxonomy' => 'wp_theme',
                'field'    => 'name',
                'terms'    => $stylesheet,
            ]],
            'posts_per_page' => 1,
        ]);
        return $posts ? (int) $posts[0]->ID : null;
    }

    private function readUserStyles(int $postId): array {
        $post = get_post($postId);
        if (!$post) return ['version' => 2, 'isGlobalStylesUserThemeJSON' => true];
        $raw  = $post->post_content;
        $data = $raw ? json_decode($raw, true) : [];
        if (!is_array($data)) $data = [];
        if (empty($data['version'])) $data['version'] = 2;
        $data['isGlobalStylesUserThemeJSON'] = true;
        return $data;
    }

    private function writeUserStyles(int $postId, array $data): bool {
        $data['isGlobalStylesUserThemeJSON'] = true;
        if (empty($data['version'])) $data['version'] = 2;
        $result = wp_update_post([
            'ID'           => $postId,
            'post_content' => wp_slash(wp_json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)),
        ], true);
        return !is_wp_error($result);
    }

    /** Resolved (theme + user) palette so the platform can show what's available. */
    private function themePalette(): array {
        if (!class_exists('WP_Theme_JSON_Resolver')) return [];
        $merged = \WP_Theme_JSON_Resolver::get_merged_data()->get_raw_data();
        return $merged['settings']['color']['palette']['theme'] ?? ($merged['settings']['color']['palette'] ?? []);
    }

    private function themeFontFamilies(): array {
        if (!class_exists('WP_Theme_JSON_Resolver')) return [];
        $merged = \WP_Theme_JSON_Resolver::get_merged_data()->get_raw_data();
        return $merged['settings']['typography']['fontFamilies']['theme'] ?? ($merged['settings']['typography']['fontFamilies'] ?? []);
    }

    public function get(): \WP_REST_Response {
        $isBlock  = function_exists('wp_is_block_theme') && wp_is_block_theme();
        if (!$isBlock) {
            return new \WP_REST_Response([
                'is_block_theme' => false,
                'message' => 'Active theme is not a block theme. Global styles editing requires a block theme (e.g. Twenty Twenty-Five).',
            ], 200);
        }
        $postId = $this->userGlobalStylesPostId();
        $user   = $postId ? $this->readUserStyles($postId) : [];
        return new \WP_REST_Response([
            'is_block_theme'         => true,
            'global_styles_post_id'  => $postId,
            'user_styles'            => $user,
            'palette'                => $this->themePalette(),
            'font_families'          => $this->themeFontFamilies(),
            // Convenience surface — current effective values for the platform's UI
            'current'                => [
                'primary_color'  => $user['styles']['elements']['button']['color']['background'] ?? null,
                'heading_font'   => $user['styles']['elements']['heading']['typography']['fontFamily'] ?? null,
                'body_font'      => $user['styles']['typography']['fontFamily'] ?? null,
                'text_color'     => $user['styles']['color']['text'] ?? null,
                'background_color' => $user['styles']['color']['background'] ?? null,
            ],
        ]);
    }

    public function patch(\WP_REST_Request $req) {
        $isBlock = function_exists('wp_is_block_theme') && wp_is_block_theme();
        if (!$isBlock) {
            return new \WP_Error('ignyous_not_block_theme', 'Active theme is not a block theme.', ['status' => 409]);
        }
        $postId = $this->userGlobalStylesPostId();
        if (!$postId) {
            return new \WP_Error('ignyous_no_global_styles_post', 'Could not locate the wp_global_styles post for the active theme.', ['status' => 500]);
        }
        $changeId = Auth::changeId($req);
        $body     = $req->get_json_params() ?: [];
        $started  = microtime(true);

        $before  = $this->readUserStyles($postId);
        $next    = $before;
        $applied = [];

        // primary_color → styles.elements.button.color.background  AND  styles.elements.link.color.text
        if (array_key_exists('primary_color', $body)) {
            $val = $this->sanitizeColor($body['primary_color']);
            if ($val) {
                $next['styles']['elements']['button']['color']['background'] = $val;
                // Keep button text readable — auto-pick black/white based on contrast
                $next['styles']['elements']['button']['color']['text']       = $this->contrastingTextColor($val);
                $next['styles']['elements']['link']['color']['text']         = $val;
                $applied['primary_color'] = $val;
            } else {
                $applied['primary_color_error'] = 'invalid_color';
            }
        }
        if (array_key_exists('text_color', $body)) {
            $val = $this->sanitizeColor($body['text_color']);
            if ($val) { $next['styles']['color']['text'] = $val; $applied['text_color'] = $val; }
        }
        if (array_key_exists('background_color', $body)) {
            $val = $this->sanitizeColor($body['background_color']);
            if ($val) { $next['styles']['color']['background'] = $val; $applied['background_color'] = $val; }
        }
        if (array_key_exists('heading_font', $body)) {
            $val = (string) $body['heading_font'];
            $resolved = $this->resolveFontFamily($val);
            $next['styles']['elements']['heading']['typography']['fontFamily'] = $resolved;
            $applied['heading_font'] = $resolved;
        }
        if (array_key_exists('body_font', $body)) {
            $val = (string) $body['body_font'];
            $resolved = $this->resolveFontFamily($val);
            $next['styles']['typography']['fontFamily'] = $resolved;
            $applied['body_font'] = $resolved;
        }

        $snapId = Snapshots::open($changeId, 'global_styles', (string) $postId, $before, 'Theme global styles');
        $ok     = $this->writeUserStyles($postId, $next);
        $after  = $this->readUserStyles($postId);
        Snapshots::close($snapId, $after);

        // Bust the theme.json cache so the front-end sees the update immediately
        if (class_exists('WP_Theme_JSON_Resolver') && method_exists('WP_Theme_JSON_Resolver', 'clean_cached_data')) {
            \WP_Theme_JSON_Resolver::clean_cached_data();
        }

        ActionLog::record([
            'change_id'     => $changeId,
            'intent_raw'    => Auth::intentRaw($req),
            'intent_parsed' => $body,
            'capability'    => 'theme.patch',
            'request'       => ['post_id' => $postId, 'body' => $body],
            'response'      => ['applied' => $applied, 'success' => $ok],
            'success'       => $ok ? 1 : 0,
            'error'         => $ok ? null : 'wp_update_post failed',
            'duration_ms'   => (int) round((microtime(true) - $started) * 1000),
            'ai_tokens'     => Auth::aiTokens($req),
        ]);

        return new \WP_REST_Response([
            'success'   => $ok,
            'change_id' => $changeId,
            'applied'   => $applied,
            'snapshot_id' => $snapId,
            'current'   => [
                'primary_color'    => $after['styles']['elements']['button']['color']['background'] ?? null,
                'heading_font'     => $after['styles']['elements']['heading']['typography']['fontFamily'] ?? null,
                'body_font'        => $after['styles']['typography']['fontFamily'] ?? null,
                'text_color'       => $after['styles']['color']['text'] ?? null,
                'background_color' => $after['styles']['color']['background'] ?? null,
            ],
        ], $ok ? 200 : 500);
    }

    private function sanitizeColor($v): ?string {
        if (!is_string($v)) return null;
        $v = trim($v);
        // #RGB, #RRGGBB, #RRGGBBAA
        if (preg_match('/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i', $v)) return strtolower($v);
        // rgb()/rgba() — accept conservatively
        if (preg_match('/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/', $v)) return $v;
        return null;
    }

    private function contrastingTextColor(string $hex): string {
        $hex = ltrim($hex, '#');
        if (strlen($hex) === 3) $hex = $hex[0].$hex[0].$hex[1].$hex[1].$hex[2].$hex[2];
        if (strlen($hex) < 6) return '#ffffff';
        $r = hexdec(substr($hex,0,2)); $g = hexdec(substr($hex,2,2)); $b = hexdec(substr($hex,4,2));
        $luma = (0.299 * $r + 0.587 * $g + 0.114 * $b) / 255;
        return $luma > 0.6 ? '#000000' : '#ffffff';
    }

    /**
     * Accept either an exact CSS font-family string, a theme.json font slug like "var:preset|font-family|body",
     * or a plain font name we'll try to map to a theme-registered family.
     */
    private function resolveFontFamily(string $v): string {
        $v = trim($v);
        if ($v === '') return $v;
        if (strpos($v, 'var:preset|font-family|') === 0) return $v;          // already a slug ref
        if (strpos($v, ',') !== false || strpos($v, '"') !== false || strpos($v, "'") !== false) return $v; // looks like a CSS stack

        $families = $this->themeFontFamilies();
        foreach ($families as $f) {
            $slug = $f['slug'] ?? null;
            $name = $f['name'] ?? null;
            if (!$slug) continue;
            if (strcasecmp($slug, $v) === 0 || ($name && strcasecmp($name, $v) === 0)) {
                return 'var:preset|font-family|' . $slug;
            }
        }
        // Last resort — return as a plain family name
        return $v;
    }
}
