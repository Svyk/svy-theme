// Svy Beam v3 caret renderer.
//
// CSS UI 4 exposes bar/block/underscore, but Roam's Electron build does not yet render
// caret-shape consistently and the platform API cannot express Svy's rounded beam,
// outline, sizing, glow, or behavior presets. One fixed, pointer-inert overlay therefore
// paints every custom style. Choosing `native` removes it completely. The renderer does
// no polling: it measures only on focus, edit, selection, scroll, resize, or settings
// changes, and all optional movement is compositor-friendly and Reduce-Motion aware.

import {
  BEAM_DEFAULTS,
  BEAM_SETTING_IDS,
  normalizeBeamConfig,
} from "./theme-vars.js";

// Kept for backwards compatibility with the v2 CSS/tests. The class now means “a custom
// Svy caret is painting”, not specifically “the selected style is a filled block”.
export const BLOCK_CARET_CLASS = "svy-block-caret";
export const CARET_OVERLAY_CLASS = "svy-caret-overlay-ui";
export const CARET_PING_CLASS = "svy-caret-ping";

const MARKER_CHAR = "\u200b";
const BLINK_PERIOD_MS = 530;

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

export function isTextTarget(element) {
  if (!element || !element.tagName) return false;
  if (element.tagName === "TEXTAREA") return true;
  if (element.tagName !== "INPUT") return false;
  const type = (element.getAttribute?.("type") || "text").toLowerCase();
  return ["text", "search", "url", "tel", "email", "number"].includes(type);
}

// Still exported as a useful capability probe, even though v3 deliberately renders its
// custom shapes on browsers with and without native caret-shape support.
export function supportsNativeCaretShape(css = globalThis.CSS) {
  return Boolean(css?.supports?.("caret-shape", "block"));
}

export function needsOverlay({ pack, caretShape }) {
  return Boolean(pack) && caretShape !== "native";
}

// Viewport-space caret rectangle for a textarea/input, measured by replaying its text up
// to the insertion point into an offscreen mirror with identical box metrics.
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
  const underCaret = value[start] && value[start] !== "\n" ? value[start] : "0";
  const hasGlyph = underCaret !== "0" || value[start] === "0";

  mirror.textContent = value.slice(0, start);
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

  const measured = {
    top: marker.offsetTop,
    left: marker.offsetLeft,
    height: marker.offsetHeight || lineHeightPx,
    width: glyph.offsetWidth || Number.parseFloat(computed.fontSize) * 0.6 || 8,
    glyph: hasGlyph ? underCaret : "",
  };
  mirror.remove();

  const box = element.getBoundingClientRect();
  const offsetW = element.offsetWidth || 0;
  const offsetH = element.offsetHeight || 0;
  const scaleX = offsetW ? box.width / offsetW : 1;
  const scaleY = offsetH ? box.height / offsetH : 1;
  const borderLeft = Number.parseFloat(computed.borderLeftWidth) || 0;
  const borderTop = Number.parseFloat(computed.borderTopWidth) || 0;
  const x = box.left + (borderLeft + measured.left - (element.scrollLeft || 0)) * scaleX;
  const y = box.top + (borderTop + measured.top - (element.scrollTop || 0)) * scaleY;

  const padLeft = Number.parseFloat(computed.paddingLeft) || 0;
  const padTop = Number.parseFloat(computed.paddingTop) || 0;
  const padRight = Number.parseFloat(computed.paddingRight) || 0;
  const padBottom = Number.parseFloat(computed.paddingBottom) || 0;
  const width = measured.width * scaleX;
  const height = measured.height * scaleY;
  const content = {
    left: box.left + (borderLeft + padLeft) * scaleX,
    top: box.top + (borderTop + padTop) * scaleY,
    right: box.right - (borderLeft + padRight) * scaleX,
    bottom: box.bottom - (borderTop + padBottom) * scaleY,
  };
  const visible =
    x + width > content.left &&
    x < content.right &&
    y + height > content.top &&
    y < content.bottom;

  return {
    x,
    y,
    width,
    height,
    glyph: measured.glyph,
    visible,
  };
}

const halfPixel = (value) => Math.round(value * 2) / 2;

