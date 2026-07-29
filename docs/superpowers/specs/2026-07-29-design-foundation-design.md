# Design foundation — spec

**Date:** 2026-07-29
**Status:** approved, ready for planning
**Source mockups:** `C:\Users\ThinkPad\Downloads\labs design\*.dc.html` (12 screens × en/ka)

## Context

The app is being redesigned from a set of 12 HTML mockups. Those mockups cover 12
screens; the app has 39 page files, 15 shared components and 18 order-form
components. The redesign is therefore split into sub-projects, each of which
ships working software on its own:

1. **Design foundation — this spec.** Tokens, theme, fonts, icons, primitives.
2. App shell — the sidebar layout that replaces the AppBar + Drawer.
3. Doctor area — 5 designed screens plus the undesigned rest.
4. Lab area — 4 designed screens plus the rest.
5. Admin + clinic — no mockups; extrapolated from the system.
6. Landing / public pages.

This spec covers **only #1**. It changes no page. Its deliverable is the shared
vocabulary every later sub-project builds on, and the answer to "global styles we
can use for future features."

## Decisions

| Decision | Choice |
|---|---|
| Approach | Retheme MUI — rewrite tokens + component overrides. No framework change. |
| Dark mode | Keep. Derive a dark palette; the mockups are light-only. |
| Responsive | Responsive by extrapolation — follow mockups ≥1280px, use judgment below. |
| Icons | Material Symbols Rounded, self-hosted (not CDN). |
| Primitives | A minimal set only: `PageHeader`, `StatCard`, `StatusPill`, `Icon`. |

The primitives are a deliberate, small extension beyond pure retheming. Every
mockup repeats the same page header, stat card and status pill; without shared
components, 39 pages would each hand-roll them and drift apart immediately.

## Starting point

`src/theme/tokens.ts` already matches the mockups on: brand `#9292FF`, page
background `#EEF0F5`, paper `#FFFFFF`, text `#0F172A` / `#5B6477`, divider
`rgba(15,23,42,.08)`, card radius 16, button radius 10, chip radius 999, input
radius 10, and the Inter + Noto Sans Georgian stack. Those stay.

The gaps this spec closes:

- **Type scale is too large.** Mockups are compact: 17px page titles, 13.5px nav,
  12–13px body. Current `body1` is 15.2px, `h4` 20px.
- **Weight 800 is unavailable.** It appears 174 times in the mockups;
  `index.html` loads only 400–700, so it renders faux-bold or falls back.
- **No semantic tint tokens**, no muted text, no subtle surface, no focus ring,
  no transition ladder.
- **Fonts come from the Google CDN**, which `docs/ARCHITECTURE.md` §8 already
  flags as a gotcha (breaks offline and strict-CSP).

## Token set

### Light — taken from the mockups

| Role | Value |
|---|---|
| `brand` | `#9292FF` |
| `brandStrong` (active nav, headings on tint) | `#5252CC` |
| `brandLink` / hover | `#6E6EE8` |
| `brandSoft` (avatars, dark-mode primary) | `#B4B4FF` |
| `text.primary` | `#0F172A` |
| `text.secondary` | `#5B6477` |
| `text.muted` | `#8A91A5` |
| `background.default` | `#EEF0F5` |
| `background.paper` | `#FFFFFF` |
| `surface.subtle` | `#FBFBFD` |
| `border` | `rgba(15,23,42,.08)` — `#E2E5EE` where opaque is needed |
| `danger` / tint | `#DC2626` / `#FDEAEA` |
| `success` / tint | `#16A34A`, deep `#15803D` / `#E3F4E8` |
| `warning` / tint | `#F59E0B`, deep `#B45309` / `#FEF3E2` |
| `info` | `#0284C7`; accent teal `#10B981`, indigo `#6366F1`, sky `#54A9EB` |

Tints are the fill behind status pills and alert rows; the deep variant is the
text colour on that fill (e.g. `#B45309` on `#FEF3E2`). Brand pills use
`rgba(146,146,255,.12)` fill with `#5252CC` text.

### Dark — derived

The mockups have no dark mode, but they do contain dark surfaces — the screens
index and the Telegram card on the Lab Dashboard. Those supply real values rather
than guesses:

