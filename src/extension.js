import { createLifecycle } from "./lifecycle.js";
import { installCaretOverlay } from "./caret-overlay.js";
import { installDarkSignalBridge } from "./dark-signal-bridge.js";
import { applyAppearance, installDarkModeToggle } from "./dm-toggle.js";
import { createSettingsPanel, initializeBeamSettings, initializeSettings } from "./settings.js";
import { installThemeVars } from "./theme-vars.js";

let activeLifecycle = null;

const THEME_ROOT_CLASS = "svy-theme";

export function installThemeMarker(lifecycle, doc = globalThis.document) {
  const root = doc?.documentElement;
  if (!root?.classList || !lifecycle?.add) return;
  root.classList.add(THEME_ROOT_CLASS);
  lifecycle.add(() => root.classList.remove(THEME_ROOT_CLASS));
}

export async function onload({ extensionAPI, extension }) {
  if (!extensionAPI) throw new TypeError("Roam did not provide extensionAPI");
  if (activeLifecycle) await activeLifecycle.dispose();

  const lifecycle = createLifecycle();
  activeLifecycle = lifecycle;
  try {
    installThemeMarker(lifecycle);
    await initializeSettings(extensionAPI);
    await initializeBeamSettings(extensionAPI);
    const themeVars = installThemeVars({ extensionAPI, lifecycle });
    const caretOverlay = installCaretOverlay({ extensionAPI, lifecycle });
    await lifecycle.settingsPanel(
      extensionAPI,
      createSettingsPanel({
        onAppearanceChange: (mode) => applyAppearance(mode),
        onThemeVarsChange: () => {
          themeVars.refresh();
          caretOverlay.refresh();
        },
      }),
    );
    await installDarkModeToggle({ extensionAPI, lifecycle });
    installDarkSignalBridge({ extensionAPI, lifecycle });
    console.info(`[svy-theme] Loaded v${extension?.version || "development"}`);
  } catch (error) {
    if (typeof globalThis.window !== "undefined") globalThis.window.__BP_LAST_ERROR = String(error?.stack || error);
    if (activeLifecycle === lifecycle) activeLifecycle = null;
    await lifecycle.dispose().catch((cleanupError) => {
      if (typeof globalThis.window !== "undefined") globalThis.window.__BP_LAST_ERROR = String(cleanupError?.stack || cleanupError);
      console.error(cleanupError);
    });
    throw error;
  }

  // Roam invokes this cleanup immediately before onunload.
  return async () => {
    if (activeLifecycle === lifecycle) activeLifecycle = null;
    await lifecycle.dispose();
  };
}

export async function onunload() {
  const lifecycle = activeLifecycle;
  activeLifecycle = null;
  if (lifecycle) await lifecycle.dispose();
  console.info("[svy-theme] Unloaded");
}

export default { onload, onunload };
