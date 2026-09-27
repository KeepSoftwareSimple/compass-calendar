// Dark Abyss role palette. Mirrors the [data-theme="dark-abyss"] block in
// apps/calendar-web/src/index.css (guarded by theme-css.test.ts value-parity
// assertions). These hex copies exist only where real hex is required —
// tinycolor math, <canvas>, and third-party inline style objects
// (react-select) — and do NOT react to a [data-theme] switch. Toasts bind
// chrome to CSS variables instead. Remaining hex consumers need
// getComputedStyle reads rather than importing this map directly.
export const colors = {
  background: "#06090F",
  surface: "#0C1219",
  surfacePanel: "#121A23",
  surfaceRaised: "#18222D",

  borderStrong: "#4E6374",

  text: "#C6D0D9",
  textMuted: "#88939D",
  textSubtle: "#4E5A66",

  accent: "#7CC6E4",
  accentHover: "#8CCDE7",
  accentStrong: "#598FA4",
  accentSecondary: "#608197",
  accentSecondaryHover: "#6B8CA2",
  onAccent: "#05121A",

  success: "#78AE88",
  warning: "#C2A578",
  error: "#C17E70",
  info: "#6E97BE",
};

// Light Beach counterparts, mirroring the [data-theme="light-beach"] block in
// index.css (same theme-css.test.ts parity guard). Only the roles a JS
// consumer actually needs real hex for (contrast math, tinycolor derivations)
// live here — everything else should keep reading CSS variables.
export const lightColors = {
  background: "#F3EEE2",
  text: "#403A2F",
  textMuted: "#5E5847",
  onAccent: "#F6F3EA",
};
