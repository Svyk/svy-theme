import { FOLD_CC_SETTING_ID } from "./fold-cc.js";
import {
  BEAM_DEFAULTS,
  BEAM_SETTING_IDS,
  CARET_BEHAVIORS,
  CARET_GLOWS,
  CARET_SHAPES,
  CARET_V3_MIGRATION_SETTING_ID,
  CURSOR_STYLES,
  LEGACY_CARET_LIGHT,
  WASH_INTENSITIES,
  WASH_MIGRATION_SETTING_ID,
  normalizeHex,
  normalizeSwitch,
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

  // One-time FORCED migration (2026-08-07). Unlike the caret migration above, this one
  // overrides a value the user may have chosen deliberately, because the user explicitly
  // asked for the new behavior. That makes the marker load-bearing rather than an
  // optimization: without it, every load would re-flip the switch and a user who turned
  // the wash back on could never keep it.
  //
  // A graph seeded fresh by the loop above already stored `false` and skips the write.
  // bp-beam-wash-intensity is deliberately left alone — with the switch off it paints
  // nothing either way, and preserving it means re-enabling the switch restores whatever
  // intensity the user had picked.
  //
  // The marker is written AFTER the flip so an interrupted run retries instead of
  // recording a migration that never happened.
  if (!normalizeSwitch(extensionAPI.settings.get(WASH_MIGRATION_SETTING_ID), false)) {
    if (normalizeSwitch(extensionAPI.settings.get(BEAM_SETTING_IDS.wash), false)) {
      await extensionAPI.settings.set(BEAM_SETTING_IDS.wash, false);
    }
    await extensionAPI.settings.set(WASH_MIGRATION_SETTING_ID, true);
  }

  // v3 replaces the visually heavy full-cell default with the rounded Svy beam. Only
  // the exact old default moves; bar and every later explicit choice are preserved. The
  // marker lets a user switch back to block after the upgrade without being changed on
  // every load.
  if (!normalizeSwitch(extensionAPI.settings.get(CARET_V3_MIGRATION_SETTING_ID), false)) {
    const storedShape = extensionAPI.settings.get(BEAM_SETTING_IDS.caretShape);
    if (typeof storedShape === "string" && storedShape.trim().toLowerCase() === "block") {
      await extensionAPI.settings.set(BEAM_SETTING_IDS.caretShape, BEAM_DEFAULTS.caretShape);
    }
    await extensionAPI.settings.set(CARET_V3_MIGRATION_SETTING_ID, true);
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
          border: "1px solid var(--svy-beam-caret, #00695e)",
        },
      },
      h("span", {
        className: "svy-beam-preview-caret",
        style: {
          display: "inline-block",
          width: "var(--svy-beam-caret-preview-width, 3px)",
          height: "var(--svy-beam-caret-preview-height, 16.4px)",
          borderRadius: "var(--svy-beam-caret-radius, 3px)",
          background: "var(--svy-beam-caret, #00695e)",
          boxShadow: "0 0 8px color-mix(in srgb, var(--svy-beam-caret, #00695e) 32%, transparent)",
          opacity: "var(--svy-beam-caret-opacity, 1)",
        },
      }),
      h("span", { style: { fontSize: "12px", opacity: 0.8 } }, "Svy Beam · color and size update live"),
    );
  };
}

export function createSettingsPanel({ onAppearanceChange, onThemeVarsChange, onFoldCcChange, React } = {}) {
  const changed = () => { onThemeVarsChange?.(); };
  const preview = createBeamPreviewComponent(React);

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
      id: FOLD_CC_SETTING_ID,
      name: "Folded child count",
      description: "On collapsed bullets, show how many children are hidden in the fold-caret slot. The teal ring stays either way.",
      action: { type: "switch", onChange: () => onFoldCcChange?.() },
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
      id: BEAM_SETTING_IDS.caretShape,
      name: "Caret shape",
      description: "beam (default) is a short rounded insertion mark; block fills the glyph cell; outline frames it; underline sits below it; bar is classic; native restores the platform caret.",
      action: { type: "select", items: [...CARET_SHAPES], onChange: changed },
    },
    {
      id: BEAM_SETTING_IDS.caretWidth,
      name: "Caret width scale (%)",
      description: "Fine control from 50–200. Scales the chosen shape: 100 is a 3px beam or one glyph-cell block.",
      action: { type: "input", placeholder: String(BEAM_DEFAULTS.caretWidth), onChange: changed },
    },
    {
      id: BEAM_SETTING_IDS.caretHeight,
      name: "Caret height (%)",
      description: "Height relative to the current line, from 30–120. The quieter default is 82.",
      action: { type: "input", placeholder: String(BEAM_DEFAULTS.caretHeight), onChange: changed },
    },
    {
      id: BEAM_SETTING_IDS.caretRadius,
      name: "Caret corner radius (px)",
      description: "Corner softness from 0–12px. Try 0 for terminal-sharp, 3 for Svy, or 8 for a pill.",
      action: { type: "input", placeholder: String(BEAM_DEFAULTS.caretRadius), onChange: changed },
    },
    {
      id: BEAM_SETTING_IDS.caretOpacity,
      name: "Caret opacity (%)",
      description: "Visibility from 45–100. Keep 100 for maximum contrast; lower values feel softer on large block shapes.",
      action: { type: "input", placeholder: String(BEAM_DEFAULTS.caretOpacity), onChange: changed },
    },
    {
      id: BEAM_SETTING_IDS.caretGlow,
      name: "Caret glow",
      description: "soft adds a restrained edge light; none is perfectly flat; halo is the playful high-energy option.",
      action: { type: "select", items: [...CARET_GLOWS], onChange: changed },
    },
    {
      id: BEAM_SETTING_IDS.caretBehavior,
      name: "Caret behavior",
      description: "responsive gives a quick typing ping; steady never moves; glide eases between positions; breathe idles gently; comet adds a tiny trail. Reduce Motion makes every option steady.",
      action: { type: "select", items: [...CARET_BEHAVIORS], onChange: changed },
    },
    {
      id: BEAM_SETTING_IDS.caretBlink,
      name: "Caret blink",
      description: "Optional classic blink. Off keeps the selected behavior; on blinks the custom caret at the platform-like cadence.",
      action: { type: "switch", onChange: changed },
    },
    {
      id: BEAM_SETTING_IDS.wash,
      name: "Focus wash",
      description: "Off by default: the caret alone marks the focused block. On tints the focused block with the caret color. Always disabled under prefers-reduced-motion, regardless of this switch.",
      action: { type: "switch", onChange: changed },
    },
    {
      id: BEAM_SETTING_IDS.washIntensity,
      name: "Wash intensity",
      description: "off (default) paints nothing even with the switch on; subtle is the original tint; medium doubles the alpha.",
      action: { type: "select", items: [...WASH_INTENSITIES], onChange: changed },
    },
    {
      id: BEAM_SETTING_IDS.cursor,
      name: "Cursor style",
      description: "svy uses the custom SVG arrow/target/beam cursors, published as a light and a dark set and tinted from that mode's caret color; native leaves Roam's cursors alone.",
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
