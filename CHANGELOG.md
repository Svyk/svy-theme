# Changelog

All notable changes to this project follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

### Changed

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
