import assert from "node:assert/strict";
import test from "node:test";

import { createLifecycle } from "../src/lifecycle.js";
import {
  FOLD_CC_ATTR,
  FOLD_CC_DEFAULT,
  FOLD_CC_SETTING_ID,
  childCount,
  initializeFoldCcSettings,
  installFoldCc,
  stampClosedBlock,
} from "../src/fold-cc.js";

function fakeExtensionApi(initial = {}) {
  const values = new Map(Object.entries(initial));
  const calls = [];
  return {
    calls,
    settings: {
      canSet: true,
      get: (key) => values.get(key) ?? null,
      set: async (key, value) => { values.set(key, value); calls.push(["setting:set", key, value]); return null; },
    },
  };
}

// --- Minimal fake DOM (same spirit as test/dm-toggle.test.js) -------------------
// Supports exactly the selector surface fold-cc touches:
//   matches(".a, .b"), closest(".a, .b")
//   querySelector(All)(".cls"), ("[attr]"), (":scope > .a .b, :scope > .c .d")

function classTokens(token) {
  return token.split(".").filter(Boolean);
}

function matchesSimple(el, token) {
  if (token.startsWith(".")) return classTokens(token).every((name) => el.classList.contains(name));
  if (token.startsWith("[") && token.endsWith("]")) return el.getAttribute(token.slice(1, -1)) != null;
  return false;
}

function descendants(root) {
  const out = [];
  const walk = (node) => {
    for (const child of node.children) {
      out.push(child);
      walk(child);
    }
  };
  walk(root);
  return out;
}

function queryAll(root, selector) {
  const results = [];
  for (const branch of selector.split(",").map((part) => part.trim())) {
    if (branch.startsWith(":scope > ")) {
      const tokens = branch.slice(":scope > ".length).trim().split(/\s+/);
      for (const direct of root.children.filter((child) => matchesSimple(child, tokens[0]))) {
        if (tokens.length === 1) results.push(direct);
        else results.push(...descendants(direct).filter((el) => matchesSimple(el, tokens.slice(1).join(" "))));
      }
    } else {
      results.push(...descendants(root).filter((el) => matchesSimple(el, branch)));
    }
  }
  return results;
}

function makeElement(classes = [], attrs = {}) {
  const classSet = new Set(classes);
  const attrMap = new Map(Object.entries(attrs));
  const el = {
    nodeType: 1,
    children: [],
    parent: null,
    classList: {
      add: (...names) => names.forEach((name) => classSet.add(name)),
      remove: (...names) => names.forEach((name) => classSet.delete(name)),
      contains: (name) => classSet.has(name),
    },
    getAttribute: (name) => (attrMap.has(name) ? attrMap.get(name) : null),
    setAttribute: (name, value) => { attrMap.set(name, String(value)); },
    removeAttribute: (name) => { attrMap.delete(name); },
    matches: (selector) => selector.split(",").some((part) => matchesSimple(el, part.trim())),
    closest(selector) {
      let node = el;
      while (node) {
        if (typeof node.matches === "function" && node.matches(selector)) return node;
        node = node.parent;
      }
      return null;
    },
    querySelector: (selector) => queryAll(el, selector)[0] ?? null,
    querySelectorAll: (selector) => queryAll(el, selector),
    append(child) {
      child.parent = el;
      el.children.push(child);
      return child;
    },
  };
  return el;
}

function createFakeDocument() {
  const documentElement = makeElement();
  const body = makeElement();
  documentElement.append(body);
  return {
    documentElement,
    body,
    querySelectorAll: (selector) => queryAll(documentElement, selector),
  };
}

// One Roam block: .rm-block[data-block-uid] > (.rm-block__self|.rm-block-main) > caret + bullet.
function makeBlock({ uid, closed = true, viaMain = false } = {}) {
  const block = makeElement(["rm-block"], uid ? { "data-block-uid": uid } : {});
  if (closed) block.classList.add("rm-block--closed");
  const self = makeElement([viaMain ? "rm-block-main" : "rm-block__self"]);
  const caret = makeElement(["rm-caret", "rm-caret-closed"]);
  const inner = makeElement(["rm-bullet__inner"]);
  const bullet = makeElement(closed ? ["rm-bullet", "rm-bullet--closed"] : ["rm-bullet"]);
  bullet.append(inner);
  self.append(caret);
  self.append(bullet);
  block.append(self);
  return { block, self, caret, bullet };
}

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
      trigger(mutations) {
        this.callback(mutations, this);
      },
    };
    instances.push(instance);
    return instance;
  }
  FakeMutationObserver.instances = instances;
  return FakeMutationObserver;
}

