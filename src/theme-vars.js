// U5 — the theme's CSS-variable writing path.
//
// src/css/40-beam.css reads every value through a --svy-beam-* custom property whose
// fallback is the shipped Beam v1 value, so the stylesheet stands on its own if this
// module never runs. This module reads the settings panel, computes the property set,
// and publishes it from ONE injected <style id="svy-theme-vars"> element.
//
// Why an injected sheet instead of inline style on documentElement:
//   - specificity stays predictable (:root, 0-1-0) instead of jumping to the inline
//     level where nothing in a stylesheet, including the user's roam/css, can win;
//   - the element's style attribute is left alone for other extensions;
//   - teardown is one node.remove() registered on the lifecycle, not N removeProperty
//     calls that have to enumerate what a previous version wrote.

export const THEME_VARS_STYLE_ID = "svy-theme-vars";

// Pack gating: 40-beam.css scopes every rule under :root:not(.svy-off-beam), so putting
// this class on <html> disables the layer with one class test per rule and no reload.
export const BEAM_OFF_CLASS = "svy-off-beam";

export const BEAM_SETTING_IDS = Object.freeze({
  pack: "bp-pack-beam",
  caretLight: "bp-beam-caret-light",
  caretDark: "bp-beam-caret-dark",
  caretShape: "bp-beam-caret-shape",
  caretWidth: "bp-beam-caret-width",
  caretHeight: "bp-beam-caret-height",
  caretRadius: "bp-beam-caret-radius",
  caretOpacity: "bp-beam-caret-opacity",
  caretGlow: "bp-beam-caret-glow",
  caretBehavior: "bp-beam-caret-behavior",
  caretBlink: "bp-beam-caret-blink",
  wash: "bp-beam-wash",
  washIntensity: "bp-beam-wash-intensity",
  cursor: "bp-beam-cursor",
});

export const CARET_SHAPES = Object.freeze(["beam", "block", "outline", "underline", "bar", "native"]);
export const CARET_GLOWS = Object.freeze(["soft", "none", "halo"]);
export const CARET_BEHAVIORS = Object.freeze(["responsive", "steady", "glide", "breathe", "comet"]);
export const WASH_INTENSITIES = Object.freeze(["subtle", "medium", "off"]);
export const CURSOR_STYLES = Object.freeze(["svy", "native"]);

export const CARET_CONTROL_LIMITS = Object.freeze({
  caretWidth: Object.freeze({ min: 50, max: 200 }),
  caretHeight: Object.freeze({ min: 30, max: 120 }),
  caretRadius: Object.freeze({ min: 0, max: 12 }),
  caretOpacity: Object.freeze({ min: 45, max: 100 }),
});

// Beam v1's light caret. Kept as a named constant because initializeBeamSettings has to
// recognize it to run the one-time migration to the value below; nothing else reads it.
export const LEGACY_CARET_LIGHT = "#008478";

// Marker for the 2026-08-07 forced wash migration (user request: "I don't need this
// highlighted background, just the cursor"). Deliberately NOT a member of
// BEAM_SETTING_IDS: initializeBeamSettings seeds every id in that object from
// BEAM_DEFAULTS[key], and this marker has no BEAM_DEFAULTS entry, so including it would
// persist `undefined`. It is also not a settings row — it is bookkeeping, not a knob.
export const WASH_MIGRATION_SETTING_ID = "bp-beam-wash-migrated-2026-08-07";

// The full-cell block was the pre-v3 default. This marker lets one upgrade move that
// exact old experience to the quieter rounded beam while leaving later choices alone.
export const CARET_V3_MIGRATION_SETTING_ID = "bp-beam-caret-v3-migrated-2026-08-08";

