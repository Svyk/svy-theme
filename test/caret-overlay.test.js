import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BLOCK_CARET_CLASS,
  installCaretOverlay,
  isTextTarget,
  measureCaretRect,
  needsOverlay,
  supportsNativeCaretShape,
} from "../src/caret-overlay.js";
import { createLifecycle } from "../src/lifecycle.js";
import { BEAM_DEFAULTS, BEAM_SETTING_IDS, computeThemeVars } from "../src/theme-vars.js";

const BEAM_LAYER_URL = new URL("../src/css/40-beam.css", import.meta.url);

function fakeExtensionApi(initial = {}) {
  const store = new Map(Object.entries(initial));
  return { settings: { get: (key) => store.get(key) } };
}

function makeClassList() {
  const classes = new Set();
  return {
    add: (...names) => names.forEach((name) => classes.add(name)),
    remove: (...names) => names.forEach((name) => classes.delete(name)),
    contains: (name) => classes.has(name),
  };
}

// Minimal element: style bag, children, classList, removable. Offsets default to 0 —
// the geometry math is asserted in measureCaretRect's own tests with explicit values.
function makeElement(tag, ownerDocument) {
  const element = {
    tagName: tag.toUpperCase(),
    nodeType: 1,
    style: {},
    classList: makeClassList(),
    children: [],
    textContent: "",
    isConnected: true,
    offsetTop: 0,
    offsetLeft: 0,
    offsetWidth: 0,
    offsetHeight: 0,
    setAttribute(name, value) {
      (this.attributes ||= {})[name] = value;
    },
    getAttribute(name) {
      return this.attributes?.[name] ?? null;
    },
    appendChild(child) {
      this.children.push(child);
      child.parentElement = this;
      return child;
    },
    append(...nodes) {
      nodes.forEach((node) => this.appendChild(node));
    },
    remove() {
      this.isConnected = false;
      this.removed = true;
      const siblings = this.parentElement?.children;
      if (siblings) siblings.splice(siblings.indexOf(this), 1);
    },
    ownerDocument,
  };
  return element;
}

function createFakeWindow() {
  const listeners = [];
  return {
    listeners,
    addEventListener: (type, listener, options) => listeners.push({ type, listener, options }),
    removeEventListener() {},
    getComputedStyle: () =>
      new Proxy(
        { getPropertyValue: (name) => (name === "--svy-beam-caret" ? " #48d0c0" : "") },
        { get: (target, prop) => (prop in target ? target[prop] : "") },
      ),
  };
}

function createFakeDocument(win) {
  const listeners = new Map();
  const doc = {
    listeners,
    activeElement: null,
    created: [],
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
    fire(type, event) {
      listeners.get(type)?.(event);
    },
    createElement(tag) {
      const element = makeElement(tag, doc);
      doc.created.push(element);
      return element;
    },
  };
  doc.documentElement = makeElement("html", doc);
  doc.body = makeElement("body", doc);
  win.document = doc;
  return doc;
}

function makeTextarea(doc, value = "hello", selectionStart = value.length) {
  const element = makeElement("textarea", doc);
  element.value = value;
  element.selectionStart = selectionStart;
  element.scrollLeft = 0;
  element.scrollTop = 0;
  element.getBoundingClientRect = () => ({ left: 100, top: 50, right: 300, bottom: 80 });
  return element;
}

test("needsOverlay: only pack on + block shape + no native support", () => {
  assert.equal(needsOverlay({ pack: true, caretShape: "block", nativeSupported: false }), true);
  assert.equal(needsOverlay({ pack: false, caretShape: "block", nativeSupported: false }), false);
  assert.equal(needsOverlay({ pack: true, caretShape: "bar", nativeSupported: false }), false);
  assert.equal(needsOverlay({ pack: true, caretShape: "block", nativeSupported: true }), false);
});

test("supportsNativeCaretShape probes CSS.supports and tolerates its absence", () => {
  assert.equal(supportsNativeCaretShape({ supports: () => true }), true);
  assert.equal(supportsNativeCaretShape({ supports: () => false }), false);
  assert.equal(supportsNativeCaretShape(undefined), false);
});

test("isTextTarget covers textareas and text-like inputs only", () => {
  const doc = createFakeDocument(createFakeWindow());
  assert.equal(isTextTarget(makeElement("textarea", doc)), true);
  assert.equal(isTextTarget(makeElement("input", doc)), true);
  const password = makeElement("input", doc);
  password.setAttribute("type", "password");
  assert.equal(isTextTarget(password), false);
  const contenteditable = makeElement("div", doc);
  contenteditable.setAttribute("contenteditable", "true");
  assert.equal(isTextTarget(contenteditable), false);
  assert.equal(isTextTarget(null), false);
});

test("measureCaretRect converts mirror offsets to viewport coordinates", () => {
  const win = createFakeWindow();
  const doc = createFakeDocument(win);
  const textarea = makeTextarea(doc, "hello", 2);
  const rect = measureCaretRect(textarea, doc, win);
  // Mirror offsets are 0 in the fake, so the rect is the border-box origin.
  assert.equal(rect.x, 100);
  assert.equal(rect.y, 50);
  assert.equal(rect.glyph, "l");
  assert.equal(rect.visible, true);
  // The mirror must not leak into the document.
  assert.equal(doc.body.children.length, 0);
});

