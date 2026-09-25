#!/usr/bin/env node
// Typing-latency A/B bench for the live Roam Desktop window (CDP, default port 9223).
//
// Types into ONE scratch block on a scratch page ("svy-theme typing bench") opened in the
// right sidebar, with the user's page left in the main view. Keys are real CDP
// Input.dispatchKeyEvent events, so Roam's own editor handles them. Each run types a
// sentence and then deletes it with the same number of Backspaces, so the block ends empty.
//
// Per key, in the page: keydown timeStamp -> end of the next frame (a MessageChannel task
// posted from requestAnimationFrame runs after that frame's style, layout, and paint),
// and scheduled key time -> end of frame on the wall clock, which includes queueing when
// keys arrive faster than the page can take them (the fast-typing case).
// Per arm: Performance.getMetrics deltas (style, layout, script, task) divided by keys.
//
// Guard: while a run is active, a capture keydown listener cancels and aborts on any key
// whose target is not the scratch textarea, and on a Backspace into an empty block (Roam
// would merge the block into its sibling). The driver also checks focus before each run.
//
// Usage:
//   CDP_PORT=9223 node tools/typing-bench.mjs --arm off --arm live --arm "cdm=cdm.css#roamjs-custom-dark-theme"
//     [--blocks 6 --interval 30 --text "..." --json --cleanup]
// Arms: `off` (theme sheets disabled), `live` (loaded theme sheets), or
// `name=file.css[+file2.css][#class1.class2]` (theme sheets off, files injected, classes
// added to <html> and <body> while the arm runs). A `!nojs` suffix on any arm detaches the
// live theme's document/window typing listeners for that arm (restored afterwards);
// `--jsoff` does the same for `off`.
import { readFile } from "node:fs/promises";

const PORT = process.env.CDP_PORT || 9223;
const LIVE_SHEET_IDS = ["plugin-style-https://svyk.github.io/svy-theme/", "svy-theme-vars"];
const PAGE_TITLE = "svy-theme typing bench";
const DEFAULT_TEXT = "the quick brown fox jumps over the lazy dog ";

function parseArgs(argv) {
  const options = {
    target: "Svy - ",
    arms: [],
    blocks: 6,
    interval: 30,
    settle: 700,
    warmup: 6,
    text: DEFAULT_TEXT,
    json: false,
    cleanup: false,
    jsoff: false,
    profile: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--target") { options.target = value; index += 1; }
    else if (flag === "--arm") { options.arms.push(value); index += 1; }
    else if (flag === "--blocks") { options.blocks = Number(value); index += 1; }
    else if (flag === "--interval") { options.interval = Number(value); index += 1; }
    else if (flag === "--settle") { options.settle = Number(value); index += 1; }
    else if (flag === "--warmup") { options.warmup = Number(value); index += 1; }
    else if (flag === "--text") { options.text = value; index += 1; }
    else if (flag === "--profile") { options.profile = value; index += 1; }
    else if (flag === "--json") options.json = true;
    else if (flag === "--cleanup") options.cleanup = true;
    else if (flag === "--jsoff") options.jsoff = true;
    else throw new Error(`unknown flag ${flag}`);
  }
  if (!options.arms.length) options.arms = ["off", "live"];
  if (!/^[a-z ]+$/.test(options.text)) throw new Error("--text must be lowercase letters and spaces only");
  return options;
}

async function resolveArm(rawSpec, jsoff) {
  const nojs = rawSpec.endsWith("!nojs");
  const spec = nojs ? rawSpec.slice(0, -"!nojs".length) : rawSpec;
  if (spec === "off") return { name: "off", live: false, styles: [], classes: [], nojs: nojs || jsoff };
  if (spec === "live") return { name: nojs ? "live-nojs" : "live", live: true, styles: [], classes: [], nojs };
  const [name, rest] = spec.split("=");
  if (!rest) throw new Error(`arm ${spec} needs name=file.css`);
  const [files, classList = ""] = rest.split("#");
  const styles = await Promise.all(files.split("+").filter(Boolean).map((file) => readFile(file, "utf8")));
  return { name, live: false, styles, classes: classList.split(".").filter(Boolean), nojs };
}

