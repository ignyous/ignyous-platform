# Ignyous Bridge — Baseline (v3.6.0-phase6a)

Minimal, well-debugged WordPress connector. Phase 0 (text/colors/fonts) + Phase 1 (media) + Phase 2 (per-block content) + Phase 3 (per-block styles) + Phase 5 (theme adapters: Astra/Kadence/block) + Phase 6A (Elementor kit).

## What it does

Capability controllers, all writing per-change snapshots and a structured action log.

| Capability | Endpoint                                  | What it edits                                       |
|------------|-------------------------------------------|-----------------------------------------------------|
| Site       | `GET /wp-json/ignyous/v1/site`            | Read site title, tagline, theme info                |
| Options    | `GET/PATCH /wp-json/ignyous/v1/options`   | Whitelisted: `site_title`, `tagline`                |
| Pages      | `GET/PATCH /wp-json/ignyous/v1/pages…`    | Page title, page content (block markup or HTML)     |
| Theme      | `GET/PATCH /wp-json/ignyous/v1/theme/styles`, `GET /wp-json/ignyous/v1/theme/info` | `primary_color`, `text_color`, `background_color`, `link_color`, `heading_font`, `body_font` — dispatched through adapters (first-match-wins): **Elementor** (active kit's system_colors / system_typography / body_background + theme-style h1..h6), TwentyTwentyFive/block, **Astra** (writes `astra-settings`), **Kadence** (writes `kadence_global_palette` + `kadence_settings`), or Unsupported (clear 409 with hint) |
| Media      | `POST /media/upload`, `GET /media`, `DELETE /media/{id}` | Upload (base64), list, delete attachments |
| Featured image | `PATCH /pages/{id}/featured-image`    | Sets `_thumbnail_id` on a page                    |
| Site logo  | `PATCH /options/site_logo`                | Sets/clears Customizer site logo                    |
| Replace image | `PATCH /pages/{id}/replace-first-image` | Swaps the first `<!-- wp:image -->` block's URL  |
| **Blocks** | `GET /pages/{id}/blocks`, `PATCH /pages/{id}/blocks` | List blocks with paths; ops: `set_text`, `set_attr`, `set_html`, `set_style`, `clear_style` (color/spacing/typography) |
| Snapshots  | `GET /snapshots`, `POST /snapshots/{id}/restore`, `POST /snapshots/restore-change/{change_id}` | List and undo |
| Actions    | `GET /wp-json/ignyous/v1/actions`         | Last N action-log rows                              |

## Auth

`Authorization: Bearer <api_key>` on every protected endpoint.

The platform claims a fresh site with a one-time `setup_token` returned by the unauthenticated `/ping`. After claim, the token is burned.

## Headers from the platform

Every write should include these so the action log is useful:

- `X-Ignyous-Change-Id: <uuid>` — groups all snapshots from one user action
- `X-Ignyous-Intent: <raw user request>` — what the user typed
- `X-Ignyous-Ai-Tokens: <int>` — how many AI tokens this action burned

## Tables

- `wp_ignyous_snapshots` — one row per atomic change. `before_value` captured BEFORE, `after_value` AFTER.
- `wp_ignyous_actions` — one row per platform request, ai_tokens column for budget tracking.

## Edit hierarchy (planned)

This plugin is Tier 1 + Tier 2. Tier 3 (global CSS) lives in a separate controller to be added later.

1. **Tier 1 — Builder native** (Gutenberg block target; Elementor coming)
2. **Tier 2 — Theme options** (`theme.json` user global styles, site title/tagline)
3. **Tier 3 — Global CSS** (last resort, future)
