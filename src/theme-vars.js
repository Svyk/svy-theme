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
  caretBlink: "bp-beam-caret-blink",
  wash: "bp-beam-wash",
  washIntensity: "bp-beam-wash-intensity",
  cursor: "bp-beam-cursor",
});

export const CARET_SHAPES = Object.freeze(["block", "bar"]);
export const WASH_INTENSITIES = Object.freeze(["subtle", "medium", "off"]);
export const CURSOR_STYLES = Object.freeze(["svy", "native"]);

// Dark caret is #48D0C0 (APCA Lc -62.9 on #202B33) per the U6 design-token research;
// it replaces Beam v1's #66E3D0. Light caret is unchanged.
export const BEAM_DEFAULTS = Object.freeze({
  pack: true,
  caretLight: "#008478",
  caretDark: "#48d0c0",
  caretShape: "block",
  caretBlink: false,
  wash: true,
  washIntensity: "subtle",
  cursor: "svy",
});

// Beam v1's wash base is a hair deeper than the caret it accompanies, and that pairing
// is what shipped, so the default keeps it byte-for-byte. A customized caret has no
// matching hand-tuned wash, so the wash is derived from the caret instead.
const DEFAULT_WASH_RGB = Object.freeze({ light: "0, 122, 112", dark: "72, 208, 192" });

// Gamut-expanded equivalents of the default carets, used only inside @media
// (color-gamut: p3). A customized caret is published as-is in both blocks.
const DEFAULT_CARET_P3 = Object.freeze({ light: "0.55 0.13 184", dark: "0.78 0.15 184" });

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

export function normalizeBeamConfig(raw = {}) {
  return {
    pack: normalizeSwitch(raw.pack, BEAM_DEFAULTS.pack),
    caretLight: normalizeHex(raw.caretLight, BEAM_DEFAULTS.caretLight),
    caretDark: normalizeHex(raw.caretDark, BEAM_DEFAULTS.caretDark),
    caretShape: normalizeChoice(raw.caretShape, CARET_SHAPES, BEAM_DEFAULTS.caretShape),
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
  default: ({ outline, accent, spark }) => `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path d='M4 3L25 16L16 19L21 28L16 31L11 21L4 27Z' fill='${accent}' stroke='${outline}' stroke-width='2' stroke-linejoin='round'/><path d='M6 5L12 21' stroke='${spark}' stroke-width='2.5' stroke-linecap='round'/></svg>`,
  pointer: ({ outline, accent, spark, highlight }) => `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><circle cx='16' cy='16' r='10' fill='${outline}' stroke='${accent}' stroke-width='3'/><circle cx='16' cy='16' r='4' fill='${spark}' stroke='${highlight}' stroke-width='1'/></svg>`,
  text: ({ outline, accent, spark, highlight }) => `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><rect x='10' y='3' width='12' height='26' rx='6' fill='${outline}' stroke='${accent}' stroke-width='2'/><rect x='13' y='6' width='6' height='20' rx='3' fill='${spark}'/><circle cx='16' cy='16' r='2' fill='${highlight}'/></svg>`,
});

const CURSOR_ANCHOR = Object.freeze({
  default: "4 3, auto",
  pointer: "16 16, pointer",
  text: "16 16, text",
});

// The cursor art is one set for both modes (its outline is dark either way, which is why
// v1 shipped a single set). Its palette comes from the tokens: theme accent for the
// body, the beam's dark caret for the spark, so cursor color follows the caret setting.
export function buildCursorValue(kind, palette) {
  const svg = CURSOR_SVG[kind];
  if (!svg) throw new TypeError(`Unknown cursor kind: ${kind}`);
  return `url("data:image/svg+xml,${encodeSvg(svg(palette))}") ${CURSOR_ANCHOR[kind]}`;
}

export function computeThemeVars(config) {
  const normalized = normalizeBeamConfig(config);
  const washOn = normalized.wash && normalized.washIntensity !== "off";
  const vars = {};

  for (const mode of ["light", "dark"]) {
    const caret = mode === "light" ? normalized.caretLight : normalized.caretDark;
    const isDefault = caret === (mode === "light" ? BEAM_DEFAULTS.caretLight : BEAM_DEFAULTS.caretDark);
    const alpha = washOn ? WASH_ALPHA[normalized.washIntensity][mode] : null;

    vars[`--svy-beam-caret-${mode}`] = caret;
    vars[`--svy-beam-caret-${mode}-p3`] = isDefault ? `oklch(${DEFAULT_CARET_P3[mode]})` : caret;

    if (alpha == null) {
      vars[`--svy-beam-wash-${mode}`] = "transparent";
      vars[`--svy-beam-wash-${mode}-p3`] = "transparent";
    } else {
      const rgb = isDefault ? DEFAULT_WASH_RGB[mode] : hexToRgbTriplet(caret);
      vars[`--svy-beam-wash-${mode}`] = `rgba(${rgb}, ${alpha})`;
      vars[`--svy-beam-wash-${mode}-p3`] = isDefault
        ? `oklch(${DEFAULT_CARET_P3[mode]} / ${alpha})`
        : `rgba(${rgb}, ${alpha})`;
    }
  }

  vars["--svy-beam-caret-shape"] = normalized.caretShape;
  // caret-animation: manual means the author owns the animation, i.e. no blink.
  vars["--svy-beam-caret-animation"] = normalized.caretBlink ? "auto" : "manual";
  vars["--svy-beam-wash-duration"] = washOn ? WASH_DURATION : "0ms";
  vars["--svy-beam-wash-radius"] = WASH_RADIUS;

  if (normalized.cursor === "native") {
    vars["--svy-beam-cursor-default"] = "auto";
    vars["--svy-beam-cursor-pointer"] = "pointer";
    vars["--svy-beam-cursor-text"] = "text";
  } else {
    const palette = {
      outline: "#182026",
      accent: "#48aff0",
      spark: normalized.caretDark,
      highlight: "#f5f8fa",
    };
    vars["--svy-beam-cursor-default"] = buildCursorValue("default", palette);
    vars["--svy-beam-cursor-pointer"] = buildCursorValue("pointer", palette);
    vars["--svy-beam-cursor-text"] = buildCursorValue("text", palette);
  }

  return vars;
}

export function renderThemeVarsCss(config) {
  const vars = computeThemeVars(config);
  const declarations = Object.entries(vars).map(([name, value]) => `  ${name}: ${value};`);
  return `:root {\n${declarations.join("\n")}\n}\n`;
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