async function connect(target) {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const page = targets.find((entry) => entry.type === "page" && (entry.title || "").includes(target));
  if (!page) throw new Error(`no page target with a title containing ${JSON.stringify(target)}`);
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 1;
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    const onMessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      socket.removeEventListener("message", onMessage);
      if (message.error) reject(new Error(`${method}: ${JSON.stringify(message.error)}`));
      else resolve(message.result);
    };
    socket.addEventListener("message", onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (fn, arg) => {
    const expression = `(${fn.toString()})(${JSON.stringify(arg ?? null)})`;
    const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(JSON.stringify(result.exceptionDetails.exception?.description || result.exceptionDetails).slice(0, 1500));
    }
    return result.result.value;
  };
  return { page, socket, call, evaluate };
}

// ---- page-side functions (serialized; no closures over this module) ----

async function pageSetup({ title }) {
  const api = window.roamAlphaAPI;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let pageUid = api.q(`[:find ?u . :where [?p :node/title "${title}"] [?p :block/uid ?u]]`);
  let createdPage = false;
  if (!pageUid) {
    pageUid = api.util.generateUID();
    await api.data.page.create({ page: { title, uid: pageUid } });
    createdPage = true;
  }
  const children = api.q(`[:find [?u ...] :where [?p :block/uid "${pageUid}"] [?p :block/children ?c] [?c :block/uid ?u]]`) || [];
  let blockUid = children[0];
  if (!blockUid) {
    blockUid = api.util.generateUID();
    await api.data.block.create({ location: { "parent-uid": pageUid, order: 0 }, block: { string: "", uid: blockUid } });
  }
  const text = api.q(`[:find ?s . :where [?b :block/uid "${blockUid}"] [?b :block/string ?s]]`) || "";
  if (text !== "") await api.data.block.update({ block: { uid: blockUid, string: "" } });
  const windowId = `sidebar-outline-${pageUid}`;
  const sidebarWasOpen = Boolean(document.querySelector("#right-sidebar .sidebar-content"));
  const hadWindow = api.ui.rightSidebar.getWindows().some((entry) => entry["window-id"] === windowId);
  if (!hadWindow) await api.ui.rightSidebar.addWindow({ window: { type: "outline", "block-uid": pageUid } });
  await sleep(600);
  window.__svyTypeBench = { pageUid, blockUid, windowId, createdPage, sidebarWasOpen, hadWindow };
  return window.__svyTypeBench;
}

async function pageFocus() {
  const bench = window.__svyTypeBench;
  const expectedId = `block-input-${bench.windowId}-${bench.blockUid}`;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (document.activeElement?.id === expectedId) break;
    await window.roamAlphaAPI.ui.setBlockFocusAndSelection({
      location: { "block-uid": bench.blockUid, "window-id": bench.windowId },
    });
    await sleep(300);
  }
  const active = document.activeElement;
  return { ok: active?.id === expectedId, id: active?.id || "", value: active?.value ?? null };
}

function pageInstallProbe() {
  const bench = window.__svyTypeBench;
  if (bench.probe) return true;
  const channel = new MessageChannel();
  const pending = [];
  channel.port1.onmessage = () => {
    const record = pending.shift();
    if (record) {
      record.end = performance.now();
      record.endEpoch = Date.now();
    }
  };
  const probe = { armed: false, running: false, aborted: null, records: [], events: [], textarea: null };
  // Event Timing: presentation-inclusive duration (8 ms granularity, >= 16 ms reported).
  const observer = new PerformanceObserver((list) => {
    if (!probe.running) return;
    for (const entry of list.getEntries()) {
      if (entry.name === "keydown") probe.events.push(entry.duration);
    }
  });
  observer.observe({ type: "event", durationThreshold: 16 });
  // Armed from start to stop, so once a run aborts every later bench key is still
  // swallowed until the driver stops.
  const onKeyDown = (event) => {
    if (!probe.armed) return;
    const textarea = probe.textarea;
    const foreign = event.target !== textarea;
    const unsafeBackspace = event.key === "Backspace" && textarea && textarea.value === "";
    if (!probe.running || foreign || unsafeBackspace) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (probe.running) {
        probe.aborted = foreign ? `foreign keydown on ${event.target?.tagName}#${event.target?.id}` : "backspace into empty block";
        probe.running = false;
      }
      return;
    }
    const record = { start: event.timeStamp, key: event.key, raf: 0, end: 0, endEpoch: 0 };
    probe.records.push(record);
    requestAnimationFrame(() => {
      record.raf = performance.now();
      pending.push(record);
      channel.port2.postMessage(0);
    });
  };
  window.addEventListener("keydown", onKeyDown, true);
  probe.dispose = () => {
    window.removeEventListener("keydown", onKeyDown, true);
    observer.disconnect();
  };
  bench.probe = probe;
  return true;
}

