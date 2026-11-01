import { CalendarIdSchema, EventIdSchema } from "@core/types/domain-primitives";
import dayjs from "@core/util/date/dayjs";
import { buildQuickFirstEventCreateInput } from "@web/components/FirstEventPrompt/buildQuickFirstEventCreateInput";
import { FIRST_EVENT_DEFAULT_TITLE } from "@web/components/FirstEventPrompt/first-event.constants";
import { describe, expect, it } from "bun:test";

describe("buildQuickFirstEventCreateInput", () => {
  it("builds a timed Coffee create payload", () => {
    const calendarId = CalendarIdSchema.parse("507f1f77bcf86cd799439011");
    const input = buildQuickFirstEventCreateInput(
      dayjs("2026-05-20T00:00:00.000Z"),
      calendarId,
    );

    expect(input).not.toBeNull();
    expect(input?.calendarId).toBe(calendarId);
    expect(input?.content?.kind).toBe("details");
    if (input?.content?.kind === "details") {
      expect(input.content.title).toBe(FIRST_EVENT_DEFAULT_TITLE);
    }
    expect(EventIdSchema.safeParse(input?.id).success).toBe(true);
    expect(input?.schedule.kind).toBe("timed");
  });
});
