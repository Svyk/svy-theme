# U4 absorption staging — REPORT

Date: 2026-08-07. Sources: `roam-css-dump-Svy-final.json` (78 nodes, 30 CSS blocks),
`roam-css-dump-Readwisenotes-final.json` (65 nodes, 26 CSS blocks), token source
`~/research/2026-08-07-svy-theme-design-tokens.json`.
Deliverables: `30-absorbed.css` (7 modules, 90 rules), `absorption-map.json`
(146 entries — every uid in both dumps plus the 3 phantom patch uids from the
order's exclusion list).

CSS validation: tinycss2 parse — zero errors. Mechanical quality-bar scan —
zero `*` in descendant position, zero depth-4+ descendant chains, attribute
substring matches only on the `.rm-focus` container, the `.list-query`
mechanism, and the one legacy `span[style*=...]` inside query-hiding. Brace
balance clean. No invalid unitless values (the corpus's `padding-top: 2` class
of error did not survive: it lived only in the excluded/superseded blocks).

## Cross-graph drift found

1. **`MMy83KhEd` (Project Name2)**: Readwisenotes copy still carries the stale
   `data-tag="Project Notes2"` typo in its `:before` selector (arrow half never
   renders there). Svy copy is fixed. Svy copy preferred, per the order.
2. **`7AXlReulF` (Project Name3)**: same story, `Project Notes3` typo. Svy
   preferred.
3. **`roam-render-todo-progress-css`**: the graphs run different extension
   versions — Svy's adds `--circle-*` tokens and `.progress-circle` styles.
   Both are excluded (extension-owned); noted only so the delete step does not
   mistake the skew for user edits.
4. Everything else shared (10 zettelkasten blocks, Tufte, both query blocks,
   N/A hiding, all 7 productivity pills) is **byte-identical** across graphs.

## Per-module changes vs the originals

### tokens
- New module (no direct source block). Defines the 13 legacy custom properties
  the productivity pills consume — they were defined nowhere, so the pills
  render unstyled today. Each is an alias of a `--svy-*` token; palette values
  from the research JSON (light on `:root`, dark under the five-signal
  pattern, independently calibrated palettes).
- Mapping choices (documented inline too): `--black`→`--svy-text-strong` and
  `--white`→`--svy-canvas`, chosen so black-chip/white-text pills invert in
  dark mode instead of going dark-on-dark; `--deepblue`→`--svy-accent`;
  `--red`→`--svy-danger`; `--skyblue`→`--svy-selected`; `--green`→
  `--svy-success`; `--gold`→`--svy-warning`. The six dimensional tokens
  (`--tagpad` etc.) resolve to new `--svy-tag-*` metrics set to the exact
  geometry of the absorbed pill corpus (2px 5px / 13px / 1em / 500 / 5px /
  relative) — the old theme's values are lost, so these reproduce the only
  concrete reference that survives. Mode-invariant per the research (no
  dark-mode size changes).
- **Fallback primitives**: the module also defines the ten `--svy-*` palette
  primitives it references, marked for deletion when the theme's canonical
  token layer (U5) lands — otherwise this staging layer would have unresolved
  references.

### zettelkasten-pills
- Deduplicated 24 graph blocks (12 per graph) into one module; Svy copies
  preferred (drift items 1–2 above).
- Consolidated the corpus into three families sharing base rules, with per-tag
  hue carried by custom properties (`--svy-zk-*`). The legacy `:after`/
  `:before` arrow rules were identical — merged into one rule.
- Tokenized: `#fff`/`white` backgrounds → `--svy-zk-bg` (flips to dark raised
  `#293742`); `#000` text → `--svy-zk-fg` (flips to `#E1E8ED`); geometry →
  `--svy-tag-*`; light-mode shadows dropped in dark.
- Dark variants added per the research: borders are the semantic signal
  (`#5C7080` band), fills are decoration. Family A hue borders were 25%-alpha
  and family B hue text included near-invisible dark hues (`#215F00`,
  `#6A5ACD`) — lightened to full-alpha equivalents (`#F266C2`, `#7CBF60`,
  `#F59A5E`, `#9A8CFA`, `#5EB2F5`, `#9D94F0`, `#5C9CF5`); `#81D8D0` kept.
  Family B's white border → `#5C7080`. Near-white half-pill text (`#F3F7F2`/
  `#F5F8FA`) → `#E1E8ED` band in dark; never `#FFFFFF` text on dark
  (`--svy-zk-solid-fg` flips; Project Name3 gets dark `#182026` text because
  its fill is a light teal). Light-mode rendering is byte-for-byte the legacy
  look — all flips happen in `:root` token blocks under the five-signal
  pattern, so the pill rules themselves carry no dark selectors.

