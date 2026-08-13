import assert from "node:assert/strict";
import test from "node:test";

import { createLifecycle } from "../src/lifecycle.js";
import { applyAppearance, installDarkModeToggle } from "../src/dm-toggle.js";
import { SETTING_IDS } from "../src/settings.js";

function fakeExtensionApi(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    settings: {
      canSet: true,
      get: (key) => values.get(key) ?? null,
      set: async (key, value) => { values.set(key, value); return null; },
    },
  };
}

// Minimal fake DOM: only the surface installDarkModeToggle/applyAppearance touch
// (classList, insertAdjacentElement, getElementsByClassName/Id, click dispatch).
function createFakeDocument({ includeTopbar = true } = {}) {
  const allElements = [];
  const idIndex = new Map();

  function makeElement(tag) {
    const el = {
      tagName: tag,
      parentNode: null,
      children: [],
      _classes: new Set(),
      _listeners: new Map(),
      removed: false,
      _id: "",
      _attrs: new Map(),
      textContent: "",
      dataset: {},
    };
    el.setAttribute = (name, value) => { el._attrs.set(name, String(value)); };
    el.getAttribute = (name) => (el._attrs.has(name) ? el._attrs.get(name) : null);
    el.classList = {
      add: (...names) => names.forEach((n) => el._classes.add(n)),
      remove: (...names) => names.forEach((n) => el._classes.delete(n)),
      contains: (name) => el._classes.has(name),
    };
    Object.defineProperty(el, "className", {
      get: () => [...el._classes].join(" "),
      set: (value) => { el._classes = new Set(String(value).split(/\s+/).filter(Boolean)); },
    });
    Object.defineProperty(el, "id", {
      get: () => el._id,
      set: (value) => {
        if (el._id) idIndex.delete(el._id);
        el._id = value;
        if (value) idIndex.set(value, el);
      },
    });
    Object.defineProperty(el, "lastElementChild", {
      get: () => el.children[el.children.length - 1] || null,
    });
    el.appendChild = (child) => { child.parentNode = el; el.children.push(child); return child; };
    el.insertAdjacentElement = (position, node) => {
      const parent = el.parentNode;
      if (!parent) throw new Error("insertAdjacentElement requires a parent");
      node.parentNode = parent;
      const idx = parent.children.indexOf(el);
      if (position === "afterend") parent.children.splice(idx + 1, 0, node);
      else if (position === "beforebegin") parent.children.splice(idx, 0, node);
      else throw new Error(`unsupported position: ${position}`);
      return node;
    };
    el.addEventListener = (type, listener) => {
      if (!el._listeners.has(type)) el._listeners.set(type, new Set());
      el._listeners.get(type).add(listener);
    };
    el.removeEventListener = (type, listener) => { el._listeners.get(type)?.delete(listener); };
    el.dispatch = async (type) => {
      for (const listener of [...(el._listeners.get(type) || [])]) await listener({ type, target: el });
    };
    el.remove = () => {
      if (el.parentNode) el.parentNode.children = el.parentNode.children.filter((c) => c !== el);
      el.parentNode = null;
      el.removed = true;
      if (el._id) idIndex.delete(el._id);
    };
    allElements.push(el);
    return el;
  }

  const documentElement = makeElement("html");
  const body = makeElement("body");
  documentElement.appendChild(body);

  function attachTopbar() {
    const topbar = makeElement("div");
    topbar.className = "rm-topbar";
    const existingTopbarIcon = makeElement("span");
    topbar.appendChild(existingTopbarIcon);
    documentElement.appendChild(topbar);
    return topbar;
  }

  if (includeTopbar) attachTopbar();

  function isConnected(el) {
    let node = el;
    while (node) {
      if (node === documentElement) return true;
      node = node.parentNode;
    }
    return false;
  }

  return {
    documentElement,
    body,
    createElement: makeElement,
    // Real getElementsByClassName only finds nodes still attached to the document —
    // removing a wrapper detaches its children too, even though this fake never marks
    // descendants "removed" individually. Walk up to documentElement to match that.
    getElementsByClassName: (name) => allElements.filter((el) => !el.removed && isConnected(el) && el._classes.has(name)),
    getElementById: (id) => idIndex.get(id) || null,
    // Test-only hook: simulate Roam's topbar mounting after this extension already loaded
    // (e.g. a URL-installed developer extension racing Roam's own UI mount).
    mountTopbarLate: attachTopbar,
  };
}

