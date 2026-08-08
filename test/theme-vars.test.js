import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createLifecycle } from "../src/lifecycle.js";
import {
  BEAM_DEFAULTS,
  BEAM_OFF_CLASS,
  BEAM_SETTING_IDS,
  DARK_MEDIA_SELECTOR,
  DARK_SELECTORS,
  LEGACY_CARET_LIGHT,
  THEME_VARS_STYLE_ID,
  buildCursorValue,
  computeThemeVars,
  cursorVarsForMode,
  installThemeVars,
  normalizeBeamConfig,
  normalizeChoice,
  normalizeHex,
  normalizeSwitch,
  readBeamSettings,
  renderThemeVarsCss,
} from "../src/theme-vars.js";

const BEAM_LAYER_URL = new URL("../src/css/40-beam.css", import.meta.url);
const CURSOR_KINDS = ["default", "pointer", "text"];
const CURSOR_PROPERTIES = CURSOR_KINDS.map((kind) => `--svy-beam-cursor-${kind}`);

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

// ---------------------------------------------------------------------------
// A cascade small enough to read and real enough to prove one question: with a
// given set of stylesheets, in a given theme state, what does `cursor` on <body>
// (and on the elements that inherit from it) actually compute to?
//
// Selector support is exactly what these two stylesheets use — :root, tag, .class,
// :not(), :is(), :where(), descendant and child combinators — plus the media
// features they gate on. Anything outside that grammar would throw rather than
// quietly not match, so the test cannot pass by failing to see a rule.
// ---------------------------------------------------------------------------

function tokenizeCompound(compound) {
  const tokens = [];
  let index = 0;
  while (index < compound.length) {
    const character = compound[index];
    let end = index + 1;
    if (character === "." || character === ":") {
      let depth = 0;
      while (end < compound.length) {
        const next = compound[end];
        if (next === "(") depth += 1;
        else if (next === ")") depth -= 1;
        else if (depth === 0 && (next === "." || next === ":" || next === "[")) break;
        end += 1;
      }
    } else if (character === "[") {
      end = compound.indexOf("]", index) + 1;
      if (end === 0) throw new Error(`unterminated attribute selector: ${compound}`);
    } else {
      while (end < compound.length && !".:[".includes(compound[end])) end += 1;
    }
    tokens.push(compound.slice(index, end));
    index = end;
  }
  return tokens;
}

function functionalArgument(token) {
  return token.slice(token.indexOf("(") + 1, -1);
}

function matchToken(element, token) {
  if (token === "*") return true;
  if (token === ":root") return element.tag === "html";
  if (token.startsWith(":not(")) {
    return !splitTopLevel(functionalArgument(token)).some((inner) => matchSelector(element, inner));
  }
  if (token.startsWith(":is(") || token.startsWith(":where(")) {
    return splitTopLevel(functionalArgument(token)).some((inner) => matchSelector(element, inner));
  }
  if (token.startsWith(".")) return element.classes.includes(token.slice(1));
  // The only attribute selectors in play are ARIA/contenteditable hooks on elements this
  // model does not build; treating them as non-matching is the honest answer, not a skip.
  if (token.startsWith("[")) return false;
  if (token.startsWith(":")) throw new Error(`unsupported pseudo-class in test cascade: ${token}`);
  return element.tag === token;
}

function matchCompound(element, compound) {
  return tokenizeCompound(compound).every((token) => matchToken(element, token));
}

