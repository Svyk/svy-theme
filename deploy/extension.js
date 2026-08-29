/* Svy Theme v0.1.0 | MIT | generated; edit src/ */

// src/lifecycle.js
function isPromiseLike(value) {
  return value != null && typeof value.then === "function";
}
async function callSafely(disposer) {
  const result = disposer();
  if (isPromiseLike(result)) await result;
}
function createLifecycle() {
  let disposed = false;
  const disposers = [];
  const add = (disposer) => {
    if (typeof disposer !== "function") throw new TypeError("A disposer must be a function");
    if (disposed) {
      void callSafely(disposer).catch((error) => console.error("[svy-theme] Late cleanup failed", error));
      return disposer;
    }
    disposers.push(disposer);
    return disposer;
  };
  return {
    get disposed() {
      return disposed;
    },
    add,
    async command(commandApi, config) {
      if (!commandApi?.addCommand || !commandApi?.removeCommand) {
        throw new TypeError("A command API with addCommand/removeCommand is required");
      }
      await commandApi.addCommand(config);
      add(() => commandApi.removeCommand({ label: config.label }));
    },
    event(target, type, listener, options) {
      target.addEventListener(type, listener, options);
      add(() => target.removeEventListener(type, listener, options));
      return listener;
    },
    interval(callback, delay, ...args) {
      const id = globalThis.setInterval(callback, delay, ...args);
      add(() => globalThis.clearInterval(id));
      return id;
    },
    timeout(callback, delay, ...args) {
      const id = globalThis.setTimeout(callback, delay, ...args);
      add(() => globalThis.clearTimeout(id));
      return id;
    },
    observer(observer, target, options) {
      observer.observe(target, options);
      add(() => observer.disconnect());
      return observer;
    },
    node(node, parent = globalThis.document?.body) {
      if (!parent) throw new Error("A parent node is required outside the browser");
      parent.append(node);
      add(() => node.remove());
      return node;
    },
    pullWatch(dataApi, pattern, entity, callback) {
      if (!dataApi?.addPullWatch || !dataApi?.removePullWatch) {
        throw new TypeError("A Roam data API with addPullWatch/removePullWatch is required");
      }
      dataApi.addPullWatch(pattern, entity, callback);
      add(() => dataApi.removePullWatch(pattern, entity, callback));
      return callback;
    },
    async settingsPanel(extensionAPI, config) {
      await extensionAPI.settings.panel.create(config);
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      const errors = [];
      for (const disposer of disposers.splice(0).reverse()) {
        try {
          await callSafely(disposer);
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) throw new AggregateError(errors, "One or more extension cleanups failed");
    }
  };
}

// src/theme-vars.js
var THEME_VARS_STYLE_ID = "svy-theme-vars";
var BEAM_OFF_CLASS = "svy-off-beam";
var BEAM_SETTING_IDS = Object.freeze({
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
  cursor: "bp-beam-cursor"
});
var CARET_SHAPES = Object.freeze(["beam", "block", "outline", "underline", "bar", "native"]);
var CARET_GLOWS = Object.freeze(["soft", "none", "halo"]);
var CARET_BEHAVIORS = Object.freeze(["responsive", "steady", "glide", "breathe", "comet"]);
var WASH_INTENSITIES = Object.freeze(["subtle", "medium", "off"]);
var CURSOR_STYLES = Object.freeze(["svy", "native"]);
var CARET_CONTROL_LIMITS = Object.freeze({
  caretWidth: Object.freeze({ min: 50, max: 200 }),
  caretHeight: Object.freeze({ min: 30, max: 120 }),
  caretRadius: Object.freeze({ min: 0, max: 12 }),
  caretOpacity: Object.freeze({ min: 45, max: 100 })
});
var LEGACY_CARET_LIGHT = "#008478";
var WASH_MIGRATION_SETTING_ID = "bp-beam-wash-migrated-2026-08-07";
var CARET_V3_MIGRATION_SETTING_ID = "bp-beam-caret-v3-migrated-2026-08-08";
var BEAM_DEFAULTS = Object.freeze({
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
  cursor: "svy"
});
var DEFAULT_WASH_RGB = Object.freeze({ light: "0, 122, 112", dark: "72, 208, 192" });
var DEFAULT_CARET_P3 = Object.freeze({ light: "0.47 0.11 182", dark: "0.78 0.15 184" });
var WASH_ALPHA = Object.freeze({
  subtle: Object.freeze({ light: 0.045, dark: 0.055 }),
  medium: Object.freeze({ light: 0.09, dark: 0.11 })
});
var WASH_DURATION = "70ms";
var WASH_RADIUS = "4px";
var HEX_PATTERN = /^#?(?:([0-9a-f]{3})|([0-9a-f]{6}))$/i;
function normalizeHex(value, fallback = null) {
  if (typeof value !== "string") return fallback;
  const match = HEX_PATTERN.exec(value.trim());
  if (!match) return fallback;
  const digits = match[1] ? [...match[1]].map((digit) => digit + digit).join("") : match[2];
  return `#${digits.toLowerCase()}`;
}
function normalizeChoice(value, allowed, fallback) {
  if (typeof value !== "string") return fallback;
  const lowered = value.trim().toLowerCase();
  return allowed.includes(lowered) ? lowered : fallback;
}
function normalizeSwitch(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}
function normalizeNumber(value, { min, max }, fallback) {
  if (typeof value !== "string" && typeof value !== "number" || String(value).trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(Math.min(max, Math.max(min, parsed)) * 10) / 10;
}
function normalizeBeamConfig(raw = {}) {
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
    cursor: normalizeChoice(raw.cursor, CURSOR_STYLES, BEAM_DEFAULTS.cursor)
  };
}
function readBeamSettings(extensionAPI) {
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
    cursor: get(BEAM_SETTING_IDS.cursor)
  });
}
function hexToRgbTriplet(hex) {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `${red}, ${green}, ${blue}`;
}
function encodeSvg(svg) {
  return svg.replace(/%/g, "%25").replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E").replace(/"/g, "%22").replace(/\s+/g, " ").trim();
}
var CURSOR_SVG = Object.freeze({
  default: ({ outline, body, spark }) => `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path d='M4 3L25 16L16 19L21 28L16 31L11 21L4 27Z' fill='${body}' stroke='${outline}' stroke-width='2' stroke-linejoin='round'/><path d='M6 5L12 21' stroke='${spark}' stroke-width='2.5' stroke-linecap='round'/></svg>`,
  pointer: ({ outline, accent, spark, highlight }) => `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><circle cx='16' cy='16' r='10' fill='${outline}' stroke='${accent}' stroke-width='3'/><circle cx='16' cy='16' r='4' fill='${spark}' stroke='${highlight}' stroke-width='1'/></svg>`,
  text: ({ outline, accent, spark, highlight }) => `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><rect x='10' y='3' width='12' height='26' rx='6' fill='${outline}' stroke='${accent}' stroke-width='2'/><rect x='13' y='6' width='6' height='20' rx='3' fill='${spark}'/><circle cx='16' cy='16' r='2' fill='${highlight}'/></svg>`
});
var CURSOR_ANCHOR = Object.freeze({
  default: "4 3, auto",
  pointer: "16 16, pointer",
  text: "16 16, text"
});
var CURSOR_MODES = Object.freeze(["light", "dark"]);
var CURSOR_PALETTE = Object.freeze({
  light: Object.freeze({ outline: "#182026", body: "#48aff0", accent: "#48aff0", highlight: "#f5f8fa" }),
  dark: Object.freeze({ outline: "#e1e8ed", body: "#182026", accent: "#48d0c0", highlight: "#182026" })
});
function buildCursorValue(kind, palette) {
  const svg = CURSOR_SVG[kind];
  if (!svg) throw new TypeError(`Unknown cursor kind: ${kind}`);
  return `url("data:image/svg+xml,${encodeSvg(svg(palette))}") ${CURSOR_ANCHOR[kind]}`;
}
function cursorVarsForMode(normalized, mode) {
  if (normalized.cursor === "native") {
    return {
      "--svy-beam-cursor-default": "auto",
      "--svy-beam-cursor-pointer": "pointer",
      "--svy-beam-cursor-text": "text"
    };
  }
  const palette = {
    ...CURSOR_PALETTE[mode],
    spark: mode === "light" ? normalized.caretLight : normalized.caretDark
  };
  return {
    "--svy-beam-cursor-default": buildCursorValue("default", palette),
    "--svy-beam-cursor-pointer": buildCursorValue("pointer", palette),
    "--svy-beam-cursor-text": buildCursorValue("text", palette)
  };
}
function computeThemeVars(config) {
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
      base[`--svy-beam-wash-${mode}-p3`] = isDefault ? `oklch(${DEFAULT_CARET_P3[mode]} / ${alpha})` : `rgba(${rgb}, ${alpha})`;
    }
  }
  const nativeShape = {
    beam: "bar",
    block: "block",
    outline: "block",
    underline: "underscore",
    bar: "bar",
    native: "auto"
  }[normalized.caretShape];
  base["--svy-beam-caret-shape"] = nativeShape;
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
var DARK_SELECTORS = Object.freeze([
  ":root.bp3-dark",
  "body.bt-theme-dark",
  ".rm-dark-theme",
  "body.roam-body.dark"
]);
var DARK_MEDIA_SELECTOR = ":root:not(.bp3-light)";
function block(selector, vars, indent = "") {
  const declarations = Object.entries(vars).map(([name, value]) => `${indent}  ${name}: ${value};`);
  return `${indent}${selector} {
${declarations.join("\n")}
${indent}}
`;
}
function renderThemeVarsCss(config) {
  const { base, dark } = computeThemeVars(config);
  let css = block(":root", base);
  if (!Object.keys(dark).length) return css;
  css += `
${block(DARK_SELECTORS.join(",\n"), dark)}`;
  css += `
@media (prefers-color-scheme: dark) {
${block(DARK_MEDIA_SELECTOR, dark, "  ")}}
`;
  return css;
}
function applyPackClasses(doc, config) {
  const root = doc?.documentElement;
  if (!root?.classList) return;
  if (normalizeBeamConfig(config).pack) root.classList.remove(BEAM_OFF_CLASS);
  else root.classList.add(BEAM_OFF_CLASS);
}
function installThemeVars({ extensionAPI, lifecycle, doc = globalThis.document }) {
  if (!doc?.createElement) return { refresh() {
  }, element: null };
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

// src/caret-overlay.js
var BLOCK_CARET_CLASS = "svy-block-caret";
var CARET_OVERLAY_CLASS = "svy-caret-overlay-ui";
var CARET_PING_CLASS = "svy-caret-ping";
var MARKER_CHAR = "​";
var BLINK_PERIOD_MS = 530;
var MIRROR_PROPERTIES = Object.freeze([
  "boxSizing",
  "width",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontVariant",
  "letterSpacing",
  "textTransform",
  "textIndent",
  "lineHeight",
  "tabSize",
  "direction"
]);
function isTextTarget(element) {
  if (!element || !element.tagName) return false;
  if (element.tagName === "TEXTAREA") return true;
  if (element.tagName !== "INPUT") return false;
  const type = (element.getAttribute?.("type") || "text").toLowerCase();
  return ["text", "search", "url", "tel", "email", "number"].includes(type);
}
function supportsNativeCaretShape(css = globalThis.CSS) {
  return Boolean(css?.supports?.("caret-shape", "block"));
}
function needsOverlay({ pack, caretShape }) {
  return Boolean(pack) && caretShape !== "native";
}
function measureCaretRect(element, doc, win) {
  const computed = win.getComputedStyle(element);
  const mirror = doc.createElement("div");
  const style = mirror.style;
  style.position = "absolute";
  style.top = "0";
  style.left = "-99999px";
  style.visibility = "hidden";
  style.height = "auto";
  style.whiteSpace = "pre-wrap";
  style.overflowWrap = "break-word";
  for (const name of MIRROR_PROPERTIES) style[name] = computed[name];
  const value = element.value ?? "";
  const start = Math.min(element.selectionStart ?? value.length, value.length);
  const underCaret = value[start] && value[start] !== "\n" ? value[start] : "0";
  const hasGlyph = underCaret !== "0" || value[start] === "0";
  mirror.textContent = value.slice(0, start);
  const marker = doc.createElement("span");
  const lineHeightPx = Number.parseFloat(computed.lineHeight) || Number.parseFloat(computed.fontSize) * 1.2 || 19;
  marker.style.display = "inline-block";
  marker.style.width = "0";
  marker.style.height = `${lineHeightPx}px`;
  marker.style.verticalAlign = "top";
  marker.textContent = MARKER_CHAR;
  mirror.appendChild(marker);
  const glyph = doc.createElement("span");
  glyph.textContent = underCaret;
  mirror.appendChild(glyph);
  (doc.body || doc.documentElement).appendChild(mirror);
  const measured = {
    top: marker.offsetTop,
    left: marker.offsetLeft,
    height: marker.offsetHeight || lineHeightPx,
    width: glyph.offsetWidth || Number.parseFloat(computed.fontSize) * 0.6 || 8,
    glyph: hasGlyph ? underCaret : ""
  };
  mirror.remove();
  const box = element.getBoundingClientRect();
  const offsetW = element.offsetWidth || 0;
  const offsetH = element.offsetHeight || 0;
  const scaleX = offsetW ? box.width / offsetW : 1;
  const scaleY = offsetH ? box.height / offsetH : 1;
  const borderLeft = Number.parseFloat(computed.borderLeftWidth) || 0;
  const borderTop = Number.parseFloat(computed.borderTopWidth) || 0;
  const x = box.left + (borderLeft + measured.left - (element.scrollLeft || 0)) * scaleX;
  const y = box.top + (borderTop + measured.top - (element.scrollTop || 0)) * scaleY;
  const padLeft = Number.parseFloat(computed.paddingLeft) || 0;
  const padTop = Number.parseFloat(computed.paddingTop) || 0;
  const padRight = Number.parseFloat(computed.paddingRight) || 0;
  const padBottom = Number.parseFloat(computed.paddingBottom) || 0;
  const width = measured.width * scaleX;
  const height = measured.height * scaleY;
  const content = {
    left: box.left + (borderLeft + padLeft) * scaleX,
    top: box.top + (borderTop + padTop) * scaleY,
    right: box.right - (borderLeft + padRight) * scaleX,
    bottom: box.bottom - (borderTop + padBottom) * scaleY
  };
  const visible = x + width > content.left && x < content.right && y + height > content.top && y < content.bottom;
  return {
    x,
    y,
    width,
    height,
    glyph: measured.glyph,
    visible
  };
}
var halfPixel = (value) => Math.round(value * 2) / 2;
function computeCaretBox(rect, config) {
  const normalized = normalizeBeamConfig(config);
  const widthScale = normalized.caretWidth / 100;
  const heightScale = normalized.caretHeight / 100;
  const shape = normalized.caretShape;
  const cellWidth = Math.max(1, rect.width);
  const lineHeight = Math.max(1, rect.height);
  let width = cellWidth * widthScale;
  let height = Math.max(2, lineHeight * heightScale);
  let x = rect.x;
  let y = rect.y + (lineHeight - height) / 2;
  if (shape === "beam") {
    width = 3 * widthScale;
    x = rect.x - width / 2;
  } else if (shape === "bar") {
    width = 2 * widthScale;
    x = rect.x - width / 2;
  } else if (shape === "underline") {
    height = Math.max(2, Math.min(6, lineHeight * 0.16 * (normalized.caretHeight / 82)));
    y = rect.y + lineHeight - height;
  }
  width = Math.max(1, width);
  return {
    x: halfPixel(x),
    y: halfPixel(y),
    width: halfPixel(width),
    height: halfPixel(height),
    lineOffset: halfPixel(y - rect.y)
  };
}
function surfaceColorBehind(element, win) {
  let node = element;
  while (node && node.nodeType === 1) {
    const color = win.getComputedStyle(node).backgroundColor;
    if (color && color !== "transparent" && color !== "rgba(0, 0, 0, 0)") return color;
    node = node.parentElement;
  }
  return win.getComputedStyle(win.document?.body || element).backgroundColor || "#ffffff";
}
function installCaretOverlay({
  extensionAPI,
  lifecycle,
  doc = globalThis.document,
  win = globalThis.window,
  // Retained so older callers/tests need no signature change. Custom v3 styles render
  // identically regardless of native caret-shape support.
  nativeSupported = supportsNativeCaretShape()
} = {}) {
  void nativeSupported;
  const inert = { refresh() {
  }, get active() {
    return false;
  } };
  if (!doc?.createElement || !doc?.documentElement?.classList || !win?.getComputedStyle) return inert;
  const root = doc.documentElement;
  const motionQuery = win.matchMedia?.("(prefers-reduced-motion: reduce)") || null;
  const motionReduced = () => Boolean(motionQuery?.matches);
  let config = BEAM_DEFAULTS;
  let enabled = false;
  let target = null;
  let overlay = null;
  let glyphNode = null;
  let blinkOn = false;
  let blinkVisible = true;
  let blinkTimer = null;
  let pingTimer = null;
  const readSettings = () => {
    const get = (key) => extensionAPI?.settings?.get?.(key);
    return normalizeBeamConfig(
      Object.fromEntries(Object.entries(BEAM_SETTING_IDS).map(([key, id]) => [key, get(id)]))
    );
  };
  const hide = () => {
    target = null;
    root.classList.remove(BLOCK_CARET_CLASS);
    if (overlay) overlay.style.display = "none";
  };
  const ensureOverlay = () => {
    if (overlay) return;
    overlay = doc.createElement("div");
    overlay.setAttribute("aria-hidden", "true");
    overlay.classList.add(CARET_OVERLAY_CLASS);
    const style = overlay.style;
    style.position = "fixed";
    style.top = "0";
    style.left = "0";
    style.zIndex = "900";
    style.pointerEvents = "none";
    style.boxSizing = "border-box";
    style.overflow = "hidden";
    style.display = "none";
    glyphNode = doc.createElement("span");
    glyphNode.style.display = "none";
    glyphNode.style.textAlign = "center";
    glyphNode.style.whiteSpace = "pre";
    overlay.appendChild(glyphNode);
    lifecycle.node(overlay, doc.body || doc.documentElement);
  };
  const render = () => {
    if (!enabled || !target || !overlay) return;
    if (!target.isConnected) {
      hide();
      return;
    }
    if (target.selectionEnd != null && target.selectionStart !== target.selectionEnd) {
      overlay.style.display = "none";
      return;
    }
    let rect;
    try {
      rect = measureCaretRect(target, doc, win);
    } catch {
      hide();
      return;
    }
    if (!rect.visible) {
      overlay.style.display = "none";
      return;
    }
    const targetStyle = win.getComputedStyle(target);
    const rootStyle = win.getComputedStyle(root);
    const caretColor = targetStyle.getPropertyValue?.("--svy-beam-caret")?.trim() || rootStyle.getPropertyValue?.("--svy-beam-caret")?.trim() || BEAM_DEFAULTS.caretLight;
    const box = computeCaretBox(rect, config);
    const reduced = motionReduced();
    const behavior = reduced || blinkOn ? "steady" : config.caretBehavior;
    const radius = Math.min(config.caretRadius, box.width / 2, box.height / 2);
    overlay.setAttribute("data-shape", config.caretShape);
    overlay.setAttribute("data-glow", config.caretGlow);
    overlay.setAttribute("data-behavior", behavior);
    overlay.style.display = "block";
    overlay.style.transform = `translate(${box.x}px, ${box.y}px)`;
    overlay.style.width = `${box.width}px`;
    overlay.style.height = `${box.height}px`;
    overlay.style.borderRadius = `${radius}px`;
    overlay.style.opacity = blinkOn && !blinkVisible ? "0" : `${config.caretOpacity / 100}`;
    overlay.style.backgroundColor = config.caretShape === "outline" ? "transparent" : caretColor;
    overlay.style.border = config.caretShape === "outline" ? `1.5px solid ${caretColor}` : "0";
    overlay.style.setProperty?.("--svy-caret-overlay-color", caretColor);
    const paintsGlyph = config.caretShape === "block";
    glyphNode.style.display = paintsGlyph && rect.glyph ? "block" : "none";
    if (paintsGlyph && rect.glyph) {
      glyphNode.textContent = rect.glyph;
      glyphNode.style.fontFamily = targetStyle.fontFamily;
      glyphNode.style.fontSize = targetStyle.fontSize;
      glyphNode.style.fontWeight = targetStyle.fontWeight;
      glyphNode.style.fontStyle = targetStyle.fontStyle;
      glyphNode.style.color = surfaceColorBehind(target, win);
      glyphNode.style.lineHeight = `${rect.height}px`;
      glyphNode.style.transform = `translateY(${-box.lineOffset}px)`;
    }
  };
  const show = (element) => {
    if (!enabled || !isTextTarget(element)) return;
    ensureOverlay();
    target = element;
    root.classList.add(BLOCK_CARET_CLASS);
    render();
  };
  const ping = () => {
    if (!overlay || motionReduced()) return;
    if (config.caretBehavior !== "responsive" && config.caretBehavior !== "comet") return;
    overlay.classList.remove(CARET_PING_CLASS);
    void overlay.offsetWidth;
    overlay.classList.add(CARET_PING_CLASS);
    if (pingTimer) globalThis.clearTimeout(pingTimer);
    pingTimer = globalThis.setTimeout(() => {
      overlay?.classList.remove(CARET_PING_CLASS);
      pingTimer = null;
    }, 180);
  };
  const ensureAttached = () => {
    if (!enabled) return;
    const active = doc.activeElement;
    if (isTextTarget(active) && active !== target) show(active);
  };
  const onFocusIn = (event) => {
    if (enabled && isTextTarget(event.target)) show(event.target);
  };
  const onFocusOut = (event) => {
    if (event.target !== target) return;
    globalThis.setTimeout(() => {
      if (lifecycle.disposed || !enabled) return;
      const active = doc.activeElement;
      if (isTextTarget(active)) show(active);
      else hide();
    }, 0);
  };
  const onEdit = (event) => {
    ensureAttached();
    if (event.target === target) {
      blinkVisible = true;
      render();
      ping();
    }
  };
  const onSelectionChange = () => {
    ensureAttached();
    if (target && doc.activeElement === target) render();
  };
  const onScroll = () => {
    if (target) render();
  };
  const syncBlink = () => {
    const wanted = enabled && blinkOn && !motionReduced();
    if (wanted && !blinkTimer) {
      blinkTimer = globalThis.setInterval(() => {
        if (target) {
          blinkVisible = !blinkVisible;
          render();
        }
      }, BLINK_PERIOD_MS);
    } else if (!wanted && blinkTimer) {
      globalThis.clearInterval(blinkTimer);
      blinkTimer = null;
    }
    if (!wanted) blinkVisible = true;
  };
  const apply = () => {
    config = readSettings();
    enabled = needsOverlay(config);
    blinkOn = config.caretBlink;
    syncBlink();
    if (!enabled) {
      hide();
      return;
    }
    if (isTextTarget(doc.activeElement)) show(doc.activeElement);
    else if (target) render();
  };
  lifecycle.event(doc, "focusin", onFocusIn);
  lifecycle.event(doc, "focusout", onFocusOut);
  lifecycle.event(doc, "input", onEdit, true);
  lifecycle.event(doc, "selectionchange", onSelectionChange);
  lifecycle.event(doc, "keyup", onSelectionChange, true);
  lifecycle.event(doc, "mouseup", onSelectionChange, true);
  lifecycle.event(win, "scroll", onScroll, true);
  lifecycle.event(win, "resize", onScroll);
  if (motionQuery?.addEventListener) lifecycle.event(motionQuery, "change", apply);
  lifecycle.add(() => {
    if (blinkTimer) globalThis.clearInterval(blinkTimer);
    if (pingTimer) globalThis.clearTimeout(pingTimer);
    root.classList.remove(BLOCK_CARET_CLASS);
  });
  apply();
  return {
    refresh: apply,
    get active() {
      return Boolean(enabled && target);
    }
  };
}

// src/settings.js
var SETTING_IDS = Object.freeze({
  appearance: "bp-appearance"
});
var APPEARANCE_MODES = Object.freeze(["auto", "dark", "light"]);
var DEFAULT_APPEARANCE = "auto";
function normalizeMode(value) {
  if (typeof value !== "string") return DEFAULT_APPEARANCE;
  const lowered = value.toLowerCase();
  return APPEARANCE_MODES.includes(lowered) ? lowered : DEFAULT_APPEARANCE;
}
async function initializeSettings(extensionAPI) {
  if (extensionAPI.settings.canSet === false) return;
  const raw = extensionAPI.settings.get(SETTING_IDS.appearance);
  if (raw == null) {
    await extensionAPI.settings.set(SETTING_IDS.appearance, DEFAULT_APPEARANCE);
    return;
  }
  const normalized = normalizeMode(raw);
  if (raw !== normalized) {
    await extensionAPI.settings.set(SETTING_IDS.appearance, normalized);
  }
}
async function initializeBeamSettings(extensionAPI) {
  if (extensionAPI.settings.canSet === false) return;
  for (const [key, id] of Object.entries(BEAM_SETTING_IDS)) {
    if (extensionAPI.settings.get(id) == null) {
      await extensionAPI.settings.set(id, BEAM_DEFAULTS[key]);
    }
  }
  const storedLight = extensionAPI.settings.get(BEAM_SETTING_IDS.caretLight);
  if (normalizeHex(storedLight) === LEGACY_CARET_LIGHT) {
    await extensionAPI.settings.set(BEAM_SETTING_IDS.caretLight, BEAM_DEFAULTS.caretLight);
  }
  if (!normalizeSwitch(extensionAPI.settings.get(WASH_MIGRATION_SETTING_ID), false)) {
    if (normalizeSwitch(extensionAPI.settings.get(BEAM_SETTING_IDS.wash), false)) {
      await extensionAPI.settings.set(BEAM_SETTING_IDS.wash, false);
    }
    await extensionAPI.settings.set(WASH_MIGRATION_SETTING_ID, true);
  }
  if (!normalizeSwitch(extensionAPI.settings.get(CARET_V3_MIGRATION_SETTING_ID), false)) {
    const storedShape = extensionAPI.settings.get(BEAM_SETTING_IDS.caretShape);
    if (typeof storedShape === "string" && storedShape.trim().toLowerCase() === "block") {
      await extensionAPI.settings.set(BEAM_SETTING_IDS.caretShape, BEAM_DEFAULTS.caretShape);
    }
    await extensionAPI.settings.set(CARET_V3_MIGRATION_SETTING_ID, true);
  }
}
function createBeamPreviewComponent(React = globalThis.window?.React) {
  if (typeof React?.createElement !== "function") return null;
  const h = React.createElement;
  return function SvyBeamPreview() {
    return h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "8px 10px",
          borderRadius: "var(--svy-beam-wash-radius, 4px)",
          background: "var(--svy-beam-wash, rgba(0, 122, 112, 0.045))",
          border: "1px solid var(--svy-beam-caret, #00695e)"
        }
      },
      h("span", {
        className: "svy-beam-preview-caret",
        style: {
          display: "inline-block",
          width: "var(--svy-beam-caret-preview-width, 3px)",
          height: "var(--svy-beam-caret-preview-height, 16.4px)",
          borderRadius: "var(--svy-beam-caret-radius, 3px)",
          background: "var(--svy-beam-caret, #00695e)",
          boxShadow: "0 0 8px color-mix(in srgb, var(--svy-beam-caret, #00695e) 32%, transparent)",
          opacity: "var(--svy-beam-caret-opacity, 1)"
        }
      }),
      h("span", { style: { fontSize: "12px", opacity: 0.8 } }, "Svy Beam · color and size update live")
    );
  };
}
function createSettingsPanel({ onAppearanceChange, onThemeVarsChange, React } = {}) {
  const changed = () => {
    onThemeVarsChange?.();
  };
  const preview = createBeamPreviewComponent(React);
  const settings = [
    {
      id: SETTING_IDS.appearance,
      name: "Appearance",
      description: "Auto follows your system (and Roam) and updates when it changes. Dark and Light stay put. The topbar control is labeled Auto, Dark, or Light — click it to cycle Auto → Dark → Light.",
      action: {
        type: "select",
        items: [...APPEARANCE_MODES],
        onChange: (event) => {
          onAppearanceChange?.(event?.target?.value);
        }
      }
    },
    {
      id: BEAM_SETTING_IDS.pack,
      name: "Svy Beam",
      description: "Master switch for the beam layer: caret color/shape, focus wash, and custom cursors. Off restores Roam's native caret and cursors without a reload.",
      action: { type: "switch", onChange: changed }
    },
    {
      id: BEAM_SETTING_IDS.caretLight,
      name: "Caret color (light)",
      description: "Hex color for the text insertion point in light mode, and the accent color of the light-mode cursors. Accepts #rgb or #rrggbb; anything else falls back to the default #00695E (APCA Lc 77.6 on the light surface).",
      action: { type: "input", placeholder: BEAM_DEFAULTS.caretLight, onChange: changed }
    },
    {
      id: BEAM_SETTING_IDS.caretDark,
      name: "Caret color (dark)",
      description: "Hex color for the insertion point in dark mode, and the accent color of the dark-mode cursors. Default #48D0C0 (APCA Lc -62.9 on the dark surface).",
      action: { type: "input", placeholder: BEAM_DEFAULTS.caretDark, onChange: changed }
    },
    {
      id: BEAM_SETTING_IDS.caretShape,
      name: "Caret shape",
      description: "beam (default) is a short rounded insertion mark; block fills the glyph cell; outline frames it; underline sits below it; bar is classic; native restores the platform caret.",
      action: { type: "select", items: [...CARET_SHAPES], onChange: changed }
    },
    {
      id: BEAM_SETTING_IDS.caretWidth,
      name: "Caret width scale (%)",
      description: "Fine control from 50–200. Scales the chosen shape: 100 is a 3px beam or one glyph-cell block.",
      action: { type: "input", placeholder: String(BEAM_DEFAULTS.caretWidth), onChange: changed }
    },
    {
      id: BEAM_SETTING_IDS.caretHeight,
      name: "Caret height (%)",
      description: "Height relative to the current line, from 30–120. The quieter default is 82.",
      action: { type: "input", placeholder: String(BEAM_DEFAULTS.caretHeight), onChange: changed }
    },
    {
      id: BEAM_SETTING_IDS.caretRadius,
      name: "Caret corner radius (px)",
      description: "Corner softness from 0–12px. Try 0 for terminal-sharp, 3 for Svy, or 8 for a pill.",
      action: { type: "input", placeholder: String(BEAM_DEFAULTS.caretRadius), onChange: changed }
    },
    {
      id: BEAM_SETTING_IDS.caretOpacity,
      name: "Caret opacity (%)",
      description: "Visibility from 45–100. Keep 100 for maximum contrast; lower values feel softer on large block shapes.",
      action: { type: "input", placeholder: String(BEAM_DEFAULTS.caretOpacity), onChange: changed }
    },
    {
      id: BEAM_SETTING_IDS.caretGlow,
      name: "Caret glow",
      description: "soft adds a restrained edge light; none is perfectly flat; halo is the playful high-energy option.",
      action: { type: "select", items: [...CARET_GLOWS], onChange: changed }
    },
    {
      id: BEAM_SETTING_IDS.caretBehavior,
      name: "Caret behavior",
      description: "responsive gives a quick typing ping; steady never moves; glide eases between positions; breathe idles gently; comet adds a tiny trail. Reduce Motion makes every option steady.",
      action: { type: "select", items: [...CARET_BEHAVIORS], onChange: changed }
    },
    {
      id: BEAM_SETTING_IDS.caretBlink,
      name: "Caret blink",
      description: "Optional classic blink. Off keeps the selected behavior; on blinks the custom caret at the platform-like cadence.",
      action: { type: "switch", onChange: changed }
    },
    {
      id: BEAM_SETTING_IDS.wash,
      name: "Focus wash",
      description: "Off by default: the caret alone marks the focused block. On tints the focused block with the caret color. Always disabled under prefers-reduced-motion, regardless of this switch.",
      action: { type: "switch", onChange: changed }
    },
    {
      id: BEAM_SETTING_IDS.washIntensity,
      name: "Wash intensity",
      description: "off (default) paints nothing even with the switch on; subtle is the original tint; medium doubles the alpha.",
      action: { type: "select", items: [...WASH_INTENSITIES], onChange: changed }
    },
    {
      id: BEAM_SETTING_IDS.cursor,
      name: "Cursor style",
      description: "svy uses the custom SVG arrow/target/beam cursors, published as a light and a dark set and tinted from that mode's caret color; native leaves Roam's cursors alone.",
      action: { type: "select", items: [...CURSOR_STYLES], onChange: changed }
    }
  ];
  if (preview) {
    settings.push({
      id: "bp-beam-preview",
      name: "Preview",
      description: "Live sample of the current caret and focus wash.",
      action: { type: "reactComponent", component: preview }
    });
  }
  return { tabTitle: "Svy Theme", settings };
}

