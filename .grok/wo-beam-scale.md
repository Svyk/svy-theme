# WO svy-theme — scale-aware Beam on transformed editors

HARNESS: `~/.claude/scripts/cursor-run.sh --mechanical`
CWD: `/Users/svyatoslavkleshchev/svy-theme`
Author if you commit (you must NOT commit): `git -c user.name="Svyatoslav Kleshchev" -c user.email="svyk@icloud.com"`
DO NOT commit. DO NOT push. Stop after `npm run check` is green.

Plexus v0.4.2 skipped Beam on `.pxd-root` because `measureCaretRect` added unscaled `offsetLeft` to a scaled `getBoundingClientRect` (jump at zoom ≠ 1). The skip fixed the jump and killed the beam. Restore the overlay with a scale-aware measure.

## Code

`src/caret-overlay.js`

1. Delete `OVERLAY_EXCLUDED_ROOTS` and `isOverlayExcludedTarget`. `isTextTarget` must return true for textareas inside `.pxd-root` / `.pxd-world` / `.rg-root` / `.rg-portal`.
2. In `measureCaretRect`, after `const box = element.getBoundingClientRect()`:

```js
const offsetW = element.offsetWidth || 0;
const offsetH = element.offsetHeight || 0;
const scaleX = offsetW ? box.width / offsetW : 1;
const scaleY = offsetH ? box.height / offsetH : 1;
const x = box.left + (borderLeft + measured.left - (element.scrollLeft || 0)) * scaleX;
const y = box.top + (borderTop + measured.top - (element.scrollTop || 0)) * scaleY;
```

   Scale `measured.width` / `measured.height` by `scaleX` / `scaleY` in the returned rect. Content box used for `visible` already comes from `box` (viewport space) — keep that.

3. Export `measureCaretRect` remains. Add a test helper export only if tests need the scale factors; do not add new public API otherwise.

`src/css/40-beam.css`

Remove the block that forces native caret + `cursor: text` inside `.pxd-root` / `.rg-root` (the comment starting "Plexus Diagram and Roam Grid scale…"). Overlay textareas must use the same Beam rules as the rest of Roam (`caret-color: transparent` while `.svy-block-caret` is on, custom text cursor).

## Tests

`test/caret-overlay.test.js`

- Replace `isTextTarget skips textareas inside scaled diagram/grid surfaces` with: a textarea inside `.pxd-root` **is** a text target.
- New test: fake a textarea whose `getBoundingClientRect` is 2× `offsetWidth`/`offsetHeight` (zoom 2). Set `offsetLeft`/`offsetTop` of the mirror path… the fake document's mirror offsets are 0 today, so instead stub `element.offsetWidth`/`offsetHeight` vs a doubled `getBoundingClientRect` and stub `measured` via a non-zero `selectionStart` **or** directly assert that when `offsetWidth` is 100 and `box.width` is 200, a caret at local x=0 still sits at `box.left` (scale applied, no jump), and if you can inject a non-zero `offsetLeft` on the marker, the viewport x is `box.left + offsetLeft * 2`.

  Practical path: give the textarea `getBoundingClientRect: () => ({ left: 100, top: 50, width: 200, height: 40, right: 300, bottom: 90 })` and `offsetWidth: 100`, `offsetHeight: 20`. Mirror offsets in the fake are 0, so returned `x` must stay 100 (not 100 + unscaled mix). Also assert `rect.width` is doubled vs the unscaled glyph width when scaleX=2.

- Keep existing overlay stamp/hide tests green.

## Version

Bump the theme patch if `package.json` has a version you already bump on Beam fixes; otherwise leave version unless CHANGELOG for Unreleased already tracks Beam. Add a short Unreleased bullet: Beam overlay now measures CSS transform scale so Plexus/Grid editors get the beam without the jump.

`npm run check` must pass. No commit.
