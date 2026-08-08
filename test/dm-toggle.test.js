import assert from "node:assert/strict";
import test from "node:test";

import { createLifecycle } from "../src/lifecycle.js";
import {
  applyAppearance,
  hostHasDarkMarker,
  installDarkModeToggle,
  resolveAutoLightStamp,
  sampleHostLuminance,
} from "../src/dm-toggle.js";
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
    const el = { tagName: tag, parentNode: null, children: [], _classes: new Set(), _listeners: new Map(), removed: false, _id: "" };
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
    Object.defineProperty(el, "parentElement", { get: () => el.parentNode });
    el.dataset = {};
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
    // Enough of querySelector for the theme resolver: `.class` and `#id`, document order.
    querySelector: (selector) => {
      if (selector.startsWith("#")) return idIndex.get(selector.slice(1)) || null;
      const name = selector.slice(1);
      return allElements.find((el) => !el.removed && isConnected(el) && el._classes.has(name)) || null;
    },
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

// --- auto-mode theme resolution -------------------------------------------------------
//
// After the cascade collapse (tools/cascade_collapse.py) the guarded
// `@media (prefers-color-scheme: dark)` arm drives the WHOLE palette when nothing is
// stamped. An OS-dark machine running a light Roam would therefore be painted dark, so
// auto mode has to decide for itself whether Roam is light and stamp .bp3-light when it
// is. These tests cover that decision.

// A fake window whose getComputedStyle reports a per-node background and records the
// documentElement class list at the moment of each call — that log is how we prove the
// sample is taken with the provisional stamp in place.
function createFakeView(doc, paint) {
  const sampledWith = [];
  return {
    sampledWith,
    getComputedStyle: (node) => {
      sampledWith.push(doc.documentElement.className);
      return { backgroundColor: paint.get(node) ?? "rgba(0, 0, 0, 0)" };
    },
  };
}

test("resolveAutoLightStamp only stamps light on positive evidence", () => {
  assert.equal(resolveAutoLightStamp({ hasDarkMarker: false, sampledLuminance: 1 }), true);
  assert.equal(resolveAutoLightStamp({ hasDarkMarker: false, sampledLuminance: 0.5 }), true);
  assert.equal(resolveAutoLightStamp({ hasDarkMarker: false, sampledLuminance: 0.02 }), false);

  // A known dark marker outranks any measurement: the host really is dark, and the kept
  // (non-collapsed) families still need the OS arm to reach dark.
  assert.equal(resolveAutoLightStamp({ hasDarkMarker: true, sampledLuminance: 1 }), false);

  // No measurement is not evidence of light.
  assert.equal(resolveAutoLightStamp({ hasDarkMarker: false, sampledLuminance: null }), false);
  assert.equal(resolveAutoLightStamp({ hasDarkMarker: false, sampledLuminance: NaN }), false);
  assert.equal(resolveAutoLightStamp(), false);
});

test("hostHasDarkMarker recognizes each of the four dark signals", () => {
  for (const stamp of [
    (doc) => doc.documentElement.classList.add("bp3-dark"),
    (doc) => doc.body.classList.add("bp3-dark"),
    (doc) => doc.body.classList.add("bt-theme-dark"),
    (doc) => doc.body.classList.add("roam-body", "dark"),
    (doc) => { doc.documentElement.dataset.theme = "dark"; },
    (doc) => {
      const inner = doc.createElement("div");
      inner.className = "rm-dark-theme";
      doc.body.appendChild(inner);
    },
  ]) {
    const doc = createFakeDocument();
    assert.equal(hostHasDarkMarker(doc), false);
    stamp(doc);
    assert.equal(hostHasDarkMarker(doc), true);
  }

  // body.dark alone is not Roam's signal — it must be body.roam-body.dark.
  const doc = createFakeDocument();
  doc.body.classList.add("dark");
  assert.equal(hostHasDarkMarker(doc), false);
});