// src/dark-signal-bridge.js
var SETTLE_DELAY_MS = 1e3;
function hasClass(element, name) {
  return Boolean(element?.classList?.contains(name));
}
function detectDarkSignals(doc) {
  const body = doc?.body;
  const root = doc?.documentElement;
  return Boolean(
    hasClass(body, "roam-body") && hasClass(body, "dark") || hasClass(body, "rm-dark-theme") || hasClass(root, "rm-dark-theme")
  );
}
function detectSystemPrefersDark(mediaQuery) {
  return Boolean(mediaQuery?.matches);
}
function bridgeAction({ signalsPresent, appearance, bridgeStamped, rootHasDark, systemPrefersDark = false }) {
  if (normalizeMode(appearance) !== "auto") return "none";
  if (signalsPresent || systemPrefersDark) return rootHasDark ? "none" : "stamp";
  return bridgeStamped ? "unstamp" : "none";
}
function installDarkSignalBridge({
  extensionAPI,
  lifecycle,
  doc = globalThis.document,
  ObserverImpl = globalThis.MutationObserver,
  settleDelayMs = SETTLE_DELAY_MS,
  win = globalThis.window,
  matchMedia
}) {
  if (!doc?.documentElement?.classList || !doc?.body || typeof ObserverImpl !== "function") return;
  const mm = matchMedia ?? win?.matchMedia?.bind(win);
  const mql = typeof mm === "function" ? mm("(prefers-color-scheme: dark)") : null;
  let bridgeStamped = false;
  const sync = () => {
    const root = doc.documentElement;
    const action = bridgeAction({
      signalsPresent: detectDarkSignals(doc),
      systemPrefersDark: detectSystemPrefersDark(mql),
      appearance: extensionAPI.settings.get(SETTING_IDS.appearance),
      bridgeStamped,
      rootHasDark: hasClass(root, "bp3-dark")
    });
    if (action === "stamp") {
      root.classList.add("bp3-dark");
      bridgeStamped = true;
    } else if (action === "unstamp") {
      root.classList.remove("bp3-dark");
      bridgeStamped = false;
    } else if (action === "none" && !hasClass(root, "bp3-dark")) {
      bridgeStamped = false;
    }
  };
  const options = { attributes: true, attributeFilter: ["class"], subtree: false };
  lifecycle.observer(new ObserverImpl(sync), doc.body, options);
  lifecycle.observer(new ObserverImpl(sync), doc.documentElement, options);
  if (mql) {
    const onMediaChange = () => sync();
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onMediaChange);
      lifecycle.add(() => mql.removeEventListener("change", onMediaChange));
    } else if (typeof mql.addListener === "function") {
      mql.addListener(onMediaChange);
      lifecycle.add(() => mql.removeListener(onMediaChange));
    }
  }
  sync();
  lifecycle.timeout(sync, settleDelayMs);
}

