/** Semantic color roles exported to native clients (excludes motion tokens). */
export const SEMANTIC_THEME_TOKENS = [
  "background",
  "surface",
  "surface-panel",
  "surface-raised",
  "surface-overlay",
  "border",
  "border-strong",
  "text",
  "text-muted",
  "text-subtle",
  "accent",
  "accent-hover",
  "accent-strong",
  "accent-secondary",
  "accent-secondary-hover",
  "on-accent",
  "success",
  "warning",
  "error",
  "info",
  "overlay-backdrop",
  "shadow-default",
] as const;

export type SemanticThemeToken = (typeof SEMANTIC_THEME_TOKENS)[number];

export interface SrgbColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

export type ThemePalette = Record<SemanticThemeToken, SrgbColor>;

export interface ParsedThemeCss {
  "light-beach": ThemePalette;
  "dark-abyss": ThemePalette;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const parseHex = (value: string): SrgbColor => {
  const hex = value.trim().replace("#", "");
  if (hex.length !== 6) {
    throw new Error(`unsupported hex color: ${value}`);
  }
  const red = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const green = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(hex.slice(4, 6), 16) / 255;
  return { red, green, blue, alpha: 1 };
};

const parseHue = (value: string): number => {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`invalid hsl hue: ${value}`);
  }
  return ((parsed % 360) + 360) % 360;
};

const parsePercent = (value: string): number => {
  const parsed = Number.parseFloat(value.replace("%", ""));
  if (Number.isNaN(parsed)) {
    throw new Error(`invalid hsl percent: ${value}`);
  }
  return clamp01(parsed / 100);
};

const parseHslLightnessOrSaturation = (value: string): number => {
  const trimmed = value.trim();
  if (trimmed.endsWith("%")) {
    return parsePercent(trimmed);
  }
  const parsed = Number.parseFloat(trimmed);
  if (Number.isNaN(parsed)) {
    throw new Error(`invalid hsl component: ${value}`);
  }
  return clamp01(parsed / 100);
};

const hslToSrgb = (
  h: number,
  s: number,
  l: number,
): Omit<SrgbColor, "alpha"> => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let red = 0;
  let green = 0;
  let blue = 0;
  if (h < 60) {
    red = c;
    green = x;
  } else if (h < 120) {
    red = x;
    green = c;
  } else if (h < 180) {
    green = c;
    blue = x;
  } else if (h < 240) {
    green = x;
    blue = c;
  } else if (h < 300) {
    red = x;
    blue = c;
  } else {
    red = c;
    blue = x;
  }
  return {
    red: clamp01(red + m),
    green: clamp01(green + m),
    blue: clamp01(blue + m),
  };
};

const parseHsl = (value: string): SrgbColor => {
  const trimmed = value.trim();
  const match =
    /^hsl\(\s*([0-9.]+)(?:deg)?(?:\s+|,\s*)([0-9.]+%?)(?:\s+|,\s*)([0-9.]+%?)(?:\s*(?:\/\s*|,\s*)([0-9.]+%?))?\s*\)$/i.exec(
      trimmed,
    );
  if (!match) {
    throw new Error(`unsupported hsl color: ${value}`);
  }
  const hue = parseHue(match[1] ?? "0");
  const saturation = parseHslLightnessOrSaturation(match[2] ?? "0");
  const lightness = parseHslLightnessOrSaturation(match[3] ?? "0");
  const alphaToken = match[4];
  const alpha = alphaToken?.includes("%")
    ? parsePercent(alphaToken)
    : alphaToken
      ? clamp01(Number.parseFloat(alphaToken))
      : 1;
  const rgb = hslToSrgb(hue, saturation, lightness);
  return { ...rgb, alpha };
};

export const parseCssColor = (raw: string): SrgbColor => {
  const value = raw.trim().replace(/;$/, "");
  if (value.startsWith("#")) {
    return parseHex(value);
  }
  if (value.startsWith("hsl(")) {
    return parseHsl(value);
  }
  throw new Error(`unsupported css color: ${raw}`);
};

const extractThemeBlock = (css: string, selector: string): string => {
  const start = css.indexOf(selector);
  if (start === -1) {
    throw new Error(`missing css selector block: ${selector}`);
  }
  const braceStart = css.indexOf("{", start);
  const braceEnd = css.indexOf("}", braceStart);
  if (braceStart === -1 || braceEnd === -1) {
    throw new Error(`malformed css block for selector: ${selector}`);
  }
  return css.slice(braceStart + 1, braceEnd);
};

const parsePaletteFromBlock = (block: string): ThemePalette => {
  const palette = {} as ThemePalette;
  for (const token of SEMANTIC_THEME_TOKENS) {
    const pattern = new RegExp(`--${token}:\\s*([^;]+);`);
    const match = pattern.exec(block);
    if (!match?.[1]) {
      throw new Error(`missing css token --${token}`);
    }
    palette[token] = parseCssColor(match[1]);
  }
  return palette;
};

export const parseThemeCss = (css: string): ParsedThemeCss => {
  const lightBlock = extractThemeBlock(
    css,
    ':root,\n[data-theme="light-beach"]',
  );
  const darkBlock = extractThemeBlock(css, '[data-theme="dark-abyss"]');
  return {
    "light-beach": parsePaletteFromBlock(lightBlock),
    "dark-abyss": parsePaletteFromBlock(darkBlock),
  };
};