function pageArmSheets({ arms, liveIds }) {
  const bench = window.__svyTypeBench;
  if (bench.sheets) return true;
  const live = liveIds.map((id) => document.getElementById(id)).filter(Boolean);
  const liveBefore = live.map((element) => element.sheet.disabled);
  const injected = arms.map((arm, armIndex) => arm.styles.map((css, styleIndex) => {
    const element = document.createElement("style");
    element.id = `svy-type-bench-${armIndex}-${styleIndex}`;
    element.textContent = css;
    document.head.appendChild(element);
    element.sheet.disabled = true;
    return element;
  }));
  bench.sheets = { live, liveBefore, injected, arms, classes: [] };
  return live.length;
}

function pageSelectArm(armIndex) {
  const { sheets } = window.__svyTypeBench;
  const arm = sheets.arms[armIndex];
  for (const cls of sheets.classes) {
    document.documentElement.classList.remove(cls);
    document.body.classList.remove(cls);
  }
  sheets.live.forEach((element) => { element.sheet.disabled = !arm.live; });
  sheets.injected.forEach((elements, index) => elements.forEach((element) => { element.sheet.disabled = index !== armIndex; }));
  for (const cls of arm.classes) {
    document.documentElement.classList.add(cls);
    document.body.classList.add(cls);
  }
  sheets.classes = arm.classes;
  document.documentElement.getBoundingClientRect();
  return true;
}

function pageStartRun() {
  const bench = window.__svyTypeBench;
  const expectedId = `block-input-${bench.windowId}-${bench.blockUid}`;
  const textarea = document.activeElement;
  if (textarea?.id !== expectedId) return { ok: false, reason: `focus is on ${textarea?.tagName}#${textarea?.id}` };
  if (textarea.value !== "") return { ok: false, reason: `scratch block is not empty: ${JSON.stringify(textarea.value)}` };
  bench.probe.textarea = textarea;
  bench.probe.records = [];
  bench.probe.events = [];
  bench.probe.aborted = null;
  bench.probe.running = true;
  bench.probe.armed = true;
  const rect = textarea.getBoundingClientRect();
  return { ok: true, x: rect.left + Math.min(40, rect.width / 2), y: rect.top + rect.height / 2 };
}

async function pageStopRun() {
  const { probe } = window.__svyTypeBench;
  // Let the last frame finish before reading.
  await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 50)));
  probe.running = false;
  probe.armed = false;
  const records = probe.records.map((record) => ({
    key: record.key,
    latency: record.end ? record.end - record.start : null,
    endEpoch: record.endEpoch || null,
    toRaf: record.raf ? record.raf - record.start : null,
  }));
  return { aborted: probe.aborted, records, events: probe.events.slice(), value: probe.textarea?.value ?? null };
}

async function pageTeardown({ cleanup }) {
  const bench = window.__svyTypeBench;
  if (!bench) return { restored: false };
  const api = window.roamAlphaAPI;
  if (bench.probe) { bench.probe.running = false; bench.probe.armed = false; bench.probe.dispose(); }
  if (bench.sheets) {
    for (const cls of bench.sheets.classes) {
      document.documentElement.classList.remove(cls);
      document.body.classList.remove(cls);
    }
    bench.sheets.live.forEach((element, index) => { element.sheet.disabled = bench.sheets.liveBefore[index]; });
    bench.sheets.injected.flat().forEach((element) => element.remove());
  }
  const summary = { restored: true };
  document.activeElement?.blur?.();
  if (cleanup) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (!bench.hadWindow) {
      await api.ui.rightSidebar.removeWindow({ window: { type: "outline", "block-uid": bench.pageUid } }).catch(() => {});
    }
    if (!bench.sidebarWasOpen) await api.ui.rightSidebar.close().catch(() => {});
    if (bench.createdPage) {
      const result = await api.data.page.delete({ page: { uid: bench.pageUid } });
      summary.deletedPage = result ?? true;
    }
  }
  delete window.__svyTypeBench;
  return summary;
}