| Role | Value | Source |
|---|---|---|
| `background.default` | `#151628` | index page + Telegram card |
| `background.paper` | `#1E2036` | derived: same hue, lifted for card separation |
| `text.primary` | `#F1F2FA` | index cover title |
| `text.secondary` | `#A1A6BD` | index subtitle |
| `text.muted` | `#5C6175` | index section labels |
| `divider` | `rgba(255,255,255,.09)` | index footer rule |
| `primary` | `#B4B4FF` | index brand pill text |
| pill fill / border | `rgba(146,146,255,.15)` / `rgba(146,146,255,.35)` | index badge |
| `success` | `#4ADE80` on `rgba(74,222,128,.12)` | index "Interactive" badge |

Danger `#F87171` and warning `#FBBF24` follow the same pattern at `.12` fill —
these two are extrapolated, not sourced, and are the only unverified colours in
the system.

### Radii, motion, elevation

- Radii: `pill` 999, `control` 10, `card` 16, `tile` 11, `chipSm` 8.
- Motion: `fast` 120ms, `base` 140ms, `slow` 160ms — all `ease`. These are the
  three durations the mockups actually use.
- Focus ring: border `#9292FF` plus `box-shadow: 0 0 0 3px rgba(146,146,255,.18)`.
- Shadows: cards are flat (1px border, no shadow). Lift is hover-only:
  `0 10px 30px rgba(146,146,255,.12)`. Primary CTA hover:
  `0 8px 20px rgba(146,146,255,.45)`.

## Typography

One compact scale, in rem so browser font-size settings still work. Weights: 800
headings, 700 emphasis, 600 labels/buttons, 500 inactive nav, 400 body.

| Variant | Size | Weight | Use |
|---|---|---|---|
| `h1` | 2rem (32px) | 800 | landing hero |
| `h2` | 1.625rem (26px) | 800 | landing sections |
| `h3` | 1.3125rem (21px) | 800 | dashboard greeting |
| `h4` | 1.0625rem (17px) | 800 | standard page title |
| `h5` | 0.875rem (14px) | 700 | card title |
| `h6` | 0.8125rem (13px) | 700 | sub-section |
| `subtitle1` | 0.84375rem (13.5px) | 600 | nav item, list emphasis |
| `subtitle2` | 0.78125rem (12.5px) | 600 | dense label |
| `body1` | 0.8125rem (13px) | 400 | default body |
| `body2` | 0.75rem (12px) | 400 | secondary body |
| `caption` | 0.71875rem (11.5px) | 500 | metadata |
| `overline` | 0.6875rem (11px) | 700 | uppercase section label, `.08em` |
| `button` | 0.8125rem (13px) | 600 | no text-transform |

Headings carry negative tracking as in the mockups: `-0.025em` at h1–h3,
`-0.02em` at h4. A `statValue` style (1.75rem/28px, 800, `-0.025em`) is exposed
for `StatCard`.

## Font and icon delivery

Fonts move from the CDN into the bundle, via npm rather than checked-in binaries:

- `@fontsource-variable/inter` — covers 400–800 in one variable file, which is
  what unlocks weight 800.
- `@fontsource/noto-sans-georgian` — weights 400/500/600/700.

The icon font is **not** taken from the `material-symbols` npm package: that
package ships the complete set, 5.2 MB for the Rounded style, which no first
load should pay for. Instead the app carries a Google-generated subset of just
the ligatures it uses — 73 names, ~60 KB, with the variable axes intact so
`'FILL' 1` still works. The list lives in `scripts/icon-names.txt` and
`npm run icons:fetch` (`scripts/fetch-icon-font.mjs`) regenerates
`src/assets/fonts/material-symbols-rounded-subset.woff2`. Adding an icon means
adding a name and re-running that; a missing glyph renders as its literal
ligature text, so the mistake is self-announcing.

Imported once in `src/main.tsx` alongside the existing side-effect imports. The
`<link>` tags in `index.html` are removed in the same change — leaving them would
mean shipping both copies.

Icons get a thin wrapper so pages never touch font-family directly:

```tsx
<Icon name="receipt_long" size={20} filled />
```

It renders `<span className="material-symbols-rounded">` with
`font-variation-settings: 'FILL' <0|1>`, matching the mockups, where active nav
items are filled and inactive ones are not. `@mui/icons-material` stays installed
— MUI's own components (Select arrows, Dialog close, DataGrid) use it internally
— but application code stops importing from it directly.