function fakeDataApi() {
  const calls = [];
  return {
    calls,
    pull(pattern, entity) {
      calls.push([pattern, entity]);
      const uid = entity?.[1];
      if (uid === "aaa") return { ":block/children": [{}, {}, {}] };
      if (uid === "big") return { ":block/children": new Array(120) };
      if (uid === "empty") return { ":block/children": [] };
      if (uid === "boom") throw new Error("pull boom");
      return null;
    },
  };
}

function install({ doc, api = fakeExtensionApi(), dataApi = fakeDataApi(), lifecycle = createLifecycle(), ObserverImpl = createFakeObserverImpl() }) {
  const foldCc = installFoldCc({ extensionAPI: api, lifecycle, doc, ObserverImpl, dataApi });
  return { foldCc, api, dataApi, lifecycle, ObserverImpl };
}

test("constants keep their frozen values", () => {
  assert.equal(FOLD_CC_SETTING_ID, "bp-fold-cc");
  assert.equal(FOLD_CC_ATTR, "data-svy-cc");
  assert.equal(FOLD_CC_DEFAULT, true);
});

test("childCount counts children and degrades to 0", () => {
  const dataApi = fakeDataApi();
  assert.equal(childCount("aaa", dataApi), 3);
  assert.equal(childCount("empty", dataApi), 0);
  assert.equal(childCount("unknown", dataApi), 0, "a pull returning null counts as 0");
  assert.equal(childCount("boom", dataApi), 0, "a throwing pull counts as 0");
  assert.equal(childCount(null, dataApi), 0);
  assert.equal(childCount("", dataApi), 0);
  assert.equal(childCount("aaa", null), 0);
  assert.equal(childCount("aaa", {}), 0);
  assert.deepEqual(dataApi.calls[0], ["[:block/children]", [":block/uid", "aaa"]]);
});

test("stampClosedBlock stamps the caret count for a closed bullet", () => {
  const { block, caret } = makeBlock({ uid: "aaa" });
  stampClosedBlock(block, fakeDataApi());
  assert.equal(caret.getAttribute(FOLD_CC_ATTR), "3");
});

test("stampClosedBlock works through the .rm-block-main path too", () => {
  const { block, caret } = makeBlock({ uid: "aaa", viaMain: true });
  stampClosedBlock(block, fakeDataApi());
  assert.equal(caret.getAttribute(FOLD_CC_ATTR), "3");
});

test("stampClosedBlock caps the display at 99+", () => {
  const { block, caret } = makeBlock({ uid: "big" });
  stampClosedBlock(block, fakeDataApi());
  assert.equal(caret.getAttribute(FOLD_CC_ATTR), "99+");
});

test("a --closed block without a --closed bullet never pulls and never stamps", () => {
  const dataApi = fakeDataApi();
  const { block, caret } = makeBlock({ uid: "aaa", closed: false });
  block.classList.add("rm-block--closed"); // superset class present, bullet still open
  stampClosedBlock(block, dataApi);
  assert.equal(caret.getAttribute(FOLD_CC_ATTR), null);
  assert.deepEqual(dataApi.calls, [], "no closed bullet means no pull");
});

test("an open bullet clears a previously stamped attr without pulling", () => {
  const dataApi = fakeDataApi();
  const { block, caret } = makeBlock({ uid: "aaa", closed: false });
  caret.setAttribute(FOLD_CC_ATTR, "3");
  stampClosedBlock(block, dataApi);
  assert.equal(caret.getAttribute(FOLD_CC_ATTR), null);
  assert.deepEqual(dataApi.calls, []);

  const empty = makeBlock({ uid: "empty" });
  empty.caret.setAttribute(FOLD_CC_ATTR, "9");
  stampClosedBlock(empty.block, dataApi);
  assert.equal(empty.caret.getAttribute(FOLD_CC_ATTR), null, "0 children clears the stamp");
});

