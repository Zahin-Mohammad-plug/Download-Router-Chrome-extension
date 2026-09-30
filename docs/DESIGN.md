# Download Router — Design Language (v3: Calm Utility)

Built from the design research in `docs/design/RESEARCH.md`. Previous glass concept: `docs/design/concept-glass.html` (structure still applies; its visual treatment is superseded by this document).

## The one question
Every surface answers: **"Where did my download go, and how do I make it go somewhere else?"** The destination folder is always the most prominent thing. Nothing competes with it.

## How rules work (user-facing model — must be true in code)
Checked top to bottom; the first match wins:
1. **Websites** — where the file came from (`github.com` also covers its subdomains; a rule with a path like `github.com/octocat` beats plain `github.com`).
2. **File names** — a word in the file name ("invoice").
3. **File types** — single-extension rules (".zip files") then groups (Images, Documents…).
4. **Everything else** — the default folder.

Storage shapes are unchanged from v2 (see git history of this file); background migrates old priority data once and keeps a backup.

## Principles
1. **Content over chrome.** Solid, calm surfaces. No aurora backgrounds, no glass behind content, no glows, no gradient tiles. Blur only on menus floating above other UI.
2. **One accent, owned.** A deep teal used only for: primary buttons, switch "on" state, links/plain buttons, the current-folder checkmark, the progress hairline, focus rings. Everything else is warm neutral gray.
3. **Color means something or it isn't there.** File kinds are shown with a neutral tile + line icon + a small text label (ZIP, PDF), never a colored gradient.
4. **Destination first.** On the card the folder is the headline; the file name is secondary.
5. **Explain the automation.** Every automatic decision can answer "why here?" in plain words.
6. **Quiet motion.** 150–200ms ease-out, interruptible; one signature move (file → folder on save). Respect reduced motion.

## Tokens (define as CSS custom properties; light / dark)
| Token | Light | Dark |
|---|---|---|
| `--accent` | `#0E7C74` | `#2AB3A6` |
| `--accent-hover` | `#0B6A63` | `#43C4B7` |
| `--accent-ink` (text on accent fill) | `#FFFFFF` | `#04211E` |
| `--accent-soft` (selected rows, focus halo) | `rgba(14,124,116,.12)` | `rgba(42,179,166,.20)` |
| `--bg` (page/popup background) | `#F6F5F2` | `#161615` |
| `--surface` (lists, card, sheet) | `#FFFFFF` | `#1F1F1D` |
| `--surface-2` (inputs, hover rows) | `#F1F0EC` | `#2A2A27` |
| `--hairline` | `rgba(28,25,20,.10)` | `rgba(255,255,255,.09)` |
| `--hairline-strong` (card edge) | `rgba(28,25,20,.14)` | `rgba(255,255,255,.14)` |
| `--label` | `#1C1B18` | `#F2F1ED` |
| `--secondary` | `#5E5B54` | `#A8A59D` |
| `--tertiary` | `#8C897F` | `#77746C` |
| `--danger` | `#C4372B` | `#FF6B5E` |
| `--success` (checkmark glyph only) | `#1E8E4E` | `#4CC77F` |
| `--tile` (neutral icon tile bg) | `#F1F0EC` | `#2A2A27` |

- Card background: `--surface` at 97% opacity (`color-mix(in srgb, var(--surface) 97%, transparent)` with fallback), 1px `--hairline-strong` border, shadow `0 8px 28px rgba(0,0,0,.12), 0 1px 3px rgba(0,0,0,.08)` (dark: `.45/.3`). No backdrop blur on the card.
- Menus (folder menu): `--surface` 92% + `backdrop-filter: blur(20px)`, 1px hairline, radius 12, shadow like the card.
- Radius: controls 8, rows/lists 12, card 16, sheet 16, chips/labels 6.
- **Type:** system stack (`-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif`). Sizes 20 (page title), 15 (card headline, section titles), 13 (body), 11.5 (labels/footnotes). Weights 400 and 600 only. `font-variant-numeric: tabular-nums` for times/counts. No uppercase except 10.5px type labels (ZIP) and popup section labels (letter-spacing .04em, 11px, `--tertiary`).
- **Icons:** 1.5px stroke line icons, 16px, `currentColor`, round caps. Tiles: 28px (popup/settings) / 36px (card), radius 8, `--tile` bg, `--secondary` glyph. Folder glyph: outline folder in `--secondary` (current folder in `--accent`).
- **Brand mark:** a "route" glyph — a down arrow that forks into two paths (one to a folder). Used for the toolbar icon (PNG 16/32/48/128 in `extension/icons/`, accent teal rounded square with white mark), the popup header and the settings header. Source SVG: `docs/design/logo.svg`.
- **Focus:** `outline: 2px solid var(--accent); outline-offset: 2px` on `:focus-visible` (works in forced-colors too; keep the existing forced-colors blocks).