test("sampleHostLuminance walks past transparent ancestors to the node that paints", () => {
  const doc = createFakeDocument();
  const main = doc.createElement("div");
  main.className = "roam-main";
  doc.body.appendChild(main);

  // Roam paints only <body>; .roam-main and everything between are transparent. Sampling
  // the selector alone would return null and fall through to the OS hint.
  const paint = new Map([[doc.body, "rgb(255, 255, 255)"]]);
  const view = createFakeView(doc, paint);
  assert.ok(sampleHostLuminance(doc, view) > 0.9);

  paint.set(doc.body, "rgb(32, 43, 51)");
  assert.ok(sampleHostLuminance(doc, createFakeView(doc, paint)) < 0.1);

  // A fully transparent chain yields no reading at all.
  assert.equal(sampleHostLuminance(doc, createFakeView(doc, new Map())), null);
  assert.equal(sampleHostLuminance(doc, {}), null);
});

test("auto mode stamps .bp3-light when Roam renders light on an OS-dark machine", () => {
  const doc = createFakeDocument();
  const view = createFakeView(doc, new Map([[doc.body, "#ffffff"]]));

  applyAppearance("auto", doc, { view });

  assert.ok(doc.documentElement.classList.contains("bp3-light"));
  assert.ok(!doc.documentElement.classList.contains("bp3-dark"));
  // The measurement must be taken WITH the provisional stamp applied. Without it the
  // sheet's own OS-dark arm has already painted the page, so the sample reads the colour
  // we just painted and auto mode can never resolve light.
  assert.ok(view.sampledWith.length > 0);
  assert.ok(view.sampledWith.every((classes) => classes.includes("bp3-light")));
});

test("auto mode leaves the OS arm alone when the host announces dark", () => {
  const doc = createFakeDocument();
  doc.body.classList.add("bt-theme-dark");
  const view = createFakeView(doc, new Map([[doc.body, "#ffffff"]]));

  applyAppearance("auto", doc, { view });

  assert.ok(!doc.documentElement.classList.contains("bp3-light"));
  assert.equal(view.sampledWith.length, 0, "a known marker settles it without measuring");
});

test("auto mode withdraws the stamp when the page still measures dark", () => {
  const doc = createFakeDocument();
  // No marker, but something with more weight than our base rules paints a dark surface.
  const view = createFakeView(doc, new Map([[doc.body, "rgb(32, 43, 51)"]]));

  applyAppearance("auto", doc, { view });

  assert.ok(!doc.documentElement.classList.contains("bp3-light"));
});

test("auto mode clears a stale .bp3-light left by the light mode it replaced", () => {
  const doc = createFakeDocument();
  applyAppearance("light", doc);
  assert.ok(doc.documentElement.classList.contains("bp3-light"));

  // Host went dark while the toggle sat on light; switching to auto must release it.
  doc.documentElement.classList.add("bp3-dark");
  applyAppearance("auto", doc, { view: createFakeView(doc, new Map()) });
  assert.ok(!doc.documentElement.classList.contains("bp3-light"));
  assert.ok(doc.documentElement.classList.contains("bp3-dark"), "auto must not touch Roam's own class");
});

test("a late topbar mount re-resolves auto mode once there is something to sample", async () => {
  const doc = createFakeDocument({ includeTopbar: false });
  const extensionAPI = fakeExtensionApi({ [SETTING_IDS.appearance]: "auto" });
  const lifecycle = createLifecycle();
  const ObserverImpl = createFakeObserverImpl();

  const originalWindow = globalThis.window;
  globalThis.window = createFakeView(doc, new Map([[doc.body, "#ffffff"]]));
  try {
    await installDarkModeToggle({ extensionAPI, lifecycle, doc, ObserverImpl });
    doc.mountTopbarLate();
    ObserverImpl.instances[0].trigger();
    assert.ok(doc.documentElement.classList.contains("bp3-light"));
  } finally {
    globalThis.window = originalWindow;
    await lifecycle.dispose();
  }
});
