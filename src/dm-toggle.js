import { APPEARANCE_MODES, SETTING_IDS, normalizeMode } from "./settings.js";

// Ported from upstream rcvd/blueprint src/components/dm-toggle.ts (pinned commit
// cc1c71784a26bc86da99a1572733c624e9196299), rewritten as plain JS against this
// template's lifecycle contract. See vendor/upstream/PROVENANCE.md.

const ICON_BY_MODE = Object.freeze({ auto: "clean", dark: "moon", light: "flash" });
const ALL_ICON_CLASSES = Object.freeze(Object.values(ICON_BY_MODE).map((icon) => `bp3-icon-${icon}`));
const TOGGLE_CLASS = "blueprint-dm-toggle";
const ICON_CLASS = "blueprint-toggle-icon";
const CONTAINER_ID = "blueprintToggleDarkMode-flex-space";

// Bound on how long we'll wait for .rm-topbar to mount before giving up. A URL-installed
// developer extension can load before Roam's own topbar mounts, so we can't assume it's
// there on the first attempt — but we also must not watch forever.
const INSTALL_RETRY_BOUND_MS = 30_000;

function recordError(err) {
  if (typeof globalThis.window !== "undefined") globalThis.window.__BP_LAST_ERROR = String(err?.stack || err);
}

function nextMode(mode) {
  const index = APPEARANCE_MODES.indexOf(normalizeMode(mode));
  return APPEARANCE_MODES[(index + 1) % APPEARANCE_MODES.length];
}

// A background at or above this relative luminance counts as a light surface. Roam's
// light chrome sits at 1.00 (#ffffff) / 0.94 (#f5f8fa) and its dark chrome at 0.02
// (#202b33), so the exact cut only has to sit somewhere in between.
export const LIGHT_LUMINANCE_FLOOR = 0.5;

// Every dark signal src/css/00-upstream-base.css redefines its tokens under. If one of
// these is present the host really is dark and no measurement is needed — which also
// avoids the circularity of measuring a background this stylesheet itself painted.
export function hostHasDarkMarker(doc) {
  const root = doc?.documentElement;
  const body = doc?.body;
  if (root?.classList?.contains("bp3-dark")) return true;
  if (body?.classList?.contains("bp3-dark")) return true;
  if (body?.classList?.contains("bt-theme-dark")) return true;
  if (body?.classList?.contains("roam-body") && body.classList.contains("dark")) return true;
  if (root?.dataset?.theme === "dark" || body?.dataset?.theme === "dark") return true;
  return !!doc?.querySelector?.(".rm-dark-theme");
}

function parseColor(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text === "transparent") return null;
  if (text.startsWith("#")) {
    const hex = text.length === 4
      ? text.slice(1).split("").map((digit) => digit + digit).join("")
      : text.slice(1);
    if (hex.length !== 6 && hex.length !== 8) return null;
    const number = Number.parseInt(hex.slice(0, 6), 16);
    if (Number.isNaN(number)) return null;
    const alpha = hex.length === 8 ? Number.parseInt(hex.slice(6), 16) / 255 : 1;
    return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255, a: alpha };
  }
  const match = text.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.%]+))?\s*\)$/i);
  if (!match) return null;
  const rawAlpha = match[4];
  const alpha = rawAlpha === undefined
    ? 1
    : (rawAlpha.endsWith("%") ? Number(rawAlpha.slice(0, -1)) / 100 : Number(rawAlpha));
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: alpha };
}

