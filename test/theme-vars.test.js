import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createLifecycle } from "../src/lifecycle.js";
import {
  BEAM_DEFAULTS,
  BEAM_OFF_CLASS,
  BEAM_SETTING_IDS,
  THEME_VARS_STYLE_ID,
  buildCursorValue,
  computeThemeVars,
  installThemeVars,
  normalizeBeamConfig,
  normalizeChoice,
  normalizeHex,
  normalizeSwitch,
  readBeamSettings,
  renderThemeVarsCss,
} from "../src/theme-vars.js";

function fakeClassList() {
  const names = new Set();
  return {
    names,
    add: (name) => { names.add(name); },
    remove: (name) => { names.delete(name); },
    contains: (name) => names.has(name),
  };
}

function fakeDocument() {
  const appended = [];
  const documentElement = { classList: fakeClassList() };
  const head = {
    append: (node) => { appended.push(node); node.parent = head; },
  };
  return {
    appended,
    documentElement,
    head,
    createElement: (tagName) => {
      const node = { tagName, id: "", type: "", textContent: "", parent: null };
      node.remove = () => {
        const index = appended.indexOf(node);
        if (index >= 0) appended.splice(index, 1);
        node.parent = null;
      };
      return node;
    },
  };
}

// Splits a selector list on top-level commas only: :is(a, button, …) is one selector.
function splitTopLevel(selectorList) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of selectorList) {
    if (character === "(" || character === "[") depth += 1;
    else if (character === ")" || character === "]") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function fakeExtensionApi(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    settings: {
      canSet: true,
      get: (key) => values.get(key) ?? null,
      set: async (key, value) => { values.set(key, value); return null; },
    },
  };
}

test("normalizeHex accepts #rgb and #rrggbb in any case and canonicalizes them", () => {
  assert.equal(normalizeHex("#48D0C0"), "#48d0c0");
  assert.equal(normalizeHex("48d0c0"), "#48d0c0");
  assert.equal(normalizeHex("  #ABC  "), "#aabbcc");
  assert.equal(normalizeHex("#008478"), "#008478");
});

test("normalizeHex rejects junk and returns the caller's fallback", () => {
  for (const junk of ["", "teal", "#12345", "#gggggg", "rgb(0,0,0)", "#0084785", null, undefined, 42, {}, ["#008478"]]) {
    assert.equal(normalizeHex(junk, "#fallback-marker"), "#fallback-marker", `expected ${JSON.stringify(junk)} to be rejected`);
  }
});

test("normalizeChoice and normalizeSwitch tolerate synced string forms", () => {
  assert.equal(normalizeChoice("BLOCK", ["block", "bar"], "bar"), "block");
  assert.equal(normalizeChoice("wobble", ["block", "bar"], "bar"), "bar");
  assert.equal(normalizeChoice(null, ["block", "bar"], "bar"), "bar");
  assert.equal(normalizeSwitch(true, false), true);
  assert.equal(normalizeSwitch("false", true), false);
  assert.equal(normalizeSwitch("true", false), true);
  assert.equal(normalizeSwitch(null, true), true);
  assert.equal(normalizeSwitch(0, true), true);
});

test("normalizeBeamConfig rejects one bad field without dropping its valid neighbours", () => {
  const config = normalizeBeamConfig({
    pack: false,
    caretLight: "not-a-color",
    caretDark: "#ABC",
    caretShape: "bar",
    caretBlink: "true",
    wash: false,
    washIntensity: "nope",
    cursor: "native",
  });
  assert.deepEqual(config, {
    pack: false,
    caretLight: BEAM_DEFAULTS.caretLight,
    caretDark: "#aabbcc",
    caretShape: "bar",
    caretBlink: true,
    wash: false,
    washIntensity: BEAM_DEFAULTS.washIntensity,
    cursor: "native",
  });
});

test("computeThemeVars reproduces the Beam v1 palette at defaults, with the researched dark caret", () => {
  const vars = computeThemeVars(BEAM_DEFAULTS);
  assert.equal(vars["--svy-beam-caret-light"], "#008478");
  assert.equal(vars["--svy-beam-wash-light"], "rgba(0, 122, 112, 0.045)");
  assert.equal(vars["--svy-beam-caret-dark"], "#48d0c0");
  assert.equal(vars["--svy-beam-wash-dark"], "rgba(72, 208, 192, 0.055)");
  assert.equal(vars["--svy-beam-caret-light-p3"], "oklch(0.55 0.13 184)");
  assert.equal(vars["--svy-beam-caret-dark-p3"], "oklch(0.78 0.15 184)");
  assert.equal(vars["--svy-beam-wash-light-p3"], "oklch(0.55 0.13 184 / 0.045)");
  assert.equal(vars["--svy-beam-wash-dark-p3"], "oklch(0.78 0.15 184 / 0.055)");
  assert.equal(vars["--svy-beam-caret-shape"], "block");
  assert.equal(vars["--svy-beam-caret-animation"], "manual");
  assert.equal(vars["--svy-beam-wash-duration"], "70ms");
  assert.equal(vars["--svy-beam-wash-radius"], "4px");
});

