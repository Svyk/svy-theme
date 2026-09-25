# Changelog

All notable changes to this project follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-09-24

### Removed

- The Beam caret overlay and its motion. On every input, selectionchange, and
  keyup it measured the caret with a mirror div and forced layouts. In a window
  without Roam Caret (Readwisenotes, 15k elements), typing one key every 120 ms
  took 121.8 ms median from keydown to the end of the next frame with 0.3.6,
  against 64.2 ms with the theme off, and ran 16.9 style recalcs per key
  instead of 5. The caret is now the browser's own, colored teal, with no
  theme code on the typing path. Roam Caret owns shaped carets.
- The focus wash, off by default since 2026-08-07.
- Settings rows for caret shape, width, height, radius, opacity, glow,
  behavior, wash, wash intensity, and the preview. Their ids are no longer
  read or seeded. Values Roam already stored under them stay put.

### Changed

- Every Beam rule ends in a tag, class, or attribute. The pointer-cursor
  `:is()` list, the caret `body :is()` list, and the dark-cursor `:where()`
  fallback were tried on every element on every restyle, and were 56% of the
  theme's traced selector time on the Svy daily page. The dark cursor
  fallback now sits in `@layer svy-beam-fallback`, which published values
  outrank without a zero-specificity list.
- Focus mode keys on the `rm-focus` class Roam adds to a block tagged
  `#.rm-focus`, not on `[data-page-links*=".rm-focus"]` ancestors that every
  bullet and row had to walk and substring-search.
- Fold-caret hover rules use child combinators only. The quick-insert dark
  dash color targets `#inserts_btns > .bp3-icon` instead of every span.
- Traced theme selector time in a forced restyle fell from 37.0 to 9.1 ms on
  the Svy daily page (6 restyles), and from 3.9 to 0.8 ms per restyle on
  Readwisenotes.

### Added

- `tools/typing-bench.mjs`: real CDP keystrokes into a scratch block in the
  right sidebar, keydown to the end of the next frame, with per-key style,
  layout, and script time and an arm switch that detaches the loaded theme's
  typing listeners.
- `tools/restyle-bench.mjs` arms can add classes to `<html>` and `<body>`
  (`name=file.css#class`), so a sheet like Custom Dark Mode's is measured with
  its own gate class.

## [0.3.6] - 2026-09-23

### Changed

- Dark selected text uses the browser highlight again. The theme's
  `::selection` rule matched every element under the page and was the whole
  restyle gap versus the theme being off (about 15ms per forced flush on the
  Svy daily page). The rest of the color sheet, measured alone, sat on that
  floor.

## [0.3.5] - 2026-09-22

### Fixed

- Roam settings no longer shows light vertical bars beside the section list
  and the scrollbar. The dialog was painted the overlay color (`#30404D`),
  and that color showed through the scrollbar gutter. Settings now uses the
  page color.

## [0.3.4] - 2026-09-22

### Fixed

- Quick-insert dashes on headings sit just outside the fold caret instead of
  falling into the next block. The old spacer heights (43/39/39px) were
  measured for Blueprint's tall heading boxes. Native rows are shorter, so
  those dashes overlapped the heading bullet and the block below. H1/H2/H3
  tops are 5/1/-2px and the spacer is 12px.

## [0.3.3] - 2026-09-22

### Fixed

- Light-mode sidebar hover no longer turns the header black. Roam's own
  `.top-row:hover` is `#10161A` and is not limited to dark mode. Light mode
  now uses `#E1E8ED`. The same override covers log buttons and starred pages.

## [0.3.2] - 2026-09-22

### Fixed

- Top bar, left sidebar, and right sidebar use the page color (`#F5F8FA` /
  `#202B33`). The white menu bar and the white sidebar slab were the seams.
  Starred pages, the graph menu, log buttons, and the sidebar top row get that
  same fill. A 1 px shadow is the divider. The menu bar's own bottom line is
  painted the page color.

### Changed

- OS-dark chrome rules are no longer wrapped in `:where()`, so they win against
  Roam's sidebar and topbar rules in Auto dark. Forced light still wins.
- Selectors that required `body.roam-body` are gone. That class lives on a div.
- Plugin dark colors no longer key off `body.bt-theme-dark`.
- The Beam `:has(body.cs-active)` rule is gone. Cursor Smith already hides that
  caret, and `:has()` on the page root is rechecked on body-class changes.
