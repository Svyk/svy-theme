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
import {
  BEAM_DEFAULTS,
  BEAM_SETTING_IDS,
  CARET_BEHAVIORS,
  CARET_GLOWS,
  CARET_SHAPES,
  CARET_V3_MIGRATION_SETTING_ID,
  LEGACY_CARET_LIGHT,
  WASH_MIGRATION_SETTING_ID,
} from "../src/theme-vars.js";

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

test("migration markers are not seedable beam settings", async () => {
  // BEAM_SETTING_IDS drives a seed loop that writes BEAM_DEFAULTS[key]. If the marker were
  // a member it would be persisted as `undefined` on every fresh graph.
  assert.ok(!Object.values(BEAM_SETTING_IDS).includes(WASH_MIGRATION_SETTING_ID));
  assert.equal(WASH_MIGRATION_SETTING_ID, "bp-beam-wash-migrated-2026-08-07");
  assert.ok(!Object.values(BEAM_SETTING_IDS).includes(CARET_V3_MIGRATION_SETTING_ID));
  assert.equal(CARET_V3_MIGRATION_SETTING_ID, "bp-beam-caret-v3-migrated-2026-08-08");

  const api = fakeExtensionApi();
  await initializeBeamSettings(api);
  for (const [, , value] of api.calls) assert.notEqual(value, undefined);
});

test("a graph carrying the old wash-on default is flipped off exactly once", async () => {
  // Everything else already seeded, wash stored ON — the pre-2026-08-07 state.
  const stored = Object.fromEntries(
    Object.entries(BEAM_SETTING_IDS).map(([key, id]) => [id, BEAM_DEFAULTS[key]]),
  );
  stored[BEAM_SETTING_IDS.wash] = true;
  stored[BEAM_SETTING_IDS.washIntensity] = "subtle";
  stored[CARET_V3_MIGRATION_SETTING_ID] = true;
  const api = fakeExtensionApi(stored);

  await initializeBeamSettings(api);
  assert.deepEqual(api.calls, [
    ["setting:set", BEAM_SETTING_IDS.wash, false],
    ["setting:set", WASH_MIGRATION_SETTING_ID, true],
  ]);
  assert.equal(api.settings.get(BEAM_SETTING_IDS.wash), false);
  // The stored intensity is preserved, so re-enabling the switch restores the user's pick.
  assert.equal(api.settings.get(BEAM_SETTING_IDS.washIntensity), "subtle");

  api.calls.length = 0;
  await initializeBeamSettings(api);
  assert.deepEqual(api.calls, [], "the marker makes the second load a no-op");
});

test("re-enabling the wash after the migration is never overridden", async () => {
  const stored = Object.fromEntries(
    Object.entries(BEAM_SETTING_IDS).map(([key, id]) => [id, BEAM_DEFAULTS[key]]),
  );
  // The user turned it back on after the migration already ran.
  stored[BEAM_SETTING_IDS.wash] = true;
  stored[BEAM_SETTING_IDS.washIntensity] = "medium";
  stored[WASH_MIGRATION_SETTING_ID] = true;
  stored[CARET_V3_MIGRATION_SETTING_ID] = true;
  const api = fakeExtensionApi(stored);

  await initializeBeamSettings(api);
  assert.deepEqual(api.calls, []);
  assert.equal(api.settings.get(BEAM_SETTING_IDS.wash), true);
  assert.equal(api.settings.get(BEAM_SETTING_IDS.washIntensity), "medium");
});

test("an interrupted wash migration retries instead of recording a flip it never made", async () => {
  // The marker is written AFTER the flip. A run that dies between the two writes leaves
  // wash ON and no marker, so the next load must still flip it.
  const stored = Object.fromEntries(
    Object.entries(BEAM_SETTING_IDS).map(([key, id]) => [id, BEAM_DEFAULTS[key]]),
  );
  stored[BEAM_SETTING_IDS.wash] = true;
  stored[CARET_V3_MIGRATION_SETTING_ID] = true;
  const api = fakeExtensionApi(stored);
  let failed = false;
  const realSet = api.settings.set;
  api.settings.set = async (id, value) => {
    if (id === WASH_MIGRATION_SETTING_ID && !failed) {
      failed = true;
      throw new Error("interrupted");
    }
    return realSet(id, value);
  };

  await assert.rejects(initializeBeamSettings(api), /interrupted/);
  assert.equal(api.settings.get(BEAM_SETTING_IDS.wash), false);
  assert.equal(api.settings.get(WASH_MIGRATION_SETTING_ID), null);

  // Second load: wash is already off, so no flip, but the marker is finally recorded.
  api.calls.length = 0;
  await initializeBeamSettings(api);
  assert.deepEqual(api.calls, [["setting:set", WASH_MIGRATION_SETTING_ID, true]]);
});