### productivity-pills
- Absorbed all 7 pills (byte-identical across graphs). They already consumed
  the 13 legacy tokens — the tokens module is what revives them.
- `saddlebrown` keyword → `--svy-prod-log-bg` token (light `#8B4513`
  preserved; dark `#A97C50` so the flipped dark text stays readable).
- The five borderless pills (Inbox, Agenda, Morning plan, Log, Daily Tasks)
  gain `border: var(--svy-prod-chip-bd)` — `none` in light, `1px solid
  var(--svy-tag-border)` in dark (the `#5C7080` band), per the dark-chip
  border mandate. Self-coaching and Weekly Accomplishments already carry hue
  borders whose colors flip to dark-safe values via `--red`/`--gold`.
- Preserved deliberately: Inbox's legacy `font-size/line-height: 1.0em`
  (it never consumed the size tokens — absorbing, not redesigning); all emoji
  `:before` contents; the `.rm-page-ref` inner-color `!important` rules.

### tufte-sidenotes
- Absorbed as-is (layout, not color). The one font-size tokenized to
  `--svy-sidenote-fs: 0.85rem` (kept the legacy value rather than snapping to
  `--svy-fs-sm`/14px so nothing visually changes on upgrade).
- Two selectors were depth-4 chains
  (`.rm-article-wrapper .rm-block--side .rm-block--side__children .rm-inline-img`
  and `… .react-resizable`). Collapsed by dropping the redundant middle
  `.rm-block--side` segment — `__children` only exists under
  `.rm-block--side`. Specificity drops 0-4-0 → 0-3-0 on a `max-width: 100%`
  guard; no competing rule known.

### query-hiding
- Both CSS blocks absorbed, deduplicated (byte-identical across graphs).
- The right-sidebar offset rule dropped its `#right-sidebar` prefix
  (`.rm-sidebar-outline-wrapper` only exists inside the right sidebar),
  bringing it from depth 4 to depth 3. Everything else as-is, including the
  `[data-path-page-links*=".list-query"]` substring matches (the mechanism —
  Roam emits no class) and the one `span[style*="font-size: 0.9em;"]` hack.

### misc
- Block-ref clickable area (`rX-EcakbY`): as-is.
- Date-picker today outline (`jP9X6o2vJ`): as-is — `outline: 2px dashed` uses
  currentColor, already mode-safe.
- N/A + hide-this tag hiding (`lKDa7t4Bh`): as-is, deduplicated.
- Footnote counts (`JtmRbVWeB`): colors tokenized — light preserved exactly
  (`#A11717`, `#E9E9E9`, `#000`), dark uses `--svy-danger`/`--svy-selected`/
  `--svy-text`. The empty `.rm-reference-footnote {}` rule was dropped as dead
  code.
- Mermaid full-width (`V23Bpf_1E`): `background: white` → `var(--svy-raised)`
  (flips to `#293742` in dark). SVG-only scoping and the
  layout-cost comment preserved untouched.

### focus-mode
- Rewritten, not copied. Zero universal-descendant selectors (the original
  had three `*` rules including `[data-page-links*=".rm-focus"] *:before`);
  the substring attribute match appears only on containers, once per rule;
  every rule names its targets (`.rm-block-children`, `.rm-block-main`,
  `.rm-block-text`, `.rm-block-input`, `.roam-block`, `.rm-block__controls`,
  `.rm-bullet`, …). Added `.rm-block__controls` to the hidden set (the
  original's `.controls` missed Roam's double-underscore variant).
