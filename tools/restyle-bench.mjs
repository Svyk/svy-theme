#!/usr/bin/env node
// Forced-restyle A/B bench for the live Roam Desktop window (CDP, default port 9223).
//
// Each sample flips a class on #app that a bench-only rule (`.svy-bench-force *`) keys on,
// so every element under #app is invalidated and re-matched against the whole cascade, then
// forces the style flush with getBoundingClientRect. The flip changes no computed value, so
// no layout runs: the sample is style recalc for ~2,300 elements. Arms swap which theme
// sheets are enabled and run interleaved in shuffled blocks with warm-up forces after every
// switch, after a settle delay that lets color transitions finish. Every sheet the bench touches is restored in a finally block.
//
// Usage:
//   CDP_PORT=9223 node tools/restyle-bench.mjs --target "Svy - " \
//     --arm off --arm live --arm "cand=extension.css" [--blocks 15 --per-block 10]
// An arm is `off` (theme sheets disabled), `live` (the loaded theme sheets), or
// `name=file.css[+file2.css][#class1.class2]` (theme sheets disabled, the listed files
// injected, the classes added to <html> and <body> while the arm runs).
import { readFile } from "node:fs/promises";

const PORT = process.env.CDP_PORT || 9223;
const LIVE_SHEET_IDS = ["plugin-style-https://svyk.github.io/svy-theme/", "svy-theme-vars"];

function parseArgs(argv) {
  const options = { target: "Svy - ", arms: [], blocks: 15, perBlock: 10, warmup: 3, settle: 600, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--target") { options.target = value; index += 1; }
    else if (flag === "--arm") { options.arms.push(value); index += 1; }
    else if (flag === "--blocks") { options.blocks = Number(value); index += 1; }
    else if (flag === "--per-block") { options.perBlock = Number(value); index += 1; }
    else if (flag === "--warmup") { options.warmup = Number(value); index += 1; }
    else if (flag === "--settle") { options.settle = Number(value); index += 1; }
    else if (flag === "--json") options.json = true;
    else throw new Error(`unknown flag ${flag}`);
  }
  if (!options.arms.length) options.arms = ["off", "live"];
  return options;
}

async function resolveArm(spec) {
  if (spec === "off") return { name: "off", live: false, styles: [], classes: [] };
  if (spec === "live") return { name: "live", live: true, styles: [], classes: [] };
  const [name, rest] = spec.split("=");
  if (!rest) throw new Error(`arm ${spec} needs name=file.css`);
  const [files, classList = ""] = rest.split("#");
  const styles = await Promise.all(files.split("+").map((file) => readFile(file, "utf8")));
  return { name, live: false, styles, classes: classList.split(".").filter(Boolean) };
}

async function connect(target) {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const page = targets.find((entry) => entry.type === "page" && (entry.title || "").includes(target));
  if (!page) throw new Error(`no page target with a title containing ${JSON.stringify(target)}`);
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 1;
  const call = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    const onMessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      socket.removeEventListener("message", onMessage);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    };
    socket.addEventListener("message", onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
  return { page, socket, call };
}