// Combinator split on TOP-LEVEL whitespace only: `:is(a, button, [role="button"], …)` and
// the multi-line `:where(…)` blocks both contain spaces that are not combinators.
function selectorSequence(selector) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of selector.trim()) {
    if (character === "(" || character === "[") depth += 1;
    else if (character === ")" || character === "]") depth -= 1;
    if (depth === 0 && /\s/.test(character)) {
      if (current) parts.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function matchSelector(element, selector) {
  const sequence = selectorSequence(selector);
  let index = sequence.length - 1;
  if (sequence[index] === ">") throw new Error(`malformed selector: ${selector}`);
  if (!matchCompound(element, sequence[index])) return false;

  let current = element;
  index -= 1;
  while (index >= 0) {
    let child = false;
    if (sequence[index] === ">") { child = true; index -= 1; }
    const compound = sequence[index];
    if (child) {
      current = current.parent;
      if (!current || !matchCompound(current, compound)) return false;
    } else {
      let ancestor = current.parent;
      while (ancestor && !matchCompound(ancestor, compound)) ancestor = ancestor.parent;
      if (!ancestor) return false;
      current = ancestor;
    }
    index -= 1;
  }
  return true;
}

function specificity(selector) {
  let classes = 0;
  let types = 0;
  for (const compound of selectorSequence(selector)) {
    if (compound === ">") continue;
    for (const token of tokenizeCompound(compound)) {
      if (token.startsWith(":where(")) continue; // :where() contributes nothing, by spec
      if (token.startsWith(":not(") || token.startsWith(":is(")) {
        const inner = splitTopLevel(functionalArgument(token)).map(specificity);
        const best = inner.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1])).at(-1) ?? [0, 0];
        classes += best[0];
        types += best[1];
        continue;
      }
      if (token === "*") continue;
      if (token.startsWith(".") || token.startsWith("[") || token.startsWith(":")) classes += 1;
      else types += 1;
    }
  }
  return [classes, types];
}

function parseDeclarations(body) {
  const declarations = {};
  let depth = 0;
  let current = "";
  const flush = () => {
    const text = current.trim();
    current = "";
    if (!text) return;
    let colon = -1;
    let innerDepth = 0;
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] === "(") innerDepth += 1;
      else if (text[index] === ")") innerDepth -= 1;
      else if (text[index] === ":" && innerDepth === 0) { colon = index; break; }
    }
    if (colon < 0) throw new Error(`declaration without a property: ${text}`);
    const name = text.slice(0, colon).trim();
    let value = text.slice(colon + 1).trim();
    let important = false;
    if (value.endsWith("!important")) {
      important = true;
      value = value.slice(0, -"!important".length).trim();
    }
    declarations[name] = { value, important };
  };
  for (const character of body) {
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    if (character === ";" && depth === 0) flush();
    else current += character;
  }
  flush();
  return declarations;
}

