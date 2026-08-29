# Changelog

All notable changes to this project follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