// Fake MutationObserver: no real DOM mutation plumbing, just a `trigger()` the test calls
// to simulate "something changed under the observed target."
function createFakeObserverImpl() {
  const instances = [];
  function FakeMutationObserver(callback) {
    const instance = {
      callback,
      observedTarget: null,
      observedOptions: null,
      disconnected: false,
      observe(target, options) {
        this.observedTarget = target;
        this.observedOptions = options;
      },
      disconnect() {
        this.disconnected = true;
      },
      trigger() {
        this.callback([], this);
      },
    };
    instances.push(instance);
    return instance;
  }
  FakeMutationObserver.instances = instances;
  return FakeMutationObserver;
}

test("installs a toggle whose clickable element carries the blueprint-dm-toggle class", async () => {
  const doc = createFakeDocument();
  const extensionAPI = fakeExtensionApi({ [SETTING_IDS.appearance]: "auto" });
  const lifecycle = createLifecycle();

  await installDarkModeToggle({ extensionAPI, lifecycle, doc });

  const toggles = doc.getElementsByClassName("blueprint-dm-toggle");
  assert.ok(toggles.length >= 1, "expected at least one .blueprint-dm-toggle element");

  await lifecycle.dispose();
});

test("clicking cycles auto -> dark -> light -> auto and stamps documentElement", async () => {
  const doc = createFakeDocument();
  const extensionAPI = fakeExtensionApi({ [SETTING_IDS.appearance]: "auto" });
  const lifecycle = createLifecycle();

  await installDarkModeToggle({ extensionAPI, lifecycle, doc });
  const [wrapper] = doc.getElementsByClassName("bp3-popover-wrapper");
  assert.ok(wrapper, "expected the popover wrapper to exist");

  await wrapper.dispatch("click");
  assert.equal(extensionAPI.settings.get(SETTING_IDS.appearance), "dark");
  assert.ok(doc.documentElement.classList.contains("bp3-dark"));
  assert.ok(!doc.documentElement.classList.contains("bp3-light"));

  await wrapper.dispatch("click");
  assert.equal(extensionAPI.settings.get(SETTING_IDS.appearance), "light");
  assert.ok(doc.documentElement.classList.contains("bp3-light"));
  assert.ok(!doc.documentElement.classList.contains("bp3-dark"));

  await wrapper.dispatch("click");
  assert.equal(extensionAPI.settings.get(SETTING_IDS.appearance), "auto");
  assert.ok(!doc.documentElement.classList.contains("bp3-light"));
  assert.ok(!doc.documentElement.classList.contains("bp3-dark"),
    "auto owns no forced stamp — returning to auto must clear .bp3-dark too");

  await lifecycle.dispose();
});

test("a legacy capitalized stored value (e.g. upstream's \"Dark\") is honored on install", async () => {
  const doc = createFakeDocument();
  const extensionAPI = fakeExtensionApi({ [SETTING_IDS.appearance]: "Dark" });
  const lifecycle = createLifecycle();

  await installDarkModeToggle({ extensionAPI, lifecycle, doc });

  assert.ok(doc.documentElement.classList.contains("bp3-dark"));
  await lifecycle.dispose();
});

test("unload removes every inserted node — native Roam UI fully restored, no reload", async () => {
  const doc = createFakeDocument();
  const extensionAPI = fakeExtensionApi({ [SETTING_IDS.appearance]: "auto" });
  const lifecycle = createLifecycle();

  await installDarkModeToggle({ extensionAPI, lifecycle, doc });
  assert.ok(doc.getElementsByClassName("blueprint-dm-toggle").length > 0);

  await lifecycle.dispose();

  assert.equal(doc.getElementsByClassName("blueprint-dm-toggle").length, 0);
  assert.equal(doc.getElementsByClassName("bp3-popover-wrapper").length, 0);
});