// Detach / re-attach the live theme's document and window listeners (the `--jsoff` arm).
const THEME_LISTENER_MARKERS = [
  "isTextTarget(event.target)) show(",
  "ensureAttached();",
  "if (target) render();",
  "if (lifecycle.disposed || !enabled) return;",
];

async function themeListeners(call) {
  const found = [];
  for (const expression of ["document", "window"]) {
    const { result } = await call("Runtime.evaluate", { expression, objectGroup: "svy-bench" });
    const { listeners } = await call("DOMDebugger.getEventListeners", { objectId: result.objectId });
    for (const listener of listeners) {
      const source = listener.handler?.description || "";
      if (THEME_LISTENER_MARKERS.some((marker) => source.includes(marker))) {
        found.push({ targetId: result.objectId, type: listener.type, useCapture: listener.useCapture, handlerId: listener.handler.objectId });
      }
    }
  }
  return found;
}

async function setThemeListeners(call, listeners, attach) {
  for (const listener of listeners) {
    await call("Runtime.callFunctionOn", {
      objectId: listener.targetId,
      functionDeclaration: `function (type, handler, capture) { this.${attach ? "addEventListener" : "removeEventListener"}(type, handler, capture); }`,
      arguments: [{ value: listener.type }, { objectId: listener.handlerId }, { value: listener.useCapture }],
    });
  }
}

// ---- key driver ----

function keyParams(character) {
  if (character === "Backspace") {
    return { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 };
  }
  if (character === " ") {
    return { key: " ", code: "Space", text: " ", unmodifiedText: " ", windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 };
  }
  const upper = character.toUpperCase();
  return {
    key: character,
    code: `Key${upper}`,
    text: character,
    unmodifiedText: character,
    windowsVirtualKeyCode: upper.charCodeAt(0),
    nativeVirtualKeyCode: upper.charCodeAt(0),
  };
}

// Returns each key's scheduled wall-clock time. The driver waits for the renderer to
// accept each key, so when the page falls behind, later keys go out late; pairing the
// page's end-of-frame wall clock with the SCHEDULED time counts that queueing as
// latency, the way a keyboard's key still waits in the input queue.
async function typeKeys(call, evaluate, keys, interval) {
  const start = performance.now();
  const startEpoch = Date.now();
  const scheduled = keys.map((_, index) => startEpoch + index * interval);
  for (let index = 0; index < keys.length; index += 1) {
    if (index % 8 === 7) {
      const running = await evaluate(() => Boolean(window.__svyTypeBench?.probe?.running));
      if (!running) return scheduled;
    }
    const due = start + index * interval;
    const wait = due - performance.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    const params = keyParams(keys[index]);
    await call("Input.dispatchKeyEvent", { type: params.text ? "keyDown" : "rawKeyDown", ...params });
    await call("Input.dispatchKeyEvent", { type: "keyUp", ...params, text: undefined, unmodifiedText: undefined });
  }
  return scheduled;
}

async function metrics(call) {
  const { metrics: list } = await call("Performance.getMetrics");
  return Object.fromEntries(list.map((entry) => [entry.name, entry.value]));
}

// ---- stats ----

