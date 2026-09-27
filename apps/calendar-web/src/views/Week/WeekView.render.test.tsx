import { type FC, useRef } from "react";
import { describe, expect, it, spyOn } from "bun:test";
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import { useScroll } from "@web/views/Week/hooks/grid/useScroll";

describe("Scroll", () => {
  it("only scrolls once", () => {
    const ScrollHarness: FC = () => {
      const ref = useRef<HTMLDivElement | null>(null);
      useScroll(ref);
      return <div ref={ref} />;
    };

    const scrollSpy = spyOn(window.HTMLElement.prototype, "scroll");

    render(<ScrollHarness />);

    expect(scrollSpy).toHaveBeenCalled();
    // A prototype spy outlives this file unless it is put back.
    scrollSpy.mockRestore();
  });
});
