<?php
namespace Ignyous\Baseline\Themes;

/**
 * Theme adapter contract.
 *
 * Each adapter knows where ONE family of themes stores its style state and
 * translates generic Ignyous capability keys into that theme's specific
 * storage primitives.
 *
 * Generic capability keys (subset depending on adapter):
 *   primary_color, text_color, background_color, link_color,
 *   heading_font, body_font
 *
 * Each adapter MUST:
 *  - Declare which capabilities it supports (capabilities()).
 *  - Be idempotent: read() never mutates.
 *  - Snapshot every write BEFORE it happens, using the existing 'option'
 *    or 'global_styles' restore types so undo works automatically.
 *
 * Return shape from patch():
 *   [
 *     'applied'      => [key => normalised_value, ...],
 *     'errors'       => [key => reason, ...],
 *     'snapshot_ids' => [id, id, ...],
 *     'current'      => same shape as read()['current'],
 *   ]
 */
abstract class ThemeAdapter {

    /** Short ID like 'block', 'astra', 'kadence'. Used in /theme/info and logs. */
    abstract public function slug(): string;

    /** Human-readable display name. */
    abstract public function name(): string;

    /**
     * Match this adapter against the currently active theme.
     * Receives both the active stylesheet (child) and template (parent) slugs
     * because some child themes (e.g. Astra child) share the parent's storage.
     */
    abstract public function matches(string $stylesheet, string $template): bool;

    /**
     * Map of generic capability key → bool (supported by this adapter).
     * Keys not present default to false.
     */
    abstract public function capabilities(): array;

    /**
     * Read current effective values + raw storage for debugging.
     * Returns ['current' => [...], 'raw' => [...]].
     */
    abstract public function read(): array;

    /**
     * Apply a patch. $body is the validated input from the controller.
     * $changeId scopes any snapshots opened.
     */
    abstract public function patch(array $body, string $changeId): array;

    // ---------------------------------------------------------- shared utils

    /** Accept #RGB, #RRGGBB, #RRGGBBAA, or rgb()/rgba(). Returns normalized or null. */
    protected function sanitizeColor($v): ?string {
        if (!is_string($v)) return null;
        $v = trim($v);
        if (preg_match('/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i', $v)) return strtolower($v);
        if (preg_match('/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/', $v)) return $v;
        return null;
    }

    /** Pick black or white for legibility against the given bg. */
    protected function contrastingTextColor(string $hex): string {
        $hex = ltrim($hex, '#');
        if (strlen($hex) === 3) $hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
        if (strlen($hex) < 6)   return '#ffffff';
        $r = hexdec(substr($hex, 0, 2));
        $g = hexdec(substr($hex, 2, 2));
        $b = hexdec(substr($hex, 4, 2));
        $luma = (0.299 * $r + 0.587 * $g + 0.114 * $b) / 255;
        return $luma > 0.6 ? '#000000' : '#ffffff';
    }
}