- The focus wash's `:focus-within` rules apply only while `.svy-beam-wash` is
  on. The wash still defaults off.

## [0.3.1] - 2026-09-22

### Fixed

- Page background is painted on `body`. This Roam desktop window puts `.roam-body`
  on a div, so `body.roam-body` never matched and the sampled page background
  stayed white.

## [0.3.0] - 2026-09-22

### Changed

- **Color-only theme.** `extension.css` no longer includes the vendored Blueprint
  sheet (`src/css/00-upstream-base.css`, about 480 KB, moved to
  `vendor/upstream/blueprint-guarded.css` and kept out of the build). Roam's own
  layout, type, and spacing come back. The Svy palette stays: light page
  `#F5F8FA`, dark page `#202B33`, chrome `#FFFFFF` / `#182026`.
- Public tokens (`--svy-*`, `--bc-*`, `--cl-*`, `--ff-main`, tag aliases) moved to
  `src/css/00-tokens.css`. Paint is literal color in `src/css/10-colors.css`.
  Dark paint does not key off `body.bt-theme-dark`, so Auto does not latch dark
  after Better Tasks leaves that class behind.
- `<html>` gets `svy-theme` while the extension is loaded and loses it on unload.

## [Unreleased]

### Added

- **Folded-bullet cue** (`src/css/42-fold-cc.css`, CSS-only): a static caret-colored
  halo on `.rm-bullet--closed` (`--svy-beam-caret` in both modes, with per-mode
  fallbacks so the cue survives the beam pack being switched off) — a soft
  color-mix glow that hugs the ~5px painted disc via negative spread, scaled so
  adjacent bullets never smear. No rest-state caret, triangle, or count: the native fold
  caret is unhidden on hover of the block's own line only. Replaces the v0.2.0
  hollow ring plus `data-svy-cc` child count and deletes the `bp-fold-cc` setting
  and its observer/pull path (`src/fold-cc.js`).
- **Chief of Staff chat panel** (`src/css/20-plugins.css`): remaps
  `[data-chief-chat-panel]` `--cos-*` tokens onto `--svy-*` (raised surface,
  accent border on the user bubble, no tinted fills, theme font). `!important`
  on the vars COS `syncCosTheme()` writes inline so dark mode follows Svy
  instead of Tailwind slate/blue. Chat/Activity tab labels and the composer
  Send button are `<button>`s that kept Blueprint ink; they now follow
  `--svy-text` / `--svy-text-muted` on all five dark signals. Send has no
  `.chief-tab` / `.chief-panel-btn` class, so `.bp3-dark button` had painted
  it `#202B33` on `#202B33`.

- **Svy Beam v3** (`src/caret-overlay.js`, `src/css/40-beam.css`): replaces the heavy
  full-cell default with a 3px rounded beam at 82% line height. Adds beam, block, outline,
  underline, classic bar, and native styles; 50–200% width scale; 30–120% height; 0–12px
  radius; 45–100% opacity; none/soft/halo glow; and responsive, steady, glide, breathe,
  and comet behaviors. The renderer uses one fixed pointer-inert node, responds only to
  editing/selection/viewport events, keeps all motion composited, and becomes steady when
  `prefers-reduced-motion: reduce` is active. The exact old `block` default migrates once
  to `beam`, guarded by `bp-beam-caret-v3-migrated-2026-08-08`; later user choices persist.
- **GitHub Pages home page** (`site/index.html`): the extension URL now opens a real,
  responsive landing page instead of GitHub's 404. It uses the canonical Svy light and
  dark palettes, follows the system theme with an explicit mode toggle, previews the
  live insertion caret, and links directly to the two published extension assets.
  `build.mjs` copies the page into `deploy/`, and generated-artifact verification rejects
  drift between the authored and deployed copies.
- **Svy Beam v2** (`src/css/40-beam.css`): the caret, focus wash, and custom cursors from
  the personal `roam/css` Beam patch, rebuilt so every value flows through a
  `--svy-beam-*` custom property with the v1 value as its CSS fallback. The layer renders
  identically to v1 with no JavaScript.
- **`src/theme-vars.js`** — the theme's first CSS-variable writing path. Reads the
  settings, computes the `--svy-beam-*` set (including the three cursor SVG data URIs,
  built in JS so the cursor palette follows the caret token), and publishes them from one
  injected `<style id="svy-theme-vars">` element registered on the lifecycle. An injected
  sheet rather than inline style on `documentElement`, so `roam/css` can still override.
