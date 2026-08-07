# roam-blueprint

A personal performance fork of the **Blueprint** theme for Roam Research, built on
[`roam-extension-template`](https://github.com/Svyk/roam-extension-template)'s
zero-runtime-dependency, esbuild-based Depot extension scaffold.

This is not affiliated with, endorsed by, or a replacement for the upstream Depot
listing. It exists to run a locally maintained, auditable copy of the theme with a real
`extension.css` file (instead of upstream's JS-string-inlined CSS) and a hand-ported
dark-mode toggle, and to make future performance refactors of the stylesheet possible
against a pinned, provenance-tracked source. **It is never submitted to Roam Depot.**

## Credit and provenance

- Original theme: [`rcvd/blueprint`](https://github.com/rcvd/blueprint) by Alexander Rink
  (alex@goedel.io). Official Depot listing: search "blueprint" in Roam's Depot, or see
  the manifest at `Roam-Research/roam-depot` → `extensions/rcvd/blueprint.json`.
- Pinned upstream commit: `cc1c71784a26bc86da99a1572733c624e9196299`.
- Vendored CSS and full licensing/provenance notes: `vendor/upstream/PROVENANCE.md`.
- The dark-mode toggle in `src/dm-toggle.js` is a plain-JS port of upstream's
  `src/components/dm-toggle.ts` at the same pinned commit — see that file's header
  comment for behavioral notes.

If you want the real thing with the author's ongoing updates and Depot revenue-share
support, install `rcvd/blueprint` from Roam Depot directly instead of this fork.

## What's different from upstream

- `extension.css` is a real stylesheet Roam loads directly, not a `<style>` tag injected
  by a JS string (upstream's `add_css.sh` mechanism). This fork removes that mechanism
  entirely.
- Plain JS + esbuild build (this template's toolchain) instead of upstream's
  TypeScript + webpack + `roamjs-components`. Zero runtime dependencies.
- The dark-mode toggle is rewired onto this template's `src/lifecycle.js` disposal
  contract: every DOM node, event listener, and the settings panel are registered for
  cleanup, so disabling the extension fully restores native Roam UI with no page reload.
- The toggle button still carries the `blueprint-dm-toggle` class exactly as upstream —
  the [Better Tasks](https://github.com/Svyk/better-tasks) extension detects this theme
  via `document.querySelector(".blueprint-dm-toggle")`; losing that class silently
  degrades Better Tasks' theme awareness.

## Commands

```bash
npm run dev    # initial build, then rebuild src/ changes
npm run build  # generate root and deploy artifacts
npm test       # node:test suite
npm run scan:secrets     # fail on common committed credentials
npm run verify:generated # compare source with root/Pages artifacts
npm run check  # build, syntax check, and tests
```

There are no runtime dependencies. The sole build-time dependency is exactly pinned
`esbuild`, with its complete dependency graph locked in `package-lock.json`. It bundles
`src/extension.js` and legitimate relative modules into one browser ESM file while
preserving the default Roam lifecycle export. Browser targeting makes unresolved
packages and Node built-ins hard build failures, and an explicit build guard rejects
HTTP(S) imports so the published extension is self-contained. The build emits no source
map.

Run `npm ci --ignore-scripts --no-audit --no-fund` once after cloning and whenever the
lock changes. The Depot entry point, `build.sh`, performs that clean locked install
itself before building, including when invoked from another working directory.

The secret scanner covers common Roam, OpenAI, Anthropic, GitHub, Google, AWS, Slack, and
private-key formats. Fix a finding rather than suppressing it. For a genuinely synthetic
false positive, put `secret-scan: allow RULE-ID -- REASON` on the same or immediately
preceding line; the reason must contain at least eight characters.

## Roam lifecycle

`src/extension.js` exports `{ onload, onunload }` as the default export, as required by
Roam. `onload` also returns a cleanup callback. Both paths share one idempotent lifecycle
instance, so reloads cannot leave a second active runtime.

Roam automatically removes extension-scoped command palette commands, slash commands, the
settings panel, and `extension.css`. `src/lifecycle.js` also owns resources Roam does not
remove: DOM nodes, listeners, observers, timeouts, intervals, and pull watches. Every
long-lived resource the dark-mode toggle creates is registered here, so `onunload`
disposes them in reverse order and native Roam UI is fully restored without a page
reload.

The settings example follows the current Extension API contract: `get` returns `null`
for an unset key, `set` persists a JSON value, and `settings.panel.create` automatically
stores switch/input/select controls by row `id`.

Reference: [Roam Depot/Extension API](https://roamdocs.fyi/developer-documentation/roam-depot-extension-api).

## Install as a Developer Extension

First run `npm ci --ignore-scripts --no-audit --no-fund`, then `npm run build`. In the
target Roam graph, open **Settings → Roam Depot**, enable **Developer mode**, then use
**Developer Extensions → Load extension**.

For a local build:

1. Choose **Local folder**.
2. Select this repository root—the folder containing `README.md`, `extension.js`, and
   `extension.css`.
3. Local-folder extensions do not auto-start after a new app session because the browser
   requires a fresh filesystem permission. Load the folder again from Developer
   Extensions, or use `Ctrl-D`, then `Ctrl-R`.

This is a private repository with no GitHub Pages deployment — hosted-URL installation is
not available, and that is intentional (see "Private, not published" below).

Developer extensions are installed **per client, not synced through the graph**. Repeat
the local-folder installation on every desktop/browser profile that should run it.
Reload all developer extensions with `Ctrl-D`, then `Ctrl-R`, or use
**Settings → Roam Depot → Developer Extensions → Reload**.

## Private, not published

This repository stays private and is never submitted to
`Roam-Research/roam-depot`. GitHub Pages is not enabled. Publishing would require fresh,
explicit sign-off after review — it is not a side effect of any build, install, or
live-test step performed against this repo.

## Release checklist

- Update `package.json` and `CHANGELOG.md`.
- Run `npm run check`.
- Inspect the generated diff and scan it for secrets.
- Commit source and generated artifacts together.
- Reload the developer extension in a disposable test graph before relying on it.

## License

[MIT](LICENSE) for the template scaffolding and lifecycle/build code in this repository.
The vendored theme CSS and ported toggle behavior originate from `rcvd/blueprint` — see
`vendor/upstream/PROVENANCE.md` for that code's own licensing situation (upstream
declares MIT in `package.json` but ships no `LICENSE` file).