function relativeLuminance({ r, g, b }) {
  const toLinear = (channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

// Roam paints the page background on <body>; .roam-main, .roam-article and #app are all
// transparent, so sampling those selectors directly returns null and the decision would
// silently fall through to the OS hint. Walk each candidate's ancestor chain until
// something actually paints (see ~/better-tasks/src/core/theme-resolve.js, which learned
// this the hard way when a dark-mode Mac running a light Roam resolved dark).
export function sampleHostLuminance(doc, view = globalThis.window) {
  if (typeof view?.getComputedStyle !== "function") return null;
  const candidates = [".roam-main", ".roam-article", "#app"]
    .map((selector) => doc?.querySelector?.(selector))
    .filter(Boolean);
  if (doc?.body) candidates.push(doc.body);
  for (const candidate of candidates) {
    let node = candidate;
    while (node) {
      const color = parseColor(view.getComputedStyle(node)?.backgroundColor);
      if (color && color.a > 0) return relativeLuminance(color);
      node = node.parentElement;
    }
  }
  return null;
}

// Pure decision: in auto mode, should .bp3-light be stamped on <html>?
//
// Stamping is what makes auto mode follow ROAM rather than the OS. Without it, the
// guarded OS-dark arm in 00-upstream-base.css drives the entire collapsed palette, so an
// OS-dark machine running a light Roam gets painted dark.
//
// A known dark marker means the host is genuinely dark: do not stamp, so the kept
// (non-collapsed) families can still reach dark through the OS arm. Otherwise stamp, but
// only on positive evidence — a measured light background. No measurement (no browser,
// nothing mounted yet) leaves the stamp off; installDarkModeToggle re-runs this once
// Roam's topbar appears.
export function resolveAutoLightStamp({ hasDarkMarker = false, sampledLuminance = null } = {}) {
  if (hasDarkMarker) return false;
  if (typeof sampledLuminance !== "number" || Number.isNaN(sampledLuminance)) return false;
  return sampledLuminance >= LIGHT_LUMINANCE_FLOOR;
}

// Stamps .bp3-dark / .bp3-light on documentElement and swaps the toggle icon.
// Unlike the upstream original, this clears every icon class before applying
// the new one and always resolves bp3-dark/bp3-light to a single mutually
// exclusive state — upstream could leave stale classes stacked up after a
// few cycles (see GOAL-1 report).
export function applyAppearance(mode, doc = globalThis.document, { view = globalThis.window } = {}) {
  if (!doc) return;
  const normalized = normalizeMode(mode);

  const button = doc.getElementsByClassName?.(ICON_CLASS)?.[0];
  if (button?.classList) {
    for (const iconClass of ALL_ICON_CLASSES) button.classList.remove(iconClass);
    button.classList.add(`bp3-icon-${ICON_BY_MODE[normalized]}`);
  }

  const root = doc.documentElement;
  if (!root?.classList) return;
  if (normalized === "dark") {
    root.classList.remove("bp3-light");
    root.classList.add("bp3-dark");
    return;
  }
  if (normalized === "light") {
    root.classList.remove("bp3-dark");
    root.classList.add("bp3-light");
    return;
  }

  // Auto. Never touch .bp3-dark: in auto mode that class belongs to Roam (or another
  // extension), not to us.
  root.classList.remove("bp3-light");
  if (hostHasDarkMarker(doc)) return;

  // Nothing announces dark. Stamp light BEFORE measuring: with an OS-dark machine the
  // sheet's own guarded arm has already painted the page dark, so an unstamped
  // measurement reads the colour we just painted and always resolves dark. With the stamp
  // in place the sample reflects whatever else is painting, and any third-party dark
  // theme that outranks our base rules still shows up as a dark reading.
  root.classList.add("bp3-light");
  if (!resolveAutoLightStamp({ sampledLuminance: sampleHostLuminance(doc, view) })) {
    root.classList.remove("bp3-light");
  }
}

// Attempts one install. Returns true if the toggle is present in the DOM afterward
// (either just installed, or already installed by a prior attempt).
function mountToggle({ doc, extensionAPI, lifecycle, currentMode }) {
  if (doc.getElementById?.(CONTAINER_ID)) return true; // already installed

  const topbar = doc.getElementsByClassName?.("rm-topbar")?.[0];
  const anchor = topbar?.lastElementChild;
  if (!anchor?.insertAdjacentElement) return false; // topbar not ready yet

  const wrapper = doc.createElement("span");
  wrapper.className = "bp3-popover-wrapper";

  const icon = doc.createElement("span");
  icon.className = `bp3-button bp3-minimal bp3-small bp3-icon-${ICON_BY_MODE[currentMode()]} ${TOGGLE_CLASS} ${ICON_CLASS}`;
  wrapper.appendChild(icon);

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
      const mode = nextMode(currentMode());
      if (extensionAPI.settings.canSet !== false) await extensionAPI.settings.set(SETTING_IDS.appearance, mode);
      applyAppearance(mode, doc);
    } catch (err) {
      recordError(err);
      throw err;
    }
  };

  lifecycle.event(wrapper, "click", handleClick);
  return true;
}

export async function installDarkModeToggle({
  extensionAPI,
  lifecycle,
  doc = globalThis.document,
  ObserverImpl = globalThis.MutationObserver,
  retryBoundMs = INSTALL_RETRY_BOUND_MS,
}) {
  if (!doc?.createElement) return; // no browser DOM (e.g. under node:test) — nothing to install

  const currentMode = () => normalizeMode(extensionAPI.settings.get(SETTING_IDS.appearance));
  applyAppearance(currentMode(), doc);

  const attempt = () => mountToggle({ doc, extensionAPI, lifecycle, currentMode });
  if (attempt()) return;

  // .rm-topbar (or its lastElementChild) isn't there yet. This breaks a hard contract —
  // Better Tasks detects this theme via document.querySelector(".blueprint-dm-toggle")
  // (~/better-tasks/src/index.js:19874) — so don't just give up silently. Watch for the
  // topbar to mount, bounded so we don't watch forever if it never shows up.
  if (!doc.body || typeof ObserverImpl !== "function") return;

  let settled = false;
  const observer = new ObserverImpl(() => {
    if (settled) return;
    if (attempt()) {
      settled = true;
      observer.disconnect();
      // The first applyAppearance ran before Roam's chrome existed, so auto mode had no
      // background to measure and left the .bp3-light stamp off. Now that the topbar is
      // up there is something to sample; re-resolve once.
      applyAppearance(currentMode(), doc);
    }
  });
  lifecycle.observer(observer, doc.body, { childList: true, subtree: true });

  lifecycle.timeout(() => {
    if (settled) return;
    settled = true;
    observer.disconnect();
  }, retryBoundMs);
}
