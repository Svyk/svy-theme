TOUGH speed review. Read-only. Do not edit any file.

You are Opus 5.5 doing the local ultrareview of svy-theme. The working tree is clean on main (0.3.5, commit c430180), so there is no uncommitted diff. Review the shipped theme for restyle speed. The goal is a sheet whose popup cost sits on the theme-off floor.

## Measured baseline (Svy daily page, Custom Dark Mode off, 12 forced layouts via class toggle + getBoundingClientRect)

- Old Blueprint sheet: about 2.35s
- svy-theme 0.3.1 color sheet: about 0.28s
- Theme sheet off: about 0.24s

0.3.1 was already in the off band. Later commits (0.3.2–0.3.5) added chrome, hover, heading-insert, and settings rules. Say whether those additions are likely to move the number, and which current rules still cost more than the off floor. Do not invent a new timing. If you cannot measure, mark the cost as inferred from selector shape.

## What to read

Read these in full before judging:

- src/css/00-tokens.css
- src/css/10-colors.css
- src/css/20-plugins.css
- src/css/30-absorbed.css
- src/css/40-beam.css
- src/css/41-beam-motion.css
- src/css/42-fold-cc.css
- src/theme-vars.js (class toggles on html)
- src/index.js only for how the sheet is installed and removed

extension.css is the concatenation. 30-absorbed.css is about 32KB of the 75KB sheet. 10-colors.css is literal colors with a depth cap of 2.

## How Roam pays for CSS

Popup restyle cost is selector shape, not gzip size. Expensive: `:has()` on :root, attribute substring (`*=`), universal `*`, deep descendant chains, `:focus-within` on many blocks, custom-property cascades that invalidate the page, rules that match on every style recalc because they are not guarded. Cheap: a small set of class selectors with literal colors, removed entirely when the theme is off.

## Do not recommend

- Restoring vendor/upstream/blueprint.css or tree-shaking it again (that recovered 0.6ms and broke highlights).
- A TypeScript or roamjs-components port. Custom Dark Mode is fast because the sheet is small, not because it is TypeScript.
- Painting from `body.bt-theme-dark` (Better Tasks follower; it latches Auto dark). `body.roam-body` never matches: `.roam-body` is a div.
- New `.bp3-light` stamps. The appearance toggle already stamps forced light.
- Dropping the public API: `.blueprint-dm-toggle`, setting ids `bp-*`, custom properties `--bc-*`, `--cl-*`, `--ff-main`, `--svy-*`, and the pill aliases.
- Body must still paint the page background. Extensions sample it.

## Review lenses

Cover all three, but rank by restyle cost:

1. Performance. Which rules, files, or selectors to delete, narrow, or gate so the steady-state restyle stays on the off floor. Be specific: file, selector, why it invalidates, what to replace it with. Separate "measured noise, keep" from "cut this".
2. Correctness of the speed architecture. Places the 0.3.x rules can lose to Roam (specificity ties, `:where()`, transition lag) or can regress light/dark.
3. Architecture. Duplication across the five dark signals, layers that no longer earn their bytes, settings or plugin rules that escaped the color-only budget.

For each issue:

## [Short title]
**File:** path:line
**Severity:** critical | warning | suggestion
**Type:** performance | correctness | architecture
**What is wrong:**
**Impact:** restyle cost or what breaks
**What needs to change:** specific enough to apply

If a layer is fine, say so. End with a ranked cut list: do these, in this order, and the expected effect on the 0.28s vs 0.24s gap. Do not propose cuts that only shrink file size.

Write the full review as your final message. Do not edit the repo.