// Runs inside the page. Kept free of closures over this module.
async function pageBench({ arms, blocks, perBlock, warmup, settle, liveIds }) {
  const root = document.getElementById("app");
  const force = document.createElement("style");
  force.id = "svy-bench-force";
  force.textContent = ".svy-bench-force * {}";
  document.head.appendChild(force);
  const live = liveIds.map((id) => document.getElementById(id)).filter(Boolean);
  const liveBefore = live.map((element) => element.sheet.disabled);
  const injected = arms.map((arm, armIndex) => arm.styles.map((css, styleIndex) => {
    const element = document.createElement("style");
    element.id = `svy-bench-${armIndex}-${styleIndex}`;
    element.textContent = css;
    document.head.appendChild(element);
    element.sheet.disabled = true;
    return element;
  }));
  let classes = [];
  const setClasses = (next) => {
    for (const cls of classes) { document.documentElement.classList.remove(cls); document.body.classList.remove(cls); }
    for (const cls of next) { document.documentElement.classList.add(cls); document.body.classList.add(cls); }
    classes = next;
  };
  const select = (armIndex) => {
    live.forEach((element) => { element.sheet.disabled = !arms[armIndex].live; });
    injected.forEach((elements, index) => elements.forEach((element) => { element.sheet.disabled = index !== armIndex; }));
    setClasses(arms[armIndex].classes);
  };
  const once = () => {
    const start = performance.now();
    root.classList.toggle("svy-bench-force");
    root.getBoundingClientRect();
    return performance.now() - start;
  };
  const samples = arms.map(() => []);
  try {
    for (let block = 0; block < blocks; block += 1) {
      const order = arms.map((_, index) => index);
      for (let index = order.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(Math.random() * (index + 1));
        [order[index], order[swap]] = [order[swap], order[index]];
      }
      for (const armIndex of order) {
        select(armIndex);
        // Swapping sheets changes colors, and Roam's color transitions keep every flush
        // expensive until they finish. Let them run out before sampling.
        once();
        await new Promise((resolve) => setTimeout(resolve, settle));
        for (let count = 0; count < warmup; count += 1) once();
        for (let count = 0; count < perBlock; count += 1) samples[armIndex].push(once());
      }
    }
  } finally {
    // Injected sheets go first: if Roam reloads the extension mid-run its <style> is
    // replaced and the old element has no sheet, which must not strand a candidate.
    injected.flat().forEach((element) => element.remove());
    force.remove();
    root.classList.remove("svy-bench-force");
    setClasses([]);
    live.forEach((element, index) => { if (element.sheet) element.sheet.disabled = liveBefore[index]; });
  }
  return { samples, elements: root.getElementsByTagName("*").length, liveFound: live.length };
}

function quantile(sorted, q) {
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

function median(values) {
  return quantile([...values].sort((a, b) => a - b), 0.5);
}

function bootstrapDiff(a, b, rounds = 2000) {
  const diffs = [];
  const pick = (values) => values[Math.floor(Math.random() * values.length)];
  for (let round = 0; round < rounds; round += 1) {
    diffs.push(median(a.map(() => pick(a))) - median(b.map(() => pick(b))));
  }
  diffs.sort((x, y) => x - y);
  return [quantile(diffs, 0.025), quantile(diffs, 0.975)];
}

const options = parseArgs(process.argv.slice(2));
const arms = await Promise.all(options.arms.map(resolveArm));
const { page, socket, call } = await connect(options.target);
const expression = `(${pageBench.toString()})(${JSON.stringify({
  arms,
  blocks: options.blocks,
  perBlock: options.perBlock,
  warmup: options.warmup,
  settle: options.settle,
  liveIds: LIVE_SHEET_IDS,
})})`;
const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
socket.close();
if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 2000));
const { samples, elements, liveFound } = result.result.value;
const baseline = arms.findIndex((arm) => arm.name === "off");
const rows = arms.map((arm, index) => {
  const sorted = [...samples[index]].sort((a, b) => a - b);
  const row = {
    arm: arm.name,
    n: sorted.length,
    median: +quantile(sorted, 0.5).toFixed(3),
    p25: +quantile(sorted, 0.25).toFixed(3),
    p75: +quantile(sorted, 0.75).toFixed(3),
  };
  if (baseline >= 0 && index !== baseline) {
    const [low, high] = bootstrapDiff(samples[index], samples[baseline]);
    row.vsOff = +(row.median - median(samples[baseline])).toFixed(3);
    row.ci95 = [+low.toFixed(3), +high.toFixed(3)];
  }
  return row;
});
if (options.json) process.stdout.write(`${JSON.stringify({ page: page.title, elements, liveFound, rows }, null, 1)}\n`);
else {
  process.stdout.write(`${page.title} | ${elements} elements under #app | live sheets found: ${liveFound}\n`);
  for (const row of rows) {
    const delta = row.vsOff == null ? "" : `  vs off ${row.vsOff >= 0 ? "+" : ""}${row.vsOff} ms [${row.ci95.join(", ")}]`;
    process.stdout.write(`${row.arm.padEnd(12)} n=${row.n}  median ${row.median} ms  (p25 ${row.p25}, p75 ${row.p75})${delta}\n`);
  }
}
