import { type EventColorSlot } from "@core/types/event-color.contracts";
import { type ThemeName } from "@web/settings/theme/theme.constants";
import { selectTheme, useThemeStore } from "@web/settings/theme/theme.store";
import { brighten, darken } from "./color.utils";

// Flat neutral fill shared by every event surface (grid cards, event form
// accents, save button), one value per theme. Title/time text is picked per
// fill by theme.getContrastText, so each base just has to sit clearly on one
// side of the mid-tone dead zone.
//   Dark Abyss:  muted steel-blue, light enough for dark text (>= 4.5:1) — a
//                darker fill forced light, "glowing" titles on the near-black
//                grid that read as too visually loud.
//   Light Beach: near-neutral ink charcoal that takes light text (8.8:1) —
//                dark blocks on the warm paper grid, matching the theme's
//                restrained pen-and-paper brief.
const EVENT_BASE_COLOR: Record<ThemeName, string> = {
  "dark-abyss": "#82A0B2",
  "light-beach": "#454442",
};

// Google Calendar's modern event color palette (colors.get event backgrounds),
// keyed by Compass EventColorSlot. Used when an event carries a color tag;
// otherwise cards fall back to EVENT_BASE_COLOR for the active theme.
export const EVENT_COLOR_SLOT_HEX: Record<EventColorSlot, string> = {
  lavender: "#7986CB",
  mint: "#33B679",
  plum: "#8E24AA",
  coral: "#E67C73",
  gold: "#F6BF26",
  orange: "#F4511E",
  blue: "#039BE5",
  slate: "#616161",
  indigo: "#3F51B5",
  green: "#0B8043",
  red: "#D50000",
};

const EVENT_COLOR_SLOT_LABEL: Record<EventColorSlot, string> = {
  lavender: "Lavender",
  mint: "Mint",
  plum: "Plum",
  coral: "Coral",
  gold: "Gold",
  orange: "Orange",
  blue: "Blue",
  slate: "Slate",
  indigo: "Indigo",
  green: "Green",
  red: "Red",
};

export const eventColorLabel = (color: EventColorSlot | null): string =>
  color === null ? "Calendar default" : EVENT_COLOR_SLOT_LABEL[color];

interface EventPalette {
  base: string;
  /** Derived (not a fixed hex) so the hover delta scales with the base the
   * same way it always has, rather than being pinned to a step that happens
   * to suit one palette's lightness. */
  hover: string;
  gradient: string;
  saveButtonBg: string;
  /** The c-button-elevated underside, a step deeper than the button fill. */
  saveButtonShadow: string;
}

const buildEventPaletteFromBase = (base: string): EventPalette => ({
  base,
  hover: brighten(base),
  gradient: `linear-gradient(90deg, ${darken(base, 15)}, ${darken(base, 30)})`,
  // Undarkened: darken(base) sat right at the mid-tone dead zone (see
  // getContrastText above), leaving Save's text only ~5:1 against its own
  // fill. The plain base clears 6.5:1+ in both themes; saveButtonShadow
  // still carries the "elevated" depth cue.
  saveButtonBg: base,
  saveButtonShadow: darken(base, 25),
});

const buildEventPalette = (theme: ThemeName): EventPalette =>
  buildEventPaletteFromBase(EVENT_BASE_COLOR[theme]);

// Precomputed for both themes at module load — consumers just index in.
const EVENT_PALETTES: Record<ThemeName, EventPalette> = {
  "dark-abyss": buildEventPalette("dark-abyss"),
  "light-beach": buildEventPalette("light-beach"),
};

/** The active theme's event palette, a provider-custom `colorHex` fill, or a
 * Google-slot fill when `color` is set — in that precedence order. Subscribes
 * so a theme switch re-renders the default (no-slot) case. */
export const useEventPalette = (
  color?: EventColorSlot,
  colorHex?: string,
): EventPalette =>
  resolveEventPalette(useThemeStore(selectTheme), color, colorHex);

/** Non-reactive read for plain functions (e.g. getGradient's identity check).
 * Components should use useEventPalette so they repaint on switch. */
export const getEventPalette = (
  color?: EventColorSlot,
  colorHex?: string,
): EventPalette =>
  resolveEventPalette(useThemeStore.getState().theme, color, colorHex);

const resolveEventPalette = (
  themeName: ThemeName,
  color?: EventColorSlot,
  colorHex?: string,
): EventPalette => {
  if (colorHex !== undefined) return buildEventPaletteFromBase(colorHex);
  if (color !== undefined) {
    return buildEventPaletteFromBase(EVENT_COLOR_SLOT_HEX[color]);
  }
  return EVENT_PALETTES[themeName];
};

// CSS-variable gradients: these land in inline `background` styles, so the
// browser resolves them against the active [data-theme] — no JS hex needed.
export const accentGradient =
  "linear-gradient(var(--accent), var(--accent-strong))";
const mutedGradient =
  "linear-gradient(90deg, var(--text-muted), var(--text-subtle))";

export const getGradient = (color: string) => {
  const { base, gradient } = getEventPalette();
  return color === base ? gradient : mutedGradient;
};
