import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import {
  bundleEntry,
  cssLayerBanner,
  cssLayerDirectory,
  cssLayerFilenames,
  pagesSourceDirectory,
  verifyGeneratedArtifacts,
} from "../build.mjs";

const expectedCssLayers = [
  "00-upstream-base.css",
  "10-fixes-dark.css",
  "20-plugins.css",
  "30-absorbed.css",
    "40-beam.css",
    "41-beam-motion.css",
];

const run = promisify(execFile);
const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);

async function fixture(files) {
  const directory = await mkdtemp(resolve(tmpdir(), "roam-template-bundle-"));
  for (const [filename, content] of Object.entries(files)) {
    const target = resolve(directory, filename);
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  return directory;
}

test("build emits deterministic, matching browser ESM artifacts with a default export", async () => {
  await run(process.execPath, ["build.mjs"], { cwd: rootPath });
  const [rootJs, pagesJs, rootCss, pagesCss] = await Promise.all([
    readFile(new URL("../extension.js", import.meta.url), "utf8"),
    readFile(new URL("../deploy/extension.js", import.meta.url), "utf8"),
    readFile(new URL("../extension.css", import.meta.url), "utf8"),
    readFile(new URL("../deploy/extension.css", import.meta.url), "utf8"),
  ]);

  assert.equal(pagesJs, rootJs);
  assert.equal(pagesCss, rootCss);
  assert.doesNotMatch(rootJs, /sourceMappingURL/);
  assert.equal(
    Buffer.byteLength(pagesCss, "utf8"),
    Buffer.byteLength(rootCss, "utf8"),
    "root and deploy stylesheets must be byte-identical",
  );
  assert.doesNotMatch(rootJs, /^import\s/m);
  assert.match(rootJs, /export\s*\{[\s\S]*default/);
  const rebuilt = await bundleEntry({
    rootDirectory: rootPath,
    banner: "/* Svy Theme v0.1.0 | MIT | generated; edit src/ */",
  });
  assert.equal(rebuilt, rootJs);

  await run(process.execPath, ["--check", resolve(rootPath, "extension.js")]);
  const loaded = await import(`${pathToFileURL(resolve(rootPath, "extension.js")).href}?test=${Date.now()}`);
  assert.equal(typeof loaded.default.onload, "function");
  assert.equal(typeof loaded.default.onunload, "function");
});

test("extension.css concatenates every src/css layer in lexicographic order", async () => {
  await run(process.execPath, ["build.mjs"], { cwd: rootPath });
  const filenames = await cssLayerFilenames(rootPath);
  assert.deepEqual(filenames, expectedCssLayers);

  const css = await readFile(resolve(rootPath, "extension.css"), "utf8");
  const bodies = await Promise.all(filenames.map((name) => (
    readFile(resolve(rootPath, cssLayerDirectory, name), "utf8")
  )));

  let expectedLength = 0;
  let cursor = 0;
  for (const [index, filename] of filenames.entries()) {
    const banner = cssLayerBanner(filename);
    const body = bodies[index].endsWith("\n") ? bodies[index] : `${bodies[index]}\n`;
    const bannerAt = css.indexOf(banner);
    assert.notEqual(bannerAt, -1, `${filename} banner is missing from extension.css`);
    assert.equal(bannerAt, cursor, `${filename} banner is out of order in extension.css`);
    assert.equal(css.slice(cursor + banner.length, cursor + banner.length + body.length), body);
    cursor += banner.length + body.length;
    expectedLength += banner.length + body.length;
  }
  assert.equal(cursor, css.length, "extension.css carries content outside the declared layers");
  assert.equal(css.length, expectedLength, "extension.css size must equal layers plus banners");

  const bannerBytes = filenames.reduce((total, name) => total + cssLayerBanner(name).length, 0);
  const baseBytes = Buffer.byteLength(bodies[0], "utf8");
  const placeholderBytes = bodies
    .slice(1)
    .reduce((total, body) => total + Buffer.byteLength(body, "utf8"), 0);
  // The base is upstream's sheet plus the tools/guard_media.py selector guard — no other
  // edit is expected, so the exact guarded byte count is pinned here.
  assert.equal(baseBytes, 480093, "the base layer must be upstream plus the media guard only");
  assert.ok(
    Buffer.byteLength(css, "utf8") - (baseBytes + bannerBytes) <= placeholderBytes + 1,
    "extension.css must be the base plus banners plus the fix layers only",
  );

  const deployCss = await readFile(resolve(rootPath, "deploy/extension.css"), "utf8");
  assert.equal(deployCss, css);
});

test("plugin layer remaps Chief of Staff chat panel onto Svy tokens", async () => {
  const css = await readFile(resolve(rootPath, "src/css/20-plugins.css"), "utf8");
  assert.match(css, /\[data-chief-chat-panel\]/);
  assert.match(css, /--cos-panel-bg:\s*var\(--svy-raised/);
  assert.match(css, /--cos-user-bubble-bg:\s*transparent\s*!important/);
  assert.match(css, /--cos-user-bubble-border:\s*var\(--svy-accent/);
  assert.match(css, /\[data-chief-chat-panel\] \.chief-tab/);
  assert.match(css, /\.chief-tab--active/);
  assert.match(css, /\[data-chief-chat-send\]/);
  assert.doesNotMatch(css, /overflow:\s*visible/);
});

test("Pages build ships a themed home page from its checked source", async () => {
  await run(process.execPath, ["build.mjs"], { cwd: rootPath });
  const [source, deployed] = await Promise.all([
    readFile(resolve(rootPath, pagesSourceDirectory, "index.html"), "utf8"),
    readFile(resolve(rootPath, "deploy/index.html"), "utf8"),
  ]);

  assert.equal(deployed, source, "the Pages home page must be byte-identical to its source");
  assert.match(deployed, /^<!doctype html>/i);
  assert.match(deployed, /#00695e/i, "the page must publish the light caret default");
  assert.match(deployed, /#48d0c0/i, "the page must publish the dark caret default");
  assert.match(deployed, /extension\.css/);
  assert.match(deployed, /extension\.js/);
});

test("generated artifact verification detects a CSS layer edit", async () => {
  const temporaryParent = await mkdtemp(resolve(tmpdir(), "roam-template-css-drift-"));
  const copyPath = resolve(temporaryParent, "repository");
  try {
    await cp(rootPath, copyPath, {
      recursive: true,
      filter: (source) => ![".git", "node_modules"].includes(basename(source)),
    });
    await verifyGeneratedArtifacts(copyPath);
    await writeFile(
      resolve(copyPath, cssLayerDirectory, "10-fixes-dark.css"),
      "/* drift */\n.svy-drift { color: red; }\n",
      "utf8",
    );
    await assert.rejects(verifyGeneratedArtifacts(copyPath), /extension\.css is stale/);
  } finally {
    await rm(temporaryParent, { recursive: true, force: true });
  }
});

test("generated artifact verification detects a Pages source edit", async () => {
  const temporaryParent = await mkdtemp(resolve(tmpdir(), "svy-theme-page-drift-"));
  const copyPath = resolve(temporaryParent, "repository");
  try {
    await cp(rootPath, copyPath, {
      recursive: true,
      filter: (source) => ![".git", "node_modules"].includes(basename(source)),
    });
    await verifyGeneratedArtifacts(copyPath);
    await writeFile(resolve(copyPath, pagesSourceDirectory, "index.html"), "<!doctype html><title>Drift</title>\n", "utf8");
    await assert.rejects(verifyGeneratedArtifacts(copyPath), /deploy\/index\.html is stale/);
  } finally {
    await rm(temporaryParent, { recursive: true, force: true });
  }
});

test("esbuild bundles legitimate relative source modules", async () => {
  const directory = await fixture({
    "src/message.js": 'export const message = "hello";\n',
    "src/index.js": 'import { message } from "./message.js";\nexport default { onload: () => message, onunload: () => {} };\n',
  });
  try {
    const output = await bundleEntry({ rootDirectory: directory, entryPoint: "src/index.js" });
    assert.match(output, /hello/);
    assert.match(output, /export\s*\{[\s\S]*default/);
    assert.doesNotMatch(output, /^import\s/m);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function assertBundleFailure(source, expected) {
  const directory = await fixture({ "src/index.js": source });
  try {
    await assert.rejects(
      bundleEntry({ rootDirectory: directory, entryPoint: "src/index.js" }),
      expected,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("browser bundle rejects an unresolved package hidden after same-line code", async () => {
  await assertBundleFailure(
    'const marker = 1; import value from "definitely-not-installed-roam-template-package"; export default { marker, value };',
    /Could not resolve/,
  );
});

test("browser bundle rejects a Node built-in", async () => {
  await assertBundleFailure(
    'import fs from "node:fs"; export default fs;',
    /Could not resolve "node:fs"|not built into browser/i,
  );
});

test("browser bundle rejects a remote import hidden after a comment prefix", async () => {
  await assertBundleFailure(
    '/* hidden prefix */ import value from "https://example.com/module.js"; export default value;',
    /Remote import is not allowed/,
  );
});

test("build.sh performs a clean locked install and builds from another working directory", async () => {
  const temporaryParent = await mkdtemp(resolve(tmpdir(), "roam-template-clean-"));
  const checkout = resolve(temporaryParent, "checkout");
  const elsewhere = resolve(temporaryParent, "elsewhere");
  try {
    await cp(rootPath, checkout, {
      recursive: true,
      filter: (source) => ![".git", "node_modules"].includes(basename(source)),
    });
    await mkdir(elsewhere);
    const { stdout } = await run(resolve(checkout, "build.sh"), [], {
      cwd: elsewhere,
      timeout: 60_000,
    });
    assert.match(stdout, /Built extension\.js/);
    await access(resolve(checkout, "node_modules/esbuild/package.json"));
    await verifyGeneratedArtifacts(checkout);
  } finally {
    await rm(temporaryParent, { recursive: true, force: true });
  }
});

test("generated artifact verification detects drift", async () => {
  const temporaryParent = await mkdtemp(resolve(tmpdir(), "roam-template-drift-"));
  const copyPath = resolve(temporaryParent, "repository");
  try {
    await cp(rootPath, copyPath, {
      recursive: true,
      filter: (source) => ![".git", "node_modules"].includes(basename(source)),
    });
    await writeFile(resolve(copyPath, "extension.js"), "// stale\n", "utf8");
    await assert.rejects(verifyGeneratedArtifacts(copyPath), /artifact drift/i);
  } finally {
    await rm(temporaryParent, { recursive: true, force: true });
  }
});