test("clicking after unload does not throw (listener was removed with the node)", async () => {
  const doc = createFakeDocument();
  const extensionAPI = fakeExtensionApi({ [SETTING_IDS.appearance]: "auto" });
  const lifecycle = createLifecycle();

  await installDarkModeToggle({ extensionAPI, lifecycle, doc });
  const [wrapper] = doc.getElementsByClassName("bp3-popover-wrapper");
  await lifecycle.dispose();

  await assert.doesNotReject(wrapper.dispatch("click"));
  assert.equal(extensionAPI.settings.get(SETTING_IDS.appearance), "auto");
});

test("a settings jump dark -> auto clears both forced stamps and updates the label", async () => {
  const doc = createFakeDocument();
  const extensionAPI = fakeExtensionApi({ [SETTING_IDS.appearance]: "dark" });
  const lifecycle = createLifecycle();

  await installDarkModeToggle({ extensionAPI, lifecycle, doc });
  assert.ok(doc.documentElement.classList.contains("bp3-dark"));

  // Settings panel jump straight to auto — no Light in between to clear .bp3-dark.
  await extensionAPI.settings.set(SETTING_IDS.appearance, "auto");
  applyAppearance("auto", doc);

  assert.ok(!doc.documentElement.classList.contains("bp3-dark"));
  assert.ok(!doc.documentElement.classList.contains("bp3-light"));
  assert.equal(doc.documentElement.dataset.bpAppearance, "auto");
  const [label] = doc.getElementsByClassName("blueprint-dm-toggle-label");
  assert.equal(label.textContent, "Auto");

  await lifecycle.dispose();
});

test("the mounted control shows the mode name and matching title/aria-label as it cycles", async () => {
  const doc = createFakeDocument();
  const extensionAPI = fakeExtensionApi({ [SETTING_IDS.appearance]: "auto" });
  const lifecycle = createLifecycle();

  await installDarkModeToggle({ extensionAPI, lifecycle, doc });
  const [wrapper] = doc.getElementsByClassName("blueprint-dm-toggle-wrap");
  assert.ok(wrapper, "expected the wrapper to carry blueprint-dm-toggle-wrap");
  const [label] = doc.getElementsByClassName("blueprint-dm-toggle-label");
  assert.ok(label, "expected the visible mode label to be mounted");
  assert.equal(label.getAttribute("aria-hidden"), "true");

  const expected = [
    ["Auto", "Appearance: Auto (follows system)"],
    ["Dark", "Appearance: Dark"],
    ["Light", "Appearance: Light"],
    ["Auto", "Appearance: Auto (follows system)"],
  ];
  for (const [text, tooltip] of expected) {
    assert.equal(label.textContent, text);
    assert.equal(wrapper.getAttribute("title"), tooltip);
    assert.equal(wrapper.getAttribute("aria-label"), tooltip);
    assert.equal(doc.documentElement.dataset.bpAppearance, text.toLowerCase());
    await wrapper.dispatch("click");
  }

  await lifecycle.dispose();
});

test(".blueprint-dm-toggle stays on the icon span, not the wrapper", async () => {
  const doc = createFakeDocument();
  const extensionAPI = fakeExtensionApi({ [SETTING_IDS.appearance]: "auto" });
  const lifecycle = createLifecycle();

  await installDarkModeToggle({ extensionAPI, lifecycle, doc });

  const [icon] = doc.getElementsByClassName("blueprint-toggle-icon");
  assert.ok(icon, "expected the icon span to be mounted");
  assert.ok(icon._classes.has("blueprint-dm-toggle"),
    "Better Tasks probes document.querySelector('.blueprint-dm-toggle') — the icon must keep the class");
  const [wrapper] = doc.getElementsByClassName("blueprint-dm-toggle-wrap");
  assert.ok(!wrapper._classes.has("blueprint-dm-toggle"),
    "the wrapper must not take the probed class away from the icon");

  await lifecycle.dispose();
});

