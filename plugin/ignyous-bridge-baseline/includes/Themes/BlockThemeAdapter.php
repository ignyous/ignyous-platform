<?php
namespace Ignyous\Baseline\Themes;

use Ignyous\Baseline\Snapshots;

/**
 * Block themes (Twenty Twenty-Five and any other theme with a theme.json).
 *
 * Storage: user-level overrides live in a `wp_global_styles` post identified
 * via WP_Theme_JSON_Resolver. We write to it as JSON.
 *
 * Snapshots use the existing 'global_styles' restore type.
 */
class BlockThemeAdapter extends ThemeAdapter {

    public function slug(): string { return 'block'; }
    public function name(): string { return 'Block Theme (theme.json)'; }

    public function matches(string $stylesheet, string $template): bool {
        return function_exists('wp_is_block_theme') && wp_is_block_theme();
    }

    public function capabilities(): array {
        return [
            'primary_color'    => true,
            'text_color'       => true,
            'background_color' => true,
            'link_color'       => true,
            'heading_font'     => true,
            'body_font'        => true,
        ];
    }

    public function read(): array {
        $postId = $this->userGlobalStylesPostId();
        $user   = $postId ? $this->readUserStyles($postId) : [];
        return [
            'current' => [
                'primary_color'    => $user['styles']['elements']['button']['color']['background'] ?? null,
                'text_color'       => $user['styles']['color']['text'] ?? null,
                'background_color' => $user['styles']['color']['background'] ?? null,
                'link_color'       => $user['styles']['elements']['link']['color']['text'] ?? null,
                'heading_font'     => $user['styles']['elements']['heading']['typography']['fontFamily'] ?? null,
                'body_font'        => $user['styles']['typography']['fontFamily'] ?? null,
            ],
            'raw' => [
                'global_styles_post_id' => $postId,
                'user_styles'           => $user,
                'palette'               => $this->themePalette(),
                'font_families'         => $this->themeFontFamilies(),
            ],
        ];
    }

    public function patch(array $body, string $changeId): array {
        $postId = $this->userGlobalStylesPostId();
        if (!$postId) {
            return [
                'applied' => [],
                'errors'  => ['_global' => 'no_global_styles_post'],
                'snapshot_ids' => [],
                'current' => $this->read()['current'],
            ];
        }
        $before  = $this->readUserStyles($postId);
        $next    = $before;
        $applied = [];
        $errors  = [];

        if (array_key_exists('primary_color', $body)) {
            $v = $this->sanitizeColor($body['primary_color']);
            if ($v) {
                $next['styles']['elements']['button']['color']['background'] = $v;
                $next['styles']['elements']['button']['color']['text']       = $this->contrastingTextColor($v);
                $next['styles']['elements']['link']['color']['text']         = $v;
                $applied['primary_color'] = $v;
            } else $errors['primary_color'] = 'invalid_color';
        }
        if (array_key_exists('text_color', $body)) {
            $v = $this->sanitizeColor($body['text_color']);
            if ($v) { $next['styles']['color']['text'] = $v; $applied['text_color'] = $v; }
            else    $errors['text_color'] = 'invalid_color';
        }
        if (array_key_exists('background_color', $body)) {
            $v = $this->sanitizeColor($body['background_color']);
            if ($v) { $next['styles']['color']['background'] = $v; $applied['background_color'] = $v; }
            else    $errors['background_color'] = 'invalid_color';
        }
        if (array_key_exists('link_color', $body)) {
            $v = $this->sanitizeColor($body['link_color']);
            if ($v) { $next['styles']['elements']['link']['color']['text'] = $v; $applied['link_color'] = $v; }
            else    $errors['link_color'] = 'invalid_color';
        }
        if (array_key_exists('heading_font', $body)) {
            $resolved = $this->resolveFontFamily((string) $body['heading_font']);
            $next['styles']['elements']['heading']['typography']['fontFamily'] = $resolved;
            $applied['heading_font'] = $resolved;
        }
        if (array_key_exists('body_font', $body)) {
            $resolved = $this->resolveFontFamily((string) $body['body_font']);
            $next['styles']['typography']['fontFamily'] = $resolved;
            $applied['body_font'] = $resolved;
        }

        $snapId = Snapshots::open($changeId, 'global_styles', (string) $postId, $before, 'Theme global styles (block)');
        $ok     = $this->writeUserStyles($postId, $next);
        $after  = $this->readUserStyles($postId);
        Snapshots::close($snapId, $after);

        // Bust theme.json cache so front-end picks up immediately
        if (class_exists('WP_Theme_JSON_Resolver') && method_exists('WP_Theme_JSON_Resolver', 'clean_cached_data')) {
            \WP_Theme_JSON_Resolver::clean_cached_data();
        }

        return [
            'applied' => $applied,
            'errors'  => $errors,
            'snapshot_ids' => [$snapId],
            'current' => [
                'primary_color'    => $after['styles']['elements']['button']['color']['background'] ?? null,
                'text_color'       => $after['styles']['color']['text'] ?? null,
                'background_color' => $after['styles']['color']['background'] ?? null,
                'link_color'       => $after['styles']['elements']['link']['color']['text'] ?? null,
                'heading_font'     => $after['styles']['elements']['heading']['typography']['fontFamily'] ?? null,
                'body_font'        => $after['styles']['typography']['fontFamily'] ?? null,
            ],
            'success' => $ok,
        ];
    }

    // --------------------------------------------------------------- helpers

    private function userGlobalStylesPostId(): ?int {
        if (!class_exists('WP_Theme_JSON_Resolver')) return null;
        $id = \WP_Theme_JSON_Resolver::get_user_global_styles_post_id();
        if ($id) return (int) $id;
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
        $data = $post->post_content ? json_decode($post->post_content, true) : [];
        if (!is_array($data)) $data = [];
        if (empty($data['version'])) $data['version'] = 2;
        $data['isGlobalStylesUserThemeJSON'] = true;
        return $data;
    }

    private function writeUserStyles(int $postId, array $data): bool {
        $data['isGlobalStylesUserThemeJSON'] = true;
        if (empty($data['version'])) $data['version'] = 2;
        $r = wp_update_post([
            'ID'           => $postId,
            'post_content' => wp_slash(wp_json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)),
        ], true);
        return !is_wp_error($r);
    }

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

    private function resolveFontFamily(string $v): string {
        $v = trim($v);
        if ($v === '') return $v;
        if (strpos($v, 'var:preset|font-family|') === 0) return $v;
        if (strpos($v, ',') !== false || strpos($v, '"') !== false || strpos($v, "'") !== false) return $v;
        foreach ($this->themeFontFamilies() as $f) {
            $slug = $f['slug'] ?? null; $name = $f['name'] ?? null;
            if (!$slug) continue;
            if (strcasecmp($slug, $v) === 0 || ($name && strcasecmp($name, $v) === 0)) {
                return 'var:preset|font-family|' . $slug;
            }
        }
        return $v;
    }
}
