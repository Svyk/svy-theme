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
    ["panel:create", "Svy Theme"],
  ]);
  assert.deepEqual(secondApi.calls, [
    ["setting:set", "bp-appearance", "auto"],
    ["panel:create", "Svy Theme"],
  ]);
  await cleanup();
});
