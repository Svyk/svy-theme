import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The folded-bullet cue is CSS-only: a caret-colored halo at rest, the native fold
// caret on hover. There is no JS count path anymore (src/fold-cc.js is gone), so
// these tests pin the stylesheet contract and nothing else.

const css = await readFile(new URL("../src/css/42-fold-cc.css", import.meta.url), "utf8");

test("the folded cue is a halo on the closed bullet's inner circle", () => {
  assert.match(css, /\.rm-bullet--closed \.rm-bullet__inner[^{]*\{[^}]*(box-shadow:|filter:\s*drop-shadow)/s);
  assert.match(css, /\.sidebar-content \.rm-bullet\.rm-bullet--closed \.rm-bullet__inner/);
});

test("the halo hugs the disc — no spread ring that enlarges the bullet", () => {
  // The size bug was a `0 0 0 1.5px` spread ring around the 12.3px border-box.
  // No `0 0 0 <positive>px` shadow may come back; a negative spread that pulls
  // the glow inside the transparent border is fine.
  assert.doesNotMatch(css, /0 0 0 \d*\.?\d+px/);
});

test("the halo is tinted from the caret color with per-mode fallbacks", () => {
  assert.match(css, /--svy-beam-caret/);
  assert.match(css, /#00695e/);
  assert.match(css, /#48d0c0/);
});

test("no child count survives anywhere in the layer", () => {
  assert.doesNotMatch(css, /data-svy-cc/);
  assert.doesNotMatch(css, /attr\(/);
});

test("the closed caret is unhidden only under :hover, never at rest", () => {
  assert.match(css, /:hover[^{]*\.rm-caret\.rm-caret-closed/);
  assert.match(css, /\.rm-caret-closed/);

  // Every rule that paints a caret must carry :hover in its selector.
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, selector, body] = rule;
    if (!selector.includes(".rm-caret")) continue;
    assert.ok(
      selector.includes(":hover"),
      `caret rule without :hover must not exist: ${selector.trim()}`,
    );
    assert.ok(!/opacity:\s*1/.test(body) || selector.includes(":hover"));
  }
});

test("the rest-state folded signal carries no animation", () => {
  assert.doesNotMatch(css, /@keyframes/);
  assert.doesNotMatch(css, /animation:/);
});
