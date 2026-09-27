import { cleanup, render } from "@testing-library/react";
import { ShiftHintOverlay } from "@web/shortcuts/shift-hint/ShiftHintOverlay";
import { type ActiveShiftHint } from "@web/shortcuts/shift-hint/useShiftHoldEventHints";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

const box = (
  top: number,
  left: number,
  bottom: number,
  right: number,
): DOMRect =>
  ({
    top,
    left,
    bottom,
    right,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

const stubRect = (element: HTMLElement, rect: DOMRect) => {
  element.getBoundingClientRect = () => rect;
};

const hintFor = (element: HTMLElement, hint = "m1"): ActiveShiftHint => ({
  eventId: "aaaaaaaaaaaaaaaaaaaaaaaa",
  hint,
  dayKey: "2026-08-17",
  dayPrefix: "m",
  index: 1,
  element,
});

const overlayRoot = () => document.querySelector("[data-shift-event-hints]");

const overlayChip = () =>
  overlayRoot()?.firstElementChild as HTMLElement | null;

describe("ShiftHintOverlay", () => {
  let originalInnerHeight: number;
  let originalInnerWidth: number;

  beforeEach(() => {
    originalInnerHeight = window.innerHeight;
    originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1200,
    });
  });

  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
    });
  });

  it("renders a chip on an in-view event", () => {
    const event = document.createElement("div");
    stubRect(event, box(220, 80, 280, 240));
    document.body.append(event);

    render(<ShiftHintOverlay hints={[hintFor(event)]} />);

    expect(overlayRoot()?.textContent).toBe("M1");
    expect(overlayChip()?.style.top).toBe("224px");
    expect(overlayChip()?.style.left).toBe("214px");
  });

  it("hides the chip when the event is above a clipping scroller", () => {
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    stubRect(scroller, box(200, 0, 700, 1200));

    const event = document.createElement("div");
    stubRect(event, box(40, 80, 120, 240));
    scroller.append(event);
    document.body.append(scroller);

    render(<ShiftHintOverlay hints={[hintFor(event)]} />);

    expect(overlayRoot()?.textContent).toBe("");
  });

  it("anchors a partially clipped event to the visible top-right", () => {
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    stubRect(scroller, box(200, 0, 700, 1200));

    const event = document.createElement("div");
    stubRect(event, box(160, 80, 260, 240));
    scroller.append(event);
    document.body.append(scroller);

    render(<ShiftHintOverlay hints={[hintFor(event, "su1")]} />);

    expect(overlayChip()?.textContent).toBe("SU1");
    expect(overlayChip()?.style.top).toBe("204px");
    expect(overlayChip()?.style.left).toBe("206px");
  });
});