function parseStylesheet(css) {
  const rules = [];
  const walk = (text, media) => {
    let index = 0;
    while (index < text.length) {
      const open = text.indexOf("{", index);
      if (open < 0) break;
      const prelude = text.slice(index, open).trim();
      let depth = 1;
      let close = open + 1;
      while (close < text.length && depth > 0) {
        if (text[close] === "{") depth += 1;
        else if (text[close] === "}") depth -= 1;
        close += 1;
      }
      const body = text.slice(open + 1, close - 1);
      if (prelude.startsWith("@media")) {
        walk(body, [...media, prelude.slice("@media".length).trim()]);
      } else if (prelude.startsWith("@")) {
        throw new Error(`unsupported at-rule in test cascade: ${prelude}`);
      } else {
        rules.push({
          selectors: splitTopLevel(prelude),
          declarations: parseDeclarations(body),
          media,
          order: rules.length,
        });
      }
      index = close;
    }
    return rules;
  };
  return walk(css.replace(/\/\*[\s\S]*?\*\//g, ""), []);
}

function mediaMatches(condition, environment) {
  return condition.split(/\s+and\s+/).every((clause) => {
    const match = /^\(([a-z-]+):\s*([a-z0-9-]+)\)$/.exec(clause.trim());
    if (!match) throw new Error(`unsupported media condition in test cascade: ${clause}`);
    if (!(match[1] in environment)) throw new Error(`untested media feature: ${match[1]}`);
    return environment[match[1]] === match[2];
  });
}

function compareKeys(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function declaredValue(element, rules, environment, property) {
  let winner = null;
  for (const rule of rules) {
    const declaration = rule.declarations[property];
    if (!declaration) continue;
    if (!rule.media.every((condition) => mediaMatches(condition, environment))) continue;
    for (const selector of rule.selectors) {
      if (!matchSelector(element, selector)) continue;
      const [classes, types] = specificity(selector);
      // origin/importance, then specificity, then document order — the cascade in order.
      const key = [declaration.important ? 1 : 0, classes, types, rule.order];
      if (!winner || compareKeys(key, winner.key) > 0) winner = { key, value: declaration.value };
    }
  }
  return winner ? winner.value : null;
}

function customProperty(element, rules, environment, name) {
  for (let node = element; node; node = node.parent) {
    const value = declaredValue(node, rules, environment, name);
    if (value != null) return value;
  }
  return null;
}

function substitute(value, element, rules, environment) {
  if (value == null) return null;
  const match = /^var\((--[a-z0-9-]+)(?:,\s*([\s\S]*))?\)$/.exec(value.trim());
  if (!match) return value;
  const computed = customProperty(element, rules, environment, match[1]);
  if (computed != null) return substitute(computed, element, rules, environment);
  return match[2] == null ? null : substitute(match[2], element, rules, environment);
}

function computedProperty(element, rules, environment, property) {
  return substitute(declaredValue(element, rules, environment, property), element, rules, environment);
}

function documentTree({ htmlClasses = [], bodyClasses = [], innerClasses = [] } = {}) {
  const html = { tag: "html", classes: htmlClasses, parent: null };
  const body = { tag: "body", classes: bodyClasses, parent: html };
  const inner = { tag: "div", classes: innerClasses, parent: body };
  return {
    html,
    body,
    inner,
    link: { tag: "a", classes: [], parent: body },
    input: { tag: "input", classes: [], parent: body },
    nestedLink: { tag: "a", classes: [], parent: inner },
  };
}

function environment(overrides = {}) {
  return {
    "prefers-color-scheme": "light",
    "color-gamut": "srgb",
    "prefers-reduced-motion": "no-preference",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

test("normalizeHex accepts #rgb and #rrggbb in any case and canonicalizes them", () => {
  assert.equal(normalizeHex("#48D0C0"), "#48d0c0");
  assert.equal(normalizeHex("48d0c0"), "#48d0c0");
  assert.equal(normalizeHex("  #ABC  "), "#aabbcc");
  assert.equal(normalizeHex("#00695E"), "#00695e");
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

test("the light caret default moved off Beam v1's value and the old one is still named", () => {
  assert.equal(LEGACY_CARET_LIGHT, "#008478");
  assert.equal(BEAM_DEFAULTS.caretLight, "#00695e");
  assert.notEqual(BEAM_DEFAULTS.caretLight, LEGACY_CARET_LIGHT);
  assert.equal(BEAM_DEFAULTS.caretDark, "#48d0c0", "the dark caret default is unchanged");
});

test("computeThemeVars publishes the researched caret pair, and the default paints no wash", () => {
  const { base } = computeThemeVars(BEAM_DEFAULTS);
  assert.equal(base["--svy-beam-caret-light"], "#00695e");
  assert.equal(base["--svy-beam-caret-dark"], "#48d0c0");
  assert.equal(base["--svy-beam-caret-light-p3"], "oklch(0.47 0.11 182)");
  assert.equal(base["--svy-beam-caret-dark-p3"], "oklch(0.78 0.15 184)");
  assert.equal(base["--svy-beam-caret-shape"], "block");
  assert.equal(base["--svy-beam-caret-animation"], "manual");
  assert.equal(base["--svy-beam-wash-radius"], "4px");

  // The 2026-08-07 default: caret only, no focus wash.
  assert.equal(BEAM_DEFAULTS.wash, false);
  assert.equal(BEAM_DEFAULTS.washIntensity, "off");
  assert.equal(base["--svy-beam-wash-light"], "transparent");
  assert.equal(base["--svy-beam-wash-dark"], "transparent");
  assert.equal(base["--svy-beam-wash-duration"], "0ms");
});

test("the hand-tuned v1 wash bases still apply when the wash is switched back on", () => {
  const { base } = computeThemeVars({ ...BEAM_DEFAULTS, wash: true, washIntensity: "subtle" });
  assert.equal(base["--svy-beam-wash-light"], "rgba(0, 122, 112, 0.045)");
  assert.equal(base["--svy-beam-wash-dark"], "rgba(72, 208, 192, 0.055)");
  assert.equal(base["--svy-beam-wash-light-p3"], "oklch(0.47 0.11 182 / 0.045)");
  assert.equal(base["--svy-beam-wash-dark-p3"], "oklch(0.78 0.15 184 / 0.055)");
  assert.equal(base["--svy-beam-wash-duration"], "70ms");
});

test("computeThemeVars derives the wash and the P3 pair from a customized caret", () => {
  const { base } = computeThemeVars({ ...BEAM_DEFAULTS, wash: true, caretDark: "#FF8800", washIntensity: "medium" });
  assert.equal(base["--svy-beam-caret-dark"], "#ff8800");
  assert.equal(base["--svy-beam-wash-dark"], "rgba(255, 136, 0, 0.11)");
  // A custom caret has no gamut-expanded equivalent, so the P3 block publishes the
  // same sRGB value instead of silently reverting to the default teal.
  assert.equal(base["--svy-beam-caret-dark-p3"], "#ff8800");
  assert.equal(base["--svy-beam-wash-dark-p3"], "rgba(255, 136, 0, 0.11)");
  // The untouched light side keeps the hand-tuned v1 pairing.
  assert.equal(base["--svy-beam-wash-light"], "rgba(0, 122, 112, 0.09)");
  assert.equal(base["--svy-beam-wash-light-p3"], "oklch(0.47 0.11 182 / 0.09)");
});

test("computeThemeVars disables the wash from either the switch or the off intensity", () => {
  // Both arms start from an explicitly-ON config. Deriving them from BEAM_DEFAULTS would
  // make this a test that cannot fail now that the default is already off.
  const on = { ...BEAM_DEFAULTS, wash: true, washIntensity: "subtle" };
  assert.notEqual(computeThemeVars(on).base["--svy-beam-wash-light"], "transparent");
  for (const config of [
    { ...on, wash: false },
    { ...on, washIntensity: "off" },
  ]) {
    const { base } = computeThemeVars(config);
    assert.equal(base["--svy-beam-wash-light"], "transparent");
    assert.equal(base["--svy-beam-wash-dark"], "transparent");
    assert.equal(base["--svy-beam-wash-light-p3"], "transparent");
    assert.equal(base["--svy-beam-wash-dark-p3"], "transparent");
    assert.equal(base["--svy-beam-wash-duration"], "0ms");
  }
});

test("computeThemeVars maps caret blink, and native cursors need no dark block", () => {
  const { base: blinking } = computeThemeVars({ ...BEAM_DEFAULTS, caretBlink: true, caretShape: "bar" });
  assert.equal(blinking["--svy-beam-caret-animation"], "auto");
  assert.equal(blinking["--svy-beam-caret-shape"], "bar");

  const native = computeThemeVars({ ...BEAM_DEFAULTS, cursor: "native" });
  assert.equal(native.base["--svy-beam-cursor-default"], "auto");
  assert.equal(native.base["--svy-beam-cursor-pointer"], "pointer");
  assert.equal(native.base["--svy-beam-cursor-text"], "text");
  assert.deepEqual(native.dark, {}, "native cursors are mode-independent, so no dark block is emitted");
  assert.doesNotMatch(renderThemeVarsCss({ ...BEAM_DEFAULTS, cursor: "native" }), /bp3-dark|prefers-color-scheme/);
});

test("the two cursor sets carry different ink and share the caret-derived spark", () => {
  const { base, dark } = computeThemeVars(BEAM_DEFAULTS);
  for (const property of CURSOR_PROPERTIES) {
    // Light keeps Beam v1's near-black ink; dark swaps it for the near-white one and
    // uses #182026 as the interior fill instead.
    assert.ok(base[property].includes("%23182026"), `light ${property} must keep the #182026 ink`);
    assert.ok(!base[property].includes("%23e1e8ed"), `light ${property} must not carry the dark ink`);
    assert.ok(dark[property].includes("%23e1e8ed"), `dark ${property} must carry the #E1E8ED outline`);
    assert.ok(dark[property].includes("%23182026"), `dark ${property} must keep #182026 as interior fill`);
    assert.ok(dark[property].includes("%2348d0c0"), `dark ${property} must carry the dark caret hue`);
    assert.ok(!dark[property].includes("%2348aff0"), `dark ${property} must drop the light accent`);
    assert.notEqual(base[property], dark[property]);
  }
  // One identity hue on dark: accent and spark are both the dark caret.
  assert.equal((dark["--svy-beam-cursor-pointer"].match(/%2348d0c0/g) || []).length, 2);
});

test("a customized caret recolours the spark in BOTH modes, independently", () => {
  const { base, dark } = computeThemeVars({ ...BEAM_DEFAULTS, caretLight: "#7a0000", caretDark: "#ff8800" });
  for (const property of CURSOR_PROPERTIES) {
    assert.ok(base[property].includes("%237a0000"), `light ${property} must follow the light caret`);
    assert.ok(!base[property].includes("%23ff8800"), `light ${property} must not take the dark caret`);
    assert.ok(dark[property].includes("%23ff8800"), `dark ${property} must follow the dark caret`);
    assert.ok(!dark[property].includes("%237a0000"), `dark ${property} must not take the light caret`);
  }
  // Changing only one mode leaves the other mode's art byte-for-byte alone.
  const oneSide = computeThemeVars({ ...BEAM_DEFAULTS, caretDark: "#ff8800" });
  const defaults = computeThemeVars(BEAM_DEFAULTS);
  for (const property of CURSOR_PROPERTIES) {
    assert.equal(oneSide.base[property], defaults.base[property]);
    assert.notEqual(oneSide.dark[property], defaults.dark[property]);
  }
});

test("cursor data URIs stay CSS-safe and keep their hotspots in both modes", () => {
  const { base, dark } = computeThemeVars(BEAM_DEFAULTS);
  for (const set of [base, dark]) {
    for (const kind of CURSOR_KINDS) {
      const value = set[`--svy-beam-cursor-${kind}`];
      assert.match(value, /^url\("data:image\/svg\+xml,/, `${kind} cursor must be a data URI`);
      const uri = value.slice(value.indexOf(",") + 1, value.indexOf('")'));
      for (const unsafe of ["#", "<", ">", '"']) {
        assert.ok(!uri.includes(unsafe), `${kind} cursor data URI must escape ${unsafe}`);
      }
    }
    assert.match(set["--svy-beam-cursor-default"], /4 3, auto$/);
    assert.match(set["--svy-beam-cursor-pointer"], /16 16, pointer$/);
    assert.match(set["--svy-beam-cursor-text"], /16 16, text$/);
  }
  assert.throws(() => buildCursorValue("nope", {}), TypeError);
  assert.deepEqual(Object.keys(cursorVarsForMode(normalizeBeamConfig(BEAM_DEFAULTS), "dark")), CURSOR_PROPERTIES);
});

test("renderThemeVarsCss emits the :root block, the dark signal block, and the OS-dark guard", () => {
  const css = renderThemeVarsCss(BEAM_DEFAULTS);
  const { base, dark } = computeThemeVars(BEAM_DEFAULTS);

  const rules = parseStylesheet(css);
  assert.equal(rules.length, 3);

  assert.deepEqual(rules[0].selectors, [":root"]);
  assert.deepEqual(Object.keys(rules[0].declarations), Object.keys(base));
  assert.equal(Object.keys(base).length, 15);

  assert.deepEqual(rules[1].selectors, [...DARK_SELECTORS]);
  assert.deepEqual(rules[1].media, []);
  assert.deepEqual(Object.keys(rules[1].declarations), CURSOR_PROPERTIES);
  for (const property of CURSOR_PROPERTIES) {
    assert.equal(rules[1].declarations[property].value, dark[property]);
  }

  assert.deepEqual(rules[2].selectors, [DARK_MEDIA_SELECTOR]);
  assert.deepEqual(rules[2].media, ["(prefers-color-scheme: dark)"]);
  assert.deepEqual(rules[2].declarations, rules[1].declarations);

  // The four class signals are the same ones 10-fixes-dark.css uses.
  assert.deepEqual([...DARK_SELECTORS], [
    ":root.bp3-dark",
    "body.bt-theme-dark",
    ".rm-dark-theme",
    "body.roam-body.dark",
  ]);
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
  assert.match(handle.element.textContent, /--svy-beam-wash-dark: transparent;/, "default is wash-off");

  api.values.set(BEAM_SETTING_IDS.caretDark, "#ff8800");
  // Turning the wash ON is the state change worth proving: asserting "off" against a
  // default that is already off would pass no matter what refresh() did.
  api.values.set(BEAM_SETTING_IDS.wash, true);
  api.values.set(BEAM_SETTING_IDS.washIntensity, "medium");
  handle.refresh();

  assert.equal(doc.appended.length, 1, "refresh must reuse the injected sheet, not add another");
  assert.match(handle.element.textContent, /--svy-beam-caret-dark: #ff8800;/);
  assert.match(handle.element.textContent, /--svy-beam-wash-dark: rgba\(255, 136, 0, 0\.11\);/);
  // The dark cursor block follows the same refresh, not just the :root block.
  const rules = parseStylesheet(handle.element.textContent);
  assert.ok(rules[1].declarations["--svy-beam-cursor-default"].value.includes("%23ff8800"));
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
  const layer = await readFile(BEAM_LAYER_URL, "utf8");
  const code = layer.replace(/\/\*[\s\S]*?\*\//g, "");
  const referenced = new Set([...layer.matchAll(/var\((--svy-beam-[a-z0-9-]+)/g)].map((match) => match[1]));
  const declaredInLayer = new Set([...layer.matchAll(/^\s*(--svy-beam-[a-z0-9-]+):/gm)].map((match) => match[1]));
  const { base, dark } = computeThemeVars(BEAM_DEFAULTS);
  const writtenHere = new Set([...Object.keys(base), ...Object.keys(dark)]);

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
  assert.match(code, /var\(--svy-beam-caret-light, #00695e\)/);
  assert.match(code, /var\(--svy-beam-caret-dark, #48d0c0\)/);
  // The superseded light caret survives only in the comment that records why it moved.
  assert.doesNotMatch(code, /#008478/, "no rule may still paint the superseded light caret");
  assert.match(code, /@media \(prefers-color-scheme: dark\)/);
  assert.match(code, /:root:not\(\.bp3-light\):not\(\.svy-off-beam\)/);
  assert.match(code, /@media \(prefers-reduced-motion: reduce\)/);

  // Pack gating is the whole layer's job: no rule may escape the class test.
  const ruleSelectors = code
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

test("the baked cursor fallbacks in 40-beam.css are byte-identical to what this module publishes", async () => {
  const layer = await readFile(BEAM_LAYER_URL, "utf8");
  const rules = parseStylesheet(layer);
  const { base, dark } = computeThemeVars(BEAM_DEFAULTS);

  // Light art lives as the var() fallback on each cursor rule.
  const cursorRules = rules.filter((rule) => rule.declarations.cursor);
  assert.equal(cursorRules.length, 3, "one cursor rule per kind");
  for (const rule of cursorRules) {
    const match = /^var\((--svy-beam-cursor-[a-z]+),\s*([\s\S]*)\)$/.exec(rule.declarations.cursor.value);
    assert.ok(match, `cursor rule must read through a custom property with a fallback: ${rule.selectors}`);
    assert.equal(match[2], base[match[1]], `${match[1]} light fallback has drifted from computeThemeVars`);
  }

  // Dark art lives in the zero-specificity :where() blocks.
  const darkBlocks = rules.filter((rule) => rule.declarations["--svy-beam-cursor-default"]);
  assert.equal(darkBlocks.length, 2, "one dark token block plus its prefers-color-scheme twin");
  for (const rule of darkBlocks) {
    for (const selector of rule.selectors) {
      assert.match(selector, /^:where\(/, "the baked dark block must not outrank the injected sheet");
      assert.deepEqual(specificity(selector), [0, 0]);
    }
    for (const property of CURSOR_PROPERTIES) {
      assert.equal(rule.declarations[property].value, dark[property], `${property} dark fallback has drifted`);
    }
  }
  assert.deepEqual(darkBlocks[1].media, ["(prefers-color-scheme: dark)"]);
});

// ---------------------------------------------------------------------------
// The cascade proof.
// ---------------------------------------------------------------------------

test("the test cascade reproduces a known specificity and inheritance result", () => {
  // Guard on the guard: if this mini-cascade could not tell a more specific rule from a
  // less specific one, or could not inherit a custom property, every arm below would pass
  // for the wrong reason.
  const rules = parseStylesheet(`
    :root { --token: low; }
    :root.marked { --token: high; }
    body { probe: var(--token, none); }
    body.local { --token: local; }
  `);
  const plain = documentTree();
  assert.equal(computedProperty(plain.body, rules, environment(), "probe"), "low");
  const marked = documentTree({ htmlClasses: ["marked"] });
  assert.equal(computedProperty(marked.body, rules, environment(), "probe"), "high");
  const local = documentTree({ bodyClasses: ["local"] });
  assert.equal(computedProperty(local.body, rules, environment(), "probe"), "local");
  // An unmatched var() with no fallback resolves to nothing, not to a stale value.
  assert.equal(computedProperty(plain.body, parseStylesheet("body { probe: var(--absent); }"), environment(), "probe"), null);
});

const DARK_ARMS = [
  ["Roam dark class on <html>", { htmlClasses: ["bp3-dark"] }, {}],
  ["Better Tasks dark marker on <body>", { bodyClasses: ["bt-theme-dark"] }, {}],
  ["legacy .rm-dark-theme on <html>", { htmlClasses: ["rm-dark-theme"] }, {}],
  ["legacy body.roam-body.dark", { bodyClasses: ["roam-body", "dark"] }, {}],
  ["auto mode with an OS-dark preference", {}, { "prefers-color-scheme": "dark" }],
];

const LIGHT_ARMS = [
  ["nothing stamped, OS light", {}, {}],
  ["explicit Roam light beats the OS hint", { htmlClasses: ["bp3-light"] }, { "prefers-color-scheme": "dark" }],
];

test("the dark cursor set reaches body{cursor} under every dark signal, with JS running", async () => {
  // Document order: Roam inserts extension.css when it loads the extension, then
  // installThemeVars appends <style id="svy-theme-vars"> to head during onload.
  const layer = await readFile(BEAM_LAYER_URL, "utf8");
  const rules = parseStylesheet(`${layer}\n${renderThemeVarsCss(BEAM_DEFAULTS)}`);
  const { base, dark } = computeThemeVars(BEAM_DEFAULTS);

  for (const [label, classes, media] of DARK_ARMS) {
    const tree = documentTree(classes);
    const env = environment(media);
    assert.equal(computedProperty(tree.body, rules, env, "cursor"), dark["--svy-beam-cursor-default"], `${label}: body arrow`);
    assert.equal(computedProperty(tree.link, rules, env, "cursor"), dark["--svy-beam-cursor-pointer"], `${label}: link target`);
    assert.equal(computedProperty(tree.input, rules, env, "cursor"), dark["--svy-beam-cursor-text"], `${label}: text beam`);
    assert.equal(computedProperty(tree.input, rules, env, "caret-color"), "#48d0c0", `${label}: caret`);
  }

  for (const [label, classes, media] of LIGHT_ARMS) {
    const tree = documentTree(classes);
    const env = environment(media);
    assert.equal(computedProperty(tree.body, rules, env, "cursor"), base["--svy-beam-cursor-default"], `${label}: body arrow`);
    assert.equal(computedProperty(tree.link, rules, env, "cursor"), base["--svy-beam-cursor-pointer"], `${label}: link target`);
    assert.equal(computedProperty(tree.input, rules, env, "cursor"), base["--svy-beam-cursor-text"], `${label}: text beam`);
    assert.equal(computedProperty(tree.input, rules, env, "caret-color"), "#00695e", `${label}: caret`);
  }
});

test("the dark cursor set holds with JavaScript absent, from the baked layer alone", async () => {
  const rules = parseStylesheet(await readFile(BEAM_LAYER_URL, "utf8"));
  const { base, dark } = computeThemeVars(BEAM_DEFAULTS);

  for (const [label, classes, media] of DARK_ARMS) {
    const tree = documentTree(classes);
    const env = environment(media);
    assert.equal(computedProperty(tree.body, rules, env, "cursor"), dark["--svy-beam-cursor-default"], `${label}: body arrow`);
    assert.equal(computedProperty(tree.link, rules, env, "cursor"), dark["--svy-beam-cursor-pointer"], `${label}: link target`);
    assert.equal(computedProperty(tree.input, rules, env, "cursor"), dark["--svy-beam-cursor-text"], `${label}: text beam`);
  }
  for (const [label, classes, media] of LIGHT_ARMS) {
    const tree = documentTree(classes);
    const env = environment(media);
    assert.equal(computedProperty(tree.body, rules, env, "cursor"), base["--svy-beam-cursor-default"], `${label}: body arrow`);
  }
});

test(".rm-dark-theme on an inner node darkens its subtree and nothing above it", async () => {
  // The legacy marker is the one signal that can land below <body>. Its reach is that
  // node's subtree — the same reach the caret has — so the page arrow stays light while a
  // link inside the marked subtree gets the dark target. Recording it here so a future
  // change to that boundary shows up as a failing test rather than a surprise.
  const layer = await readFile(BEAM_LAYER_URL, "utf8");
  const rules = parseStylesheet(`${layer}\n${renderThemeVarsCss(BEAM_DEFAULTS)}`);
  const { base, dark } = computeThemeVars(BEAM_DEFAULTS);
  const tree = documentTree({ innerClasses: ["rm-dark-theme"] });
  const env = environment();

  assert.equal(computedProperty(tree.body, rules, env, "cursor"), base["--svy-beam-cursor-default"]);
  assert.equal(computedProperty(tree.link, rules, env, "cursor"), base["--svy-beam-cursor-pointer"]);
  assert.equal(computedProperty(tree.nestedLink, rules, env, "cursor"), dark["--svy-beam-cursor-pointer"]);
});

test("a customized dark caret still wins over the baked dark fallback", async () => {
  // The whole point of the :where() wrapper: the layer must never outrank a published
  // value, or the dark caret setting would silently stop recolouring the cursors.
  const layer = await readFile(BEAM_LAYER_URL, "utf8");
  const config = { ...BEAM_DEFAULTS, caretDark: "#ff8800" };
  const rules = parseStylesheet(`${layer}\n${renderThemeVarsCss(config)}`);
  const { dark } = computeThemeVars(config);

  for (const [label, classes, media] of DARK_ARMS) {
    const tree = documentTree(classes);
    const env = environment(media);
    const value = computedProperty(tree.body, rules, env, "cursor");
    assert.equal(value, dark["--svy-beam-cursor-default"], `${label}: published value must win`);
    assert.ok(value.includes("%23ff8800"), `${label}: the custom hue must reach the cursor`);
  }
});

test("switching the beam pack off restores the native cursor in both modes", async () => {
  const layer = await readFile(BEAM_LAYER_URL, "utf8");
  const rules = parseStylesheet(`${layer}\n${renderThemeVarsCss(BEAM_DEFAULTS)}`);

  for (const classes of [[BEAM_OFF_CLASS], [BEAM_OFF_CLASS, "bp3-dark"]]) {
    const tree = documentTree({ htmlClasses: classes });
    for (const element of [tree.body, tree.link, tree.input]) {
      assert.equal(computedProperty(element, rules, environment(), "cursor"), null, `${classes}: no cursor rule may apply`);
    }
    assert.equal(computedProperty(tree.input, rules, environment(), "caret-color"), null);
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