## Download card (content.js)
- 344px wide, bottom-right 20px, opaque surface per tokens.
- **Row 1 (headline):** small `--secondary` label "Saving to" above a large folder button: outline folder glyph (accent) + folder name at 15/600 + chevron. The button looks like a field you can change (subtle `--surface-2` bg on hover, hairline on focus). Full path "Downloads › Projects › Forks" as 11.5px `--secondary` under it when nested.
- **Row 2:** 36px neutral tile with a line icon and 10.5px type label (ZIP) → filename (13/400, middle-ellipsis) · size · site in `--secondary`. ✕ top-right (Cancel download; after an early save it just closes).
- **Remember row** (only after the folder was changed): plain checkbox (accent when checked) + "Always save files from **github.com** here" where the site is a small inline select-like button (scope: site / "all .zip files"). No tinted panel — just a row with a top hairline.
- **Footer:** left = reason as a plain link-style button "Why here?" preceded by the reason text ("Your github.com rule"); clicking it expands a tiny explainer list under the footer: "✓ Websites: github.com → Code" / "– File names: no match" / "– File types: not checked (a website rule matched first)". Right = primary **Save** button (accent fill, 30px, no glow, no ring). "Paused" replaces nothing — show "Paused" as a small `--tertiary` word before the reason when paused.
- **Countdown:** a 2px accent hairline along the card's bottom edge shrinking from full width to 0 over the timeout (pauses in place when paused).
- **Folder menu:** "Folders you use" list with keyboard hints: each of the first 9 items shows its number (1–9) right-aligned in `--tertiary`; pressing the number picks it; typing letters filters the list (with a small filter line at top); Return picks highlighted; Esc closes. Separator; "New Folder…" (⌘N hint), "Rename File…"(⌘R hint is fine as text "R"), "Other Location…" (companion only).
- **Save signature motion:** on Save, the file tile slides/scales toward the folder button (180ms) then the card shows the result state ("✓ Saved to Code") and fades out. Reduced motion: no slide.
- Result/early-save/moved/error states keep their current wording.

## Popup
- 340px, `--bg`. Header: 24px brand mark tile (accent) + "Download Router" 15/600 + switch (accent on).
- **RECENT** grouped as "Today" / "Earlier" section labels. Rows 40px, one line: 24px neutral tile, filename (13/400, ellipsis), then `→ Folder` in `--secondary`, time right in `--tertiary`. Hover: `--surface-2` row + time swaps to "Show in Finder" plain accent text. Max 6 rows.
- **THIS SITE**: one row: globe line icon, "github.com → **Code**", plain accent "Change" button.
- Footer: "Sorted 38 files this week" (count from downloadStats.recentActivity/total if available; else hide) · "Settings" plain accent. Paused: footer shows "Sorting paused".
- No gradients, no glass panels (lists are `--surface` with hairline, radius 12).

## Settings
- `--bg` page, 640px column. Header: brand mark + "Download Router" small, page title "Where downloads go" 20/600, subtitle.
- **Rule chain:** the four sections are joined by a thin vertical line on the left with a numbered node (1–4, accent outline) at each section header; a small caption at the top "Checked top to bottom · first match wins". Sections are plain grouped lists (`--surface`, hairline, radius 12) — no cards inside cards.
- Rows 44px: neutral tile + line icon, name (13/400; secondary line 11.5px), right: "→ Folder" in `--secondary` (folder name at 13/600 `--label`), switch (types) or chevron.
- "Add Website/Name/Type" plain accent buttons in section headers.
- Sheet: `--surface`, radius 16, hairline, no blur behind except a dim `rgba(0,0,0,.28)` backdrop.
- Welcome and rules-change notices: plain `--surface` rows with an accent left border (3px), not glass.
- Download card group and Companion row as plain grouped lists.
- **"Test a download"** row at the top of Everything else? Not now (future).