// Dark caret is #48D0C0 (APCA Lc -62.9 on #202B33) per the U6 design-token research;
// it replaces Beam v1's #66E3D0. The light caret moved off Beam v1's #008478 (Lc 66.8)
// to #00695E (Lc 77.6), which clears the APCA thin-stroke floor a caret has to meet.
// The focus wash defaults OFF as of 2026-08-07 (user: "I don't need this highlighted
// background, just the cursor"). Both knobs move: the switch so the settings row reads
// the way the page looks, and the intensity so re-enabling the switch alone does not
// silently restore a tint the user rejected. computeThemeVars already treats either as
// sufficient to disable — washOn = wash && washIntensity !== "off" — so no other logic
// changes. The caret pair is untouched: #00695e is APCA Lc 77.6 on the light surface and
// #48d0c0 is Lc -62.9 on the dark one, both computed optima.
export const BEAM_DEFAULTS = Object.freeze({
  pack: true,
  caretLight: "#00695e",
  caretDark: "#48d0c0",
  caretShape: "beam",
  caretWidth: 100,
  caretHeight: 82,
  caretRadius: 3,
  caretOpacity: 100,
  caretGlow: "soft",
  caretBehavior: "responsive",
  caretBlink: false,
  wash: false,
  washIntensity: "off",
  cursor: "svy",
});

// Beam v1's hand-tuned wash bases, kept byte-for-byte: the wash is a 4.5% tint, so its
// exact hue is cosmetic and re-tuning it is not part of the caret contrast fix. A
// customized caret has no matching hand-tuned wash, so the wash is derived from the
// caret instead.
const DEFAULT_WASH_RGB = Object.freeze({ light: "0, 122, 112", dark: "72, 208, 192" });

// Gamut-expanded equivalents of the default carets, used only inside @media
// (color-gamut: p3). Each is its caret's own OKLCH lightness and hue with the chroma
// pushed out of sRGB by the same factor Beam v1 used, so the P3 rendering is a more
// saturated version of the same colour and not a different contrast. A customized caret
// is published as-is in both blocks.
const DEFAULT_CARET_P3 = Object.freeze({ light: "0.47 0.11 182", dark: "0.78 0.15 184" });

const WASH_ALPHA = Object.freeze({
  subtle: Object.freeze({ light: 0.045, dark: 0.055 }),
  medium: Object.freeze({ light: 0.09, dark: 0.11 }),
});

const WASH_DURATION = "70ms";
const WASH_RADIUS = "4px";

const HEX_PATTERN = /^#?(?:([0-9a-f]{3})|([0-9a-f]{6}))$/i;

// Accepts "#rrggbb", "#rgb", and the same without the leading "#", any case. Anything
// else — empty, "teal", "#12345", "rgb(0,0,0)", a number, an object — is rejected and
// the caller's fallback is used, so a half-typed value in the settings input can never
// publish a broken custom property.
export function normalizeHex(value, fallback = null) {
  if (typeof value !== "string") return fallback;
  const match = HEX_PATTERN.exec(value.trim());
  if (!match) return fallback;
  const digits = match[1] ? [...match[1]].map((digit) => digit + digit).join("") : match[2];
  return `#${digits.toLowerCase()}`;
}

export function normalizeChoice(value, allowed, fallback) {
  if (typeof value !== "string") return fallback;
  const lowered = value.trim().toLowerCase();
  return allowed.includes(lowered) ? lowered : fallback;
}

