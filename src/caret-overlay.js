// Block-caret overlay — the Chrome < 144 path for the fat caret.
//
// Why this module exists: 40-beam.css asks for the block caret with
// `caret-shape: var(--svy-beam-caret-shape, block)`, but caret-shape only shipped in
// Chrome 144. The Roam desktop app runs Electron with Chrome 140, where the declaration
// is dropped (CSS.supports("caret-shape", "block") === false) and the browser draws its
// native thin bar — the 2026-08-07 "thin teal bar" report. Beam v1 had the same
// declaration and the same silent dependency on the experimental flag.
//
// What it does: while the beam pack is on, the caret shape setting is "block", and the
// browser cannot render caret-shape natively, this module tracks the focused text target
// (Roam mounts exactly one edit textarea per block) and paints a solid block the size of
// the character under the insertion point, with that character re-drawn inside in the
// surface colour — the reverse-video treatment native block carets get. The native caret
// is suppressed by stamping .svy-block-caret on <html>, which 40-beam.css turns into
// `caret-color: transparent` on the same text-target scope.
//
// The moment the host browser supports caret-shape (Chrome 144+, or the experimental
// flag on), supportsNativeCaretShape flips and the overlay steps aside: no class, no
// element, and the CSS declaration takes over unchanged. The setting "bar" means the
// user asked for the thin caret, so the overlay stays off there too.

import {
  BEAM_DEFAULTS,
  BEAM_SETTING_IDS,
  normalizeChoice,
  normalizeSwitch,
  CARET_SHAPES,
} from "./theme-vars.js";

// Class contract with src/css/40-beam.css: present on <html> exactly while the overlay
// is painting, so the native caret never doubles the overlay.
export const BLOCK_CARET_CLASS = "svy-block-caret";

// Zero-width space marker: sits at the insertion point inside the mirror so its offset
// box is the caret rectangle.
const MARKER_CHAR = "\u200b";

// Native blink cadence, used only when the caret-blink setting is on. The default
// (caret-animation: manual) keeps the block steady.
const BLINK_PERIOD_MS = 530;

// Box and text properties the mirror needs so text reflows identically to the textarea.
// Width and padding come from the live computed style; height stays auto so wrapped
// content grows the same way the textarea's content does.
const MIRROR_PROPERTIES = Object.freeze([
  "boxSizing",
  "width",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontVariant",
  "letterSpacing",
  "textTransform",
  "textIndent",
  "lineHeight",
  "tabSize",
  "direction",
]);

// Overlay is only meaningful where a native caret exists: text-entry inputs and
// textareas. Roam's block editor is a textarea.rm-block-input; contenteditable is
// excluded deliberately — Roam never edits blocks in one, and a collapsed-Range rect
// path would double the surface for zero coverage.
export function isTextTarget(element) {
  if (!element || !element.tagName) return false;
  if (element.tagName === "TEXTAREA") return true;
  if (element.tagName !== "INPUT") return false;
  const type = (element.getAttribute?.("type") || "text").toLowerCase();
  return ["text", "search", "url", "tel", "email", "number"].includes(type);
}

// True when the browser renders caret-shape itself. Injectable for tests: the whole
// module hinges on this one probe.
export function supportsNativeCaretShape(css = globalThis.CSS) {
  return Boolean(css?.supports?.("caret-shape", "block"));
}

// Pure gating decision, exported for tests. The overlay is a fallback, not a feature:
// it runs only where the CSS declaration cannot.
export function needsOverlay({ pack, caretShape, nativeSupported }) {
  return Boolean(pack) && caretShape === "block" && !nativeSupported;
}

