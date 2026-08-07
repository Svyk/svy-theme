# Unit order: fill `src/css/10-fixes-dark.css` and `src/css/20-plugins.css`

Repo: this repo (`~/svy-theme`). Build: `npm ci --ignore-scripts --no-audit --no-fund`
then `npm run check` — MUST exit 0 before you finish. The build concatenates
`src/css/*.css` in filename order into `extension.css` + `deploy/extension.css`;
`npm run build` regenerates them. NEVER edit `src/css/00-upstream-base.css`, `vendor/`,
or `src/*.js`. Your entire output is the content of the two layer files (keep their
first banner comment line) plus regenerated artifacts.

Commit at the end, author `Svyatoslav Kleshchev <svyk@icloud.com>`, message
`fix: dark-mode defect pack + plugin compatibility layers (U2/U3)`. **Do NOT push.**

## Dark-signal contract — every dark rule in both files uses this exact pattern

There are FIVE dark signals and one trap: in Roam's auto mode `.bp3-dark` is stamped
NOWHERE. `bp3-dark` lives on `<html>` (never write `body.bp3-dark` alone). For every
dark override, emit BOTH:

```css
:root.bp3-dark <sel>, body.bt-theme-dark <sel>, .rm-dark-theme <sel>,
body.roam-body.dark <sel> { ... }
@media (prefers-color-scheme: dark) { :root:not(.bp3-light) <sel> { ... } }
```

(That guarded media block is what makes auto mode work AND keeps forced-light clean —
the upstream base's ~611 unguarded media blocks are the bug family we're not repeating.)

## `10-fixes-dark.css` — un-break the base layer's dark mode

The base layer (00-upstream-base.css) line refs below are the evidence; you OVERRIDE
from the later layer, never edit the base. Beat `!important` where the base uses it
(your selectors are later in the cascade at equal specificity, or raise to the compound
forms above).

1. **Tooltips: un-invert.** Base :6717-6828 makes dark-mode tooltips cream
   (`#e1e8ed` bg / `#30404d` text) with a black arrow. Override so tooltips in dark
   match the light branch: `.bp3-tooltip .bp3-popover-content` bg `#30404d`, color
   `rgb(245,248,250)`; `.bp3-popover-arrow-fill` fill `#30404d`; arrow-border fill
   sanity; `.bp3-tooltip .bp3-heading` color `rgb(245,248,250)`; the
   `.bp3-popover-content code` colors readable on the dark surface. Also cover
   `.roamjs-workbench-livepreview-toolip` (base :14480) the same way.
2. **Tooltip token contract** (consumed by the block-stats extension): define on `:root`
   (light): `--bc-tooltip__content: #394b59; --co-tooltip__content: rgba(255,255,255,0.87);
   --bt-tooltip: 1px solid rgba(255,255,255,0.14); --ff-app__div: inherit;
   --fs-tooltip__content: 13px;` and under the dark pattern keep the same values
   (tooltips stay dark in both modes — that is the point).
3. **`.roam-table` borders** (base :12150): dark border `#30404d` is ~1.3:1 against the
   `#202b33` page. Override dark `th/td/tr` borders to `#5f6b7c` and restore
   `font-size: 1rem` (the base's dark branch drops it).
4. **`table.bp3-html-table`**: base has no borders and no dark branch at all. Add:
   light borders `#d4d8de`, dark `#5f6b7c`, both modes `border-collapse: collapse`,
   cells `1px solid`, plus a readable dark header background `#2b3a42`.
5. **`.rm-table*` (newer Roam table DOM)**: zero coverage in base. Add minimal themed
   coverage: `.rm-table` wrapper border + cell borders, same palette as (3)/(4).
6. **`.bp3-tag`**: base :6466 inverts to near-white on dark. Override dark:
   `background: #3b4c58; color: #e8edf2`.
7. **`.rm-page-ref--tag` + `.rm-page-ref__brackets`** (base :12318, :11123): `#8a9ba8`
   in all four branches. Keep light as-is; dark override `color: #9fb3c1` for --tag and
   `#7a8b98` for brackets (differentiated, ≥4.5:1 on `#202b33`).
8. **Heading bullet centering**: add (NOT in a dark block — applies both modes):
   ```css
   .rm-heading-level-1 > .rm-block__self > .rm-block__controls,
   .rm-heading-level-2 > .rm-block__self > .rm-block__controls,
   .rm-heading-level-3 > .rm-block__self > .rm-block__controls { padding: 0; }
   ```
   (Roam core ships `padding-top: 12px` at 0-3-0; the base's heading rules at
   :555/:569/:583 never declare padding. This wins on source order at equal
   specificity.)

## `20-plugins.css` — quick-insert + block-stats tooltip compatibility

Quick-insert (`#inserts_btns`, injected into `.rm-block__controls`; geometry: column of
16px icon / 17px `.place` / 16px icon at `top:-6px; left:6px`):

1. **Heading hit-target fix** — re-anchor per level so the lower dash clears the
   centered fold caret (control boxes are 42/33/27px for H1/H2/H3):
   ```css
   .rm-heading-level-1 #inserts_btns { top: -12px; left: 28px; }
   .rm-heading-level-2 #inserts_btns { top: -9px;  left: 28px; }
   .rm-heading-level-3 #inserts_btns { top: -7px;  left: 28px; }
   ```
   (ID beats class specificity — these compound selectors already outrank the plugin's
   own `#inserts_btns` rule via the ancestor class.)
2. **Dark color** for the dashes under the five-signal pattern:
   `#inserts_btns span { color: #55636e; }` in the dark blocks (replaces bright
   `#A7B6C2` on dark pages; keep light mode untouched).
3. **Undo the base layer's box distortion**:
   `.rm-block__controls #inserts_btns > span { display: inline-flex; }`
4. **Neutralize the plugin's global leak**: `.insert-item { border-bottom: 0; }`
   (the plugin ships an unscoped `.insert-item { border-bottom: 1px solid }` that can
   hit unrelated elements; nothing in the plugin actually uses the class).

Block-stats tooltip: covered by the token definitions + tooltip un-invert in layer 10 —
in THIS file add only the safety net for the extension's own nodes:
```css
.rm-bullet__tooltip, .tooltiptext {
  background-color: var(--bc-tooltip__content, #394b59) !important;
  color: var(--co-tooltip__content, rgba(255,255,255,0.87)) !important;
}
```
(both modes — these tooltips are intentionally dark always).

## Done criteria
- `npm run check` exit 0; artifacts regenerated; root/deploy byte-identical.
- ZERO diff in `src/css/00-upstream-base.css`, `vendor/`, `src/*.js`, tests.
- Every dark override uses the exact five-signal + guarded-media pattern.
- One commit, not pushed.
Report: the two layer files' final byte sizes, rule counts, and the `npm run check` tail.
