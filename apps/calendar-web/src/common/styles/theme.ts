import { readability } from "@web/common/styles/color.utils";
import { colors, lightColors } from "@web/common/styles/colors";
import { type ThemeName } from "@web/settings/theme/theme.constants";
import { useThemeStore } from "@web/settings/theme/theme.store";

// The two text candidates getContrastText picks between, per theme. Reading
// the store via getState (not a hook) keeps this callable from plain
// functions; callers re-render on a theme switch anyway because their fill
// colors come from useEventPalette.
const CONTRAST_TEXT_CANDIDATES: Record<
  ThemeName,
  { light: string; dark: string }
> = {
  "dark-abyss": { light: colors.text, dark: colors.onAccent },
  "light-beach": { light: lightColors.onAccent, dark: lightColors.text },
};

export const theme = {
  text: {
    size: {
      xs: "0.563rem",
      s: "0.688rem",
      m: "0.8125rem",
      l: "1rem",
      xl: "1.125rem",
      xxl: "1.3rem",
      xxxl: "1.6rem",
      "4xl": "1.7rem",
      "5xl": "2rem",
    },
    weight: {
      light: 300,
      regular: 400,
      medium: 500,
      bold: 700,
      extraBold: 900,
    },
  },
  // Return whichever text token actually has the higher contrast against the
  // background. A brightness threshold misfires on mid-tone fills, where the
  // "lighter" side is still too dark for light text (and vice versa).
  // A gradient passes every stop; the winner is the token whose WORST stop
  // reads best. Two stops at opposite extremes (near-white and near-black)
  // leave no token readable on both, and that is left as is.
  getContrastText: (backgroundColor: string | string[]): string => {
    const { light, dark } =
      CONTRAST_TEXT_CANDIDATES[useThemeStore.getState().theme];
    const stops = Array.isArray(backgroundColor)
      ? backgroundColor
      : [backgroundColor];
    const worst = (text: string) =>
      Math.min(...stops.map((stop) => readability(text, stop)));
    return worst(dark) >= worst(light) ? dark : light;
  },
  transition: {
    default: "0.3s",
  },
  shape: {
    borderRadius: "4px",
  },
  spacing: {
    xs: "4px",
    s: "8px",
    m: "16px",
    l: "24px",
    xl: "32px",
  },
};