- Detailed settings panel: master switch `bp-pack-beam`, caret color light/dark (hex
  inputs, validated — junk falls back to the default instead of publishing a broken
  property), caret shape, caret blink, focus wash, wash intensity, cursor style, and a
  stateless `reactComponent` preview strip rendered with Roam's own `window.React` (zero
  bundled dependencies; omitted when `window.React` is absent).
- Feature-pack gating for the beam layer: switching the pack off puts `svy-off-beam` on
  `<html>` and every rule in `40-beam.css` is scoped under `:root:not(.svy-off-beam)`,
  so the layer disables with no reload.

### Fixed

- **Folded-bullet halo is visible again** (`src/css/42-fold-cc.css`): the v0.2.2
  negative-spread outer box-shadow painted behind the fill and upstream's
  `overflow: hidden` on `.rm-bullet__inner` clipped whatever was left, so folded
  bullets showed no glow at all. The halo is now a `filter: drop-shadow()` pair —
  which follows the alpha of the ~5px content-box disc — plus
  `overflow: visible !important` on the closed inner only, so the glow can escape
  the clip without touching layout geometry or any other bullet.
- **Folded-bullet halo no longer enlarges the bullet** (`src/css/42-fold-cc.css`): the
  `0 0 0 1.5px` spread ring drew around the 12.3px border-box, so folded bullets read
  as bigger donuts than their open siblings. The halo is now a negative-spread
  (`-3.65px`, the transparent border width) box-shadow whose glow originates at the
  ~5px painted disc's edge — same disc diameter as an open bullet, only extra ink is
  a soft caret-colored glow. Layout geometry of `.rm-bullet` / `.rm-bullet__inner`
  is untouched.
- **Beam overlay on CSS-transformed surfaces.** Plexus Diagram (`.pxd-world` /
  `.pxd-root`) and Roam Grid (`.rg-root` / `.rg-portal`) scale their canvases with
  `transform: scale()`. `measureCaretRect` now derives `scaleX` / `scaleY` from
  `getBoundingClientRect` versus layout size so mirror offsets map into viewport space
  without the jump at zoom ≠ 1; the custom beam paints there again with the same
  suppression and cursor rules as the rest of Roam.
- **Auto no longer latches dark in daytime.** Better Tasks stamps `body.bt-theme-dark`
  as a *follower* of this theme (toggle icon + `.bp3-dark` + body luminance). The
  dark-signal bridge treated that class as a *source* and re-stamped `.bp3-dark`
  whenever Auto cleared the forced stamps, so a Dark → Auto jump — or a night of
  OS-dark that left BT's class behind — kept the page dark after macOS had already
  switched to light. Auto now follows the OS plus independent host markers
  (`body.roam-body.dark`, `.rm-dark-theme`) only. Live-probed 2026-08-16: Auto +
  `prefers-color-scheme: light` + leftover `bt-theme-dark` painted `rgb(32, 43, 51)`
  until `.bp3-dark` was removed, at which point the page went `rgb(245, 248, 250)`.
- **Auto appearance actually follows the system.** `applyAppearance("auto")` used to
  clear only `.bp3-light`, so a settings jump from Dark to Auto left `.bp3-dark` stamped
  and the page dark forever; Auto now clears both forced stamps, and
  `data-bp-appearance` on `<html>` records the setting separately from the resolved
  theme class. The dark-signal bridge now treats the OS `prefers-color-scheme: dark`
  media query as a dark signal in Auto — stamping its own removable `.bp3-dark` and
  re-syncing when the media query changes — so Roam core and extensions keyed only on
  `.bp3-dark` follow the OS. The topbar toggle shows the current mode (`Auto` / `Dark` /
  `Light`) next to the icon, with a matching `title` / `aria-label`, and the settings
  description documents the cycle.
- **README settings drift.** The settings table now matches the shipped runtime defaults:
  light caret `#00695E`, focus wash off, and wash intensity off.
