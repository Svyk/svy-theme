import { normalizeSwitch } from "./theme-vars.js";

// Folded-bullet child-count cue.
//
// Roam's fold caret is opacity:0 even when .rm-caret-closed, and folded children are
// UNMOUNTED — .rm-block-children stays in the DOM holding only .rm-multibar at height 0.
// A CSS counter or :has(.rm-block-children > .roam-block-container) therefore cannot
// show a count; the number has to come from a read-only pull of [:block/children].
//
// .rm-block--closed is a superset signal (live probe: 11 --closed blocks vs 6
// --closed bullets, several --closed blocks pulling 0 children). Only
// .rm-bullet--closed means "has hidden children", so that class alone gates the stamp.
//
// The stamp is data-svy-cc on the block's .rm-caret. The CSS layer
// (src/css/42-fold-cc.css) paints it via content:attr() in the already-empty 16px
// caret slot, so showing/hiding the count never shifts layout. The teal ring on the
// closed bullet is pure CSS and stays on regardless of this setting.

export const FOLD_CC_SETTING_ID = "bp-fold-cc";
export const FOLD_CC_ATTR = "data-svy-cc";
export const FOLD_CC_DEFAULT = true;

const CHILD_COUNT_PATTERN = "[:block/children]";
const CLOSED_BULLET_SELECTOR = ":scope > .rm-block__self .rm-bullet--closed, :scope > .rm-block-main .rm-bullet--closed";
const CARET_SELECTOR = ":scope > .rm-block__self .rm-caret, :scope > .rm-block-main .rm-caret";
const BLOCK_CONTAINER_SELECTOR = ".roam-block-container, .rm-block";

// Kept separate from initializeBeamSettings so that seed order and writes stay
// byte-for-byte: get null -> seed true, already set -> no write, canSet false -> return.
export async function initializeFoldCcSettings(extensionAPI) {
  if (extensionAPI.settings.canSet === false) return;
  if (extensionAPI.settings.get(FOLD_CC_SETTING_ID) == null) {
    await extensionAPI.settings.set(FOLD_CC_SETTING_ID, FOLD_CC_DEFAULT);
  }
}

// Read-only pull; a missing uid, a missing pull, or a throw all count as 0.
export function childCount(uid, dataApi) {
  if (!uid || typeof dataApi?.pull !== "function") return 0;
  try {
    const info = dataApi.pull(CHILD_COUNT_PATTERN, [":block/uid", uid]);
    return (info?.[":block/children"] || []).length;
  } catch {
    return 0;
  }
}

// Stamp (or clear) the caret of one block container. Never pulls when there is no
// closed bullet — an open or --closed-bullet-less block just gets its attr removed.
export function stampClosedBlock(block, dataApi) {
  if (!block) return;
  const caret = block.querySelector?.(CARET_SELECTOR);
  if (!caret) return;
  const closedBullet = block.querySelector?.(CLOSED_BULLET_SELECTOR);
  if (!closedBullet) {
    caret.removeAttribute?.(FOLD_CC_ATTR);
    return;
  }
  const n = childCount(block.getAttribute?.("data-block-uid"), dataApi);
  if (n > 0) caret.setAttribute(FOLD_CC_ATTR, n > 99 ? "99+" : String(n));
  else caret.removeAttribute?.(FOLD_CC_ATTR);
}

function isBlockContainer(element) {
  return Boolean(element?.matches?.(BLOCK_CONTAINER_SELECTOR));
}

function isBullet(element) {
  return Boolean(element?.matches?.(".rm-bullet"));
}

function isElement(node) {
  return typeof node?.querySelectorAll === "function" && typeof node?.matches === "function";
}

export function installFoldCc({
  extensionAPI,
  lifecycle,
  doc = globalThis.document,
  ObserverImpl = globalThis.MutationObserver,
  dataApi = globalThis.roamAlphaAPI?.data,
} = {}) {
  // No browser DOM (node:test) or no observer support — nothing to stamp.
  if (!doc?.documentElement || !doc?.body || typeof ObserverImpl !== "function") {
    return { refresh() {}, get enabled() { return false; } };
  }

  const isEnabled = () => normalizeSwitch(extensionAPI?.settings?.get?.(FOLD_CC_SETTING_ID), FOLD_CC_DEFAULT);

  // While the setting is off the observer may still run, but a stamp must never set the
  // attr (and never pull) — it only clears whatever is there.
  const stamp = (block) => {
    if (isEnabled()) {
      stampClosedBlock(block, dataApi);
      return;
    }
    const caret = block.querySelector?.(CARET_SELECTOR);
    caret?.removeAttribute?.(FOLD_CC_ATTR);
  };

  // Whole-document passes are allowed only here (initial scan / refresh), never in the
  // mutation callback.
  const scanAll = () => {
    for (const bullet of doc.querySelectorAll(".rm-bullet--closed")) {
      const block = bullet.closest?.(BLOCK_CONTAINER_SELECTOR);
      if (block) stamp(block);
    }
  };

  const clearAll = () => {
    for (const element of doc.querySelectorAll(`[${FOLD_CC_ATTR}]`)) {
      element.removeAttribute?.(FOLD_CC_ATTR);
    }
  };

  const refresh = () => {
    if (isEnabled()) scanAll();
    else clearAll();
  };

  const onMutations = (mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        for (const node of mutation.addedNodes || []) {
          if (!isElement(node)) continue;
          // Never rescan doc: stamp the added block itself, or look only inside it.
          if (isBlockContainer(node)) {
            stamp(node);
          } else {
            for (const bullet of node.querySelectorAll(".rm-bullet--closed")) {
              const block = bullet.closest?.(BLOCK_CONTAINER_SELECTOR);
              if (block) stamp(block);
            }
          }
        }
      } else if (mutation.type === "attributes" && mutation.attributeName === "class") {
        const target = mutation.target;
        if (isBlockContainer(target)) {
          stamp(target);
        } else if (isBullet(target)) {
          const block = target.closest?.(BLOCK_CONTAINER_SELECTOR);
          if (block) stamp(block);
        }
        // Class mutations anywhere else (caret, row, etc.) are ignored.
      }
    }
  };

  lifecycle.observer(
    new ObserverImpl(onMutations),
    doc.body || doc.documentElement,
    { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] },
  );

  // Synchronous one-time scan of whatever is already folded at load.
  refresh();

  // On unload, hand the native UI back: remove every stamp we placed. Observer
  // disconnect is already owned by lifecycle.observer above.
  lifecycle.add(() => clearAll());

  return { refresh, get enabled() { return isEnabled(); } };
}
