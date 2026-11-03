import {
  addMeetingType,
  newMeetingTypeId,
  removeMeetingType,
  setMeetingTypeDuration,
  setMeetingTypeLabel,
} from "@web/booking/booking-meeting-types.util";
import { describe, expect, it } from "bun:test";

const legacy = { durationMinutes: 30 as const, meetingTypes: undefined };

describe("booking meeting types util", () => {
  it("sends only durationMinutes when a legacy page changes type #1", () => {
    expect(setMeetingTypeDuration(legacy, 0, 45)).toEqual({
      durationMinutes: 45,
    });
  });

  it("renames a default label with its duration but keeps a typed one", () => {
    const form = {
      durationMinutes: 30 as const,
      meetingTypes: [
        {
          id: "default",
          label: "30 min meeting",
          durationMinutes: 30 as const,
        },
        { id: "type-a", label: "Deep dive", durationMinutes: 60 as const },
      ],
    };
    expect(setMeetingTypeDuration(form, 0, 15)).toEqual({
      durationMinutes: 15,
      meetingTypes: [
        { id: "default", label: "15 min meeting", durationMinutes: 15 },
        form.meetingTypes[1],
      ],
    });
    expect(setMeetingTypeDuration(form, 1, 45).meetingTypes?.[1]).toEqual({
      id: "type-a",
      label: "Deep dive",
      durationMinutes: 45,
    });
  });

  it("adds an unused duration with a unique id, up to three", () => {
    const first = addMeetingType(legacy, () => "type-one");
    expect(first?.patch).toEqual({
      durationMinutes: 30,
      meetingTypes: [
        { id: "default", label: "30 min meeting", durationMinutes: 30 },
        { id: "type-one", label: "15 min meeting", durationMinutes: 15 },
      ],
    });
    const second = addMeetingType(
      first?.patch as typeof legacy,
      () => "type-two",
    );
    expect(second?.patch.meetingTypes).toHaveLength(3);
    expect(second?.patch.meetingTypes?.[2]?.durationMinutes).toBe(45);
    expect(
      addMeetingType(second?.patch as typeof legacy, () => "type-x"),
    ).toBeNull();
  });

  it("never reuses a taken id", () => {
    const suffixes = ["aaaaaa", "aaaaaa", "bbbbbb"];
    expect(
      newMeetingTypeId(["type-aaaaaa"], () => suffixes.shift() ?? ""),
    ).toBe("type-bbbbbb");
  });

  it("keeps durationMinutes on type #1 after removing it", () => {
    const form = {
      durationMinutes: 30 as const,
      meetingTypes: [
        {
          id: "default",
          label: "30 min meeting",
          durationMinutes: 30 as const,
        },
        { id: "type-a", label: "Deep dive", durationMinutes: 60 as const },
      ],
    };
    expect(removeMeetingType(form, 0)).toEqual({
      durationMinutes: 60,
      meetingTypes: [form.meetingTypes[1]],
    });
    expect(
      removeMeetingType({ ...form, meetingTypes: [form.meetingTypes[0]] }, 0),
    ).toBeNull();
  });

  it("edits a label", () => {
    expect(
      setMeetingTypeLabel(legacy, 0, "Intro").meetingTypes?.[0]?.label,
    ).toBe("Intro");
  });
});
