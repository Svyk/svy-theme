export const SETTING_IDS = Object.freeze({
  appearance: "bp-appearance",
});

export const APPEARANCE_MODES = Object.freeze(["auto", "dark", "light"]);
const DEFAULT_APPEARANCE = "auto";

export async function initializeSettings(extensionAPI) {
  if (
    extensionAPI.settings.canSet !== false
    && extensionAPI.settings.get(SETTING_IDS.appearance) == null
  ) {
    await extensionAPI.settings.set(SETTING_IDS.appearance, DEFAULT_APPEARANCE);
  }
}

export function createSettingsPanel({ onAppearanceChange } = {}) {
  return {
    tabTitle: "Blueprint (Svy fork)",
    settings: [
      {
        id: SETTING_IDS.appearance,
        name: "Appearance",
        description: "Light/dark mode for the Blueprint theme. Auto defers to Roam's own theme setting; the topbar toggle cycles the same three values.",
        action: {
          type: "select",
          items: [...APPEARANCE_MODES],
          onChange: (event) => {
            onAppearanceChange?.(event?.target?.value);
          },
        },
      },
    ],
  };
}
