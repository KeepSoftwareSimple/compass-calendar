import { type gSchema$Event } from "@core/types/gcal";
import { Origin } from "../constants/core.constants";
import { MapEvent } from "./map.event";

describe("toGcal", () => {
  const validGcalDates = [
    { start: "2022-01-01", end: "2022-01-02" },
    { start: "2022-01-01T07:07:00-05:00", end: "2022-01-01T12:27:23+10:00" },
  ];

  const validateGcalDateFormat = (gEvent: gSchema$Event) => {
    if (!gEvent.start || !gEvent.end) {
      throw new Error("Event must have start and end times");
    }

    // ensures YYYY-MM-DD format
    const _usesDashesCorrectly = (dateStr: string) => {
      expect(dateStr[4]).toBe("-");
      expect(dateStr[7]).toBe("-");
    };

    const _isAllDay = "date" in gEvent.start && "date" in gEvent.end;

    if (_isAllDay && gEvent.start.date && gEvent.end.date) {
      _usesDashesCorrectly(gEvent.start.date);
      _usesDashesCorrectly(gEvent.end.date);
    } else if (gEvent.start.dateTime && gEvent.end.dateTime) {
      const yyyymmddStart = gEvent.start.dateTime.slice(0, 10);
      const yyyymmddEnd = gEvent.end.dateTime.slice(0, 10);
      _usesDashesCorrectly(yyyymmddStart);
      _usesDashesCorrectly(yyyymmddEnd);

      // confirms the expected offset/timezone indicator char is in the string
      // for example, these both match: 2022-01-01T03:00:00-5:00, 2022-01-01T03:00:00+10:00
      // the + or - is the 19th char in the str
      const _hasTzOffset = (dateStr: string) =>
        ["-", "+"].includes(dateStr[19]!);
      _hasTzOffset(gEvent.start.dateTime);
      _hasTzOffset(gEvent.end.dateTime);
    } else {
      throw new Error("Event must have either date or dateTime");
    }
  };

  it("returns dates in expected format", () => {
    validGcalDates.forEach((dates) => {
      const gcalEvt = MapEvent.toGcal({
        startDate: dates.start,
        endDate: dates.end,
      });
      validateGcalDateFormat(gcalEvt);
    });
  });

  it("set origin to unsure as private extended properties when none provided", () => {
    const gcalEvent = MapEvent.toGcal({
      _id: "yupm",
      user: "user1",
      title: "Jan 1 2021",
      isAllDay: true,
      startDate: "2021-01-01",
      endDate: "2021-01-02",
    });
    expect(gcalEvent.extendedProperties?.private?.["origin"]).toBe(
      Origin.UNSURE,
    );
  });
});