test("stampClosedBlock is a no-op without a caret", () => {
  const { block, self } = makeBlock({ uid: "aaa" });
  self.children.length = 0; // drop caret and bullet
  assert.doesNotThrow(() => stampClosedBlock(block, fakeDataApi()));
  assert.doesNotThrow(() => stampClosedBlock(null, fakeDataApi()));
});

test("install stamps already-folded blocks synchronously", () => {
  const doc = createFakeDocument();
  const { block, caret } = makeBlock({ uid: "aaa" });
  const big = makeBlock({ uid: "big" });
  const open = makeBlock({ uid: "zzz", closed: false });
  doc.body.append(block);
  doc.body.append(big.block);
  doc.body.append(open.block);

  const { lifecycle } = install({ doc });
  assert.equal(caret.getAttribute(FOLD_CC_ATTR), "3");
  assert.equal(big.caret.getAttribute(FOLD_CC_ATTR), "99+");
  assert.equal(open.caret.getAttribute(FOLD_CC_ATTR), null, "open bullets are never stamped");
  return lifecycle.dispose();
});

test("setting off: install does not stamp, and refresh clears existing stamps", async () => {
  const doc = createFakeDocument();
  const { block, caret } = makeBlock({ uid: "aaa" });
  doc.body.append(block);
  const api = fakeExtensionApi({ [FOLD_CC_SETTING_ID]: false });
  const dataApi = fakeDataApi();
  const lifecycle = createLifecycle();

  const foldCc = installFoldCc({ extensionAPI: api, lifecycle, doc, ObserverImpl: createFakeObserverImpl(), dataApi });
  assert.equal(foldCc.enabled, false);
  assert.equal(caret.getAttribute(FOLD_CC_ATTR), null, "off means no stamp at install");
  assert.deepEqual(dataApi.calls, [], "off means no pull");

  // Turn on and refresh: stamps appear.
  await api.settings.set(FOLD_CC_SETTING_ID, true);
  foldCc.refresh();
  assert.equal(foldCc.enabled, true);
  assert.equal(caret.getAttribute(FOLD_CC_ATTR), "3");

  // Turn back off and refresh: every stamp in the document is cleared.
  await api.settings.set(FOLD_CC_SETTING_ID, false);
  foldCc.refresh();
  assert.equal(caret.getAttribute(FOLD_CC_ATTR), null);
  return lifecycle.dispose();
});

test("observer stamps only the added block node, never rescanning the document", () => {
  const doc = createFakeDocument();
  const existing = makeBlock({ uid: "empty" });
  doc.body.append(existing.block);
  const dataApi = fakeDataApi();
  const lifecycle = createLifecycle();
  const ObserverImpl = createFakeObserverImpl();

  installFoldCc({ extensionAPI: fakeExtensionApi(), lifecycle, doc, ObserverImpl, dataApi });
  assert.equal(ObserverImpl.instances.length, 1);
  const observer = ObserverImpl.instances[0];
  assert.equal(observer.observedTarget, doc.body);
  assert.deepEqual(observer.observedOptions, {
    childList: true, subtree: true, attributes: true, attributeFilter: ["class"],
  });
  dataApi.calls.length = 0;

  // A wrapper subtree arrives carrying a closed block.
  const wrapper = makeElement(["rm-block-children"]);
  const added = makeBlock({ uid: "aaa" });
  wrapper.append(added.block);
  doc.body.append(wrapper);
  observer.trigger([{ type: "childList", addedNodes: [wrapper], removedNodes: [] }]);

  assert.equal(added.caret.getAttribute(FOLD_CC_ATTR), "3");
  assert.deepEqual(dataApi.calls, [["[:block/children]", [":block/uid", "aaa"]]],
    "only the added block is pulled, not the pre-existing one");

  // An added node that IS a block container is stamped directly.
  dataApi.calls.length = 0;
  const direct = makeBlock({ uid: "big" });
  doc.body.append(direct.block);
  observer.trigger([{ type: "childList", addedNodes: [direct.block], removedNodes: [] }]);
  assert.equal(direct.caret.getAttribute(FOLD_CC_ATTR), "99+");
  assert.deepEqual(dataApi.calls, [["[:block/children]", [":block/uid", "big"]]]);
  return lifecycle.dispose();
});