// Viewport-space caret rectangle for a textarea/input, measured by replaying its text
// up to the insertion point into an offscreen mirror element with identical box metrics.
// Pure DOM math, no theme knowledge — kept separate from the installer so the geometry
// can be unit-tested with a stubbed mirror.
export function measureCaretRect(element, doc, win) {
  const computed = win.getComputedStyle(element);
  const mirror = doc.createElement("div");
  const style = mirror.style;
  style.position = "absolute";
  style.top = "0";
  style.left = "-99999px";
  style.visibility = "hidden";
  style.height = "auto";
  style.whiteSpace = "pre-wrap";
  style.overflowWrap = "break-word";
  for (const name of MIRROR_PROPERTIES) style[name] = computed[name];

  const value = element.value ?? "";
  const start = Math.min(element.selectionStart ?? value.length, value.length);
  // A newline or end-of-value under the caret has no glyph box; "0" measures the 1ch
  // cell a native block caret draws there.
  const underCaret = value[start] && value[start] !== "\n" ? value[start] : "0";
  const hasGlyph = underCaret !== "0" || value[start] === "0";

  mirror.textContent = value.slice(0, start);
  // Marker as an empty inline-block with vertical-align: top: its box top aligns with
  // the line box top, so offsetTop/offsetHeight describe the full line box — the
  // rectangle a native block caret covers — instead of the smaller font inline box.
  const marker = doc.createElement("span");
  const lineHeightPx =
    Number.parseFloat(computed.lineHeight) || Number.parseFloat(computed.fontSize) * 1.2 || 19;
  marker.style.display = "inline-block";
  marker.style.width = "0";
  marker.style.height = `${lineHeightPx}px`;
  marker.style.verticalAlign = "top";
  marker.textContent = MARKER_CHAR;
  mirror.appendChild(marker);
  const glyph = doc.createElement("span");
  glyph.textContent = underCaret;
  mirror.appendChild(glyph);
  (doc.body || doc.documentElement).appendChild(mirror);

  const fallbackHeight = lineHeightPx;
  const measured = {
    top: marker.offsetTop,
    left: marker.offsetLeft,
    height: marker.offsetHeight || fallbackHeight,
    width: glyph.offsetWidth || Number.parseFloat(computed.fontSize) * 0.6 || 8,
    glyph: hasGlyph ? underCaret : "",
  };
  mirror.remove();

  const box = element.getBoundingClientRect();
  const borderLeft = Number.parseFloat(computed.borderLeftWidth) || 0;
  const borderTop = Number.parseFloat(computed.borderTopWidth) || 0;
  const x = box.left + borderLeft + measured.left - (element.scrollLeft || 0);
  const y = box.top + borderTop + measured.top - (element.scrollTop || 0);

  // The native caret is clipped to the content box; an overlay that ignores that would
  // float outside a scrolled textarea. Report visibility so the caller can hide.
  const padLeft = Number.parseFloat(computed.paddingLeft) || 0;
  const padTop = Number.parseFloat(computed.paddingTop) || 0;
  const padRight = Number.parseFloat(computed.paddingRight) || 0;
  const padBottom = Number.parseFloat(computed.paddingBottom) || 0;
  const content = {
    left: box.left + borderLeft + padLeft,
    top: box.top + borderTop + padTop,
    right: box.right - borderLeft - padRight,
    bottom: box.bottom - borderTop - padBottom,
  };
  const visible =
    x + measured.width > content.left && x < content.right && y + measured.height > content.top && y < content.bottom;

  return { x, y, width: measured.width, height: measured.height, glyph: measured.glyph, visible };
}

// Effective surface colour behind the element: first non-transparent background walking
// up the ancestor chain, falling back to body. The reverse-video glyph is painted in
// this colour so the character under the block stays readable.
function surfaceColorBehind(element, win) {
  let node = element;
  while (node && node.nodeType === 1) {
    const color = win.getComputedStyle(node).backgroundColor;
    if (color && color !== "transparent" && color !== "rgba(0, 0, 0, 0)") return color;
    node = node.parentElement;
  }
  return win.getComputedStyle(win.document?.body || element).backgroundColor || "#ffffff";
}

