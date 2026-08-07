import assert from "node:assert/strict";
import test from "node:test";

import { APPEARANCE_MODES, SETTING_IDS, initializeSettings, normalizeMode } from "../src/settings.js";

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

test("normalizeMode is case-insensitive and canonicalizes to lowercase", () => {
  assert.equal(normalizeMode("Dark"), "dark");
  assert.equal(normalizeMode("Auto"), "auto");
  assert.equal(normalizeMode("Light"), "light");
  assert.equal(normalizeMode("dark"), "dark");
  assert.equal(normalizeMode("DARK"), "dark");
});

test("normalizeMode falls back to auto for junk, non-string, and null input", () => {
  assert.equal(normalizeMode("nonsense"), "auto");
  assert.equal(normalizeMode(""), "auto");
  assert.equal(normalizeMode(null), "auto");
  assert.equal(normalizeMode(undefined), "auto");
  assert.equal(normalizeMode(42), "auto");
  assert.equal(normalizeMode({}), "auto");
});

test("APPEARANCE_MODES is the lowercase canonical set", () => {
  assert.deepEqual([...APPEARANCE_MODES], ["auto", "dark", "light"]);
});

test("initializeSettings sets the lowercase default when unset", async () => {
  const api = fakeExtensionApi();
  await initializeSettings(api);
  assert.deepEqual(api.calls, [["setting:set", SETTING_IDS.appearance, "auto"]]);
  assert.equal(api.settings.get(SETTING_IDS.appearance), "auto");
});

test("initializeSettings migrates a legacy capitalized value once, then is a no-op", async () => {
  // Upstream rcvd/blueprint stores "Dark" — a user migrating from upstream can have this
  // already synced through the graph.
  const api = fakeExtensionApi({ [SETTING_IDS.appearance]: "Dark" });

  await initializeSettings(api);
  assert.deepEqual(api.calls, [["setting:set", SETTING_IDS.appearance, "dark"]]);
  assert.equal(api.settings.get(SETTING_IDS.appearance), "dark");

  // Second load: value is already canonical, so no further write.
  await initializeSettings(api);
  assert.deepEqual(api.calls, [["setting:set", SETTING_IDS.appearance, "dark"]]);
});

test("initializeSettings migrates a junk stored value to auto", async () => {
  const api = fakeExtensionApi({ [SETTING_IDS.appearance]: "Solarized" });
  await initializeSettings(api);
  assert.deepEqual(api.calls, [["setting:set", SETTING_IDS.appearance, "auto"]]);
});

test("initializeSettings never writes when canSet is false", async () => {
  const api = fakeExtensionApi({ [SETTING_IDS.appearance]: "Dark" });
  api.settings.canSet = false;
  await initializeSettings(api);
  assert.deepEqual(api.calls, []);
});