test("observer restamps when the bullet class flips to --closed", () => {
  const doc = createFakeDocument();
  const { block, caret, bullet } = makeBlock({ uid: "aaa", closed: false });
  doc.body.append(block);
  const dataApi = fakeDataApi();
  const lifecycle = createLifecycle();
  const ObserverImpl = createFakeObserverImpl();

  installFoldCc({ extensionAPI: fakeExtensionApi(), lifecycle, doc, ObserverImpl, dataApi });
  assert.equal(caret.getAttribute(FOLD_CC_ATTR), null);
  assert.deepEqual(dataApi.calls, []);

  bullet.classList.add("rm-bullet--closed");
  block.classList.add("rm-block--closed");
  ObserverImpl.instances[0].trigger([{ type: "attributes", target: bullet, attributeName: "class" }]);
  assert.equal(caret.getAttribute(FOLD_CC_ATTR), "3");

  // Folding back open clears the stamp.
  bullet.classList.remove("rm-bullet--closed");
  ObserverImpl.instances[0].trigger([{ type: "attributes", target: block, attributeName: "class" }]);
  assert.equal(caret.getAttribute(FOLD_CC_ATTR), null);

  // Class mutations on unrelated elements are ignored.
  dataApi.calls.length = 0;
  ObserverImpl.instances[0].trigger([{ type: "attributes", target: caret, attributeName: "class" }]);
  assert.deepEqual(dataApi.calls, []);
  return lifecycle.dispose();
});

test("dispose disconnects the observer and removes leftover stamps", async () => {
  const doc = createFakeDocument();
  const { block, caret } = makeBlock({ uid: "aaa" });
  doc.body.append(block);
  const lifecycle = createLifecycle();
  const ObserverImpl = createFakeObserverImpl();

  installFoldCc({ extensionAPI: fakeExtensionApi(), lifecycle, doc, ObserverImpl, dataApi: fakeDataApi() });
  assert.equal(caret.getAttribute(FOLD_CC_ATTR), "3");

  await lifecycle.dispose();
  assert.ok(ObserverImpl.instances[0].disconnected);
  assert.equal(caret.getAttribute(FOLD_CC_ATTR), null, "unload restores native UI");
});

test("install is a no-op without a document body", () => {
  const lifecycle = createLifecycle();
  let foldCc;
  assert.doesNotThrow(() => {
    foldCc = installFoldCc({
      extensionAPI: fakeExtensionApi(),
      lifecycle,
      doc: { documentElement: {} },
      ObserverImpl: function Observer() {},
    });
  });
  assert.equal(foldCc.enabled, false);
  assert.doesNotThrow(() => foldCc.refresh());
  return lifecycle.dispose();
});

test("install is a no-op without MutationObserver support", () => {
  const lifecycle = createLifecycle();
  const doc = createFakeDocument();
  const foldCc = installFoldCc({ extensionAPI: fakeExtensionApi(), lifecycle, doc, ObserverImpl: null, dataApi: fakeDataApi() });
  assert.equal(foldCc.enabled, false);
  return lifecycle.dispose();
});

test("initializeFoldCcSettings seeds true once, then is a no-op", async () => {
  const api = fakeExtensionApi();
  await initializeFoldCcSettings(api);
  assert.deepEqual(api.calls, [["setting:set", FOLD_CC_SETTING_ID, true]]);

  api.calls.length = 0;
  await initializeFoldCcSettings(api);
  assert.deepEqual(api.calls, []);

  const stored = fakeExtensionApi({ [FOLD_CC_SETTING_ID]: false });
  await initializeFoldCcSettings(stored);
  assert.deepEqual(stored.calls, [], "an explicit off choice is preserved");

  const locked = fakeExtensionApi();
  locked.settings.canSet = false;
  await initializeFoldCcSettings(locked);
  assert.deepEqual(locked.calls, []);
});
