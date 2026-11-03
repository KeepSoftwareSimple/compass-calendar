import { renderHook } from "@testing-library/react";
import { useCanonicalPath } from "@web/common/hooks/useCanonicalPath";
import { afterEach, describe, expect, it } from "bun:test";

const HOME = "https://www.compasscalendar.com/";

const mounted: HTMLLinkElement[] = [];

const mountCanonical = () => {
  const link = document.createElement("link");
  mounted.push(link);
  link.rel = "canonical";
  link.href = HOME;
  document.head.append(link);
  return link;
};

describe("useCanonicalPath", () => {
  afterEach(() => {
    for (const link of mounted.splice(0)) link.remove();
  });

  it("points the canonical link at the page and restores it on unmount", () => {
    const link = mountCanonical();

    const { unmount } = renderHook(() => useCanonicalPath("/life"));
    expect(link.getAttribute("href")).toBe(
      "https://www.compasscalendar.com/life",
    );

    unmount();
    expect(link.getAttribute("href")).toBe(HOME);
  });

  it("does nothing when the page has no canonical link", () => {
    expect(() => renderHook(() => useCanonicalPath("/life"))).not.toThrow();
  });
});
