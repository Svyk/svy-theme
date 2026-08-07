# Changelog

All notable changes to this project follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
