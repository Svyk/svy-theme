import { APPEARANCE_MODES, SETTING_IDS } from "./settings.js";

// Ported from upstream rcvd/blueprint src/components/dm-toggle.ts (pinned commit
// cc1c71784a26bc86da99a1572733c624e9196299), rewritten as plain JS against this
// template's lifecycle contract. See vendor/upstream/PROVENANCE.md.

const ICON_BY_MODE = Object.freeze({ auto: "clean", dark: "moon", light: "flash" });
const ALL_ICON_CLASSES = Object.freeze(Object.values(ICON_BY_MODE).map((icon) => `bp3-icon-${icon}`));
const TOGGLE_CLASS = "blueprint-dm-toggle";
const ICON_CLASS = "blueprint-toggle-icon";
const CONTAINER_ID = "blueprintToggleDarkMode-flex-space";

function normalizeMode(value) {
  return APPEARANCE_MODES.includes(value) ? value : "auto";
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

  const root = doc.documentElement;
  if (root?.classList) {
    if (normalized === "dark") {
      root.classList.remove("bp3-light");
      root.classList.add("bp3-dark");
    } else if (normalized === "light") {
      root.classList.remove("bp3-dark");
      root.classList.add("bp3-light");
    } else {
      // Auto: yield to Roam's own bp3-dark preference, only clear our light override.
      root.classList.remove("bp3-light");
    }
  }
}

export async function installDarkModeToggle({ extensionAPI, lifecycle, doc = globalThis.document }) {
  if (!doc?.createElement) return; // no browser DOM (e.g. under node:test) — nothing to install

  const currentMode = () => normalizeMode(extensionAPI.settings.get(SETTING_IDS.appearance));

  applyAppearance(currentMode(), doc);

  if (doc.getElementById?.(CONTAINER_ID)) return; // already installed (defensive; onload disposes first)

  const topbar = doc.getElementsByClassName?.("rm-topbar")?.[0];
  const anchor = topbar?.lastElementChild;
  if (!anchor?.insertAdjacentElement) return; // topbar not ready; nothing to attach to

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
    const mode = nextMode(currentMode());
    if (extensionAPI.settings.canSet !== false) await extensionAPI.settings.set(SETTING_IDS.appearance, mode);
    applyAppearance(mode, doc);
  };

  lifecycle.event(wrapper, "click", handleClick);
}