function quantile(sorted, q) {
  if (!sorted.length) return NaN;
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

// ---- main ----

const options = parseArgs(process.argv.slice(2));
const arms = await Promise.all(options.arms.map((spec) => resolveArm(spec, options.jsoff)));
const { page, socket, call, evaluate } = await connect(options.target);
const sentence = [...options.text];
const runKeys = [...sentence, ...sentence.map(() => "Backspace")];
const warmKeys = [..."warm ".slice(0, Math.max(1, Math.floor(options.warmup / 2)))];
const warmupKeys = [...warmKeys, ...warmKeys.map(() => "Backspace")];
const samples = arms.map(() => []);
const eventSamples = arms.map(() => []);
const queued = arms.map(() => []);
const perKey = arms.map(() => ({ keys: 0, RecalcStyleDuration: 0, LayoutDuration: 0, ScriptDuration: 0, TaskDuration: 0, RecalcStyleCount: 0, LayoutCount: 0 }));
let listeners = [];
let detached = false;
let aborted = null;
let profile = null;

try {
  await call("Performance.enable", { timeDomain: "timeTicks" });
  await call("Emulation.setFocusEmulationEnabled", { enabled: true });
  const setup = await evaluate(pageSetup, { title: PAGE_TITLE });
  await evaluate(pageInstallProbe);
  const liveFound = await evaluate(pageArmSheets, { arms, liveIds: LIVE_SHEET_IDS });
  if (arms.some((arm) => arm.nojs)) listeners = await themeListeners(call);
  if (!options.json) {
    process.stdout.write(`${page.title} | scratch ${setup.pageUid}/${setup.blockUid} | live sheets ${liveFound} | theme listeners ${listeners.length}\n`);
  }
  if (options.profile) {
    await call("Profiler.enable");
    await call("Profiler.setSamplingInterval", { interval: 100 });
  }

  outer: for (let block = 0; block < options.blocks; block += 1) {
    const order = arms.map((_, index) => index);
    for (let index = order.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [order[index], order[swap]] = [order[swap], order[index]];
    }
    for (const armIndex of order) {
      const arm = arms[armIndex];
      const wantDetached = arm.nojs;
      if (wantDetached !== detached) {
        await setThemeListeners(call, listeners, !wantDetached);
        detached = wantDetached;
      }
      await evaluate(pageSelectArm, armIndex);
      await new Promise((resolve) => setTimeout(resolve, options.settle));
      const focus = await evaluate(pageFocus);
      if (!focus.ok) { aborted = `could not focus the scratch block (focus on ${focus.id})`; break outer; }
      let started = await evaluate(pageStartRun);
      if (!started.ok) { aborted = started.reason; break outer; }
      await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: started.x, y: started.y });
      await typeKeys(call, evaluate, warmupKeys, options.interval);
      let stopped = await evaluate(pageStopRun);
      if (stopped.aborted) { aborted = stopped.aborted; break outer; }
      started = await evaluate(pageStartRun);
      if (!started.ok) { aborted = started.reason; break outer; }
      const profiling = options.profile === arm.name;
      if (profiling) await call("Profiler.start");
      const before = await metrics(call);
      const scheduled = await typeKeys(call, evaluate, runKeys, options.interval);
      stopped = await evaluate(pageStopRun);
      const after = await metrics(call);
      if (profiling) {
        const { profile: taken } = await call("Profiler.stop");
        profile = profile || [];
        profile.push(taken);
      }
      if (stopped.aborted) { aborted = stopped.aborted; break outer; }
      if (stopped.value !== "") { aborted = `scratch block not empty after run: ${JSON.stringify(stopped.value)}`; break outer; }
      for (const record of stopped.records) if (record.latency != null) samples[armIndex].push(record.latency);
      stopped.records.forEach((record, index) => {
        if (record.endEpoch && scheduled[index]) queued[armIndex].push(record.endEpoch - scheduled[index]);
      });
      eventSamples[armIndex].push(...stopped.events);
      const cost = perKey[armIndex];
      cost.keys += stopped.records.length;
      for (const name of ["RecalcStyleDuration", "LayoutDuration", "ScriptDuration", "TaskDuration", "RecalcStyleCount", "LayoutCount"]) {
        cost[name] += (after[name] ?? 0) - (before[name] ?? 0);
      }
    }
  }
} finally {
  if (detached) await setThemeListeners(call, listeners, true).catch((error) => process.stderr.write(`reattach failed: ${error}\n`));
  await call("Runtime.releaseObjectGroup", { objectGroup: "svy-bench" }).catch(() => {});
  const teardown = await evaluate(pageTeardown, { cleanup: options.cleanup }).catch((error) => ({ error: String(error) }));
  await call("Emulation.setFocusEmulationEnabled", { enabled: false }).catch(() => {});
  if (!options.json) process.stdout.write(`teardown ${JSON.stringify(teardown)}\n`);
}

