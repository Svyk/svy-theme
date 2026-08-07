export const SETTING_IDS = Object.freeze({
  appearance: "bp-appearance",
});

export const APPEARANCE_MODES = Object.freeze(["auto", "dark", "light"]);
const DEFAULT_APPEARANCE = "auto";

// Upstream (rcvd/blueprint's dm-toggle.ts) stores this setting capitalized:
// "Auto" / "Dark" / "Light". Roam extension settings sync through the graph, so a user
// migrating from upstream to this fork can already have e.g. bp-appearance: "Dark"
// synced in. Normalize case-insensitively so a legacy value is honored instead of
// silently falling back to "auto" (junk/non-string input also falls back to "auto").
// Lowercase is the canonical stored form going forward.
export function normalizeMode(value) {
  if (typeof value !== "string") return DEFAULT_APPEARANCE;
  const lowered = value.toLowerCase();
  return APPEARANCE_MODES.includes(lowered) ? lowered : DEFAULT_APPEARANCE;
}

export async function initializeSettings(extensionAPI) {
  if (extensionAPI.settings.canSet === false) return;

  const raw = extensionAPI.settings.get(SETTING_IDS.appearance);
  if (raw == null) {
    await extensionAPI.settings.set(SETTING_IDS.appearance, DEFAULT_APPEARANCE);
    return;
  }

  const normalized = normalizeMode(raw);
  if (raw !== normalized) {
    // One-time migration: canonicalize a legacy/mixed-case stored value (e.g. upstream's
    // "Dark") to this fork's lowercase canonical form. After this write, `raw` will equal
    // `normalized` on every future load, so this only fires once per stale value.
    await extensionAPI.settings.set(SETTING_IDS.appearance, normalized);
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
