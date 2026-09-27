import {
  getVisibleHintRect,
  intersectHintRects,
  MIN_VISIBLE_HINT_SIZE_PX,
} from "@web/shortcuts/shift-hint/shift-hint-visible-rect";
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

describe("intersectHintRects", () => {
  it("returns the overlap when both axes clear the minimum size", () => {
    expect(
      intersectHintRects(
        { top: 0, left: 0, bottom: 100, right: 100 },
        { top: 40, left: 40, bottom: 80, right: 90 },
      ),
    ).toEqual({ top: 40, left: 40, bottom: 80, right: 90 });
  });

  it("returns null when the overlap is thinner than the minimum", () => {
    expect(
      intersectHintRects(
        { top: 0, left: 0, bottom: 100, right: 100 },
        {
          top: 100 - (MIN_VISIBLE_HINT_SIZE_PX - 1),
          left: 0,
          bottom: 200,
          right: 100,
        },
      ),
    ).toBeNull();
  });
});

describe("getVisibleHintRect", () => {
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

  it("returns the event rect when it is fully in the viewport", () => {
    const event = document.createElement("div");
    stubRect(event, box(80, 40, 140, 200));
    document.body.append(event);

    expect(getVisibleHintRect(event)).toEqual({
      top: 80,
      left: 40,
      bottom: 140,
      right: 200,
    });
  });

  it("returns null when the event is fully above an overflow-y-auto parent", () => {
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    stubRect(scroller, box(200, 0, 700, 1200));

    const event = document.createElement("div");
    stubRect(event, box(40, 80, 120, 240));
    scroller.append(event);
    document.body.append(scroller);

    expect(getVisibleHintRect(event)).toBeNull();
  });

  it("returns null when the event is fully below an overflow-y-auto parent", () => {
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    stubRect(scroller, box(200, 0, 700, 1200));

    const event = document.createElement("div");
    stubRect(event, box(720, 80, 780, 240));
    scroller.append(event);
    document.body.append(scroller);

    expect(getVisibleHintRect(event)).toBeNull();
  });

  it("returns null when the event is fully left of an overflow-x-auto parent", () => {
    const scroller = document.createElement("div");
    scroller.style.overflowX = "auto";
    stubRect(scroller, box(0, 200, 800, 800));

    const event = document.createElement("div");
    stubRect(event, box(80, 20, 140, 120));
    scroller.append(event);
    document.body.append(scroller);

    expect(getVisibleHintRect(event)).toBeNull();
  });

  it("returns the visible sliver when a parent clips the event top", () => {
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    stubRect(scroller, box(200, 0, 700, 1200));

    const event = document.createElement("div");
    stubRect(event, box(160, 80, 260, 240));
    scroller.append(event);
    document.body.append(scroller);

    expect(getVisibleHintRect(event)).toEqual({
      top: 200,
      left: 80,
      bottom: 260,
      right: 240,
    });
  });

  it("returns null when only a sliver thinner than the minimum is visible", () => {
    const scroller = document.createElement("div");
    scroller.style.overflowY = "auto";
    stubRect(scroller, box(200, 0, 700, 1200));

    const event = document.createElement("div");
    stubRect(
      event,
      box(200 - (MIN_VISIBLE_HINT_SIZE_PX - 1), 80, 200 + 1, 240),
    );
    scroller.append(event);
    document.body.append(scroller);

    expect(getVisibleHintRect(event)).toBeNull();
  });

  it("does not treat the event card's own overflow-hidden as a clipper", () => {
    const event = document.createElement("div");
    event.style.overflow = "hidden";
    stubRect(event, box(80, 40, 140, 200));
    document.body.append(event);

    expect(getVisibleHintRect(event)).toEqual({
      top: 80,
      left: 40,
      bottom: 140,
      right: 200,
    });
  });
});
