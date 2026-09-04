# Unit order: make Auto actually follow system, and make the current setting obvious

Repo: `~/svy-theme`. Build/test: `npm run check` MUST exit 0 before you finish.
Commit at the end with author `Svyatoslav Kleshchev <svyk@icloud.com>`:

```
git -c user.name="Svyatoslav Kleshchev" -c user.email="svyk@icloud.com" commit
```

Message: `fix: auto appearance follows system and the topbar names the current mode`

**Do NOT push. Do NOT tag. Do NOT open a PR.**

## Frozen contracts — do not change

- CSS class `.blueprint-dm-toggle` MUST remain on the clickable icon. Better Tasks
  probes `document.querySelector(".blueprint-dm-toggle")`.
- Setting id `bp-appearance` and stored values `auto` / `dark` / `light` (lowercase).
  Settings panel `action.items` stay exactly `[...APPEARANCE_MODES]`.
- Do not stamp `.bp3-light` in Auto. `.bp3-light` means explicit forced light only
  (Roam Grid and our media guards key on `:root:not(.bp3-light)`).
- `.bp3-dark` lives on `<html>` (`documentElement`), never `body.bp3-dark` alone.
- Do not edit `src/css/00-upstream-base.css` or `vendor/`.

## Why Auto is broken

`applyAppearance("auto")` only removes `.bp3-light` and leaves `.bp3-dark`.

- Settings can jump Dark → Auto. The page stays dark forever. The existing cycle
  test goes Auto → Dark → Light → Auto, so Light already cleared `.bp3-dark` and
  the suite never caught this.
- The dark-signal bridge never treats `prefers-color-scheme: dark` as a stamp
  signal. In Auto with nothing else stamped, Roam-core and other extensions that
  key only on `.bp3-dark` stay light even when the OS is dark. Our own CSS has
  media-query fallbacks; theirs do not.
- The topbar uses Blueprint icons only: `clean` (sparkle) / `moon` / `flash`.
  No `title`, no `aria-label`, no text. It is not obvious which setting is on.

## Required behavior

### 1. `src/dm-toggle.js` — `applyAppearance`

- `dark`: remove `.bp3-light`, add `.bp3-dark` (unchanged).
- `light`: remove `.bp3-dark`, add `.bp3-light` (unchanged).
- `auto`: remove **both** `.bp3-dark` and `.bp3-light`. Auto does not own a
  forced stamp. The bridge re-stamps `.bp3-dark` when it should (see below).
- Always set `documentElement.dataset.bpAppearance` (or `data-bp-appearance`)
  to the normalized mode (`auto` / `dark` / `light`) so the *setting* is
  inspectable separately from the resolved theme class.
- Update the toggle icon classes as today (`clean` / `moon` / `flash`).
- Update a visible text label to exactly `Auto` / `Dark` / `Light`.
- Set `title` and `aria-label` on the click target (the wrapper):
  - Auto: `Appearance: Auto (follows system)`
  - Dark: `Appearance: Dark`
  - Light: `Appearance: Light`
- Keep icon class names. Do not rename `.blueprint-dm-toggle` or
  `.blueprint-toggle-icon`.

### 2. `src/dm-toggle.js` — mount

Inside the existing `bp3-popover-wrapper`, after the icon span, add:

```html
<span class="blueprint-dm-toggle-label" aria-hidden="true">Auto</span>
```

The wrapper is the click target (already). Give the wrapper a *new* class
`blueprint-dm-toggle-wrap` for layout CSS. Do **not** put `.blueprint-dm-toggle`
on the wrapper instead of the icon.

`applyAppearance` must find the label via
`doc.getElementsByClassName("blueprint-dm-toggle-label")[0]` and set
`textContent`. If the label is not mounted yet (apply runs before mount, as
today), skip the label write; mount uses `currentMode()` for the initial
label / title / aria-label / icon.

Fake DOM in `test/dm-toggle.test.js` will need `textContent`, `title`,
`setAttribute` / `getAttribute`, and `dataset` (or at least the attribute
surface `applyAppearance` uses). Keep the fake minimal — only what the code
touches.

### 3. `src/dark-signal-bridge.js` — OS is a dark signal in Auto

Extend `bridgeAction` with `systemPrefersDark` (default `false` so existing
callers/tests stay valid):

```
if appearance is not auto → "none"
wantDark = signalsPresent || systemPrefersDark
if wantDark → stamp if root lacks .bp3-dark, else none
else → unstamp only if bridgeStamped, else none
```

Still never remove a `.bp3-dark` the bridge did not place (Roam's own stamp
survives Auto + OS-light).

`detectSystemPrefersDark(mediaQuery)` is `Boolean(mediaQuery?.matches)`.

`installDarkSignalBridge` must:

