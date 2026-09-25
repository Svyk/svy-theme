/* Svy Theme v0.5.0 | MIT | generated; edit src/ */

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
  cursor: "bp-beam-cursor"
});
var CURSOR_STYLES = Object.freeze(["svy", "native"]);
var LEGACY_CARET_LIGHT = "#008478";
var BEAM_DEFAULTS = Object.freeze({
  pack: true,
  caretLight: "#00695e",
  caretDark: "#48d0c0",
  cursor: "svy"
});
var DEFAULT_CARET_P3 = Object.freeze({ light: "0.47 0.11 182", dark: "0.78 0.15 184" });
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
function normalizeBeamConfig(raw = {}) {
  return {
    pack: normalizeSwitch(raw.pack, BEAM_DEFAULTS.pack),
    caretLight: normalizeHex(raw.caretLight, BEAM_DEFAULTS.caretLight),
    caretDark: normalizeHex(raw.caretDark, BEAM_DEFAULTS.caretDark),
    cursor: normalizeChoice(raw.cursor, CURSOR_STYLES, BEAM_DEFAULTS.cursor)
  };
}
function readBeamSettings(extensionAPI) {
  const get = (key) => extensionAPI?.settings?.get?.(key);
  return normalizeBeamConfig({
    pack: get(BEAM_SETTING_IDS.pack),
    caretLight: get(BEAM_SETTING_IDS.caretLight),
    caretDark: get(BEAM_SETTING_IDS.caretDark),
    cursor: get(BEAM_SETTING_IDS.cursor)
  });
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
  const base = {};
  for (const mode of CURSOR_MODES) {
    const caret = mode === "light" ? normalized.caretLight : normalized.caretDark;
    const isDefault = caret === (mode === "light" ? BEAM_DEFAULTS.caretLight : BEAM_DEFAULTS.caretDark);
    base[`--svy-beam-caret-${mode}`] = caret;
    base[`--svy-beam-caret-${mode}-p3`] = isDefault ? `oklch(${DEFAULT_CARET_P3[mode]})` : caret;
  }
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
}
function createSettingsPanel({ onAppearanceChange, onThemeVarsChange } = {}) {
  const changed = () => {
    onThemeVarsChange?.();
  };
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
      description: "Master switch for the beam layer: the Svy cursors and their teal accent. Off restores Roam's native cursors without a reload. The caret belongs to Roam Caret.",
      action: { type: "switch", onChange: changed }
    },
    {
      id: BEAM_SETTING_IDS.caretLight,
      name: "Accent color (light)",
      description: "Hex color of the teal accent in light mode: the spark in the Svy cursors and the halo on folded bullets. Accepts #rgb or #rrggbb; anything else falls back to the default #00695E. The caret is Roam Caret's.",
      action: { type: "input", placeholder: BEAM_DEFAULTS.caretLight, onChange: changed }
    },
    {
      id: BEAM_SETTING_IDS.caretDark,
      name: "Accent color (dark)",
      description: "Hex color of the teal accent in dark mode. Default #48D0C0.",
      action: { type: "input", placeholder: BEAM_DEFAULTS.caretDark, onChange: changed }
    },
    {
      id: BEAM_SETTING_IDS.cursor,
      name: "Cursor style",
      description: "svy uses the custom SVG arrow/target/beam cursors, published as a light and a dark set and tinted from that mode's accent color; native leaves Roam's cursors alone.",
      action: { type: "select", items: [...CURSOR_STYLES], onChange: changed }
    }
  ];
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
var THEME_ROOT_CLASS = "svy-theme";
function installThemeMarker(lifecycle, doc = globalThis.document) {
  const root = doc?.documentElement;
  if (!root?.classList || !lifecycle?.add) return;
  root.classList.add(THEME_ROOT_CLASS);
  lifecycle.add(() => root.classList.remove(THEME_ROOT_CLASS));
}
async function onload({ extensionAPI, extension }) {
  if (!extensionAPI) throw new TypeError("Roam did not provide extensionAPI");
  if (activeLifecycle) await activeLifecycle.dispose();
  const lifecycle = createLifecycle();
  activeLifecycle = lifecycle;
  try {
    installThemeMarker(lifecycle);
    await initializeSettings(extensionAPI);
    await initializeBeamSettings(extensionAPI);
    const themeVars = installThemeVars({ extensionAPI, lifecycle });
    await lifecycle.settingsPanel(
      extensionAPI,
      createSettingsPanel({
        onAppearanceChange: (mode) => applyAppearance(mode),
        onThemeVarsChange: () => themeVars.refresh()
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
  installThemeMarker,
  onload,
  onunload
};
