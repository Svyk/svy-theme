# Svy Theme

A personal Roam Research theme. Version 0.3.0 paints the Svy palette and leaves
Roam's layout, type, and spacing alone. It is built on
[`roam-extension-template`](https://github.com/Svyk/roam-extension-template)'s
zero-runtime-dependency, esbuild-based Depot extension scaffold.

**Extension URL:** <https://svyk.github.io/svy-theme/> ·
**Published assets:** [`extension.css`](https://svyk.github.io/svy-theme/extension.css) ·
[`extension.js`](https://svyk.github.io/svy-theme/extension.js)

This is not affiliated with, endorsed by, or a replacement for the upstream Depot
listing. Through 0.2.x it shipped that theme's stylesheet. 0.3.0 stopped. The
vendored CSS remains in `vendor/upstream/` for attribution and rollback, and it is
not part of `extension.css`. **It is never submitted to Roam Depot.**

Formerly published as `roam-blueprint` — renamed to Svy Theme on 2026-08-07. The old
install URL (`https://svyk.github.io/roam-blueprint`) is dead; use the URL below.

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

- `extension.css` is a small color sheet (`00-tokens.css` + `10-colors.css`), not
  Blueprint's layout CSS. Block height, fonts, and spacing stay Roam's.
- Plain JS + esbuild. Zero runtime dependencies. No `roamjs-components`.
- The dark-mode toggle is on `src/lifecycle.js`. Disabling the extension removes
  the `svy-theme` class, the toggle, and `extension.css` without a page reload.

## Compatibility contract — do not rename these

Two identifiers are pinned even though the extension itself is now called Svy Theme:

- **`.blueprint-dm-toggle`** — the CSS class on the dark-mode toggle button, unchanged
  from upstream. The [Better Tasks](https://github.com/Svyk/better-tasks) extension
  probes for this exact class at `src/index.js:19874`
  (`document.querySelector(".blueprint-dm-toggle")`) to detect that this theme is active
  and pick matching panel colors. Renaming the class would silently break Better Tasks'
  theme awareness — the naming asymmetry (extension named Svy Theme, class still named
  `blueprint-dm-toggle`) is intentional and permanent until Better Tasks' probe changes.
- **`bp-appearance`** — the extension setting id storing the auto/dark/light choice.
  Roam syncs extension settings through the graph, so this id is user data already
  written into every graph this theme is installed on. Renaming it would orphan existing
  synced values instead of reading them.

## Settings

**Settings → Roam Depot → Svy Theme.** Every row id is prefixed `bp-`.

| Row | id | Control | Default |
|---|---|---|---|
| Appearance | `bp-appearance` | select `auto` / `dark` / `light` | `auto` |
| Svy Beam | `bp-pack-beam` | switch | on |
| Caret color (light) | `bp-beam-caret-light` | input (hex) | `#00695e` |
| Caret color (dark) | `bp-beam-caret-dark` | input (hex) | `#48d0c0` |
| Caret blink | `bp-beam-caret-blink` | switch | off |
| Cursor style | `bp-beam-cursor` | select `svy` / `native` | `svy` |

Roam's settings panel supports only generic `input`, `select`, `switch`, `button`, and
`reactComponent` rows — there is no native color picker. Colors are typed as hex;
invalid values fall back without reaching CSS.

0.4.0 retired the caret overlay and the focus wash, and with them the shape, width,
height, radius, opacity, glow, behavior, wash, wash-intensity, and preview rows. Their
ids are no longer read or seeded, and whatever Roam stored under them stays put. The
caret is the browser's own, colored teal, so typing runs no theme code. For a shaped
caret, install Roam Caret; this theme's caret color yields to it.

### How settings reach the CSS

`src/theme-vars.js` is the theme's only CSS-variable writing path. It reads the settings,
computes the `--svy-beam-*` property set, and publishes it from one injected
`<style id="svy-theme-vars">` element — not inline style on `documentElement`, which
would put every value at the inline specificity level where nothing in a stylesheet,
including the user's own `roam/css`, could override it. The element is registered on the
lifecycle, so unload removes it in one `node.remove()`.

`src/css/40-beam.css` reads every value through `var(--svy-beam-…, <safe value>)`. With
JavaScript unavailable, the researched caret colors and both cursor sets remain: light
art is the `var()` fallback, dark art sits in the `svy-beam-fallback` cascade layer,
which any unlayered published value outranks. A test asserts both directions of the
variable contract: nothing the stylesheet reads is unpublished, and nothing published
is unread.

### Feature-pack gating

Switching **Svy Beam** off puts `svy-off-beam` on `<html>`, and every rule in
`40-beam.css` is scoped under `:root:not(.svy-off-beam)` — one extra class test per rule,
no reload, native caret and cursors restored immediately.

Every `40-beam.css` rule ends in a tag, class, or attribute. A selector that ends in a
bare `:is()` or `:where()` list is tried on every element on every restyle, and a test
fails the build if one comes back.

Color rules in `10-colors.css` are always on. They set color, background, and
border-color only, with literals rather than `var()`. Plugin compatibility
(`20-plugins.css`) and the absorbed `roam/css` pills (`30-absorbed.css`) stay in
the sheet because other extensions and old tag styles read them.

## Commands

```bash
npm run dev    # initial build, then rebuild src/ changes
npm run build  # generate root and deploy artifacts
npm test       # node:test suite
npm run scan:secrets     # fail on common committed credentials
npm run verify:generated # compare source with root/Pages artifacts
npm run check  # build, syntax check, and tests
```

Speed benches drive the live Roam Desktop window over CDP (port 9223):

```bash
# Forced full restyle (the popup path): theme off vs loaded vs a candidate sheet.
CDP_PORT=9223 node tools/restyle-bench.mjs --arm off --arm live --arm "cand=extension.css"
# Typing: real keystrokes into a scratch block in the right sidebar, keydown to frame end.
# `!nojs` detaches the loaded theme's typing listeners for that arm.
CDP_PORT=9223 node tools/typing-bench.mjs --arm off --arm live --arm "cand=extension.css!nojs" --interval 30
```

The typing bench creates a page named `svy-theme typing bench`, types only into its one
block, stops if focus leaves that block, and leaves the block empty. `--cleanup` deletes
the page afterwards.

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

**Hosted URL (recommended):** in the target Roam graph, open **Settings → Roam Depot**,
enable **Developer mode**, then use **Developer Extensions → Load extension** → choose
the URL option and point it at:

```
https://svyk.github.io/svy-theme
```

GitHub Pages serves `extension.js` and `extension.css` straight from the `deploy/`
artifacts on `main`, rebuilt on every push.

**Local folder (for source edits):**

1. Run `npm ci --ignore-scripts --no-audit --no-fund`, then `npm run build`.
2. In Developer Extensions, choose **Local folder**.
3. Select this repository root — the folder containing `README.md`, `extension.js`, and
   `extension.css`.
4. Local-folder extensions do not auto-start after a new app session because the browser
   requires a fresh filesystem permission. Load the folder again from Developer
   Extensions, or use `Ctrl-D`, then `Ctrl-R`.

Developer extensions are installed **per client, not synced through the graph**. Repeat
the installation (hosted URL or local folder) on every desktop/browser profile that
should run it. Reload all developer extensions with `Ctrl-D`, then `Ctrl-R`, or use
**Settings → Roam Depot → Developer Extensions → Reload**.

## Publishing and Depot policy

This repository's source and the built `extension.js`/`extension.css` on GitHub Pages
are public, so the hosted install URL above works and the code is auditable. That is
the only reason it is public — it is **never submitted to `Roam-Research/roam-depot`**,
carries no Depot listing, and receives no Depot revenue share. It is not affiliated
with, endorsed by, or a substitute for the upstream `rcvd/blueprint` Depot listing (see
"Credit and provenance" above). Submitting to Depot would require fresh, explicit
sign-off — it is not a side effect of any build, install, or live-test step performed
against this repo.

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