// Roam stores a switch row as a boolean, but a value synced from another client or an
// older build can arrive as the string form.
export function normalizeSwitch(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

// Numeric settings arrive as strings from Roam's generic input rows. Clamp them here so
// a synced typo cannot create an invisible caret or a screen-sized overlay. One decimal
// place is retained for people who want genuinely fine control without publishing noisy
// floating-point values.
export function normalizeNumber(value, { min, max }, fallback) {
  if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(Math.min(max, Math.max(min, parsed)) * 10) / 10;
}

export function normalizeBeamConfig(raw = {}) {
  return {
    pack: normalizeSwitch(raw.pack, BEAM_DEFAULTS.pack),
    caretLight: normalizeHex(raw.caretLight, BEAM_DEFAULTS.caretLight),
    caretDark: normalizeHex(raw.caretDark, BEAM_DEFAULTS.caretDark),
    caretShape: normalizeChoice(raw.caretShape, CARET_SHAPES, BEAM_DEFAULTS.caretShape),
    caretWidth: normalizeNumber(raw.caretWidth, CARET_CONTROL_LIMITS.caretWidth, BEAM_DEFAULTS.caretWidth),
    caretHeight: normalizeNumber(raw.caretHeight, CARET_CONTROL_LIMITS.caretHeight, BEAM_DEFAULTS.caretHeight),
    caretRadius: normalizeNumber(raw.caretRadius, CARET_CONTROL_LIMITS.caretRadius, BEAM_DEFAULTS.caretRadius),
    caretOpacity: normalizeNumber(raw.caretOpacity, CARET_CONTROL_LIMITS.caretOpacity, BEAM_DEFAULTS.caretOpacity),
    caretGlow: normalizeChoice(raw.caretGlow, CARET_GLOWS, BEAM_DEFAULTS.caretGlow),
    caretBehavior: normalizeChoice(raw.caretBehavior, CARET_BEHAVIORS, BEAM_DEFAULTS.caretBehavior),
    caretBlink: normalizeSwitch(raw.caretBlink, BEAM_DEFAULTS.caretBlink),
    wash: normalizeSwitch(raw.wash, BEAM_DEFAULTS.wash),
    washIntensity: normalizeChoice(raw.washIntensity, WASH_INTENSITIES, BEAM_DEFAULTS.washIntensity),
    cursor: normalizeChoice(raw.cursor, CURSOR_STYLES, BEAM_DEFAULTS.cursor),
  };
}

export function readBeamSettings(extensionAPI) {
  const get = (key) => extensionAPI?.settings?.get?.(key);
  return normalizeBeamConfig({
    pack: get(BEAM_SETTING_IDS.pack),
    caretLight: get(BEAM_SETTING_IDS.caretLight),
    caretDark: get(BEAM_SETTING_IDS.caretDark),
    caretShape: get(BEAM_SETTING_IDS.caretShape),
    caretWidth: get(BEAM_SETTING_IDS.caretWidth),
    caretHeight: get(BEAM_SETTING_IDS.caretHeight),
    caretRadius: get(BEAM_SETTING_IDS.caretRadius),
    caretOpacity: get(BEAM_SETTING_IDS.caretOpacity),
    caretGlow: get(BEAM_SETTING_IDS.caretGlow),
    caretBehavior: get(BEAM_SETTING_IDS.caretBehavior),
    caretBlink: get(BEAM_SETTING_IDS.caretBlink),
    wash: get(BEAM_SETTING_IDS.wash),
    washIntensity: get(BEAM_SETTING_IDS.washIntensity),
    cursor: get(BEAM_SETTING_IDS.cursor),
  });
}

function hexToRgbTriplet(hex) {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `${red}, ${green}, ${blue}`;
}

// Minimal data-URI escaping: only the characters that break a CSS url("…") token or an
// inline SVG document. Spaces and single quotes stay literal, matching the v1 fallbacks.
function encodeSvg(svg) {
  return svg
    .replace(/%/g, "%25")
    .replace(/#/g, "%23")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/"/g, "%22")
    .replace(/\s+/g, " ")
    .trim();
}

const CURSOR_SVG = Object.freeze({
  default: ({ outline, body, spark }) => `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path d='M4 3L25 16L16 19L21 28L16 31L11 21L4 27Z' fill='${body}' stroke='${outline}' stroke-width='2' stroke-linejoin='round'/><path d='M6 5L12 21' stroke='${spark}' stroke-width='2.5' stroke-linecap='round'/></svg>`,
  pointer: ({ outline, accent, spark, highlight }) => `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><circle cx='16' cy='16' r='10' fill='${outline}' stroke='${accent}' stroke-width='3'/><circle cx='16' cy='16' r='4' fill='${spark}' stroke='${highlight}' stroke-width='1'/></svg>`,
  text: ({ outline, accent, spark, highlight }) => `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><rect x='10' y='3' width='12' height='26' rx='6' fill='${outline}' stroke='${accent}' stroke-width='2'/><rect x='13' y='6' width='6' height='20' rx='3' fill='${spark}'/><circle cx='16' cy='16' r='2' fill='${highlight}'/></svg>`,
});

const CURSOR_ANCHOR = Object.freeze({
  default: "4 3, auto",
  pointer: "16 16, pointer",
  text: "16 16, text",
});

export const CURSOR_MODES = Object.freeze(["light", "dark"]);

// Beam v1 shipped ONE cursor set whose ink is #182026 in both modes: on the dark surface
// that ink disappears into the page and only the #48AFF0 body kept the arrow findable.
// v2 publishes a set per mode. `outline` is the ink that separates the glyph from the
// page — #182026 (APCA Lc 99.0 on the light surface) going light, #E1E8ED (Lc -88.5 on
// the dark surface) going dark. On dark, #182026 becomes the interior fill that keeps the
// glyph's own shapes legible against that near-white ink. `spark` is not listed here: it
// is the mode's caret, injected per call, so recolouring a caret recolours its cursors.
const CURSOR_PALETTE = Object.freeze({
  light: Object.freeze({ outline: "#182026", body: "#48aff0", accent: "#48aff0", highlight: "#f5f8fa" }),
  dark: Object.freeze({ outline: "#e1e8ed", body: "#182026", accent: "#48d0c0", highlight: "#182026" }),
});

export function buildCursorValue(kind, palette) {
  const svg = CURSOR_SVG[kind];
  if (!svg) throw new TypeError(`Unknown cursor kind: ${kind}`);
  return `url("data:image/svg+xml,${encodeSvg(svg(palette))}") ${CURSOR_ANCHOR[kind]}`;
}

// The three cursor properties for one mode. `native` yields the CSS keywords rather than
// art, and is identical in both modes — renderThemeVarsCss drops the dark block when the
// two sets match, so switching to native cursors emits no dark-scoped rules at all.
export function cursorVarsForMode(normalized, mode) {
  if (normalized.cursor === "native") {
    return {
      "--svy-beam-cursor-default": "auto",
      "--svy-beam-cursor-pointer": "pointer",
      "--svy-beam-cursor-text": "text",
    };
  }
  const palette = {
    ...CURSOR_PALETTE[mode],
    spark: mode === "light" ? normalized.caretLight : normalized.caretDark,
  };
  return {
    "--svy-beam-cursor-default": buildCursorValue("default", palette),
    "--svy-beam-cursor-pointer": buildCursorValue("pointer", palette),
    "--svy-beam-cursor-text": buildCursorValue("text", palette),
  };
}

// Returns the two blocks the injected sheet publishes: `base` at :root (everything the
// layer selects per mode by name, plus the LIGHT cursor set), and `dark` — the cursor set
// only, because a cursor is a single property that has to already carry its mode by the
// time `body { cursor: … }` resolves it. Empty when the two sets are identical.
export function computeThemeVars(config) {
  const normalized = normalizeBeamConfig(config);
  const washOn = normalized.wash && normalized.washIntensity !== "off";
  const base = {};

  for (const mode of CURSOR_MODES) {
    const caret = mode === "light" ? normalized.caretLight : normalized.caretDark;
    const isDefault = caret === (mode === "light" ? BEAM_DEFAULTS.caretLight : BEAM_DEFAULTS.caretDark);
    const alpha = washOn ? WASH_ALPHA[normalized.washIntensity][mode] : null;

    base[`--svy-beam-caret-${mode}`] = caret;
    base[`--svy-beam-caret-${mode}-p3`] = isDefault ? `oklch(${DEFAULT_CARET_P3[mode]})` : caret;

    if (alpha == null) {
      base[`--svy-beam-wash-${mode}`] = "transparent";
      base[`--svy-beam-wash-${mode}-p3`] = "transparent";
    } else {
      const rgb = isDefault ? DEFAULT_WASH_RGB[mode] : hexToRgbTriplet(caret);
      base[`--svy-beam-wash-${mode}`] = `rgba(${rgb}, ${alpha})`;
      base[`--svy-beam-wash-${mode}-p3`] = isDefault
        ? `oklch(${DEFAULT_CARET_P3[mode]} / ${alpha})`
        : `rgba(${rgb}, ${alpha})`;
    }
  }

  // The overlay implements Svy's extended styles. These mappings are the progressive
  // fallback when JavaScript is unavailable and for the explicit native option.
  const nativeShape = {
    beam: "bar",
    block: "block",
    outline: "block",
    underline: "underscore",
    bar: "bar",
    native: "auto",
  }[normalized.caretShape];
  base["--svy-beam-caret-shape"] = nativeShape;
  // caret-animation: manual means the author owns the animation, i.e. no blink.
  base["--svy-beam-caret-animation"] = normalized.caretBlink ? "auto" : "manual";
  base["--svy-beam-caret-preview-width"] = `${3 * (normalized.caretWidth / 100)}px`;
  base["--svy-beam-caret-preview-height"] = `${20 * (normalized.caretHeight / 100)}px`;
  base["--svy-beam-caret-radius"] = `${normalized.caretRadius}px`;
  base["--svy-beam-caret-opacity"] = `${normalized.caretOpacity / 100}`;
  base["--svy-beam-wash-duration"] = washOn ? WASH_DURATION : "0ms";
  base["--svy-beam-wash-radius"] = WASH_RADIUS;

  const light = cursorVarsForMode(normalized, "light");
  const dark = cursorVarsForMode(normalized, "dark");
  Object.assign(base, light);

  const differs = Object.keys(dark).some((name) => dark[name] !== light[name]);
  return { base, dark: differs ? dark : {} };
}

// The same four class signals 10-fixes-dark.css uses, in the same order. Every one of them
// lands the declaration on an element that `body { cursor: … }` resolves against: on
// <html> for the :root forms (body inherits the custom property), on <body> itself for the
// two body forms (a declaration on the element wins over the inherited one). The
// descendant-only case — .rm-dark-theme on some inner node — reaches that node's subtree,
// which is the same reach the caret has in 40-beam.css.
export const DARK_SELECTORS = Object.freeze([
  ":root.bp3-dark",
  "body.bt-theme-dark",
  ".rm-dark-theme",
  "body.roam-body.dark",
]);

// Fifth signal: Roam in auto mode stamps nothing, so an OS-dark user gets no class at all.
// Guarded with :not(.bp3-light) so an explicit light choice still wins over the OS hint.
export const DARK_MEDIA_SELECTOR = ":root:not(.bp3-light)";

function block(selector, vars, indent = "") {
  const declarations = Object.entries(vars).map(([name, value]) => `${indent}  ${name}: ${value};`);
  return `${indent}${selector} {\n${declarations.join("\n")}\n${indent}}\n`;
}

export function renderThemeVarsCss(config) {
  const { base, dark } = computeThemeVars(config);
  let css = block(":root", base);
  if (!Object.keys(dark).length) return css;
  css += `\n${block(DARK_SELECTORS.join(",\n"), dark)}`;
  css += `\n@media (prefers-color-scheme: dark) {\n${block(DARK_MEDIA_SELECTOR, dark, "  ")}}\n`;
  return css;
}

export function applyPackClasses(doc, config) {
  const root = doc?.documentElement;
  if (!root?.classList) return;
  if (normalizeBeamConfig(config).pack) root.classList.remove(BEAM_OFF_CLASS);
  else root.classList.add(BEAM_OFF_CLASS);
}

export function installThemeVars({ extensionAPI, lifecycle, doc = globalThis.document }) {
  // No browser DOM (e.g. under node:test) — the caller still gets a live refresh handle.
  if (!doc?.createElement) return { refresh() {}, element: null };

  const style = doc.createElement("style");
  style.id = THEME_VARS_STYLE_ID;
  style.type = "text/css";
  lifecycle.node(style, doc.head || doc.documentElement);
  lifecycle.add(() => doc.documentElement?.classList?.remove(BEAM_OFF_CLASS));

  const refresh = () => {
    const config = readBeamSettings(extensionAPI);
    style.textContent = renderThemeVarsCss(config);
    applyPackClasses(doc, config);
  };

  refresh();
  return { refresh, element: style };
}
