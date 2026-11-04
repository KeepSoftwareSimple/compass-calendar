import {
  optionalMeetingTypeId,
  selectPublicMeetingType,
} from "@booking-web/booking/public-booking-meeting-types";
import { describe, expect, it } from "bun:test";

const intro = { id: "intro", label: "Intro call", durationMinutes: 15 };
const deep = { id: "deep-dive", label: "Deep dive", durationMinutes: 60 };
const page = { durationMinutes: 15, meetingTypes: [intro, deep] };

describe("optionalMeetingTypeId", () => {
  it("omits type #1 and keeps every other id", () => {
    expect(optionalMeetingTypeId([intro, deep], "intro")).toBeUndefined();
    expect(optionalMeetingTypeId([intro, deep], "deep-dive")).toBe("deep-dive");
  });
});

describe("selectPublicMeetingType", () => {
  it("sends no request id for type #1, including an unknown pick", () => {
    expect(
      selectPublicMeetingType(page, undefined).requestTypeId,
    ).toBeUndefined();
    expect(selectPublicMeetingType(page, "gone").requestTypeId).toBeUndefined();
    expect(selectPublicMeetingType(page, "deep-dive").requestTypeId).toBe(
      "deep-dive",
    );
  });
});
