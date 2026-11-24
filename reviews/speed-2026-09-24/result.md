# svy-theme speed pass, 2026-09-24

Commits: `3358efa` (0.4.0, overlay and unbucketed rules out), `f5ee6e5` (0.5.0, caret handed to Roam Caret). Both pushed to `origin/main`; CI and Pages green. Pages serves 0.5.0 byte-identical to the build (`cmp` of the served `extension.css`).

## Verdict

Svy graph meets the bar. Typing is on the theme-off floor, and forced restyle is +0.8 ms over off against +26.7 ms for a Custom Dark Mode sheet. The lag the user felt came from the Beam caret overlay in windows without Roam Caret, plus one Readwisenotes window still running a stale 568 KB pre-0.3 build. Neither remains after a reload.

Typing on Svy costs about 51 ms per key with the theme off. About 46 ms of that is Roam's own `shared.js`. An 88-key burst at 30 ms per key builds a queue of about 3 s with no theme at all. No theme can remove that.

## Method

- `tools/typing-bench.mjs`: real CDP `Input.dispatchKeyEvent` keys into one scratch block ("svy-theme typing bench") in the right sidebar, with the daily page in the main view. Each run types 44 characters, then 44 Backspaces. The page times keydown to the end of the next frame (a MessageChannel task posted from `requestAnimationFrame`). A second figure times each key's scheduled wall-clock moment to frame end, so queueing counts. Per-key style, layout, script, and task time come from `Performance.getMetrics` deltas. The mouse rests on the block. Arms are interleaved and shuffled. `!nojs` detaches the loaded theme's typing listeners for that arm.
- `tools/restyle-bench.mjs`: forced full restyle of everything under `#app`, n per arm as shown.
- CDM arm: Custom Dark Mode's own `buildThemeCss` (default preset) from github.com/RoamJS/custom-dark-mode at `71e87b9`, with its `roamjs-custom-dark-theme` class on `<html>` and `<body>`. The CDM arm also has the theme's typing listeners detached.
- Svy was in explicit Dark with Roam Caret 0.5.1 active, so 0.3.6's overlay was already idle there.

## Before (0.3.6 live, before any change)

| Window, pacing | Theme off | 0.3.6 | CDM sheet |
|---|---|---|---|
| Svy, 120 ms/key, median keydown→frame | 51.2 ms | 51.3 ms (+0.1) | 52.0 ms (+0.8) |
| Svy, style per key | 1.49 ms | 1.56 ms | 2.36 ms |
| Readwisenotes (stale 568 KB build + overlay), 120 ms/key | 67.7 ms | **9,174 ms** | 381 ms (overlay still attached) |
| Readwisenotes, style per key | 22.3 ms | **1,137 ms** | 67.5 ms |

The overlay's share alone (Readwisenotes, 0.3.6 CSS with and without its listeners, 120 ms/key): 205.6 ms against 68.6 ms, with 16 style recalcs and 9.7 layouts per key instead of 5 and 4.

## After (0.5.0 as served by Pages)

### Typing, Svy

| Pacing | Theme off | 0.3.6 live | 0.5.0 | CDM sheet |
|---|---|---|---|---|
| 120 ms/key, median keydown→frame (n=440) | 51.5 ms | 51.25 ms | **51.0 ms** (−0.5, CI −0.85 to −0.3) | 51.4 ms |
| 120 ms/key, style per key | 1.47 ms | 2.33 ms | **1.47 ms** | 2.25 ms |
| 30 ms/key stress, task per key (n=352) | 53.2 ms | 52.5 ms | **52.3 ms** | 53.1 ms |
| 30 ms/key stress, style per key | 1.24 ms | 1.33 ms | **1.33 ms** | 1.96 ms |
| 30 ms/key stress, queued median / max | 1,539 / 2,983 ms | 1,283 / 2,906 ms | **1,356 / 2,854 ms** | 1,416 / 3,339 ms |

### Restyle (forced, all of `#app`)

| Window | Theme off | 0.3.6 | 0.5.0 | CDM sheet |
|---|---|---|---|---|
| Svy, 3,615 elements, n=200 | 39.0 ms | 41.8 ms (+2.8) | **39.8 ms (+0.8, CI 0.3–1.2)** | 65.7 ms (+26.7) |
| Readwisenotes, 14,810 elements, n=40 | 191.9 ms | 215.9 ms (+24.0) | 209.6 ms (+17.7) | 292.2 ms (+100.3) |

### Typing, Readwisenotes (no Roam Caret)

| Pacing | Theme off | 0.3.6 + overlay | 0.5.0 | CDM sheet |
|---|---|---|---|---|
| 120 ms/key, median keydown→frame (n=352) | 64.1 ms | 113.7 ms (+49.6) | **64.9 ms** (+0.8, CI −2.3 to 3.4) | 77.3 ms (+13.2) |
| 30 ms/key stress, queued median / max | 1,416 / 2,800 ms | 3,013 / 5,875 ms | **1,462 / 3,310 ms** | 1,799 / 3,588 ms |
| 30 ms/key stress, task per key | 55.1 ms | 90.6 ms | 57.5 ms | 65.9 ms |

The Readwisenotes restyle gap (+17.7 ms on 14.8k elements) was not chased further. The user set the Svy graph as the bar.

## Where the theme's selector time went

Traced `SelectorStats` over forced restyles: Svy theme selectors 37.0 → 9.1 ms (6 restyles); Readwisenotes 3.9 → 0.8 ms per restyle.

| Before, Svy | Traced µs | Fix |
|---|---|---|
| `:root:not(.svy-off-beam) :is(a, button, …)` pointer cursor | 10,598 | split into bucketed selectors |
| `:where(…dark signals…)` dark cursor fallback | 5,757 | `@layer svy-beam-fallback` |
| `:root:not(.svy-off-beam) body :is(input, textarea, …)` caret | 4,355 | split; caret rules then removed in 0.5.0 |
| focus mode `.roam-block-container[data-page-links*=".rm-focus"] …` (about 20 rules) | ~9,000 | `.roam-block-container.rm-focus` (Roam adds the class for `#.rm-focus`) |
| `:root.bp3-dark #inserts_btns span` | 697 | `#inserts_btns > .bp3-icon` |

## What changed

- Deleted `src/caret-overlay.js`, the motion keyframes, the focus wash, and every caret property. Roam Caret owns the caret. A test fails the build if any layer sets `caret-color`, `caret-shape`, or `caret-animation`.
- The theme's JS now runs nothing on the typing path. What remains: the dark-signal bridge (class-attribute observers on `<html>` and `<body>`), the toggle click, and the toggle's mount watcher, which disconnects within 30 s.
- Settings: Appearance, Svy Beam, Accent color (light/dark, same `bp-beam-caret-*` ids), Cursor style. Retired ids are not read or seeded; stored values stay.
- Kept: the palette, the Svy cursor art (about 0.4 ms of a forced Svy restyle), the fold halo, pills, query hiding, focus mode, sidenotes.

## Follow-ups for the user

- The Svy window still runs 0.3.6 until Ctrl-D then Ctrl-R. The encrypted graph may ask to be unlocked after the reload.
- Readwisenotes has no Roam Caret loaded. With 0.5.0 its caret is the plain native one until Roam Caret is installed there.
