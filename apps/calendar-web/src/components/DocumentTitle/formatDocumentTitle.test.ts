import dayjs from "@core/util/date/dayjs";
import {
  DOCUMENT_TITLE_BRAND,
  formatDocumentTitle,
  formatViewTitleLabel,
} from "./formatDocumentTitle";
import { describe, expect, it } from "bun:test";

const now = dayjs("2026-08-06T15:00:00.000Z");

describe("formatDocumentTitle", () => {
  it("shows a countdown for an upcoming event", () => {
    expect(
      formatDocumentTitle({
        now,
        event: {
          title: "Standup",
          start: now.add(12, "minute"),
          end: now.add(42, "minute"),
        },
        isCurrentEvent: false,
        viewLabel: "Wed Aug 6",
      }),
    ).toBe(`In 12m: Standup - ${DOCUMENT_TITLE_BRAND}`);
  });

  it("shows Now for an ongoing event", () => {
    expect(
      formatDocumentTitle({
        now,
        event: {
          title: "Standup",
          start: now.subtract(5, "minute"),
          end: now.add(25, "minute"),
        },
        isCurrentEvent: true,
        viewLabel: "Wed Aug 6",
      }),
    ).toBe(`Now: Standup - ${DOCUMENT_TITLE_BRAND}`);
  });

  it("rolls upcoming events up to hours", () => {
    expect(
      formatDocumentTitle({
        now,
        event: {
          title: "Demo",
          start: now.add(120, "minute"),
          end: now.add(150, "minute"),
        },
        isCurrentEvent: false,
        viewLabel: "Wed Aug 6",
      }),
    ).toBe(`In 2h: Demo - ${DOCUMENT_TITLE_BRAND}`);
  });

  it("falls back to the view label when idle", () => {
    expect(
      formatDocumentTitle({
        now,
        event: null,
        isCurrentEvent: false,
        viewLabel: "Wed Aug 6",
      }),
    ).toBe(`Wed Aug 6 - ${DOCUMENT_TITLE_BRAND}`);
  });

  it("uses a placeholder when the event title is blank", () => {
    expect(
      formatDocumentTitle({
        now,
        event: {
          title: "  ",
          start: now.add(5, "minute"),
          end: now.add(35, "minute"),
        },
        isCurrentEvent: false,
        viewLabel: "Wed Aug 6",
      }),
    ).toBe(`In 5m: Event - ${DOCUMENT_TITLE_BRAND}`);
  });
});

describe("formatViewTitleLabel", () => {
  it("formats the day in view", () => {
    expect(
      formatViewTitleLabel({
        pathname: "/day/2026-08-06",
        dayDateString: "2026-08-06",
        weekStart: "2026-08-02T00:00:00.000Z",
        weekEnd: "2026-08-08T23:59:59.999Z",
      }),
    ).toBe("Thu Aug 6");
  });

  it("formats a week range", () => {
    expect(
      formatViewTitleLabel({
        pathname: "/week/2026-08-02",
        weekStart: "2026-08-02T00:00:00.000Z",
        weekEnd: "2026-08-08T23:59:59.999Z",
      }),
    ).toBe("Aug 2 - 8");
  });

  it("labels the life view", () => {
    expect(
      formatViewTitleLabel({
        pathname: "/life",
        weekStart: "2026-08-02T00:00:00.000Z",
        weekEnd: "2026-08-08T23:59:59.999Z",
      }),
    ).toBe("Life");
  });
});