test("applyAppearance is a no-op without a document", () => {
  assert.doesNotThrow(() => applyAppearance("dark", null));
});

test("install is a no-op outside a browser-like environment", async () => {
  const lifecycle = createLifecycle();
  await installDarkModeToggle({ extensionAPI: fakeExtensionApi(), lifecycle, doc: undefined });
  await lifecycle.dispose();
});

test("observer path installs the toggle once the topbar mounts late, then disconnects", async () => {
  const doc = createFakeDocument({ includeTopbar: false }); // simulate .rm-topbar not mounted yet
  const extensionAPI = fakeExtensionApi({ [SETTING_IDS.appearance]: "auto" });
  const lifecycle = createLifecycle();
  const ObserverImpl = createFakeObserverImpl();

  await installDarkModeToggle({ extensionAPI, lifecycle, doc, ObserverImpl });

  assert.equal(doc.getElementsByClassName("blueprint-dm-toggle").length, 0, "not installed yet — topbar absent");
  assert.equal(ObserverImpl.instances.length, 1, "expected a MutationObserver to be registered");
  assert.equal(ObserverImpl.instances[0].observedTarget, doc.body, "observer should watch document.body");

  doc.mountTopbarLate();
  ObserverImpl.instances[0].trigger();

  const toggles = doc.getElementsByClassName("blueprint-dm-toggle");
  assert.ok(toggles.length >= 1, "expected the toggle to install once the topbar appeared");
  assert.ok(ObserverImpl.instances[0].disconnected, "observer should disconnect once installed");

  await lifecycle.dispose();
  assert.equal(doc.getElementsByClassName("blueprint-dm-toggle").length, 0, "dispose should tear down the late-installed toggle");
});

test("observer path gives up after the bound and does not watch forever", async () => {
  const doc = createFakeDocument({ includeTopbar: false });
  const extensionAPI = fakeExtensionApi({ [SETTING_IDS.appearance]: "auto" });
  const lifecycle = createLifecycle();
  const ObserverImpl = createFakeObserverImpl();

  await installDarkModeToggle({ extensionAPI, lifecycle, doc, ObserverImpl, retryBoundMs: 5 });

  assert.equal(ObserverImpl.instances[0].disconnected, false);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(ObserverImpl.instances[0].disconnected, true, "expected the bounded timeout to disconnect the observer");

  // The topbar never showed up, so nothing should be installed, and disposing afterward
  // must not throw even though the observer/timeout already resolved on their own.
  assert.equal(doc.getElementsByClassName("blueprint-dm-toggle").length, 0);
  await assert.doesNotReject(lifecycle.dispose());
});

test("dispose before the topbar ever appears tears down the observer and timeout cleanly", async () => {
  const doc = createFakeDocument({ includeTopbar: false });
  const extensionAPI = fakeExtensionApi({ [SETTING_IDS.appearance]: "auto" });
  const lifecycle = createLifecycle();
  const ObserverImpl = createFakeObserverImpl();

  await installDarkModeToggle({ extensionAPI, lifecycle, doc, ObserverImpl });
  assert.equal(ObserverImpl.instances[0].disconnected, false);

  await lifecycle.dispose();
  assert.equal(ObserverImpl.instances[0].disconnected, true);
});

test("a click handler failure sets window.__BP_LAST_ERROR before rethrowing", async () => {
  const doc = createFakeDocument();
  const extensionAPI = fakeExtensionApi({ [SETTING_IDS.appearance]: "auto" });
  extensionAPI.settings.set = async () => { throw new Error("settings.set boom"); };
  const lifecycle = createLifecycle();

  const originalWindow = globalThis.window;
  globalThis.window = {};
  try {
    await installDarkModeToggle({ extensionAPI, lifecycle, doc });
    const [wrapper] = doc.getElementsByClassName("bp3-popover-wrapper");

    await assert.rejects(wrapper.dispatch("click"), /settings\.set boom/);
    assert.match(globalThis.window.__BP_LAST_ERROR, /settings\.set boom/);
  } finally {
    globalThis.window = originalWindow;
    await lifecycle.dispose();
  }
});