// Convert the measured glyph cell into the selected visual. Width is style-relative:
// 100% is a 3px beam, 2px classic bar, or one glyph cell for block/outline/underline.
// Height is relative to the line box; underlines translate it into a restrained stroke.
export function computeCaretBox(rect, config) {
  const normalized = normalizeBeamConfig(config);
  const widthScale = normalized.caretWidth / 100;
  const heightScale = normalized.caretHeight / 100;
  const shape = normalized.caretShape;
  const cellWidth = Math.max(1, rect.width);
  const lineHeight = Math.max(1, rect.height);

  let width = cellWidth * widthScale;
  let height = Math.max(2, lineHeight * heightScale);
  let x = rect.x;
  let y = rect.y + (lineHeight - height) / 2;

  if (shape === "beam") {
    width = 3 * widthScale;
    x = rect.x - width / 2;
  } else if (shape === "bar") {
    width = 2 * widthScale;
    x = rect.x - width / 2;
  } else if (shape === "underline") {
    height = Math.max(2, Math.min(6, lineHeight * 0.16 * (normalized.caretHeight / 82)));
    y = rect.y + lineHeight - height;
  }

  width = Math.max(1, width);
  return {
    x: halfPixel(x),
    y: halfPixel(y),
    width: halfPixel(width),
    height: halfPixel(height),
    lineOffset: halfPixel(y - rect.y),
  };
}

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
  // Retained so older callers/tests need no signature change. Custom v3 styles render
  // identically regardless of native caret-shape support.
  nativeSupported = supportsNativeCaretShape(),
} = {}) {
  void nativeSupported;
  const inert = { refresh() {}, get active() { return false; } };
  if (!doc?.createElement || !doc?.documentElement?.classList || !win?.getComputedStyle) return inert;

  const root = doc.documentElement;
  const motionQuery = win.matchMedia?.("(prefers-reduced-motion: reduce)") || null;
  const motionReduced = () => Boolean(motionQuery?.matches);
  let config = BEAM_DEFAULTS;
  let enabled = false;
  let target = null;
  let overlay = null;
  let glyphNode = null;
  let blinkOn = false;
  let blinkVisible = true;
  let blinkTimer = null;
  let pingTimer = null;

  const readSettings = () => {
    const get = (key) => extensionAPI?.settings?.get?.(key);
    return normalizeBeamConfig(
      Object.fromEntries(Object.entries(BEAM_SETTING_IDS).map(([key, id]) => [key, get(id)])),
    );
  };

  const hide = () => {
    target = null;
    root.classList.remove(BLOCK_CARET_CLASS);
    if (overlay) overlay.style.display = "none";
  };

  const ensureOverlay = () => {
    if (overlay) return;
    overlay = doc.createElement("div");
    overlay.setAttribute("aria-hidden", "true");
    overlay.classList.add(CARET_OVERLAY_CLASS);
    const style = overlay.style;
    style.position = "fixed";
    style.top = "0";
    style.left = "0";
    style.zIndex = "900";
    style.pointerEvents = "none";
    style.boxSizing = "border-box";
    style.overflow = "hidden";
    style.display = "none";
    glyphNode = doc.createElement("span");
    glyphNode.style.display = "none";
    glyphNode.style.textAlign = "center";
    glyphNode.style.whiteSpace = "pre";
    overlay.appendChild(glyphNode);
    lifecycle.node(overlay, doc.body || doc.documentElement);
  };

  const render = () => {
    if (!enabled || !target || !overlay) return;
    if (!target.isConnected) {
      hide();
      return;
    }
    // A range selection has no insertion point. Keep the native caret suppressed, just
    // as the browser does, while leaving selection painting untouched.
    if (target.selectionEnd != null && target.selectionStart !== target.selectionEnd) {
      overlay.style.display = "none";
      return;
    }

    let rect;
    try {
      rect = measureCaretRect(target, doc, win);
    } catch {
      // Fail open: never strand a user with both the overlay and native caret hidden.
      hide();
      return;
    }
    if (!rect.visible) {
      overlay.style.display = "none";
      return;
    }

    const targetStyle = win.getComputedStyle(target);
    const rootStyle = win.getComputedStyle(root);
    const caretColor =
      targetStyle.getPropertyValue?.("--svy-beam-caret")?.trim() ||
      rootStyle.getPropertyValue?.("--svy-beam-caret")?.trim() ||
      BEAM_DEFAULTS.caretLight;
    const box = computeCaretBox(rect, config);
    const reduced = motionReduced();
    const behavior = reduced || blinkOn ? "steady" : config.caretBehavior;
    const radius = Math.min(config.caretRadius, box.width / 2, box.height / 2);

    overlay.setAttribute("data-shape", config.caretShape);
    overlay.setAttribute("data-glow", config.caretGlow);
    overlay.setAttribute("data-behavior", behavior);
    overlay.style.display = "block";
    overlay.style.transform = `translate(${box.x}px, ${box.y}px)`;
    overlay.style.width = `${box.width}px`;
    overlay.style.height = `${box.height}px`;
    overlay.style.borderRadius = `${radius}px`;
    overlay.style.opacity = blinkOn && !blinkVisible ? "0" : `${config.caretOpacity / 100}`;
    overlay.style.backgroundColor = config.caretShape === "outline" ? "transparent" : caretColor;
    overlay.style.border = config.caretShape === "outline" ? `1.5px solid ${caretColor}` : "0";
    overlay.style.setProperty?.("--svy-caret-overlay-color", caretColor);

    const paintsGlyph = config.caretShape === "block";
    glyphNode.style.display = paintsGlyph && rect.glyph ? "block" : "none";
    if (paintsGlyph && rect.glyph) {
      glyphNode.textContent = rect.glyph;
      glyphNode.style.fontFamily = targetStyle.fontFamily;
      glyphNode.style.fontSize = targetStyle.fontSize;
      glyphNode.style.fontWeight = targetStyle.fontWeight;
      glyphNode.style.fontStyle = targetStyle.fontStyle;
      glyphNode.style.color = surfaceColorBehind(target, win);
      glyphNode.style.lineHeight = `${rect.height}px`;
      glyphNode.style.transform = `translateY(${-box.lineOffset}px)`;
    }
  };

  const show = (element) => {
    if (!enabled || !isTextTarget(element)) return;
    ensureOverlay();
    target = element;
    root.classList.add(BLOCK_CARET_CLASS);
    render();
  };

  const ping = () => {
    if (!overlay || motionReduced()) return;
    if (config.caretBehavior !== "responsive" && config.caretBehavior !== "comet") return;
    overlay.classList.remove(CARET_PING_CLASS);
    // Force style resolution so rapid typing restarts the short feedback animation.
    void overlay.offsetWidth;
    overlay.classList.add(CARET_PING_CLASS);
    if (pingTimer) globalThis.clearTimeout(pingTimer);
    pingTimer = globalThis.setTimeout(() => {
      overlay?.classList.remove(CARET_PING_CLASS);
      pingTimer = null;
    }, 180);
  };

  const ensureAttached = () => {
    if (!enabled) return;
    const active = doc.activeElement;
    if (isTextTarget(active) && active !== target) show(active);
  };

  const onFocusIn = (event) => {
    if (enabled && isTextTarget(event.target)) show(event.target);
  };
  const onFocusOut = (event) => {
    if (event.target !== target) return;
    globalThis.setTimeout(() => {
      if (lifecycle.disposed || !enabled) return;
      const active = doc.activeElement;
      if (isTextTarget(active)) show(active);
      else hide();
    }, 0);
  };
  const onEdit = (event) => {
    ensureAttached();
    if (event.target === target) {
      blinkVisible = true;
      render();
      ping();
    }
  };
  const onSelectionChange = () => {
    ensureAttached();
    if (target && doc.activeElement === target) render();
  };
  const onScroll = () => {
    if (target) render();
  };

  const syncBlink = () => {
    const wanted = enabled && blinkOn && !motionReduced();
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
    if (!wanted) blinkVisible = true;
  };

  const apply = () => {
    config = readSettings();
    enabled = needsOverlay(config);
    blinkOn = config.caretBlink;
    syncBlink();
    if (!enabled) {
      hide();
      return;
    }
    if (isTextTarget(doc.activeElement)) show(doc.activeElement);
    else if (target) render();
  };

  lifecycle.event(doc, "focusin", onFocusIn);
  lifecycle.event(doc, "focusout", onFocusOut);
  lifecycle.event(doc, "input", onEdit, true);
  lifecycle.event(doc, "selectionchange", onSelectionChange);
  lifecycle.event(doc, "keyup", onSelectionChange, true);
  lifecycle.event(doc, "mouseup", onSelectionChange, true);
  lifecycle.event(win, "scroll", onScroll, true);
  lifecycle.event(win, "resize", onScroll);
  if (motionQuery?.addEventListener) lifecycle.event(motionQuery, "change", apply);
  lifecycle.add(() => {
    if (blinkTimer) globalThis.clearInterval(blinkTimer);
    if (pingTimer) globalThis.clearTimeout(pingTimer);
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
