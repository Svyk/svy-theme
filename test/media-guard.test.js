import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// OS-dark rules must not paint through an explicit light stamp. The old Blueprint
// sheet carried 800 :where() guards. 0.3.0 dropped that sheet. What remains is
// the same leak check on the small color sheet.

const rootPath = fileURLToPath(new URL("../", import.meta.url));

const DARK_MEDIA = "@media (prefers-color-scheme: dark)";
const GUARD_PREFIX = ":where(:root:not(.bp3-light))";
const GUARD_INFIX = /^(\*|html|:root):where\(:not\(\.bp3-light\)\)/;

async function readText(relativePath) {
  return readFile(resolve(rootPath, relativePath), "utf8");
}

// Splits a selector list on top-level commas (a selector can hold commas inside :not()
// or an attribute value).
function splitSelector(selector) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < selector.length; index += 1) {
    const character = selector[index];
    if (character === "(" || character === "[") depth += 1;
    else if (character === ")" || character === "]") depth -= 1;
    else if (character === "," && depth === 0) {
      parts.push(selector.slice(start, index).trim());
      start = index + 1;
    }
  }
  const tail = selector.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

// Every rule selector inside a `prefers-color-scheme: dark` block. The blocks in this
// repository are never nested, so one brace-depth walk is enough; nested at-rule
// preludes (none today) would start with "@" and are excluded.
function darkMediaRules(css) {
  const rules = [];
  let index = css.indexOf(DARK_MEDIA);
  while (index !== -1) {
    const open = css.indexOf("{", index);
    let depth = 1;
    let cursor = open + 1;
    let selectorStart = cursor;
    while (cursor < css.length && depth > 0) {
      const character = css[cursor];
      if (character === "{") {
        if (depth === 1) rules.push(css.slice(selectorStart, cursor).trim());
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 1) selectorStart = cursor + 1;
      }
      cursor += 1;
    }
    index = css.indexOf(DARK_MEDIA, cursor);
  }
  return rules.filter((selector) => selector && !selector.startsWith("@"));
}

// (id, class, type) specificity of one selector, per Selectors Level 4 — a direct port
// of tools/guard_media.py:specificity, including the :where() zero-weight rule.
const FUNCTIONAL = /:(not|is|matches|any|has|where)\(/i;
const SIMPLE = /(#[\w-]+)|(\.[\w-]+)|(\[[^\]]*\])|(::[\w-]+)|(:[\w-]+)|([a-zA-Z][\w-]*)/g;

function specificity(selector) {
  let ids = 0;
  let classes = 0;
  let types = 0;
  let text = selector;
  let functional = FUNCTIONAL.exec(text);
  while (functional) {
    const name = functional[1].toLowerCase();
    let depth = 1;
    let cursor = functional.index + functional[0].length;
    while (cursor < text.length && depth > 0) {
      if (text[cursor] === "(") depth += 1;
      else if (text[cursor] === ")") depth -= 1;
      cursor += 1;
    }
    const inner = text.slice(functional.index + functional[0].length, cursor - 1);
    if (name !== "where") {
      const candidates = splitSelector(inner).map(specificity);
      const best = candidates.reduce(
        (top, candidate) => (candidate.join() > top.join() ? candidate : top),
        [0, 0, 0],
      );
      ids += best[0];
      classes += best[1];
      types += best[2];
    }
    text = text.slice(0, functional.index) + " ".repeat(cursor - functional.index) + text.slice(cursor);
    FUNCTIONAL.lastIndex = functional.index;
    functional = FUNCTIONAL.exec(text);
  }
  for (const token of text.matchAll(SIMPLE)) {
    const [, identifier, klass, attribute, element, pseudo, typeSelector] = token;
    if (identifier) ids += 1;
    else if (klass || attribute || pseudo) classes += 1;
    else if (element) types += 1;
    else if (typeSelector && !["and", "or", "not", "n", "even", "odd"].includes(typeSelector.toLowerCase())) types += 1;
  }
  return [ids, classes, types];
}

// Undo exactly the guard this tool adds, so a guarded part can be compared against the
// selector upstream shipped. Returns null for parts guarded some other way (upstream's
// own `html:not(.bp3-light)`, which predates the tool and carries real specificity).
function unguard(part) {
  if (part.startsWith(`${GUARD_PREFIX} `)) return part.slice(GUARD_PREFIX.length + 1);
  const infix = GUARD_INFIX.exec(part);
  if (infix) return infix[1] + part.slice(infix[0].length);
  return null;
}

test("no OS-dark rule in any layer can outvote an explicit .bp3-light stamp", async () => {
  const built = await readText("extension.css");
  const unguarded = [];
  for (const selector of darkMediaRules(built)) {
    for (const part of splitSelector(selector)) {
      if (!part.includes("bp3-light")) unguarded.push(part);
    }
  }
  // src/dm-toggle.js stamps .bp3-light when the user forces light (or auto mode measures
  // a light Roam); an unguarded OS-dark rule would paint dark straight through that stamp.
  assert.deepEqual(unguarded, []);
});

test("the guard adds zero specificity to every guarded selector in the built stylesheet", async () => {
  const built = await readText("extension.css");

  // The core claim: :where() never contributes weight, on both guard forms.
  assert.deepEqual(specificity(GUARD_PREFIX), [0, 0, 0]);
  assert.deepEqual(specificity("html:where(:not(.bp3-light))"), specificity("html"));

  let guarded = 0;
  for (const selector of darkMediaRules(built)) {
    for (const part of splitSelector(selector)) {
      const original = unguard(part);
      if (original === null) continue; // upstream's own bp3-light mention, not our guard
      guarded += 1;
      assert.deepEqual(specificity(part), specificity(original),
        `guard changed specificity: ${original} -> ${part}`);
    }
  }
  assert.ok(guarded > 0, "10-colors.css dark paint must use the zero-specificity :where() guard");
});

test("the built sheet no longer ships the vendored Blueprint base", async () => {
  const built = await readText("extension.css");
  assert.equal(built.includes("00-upstream-base.css"), false);
  assert.ok(built.includes("10-colors.css"));
  assert.ok(Buffer.byteLength(built, "utf8") < 120_000);
});

test("the built sheet leaves the caret to Roam Caret", async () => {
  // Roam Caret (svyk.github.io/roam-caret) owns the caret. A caret property here would
  // fight it, and the old overlay path cost a mirror layout per key.
  const built = (await readText("extension.css")).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(built, /caret-(?:color|shape|animation)\s*:/);
});
