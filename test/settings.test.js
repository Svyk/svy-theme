import assert from "node:assert/strict";
import test from "node:test";

import {
  APPEARANCE_MODES,
  SETTING_IDS,
  createBeamPreviewComponent,
  createSettingsPanel,
  initializeBeamSettings,
  initializeSettings,
  normalizeMode,
} from "../src/settings.js";
import { BEAM_DEFAULTS, BEAM_SETTING_IDS } from "../src/theme-vars.js";

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

test("initializeBeamSettings seeds every beam default once, then is a no-op", async () => {
  const api = fakeExtensionApi();
  await initializeBeamSettings(api);
  assert.deepEqual(api.calls, [
    ["setting:set", "bp-pack-beam", true],
    ["setting:set", "bp-beam-caret-light", "#008478"],
    ["setting:set", "bp-beam-caret-dark", "#48d0c0"],
    ["setting:set", "bp-beam-caret-shape", "block"],
    ["setting:set", "bp-beam-caret-blink", false],
    ["setting:set", "bp-beam-wash", true],
    ["setting:set", "bp-beam-wash-intensity", "subtle"],
    ["setting:set", "bp-beam-cursor", "svy"],
  ]);

  api.calls.length = 0;
  await initializeBeamSettings(api);
  assert.deepEqual(api.calls, []);
});

test("initializeBeamSettings preserves a stored beam value and never touches bp-appearance", async () => {
  const api = fakeExtensionApi({
    [SETTING_IDS.appearance]: "Dark",
    [BEAM_SETTING_IDS.pack]: false,
    [BEAM_SETTING_IDS.caretDark]: "#ff8800",
  });
  await initializeBeamSettings(api);

  const written = api.calls.map(([, id]) => id);
  assert.ok(!written.includes(SETTING_IDS.appearance));
  assert.ok(!written.includes(BEAM_SETTING_IDS.pack));
  assert.ok(!written.includes(BEAM_SETTING_IDS.caretDark));
  assert.equal(api.settings.get(SETTING_IDS.appearance), "Dark");
  assert.equal(api.settings.get(BEAM_SETTING_IDS.pack), false);
  assert.equal(api.settings.get(BEAM_SETTING_IDS.caretDark), "#ff8800");
});

test("initializeBeamSettings never writes when canSet is false", async () => {
  const api = fakeExtensionApi();
  api.settings.canSet = false;
  await initializeBeamSettings(api);
  assert.deepEqual(api.calls, []);
});

test("createSettingsPanel keeps bp-appearance first and prefixes every row id with bp-", () => {
  const panel = createSettingsPanel();
  assert.equal(panel.tabTitle, "Svy Theme");
  assert.equal(panel.settings[0].id, SETTING_IDS.appearance);
  assert.equal(panel.settings[0].action.type, "select");
  assert.deepEqual(panel.settings[0].action.items, [...APPEARANCE_MODES]);
  for (const row of panel.settings) {
    assert.match(row.id, /^bp-/, `${row.id} must keep the bp- prefix`);
    assert.equal(typeof row.name, "string");
    assert.equal(typeof row.description, "string");
  }
});

test("createSettingsPanel exposes every beam knob with the right control type", () => {
  const panel = createSettingsPanel();
  const byId = new Map(panel.settings.map((row) => [row.id, row]));
  const expected = [
    [BEAM_SETTING_IDS.pack, "switch"],
    [BEAM_SETTING_IDS.caretLight, "input"],
    [BEAM_SETTING_IDS.caretDark, "input"],
    [BEAM_SETTING_IDS.caretShape, "select"],
    [BEAM_SETTING_IDS.caretBlink, "switch"],
    [BEAM_SETTING_IDS.wash, "switch"],
    [BEAM_SETTING_IDS.washIntensity, "select"],
    [BEAM_SETTING_IDS.cursor, "select"],
  ];
  for (const [id, type] of expected) {
    assert.equal(byId.get(id)?.action?.type, type, `${id} must render as a ${type} row`);
  }
  assert.deepEqual(byId.get(BEAM_SETTING_IDS.caretShape).action.items, ["block", "bar"]);
  assert.deepEqual(byId.get(BEAM_SETTING_IDS.washIntensity).action.items, ["subtle", "medium", "off"]);
  assert.deepEqual(byId.get(BEAM_SETTING_IDS.cursor).action.items, ["svy", "native"]);
  assert.equal(byId.get(BEAM_SETTING_IDS.caretLight).action.placeholder, BEAM_DEFAULTS.caretLight);
});

test("beam rows notify the theme-vars writer, and bp-appearance keeps its own handler", () => {
  const appearance = [];
  const refreshes = [];
  const panel = createSettingsPanel({
    onAppearanceChange: (mode) => appearance.push(mode),
    onThemeVarsChange: () => refreshes.push(true),
  });

  panel.settings[0].action.onChange({ target: { value: "dark" } });
  assert.deepEqual(appearance, ["dark"]);
  assert.deepEqual(refreshes, []);

  for (const row of panel.settings.slice(1)) row.action.onChange?.({ target: { value: "x" } });
  assert.equal(refreshes.length, 8);
  assert.deepEqual(appearance, ["dark"]);
});

test("the React preview row appears only when Roam's React is available", () => {
  assert.equal(createBeamPreviewComponent(undefined), null);
  assert.equal(createBeamPreviewComponent({}), null);
  assert.equal(createSettingsPanel({ React: null }).settings.some((row) => row.id === "bp-beam-preview"), false);

  const created = [];
  const React = { createElement: (type, props, ...children) => { created.push(type); return { type, props, children }; } };
  const panel = createSettingsPanel({ React });
  const preview = panel.settings.at(-1);
  assert.equal(preview.id, "bp-beam-preview");
  assert.equal(preview.action.type, "reactComponent");

  // Stateless by construction: rendering paints from custom properties, so there is no
  // React state, effect, or subscription for the lifecycle to have to dispose.
  const tree = preview.action.component();
  assert.deepEqual(created, ["span", "span", "div"]);
  assert.match(tree.props.style.background, /var\(--svy-beam-wash/);
});