test("the v3 migration replaces the old block default once and preserves later choices", async () => {
  const stored = Object.fromEntries(
    Object.entries(BEAM_SETTING_IDS).map(([key, id]) => [id, BEAM_DEFAULTS[key]]),
  );
  stored[BEAM_SETTING_IDS.caretShape] = "block";
  stored[WASH_MIGRATION_SETTING_ID] = true;
  const api = fakeExtensionApi(stored);

  await initializeBeamSettings(api);
  assert.deepEqual(api.calls, [
    ["setting:set", BEAM_SETTING_IDS.caretShape, "beam"],
    ["setting:set", CARET_V3_MIGRATION_SETTING_ID, true],
  ]);

  api.calls.length = 0;
  await api.settings.set(BEAM_SETTING_IDS.caretShape, "block");
  api.calls.length = 0;
  await initializeBeamSettings(api);
  assert.deepEqual(api.calls, []);
  assert.equal(api.settings.get(BEAM_SETTING_IDS.caretShape), "block");
});

test("the v3 migration preserves a pre-existing bar choice", async () => {
  const api = fakeExtensionApi({
    [BEAM_SETTING_IDS.caretShape]: "bar",
    [WASH_MIGRATION_SETTING_ID]: true,
  });
  await initializeBeamSettings(api);
  assert.equal(api.settings.get(BEAM_SETTING_IDS.caretShape), "bar");
  assert.deepEqual(
    api.calls.filter(([, id]) => id === BEAM_SETTING_IDS.caretShape),
    [],
  );
  assert.equal(api.settings.get(CARET_V3_MIGRATION_SETTING_ID), true);
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
    [BEAM_SETTING_IDS.caretWidth, "input"],
    [BEAM_SETTING_IDS.caretHeight, "input"],
    [BEAM_SETTING_IDS.caretRadius, "input"],
    [BEAM_SETTING_IDS.caretOpacity, "input"],
    [BEAM_SETTING_IDS.caretGlow, "select"],
    [BEAM_SETTING_IDS.caretBehavior, "select"],
    [BEAM_SETTING_IDS.caretBlink, "switch"],
    [BEAM_SETTING_IDS.wash, "switch"],
    [BEAM_SETTING_IDS.washIntensity, "select"],
    [BEAM_SETTING_IDS.cursor, "select"],
  ];
  for (const [id, type] of expected) {
    assert.equal(byId.get(id)?.action?.type, type, `${id} must render as a ${type} row`);
  }
  assert.deepEqual(byId.get(BEAM_SETTING_IDS.caretShape).action.items, [...CARET_SHAPES]);
  assert.deepEqual(byId.get(BEAM_SETTING_IDS.caretGlow).action.items, [...CARET_GLOWS]);
  assert.deepEqual(byId.get(BEAM_SETTING_IDS.caretBehavior).action.items, [...CARET_BEHAVIORS]);
  assert.deepEqual(byId.get(BEAM_SETTING_IDS.washIntensity).action.items, ["subtle", "medium", "off"]);
  assert.deepEqual(byId.get(BEAM_SETTING_IDS.cursor).action.items, ["svy", "native"]);
  assert.equal(byId.get(BEAM_SETTING_IDS.caretLight).action.placeholder, BEAM_DEFAULTS.caretLight);
  assert.equal(byId.get(BEAM_SETTING_IDS.caretHeight).action.placeholder, "82");
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
  assert.equal(refreshes.length, Object.keys(BEAM_SETTING_IDS).length);
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
