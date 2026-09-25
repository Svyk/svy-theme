import assert from "node:assert/strict";
import test from "node:test";

import {
  APPEARANCE_MODES,
  SETTING_IDS,
  createSettingsPanel,
  initializeBeamSettings,
  initializeSettings,
  normalizeMode,
} from "../src/settings.js";
import {
  BEAM_DEFAULTS,
  BEAM_SETTING_IDS,
  LEGACY_CARET_LIGHT,
} from "../src/theme-vars.js";

// Ids of the overlay, motion, wash, and caret knobs retired in 0.4.0 and 0.5.0. Roam keeps whatever is
// stored under them; this extension must neither read, seed, nor show them again.
const RETIRED_BEAM_IDS = [
  "bp-beam-caret-shape",
  "bp-beam-caret-width",
  "bp-beam-caret-height",
  "bp-beam-caret-radius",
  "bp-beam-caret-opacity",
  "bp-beam-caret-glow",
  "bp-beam-caret-behavior",
  "bp-beam-caret-blink",
  "bp-beam-wash",
  "bp-beam-wash-intensity",
  "bp-beam-wash-migrated-2026-08-07",
  "bp-beam-caret-v3-migrated-2026-08-08",
  "bp-beam-preview",
];

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
    ["setting:set", "bp-beam-caret-light", "#00695e"],
    ["setting:set", "bp-beam-caret-dark", "#48d0c0"],
    ["setting:set", "bp-beam-cursor", "svy"],
  ]);

  api.calls.length = 0;
  await initializeBeamSettings(api);
  assert.deepEqual(api.calls, []);
});

test("a fresh seed never triggers the light-caret migration", async () => {
  // The seed writes the NEW default, so the migration must not fire on top of it — one
  // write for that id, not two.
  const api = fakeExtensionApi();
  await initializeBeamSettings(api);
  const writes = api.calls.filter(([, id]) => id === BEAM_SETTING_IDS.caretLight);
  assert.deepEqual(writes, [["setting:set", BEAM_SETTING_IDS.caretLight, "#00695e"]]);
});

test("retired overlay and wash ids are never seeded, rewritten, or shown", async () => {
  const stored = Object.fromEntries(RETIRED_BEAM_IDS.map((id) => [id, "kept"]));
  const api = fakeExtensionApi(stored);
  await initializeBeamSettings(api);
  const written = api.calls.map(([, id]) => id);
  for (const id of RETIRED_BEAM_IDS) {
    assert.ok(!Object.values(BEAM_SETTING_IDS).includes(id), `${id} must stay retired`);
    assert.ok(!written.includes(id), `${id} must not be written`);
    assert.equal(api.settings.get(id), "kept", `${id} keeps what Roam stored`);
  }
  for (const [, , value] of api.calls) assert.notEqual(value, undefined);

  const shown = createSettingsPanel().settings.map((row) => row.id);
  for (const id of RETIRED_BEAM_IDS) assert.ok(!shown.includes(id), `${id} must not be a panel row`);
});

test("initializeBeamSettings migrates the stored Beam v1 light caret once, then is a no-op", async () => {
  const api = fakeExtensionApi({ [BEAM_SETTING_IDS.caretLight]: LEGACY_CARET_LIGHT });
  assert.equal(LEGACY_CARET_LIGHT, "#008478");

  await initializeBeamSettings(api);
  assert.equal(api.settings.get(BEAM_SETTING_IDS.caretLight), "#00695e");
  assert.deepEqual(
    api.calls.filter(([, id]) => id === BEAM_SETTING_IDS.caretLight),
    [["setting:set", BEAM_SETTING_IDS.caretLight, "#00695e"]],
  );

  // Second load: the stored value is the new default, so nothing is rewritten.
  api.calls.length = 0;
  await initializeBeamSettings(api);
  assert.deepEqual(api.calls, []);
  assert.equal(api.settings.get(BEAM_SETTING_IDS.caretLight), "#00695e");
});

test("the light-caret migration recognizes the old default however it was stored", async () => {
  for (const stored of ["#008478", "#008478 ", "008478", "#008478".toUpperCase()]) {
    const api = fakeExtensionApi({ [BEAM_SETTING_IDS.caretLight]: stored });
    await initializeBeamSettings(api);
    assert.equal(
      api.settings.get(BEAM_SETTING_IDS.caretLight),
      "#00695e",
      `${JSON.stringify(stored)} is the old default and must migrate`,
    );
  }
});

test("the light-caret migration leaves every other stored value alone", async () => {
  // Anything that is not the old default is a user choice (or junk the normalizer will
  // reject at render time) and must survive the upgrade untouched.
  for (const stored of ["#ff8800", "#00695e", "#008479", "#abc", "teal", "", "#48d0c0"]) {
    const api = fakeExtensionApi({ [BEAM_SETTING_IDS.caretLight]: stored });
    await initializeBeamSettings(api);
    assert.equal(
      api.settings.get(BEAM_SETTING_IDS.caretLight),
      stored,
      `${JSON.stringify(stored)} must not be rewritten`,
    );
    assert.deepEqual(api.calls.filter(([, id]) => id === BEAM_SETTING_IDS.caretLight), []);
  }
});

test("the light-caret migration never writes when canSet is false", async () => {
  const api = fakeExtensionApi({ [BEAM_SETTING_IDS.caretLight]: LEGACY_CARET_LIGHT });
  api.settings.canSet = false;
  await initializeBeamSettings(api);
  assert.deepEqual(api.calls, []);
  assert.equal(api.settings.get(BEAM_SETTING_IDS.caretLight), LEGACY_CARET_LIGHT);
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

test("the appearance row keeps its stored values and describes Auto and the labeled topbar", () => {
  const panel = createSettingsPanel();
  const row = panel.settings[0];
  assert.equal(row.id, SETTING_IDS.appearance);
  assert.deepEqual(row.action.items, ["auto", "dark", "light"]);
  assert.match(row.description, /Auto/);
  assert.match(row.description, /topbar/);
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
    [BEAM_SETTING_IDS.cursor, "select"],
  ];
  for (const [id, type] of expected) {
    assert.equal(byId.get(id)?.action?.type, type, `${id} must render as a ${type} row`);
  }
  assert.equal(panel.settings.length, expected.length + 1, "appearance plus one row per beam knob");
  assert.deepEqual(byId.get(BEAM_SETTING_IDS.cursor).action.items, ["svy", "native"]);
  assert.equal(byId.get(BEAM_SETTING_IDS.caretLight).action.placeholder, BEAM_DEFAULTS.caretLight);
  assert.equal(byId.get(BEAM_SETTING_IDS.caretDark).action.placeholder, BEAM_DEFAULTS.caretDark);
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

  for (const row of panel.settings.slice(1)) {
    row.action.onChange?.({ target: { value: "x" } });
  }
  assert.equal(refreshes.length, Object.keys(BEAM_SETTING_IDS).length);
  assert.deepEqual(appearance, ["dark"]);
});
