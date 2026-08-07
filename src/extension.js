import { createLifecycle } from "./lifecycle.js";
import { applyAppearance, installDarkModeToggle } from "./dm-toggle.js";
import { createSettingsPanel, initializeBeamSettings, initializeSettings } from "./settings.js";
import { installThemeVars } from "./theme-vars.js";

let activeLifecycle = null;

export async function onload({ extensionAPI, extension }) {
  if (!extensionAPI) throw new TypeError("Roam did not provide extensionAPI");
  if (activeLifecycle) await activeLifecycle.dispose();

  const lifecycle = createLifecycle();
  activeLifecycle = lifecycle;
  try {
    await initializeSettings(extensionAPI);
    await initializeBeamSettings(extensionAPI);
    const themeVars = installThemeVars({ extensionAPI, lifecycle });
    await lifecycle.settingsPanel(
      extensionAPI,
      createSettingsPanel({
        onAppearanceChange: (mode) => applyAppearance(mode),
        onThemeVarsChange: () => themeVars.refresh(),
      }),
    );
    await installDarkModeToggle({ extensionAPI, lifecycle });
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
