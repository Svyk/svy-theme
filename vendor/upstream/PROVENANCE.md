# Provenance — vendored upstream Blueprint theme

`blueprint.css` in this directory is vendored verbatim (byte-identical, 455,049 bytes)
from the upstream Blueprint theme for Roam Research, for use as this fork's
`src/extension.css`.

- **Source repository**: [`rcvd/blueprint`](https://github.com/rcvd/blueprint)
- **Author**: Alexander Rink (alex@goedel.io)
- **Pinned commit**: `cc1c71784a26bc86da99a1572733c624e9196299`
- **Vendored file**: `src/themes/blueprint.css` at that commit
  (`https://raw.githubusercontent.com/rcvd/blueprint/cc1c71784a26bc86da99a1572733c624e9196299/src/themes/blueprint.css`)
- **License**: upstream's `package.json` declares `"license": "MIT"`. **No `LICENSE` file
  exists in the upstream repository** at the pinned commit (or on `main`) — the MIT grant
  is the `package.json` field only, there is no separate license text to vendor alongside
  the CSS.
- **Roam Depot manifest**: the Depot listing for this extension
  (`Roam-Research/roam-depot` → `extensions/rcvd/blueprint.json`) carries
  `"stripe_account": "acct_1LPgSxQUtJ9VpaGT"` — the author receives a Depot revenue share
  for installs sourced through the official Depot listing. This fork is never submitted
  there, so no revenue share applies to it.
- **Also ported (not vendored verbatim)**: the dark-mode toggle behavior from upstream's
  `src/components/dm-toggle.ts` at the same pinned commit, rewritten as plain JS at
  `src/dm-toggle.js` in this repo. See that file's header comment and the GOAL-1 report
  for the specific behavioral deviations.

**This is a personal performance fork; never submit it to Roam Depot.** It is not
affiliated with, endorsed by, or a replacement for the upstream `rcvd/blueprint` Depot
listing. Reinstall the pinned commit above if this vendor copy is ever regenerated.
