import {
  BEAM_DEFAULTS,
  BEAM_SETTING_IDS,
  CURSOR_STYLES,
  LEGACY_CARET_LIGHT,
  normalizeHex,
} from "./theme-vars.js";

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

// Kept separate from initializeSettings so the bp-appearance default/migration path
// stays exactly what it was, byte for byte. Beam ids are seeded rather than left unset
// because Roam renders a switch row from the stored value: an unset "beam pack" row
// would show OFF while the stylesheet behaved as ON.
export async function initializeBeamSettings(extensionAPI) {
  if (extensionAPI.settings.canSet === false) return;

  for (const [key, id] of Object.entries(BEAM_SETTING_IDS)) {
    if (extensionAPI.settings.get(id) == null) {
      await extensionAPI.settings.set(id, BEAM_DEFAULTS[key]);
    }
  }

  // One-time migration: a graph that seeded the light caret before the contrast fix has
  // Beam v1's #008478 stored, which reads as an explicit user choice and would keep the
  // failing colour forever. Only the exact old default moves — compared through
  // normalizeHex so "#008478", "008478" and "#008478 " are all recognized as that colour,
  // while any other stored value, valid or junk, is left alone. After the write the stored
  // value is the new default, so this never fires twice.
  const storedLight = extensionAPI.settings.get(BEAM_SETTING_IDS.caretLight);
  if (normalizeHex(storedLight) === LEGACY_CARET_LIGHT) {
    await extensionAPI.settings.set(BEAM_SETTING_IDS.caretLight, BEAM_DEFAULTS.caretLight);
  }
}

export function createSettingsPanel({ onAppearanceChange, onThemeVarsChange } = {}) {
  const changed = () => { onThemeVarsChange?.(); };

  const settings = [
    {
      id: SETTING_IDS.appearance,
      name: "Appearance",
      description: "Auto follows your system (and Roam) and updates when it changes. Dark and Light stay put. The topbar control is labeled Auto, Dark, or Light — click it to cycle Auto → Dark → Light.",
      action: {
        type: "select",
        items: [...APPEARANCE_MODES],
        onChange: (event) => {
          onAppearanceChange?.(event?.target?.value);
        },
      },
    },
    {
      id: BEAM_SETTING_IDS.pack,
      name: "Svy Beam",
      description: "Master switch for the beam layer: caret color and custom cursors. Off restores Roam's native caret and cursors without a reload. Shaped carets live in Roam Caret.",
      action: { type: "switch", onChange: changed },
    },
    {
      id: BEAM_SETTING_IDS.caretLight,
      name: "Caret color (light)",
      description: "Hex color for the text insertion point in light mode, and the accent color of the light-mode cursors. Accepts #rgb or #rrggbb; anything else falls back to the default #00695E (APCA Lc 77.6 on the light surface).",
      action: { type: "input", placeholder: BEAM_DEFAULTS.caretLight, onChange: changed },
    },
    {
      id: BEAM_SETTING_IDS.caretDark,
      name: "Caret color (dark)",
      description: "Hex color for the insertion point in dark mode, and the accent color of the dark-mode cursors. Default #48D0C0 (APCA Lc -62.9 on the dark surface).",
      action: { type: "input", placeholder: BEAM_DEFAULTS.caretDark, onChange: changed },
    },
    {
      id: BEAM_SETTING_IDS.caretBlink,
      name: "Caret blink",
      description: "Off (default) holds the caret steady; on restores the platform blink.",
      action: { type: "switch", onChange: changed },
    },
    {
      id: BEAM_SETTING_IDS.cursor,
      name: "Cursor style",
      description: "svy uses the custom SVG arrow/target/beam cursors, published as a light and a dark set and tinted from that mode's caret color; native leaves Roam's cursors alone.",
      action: { type: "select", items: [...CURSOR_STYLES], onChange: changed },
    },
  ];

  return { tabTitle: "Svy Theme", settings };
}
