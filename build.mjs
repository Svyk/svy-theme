import { build as esbuild } from "esbuild";
import { copyFile, mkdir, readdir, readFile, rm, watch, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const thisFile = fileURLToPath(import.meta.url);
const defaultRoot = dirname(thisFile);

const rejectRemoteImports = {
  name: "reject-remote-imports",
  setup(build) {
    build.onResolve({ filter: /^(?:https?:)?\/\// }, ({ path }) => ({
      errors: [{ text: `Remote import is not allowed in a self-contained Roam extension: ${path}` }],
    }));
  },
};

export async function bundleEntry({
  rootDirectory = defaultRoot,
  entryPoint = "src/extension.js",
  banner = "",
} = {}) {
  const result = await esbuild({
    absWorkingDir: resolve(rootDirectory),
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    outfile: "extension.js",
    format: "esm",
    platform: "browser",
    target: ["es2020"],
    charset: "utf8",
    legalComments: "none",
    minify: false,
    sourcemap: false,
    treeShaking: true,
    logLevel: "silent",
    plugins: [rejectRemoteImports],
    banner: banner ? { js: banner } : undefined,
  });
  const output = result.outputFiles.find((file) => file.path.endsWith("extension.js"));
  if (!output) throw new Error("esbuild did not emit extension.js");
  return output.text;
}

export const cssLayerDirectory = "src/css";
export const pagesSourceDirectory = "site";

export function cssLayerBanner(filename) {
  return `/* === ${filename} === */\n`;
}

export async function cssLayerFilenames(rootDirectory = defaultRoot) {
  const entries = await readdir(resolve(rootDirectory, cssLayerDirectory));
  return entries.filter((name) => name.endsWith(".css")).sort();
}

export async function renderStylesheet(rootDirectory = defaultRoot) {
  const filenames = await cssLayerFilenames(rootDirectory);
  if (!filenames.length) throw new Error(`No CSS layers found in ${cssLayerDirectory}`);
  const layers = [];
  for (const filename of filenames) {
    const body = await readFile(resolve(rootDirectory, cssLayerDirectory, filename), "utf8");
    layers.push(cssLayerBanner(filename) + (body.endsWith("\n") ? body : `${body}\n`));
  }
  return layers.join("");
}

export async function renderArtifacts(rootDirectory = defaultRoot) {
  const packageMetadata = JSON.parse(await readFile(resolve(rootDirectory, "package.json"), "utf8"));
  const banner = `/* Svy Theme v${packageMetadata.version} | MIT | generated; edit src/ */`;
  return {
    javascript: await bundleEntry({ rootDirectory, banner }),
    css: await renderStylesheet(rootDirectory),
  };
}

export async function build(rootDirectory = defaultRoot) {
  const { javascript, css } = await renderArtifacts(rootDirectory);
  const deployDir = resolve(rootDirectory, "deploy");
  await Promise.all([
    writeFile(resolve(rootDirectory, "extension.js"), javascript, "utf8"),
    writeFile(resolve(rootDirectory, "extension.css"), css, "utf8"),
  ]);
  await rm(deployDir, { recursive: true, force: true });
  await mkdir(deployDir, { recursive: true });
  await Promise.all([
    writeFile(resolve(deployDir, "extension.js"), javascript, "utf8"),
    writeFile(resolve(deployDir, "extension.css"), css, "utf8"),
    copyFile(resolve(rootDirectory, pagesSourceDirectory, "index.html"), resolve(deployDir, "index.html")),
    ...["README.md", "CHANGELOG.md", "LICENSE"].map((name) => (
      copyFile(resolve(rootDirectory, name), resolve(deployDir, name))
    )),
    writeFile(resolve(deployDir, ".nojekyll"), "", "utf8"),
  ]);
  process.stdout.write(`Built extension.js, extension.css, and ${deployDir}\n`);
}

export async function verifyGeneratedArtifacts(rootDirectory = defaultRoot) {
  const expected = await renderArtifacts(rootDirectory);
  const comparisons = [
    ["extension.js", expected.javascript],
    ["extension.css", expected.css],
    ["deploy/extension.js", expected.javascript],
    ["deploy/extension.css", expected.css],
    ["deploy/index.html", await readFile(resolve(rootDirectory, pagesSourceDirectory, "index.html"), "utf8")],
    ["deploy/README.md", await readFile(resolve(rootDirectory, "README.md"), "utf8")],
    ["deploy/CHANGELOG.md", await readFile(resolve(rootDirectory, "CHANGELOG.md"), "utf8")],
    ["deploy/LICENSE", await readFile(resolve(rootDirectory, "LICENSE"), "utf8")],
    ["deploy/.nojekyll", ""],
  ];
  const drift = [];
  for (const [filename, expectedContent] of comparisons) {
    let actual;
    try {
      actual = await readFile(resolve(rootDirectory, filename), "utf8");
    } catch {
      drift.push(`${filename} is missing`);
      continue;
    }
    if (actual !== expectedContent) drift.push(`${filename} is stale`);
  }
  if (drift.length) throw new Error(`Generated artifact drift:\n- ${drift.join("\n- ")}`);
}

async function main() {
  await build();
  if (!process.argv.includes("--watch")) return;
  process.stdout.write("Watching src/ for changes. Press Ctrl-C to stop.\n");
  const watcher = watch(resolve(defaultRoot, "src"), { recursive: true });
  let pending = Promise.resolve();
  for await (const event of watcher) {
    if (!event.filename || !/\.(?:js|css)$/.test(event.filename)) continue;
    pending = pending.then(() => build(), () => build());
    await pending;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === thisFile) await main();