- All five features preserved: bullet/control hiding; indent flattening +
  left-border removal (now one rule over the named structural elements, plus
  a `:before/:after` rule on those same named containers); serif 18px/1.7
  reading typography; centered 750px measure; ref-chrome hiding.
- `color: #2d3748` → `--svy-focus-text` (light preserved; dark `#E1E8ED` via
  `var(--svy-text)`).
- `!important` kept only where the base layer genuinely forces it: the
  `display: none` chrome-hiding (Roam reveals bullets/controls on hover), the
  typography block (base styles `.rm-block-text` heavily, including heading
  variants), and the 750px measure (`max-width`/`margin` — Roam sizes zoom
  containers). Everything else dropped `!important`; the attribute+class
  selectors out-specify the class-only base rules. Border/outline/box-shadow
  resets on the container kept (merged the original's redundant "nuclear
  option" trio).

## Excluded / superseded (nothing absorbed)

- `roam-render-todo-progress-css` (both graphs) + parents: extension-owned,
  rewritten on every extension update. Stays in roam/css.
- `roam-render-tag-cycle-css` (Readwisenotes) + parent: extension-owned. Stays.
- `ZrnX-4T08` + parent `GzIhSfqa9` (Svy): fully commented-out dead code.
  Delete (preserved in the vendor backup); not absorbed.
- `9y_EINQzN` + parent `9zhm-XQRp` (Readwisenotes): superseded by the theme's
  U2 heading fix; also a live no-op (its only active declaration is the
  invalid unitless `padding-top: 2`). Delete.
- `Q9TRLubNq`/`XLsvabGsa` (both graphs): `[[Beau Haan]]` attribution header —
  not CSS. Marked excluded; keep-or-delete is a user decision at delete time.
- Phantom patch uids `muaOHAkVD` / `5bvTkzGk6` / `df2k3doEA`: **not present in
  either final dump** (the order's exclusion list names them, and the
  blueprint's ground-truth section places them in a "Blueprint CSS patches"
  section of the Svy graph — that section is absent from
  `roam-css-dump-Svy-final.json`). They are in the absorption map as excluded
  with a verify-against-live-graph note, so the delete step doesn't silently
  skip them. `LTr4LQ6By` is a stale uid (blueprint correction 2) — ignored.

## Unsure / flagged for the integrator

1. **Settings toggles**: the blueprint's U4 scope expansion asks for a
   per-module settings master toggle (default ON). This order's deliverable
   spec defines no toggle mechanism and the theme's settings system belongs
   to another unit — modules are banner-delimited so gating can be added at
   integration without re-editing rules. Not implemented here.
2. **Dark hue choices**: the lightened pill hues (`#F266C2`, `#7CBF60`,
   `#F59A5E`, `#9A8CFA`, `#5EB2F5`, `#9D94F0`, `#5C9CF5`, `#A97C50`) are my
   hue-preserving lightening into the `#5C7080` visibility band — the
   research's 46 measured pairs don't cover these legacy hues, so they are
   not APCA-verified individually. All are nontext borders/accents except the
   family-B text hues, which sit well above the dark surfaces.
3. **`--svy-*` fallback primitives** in the tokens module duplicate what U5's
   canonical token layer will define (same values, research JSON). Delete the
   primitive blocks at integration; keep the aliases.
4. **Focus-mode edit state**: like the original, the typography rule targets
   `.rm-block-text` only, so the editing surface (`.rm-block-input`) stays in
  the base font. Preserved as-is; if the user wants serif-while-editing, add
   `.rm-block-input` to that one rule.
5. **Inbox pill** keeps `1.0em` sizing instead of the tag tokens (legacy
   inconsistency, preserved). Aligning it to `--svy-tag-fs` (13px) is a
   one-line change if desired.
