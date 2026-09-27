import { getToastDefaultOptions } from "@web/common/constants/toast.constants";
import { describe, expect, it } from "bun:test";

describe("getToastDefaultOptions", () => {
  it("binds chrome to theme CSS variables so copy contrast follows data-theme", () => {
    const options = getToastDefaultOptions("dark-abyss");

    expect(options.style).toEqual(
      expect.objectContaining({
        backgroundColor: "var(--background)",
        color: "var(--text)",
      }),
    );
  });

  it("keeps the same chrome tokens in light theme", () => {
    const dark = getToastDefaultOptions("dark-abyss");
    const light = getToastDefaultOptions("light-beach");

    expect(light.style).toEqual(dark.style);
    expect(light.theme).toBe("light");
    expect(dark.theme).toBe("dark");
  });
});
