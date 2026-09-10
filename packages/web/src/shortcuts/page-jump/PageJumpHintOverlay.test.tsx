import { cleanup, render, screen } from "@testing-library/react";
import { createMockAccountRef } from "@web/__tests__/utils/factories/calendar.factory";
import { PageJumpHintOverlay } from "@web/shortcuts/page-jump/PageJumpHintOverlay";
import {
  buildCalendarPageJumpTargets,
  buildDayPageJumpTargets,
  calendarAccountJumpId,
  dayColumnJumpId,
  LIFE_PAGE_JUMP_TARGETS,
  PAGE_JUMP_ATTRIBUTE,
  type PageJumpTargetId,
} from "@web/shortcuts/page-jump/page-jump.targets";
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

const overlayRoot = () => document.querySelector("[data-page-jump-hints]");
const chipsWrapper = () => overlayRoot()?.querySelector("[aria-hidden]");
const chipDigits = () =>
  Array.from(chipsWrapper()?.children ?? []).map((el) => el.textContent);

const addAnchor = (
  id: PageJumpTargetId,
  { focusable = true }: { focusable?: boolean } = {},
): HTMLElement => {
  const anchor = document.createElement("section");
  anchor.setAttribute(PAGE_JUMP_ATTRIBUTE, id);
  if (focusable) {
    anchor.append(document.createElement("button"));
  }
  stubRect(anchor, box(100, 80, 140, 240));
  document.body.append(anchor);
  return anchor;
};

describe("PageJumpHintOverlay", () => {
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

  it("renders nothing when not visible", () => {
    addAnchor("view-select");
    render(<PageJumpHintOverlay visible={false} />);

    expect(overlayRoot()).toBeNull();
  });

  it("renders nothing when no target is present", () => {
    render(<PageJumpHintOverlay visible={true} />);

    expect(overlayRoot()).toBeNull();
  });

  it("renders a chip for each mounted target, skipping absent ones", () => {
    addAnchor("view-select");
    addAnchor("month-picker");
    // No up-next / calendars anchors: e.g. the sidebar is collapsed.
    render(<PageJumpHintOverlay visible={true} />);

    expect(chipDigits()).toEqual(["1", "2"]);
  });

  it("skips a mounted target with nothing focusable", () => {
    addAnchor("view-select");
    // The empty Up Next card renders its section but no interactive element,
    // so its digit would do nothing and must not be advertised.
    addAnchor("up-next", { focusable: false });
    render(<PageJumpHintOverlay visible={true} />);

    expect(chipDigits()).toEqual(["1"]);
    expect(screen.getByRole("status").textContent).not.toContain("up next");
  });

  it("exposes a screen-reader summary while the visible chips stay aria-hidden", () => {
    addAnchor("view-select");
    addAnchor("month-picker");
    render(<PageJumpHintOverlay visible={true} />);

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Jump to?");
    expect(status.textContent).toContain("1 for view dropdown");
    expect(status.textContent).toContain("2 for month picker");
    expect(chipsWrapper()?.getAttribute("aria-hidden")).not.toBeNull();
  });

  it("renders a custom target list, e.g. Life's, skipping absent targets", () => {
    addAnchor("view-select");
    addAnchor("life-grid");
    // No life-variation / life-details anchors: e.g. the sidebar is collapsed.
    render(
      <PageJumpHintOverlay targets={LIFE_PAGE_JUMP_TARGETS} visible={true} />,
    );

    expect(chipDigits()).toEqual(["1", "2"]);
  });

  it("chips a Day calendar column as 2, after the view dropdown", () => {
    addAnchor("view-select");
    addAnchor(dayColumnJumpId("cal-work"));
    render(
      <PageJumpHintOverlay
        targets={buildDayPageJumpTargets([{ id: "cal-work", name: "Work" }])}
        visible={true}
      />,
    );

    expect(chipDigits()).toEqual(["1", "2"]);
    expect(screen.getByRole("status").textContent).toContain("2 for work");
  });

  it("chips each connected account after Up next", () => {
    addAnchor("view-select");
    addAnchor("month-picker");
    addAnchor("up-next");
    const work = createMockAccountRef("ahab@pequod.com");
    const personal = createMockAccountRef("ahab@gmail.com");
    addAnchor(calendarAccountJumpId(work.key));
    addAnchor(calendarAccountJumpId(personal.key));
    render(
      <PageJumpHintOverlay
        targets={buildCalendarPageJumpTargets([work, personal])}
        visible={true}
      />,
    );

    expect(chipDigits()).toEqual(["1", "2", "3", "4", "5"]);
    expect(screen.getByRole("status").textContent).toContain(
      "4 for ahab@pequod.com (google)",
    );
    expect(screen.getByRole("status").textContent).toContain(
      "5 for ahab@gmail.com (google)",
    );
  });
});
