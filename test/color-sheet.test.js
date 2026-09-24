import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const rootPath = fileURLToPath(new URL("../", import.meta.url));
const colorsPath = resolve(rootPath, "src/css/10-colors.css");
const tokensPath = resolve(rootPath, "src/css/00-tokens.css");

const ALLOWED_PROPERTIES = new Set([
  "color",
  "background",
  "background-color",
  "border-color",
  "caret-color",
  "fill",
  "outline-color",
  "border-bottom-color",
  "box-shadow",
]);

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

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

function stripFunctions(selector) {
  let output = "";
  for (let index = 0; index < selector.length; index += 1) {
    const rest = selector.slice(index);
    const functional = rest.match(/^:(?:where|not|is)\(/);
    if (!functional) {
      output += selector[index];
      continue;
    }
    let depth = 0;
    let cursor = index + functional[0].length - 1;
    for (; cursor < selector.length; cursor += 1) {
      if (selector[cursor] === "(") depth += 1;
      else if (selector[cursor] === ")") {
        depth -= 1;
        if (depth === 0) {
          cursor += 1;
          break;
        }
      }
    }
    index = cursor - 1;
  }
  return output;
}

function combinatorDepth(selector) {
  const stripped = stripFunctions(selector).replace(/::[a-z-]+/gi, "");
  const hits = stripped.match(/\s*[>+~]\s*|\s+/g);
  return hits ? hits.length : 0;
}

function rules(css) {
  const source = stripComments(css);
  const found = [];
  const stack = [];
  let cursor = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") {
      stack.push(source.slice(cursor, index).trim());
      cursor = index + 1;
    } else if (character === "}") {
      const selector = stack.pop() || "";
      const body = source.slice(cursor, index).trim();
      cursor = index + 1;
      if (selector && !selector.startsWith("@")) found.push({ selector, body });
    }
  }
  return found;
}

test("10-colors.css stays a flat literal color sheet", async () => {
  const css = await readFile(colorsPath, "utf8");
  assert.equal(css.includes("var("), false);
  assert.equal(css.includes("!important"), false);
  assert.equal(css.includes(":has("), false);
  assert.equal(css.includes("*="), false);
  assert.equal(css.includes("body.bp3-dark"), false);
  assert.equal(css.includes("bt-theme-dark"), false);
  assert.match(css, /#F5F8FA/);
  assert.match(css, /#202B33/);
  assert.match(css, /:root:not\(\.bp3-dark\) \.rm-topbar,[\s\S]*?background-color: #F5F8FA;/);
  assert.match(css, /:root\.bp3-dark \.rm-topbar,[\s\S]*?background-color: #202B33;/);
  assert.match(css, /:root\.bp3-dark \.rm-settings,[\s\S]*?background-color: #202B33;/);
  assert.match(css, /:root:not\(\.bp3-dark\) \.rm-topbar \{\s*border-bottom-color: #F5F8FA;/);
  assert.match(css, /\.roam-sidebar-container \{\s*box-shadow: 1px 0 0 #C5CBD3;/);
  assert.match(css, /#right-sidebar \{\s*box-shadow: -1px 0 0 #5C7080;/);
  assert.equal(css.includes("body.roam-body.dark"), false);
  assert.equal(css.includes("::selection"), false);
  assert.match(css, /#182026/);
  assert.match(css, /#E1E8ED/);
  assert.match(css, /#30404D/);
  assert.match(css, /#3B4C58/);
  assert.match(css, /#E8EDF2/);

  for (const rule of rules(css)) {
    for (const part of splitSelector(rule.selector)) {
      assert.equal(part.includes("*"), false, part);
      assert.ok(combinatorDepth(part) <= 2, part);
    }
    for (const declaration of rule.body.split(";")) {
      const name = declaration.split(":")[0]?.trim();
      if (!name) continue;
      assert.ok(ALLOWED_PROPERTIES.has(name), name);
    }
  }
});

test("OS-dark color rules cannot outvote a forced light stamp", async () => {
  const css = await readFile(colorsPath, "utf8");
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  assert.equal(css.includes("@media (prefers-color-scheme: dark)") && css.includes(":root:not(.bp3-light)") && !css.includes(":where(:root:not(.bp3-light))"), false);
  const darkAt = css.indexOf("@media (prefers-color-scheme: dark)");
  assert.ok(darkAt !== -1);
  assert.match(css.slice(darkAt), /:where\(:root:not\(\.bp3-light\)\)/);
});

test("public token names still exist for Roam Grid and the pills", async () => {
  const tokens = await readFile(tokensPath, "utf8");
  const absorbed = await readFile(resolve(rootPath, "src/css/30-absorbed.css"), "utf8");
  for (const name of [
    "--bc-main",
    "--bc-menu",
    "--bc-hover",
    "--bc-topbar",
    "--bc-page",
    "--bc-surface",
    "--bc-raised",
    "--cl-gray-550",
    "--cl-blue",
    "--cl-text-color",
    "--cl-main",
    "--cl-muted",
    "--cl-accent",
    "--ff-main",
    "--tagBg",
    "--tagText",
    "--tagBorder",
    "--svy-canvas",
    "--svy-surface",
    "--svy-text",
    "--svy-accent",
    "--bc-tooltip__content",
  ]) {
    assert.ok(tokens.includes(`${name}:`), name);
  }
  for (const name of ["--tagpad", "--black", "--white", "--deepblue", "--red", "--skyblue", "--green", "--gold"]) {
    assert.ok(absorbed.includes(`${name}:`), name);
  }
  assert.match(tokens, /body\.bt-theme-dark/);
  assert.match(tokens, /:root:not\(\.bp3-light\)/);
});
