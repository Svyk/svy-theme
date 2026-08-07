import {
  BEAM_DEFAULTS,
  BEAM_SETTING_IDS,
  CARET_SHAPES,
  CURSOR_STYLES,
  WASH_INTENSITIES,
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
}

// Roam exposes its own React on window, so a reactComponent row costs zero bundled
// dependencies. The preview is deliberately stateless: it paints from the same
// --svy-beam-* custom properties the stylesheet reads, so theme-vars.js updating the
// injected sheet repaints it with no React state, effect, or cleanup to leak.
export function createBeamPreviewComponent(React = globalThis.window?.React) {
  if (typeof React?.createElement !== "function") return null;
  const h = React.createElement;
  return function SvyBeamPreview() {
    return h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "8px 10px",
          borderRadius: "var(--svy-beam-wash-radius, 4px)",
          background: "var(--svy-beam-wash, rgba(0, 122, 112, 0.045))",
          border: "1px solid var(--svy-beam-caret, #008478)",
        },
      },
      h("span", {
        style: {
          display: "inline-block",
          width: "8px",
          height: "18px",
          borderRadius: "1px",
          background: "var(--svy-beam-caret, #008478)",
        },
      }),
      h("span", { style: { fontSize: "12px", opacity: 0.8 } }, "caret and focus wash, live"),
    );
  };
}

export function createSettingsPanel({ onAppearanceChange, onThemeVarsChange, React } = {}) {
  const changed = () => { onThemeVarsChange?.(); };
  const preview = createBeamPreviewComponent(React);

  const settings = [
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
    {
      id: BEAM_SETTING_IDS.pack,
      name: "Svy Beam",
      description: "Master switch for the beam layer: caret color/shape, focus wash, and custom cursors. Off restores Roam's native caret and cursors without a reload.",
      action: { type: "switch", onChange: changed },
    },
    {
      id: BEAM_SETTING_IDS.caretLight,
      name: "Caret color (light)",
      description: "Hex color for the text insertion point in light mode. Accepts #rgb or #rrggbb; anything else falls back to the default #008478.",
      action: { type: "input", placeholder: BEAM_DEFAULTS.caretLight, onChange: changed },
    },
    {
      id: BEAM_SETTING_IDS.caretDark,
      name: "Caret color (dark)",
      description: "Hex color for the insertion point in dark mode, and the accent color of the custom cursors. Default #48D0C0 (APCA Lc -62.9 on the dark surface).",
      action: { type: "input", placeholder: BEAM_DEFAULTS.caretDark, onChange: changed },
    },
    {
      id: BEAM_SETTING_IDS.caretShape,
      name: "Caret shape",
      description: "block fills the character cell (CSS UI 4); bar is the classic thin caret. Browsers without caret-shape support always draw a bar.",
      action: { type: "select", items: [...CARET_SHAPES], onChange: changed },
    },
    {
      id: BEAM_SETTING_IDS.caretBlink,
      name: "Caret blink",
      description: "Off (default) holds the caret steady. On restores the browser's blinking caret.",
      action: { type: "switch", onChange: changed },
    },
    {
      id: BEAM_SETTING_IDS.wash,
      name: "Focus wash",
      description: "Tints the focused block with the caret color. Always disabled under prefers-reduced-motion, regardless of this switch.",
      action: { type: "switch", onChange: changed },
    },
    {
      id: BEAM_SETTING_IDS.washIntensity,
      name: "Wash intensity",
      description: "subtle is the shipped tint; medium doubles the alpha; off keeps the switch on but paints nothing.",
      action: { type: "select", items: [...WASH_INTENSITIES], onChange: changed },
    },
    {
      id: BEAM_SETTING_IDS.cursor,
      name: "Cursor style",
      description: "svy uses the custom SVG arrow/target/beam cursors tinted from the dark caret color; native leaves Roam's cursors alone.",
      action: { type: "select", items: [...CURSOR_STYLES], onChange: changed },
    },
  ];

  if (preview) {
    settings.push({
      id: "bp-beam-preview",
      name: "Preview",
      description: "Live sample of the current caret and focus wash.",
      action: { type: "reactComponent", component: preview },
    });
  }

  return { tabTitle: "Svy Theme", settings };
}