- **Theme-adaptive cursors.** Beam v1 painted one cursor set on both surfaces, with
  `#182026` ink that vanishes into the dark page. `theme-vars.js` now publishes a set per
  mode: light keeps the v1 art, dark uses an `#E1E8ED` outline (APCA Lc -88.5 on the dark
  surface) with `#182026` as the interior fill and `#48D0C0` — the dark caret — as the
  accent and spark, so the cursors and the caret read as one identity hue. The dark set is
  published under the same five dark signals the rest of the theme uses, and
  `40-beam.css` carries the same values baked into zero-specificity `:where()` blocks so
  the behavior holds with JavaScript absent without ever outranking a user's own caret
  color. Customizing either caret still recolors that mode's spark.
- **Light caret contrast**: the default moved from `#008478` (APCA Lc 66.8) to `#00695E`
  (Lc 77.6), which clears the thin-stroke floor a caret has to meet. A graph that already
  seeded the old default is migrated once on load; any other stored value is left alone.
- **Native table add-row / add-column affordance on dark.** Roam's `site.css` ships a
  `.bp3-dark` block for `.rm-table` but no entry for the two add buttons, whose only
  visible state is a mode-independent `:hover { background: #E1E8ED; color: #5C7080 }` —
  so hovering a dark table painted a near-white bar across its bottom edge and down its
  right side. `10-fixes-dark.css` now gives them the dark table palette (`#2b3a42`
  surface, `#738091` border, `#8A9BA8` glyph) under all five dark signals.
- Beam auto-mode dark defect: with nothing stamped and the OS in dark mode, the light
  teal caret `#008478` sat on the dark page at APCA Lc -26.6. Added the guarded
  `@media (prefers-color-scheme: dark) { :root:not(.bp3-light) … }` fallback — the same
  fifth dark signal the rest of the theme uses.
- Dark caret is now `#48D0C0` (APCA Lc -62.9 on `#202B33`) per the U6 design-token
  research, replacing v1's `#66E3D0`.
- The P3 OKLCH override now covers the focus wash tint as well as the caret; v1 expanded
  only the caret, so a P3 display got a wide-gamut caret over an sRGB wash.
- `prefers-reduced-motion: reduce` now disables the focus wash outright instead of only
  removing its transition, matching the design-token motion policy.

- **Native table cells had no theme at all.** Probed live: Roam paints
  `.rm-table table { background: white }` / `th { background: #F5F8FA }` in light, and its
  dark fill is keyed on `.bp3-dark` **only** — so under `body.bt-theme-dark`,
  `.rm-dark-theme`, `body.roam-body.dark`, or Roam's auto mode the table rendered white on
  a dark page. `10-fixes-dark.css` now sets cell and header surfaces under all five
  signals. In light the cells take `--svy-surface` (`#F5F8FA`) with an `--svy-raised`
  (`#FFFFFF`) header, so a table reads as a panel instead of bare white cells on the white
  page canvas. `.roam-table` (legacy DOM) gets the same treatment. Font size is never
  reduced on dark (U6/Piepenbrock).
- **`[[` / `((` autocomplete menu matches the theme in both modes.** Roam's dark branch for
  the menu covers `.bp3-dark` only, so under the other four dark signals the whole popup
  rendered light on a dark page; and in light mode the footer was a neutral `#EBECEB` gray
  that clashed with the theme's blue-gray palette while the borderless white menu blended
  into the white page. `.rm-autocomplete__results`, `__preview`, `-footer`,
  `-footer__action--active`, `-footer__action__hotkey__icon` and `__preview-placeholder`
  are now token-driven, so one declaration list serves both modes; the menu gained a real
  `--svy-border` outline. The menu's text color now holds the `#E1E8ED` band on dark
  instead of Roam's `#F5F8FA`, which is past the APCA dark-text ceiling. Dark chip states
  carry an inset ring as well as a fill, because dark fills clip below the Lc 15
  invisibility point. Selectors are class-only and at most two compound selectors deep,
  and no rule uses `!important` — the popup is the measured hot path.
- **Roam Grid follows the theme with no changes to Roam Grid.** `~/roam-grid` reads
  `--bc-main`, `--bc-menu`, `--bc-hover`, `--cl-gray-550`, `--cl-blue`, `--cl-text-color`
  and `--ff-main` with hardcoded fallbacks; the theme previously defined none of them.
  With the token API published, the grid body, toolbar, header, grid lines, muted text and
  accent all resolve from the palette in both modes — and because the grid's light branch
  still reads these tokens while having no `prefers-color-scheme` fallback of its own, it
  now follows the theme into dark in Roam's auto mode too. One compensating rule was
  needed: the grid reads `--bc-main` for both `--rg-bg` and (in its light branch)
  `--rg-border-strong`, so defining the token collapsed its outer border into its body
  fill; `:root .rg-root { --rg-border-strong: var(--svy-border); }` restores it, and
  resolves to the same `#738091` the grid hardcodes on dark, so it is a no-op there.

