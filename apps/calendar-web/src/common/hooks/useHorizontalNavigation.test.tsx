import { fireEvent, render, screen } from "@testing-library/react";
import { type FC, useRef } from "react";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as trackModule from "@web/auth/posthog/track";
import { useHorizontalNavigation } from "@web/common/hooks/useHorizontalNavigation";
import { registerPointerIntentKeysLookup } from "@web/shortcuts/pointer-intent/pointer-intent.actions";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const track = mock();
mockModuleForFile("@web/auth/posthog/track", trackModule, { track });

const Harness: FC<{
  onNext: () => void;
  onPrevious: () => void;
}> = ({ onNext, onPrevious }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useHorizontalNavigation({ containerRef, onNext, onPrevious });

  return <section ref={containerRef} aria-label="Calendar" />;
};

describe("useHorizontalNavigation", () => {
  beforeEach(() => {
    track.mockClear();
    registerPointerIntentKeysLookup(() => ["K"]);
  });

  it("notifies the pointer intent tracker when navigation runs", () => {
    render(<Harness onNext={mock()} onPrevious={mock()} />);
    const calendar = screen.getByRole("region", { name: "Calendar" });
    fireEvent.wheel(calendar, { deltaX: 70, deltaY: 0 });
    expect(track).toHaveBeenCalledWith(
      "pointer_intent_detected",
      expect.objectContaining({ intent: "swipe-next" }),
    );
  });

  it("navigates once when a horizontal gesture crosses the threshold", () => {
    const onNext = mock();
    render(<Harness onNext={onNext} onPrevious={mock()} />);

    const calendar = screen.getByRole("region", { name: "Calendar" });
    fireEvent.wheel(calendar, { deltaX: 35, deltaY: 2 });
    fireEvent.wheel(calendar, { deltaX: 35, deltaY: 2 });
    fireEvent.wheel(calendar, { deltaX: 100, deltaY: 2 });

    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("navigates backward for a leftward gesture", () => {
    const onPrevious = mock();
    render(<Harness onNext={mock()} onPrevious={onPrevious} />);

    fireEvent.wheel(screen.getByRole("region", { name: "Calendar" }), {
      deltaX: -70,
      deltaY: 0,
    });

    expect(onPrevious).toHaveBeenCalledTimes(1);
  });

  it("ignores the decaying momentum tail after navigating", () => {
    const onNext = mock();
    render(<Harness onNext={onNext} onPrevious={mock()} />);

    const calendar = screen.getByRole("region", { name: "Calendar" });
    fireEvent.wheel(calendar, { deltaX: 70, deltaY: 0 });
    // macOS momentum events: same direction, steadily decaying magnitude
    for (const deltaX of [60, 45, 30, 20, 12, 6, 2]) {
      fireEvent.wheel(calendar, { deltaX, deltaY: 0 });
    }

    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("navigates again when a new swipe starts during the momentum tail", () => {
    const onNext = mock();
    render(<Harness onNext={onNext} onPrevious={mock()} />);

    const calendar = screen.getByRole("region", { name: "Calendar" });
    fireEvent.wheel(calendar, { deltaX: 70, deltaY: 0 });
    for (const deltaX of [40, 25, 12, 5]) {
      fireEvent.wheel(calendar, { deltaX, deltaY: 0 });
    }
    // Second swipe: magnitude jumps well above the dying tail
    fireEvent.wheel(calendar, { deltaX: 45, deltaY: 0 });
    fireEvent.wheel(calendar, { deltaX: 45, deltaY: 0 });

    expect(onNext).toHaveBeenCalledTimes(2);
  });

  it("navigates the other way when the tail is interrupted by an opposite swipe", () => {
    const onNext = mock();
    const onPrevious = mock();
    render(<Harness onNext={onNext} onPrevious={onPrevious} />);

    const calendar = screen.getByRole("region", { name: "Calendar" });
    fireEvent.wheel(calendar, { deltaX: 70, deltaY: 0 });
    fireEvent.wheel(calendar, { deltaX: 30, deltaY: 0 });
    fireEvent.wheel(calendar, { deltaX: -70, deltaY: 0 });

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrevious).toHaveBeenCalledTimes(1);
  });

  it("does not hijack vertical scrolling or pinch zoom", () => {
    const onNext = mock();
    const onPrevious = mock();
    render(<Harness onNext={onNext} onPrevious={onPrevious} />);

    const calendar = screen.getByRole("region", { name: "Calendar" });
    fireEvent.wheel(calendar, { deltaX: 20, deltaY: 80 });
    fireEvent.wheel(calendar, { ctrlKey: true, deltaX: 80, deltaY: 0 });

    expect(onNext).not.toHaveBeenCalled();
    expect(onPrevious).not.toHaveBeenCalled();
  });

  it("preserves horizontal scrolling inside an overflowing calendar area", () => {
    const onNext = mock();
    render(<Harness onNext={onNext} onPrevious={mock()} />);

    const calendar = screen.getByRole("region", { name: "Calendar" });
    const scrollArea = document.createElement("div");
    Object.defineProperties(scrollArea, {
      clientWidth: { value: 100 },
      scrollWidth: { value: 200 },
    });
    calendar.append(scrollArea);

    fireEvent.wheel(scrollArea, { deltaX: 80, deltaY: 0 });

    expect(onNext).not.toHaveBeenCalled();
  });
});