function summarizeProfile(profiles) {
  const byUrl = new Map();
  const byFunction = new Map();
  let total = 0;
  for (const taken of profiles) {
    const nodes = new Map(taken.nodes.map((node) => [node.id, node]));
    const deltas = taken.timeDeltas;
    for (let index = 0; index < taken.samples.length; index += 1) {
      const node = nodes.get(taken.samples[index]);
      const time = (deltas[index + 1] ?? 0) / 1000;
      total += time;
      const frame = node.callFrame;
      const url = frame.url || `(${frame.functionName || "native"})`;
      byUrl.set(url, (byUrl.get(url) || 0) + time);
      const key = `${frame.functionName || "(anon)"} ${url.split("/").slice(-2).join("/")}:${frame.lineNumber}`;
      byFunction.set(key, (byFunction.get(key) || 0) + time);
    }
  }
  const top = (map, count) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, count).map(([name, ms]) => ({ name, ms: +ms.toFixed(1) }));
  return { totalMs: +total.toFixed(1), byUrl: top(byUrl, 25), byFunction: top(byFunction, 30) };
}

socket.close();
const baseline = arms.findIndex((arm) => arm.name === "off");
const rows = arms.map((arm, index) => {
  const sorted = [...samples[index]].sort((a, b) => a - b);
  const cost = perKey[index];
  const per = (name) => (cost.keys ? +(cost[name] * (name.endsWith("Count") ? 1 : 1000) / cost.keys).toFixed(3) : null);
  const row = {
    arm: arm.name,
    n: sorted.length,
    median: +quantile(sorted, 0.5).toFixed(2),
    p75: +quantile(sorted, 0.75).toFixed(2),
    p95: +quantile(sorted, 0.95).toFixed(2),
    mean: sorted.length ? +(sorted.reduce((sum, value) => sum + value, 0) / sorted.length).toFixed(2) : null,
    queued: {
      median: +median(queued[index]).toFixed(1),
      p95: +quantile([...queued[index]].sort((a, b) => a - b), 0.95).toFixed(1),
      max: queued[index].length ? Math.max(...queued[index]) : null,
    },
    eventTiming: {
      n: eventSamples[index].length,
      median: +median(eventSamples[index]).toFixed(1),
      p75: +quantile([...eventSamples[index]].sort((a, b) => a - b), 0.75).toFixed(1),
    },
    perKey: {
      styleMs: per("RecalcStyleDuration"),
      layoutMs: per("LayoutDuration"),
      scriptMs: per("ScriptDuration"),
      taskMs: per("TaskDuration"),
      recalcs: per("RecalcStyleCount"),
      layouts: per("LayoutCount"),
    },
  };
  if (baseline >= 0 && index !== baseline && samples[index].length && samples[baseline].length) {
    const [low, high] = bootstrapDiff(samples[index], samples[baseline]);
    row.vsOff = +(row.median - median(samples[baseline])).toFixed(2);
    row.ci95 = [+low.toFixed(2), +high.toFixed(2)];
  }
  return row;
});
const output = { page: page.title, interval: options.interval, themeListeners: listeners.length, aborted, rows, profile: profile ? summarizeProfile(profile) : undefined };
if (options.json) process.stdout.write(`${JSON.stringify(output, null, 1)}\n`);
else {
  if (aborted) process.stdout.write(`ABORTED: ${aborted}\n`);
  process.stdout.write(`interval ${options.interval} ms | keydown -> end of next frame\n`);
  for (const row of rows) {
    const delta = row.vsOff == null ? "" : `  vs off ${row.vsOff >= 0 ? "+" : ""}${row.vsOff} [${row.ci95.join(", ")}]`;
    const p = row.perKey;
    process.stdout.write(`${row.arm.padEnd(10)} n=${row.n} median ${row.median} p75 ${row.p75} p95 ${row.p95} mean ${row.mean}${delta}\n`);
    process.stdout.write(`${"".padEnd(10)} per key: style ${p.styleMs} ms (${p.recalcs} recalcs) layout ${p.layoutMs} ms (${p.layouts}) script ${p.scriptMs} ms task ${p.taskMs} ms\n`);
    process.stdout.write(`${"".padEnd(10)} event timing (to paint): n=${row.eventTiming.n} median ${row.eventTiming.median} p75 ${row.eventTiming.p75}\n`);
    process.stdout.write(`${"".padEnd(10)} scheduled key -> frame end (queueing included): median ${row.queued.median} p95 ${row.queued.p95} max ${row.queued.max}\n`);
  }
  if (output.profile) process.stdout.write(`${JSON.stringify(output.profile, null, 1)}\n`);
}
