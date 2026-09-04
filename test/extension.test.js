import assert from "node:assert/strict";
import test from "node:test";

import extension from "../src/extension.js";

function fakeExtensionApi() {
  const values = new Map();
  const calls = [];
  return {
    calls,
    settings: {
      canSet: true,
      get: (key) => values.get(key) ?? null,
      set: async (key, value) => { values.set(key, value); calls.push(["setting:set", key, value]); return null; },
      panel: {
        create: async (config) => { calls.push(["panel:create", config.tabTitle]); return null; },
      },
    },
  };
}

// U5 seeds the beam knobs so the settings panel renders switches in the state the
// stylesheet is actually in. bp-appearance keeps its own untouched default/migration path.
// The trailing writes record the wash and v3-caret migrations. On a fresh graph the seed
// already stores their new defaults, so each marker is set without an extra rewrite.
const EXPECTED_BEAM_SEED = [
  ["setting:set", "bp-pack-beam", true],
  ["setting:set", "bp-beam-caret-light", "#00695e"],
  ["setting:set", "bp-beam-caret-dark", "#48d0c0"],
  ["setting:set", "bp-beam-caret-shape", "beam"],
  ["setting:set", "bp-beam-caret-width", 100],
  ["setting:set", "bp-beam-caret-height", 82],
  ["setting:set", "bp-beam-caret-radius", 3],
  ["setting:set", "bp-beam-caret-opacity", 100],
  ["setting:set", "bp-beam-caret-glow", "soft"],
  ["setting:set", "bp-beam-caret-behavior", "responsive"],
  ["setting:set", "bp-beam-caret-blink", false],
  ["setting:set", "bp-beam-wash", false],
  ["setting:set", "bp-beam-wash-intensity", "off"],
  ["setting:set", "bp-beam-cursor", "svy"],
  ["setting:set", "bp-beam-wash-migrated-2026-08-07", true],
  ["setting:set", "bp-beam-caret-v3-migrated-2026-08-08", true],
];

test("extension exports the Roam lifecycle contract and survives repeated unload", async () => {
  assert.equal(typeof extension.onload, "function");
  assert.equal(typeof extension.onunload, "function");

  const api = fakeExtensionApi();
  const cleanup = await extension.onload({ extensionAPI: api, extension: { version: "test" } });
  assert.equal(typeof cleanup, "function");
  await cleanup();
  await extension.onunload();
  await extension.onunload();

  // No document global under node:test, so installDarkModeToggle no-ops — DOM-facing
  // behavior is covered by test/dm-toggle.test.js with an injected fake document.
  assert.deepEqual(api.calls, [
    ["setting:set", "bp-appearance", "auto"],
    ...EXPECTED_BEAM_SEED,
    ["setting:set", "bp-fold-cc", true],
    ["panel:create", "Svy Theme"],
  ]);
});

test("a failed onload records window.__BP_LAST_ERROR before rethrowing", async () => {
  const api = fakeExtensionApi();
  api.settings.panel.create = async () => { throw new Error("panel.create boom"); };

  const originalWindow = globalThis.window;
  globalThis.window = {};
  try {
    await assert.rejects(
      extension.onload({ extensionAPI: api, extension: { version: "test" } }),
      /panel\.create boom/,
    );
    assert.match(globalThis.window.__BP_LAST_ERROR, /panel\.create boom/);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("a second load disposes the previous runtime before registering again", async () => {
  const firstApi = fakeExtensionApi();
  const secondApi = fakeExtensionApi();

  await extension.onload({ extensionAPI: firstApi, extension: { version: "one" } });
  const cleanup = await extension.onload({ extensionAPI: secondApi, extension: { version: "two" } });

  assert.deepEqual(firstApi.calls, [
    ["setting:set", "bp-appearance", "auto"],
    ...EXPECTED_BEAM_SEED,
    ["setting:set", "bp-fold-cc", true],
    ["panel:create", "Svy Theme"],
  ]);
  assert.deepEqual(secondApi.calls, [
    ["setting:set", "bp-appearance", "auto"],
    ...EXPECTED_BEAM_SEED,
    ["setting:set", "bp-fold-cc", true],
    ["panel:create", "Svy Theme"],
  ]);
  await cleanup();
});