export function installCaretOverlay({
  extensionAPI,
  lifecycle,
  doc = globalThis.document,
  win = globalThis.window,
  nativeSupported = supportsNativeCaretShape(),
} = {}) {
  const inert = { refresh() {}, get active() { return false; } };
  // No DOM (node:test without a fake) or native support already — nothing to install.
  if (!doc?.createElement || !doc?.documentElement?.classList || !win?.getComputedStyle) return inert;
  if (nativeSupported) return inert;

  const root = doc.documentElement;
  let enabled = false;
  let target = null;
  let overlay = null;
  let glyphNode = null;
  let blinkOn = false;
  let blinkVisible = true;
  let blinkTimer = null;

  const readSettings = () => {
    const get = (key) => extensionAPI?.settings?.get?.(key);
    return {
      pack: normalizeSwitch(get(BEAM_SETTING_IDS.pack), BEAM_DEFAULTS.pack),
      caretShape: normalizeChoice(get(BEAM_SETTING_IDS.caretShape), CARET_SHAPES, BEAM_DEFAULTS.caretShape),
      caretBlink: normalizeSwitch(get(BEAM_SETTING_IDS.caretBlink), BEAM_DEFAULTS.caretBlink),
    };
  };

  const hide = () => {
    target = null;
    root.classList.remove(BLOCK_CARET_CLASS);
    if (overlay) overlay.style.display = "none";
  };

  const render = () => {
    if (!enabled || !target || !overlay) return;
    // Roam can unmount the textarea mid-gesture (block switch, undo); a detached target
    // means the next focusin re-anchors us.
    if (!target.isConnected) {
      hide();
      return;
    }
    let rect;
    try {
      rect = measureCaretRect(target, doc, win);
    } catch {
      // Fail open: a frozen overlay with the native caret suppressed is the worst
      // possible state — drop the class so the native bar returns.
      hide();
      return;
    }
    if (!rect.visible) {
      overlay.style.display = "none";
      return;
    }
    const caretColor =
      win.getComputedStyle(root).getPropertyValue("--svy-beam-caret").trim() || "#00695e";
    overlay.style.display = "block";
    overlay.style.transform = `translate(${Math.round(rect.x)}px, ${Math.round(rect.y)}px)`;
    overlay.style.width = `${Math.max(1, Math.round(rect.width))}px`;
    overlay.style.height = `${Math.round(rect.height)}px`;
    overlay.style.backgroundColor = caretColor;
    overlay.style.opacity = blinkOn && !blinkVisible ? "0" : "1";

    if (glyphNode.textContent !== rect.glyph) {
      glyphNode.textContent = rect.glyph;
      if (rect.glyph) {
        const font = win.getComputedStyle(target);
        glyphNode.style.fontFamily = font.fontFamily;
        glyphNode.style.fontSize = font.fontSize;
        glyphNode.style.fontWeight = font.fontWeight;
        glyphNode.style.fontStyle = font.fontStyle;
        glyphNode.style.color = surfaceColorBehind(target, win);
      }
    }
    // The reverse-video glyph must share the caret's line box or its baseline drifts
    // below the block; pinned after the glyph branch so the textarea's own line-height
    // never clobbers it.
    glyphNode.style.lineHeight = `${Math.round(rect.height)}px`;
  };

  const show = (element) => {
    if (!enabled || !isTextTarget(element)) return;
    if (!overlay) {
      overlay = doc.createElement("div");
      overlay.setAttribute("aria-hidden", "true");
      const style = overlay.style;
      style.position = "fixed";
      style.top = "0";
      style.left = "0";
      style.zIndex = "900";
      style.pointerEvents = "none";
      style.borderRadius = "1px";
      style.display = "none";
      glyphNode = doc.createElement("span");
      glyphNode.style.display = "block";
      glyphNode.style.textAlign = "center";
      overlay.appendChild(glyphNode);
      lifecycle.node(overlay, doc.body || doc.documentElement);
    }
    target = element;
    root.classList.add(BLOCK_CARET_CLASS);
    render();
  };

  const onFocusIn = (event) => {
    if (enabled && isTextTarget(event.target)) show(event.target);
  };
  const onFocusOut = (event) => {
    if (event.target !== target) return;
    // Roam's dont-unfocus-block machinery can blur and refocus without a matching
    // focusin (observed live 2026-08-07: focusout fired, activeElement stayed on the
    // same textarea, no focusin ever followed). Decide after the focus dust settles:
    // whatever is a text target by then gets the overlay; anything else hides it.
    globalThis.setTimeout(() => {
      if (lifecycle.disposed || !enabled) return;
      const active = doc.activeElement;
      if (isTextTarget(active)) show(active);
      else hide();
    }, 0);
  };
  // Self-heal on any editing signal: if a text target holds focus but no overlay, the
  // focusin was swallowed — re-anchor instead of waiting for the user to refocus.
  const ensureAttached = () => {
    if (!enabled) return;
    const active = doc.activeElement;
    if (isTextTarget(active) && active !== target) show(active);
  };
  const onEdit = (event) => {
    ensureAttached();
    if (event.target === target) render();
  };
  const onSelectionChange = () => {
    ensureAttached();
    if (target && doc.activeElement === target) render();
  };
  const onScroll = () => {
    if (target) render();
  };

  // The blink timer exists only while a blinking overlay could actually paint — the
  // default is caret-animation: manual, so the common case carries no timer at all.
  const syncBlink = () => {
    const wanted = enabled && blinkOn;
    if (wanted && !blinkTimer) {
      blinkTimer = globalThis.setInterval(() => {
        if (target) {
          blinkVisible = !blinkVisible;
          render();
        }
      }, BLINK_PERIOD_MS);
    } else if (!wanted && blinkTimer) {
      globalThis.clearInterval(blinkTimer);
      blinkTimer = null;
    }
  };

  const apply = () => {
    const settings = readSettings();
    enabled = needsOverlay({ ...settings, nativeSupported });
    blinkOn = settings.caretBlink;
    if (!enabled) {
      hide();
      syncBlink();
      return;
    }
    syncBlink();
    if (isTextTarget(doc.activeElement)) show(doc.activeElement);
  };

  lifecycle.event(doc, "focusin", onFocusIn);
  lifecycle.event(doc, "focusout", onFocusOut);
  lifecycle.event(doc, "input", onEdit, true);
  lifecycle.event(doc, "selectionchange", onSelectionChange);
  lifecycle.event(win, "scroll", onScroll, true);
  lifecycle.event(win, "resize", onScroll);
  lifecycle.add(() => {
    if (blinkTimer) globalThis.clearInterval(blinkTimer);
    root.classList.remove(BLOCK_CARET_CLASS);
  });

  apply();
  return {
    refresh: apply,
    get active() {
      return Boolean(enabled && target);
    },
  };
}