test("computeThemeVars derives the wash and the P3 pair from a customized caret", () => {
  const vars = computeThemeVars({ ...BEAM_DEFAULTS, caretDark: "#FF8800", washIntensity: "medium" });
  assert.equal(vars["--svy-beam-caret-dark"], "#ff8800");
  assert.equal(vars["--svy-beam-wash-dark"], "rgba(255, 136, 0, 0.11)");
  // A custom caret has no gamut-expanded equivalent, so the P3 block publishes the
  // same sRGB value instead of silently reverting to the default teal.
  assert.equal(vars["--svy-beam-caret-dark-p3"], "#ff8800");
  assert.equal(vars["--svy-beam-wash-dark-p3"], "rgba(255, 136, 0, 0.11)");
  // The untouched light side keeps the hand-tuned v1 pairing.
  assert.equal(vars["--svy-beam-wash-light"], "rgba(0, 122, 112, 0.09)");
  assert.equal(vars["--svy-beam-wash-light-p3"], "oklch(0.55 0.13 184 / 0.09)");
});

test("computeThemeVars disables the wash from either the switch or the off intensity", () => {
  for (const config of [
    { ...BEAM_DEFAULTS, wash: false },
    { ...BEAM_DEFAULTS, washIntensity: "off" },
  ]) {
    const vars = computeThemeVars(config);
    assert.equal(vars["--svy-beam-wash-light"], "transparent");
    assert.equal(vars["--svy-beam-wash-dark"], "transparent");
    assert.equal(vars["--svy-beam-wash-light-p3"], "transparent");
    assert.equal(vars["--svy-beam-wash-dark-p3"], "transparent");
    assert.equal(vars["--svy-beam-wash-duration"], "0ms");
  }
});

test("computeThemeVars maps caret blink and the native cursor style", () => {
  const blinking = computeThemeVars({ ...BEAM_DEFAULTS, caretBlink: true, caretShape: "bar" });
  assert.equal(blinking["--svy-beam-caret-animation"], "auto");
  assert.equal(blinking["--svy-beam-caret-shape"], "bar");

  const native = computeThemeVars({ ...BEAM_DEFAULTS, cursor: "native" });
  assert.equal(native["--svy-beam-cursor-default"], "auto");
  assert.equal(native["--svy-beam-cursor-pointer"], "pointer");
  assert.equal(native["--svy-beam-cursor-text"], "text");
});

