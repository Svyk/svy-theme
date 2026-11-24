The user approved this job in full. Creative freedom is granted. Any rewrite of svy-theme that makes restyle cost closer to theme-off is approved. Do the work. Do not stop to ask.

You are Opus 5.5. Workspace is ~/svy-theme (main, 0.3.5, clean at c430180). You may also write:

- ~/.claude/skills/roam-plugin-dev/SKILL.md
- ~/openkb-roam-plugin/raw/session-learnings/

## Goal

Make the shipped theme as close as possible to having no theme on Roam's popup restyle path. Popup cost is selector shape, not file size. A previous bench on the Svy daily page, 12 forced layouts, class toggle + getBoundingClientRect:

- Old Blueprint sheet ~2.35s
- Color sheet 0.3.1 ~0.28s
- Theme off ~0.24s

Beat or match that off floor in steady state. Do not claim a number you did not measure. If you measure, use CDP port 9223 (`CDP_PORT=9223 node ~/.claude/scripts/thymer-cdp.mjs`). Do not read ~/.roam-graph-unlock.

## Freedom and the few hard edges

Rewrite CSS, JS, tests, and structure as you see fit. Drop layers, merge signals, delete 30-absorbed rules, change how dark mode is detected, if that is what speed requires.

Keep these or the graph breaks:

- Body still paints the page background. Other extensions sample it.
- Do not paint from `body.bt-theme-dark`. That class follows the theme and latches Auto dark. `.roam-body` is a div, so `body.roam-body` never matches.
- Names other extensions already read: `.blueprint-dm-toggle`, setting id `bp-appearance` and the other `bp-*` ids, `--bc-*`, `--cl-*`, `--ff-main`, `--svy-*`, and the pill aliases. Keep the names. You may change what they point at. Roam Grid and Better Tasks read them.
- Zero runtime dependencies. esbuild only. `npm run check` must pass before you commit.
- Do not restore vendor/upstream/blueprint.css into the shipped sheet. Tree-shaking it bought 0.6ms and broke highlights.
- Do not close Roam task ((YWuhEfoft)). Do not write to Thymer.

## Ship

Bump the version. Changelog. Commit as `git -c user.name="Svyatoslav Kleshchev" -c user.email="svyk@icloud.com" commit`. New commits, never amend, never skip hooks. Push main.

## After the code, write the learnings down

1. Update ~/.claude/skills/roam-plugin-dev/SKILL.md with what this rewrite taught. Edit the existing speed and theme rules in place (rules 5, 15, 17) where the new facts narrow them. The user approved this skill edit. Do not add a new numbered rule unless the learning is general and the old rule cannot hold it.

2. Write one session learning at ~/openkb-roam-plugin/raw/session-learnings/2026-09-23-svy-theme-speed-rewrite.md with the three sections Rule, What happened, Evidence. Keep the file under 120 words. Then:

```bash
LITELLM_DROP_PARAMS=true openkb --kb-dir ~/openkb-roam-plugin add \
  ~/openkb-roam-plugin/raw/session-learnings/2026-09-23-svy-theme-speed-rewrite.md
```

If that add fails because the model API has no credits, leave the markdown file in place and say so. Do not delete an older learning. If you supersede one, add a Superseded block and re-add that file too.

Write a short report to reviews/speed-2026-09-23/opus-rewrite.md: what you cut, what you kept, the check result, the commit, and whether the knowledge base add succeeded.
