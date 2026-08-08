import assert from "node:assert/strict";
import test from "node:test";

import { createLifecycle } from "../src/lifecycle.js";
import { bridgeAction, detectDarkSignals, installDarkSignalBridge } from "../src/dark-signal-bridge.js";
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

// Minimal fake DOM: only the classList surface the bridge touches.
function makeElement(tag) {
  const classes = new Set();
  return {
    tagName: tag,
    _classes: classes,
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
    },
  };
}

function createFakeDocument() {
  const documentElement = makeElement("html");
  const body = makeElement("body");
  return { documentElement, body, createElement: makeElement };
}

// Fake MutationObserver mirroring test/dm-toggle.test.js: `trigger()` simulates a
// mutation on the observed target.
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

const AUTO = { [SETTING_IDS.appearance]: "auto" };

test("detectDarkSignals reads each supported marker", () => {
  const doc = createFakeDocument();
  assert.equal(detectDarkSignals(doc), false);

  doc.body.classList.add("bt-theme-dark");
  assert.equal(detectDarkSignals(doc), true);
  doc.body.classList.remove("bt-theme-dark");

  // body.roam-body.dark only counts with both classes.
  doc.body.classList.add("roam-body");
  assert.equal(detectDarkSignals(doc), false);
  doc.body.classList.add("dark");
  assert.equal(detectDarkSignals(doc), true);
  doc.body.classList.remove("roam-body", "dark");

  // .rm-dark-theme counts on body or on documentElement.
  doc.body.classList.add("rm-dark-theme");
  assert.equal(detectDarkSignals(doc), true);
  doc.body.classList.remove("rm-dark-theme");
  doc.documentElement.classList.add("rm-dark-theme");
  assert.equal(detectDarkSignals(doc), true);
});

test("detectDarkSignals tolerates a missing DOM", () => {
  assert.equal(detectDarkSignals(null), false);
  assert.equal(detectDarkSignals({}), false);
});

test("bridgeAction: stamp only when signals present, unstamp only what it stamped", () => {
  const base = { appearance: "auto", bridgeStamped: false, rootHasDark: false };
  assert.equal(bridgeAction({ ...base, signalsPresent: true }), "stamp");
  assert.equal(bridgeAction({ ...base, signalsPresent: true, rootHasDark: true }), "none");
  assert.equal(bridgeAction({ ...base, signalsPresent: false }), "none");
  assert.equal(bridgeAction({ ...base, signalsPresent: false, bridgeStamped: true }), "unstamp");
});

test("bridgeAction never fights an explicit appearance choice", () => {
  for (const appearance of ["dark", "light", "Dark", "LIGHT"]) {
    assert.equal(bridgeAction({ signalsPresent: true, appearance, bridgeStamped: false, rootHasDark: false }), "none");
    assert.equal(bridgeAction({ signalsPresent: false, appearance, bridgeStamped: true, rootHasDark: true }), "none");
  }
  // Junk stored values normalize to auto, so the bridge still works there.
  assert.equal(bridgeAction({ signalsPresent: true, appearance: "junk", bridgeStamped: false, rootHasDark: false }), "stamp");
});

test("stamps .bp3-dark on install when a marker is already present (auto mode)", () => {
  const doc = createFakeDocument();
  doc.body.classList.add("bt-theme-dark");
  const lifecycle = createLifecycle();
  const ObserverImpl = createFakeObserverImpl();

  installDarkSignalBridge({ extensionAPI: fakeExtensionApi(AUTO), lifecycle, doc, ObserverImpl, settleDelayMs: 0 });

  assert.ok(doc.documentElement.classList.contains("bp3-dark"));
  return lifecycle.dispose();
});

