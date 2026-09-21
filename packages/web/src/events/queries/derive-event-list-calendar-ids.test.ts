import { type CalendarId } from "@core/types/domain-primitives";
import { deriveEventListCalendarIds } from "./derive-event-list-calendar-ids";
import { describe, expect, it } from "bun:test";

const calendar = (
  id: string,
  overrides: { isActive?: boolean; isVisible?: boolean } = {},
) =>
  ({
    id: id as CalendarId,
    isActive: overrides.isActive ?? true,
    isVisible: overrides.isVisible ?? true,
  }) as never;

describe("deriveEventListCalendarIds", () => {
  it("returns undefined when calendars have not loaded", () => {
    expect(deriveEventListCalendarIds(undefined)).toBeUndefined();
  });

  it("returns every active calendar id, including hidden ones", () => {
    expect(
      deriveEventListCalendarIds([
        calendar("a"),
        calendar("b", { isVisible: false }),
        calendar("c", { isActive: false }),
      ]),
    ).toEqual(["a" as CalendarId, "b" as CalendarId]);
  });

  it("returns an empty list when every calendar is inactive", () => {
    expect(
      deriveEventListCalendarIds([
        calendar("a", { isActive: false, isVisible: false }),
      ]),
    ).toEqual([]);
  });
});