## Component overrides

Added or changed on top of the existing set:

- **`MuiCssBaseline`** — body background, the `.material-symbols-rounded` base
  class, and `::selection` in brand tint.
- **`MuiButton`** — `contained` gets weight 700 and the brand hover shadow;
  `outlined` becomes the mockups' white button (white fill, `rgba(15,23,42,.12)`
  border, brand border on hover). Padding tightens to `10px 16px` / `10px 18px`
  to match.
- **`MuiOutlinedInput`** — adopt the exact focus ring rather than MUI's default
  1.5px border widening.
- **`MuiChip`** — weight 700, 11px, `4px 11px` padding; `size="small"` becomes
  the status-pill geometry.
- **`MuiCard`** — unchanged geometry, but hover lift added for interactive cards.
- **`MuiListItemButton`** — nav geometry: radius 10, `9px 12px`, 13.5px, weight
  500 → 600 and brand tint when selected.
- **`MuiTooltip`, `MuiMenu`, `MuiDialog`, `MuiSwitch`, `MuiTabs`** — keep current
  styling; only colour tokens change under them.

## Primitives

Four components in `src/components/design/`, each with one job:

- **`PageHeader`** — `{ title, subtitle?, actions?, breadcrumb? }`. The
  title/subtitle block with right-aligned actions that opens every mockup screen.
  Stacks vertically below `sm`.
- **`StatCard`** — `{ label, value, caption?, dotColor?, icon? }`. The 4-up
  metric card from the Lab Dashboard.
- **`StatusPill`** — `{ tone: 'brand'|'success'|'warning'|'danger'|'neutral',
  children }`. The 999-radius tinted pill used for order and payment statuses.
  Existing `OrderStatusChip` / `LabStatusChip` are refactored to render it, so
  their call sites are untouched.
- **`Icon`** — the Material Symbols wrapper described above.

`src/theme/tokens.ts` also exports the raw token objects (not just the built
theme), so one-off `sx` values can reference `tokens.tint.warning` instead of
pasting hexes — which is what keeps future features on-system.

## Responsive rules

The mockups are fixed 1280px. Below that, these rules apply everywhere:

- **≥1280px** — exactly as drawn: 224px sidebar, 1060px max-width content column,
  `26px 28px 80px` padding.
- **900–1280px** — sidebar stays, content column fluid with 24px gutters. Stat
  grids go 4-up → 2-up.
- **<900px (`md`)** — sidebar becomes a temporary drawer behind a menu button (the
  existing `AppShell` behaviour, restyled). Page header stacks; actions go
  full-width. Stat grids 1-up.

Tables that cannot compress (the DataGrid queues) scroll horizontally inside
their card rather than forcing the page to scroll.

## Out of scope

No page is restyled in this sub-project, the shell is not rebuilt, and the
mobile-app mockups (separate iPhone-framed designs) are not addressed. Retheming
alone will visibly shift every existing screen — that is expected and intended;
the per-area sub-projects then fix layout.

## Consequences to carry forward

- Every screen's text gets smaller. Any page relying on default MUI sizing for
  hierarchy will need review in its own sub-project.
- The shell sub-project deletes the top AppBar. `ColorModeToggle`,
  `LanguageSwitcher`, the avatar menu and the newly-added `FeedbackButton` all
  live there today and must be rehomed into the sidebar's user area.
- `OrderStatusChip` and `LabStatusChip` change internals but keep their props.

## Verification

No test framework exists in this repo, so:

- `npm run typecheck` clean.
- `npm run build` succeeds, and the bundle now contains the font files — confirm
  no `fonts.googleapis.com` request remains (grep `dist/` and `index.html`).
- `npm run i18n:check` unchanged from its pre-existing `doctor`/`lab` baseline.
- Visual smoke, both modes, at 1440px / 1100px / 700px: log in as doctor, lab and
  admin, and confirm no page is broken, unreadable, or unstyled — layout will be
  imperfect until the later sub-projects, but nothing may be illegible or
  overflowing.
- Confirm weight 800 actually renders (a heading must be visibly heavier than a
  700 one), proving the variable font loaded.
