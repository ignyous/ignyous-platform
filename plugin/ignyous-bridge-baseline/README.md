# Ignyous Bridge — Baseline (v3.0.0-baseline)

Phase 0 of the Ignyous rebuild. Minimal, well-debugged WordPress connector.

## What it does

Five capability controllers, all writing per-change snapshots and a structured action log.

| Capability | Endpoint                                  | What it edits                                       |
|------------|-------------------------------------------|-----------------------------------------------------|
| Site       | `GET /wp-json/ignyous/v1/site`            | Read site title, tagline, theme info                |
| Options    | `GET/PATCH /wp-json/ignyous/v1/options`   | Whitelisted: `site_title`, `tagline`                |
| Pages      | `GET/PATCH /wp-json/ignyous/v1/pages…`    | Page title, page content (block markup or HTML)     |
| Theme      | `GET/PATCH /wp-json/ignyous/v1/theme/styles` | `primary_color`, `text_color`, `background_color`, `heading_font`, `body_font` (block themes only) |
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