test("cursor data URIs take their palette from the caret token and stay CSS-safe", () => {
  const vars = computeThemeVars({ ...BEAM_DEFAULTS, caretDark: "#ff8800" });
  for (const kind of ["default", "pointer", "text"]) {
    const value = vars[`--svy-beam-cursor-${kind}`];
    assert.match(value, /^url\("data:image\/svg\+xml,/, `${kind} cursor must be a data URI`);
    assert.ok(value.includes("%23ff8800"), `${kind} cursor must carry the configured spark color`);
    const uri = value.slice(value.indexOf(",") + 1, value.indexOf('")'));
    for (const unsafe of ["#", "<", ">", '"']) {
      assert.ok(!uri.includes(unsafe), `${kind} cursor data URI must escape ${unsafe}`);
    }
  }
  assert.match(vars["--svy-beam-cursor-default"], /4 3, auto$/);
  assert.match(vars["--svy-beam-cursor-pointer"], /16 16, pointer$/);
  assert.match(vars["--svy-beam-cursor-text"], /16 16, text$/);
  assert.throws(() => buildCursorValue("nope", {}), TypeError);
});

test("renderThemeVarsCss emits one :root block declaring every --svy-beam-* property", () => {
  const css = renderThemeVarsCss(BEAM_DEFAULTS);
  assert.match(css, /^:root \{\n/);
  assert.match(css, /\n\}\n$/);
  const declared = [...css.matchAll(/^ {2}(--svy-beam-[a-z0-9-]+):/gm)].map((match) => match[1]);
  assert.deepEqual(declared, Object.keys(computeThemeVars(BEAM_DEFAULTS)));
  assert.equal(declared.length, 15);
  assert.equal(new Set(declared).size, declared.length, "no property may be declared twice");
});

test("installThemeVars injects one style element and dispose removes it completely", async () => {
  const doc = fakeDocument();
  const lifecycle = createLifecycle();
  const api = fakeExtensionApi();

  const handle = installThemeVars({ extensionAPI: api, lifecycle, doc });

  assert.equal(doc.appended.length, 1);
  assert.equal(doc.appended[0].id, THEME_VARS_STYLE_ID);
  assert.equal(doc.appended[0].tagName, "style");
  assert.equal(handle.element.textContent, renderThemeVarsCss(BEAM_DEFAULTS));

  await lifecycle.dispose();
  assert.deepEqual(doc.appended, []);
  assert.equal(doc.documentElement.classList.contains(BEAM_OFF_CLASS), false);
});

test("refresh republishes the sheet from the current settings", () => {
  const doc = fakeDocument();
  const lifecycle = createLifecycle();
  const api = fakeExtensionApi();

  const handle = installThemeVars({ extensionAPI: api, lifecycle, doc });
  api.values.set(BEAM_SETTING_IDS.caretDark, "#ff8800");
  api.values.set(BEAM_SETTING_IDS.washIntensity, "off");
  handle.refresh();

  assert.equal(doc.appended.length, 1, "refresh must reuse the injected sheet, not add another");
  assert.match(handle.element.textContent, /--svy-beam-caret-dark: #ff8800;/);
  assert.match(handle.element.textContent, /--svy-beam-wash-dark: transparent;/);
});

test("the beam pack toggle adds and removes the gating class on documentElement", () => {
  const doc = fakeDocument();
  const lifecycle = createLifecycle();
  const api = fakeExtensionApi({ [BEAM_SETTING_IDS.pack]: false });

  const handle = installThemeVars({ extensionAPI: api, lifecycle, doc });
  assert.equal(doc.documentElement.classList.contains(BEAM_OFF_CLASS), true);

  api.values.set(BEAM_SETTING_IDS.pack, true);
  handle.refresh();
  assert.equal(doc.documentElement.classList.contains(BEAM_OFF_CLASS), false);

  api.values.set(BEAM_SETTING_IDS.pack, false);
  handle.refresh();
  assert.equal(doc.documentElement.classList.contains(BEAM_OFF_CLASS), true);
});

test("dispose clears a gating class that was left on", async () => {
  const doc = fakeDocument();
  const lifecycle = createLifecycle();
  const api = fakeExtensionApi({ [BEAM_SETTING_IDS.pack]: false });

  installThemeVars({ extensionAPI: api, lifecycle, doc });
  assert.equal(doc.documentElement.classList.contains(BEAM_OFF_CLASS), true);

  await lifecycle.dispose();
  assert.equal(doc.documentElement.classList.contains(BEAM_OFF_CLASS), false);
  assert.deepEqual(doc.appended, []);
});

test("installThemeVars is inert without a DOM and still returns a refresh handle", () => {
  const lifecycle = createLifecycle();
  const handle = installThemeVars({ extensionAPI: fakeExtensionApi(), lifecycle, doc: undefined });
  assert.equal(handle.element, null);
  assert.doesNotThrow(() => handle.refresh());
});

test("every --svy-beam-* the stylesheet reads is either computed in the layer or written here", async () => {
  const layer = await readFile(new URL("../src/css/40-beam.css", import.meta.url), "utf8");
  const referenced = new Set([...layer.matchAll(/var\((--svy-beam-[a-z0-9-]+)/g)].map((match) => match[1]));
  const declaredInLayer = new Set([...layer.matchAll(/^\s*(--svy-beam-[a-z0-9-]+):/gm)].map((match) => match[1]));
  const writtenHere = new Set(Object.keys(computeThemeVars(BEAM_DEFAULTS)));

  assert.ok(referenced.size > 0, "the layer must read its values through custom properties");
  for (const name of referenced) {
    assert.ok(
      declaredInLayer.has(name) || writtenHere.has(name),
      `${name} is read by 40-beam.css but nothing declares it`,
    );
  }
  for (const name of writtenHere) {
    assert.ok(referenced.has(name), `${name} is published but 40-beam.css never reads it`);
  }

  // The v1 fallbacks must survive, so the layer still renders with this module absent.
  assert.match(layer, /var\(--svy-beam-caret-light, #008478\)/);
  assert.match(layer, /var\(--svy-beam-caret-dark, #48d0c0\)/);
  assert.match(layer, /@media \(prefers-color-scheme: dark\)/);
  assert.match(layer, /:root:not\(\.bp3-light\):not\(\.svy-off-beam\)/);
  assert.match(layer, /@media \(prefers-reduced-motion: reduce\)/);

  // Pack gating is the whole layer's job: no rule may escape the class test.
  const ruleSelectors = layer
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("}")
    .map((chunk) => chunk.slice(0, chunk.indexOf("{")).trim())
    .filter((selector) => selector && !selector.startsWith("@"));
  for (const selector of ruleSelectors) {
    assert.ok(
      splitTopLevel(selector).every((part) => part.includes(".svy-off-beam")),
      `ungated rule in 40-beam.css: ${selector}`,
    );
  }
});

test("readBeamSettings normalizes what the settings panel stored", () => {
  const api = fakeExtensionApi({
    [BEAM_SETTING_IDS.pack]: "false",
    [BEAM_SETTING_IDS.caretLight]: "  #ABC ",
    [BEAM_SETTING_IDS.caretDark]: "garbage",
    [BEAM_SETTING_IDS.cursor]: "NATIVE",
  });
  assert.deepEqual(readBeamSettings(api), {
    ...BEAM_DEFAULTS,
    pack: false,
    caretLight: "#aabbcc",
    caretDark: BEAM_DEFAULTS.caretDark,
    cursor: "native",
  });
});