// src/dm-toggle.js
var ICON_BY_MODE = Object.freeze({ auto: "clean", dark: "moon", light: "flash" });
var ALL_ICON_CLASSES = Object.freeze(Object.values(ICON_BY_MODE).map((icon) => `bp3-icon-${icon}`));
var TOGGLE_CLASS = "blueprint-dm-toggle";
var ICON_CLASS = "blueprint-toggle-icon";
var WRAP_CLASS = "blueprint-dm-toggle-wrap";
var LABEL_CLASS = "blueprint-dm-toggle-label";
var LABEL_BY_MODE = Object.freeze({ auto: "Auto", dark: "Dark", light: "Light" });
var TOOLTIP_BY_MODE = Object.freeze({
  auto: "Appearance: Auto (follows system)",
  dark: "Appearance: Dark",
  light: "Appearance: Light"
});
var CONTAINER_ID = "blueprintToggleDarkMode-flex-space";
var INSTALL_RETRY_BOUND_MS = 3e4;
function recordError(err) {
  if (typeof globalThis.window !== "undefined") globalThis.window.__BP_LAST_ERROR = String(err?.stack || err);
}
function nextMode(mode) {
  const index = APPEARANCE_MODES.indexOf(normalizeMode(mode));
  return APPEARANCE_MODES[(index + 1) % APPEARANCE_MODES.length];
}
function applyAppearance(mode, doc = globalThis.document) {
  if (!doc) return;
  const normalized = normalizeMode(mode);
  const button = doc.getElementsByClassName?.(ICON_CLASS)?.[0];
  if (button?.classList) {
    for (const iconClass of ALL_ICON_CLASSES) button.classList.remove(iconClass);
    button.classList.add(`bp3-icon-${ICON_BY_MODE[normalized]}`);
  }
  const label = doc.getElementsByClassName?.(LABEL_CLASS)?.[0];
  if (label) label.textContent = LABEL_BY_MODE[normalized];
  const wrap = doc.getElementsByClassName?.(WRAP_CLASS)?.[0];
  if (wrap?.setAttribute) {
    wrap.setAttribute("title", TOOLTIP_BY_MODE[normalized]);
    wrap.setAttribute("aria-label", TOOLTIP_BY_MODE[normalized]);
  }
  const root = doc.documentElement;
  if (root?.dataset) root.dataset.bpAppearance = normalized;
  if (root?.classList) {
    if (normalized === "dark") {
      root.classList.remove("bp3-light");
      root.classList.add("bp3-dark");
    } else if (normalized === "light") {
      root.classList.remove("bp3-dark");
      root.classList.add("bp3-light");
    } else {
      root.classList.remove("bp3-light");
      root.classList.remove("bp3-dark");
    }
  }
}
function mountToggle({ doc, extensionAPI, lifecycle, currentMode }) {
  if (doc.getElementById?.(CONTAINER_ID)) return true;
  const topbar = doc.getElementsByClassName?.("rm-topbar")?.[0];
  const anchor = topbar?.lastElementChild;
  if (!anchor?.insertAdjacentElement) return false;
  const wrapper = doc.createElement("span");
  const mode = currentMode();
  wrapper.className = `bp3-popover-wrapper ${WRAP_CLASS}`;
  wrapper.setAttribute("title", TOOLTIP_BY_MODE[mode]);
  wrapper.setAttribute("aria-label", TOOLTIP_BY_MODE[mode]);
  const icon = doc.createElement("span");
  icon.className = `bp3-button bp3-minimal bp3-small bp3-icon-${ICON_BY_MODE[mode]} ${TOGGLE_CLASS} ${ICON_CLASS}`;
  wrapper.appendChild(icon);
  const label = doc.createElement("span");
  label.className = LABEL_CLASS;
  label.setAttribute("aria-hidden", "true");
  label.textContent = LABEL_BY_MODE[mode];
  wrapper.appendChild(label);
  const spacerBefore = doc.createElement("div");
  spacerBefore.className = `rm-topbar__spacer-sm ${TOGGLE_CLASS}`;
  spacerBefore.id = CONTAINER_ID;
  const spacerAfter = doc.createElement("div");
  spacerAfter.className = `rm-topbar__spacer-sm ${TOGGLE_CLASS}`;
  spacerAfter.id = `${CONTAINER_ID}-after`;
  anchor.insertAdjacentElement("afterend", wrapper);
  wrapper.insertAdjacentElement("beforebegin", spacerBefore);
  wrapper.insertAdjacentElement("afterend", spacerAfter);
  lifecycle.add(() => wrapper.remove());
  lifecycle.add(() => spacerBefore.remove());
  lifecycle.add(() => spacerAfter.remove());
  const handleClick = async () => {
    try {
      const mode2 = nextMode(currentMode());
      if (extensionAPI.settings.canSet !== false) await extensionAPI.settings.set(SETTING_IDS.appearance, mode2);
      applyAppearance(mode2, doc);
    } catch (err) {
      recordError(err);
      throw err;
    }
  };
  lifecycle.event(wrapper, "click", handleClick);
  return true;
}
async function installDarkModeToggle({
  extensionAPI,
  lifecycle,
  doc = globalThis.document,
  ObserverImpl = globalThis.MutationObserver,
  retryBoundMs = INSTALL_RETRY_BOUND_MS
}) {
  if (!doc?.createElement) return;
  const currentMode = () => normalizeMode(extensionAPI.settings.get(SETTING_IDS.appearance));
  applyAppearance(currentMode(), doc);
  const attempt = () => mountToggle({ doc, extensionAPI, lifecycle, currentMode });
  if (attempt()) return;
  if (!doc.body || typeof ObserverImpl !== "function") return;
  let settled = false;
  const observer = new ObserverImpl(() => {
    if (settled) return;
    if (attempt()) {
      settled = true;
      observer.disconnect();
    }
  });
  lifecycle.observer(observer, doc.body, { childList: true, subtree: true });
  lifecycle.timeout(() => {
    if (settled) return;
    settled = true;
    observer.disconnect();
  }, retryBoundMs);
}