### Changed

- **The focus wash is off by default** (`bp-beam-wash` → off, `bp-beam-wash-intensity` →
  `off`): the caret alone marks the focused block. Existing graphs are migrated once,
  guarded by a `bp-beam-wash-migrated-2026-08-07` marker so a user who turns the wash back
  on is never overridden again; the marker is written after the flip so an interrupted run
  retries. The stored intensity is deliberately preserved, so re-enabling the switch
  restores the intensity the user had chosen. `40-beam.css`'s JS-absent fallbacks moved
  from Beam v1's values to `transparent` / `0ms` — a fallback frozen at v1 would repaint
  the wash exactly in the cases the settings panel cannot reach (failed bundle load, stale
  cached build). Caret colors and the cursor palettes are unchanged.
- **Public token API published** (`src/css/10-fixes-dark.css`, section 0): the canonical
  `--svy-*` palette plus the legacy `--bc-*` / `--cl-*` / `--ff-main` / `--tag*` aliases,
  under `:root` and all five dark signals. Values come verbatim from
  `~/research/2026-08-07-svy-theme-design-tokens.json`; the light and dark palettes are
  independently calibrated and no dark value is derived by inverting its light twin. The
  legacy names are mapped by the role their consumer's fallback implies rather than by
  what the name says — `--bc-menu` is read as a border tone, not a background, and mapping
  it by name would have erased Roam Grid's inner grid lines. The full alias block is
  repeated in each of the three mode blocks because custom-property substitution resolves
  at the element carrying the referencing declaration, and two of the five dark signals
  land on `<body>` rather than `<html>`.
- Renamed the repository and extension from `roam-blueprint` to **Svy Theme**
  (`Svyk/svy-theme`, install URL `https://svyk.github.io/svy-theme`). Package name,
  description, and the settings panel `tabTitle` ("Svy Theme") were updated to match.
  The old GitHub Pages URL (`https://svyk.github.io/roam-blueprint`) is dead — reinstall
  from the new URL. The `.blueprint-dm-toggle` CSS class and the `bp-appearance` setting
  id are intentionally unchanged: Better Tasks probes the class name directly
  (`~/better-tasks/src/index.js:19874`), and the setting id already carries synced user
  data across graphs. See README's "Compatibility contract" section.
- Forked from `roam-extension-template` as `roam-blueprint`: vendored upstream
  `rcvd/blueprint` theme CSS (pinned commit `cc1c71784a26bc86da99a1572733c624e9196299`)
  as a real `extension.css`, replacing upstream's JS-string-inlined `add_css.sh`
  mechanism.
- Ported upstream's dark-mode toggle (`src/components/dm-toggle.ts`) to plain JS at
  `src/dm-toggle.js`, wired onto this template's lifecycle disposal contract. Preserves
  the `blueprint-dm-toggle` class Better Tasks depends on and the `bp-appearance`
  auto/dark/light setting.

## [0.2.4] - 2026-09-07

### Fixed

- **Cursor Smith caret yield** (`src/caret-overlay.js`, `src/css/40-beam.css`): Svy Beam
  now hides its overlay and stops stamping `svy-block-caret` when Cursor Smith is loaded
  (`__ROAM_CURSOR_SMITH_VERSION` or `body.cs-active`), so Smith's canvas caret is the
  only insertion point. Beam stays on when Smith is absent.

## [0.1.0] - 2026-08-03

### Added

- Modular source and deterministic browser-ESM build with exactly pinned esbuild.
- Root Depot artifacts and matching GitHub Pages output.
- Idempotent lifecycle helpers for commands, watches, DOM, events, observers, and timers.
- Verified Roam settings panel example.
- Node test suite, CI, and GitHub Pages deployment workflow.
- Node.js 20-compatible build paths and browser-platform dependency enforcement.
- Build-time rejection of unresolved packages, Node built-ins, and remote imports.
- Generated-artifact drift enforcement and an automated secret scanner.
- Immutable GitHub Actions revisions and exact Developer Extension installation guidance.
