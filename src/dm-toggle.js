import { APPEARANCE_MODES, SETTING_IDS, normalizeMode } from "./settings.js";

// Ported from upstream rcvd/blueprint src/components/dm-toggle.ts (pinned commit
// cc1c71784a26bc86da99a1572733c624e9196299), rewritten as plain JS against this
// template's lifecycle contract. See vendor/upstream/PROVENANCE.md.

const ICON_BY_MODE = Object.freeze({ auto: "clean", dark: "moon", light: "flash" });
const ALL_ICON_CLASSES = Object.freeze(Object.values(ICON_BY_MODE).map((icon) => `bp3-icon-${icon}`));
const TOGGLE_CLASS = "blueprint-dm-toggle";
const ICON_CLASS = "blueprint-toggle-icon";
const WRAP_CLASS = "blueprint-dm-toggle-wrap";
const LABEL_CLASS = "blueprint-dm-toggle-label";
const LABEL_BY_MODE = Object.freeze({ auto: "Auto", dark: "Dark", light: "Light" });
const TOOLTIP_BY_MODE = Object.freeze({
  auto: "Appearance: Auto (follows system)",
  dark: "Appearance: Dark",
  light: "Appearance: Light",
});
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

// Stamps .bp3-dark / .bp3-light on documentElement and swaps the toggle icon.
// Unlike the upstream original, this clears every icon class before applying
// the new one and always resolves bp3-dark/bp3-light to a single mutually
// exclusive state — upstream could leave stale classes stacked up after a
// few cycles (see GOAL-1 report).
export function applyAppearance(mode, doc = globalThis.document) {
  if (!doc) return;
  const normalized = normalizeMode(mode);

  const button = doc.getElementsByClassName?.(ICON_CLASS)?.[0];
  if (button?.classList) {
    for (const iconClass of ALL_ICON_CLASSES) button.classList.remove(iconClass);
    button.classList.add(`bp3-icon-${ICON_BY_MODE[normalized]}`);
  }

  // The label and the wrapper's tooltip mirror the setting. Both are skipped when the
  // toggle isn't mounted yet (applyAppearance runs before mount on install); mount
  // initializes them from currentMode().
  const label = doc.getElementsByClassName?.(LABEL_CLASS)?.[0];
  if (label) label.textContent = LABEL_BY_MODE[normalized];

  const wrap = doc.getElementsByClassName?.(WRAP_CLASS)?.[0];
  if (wrap?.setAttribute) {
    wrap.setAttribute("title", TOOLTIP_BY_MODE[normalized]);
    wrap.setAttribute("aria-label", TOOLTIP_BY_MODE[normalized]);
  }

  const root = doc.documentElement;
  // The setting is inspectable separately from the resolved theme class.
  if (root?.dataset) root.dataset.bpAppearance = normalized;
  if (root?.classList) {
    if (normalized === "dark") {
      root.classList.remove("bp3-light");
      root.classList.add("bp3-dark");
    } else if (normalized === "light") {
      root.classList.remove("bp3-dark");
      root.classList.add("bp3-light");
    } else {
      // Auto owns no forced stamp: clear both. The dark-signal bridge re-stamps
      // .bp3-dark when the OS or a third-party marker says dark (its documentElement
      // observer fires on this very mutation), and Roam's own stamp is untouched
      // because the bridge only ever removes stamps it placed.
      root.classList.remove("bp3-light");
      root.classList.remove("bp3-dark");
    }
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
  const mode = currentMode();
  wrapper.className = `bp3-popover-wrapper ${WRAP_CLASS}`;
  wrapper.setAttribute("title", TOOLTIP_BY_MODE[mode]);
  wrapper.setAttribute("aria-label", TOOLTIP_BY_MODE[mode]);

  const icon = doc.createElement("span");
  icon.className = `bp3-button bp3-minimal bp3-small bp3-icon-${ICON_BY_MODE[mode]} ${TOGGLE_CLASS} ${ICON_CLASS}`;
  wrapper.appendChild(icon);

  // Visible mode name next to the icon; aria-hidden because the wrapper's aria-label
  // already announces the setting.
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
    }
  });
  lifecycle.observer(observer, doc.body, { childList: true, subtree: true });

  lifecycle.timeout(() => {
    if (settled) return;
    settled = true;
    observer.disconnect();
  }, retryBoundMs);
}
