# Unit order: tree-shake the upstream base layer against measured coverage

Repo: this repo (`~/svy-theme`), HEAD `23c7f24`+. Gate: `npm ci --ignore-scripts
--no-audit --no-fund` then `npm run check` MUST exit 0. Commit at the end (author
`Svyatoslav Kleshchev <svyk@icloud.com>`, no --amend, no --no-verify), do NOT push.

## Input

`/Users/svyatoslavkleshchev/roam-blueprint-tools/dead-rules.json` — the measured
dead-rule list: 1,879 of 2,287 rules unused across 4 full coverage runs (both graphs ×
both themes, 8-surface tours incl. the `[[` popup, settings dialog, sidebar, tables,
All Pages). 16 `.rm-autocomplete`-family rules are already carved out (kept). Each
entry carries selector text + byte offsets **computed against the full built
`extension.css` at the time of the sweep** — offsets are advisory; match on selector
text + declarations, not offsets, since the file has advanced.

## Hard rules

1. **Delete ONLY from `src/css/00-upstream-base.css`.** A dead-listed rule that lives
   in layers 10/20/30/40 is LEFT ALONE without exception — those layers are new,
   individually verified, and cover states the tour cannot exercise.
2. A rule is deletable only if it appears in `dead-rules.json`'s unused set. Anything
   not listed — keep. When a dead-listed selector cannot be matched unambiguously in
   the base layer, KEEP it and log it in the report. Fail toward keeping, always.
3. Keep-regardless classes, even if dead-listed (defense in depth — states/timing the
   tour may not have caught):
   - anything within `@keyframes`, `@font-face`, `:focus`/`:focus-*`, `:active`,
     `::selection`, `::placeholder`, `[aria-*]`, `.bp3-skeleton`, print media
   - `.rm-autocomplete*`, `.rm-find-or-create*`, `.bp3-menu*`, `.bp3-popover*`,
     `.bp3-tooltip*` (popup path — the thing this whole campaign optimizes)
   - the extension-surface families from
     `/Users/svyatoslavkleshchev/roam-blueprint-tools/extension-carveout-draft.json`
     (zotero, roamjs-*, pomodoro, speech-to-roam — 135 rules)
   - mobile blocks (`@media` max-width) — the tour never ran on mobile widths
   - `.rm-modal*`, `.bp3-dialog*`, `.bp3-toast*`, `.bp3-alert*` (transient chrome)
4. Preserve the structure of what remains: do not reformat, reorder, or "optimize"
   surviving rules. This unit deletes; it does not rewrite. Media-query wrappers that
   become empty are removed.
5. Produce `docs/absorption/treeshake-report.json`: counts per category (deleted /
   kept-by-coverage / kept-by-carveout / kept-ambiguous), byte sizes before/after, and
   the full list of kept-ambiguous selectors.

## Done criteria
- `npm run check` green; root/deploy byte-identical.
- Base layer materially smaller (expect roughly 50-70% byte reduction after the
  keep-regardless classes are honored — do not force a target; the rules decide).
- Zero changes outside `src/css/00-upstream-base.css` + regenerated artifacts +
  the report file.
- One commit, unpushed.

Report: before/after byte + rule counts, the category table, check tail, commit SHA.
