import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Invariants of the cascade collapse (tools/cascade_collapse.py). The generator proves
// per-family cascade equivalence in Python before it writes; these tests guard the
// properties the SHIPPED stylesheet has to keep, so a hand edit to any layer that breaks
// the token contract or reopens the OS-dark hole fails `npm run check`.

const rootPath = fileURLToPath(new URL("../", import.meta.url));
const layerDirectory = resolve(rootPath, "src/css");

const DARK_MEDIA = "@media (prefers-color-scheme: dark)";
const DARK_SIGNALS = [":root.bp3-dark", "body.bt-theme-dark", ".rm-dark-theme", "body.roam-body.dark"];

async function readLayers() {
  const filenames = (await readdir(layerDirectory)).filter((name) => name.endsWith(".css")).sort();
  const layers = new Map();
  for (const filename of filenames) {
    layers.set(filename, await readFile(resolve(layerDirectory, filename), "utf8"));
  }
  return layers;
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

// Every rule inside a `prefers-color-scheme: dark` block, with its selector list. The
// blocks in this repository are never nested, so one brace-depth walk is enough.
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
  return rules.filter((selector) => selector && !selector.startsWith("@") && !selector.includes(":"));
}

function blockAfter(css, needle) {
  const at = css.indexOf(needle);
  if (at === -1) return null;
  const open = css.indexOf("{", at + needle.length - 1);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function declaredTokens(block) {
  const tokens = new Map();
  for (const match of block.matchAll(/(--svy-b\d+-[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(match[1], match[2].trim());
  }
  return tokens;
}

test("every collapsed declaration reads a token that all three blocks define", async () => {
  const layers = await readLayers();
  const base = layers.get("00-upstream-base.css");

  const light = declaredTokens(blockAfter(base, "\n:root {"));
  const dark = declaredTokens(blockAfter(base, `\n${DARK_SIGNALS[0]}, ${DARK_SIGNALS[1]}`));
  const media = declaredTokens(blockAfter(base, `\n  ${":root:not(.bp3-light)"} {`));

  assert.ok(light.size > 500, `expected the collapsed token set, got ${light.size}`);
  assert.deepEqual([...dark.keys()].sort(), [...light.keys()].sort());
  assert.deepEqual([...media.entries()].sort(), [...dark.entries()].sort());

  // No token may resolve to the same value in both modes: that would be a token with no
  // reason to exist, i.e. a generator bug that inflates the sheet for nothing.
  const inert = [...light.keys()].filter((name) => light.get(name) === dark.get(name));
  assert.deepEqual(inert, []);

  const referenced = new Set();
  for (const css of layers.values()) {
    for (const match of css.matchAll(/var\((--svy-b\d+-[\w-]+)\s*,/g)) referenced.add(match[1]);
  }
  const undefinedTokens = [...referenced].filter((name) => !light.has(name));
  assert.deepEqual(undefinedTokens, [], "a rule reads a token no block defines");

  const unread = [...light.keys()].filter((name) => !referenced.has(name));
  assert.deepEqual(unread, [], "a token is published but nothing reads it");
});

test("dark tokens are published under all four class signals plus the OS arm", async () => {
  const layers = await readLayers();
  const base = layers.get("00-upstream-base.css");
  const header = base.slice(0, base.indexOf("END CASCADE COLLAPSE"));

  const darkSelector = header.slice(header.indexOf(`\n${DARK_SIGNALS[0]}`), header.indexOf("{", header.indexOf(`\n${DARK_SIGNALS[0]}`)));
  assert.deepEqual(splitSelector(darkSelector), DARK_SIGNALS);
  assert.match(header, /@media \(prefers-color-scheme: dark\) \{\n {2}:root:not\(\.bp3-light\) \{/);

  // Cascade-first position: the token blocks must precede every rule that reads them,
  // and @charset has to stay the first thing in the file.
  assert.ok(base.startsWith('@charset "UTF-8";\n/* === CASCADE COLLAPSE'));
  const bodyStart = base.indexOf("END CASCADE COLLAPSE");
  assert.equal(header.indexOf("var(--svy-b", header.indexOf("*/")), -1,
    "the token blocks must define tokens, never read them");
  assert.ok(base.indexOf("var(--svy-b", bodyStart) > bodyStart);
});

test("no OS-dark rule in any layer can outvote an explicit .bp3-light stamp", async () => {
  const layers = await readLayers();
  const unguarded = [];
  for (const [filename, css] of layers) {
    for (const selector of darkMediaRules(css)) {
      for (const part of splitSelector(selector)) {
        if (!part.includes("bp3-light")) unguarded.push(`${filename}: ${part}`);
      }
    }
  }
  // src/dm-toggle.js stamps .bp3-light in auto mode when Roam renders light; an
  // unguarded OS-dark rule would paint dark straight through that stamp.
  assert.deepEqual(unguarded, []);
});

test("upstream's four-copy cascade is gone from the collapsed families", async () => {
  const layers = await readLayers();
  const base = layers.get("00-upstream-base.css");
  const body = base.slice(base.indexOf("END CASCADE COLLAPSE"));

  const lightCopies = [...body.matchAll(/(?:^|,)\s*\.bp3-light\s/gm)].length;
  const darkCopies = [...body.matchAll(/(?:^|,)\s*\.bp3-dark\s/gm)].length;

  // 614 four-copy runs existed. 520 collapsed to a single tokenised base rule; 94 were
  // kept (81 non-colour differences, 13 specificity hazards) and keep all four copies,
  // alongside 22 light and 11 dark copies that never formed a run, and a few rules that
  // mix a prefixed and an unprefixed part. Counting selector PARTS, that is 181 and 174.
  // Exact, so a hand edit that resurrects a copy — or a regeneration that quietly drops
  // a kept one — fails here rather than silently changing dark mode.
  assert.equal(lightCopies, 181);
  assert.equal(darkCopies, 174);
});

test("the committed report describes the committed stylesheet", async () => {
  const layers = await readLayers();
  const base = layers.get("00-upstream-base.css");
  const report = JSON.parse(
    await readFile(resolve(rootPath, "docs/absorption/cascade-collapse-report.json"), "utf8"),
  );

  const counts = Object.values(report.classification_counts).reduce((a, b) => a + b, 0);
  assert.equal(counts, report.four_copy_runs);
  assert.equal(report.groups.length, report.four_copy_runs);
  assert.equal(report.after.bytes, Buffer.byteLength(base, "utf8"));
  assert.equal(report.tokens, declaredTokens(blockAfter(base, "\n:root {")).size);

  const collapsed = report.groups.filter((group) => group.classification.startsWith("collapse"));
  const kept = report.groups.filter((group) => group.classification.startsWith("keep"));
  assert.equal(collapsed.length + kept.length, report.four_copy_runs);
  assert.ok(kept.every((group) => typeof group.reason === "string" && group.reason.length > 0),
    "every kept family must record why it was not collapsed");
  assert.equal(
    collapsed.reduce((total, group) => total + group.tokens.length, 0),
    report.tokens,
  );
});

test("the ancestry flatten preserves specificity on every rewritten selector", async () => {
  const layers = await readLayers();
  const base = layers.get("00-upstream-base.css");
  const report = JSON.parse(
    await readFile(resolve(rootPath, "docs/absorption/cascade-collapse-report.json"), "utf8"),
  );
  const flatten = report.ancestry_flatten;

  assert.ok(flatten.rewritten_selector_parts > 0);
  assert.equal(flatten.rewrites.length, flatten.rewritten_selector_parts);
  assert.equal(flatten.specificity_preserved, true);

  // Upstream left commented-out CSS in the sheet; those blocks keep their original text,
  // so the "is it gone" checks have to look at live rules only.
  const live = base.replace(/\/\*[\s\S]*?\*\//g, "");

  for (const row of flatten.rewrites) {
    // Specificity is the whole contract here: the shortened chain keeps its exact weight
    // by repeating a retained class, so no later rule — including the user's absorbed
    // roam/css in 30-absorbed.css — wins a fight it loses today.
    assert.deepEqual(row.specificity_after, row.specificity_before, row.before);
    assert.ok(row.depth_after < row.depth_before, row.before);
    assert.ok(live.includes(row.after), `flattened selector missing: ${row.after}`);
    assert.ok(!live.includes(row.before), `unflattened selector still present: ${row.before}`);
  }

  // `.roam-app` is inside `body.roam-body` by construction, so the pair never carries
  // meaning — every live occurrence should be gone.
  assert.equal(live.includes(".roam-body .roam-app"), false);
});