test("stamps and un-stamps as markers come and go, removing only its own stamp", () => {
  const doc = createFakeDocument();
  const lifecycle = createLifecycle();
  const ObserverImpl = createFakeObserverImpl();

  installDarkSignalBridge({ extensionAPI: fakeExtensionApi(AUTO), lifecycle, doc, ObserverImpl, settleDelayMs: 0 });
  assert.ok(!doc.documentElement.classList.contains("bp3-dark"));

  const bodyObserver = ObserverImpl.instances.find((instance) => instance.observedTarget === doc.body);
  assert.ok(bodyObserver, "expected an observer on body");
  assert.deepEqual(bodyObserver.observedOptions, { attributes: true, attributeFilter: ["class"], subtree: false });

  // Marker arrives -> stamp.
  doc.body.classList.add("roam-body", "dark");
  bodyObserver.trigger();
  assert.ok(doc.documentElement.classList.contains("bp3-dark"));

  // Stamping triggers the documentElement observer; the re-entrant sync must be a no-op
  // (no unstamp, no ownership churn).
  const rootObserver = ObserverImpl.instances.find((instance) => instance.observedTarget === doc.documentElement);
  assert.ok(rootObserver, "expected an observer on documentElement");
  rootObserver.trigger();
  assert.ok(doc.documentElement.classList.contains("bp3-dark"));

  // Marker leaves -> unstamp.
  doc.body.classList.remove("dark");
  bodyObserver.trigger();
  assert.ok(!doc.documentElement.classList.contains("bp3-dark"));

  return lifecycle.dispose();
});

test("does not claim ownership of a .bp3-dark stamp it did not place", () => {
  const doc = createFakeDocument();
  const lifecycle = createLifecycle();
  const ObserverImpl = createFakeObserverImpl();

  // Someone else (Roam, another extension) stamped .bp3-dark before we loaded.
  doc.documentElement.classList.add("bp3-dark");
  installDarkSignalBridge({ extensionAPI: fakeExtensionApi(AUTO), lifecycle, doc, ObserverImpl, settleDelayMs: 0 });

  const bodyObserver = ObserverImpl.instances.find((instance) => instance.observedTarget === doc.body);
  // A marker appears and leaves again: the pre-existing stamp must survive both passes.
  doc.body.classList.add("bt-theme-dark");
  bodyObserver.trigger();
  assert.ok(doc.documentElement.classList.contains("bp3-dark"));
  doc.body.classList.remove("bt-theme-dark");
  bodyObserver.trigger();
  assert.ok(doc.documentElement.classList.contains("bp3-dark"),
    "bridge must not remove a .bp3-dark it never stamped");

  return lifecycle.dispose();
});

test("does nothing while the user picked an explicit appearance", () => {
  const doc = createFakeDocument();
  doc.body.classList.add("bt-theme-dark");
  const lifecycle = createLifecycle();
  const ObserverImpl = createFakeObserverImpl();

  installDarkSignalBridge({
    extensionAPI: fakeExtensionApi({ [SETTING_IDS.appearance]: "light" }),
    lifecycle, doc, ObserverImpl, settleDelayMs: 0,
  });
  assert.ok(!doc.documentElement.classList.contains("bp3-dark"),
    "bridge must stay out of the way of an explicit light choice");

  return lifecycle.dispose();
});

test("dispose disconnects both observers and clears the settle timer", async () => {
  const doc = createFakeDocument();
  const lifecycle = createLifecycle();
  const ObserverImpl = createFakeObserverImpl();

  installDarkSignalBridge({ extensionAPI: fakeExtensionApi(AUTO), lifecycle, doc, ObserverImpl });
  assert.equal(ObserverImpl.instances.length, 2);

  await lifecycle.dispose();
  assert.ok(ObserverImpl.instances.every((instance) => instance.disconnected));
});

test("install is a no-op outside a browser-like environment", () => {
  const lifecycle = createLifecycle();
  assert.doesNotThrow(() => installDarkSignalBridge({
    extensionAPI: fakeExtensionApi(AUTO),
    lifecycle,
    doc: null,
    ObserverImpl: function Observer() {},
  }));
  return lifecycle.dispose();
});
