import { readability } from "./color.utils";
import { colors, lightColors } from "./colors";
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const indexCss = readFileSync(join(import.meta.dir, "../../index.css"), "utf8");

// The full Dark Abyss role set: 19 theme-agnostic roles from the design
// artifact, plus 3 theme-dependent extras with no artifact-role substitute
// (surface-overlay, overlay-backdrop, shadow-default).
const semanticColorTokens = [
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

// colors.ts camelCase key -> its kebab-case CSS role name. Only the keys
// colors.ts actually exports (i.e. the ones a JS consumer needs a real hex
// for) are checked here.
const jsColorKeyToCssToken: Record<keyof typeof colors, string> = {
  background: "background",
  surface: "surface",
  surfacePanel: "surface-panel",
  surfaceRaised: "surface-raised",
  borderStrong: "border-strong",
  text: "text",
  textMuted: "text-muted",
  textSubtle: "text-subtle",
  accent: "accent",
  accentHover: "accent-hover",
  accentStrong: "accent-strong",
  accentSecondary: "accent-secondary",
  accentSecondaryHover: "accent-secondary-hover",
  onAccent: "on-accent",
  success: "success",
  warning: "warning",
  error: "error",
  info: "info",
};

// Tokens/prefixes that must not survive a restyle: the old --compass-color-
// prefix, and the old component-specific / dead token names collapsed or
// dropped in the Dark Abyss rename.
const deadNames = [
  "--compass-color-",
  "--compass-radius",
  "--compass-text-m",
  "--compass-transition-default",
  "menu-border",
  "menu-hover",
  "gradient-accent-light",
  "text-divider",
  "text-gradient-start",
  "text-gradient-end",
  "text-dark-placeholder",
  "tag-one",
  "tag-two",
  "tag-three",
  "status-success",
  "status-error",
  "status-warning",
  "status-info",
];

describe("Tailwind theme CSS", () => {
  it("declares the Dark Abyss theme scope", () => {
    expect(indexCss).toContain('[data-theme="dark-abyss"]');
    expect(indexCss).toContain("color-scheme: dark");
  });

  it("maps every semantic color utility to a runtime theme variable", () => {
    expect(indexCss).toContain("@theme inline");

    for (const token of semanticColorTokens) {
      expect(indexCss).toMatch(
        new RegExp(`--color-${token}:\\s*var\\(\\s*--${token}\\s*\\);`),
      );
    }
  });

  it("declares Light Beach as the :root default", () => {
    expect(indexCss).toMatch(/:root,\s*\[data-theme="light-beach"\]/);
  });

  it("declares the Light Beach theme scope", () => {
    expect(indexCss).toContain('[data-theme="light-beach"]');
    expect(indexCss).toContain("color-scheme: light");
  });

  it("defines every semantic role in the Light Beach theme", () => {
    // Isolate the light-beach block so we don't accidentally match a role that
    // only the dark block defines.
    const block = indexCss.match(/\[data-theme="light-beach"\]\s*\{([^}]*)\}/);
    expect(block).not.toBeNull();
    const body = block?.[1] ?? "";

    for (const token of semanticColorTokens) {
      // Value can be hex or hsl(...); just assert the role is assigned something.
      expect(body).toMatch(new RegExp(`--${token}:\\s*\\S`));
    }
  });

  it("does not contain any pre-restyle token names", () => {
    for (const name of deadNames) {
      expect(indexCss).not.toContain(name);
    }
  });

  it("keeps colors.ts hex values in sync with the dark-abyss block", () => {
    const block = indexCss.match(/\[data-theme="dark-abyss"\]\s*\{([^}]*)\}/);
    expect(block).not.toBeNull();
    const body = block?.[1] ?? "";

    for (const [jsKey, cssToken] of Object.entries(jsColorKeyToCssToken)) {
      const hex = colors[jsKey as keyof typeof colors];
      const match = body.match(
        new RegExp(`--${cssToken}:\\s*(#[0-9a-fA-F]{6});`),
      );
      expect(match).not.toBeNull();
      expect(match?.[1]?.toLowerCase()).toBe(hex.toLowerCase());
    }
  });

  it("keeps body text readable on the background both themes paint", () => {
    expect(readability(colors.text, colors.background)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      readability(colors.textMuted, colors.background),
    ).toBeGreaterThanOrEqual(4.5);

    const block = indexCss.match(/\[data-theme="light-beach"\]\s*\{([^}]*)\}/);
    const body = block?.[1] ?? "";
    const lightText = body.match(/--text:\s*(#[0-9a-fA-F]{6});/)?.[1];
    const lightMuted = body.match(/--text-muted:\s*(#[0-9a-fA-F]{6});/)?.[1];
    const lightBackground = body.match(
      /--background:\s*(#[0-9a-fA-F]{6});/,
    )?.[1];
    expect(lightText).toBeDefined();
    expect(lightMuted).toBeDefined();
    expect(lightBackground).toBeDefined();
    expect(readability(lightText!, lightBackground!)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(readability(lightMuted!, lightBackground!)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it("keeps on-accent readable on accent-secondary fills", () => {
    // Up Next and toast CTAs paint --on-accent on --accent-secondary.
    // Axe fails the page scan when that pair is below WCAG AA 4.5:1.
    expect(
      readability(colors.onAccent, colors.accentSecondary),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      readability(colors.onAccent, colors.accentSecondaryHover),
    ).toBeGreaterThanOrEqual(4.5);

    const block = indexCss.match(/\[data-theme="light-beach"\]\s*\{([^}]*)\}/);
    const body = block?.[1] ?? "";
    const lightOnAccent = body.match(/--on-accent:\s*(#[0-9a-fA-F]{6});/)?.[1];
    const lightSecondary = body.match(
      /--accent-secondary:\s*(#[0-9a-fA-F]{6});/,
    )?.[1];
    const lightSecondaryHover = body.match(
      /--accent-secondary-hover:\s*(#[0-9a-fA-F]{6});/,
    )?.[1];
    expect(lightOnAccent).toBeDefined();
    expect(lightSecondary).toBeDefined();
    expect(lightSecondaryHover).toBeDefined();
    expect(readability(lightOnAccent!, lightSecondary!)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      readability(lightOnAccent!, lightSecondaryHover!),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps lightColors hex values in sync with the light-beach block", () => {
    const block = indexCss.match(/\[data-theme="light-beach"\]\s*\{([^}]*)\}/);
    const body = block?.[1] ?? "";

    const lightJsColorKeyToCssToken: Record<keyof typeof lightColors, string> =
      {
        background: "background",
        text: "text",
        textMuted: "text-muted",
        onAccent: "on-accent",
      };

    for (const [jsKey, cssToken] of Object.entries(lightJsColorKeyToCssToken)) {
      const hex = lightColors[jsKey as keyof typeof lightColors];
      const match = body.match(
        new RegExp(`--${cssToken}:\\s*(#[0-9a-fA-F]{6});`),
      );
      expect(match).not.toBeNull();
      expect(match?.[1]?.toLowerCase()).toBe(hex.toLowerCase());
    }
  });

  it("paints sidebar month-picker days with theme text, not inherited black", () => {
    // react-datepicker sets color: #000 on .react-datepicker. A sidebar
    // `color: inherit` picked that up and failed WCAG on Dark Abyss.
    expect(indexCss).toContain(".c-month-picker .c-date-picker");
    expect(indexCss).toMatch(
      /\.c-month-picker \.c-date-picker[\s\S]*& \.react-datepicker__day \{\s*color: var\(--text\);/,
    );
    expect(indexCss).not.toMatch(
      /data-view="sidebar"\] \.react-datepicker__day[\s\S]{0,120}color:\s*inherit/,
    );
  });

  it("paints month-picker selection with ink, not accent", () => {
    expect(indexCss).toMatch(
      /\.c-month-picker \.c-date-picker[\s\S]*--date-picker-selected-bg:\s*var\(--text\)/,
    );
    expect(indexCss).toMatch(
      /\.c-month-picker \.c-date-picker[\s\S]*--date-picker-selected-text:\s*var\(--background\)/,
    );
    expect(indexCss).not.toMatch(
      /\.c-month-picker \.c-date-picker[\s\S]*day--today:not\([^)]+\) \{\s*color:\s*var\(--accent\)/,
    );
  });
});