// src/extension.js
var activeLifecycle = null;
async function onload({ extensionAPI, extension }) {
  if (!extensionAPI) throw new TypeError("Roam did not provide extensionAPI");
  if (activeLifecycle) await activeLifecycle.dispose();
  const lifecycle = createLifecycle();
  activeLifecycle = lifecycle;
  try {
    await initializeSettings(extensionAPI);
    await initializeBeamSettings(extensionAPI);
    const themeVars = installThemeVars({ extensionAPI, lifecycle });
    const caretOverlay = installCaretOverlay({ extensionAPI, lifecycle });
    await lifecycle.settingsPanel(
      extensionAPI,
      createSettingsPanel({
        onAppearanceChange: (mode) => applyAppearance(mode),
        onThemeVarsChange: () => {
          themeVars.refresh();
          caretOverlay.refresh();
        }
      })
    );
    await installDarkModeToggle({ extensionAPI, lifecycle });
    installDarkSignalBridge({ extensionAPI, lifecycle });
    console.info(`[svy-theme] Loaded v${extension?.version || "development"}`);
  } catch (error) {
    if (typeof globalThis.window !== "undefined") globalThis.window.__BP_LAST_ERROR = String(error?.stack || error);
    if (activeLifecycle === lifecycle) activeLifecycle = null;
    await lifecycle.dispose().catch((cleanupError) => {
      if (typeof globalThis.window !== "undefined") globalThis.window.__BP_LAST_ERROR = String(cleanupError?.stack || cleanupError);
      console.error(cleanupError);
    });
    throw error;
  }
  return async () => {
    if (activeLifecycle === lifecycle) activeLifecycle = null;
    await lifecycle.dispose();
  };
}
async function onunload() {
  const lifecycle = activeLifecycle;
  activeLifecycle = null;
  if (lifecycle) await lifecycle.dispose();
  console.info("[svy-theme] Unloaded");
}
var extension_default = { onload, onunload };
export {
  extension_default as default,
  onload,
  onunload
};
