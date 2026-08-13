import { SETTING_IDS, normalizeMode } from "./settings.js";

// Dark signal bridge.
//
// Upstream's dark styling (src/css/00-upstream-base.css) only reacts to two signals:
// `.bp3-dark` on documentElement and the OS `prefers-color-scheme: dark` media query.
// Other dark markers used across the Roam ecosystem — Better Tasks' `body.bt-theme-dark`,
// Roam's own `body.roam-body.dark`, and `.rm-dark-theme` (stamped on html or body by
// some themes) — mean nothing to it, so on an OS-light machine any of those leaves the
// base layer rendering light while everything else is dark.
//
// This module bridges the gap: while bp-appearance is "auto" and any of those markers
// is present, it stamps `.bp3-dark` on documentElement, and removes the stamp when the
// markers disappear — but only ever a stamp IT placed (ownership flag below), so it
// never fights Roam, the user's explicit light/dark choice, or another extension.

// One settle pass after load: the initial sync runs before observers can deliver, and
// markers stamped by other extensions during their own onload land within this window.
const SETTLE_DELAY_MS = 1_000;

function hasClass(element, name) {
  return Boolean(element?.classList?.contains(name));
}

// True when any of the non-Blueprint dark markers is currently stamped.
export function detectDarkSignals(doc) {
  const body = doc?.body;
  const root = doc?.documentElement;
  return Boolean(
    hasClass(body, "bt-theme-dark") ||
    (hasClass(body, "roam-body") && hasClass(body, "dark")) ||
    hasClass(body, "rm-dark-theme") ||
    hasClass(root, "rm-dark-theme"),
  );
}

// The OS preference is itself a dark signal: Roam-core and other extensions that key
// only on .bp3-dark have no media-query fallback of their own, so in Auto with nothing
// else stamped they would stay light on a dark OS.
export function detectSystemPrefersDark(mediaQuery) {
  return Boolean(mediaQuery?.matches);
}

// Pure bridge decision, exported for tests: "stamp", "unstamp", or "none".
// Explicit appearance choices ("dark"/"light") short-circuit everything — the bridge
// exists to translate third-party signals in auto mode, never to override the user.
export function bridgeAction({ signalsPresent, appearance, bridgeStamped, rootHasDark, systemPrefersDark = false }) {
  if (normalizeMode(appearance) !== "auto") return "none";
  if (signalsPresent || systemPrefersDark) return rootHasDark ? "none" : "stamp";
  return bridgeStamped ? "unstamp" : "none";
}

export function installDarkSignalBridge({
  extensionAPI,
  lifecycle,
  doc = globalThis.document,
  ObserverImpl = globalThis.MutationObserver,
  settleDelayMs = SETTLE_DELAY_MS,
  win = globalThis.window,
  matchMedia,
}) {
  // No browser DOM (e.g. under node:test) or no observer support — nothing to bridge.
  if (!doc?.documentElement?.classList || !doc?.body || typeof ObserverImpl !== "function") return;

  // Missing matchMedia (node:test toggle path, old hosts) is fine: OS preference just
  // stops being a signal and the class-marker bridging below is unaffected.
  const mm = matchMedia ?? win?.matchMedia?.bind(win);
  const mql = typeof mm === "function" ? mm("(prefers-color-scheme: dark)") : null;

  let bridgeStamped = false;

  const sync = () => {
    const root = doc.documentElement;
    const action = bridgeAction({
      signalsPresent: detectDarkSignals(doc),
      systemPrefersDark: detectSystemPrefersDark(mql),
      appearance: extensionAPI.settings.get(SETTING_IDS.appearance),
      bridgeStamped,
      rootHasDark: hasClass(root, "bp3-dark"),
    });
    if (action === "stamp") {
      root.classList.add("bp3-dark");
      bridgeStamped = true;
    } else if (action === "unstamp") {
      root.classList.remove("bp3-dark");
      bridgeStamped = false;
    } else if (action === "none" && !hasClass(root, "bp3-dark")) {
      // Whatever stamp we placed is already gone (e.g. applyAppearance cleared it for an
      // explicit light choice): drop ownership so a later sync can't remove a class
      // someone else re-stamped.
      bridgeStamped = false;
    }
  };

  // Attribute-only, no subtree: the markers live on body/html themselves, and subtree
  // tracking would charge every class mutation anywhere in Roam's UI to our callback
  // (see ~/better-tasks/src/core/theme-observer.js for the same reasoning).
  const options = { attributes: true, attributeFilter: ["class"], subtree: false };
  lifecycle.observer(new ObserverImpl(sync), doc.body, options);
  lifecycle.observer(new ObserverImpl(sync), doc.documentElement, options);

  // Re-sync when the OS preference flips. addListener is the pre-2023 Safari API.
  if (mql) {
    const onMediaChange = () => sync();
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onMediaChange);
      lifecycle.add(() => mql.removeEventListener("change", onMediaChange));
    } else if (typeof mql.addListener === "function") {
      mql.addListener(onMediaChange);
      lifecycle.add(() => mql.removeListener(onMediaChange));
    }
  }

  // Initial pass covers markers already stamped before this extension loaded; the settle
  // timer covers markers stamped by extensions loading after us (both fire observer
  // callbacks too — the timer only guards a stamp that races observer delivery).
  sync();
  lifecycle.timeout(sync, settleDelayMs);
}
