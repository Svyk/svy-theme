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
function createFakeDocument() {
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
  const topbar = makeElement("div");
  topbar.className = "rm-topbar";
  const existingTopbarIcon = makeElement("span");
  topbar.appendChild(existingTopbarIcon);
  documentElement.appendChild(topbar);

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
    createElement: makeElement,
    // Real getElementsByClassName only finds nodes still attached to the document —
    // removing a wrapper detaches its children too, even though this fake never marks
    // descendants "removed" individually. Walk up to documentElement to match that.
    getElementsByClassName: (name) => allElements.filter((el) => !el.removed && isConnected(el) && el._classes.has(name)),
    getElementById: (id) => idIndex.get(id) || null,
  };
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
