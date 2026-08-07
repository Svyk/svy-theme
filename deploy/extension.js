/* Blueprint (Svy fork) v0.1.0 | MIT | generated; edit src/ */

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
      void callSafely(disposer).catch((error) => console.error("[roam-blueprint] Late cleanup failed", error));
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

// src/settings.js
var SETTING_IDS = Object.freeze({
  appearance: "bp-appearance"
});
var APPEARANCE_MODES = Object.freeze(["auto", "dark", "light"]);
var DEFAULT_APPEARANCE = "auto";
async function initializeSettings(extensionAPI) {
  if (extensionAPI.settings.canSet !== false && extensionAPI.settings.get(SETTING_IDS.appearance) == null) {
    await extensionAPI.settings.set(SETTING_IDS.appearance, DEFAULT_APPEARANCE);
  }
}
function createSettingsPanel({ onAppearanceChange } = {}) {
  return {
    tabTitle: "Blueprint (Svy fork)",
    settings: [
      {
        id: SETTING_IDS.appearance,
        name: "Appearance",
        description: "Light/dark mode for the Blueprint theme. Auto defers to Roam's own theme setting; the topbar toggle cycles the same three values.",
        action: {
          type: "select",
          items: [...APPEARANCE_MODES],
          onChange: (event) => {
            onAppearanceChange?.(event?.target?.value);
          }
        }
      }
    ]
  };
}

// src/dm-toggle.js
var ICON_BY_MODE = Object.freeze({ auto: "clean", dark: "moon", light: "flash" });
var ALL_ICON_CLASSES = Object.freeze(Object.values(ICON_BY_MODE).map((icon) => `bp3-icon-${icon}`));
var TOGGLE_CLASS = "blueprint-dm-toggle";
var ICON_CLASS = "blueprint-toggle-icon";
var CONTAINER_ID = "blueprintToggleDarkMode-flex-space";
function normalizeMode(value) {
  return APPEARANCE_MODES.includes(value) ? value : "auto";
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
  const root = doc.documentElement;
  if (root?.classList) {
    if (normalized === "dark") {
      root.classList.remove("bp3-light");
      root.classList.add("bp3-dark");
    } else if (normalized === "light") {
      root.classList.remove("bp3-dark");
      root.classList.add("bp3-light");
    } else {
      root.classList.remove("bp3-light");
    }
  }
}
async function installDarkModeToggle({ extensionAPI, lifecycle, doc = globalThis.document }) {
  if (!doc?.createElement) return;
  const currentMode = () => normalizeMode(extensionAPI.settings.get(SETTING_IDS.appearance));
  applyAppearance(currentMode(), doc);
  if (doc.getElementById?.(CONTAINER_ID)) return;
  const topbar = doc.getElementsByClassName?.("rm-topbar")?.[0];
  const anchor = topbar?.lastElementChild;
  if (!anchor?.insertAdjacentElement) return;
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

// src/extension.js
var activeLifecycle = null;
async function onload({ extensionAPI, extension }) {
  if (!extensionAPI) throw new TypeError("Roam did not provide extensionAPI");
  if (activeLifecycle) await activeLifecycle.dispose();
  const lifecycle = createLifecycle();
  activeLifecycle = lifecycle;
  try {
    await initializeSettings(extensionAPI);
    await lifecycle.settingsPanel(
      extensionAPI,
      createSettingsPanel({ onAppearanceChange: (mode) => applyAppearance(mode) })
    );
    await installDarkModeToggle({ extensionAPI, lifecycle });
    console.info(`[roam-blueprint] Loaded v${extension?.version || "development"}`);
  } catch (error) {
    if (activeLifecycle === lifecycle) activeLifecycle = null;
    await lifecycle.dispose().catch((cleanupError) => console.error(cleanupError));
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
  console.info("[roam-blueprint] Unloaded");
}
var extension_default = { onload, onunload };
export {
  extension_default as default,
  onload,
  onunload
};