- Resolve `matchMedia` from `win.matchMedia("(prefers-color-scheme: dark)")`
  when present. Accept an injectable `win` or `matchMedia` in the options bag
  so tests do not need a real window.
- Pass `systemPrefersDark: detectSystemPrefersDark(mql)` into every `sync`.
- Subscribe to `change` on that media query (`addEventListener`, with
  `addListener` fallback) and `sync()`. Register the unsubscribe on the
  lifecycle. If `matchMedia` is missing (node:test toggle path, old hosts),
  skip — do not throw.
- Keep the existing body/html class observers and the 1s settle timeout.

When Auto clears both classes, the documentElement observer already fires
`sync`, so the bridge re-stamps if OS/third-party say dark. Do not couple
`applyAppearance` to the bridge by direct import.

### 4. Settings copy only — `src/settings.js`

Do **not** change `id`, `items`, or stored values.

Update the Appearance row:

- `name`: `Appearance`
- `description`: `Auto follows your system (and Roam) and updates when it changes. Dark and Light stay put. The topbar control is labeled Auto, Dark, or Light — click it to cycle Auto → Dark → Light.`

### 5. CSS — append to `src/css/20-plugins.css`

Do not create a new layer file. Scope every rule to our classes. No
`!important`. No global overflow/position changes.

```css
.blueprint-dm-toggle-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.blueprint-dm-toggle-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  line-height: 1;
  user-select: none;
  color: inherit;
}
```

If the label is hard to read on the topbar, color it with the same ink the
minimal topbar buttons already use (`inherit` first). Do not invent a new
palette. If a dark-mode color is required, use the five-signal pattern:

```
:root.bp3-dark <sel>, body.bt-theme-dark <sel>, .rm-dark-theme <sel>,
body.roam-body.dark <sel> { ... }
@media (prefers-color-scheme: dark) { :root:not(.bp3-light) <sel> { ... } }
```

### 6. Tests — required cases

`test/dm-toggle.test.js`

- Cycle Auto → Dark → Light → Auto: after the return to Auto, assert
  **both** `!bp3-light` and `!bp3-dark`.
- New: `applyAppearance("dark")` then `applyAppearance("auto")` (settings
  jump, no Light in between) clears `.bp3-dark` and `.bp3-light`, sets
  `data-bp-appearance="auto"`, and sets the label text to `Auto`.
- New: the mounted control exposes visible text `Auto` / `Dark` / `Light`
  as the user clicks, and the wrapper `title` / `aria-label` match the
  strings in §1.
- `.blueprint-dm-toggle` remains on the icon span after mount.
- Existing install / unload / observer / error tests still pass.

`test/dark-signal-bridge.test.js`

- `bridgeAction` with `systemPrefersDark: true`, no class markers, auto,
  not yet stamped → `"stamp"`.
- Same with `rootHasDark: true` → `"none"`.
- `systemPrefersDark: false`, `bridgeStamped: true` → `"unstamp"`.
- Explicit dark/light still returns `"none"` even if `systemPrefersDark`.
- Install with an injected matchMedia that `matches: true` stamps `.bp3-dark`
  in Auto with no body markers.
- Install with `matches: false` does not stamp.
- Firing the injected media query's `change` handler stamps / unstamps.
- Existing “does not claim ownership of a pre-existing `.bp3-dark`” test
  still passes when the injected media query is light (`matches: false`).
  Default any new matchMedia fake to light so old tests do not flip.

`test/settings.test.js`

- Appearance `items` still equal `["auto", "dark", "light"]`.
- Description mentions `Auto` and the topbar label. Do not snap the whole
  sentence unless you want a brittle test — assert it includes those words.

### 7. Changelog + generated artifacts

- Add a `### Fixed` bullet under `## [Unreleased]` in `CHANGELOG.md`
  (and the built `deploy/CHANGELOG.md` via the normal build copy).
- Run `npm run check`. That rebuilds `extension.js`, `extension.css`, and
  `deploy/*`. Commit source + generated artifacts together.

## Out of scope

- No version bump.
- No Depot submission.
- No README rewrite beyond a one-line Appearance row tweak if you want it
  to mention the labeled topbar.
- No luminance sampling. This extension *is* the theme; sampling `body`
  would be circular. Auto = clear our forced stamps + bridge OS / third-party
  markers onto `.bp3-dark`.
- Do not replace the settings `<select>` with a React widget. Roam persists
  select rows by id; a reactComponent would break the stored value.

## Done when

- `npm run check` is green.
- A Dark → Auto jump no longer leaves `.bp3-dark`.
- Auto + `prefers-color-scheme: dark` stamps `.bp3-dark` (owned by the bridge).
- The topbar shows the word Auto, Dark, or Light next to the icon.
- Frozen class / setting ids / stored values are unchanged.
- One commit, correct author, not pushed.
