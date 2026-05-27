<?php
namespace Ignyous\Baseline\Themes;

/**
 * Fallback adapter when the active theme isn't recognized AND isn't a block theme.
 * We decline every key with a clear error so the platform can show the user WHY
 * theme-level edits don't work, and suggest using per-block edits instead.
 */
class UnsupportedThemeAdapter extends ThemeAdapter {

    private string $stylesheet;
    private string $template;

    public function __construct(string $stylesheet = '', string $template = '') {
        $this->stylesheet = $stylesheet;
        $this->template   = $template;
    }

    public function slug(): string { return 'unsupported'; }
    public function name(): string { return 'Unsupported theme'; }
    public function matches(string $stylesheet, string $template): bool { return false; }

    public function capabilities(): array {
        return [
            'primary_color'    => false,
            'text_color'       => false,
            'background_color' => false,
            'link_color'       => false,
            'heading_font'     => false,
            'body_font'        => false,
        ];
    }

    public function read(): array {
        return [
            'current' => [],
            'raw'     => [
                'reason'     => 'no_adapter_for_theme',
                'stylesheet' => $this->stylesheet,
                'template'   => $this->template,
                'hint'       => 'Site-wide theme edits are only supported for block themes (e.g. Twenty Twenty-Five), Astra, and Kadence. Per-block edits via the Blocks tab still work on any theme.',
            ],
        ];
    }

    public function patch(array $body, string $changeId): array {
        $errors = [];
        foreach (array_keys($body) as $k) $errors[$k] = 'unsupported_theme';
        return [
            'applied'      => [],
            'errors'       => $errors,
            'snapshot_ids' => [],
            'current'      => [],
            'success'      => false,
            'message'      => 'No adapter for active theme. Use per-block edits on the Blocks tab instead.',
        ];
    }
}
