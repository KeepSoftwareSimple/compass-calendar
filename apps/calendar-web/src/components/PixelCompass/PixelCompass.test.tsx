import { render } from "@testing-library/react";
import { PixelCompass } from "@web/components/PixelCompass/PixelCompass";
import { afterEach, describe, expect, it, spyOn } from "bun:test";

const mockReducedMotion = (matches: boolean) =>
  spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );

describe("PixelCompass", () => {
  let restore: (() => void)[] = [];

  afterEach(() => {
    for (const fn of restore) fn();
    restore = [];
  });

  it("animates on an interval and stops when unmounted", () => {
    const media = mockReducedMotion(false);
    const setIntervalSpy = spyOn(window, "setInterval");
    const clearIntervalSpy = spyOn(window, "clearInterval");
    restore.push(
      () => media.mockRestore(),
      () => setIntervalSpy.mockRestore(),
      () => clearIntervalSpy.mockRestore(),
    );

    const { unmount } = render(<PixelCompass />);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    unmount();
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it("holds a still frame under reduced motion", () => {
    const media = mockReducedMotion(true);
    const setIntervalSpy = spyOn(window, "setInterval");
    restore.push(
      () => media.mockRestore(),
      () => setIntervalSpy.mockRestore(),
    );

    render(<PixelCompass />);
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });
});