test("measureCaretRect reports an empty glyph at end of value", () => {
  const win = createFakeWindow();
  const doc = createFakeDocument(win);
  const rect = measureCaretRect(makeTextarea(doc, "hi", 2), doc, win);
  assert.equal(rect.glyph, "");
  assert.ok(rect.width > 0, "end-of-line still measures a cell width");
});

test("overlay stamps the suppression class on focus and clears it on blur", async () => {
  const win = createFakeWindow();
  const doc = createFakeDocument(win);
  const lifecycle = createLifecycle();
  const overlay = installCaretOverlay({
    extensionAPI: fakeExtensionApi(),
    lifecycle,
    doc,
    win,
    nativeSupported: false,
  });

  const textarea = makeTextarea(doc);
  doc.fire("focusin", { target: textarea });
  assert.equal(doc.documentElement.classList.contains(BLOCK_CARET_CLASS), true);
  assert.equal(overlay.active, true);
  assert.ok(doc.created.some((element) => element.style.position === "fixed"), "overlay element created");

  doc.fire("focusout", { target: textarea });
  // The blur path defers one task to outlive Roam's focus juggling.
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(doc.documentElement.classList.contains(BLOCK_CARET_CLASS), false);
  assert.equal(overlay.active, false);

  await lifecycle.dispose();
  assert.equal(doc.documentElement.classList.contains(BLOCK_CARET_CLASS), false);
});

test("overlay follows an already-focused target on refresh", () => {
  const win = createFakeWindow();
  const doc = createFakeDocument(win);
  const lifecycle = createLifecycle();
  const overlay = installCaretOverlay({
    extensionAPI: fakeExtensionApi(),
    lifecycle,
    doc,
    win,
    nativeSupported: false,
  });
  const textarea = makeTextarea(doc);
  doc.activeElement = textarea;
  overlay.refresh();
  assert.equal(overlay.active, true);
});

test("an explicit bar shape keeps the overlay off", () => {
  const win = createFakeWindow();
  const doc = createFakeDocument(win);
  installCaretOverlay({
    extensionAPI: fakeExtensionApi({ [BEAM_SETTING_IDS.caretShape]: "bar" }),
    lifecycle: createLifecycle(),
    doc,
    win,
    nativeSupported: false,
  });
  doc.fire("focusin", { target: makeTextarea(doc) });
  assert.equal(doc.documentElement.classList.contains(BLOCK_CARET_CLASS), false);
});

test("pack off keeps the overlay off", () => {
  const win = createFakeWindow();
  const doc = createFakeDocument(win);
  installCaretOverlay({
    extensionAPI: fakeExtensionApi({ [BEAM_SETTING_IDS.pack]: false }),
    lifecycle: createLifecycle(),
    doc,
    win,
    nativeSupported: false,
  });
  doc.fire("focusin", { target: makeTextarea(doc) });
  assert.equal(doc.documentElement.classList.contains(BLOCK_CARET_CLASS), false);
});

test("native caret-shape support makes the installer inert", () => {
  const win = createFakeWindow();
  const doc = createFakeDocument(win);
  const overlay = installCaretOverlay({
    extensionAPI: fakeExtensionApi(),
    lifecycle: createLifecycle(),
    doc,
    win,
    nativeSupported: true,
  });
  assert.equal(overlay.active, false);
  assert.doesNotThrow(() => overlay.refresh());
  doc.fire("focusin", { target: makeTextarea(doc) });
  assert.equal(doc.documentElement.classList.contains(BLOCK_CARET_CLASS), false);
});

test("install is a no-op without a DOM", () => {
  const overlay = installCaretOverlay({
    extensionAPI: fakeExtensionApi(),
    lifecycle: createLifecycle(),
    doc: undefined,
    win: undefined,
    nativeSupported: false,
  });
  assert.equal(overlay.active, false);
  assert.doesNotThrow(() => overlay.refresh());
});

test("regression: 40-beam.css delivers caret-shape: block on the text-target scope by default", async () => {
  const layer = await readFile(BEAM_LAYER_URL, "utf8");
  assert.match(layer, /caret-shape: var\(--svy-beam-caret-shape, block\) !important;/);
  assert.match(layer, /caret-animation: var\(--svy-beam-caret-animation, manual\) !important;/);
  // The overlay's native-caret suppression must exist and stay behind the pack gate.
  assert.match(layer, /:not\(\.svy-off-beam\)\.svy-block-caret[\s\S]*?caret-color: transparent !important;/);

  // The published default is block; an explicit bar setting must still publish bar.
  assert.equal(computeThemeVars(BEAM_DEFAULTS).base["--svy-beam-caret-shape"], "block");
  assert.equal(
    computeThemeVars({ ...BEAM_DEFAULTS, caretShape: "bar" }).base["--svy-beam-caret-shape"],
    "bar",
  );
});
