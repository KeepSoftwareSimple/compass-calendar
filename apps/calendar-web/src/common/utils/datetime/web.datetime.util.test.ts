import {
  shouldAdjustComplimentDate,
  shouldAdjustComplimentTime,
} from "@web/common/utils/datetime/web.datetime.util";

describe("Dates", () => {
  it("recognizes date adjustment after changing start", () => {
    const impossibleStart = shouldAdjustComplimentDate("start", {
      start: new Date("2022-06-06"),
      end: new Date("2022-06-04"),
    });
    expect(impossibleStart.shouldAdjust).toBe(true);
    expect(impossibleStart.compliment).toEqual(new Date("2022-06-06"));

    const sameStartAsEnd = shouldAdjustComplimentDate("start", {
      start: new Date("2022-11-11"),
      end: new Date("2022-11-11"),
    });
    expect(sameStartAsEnd.shouldAdjust).toBe(false);

    const noAdjustment = shouldAdjustComplimentDate("start", {
      start: new Date("2022-10-10"),
      end: new Date("2022-11-11"),
    });

    expect(noAdjustment.shouldAdjust).toBe(false);
  });
  it("recognizes date adjustment after changing end", () => {
    const impossibleEnd = shouldAdjustComplimentDate("end", {
      start: new Date("2022-02-02"),
      end: new Date("2022-01-01"),
    });
    expect(impossibleEnd.shouldAdjust).toBe(true);
    expect(impossibleEnd.compliment).toEqual(new Date("2022-01-01"));

    const sameStartAsEnd = shouldAdjustComplimentDate("end", {
      start: new Date("2022-05-05"),
      end: new Date("2022-05-05"),
    });
    expect(sameStartAsEnd.shouldAdjust).toBe(false);

    const noAdjustment = shouldAdjustComplimentDate("end", {
      start: new Date("2022-04-04"),
      end: new Date("2022-04-05"),
    });

    expect(noAdjustment.shouldAdjust).toBe(false);
  });
});

describe("Time Options", () => {
  it("recognizes adjustment needed after changing start", () => {
    const impossibleStart = shouldAdjustComplimentTime("start", {
      oldStart: "1:00 AM",
      oldEnd: "2:00 AM",

      start: "5:00 AM",
      end: "2:00 AM", // should be 600
    });

    expect(impossibleStart).toMatchObject({
      shouldAdjust: true,
      adjustment: 240,
    });

    const sameStartAsEnd = shouldAdjustComplimentTime("start", {
      oldStart: "7:00 PM",
      oldEnd: "7:15 PM",

      start: "7:15 PM",
      end: "7:15 PM", // should be 730
    });

    expect(sameStartAsEnd).toMatchObject({
      shouldAdjust: true,
      adjustment: 15,
    });

    const noAdjustment = shouldAdjustComplimentTime("start", {
      oldStart: "9:45 PM",
      oldEnd: "11:45 PM",

      start: "5 PM",
      end: "11:45 PM",
    });

    expect(noAdjustment.shouldAdjust).toBe(false);
  });

  it("recognizes adjustment needed after changing end", () => {
    const impossibleEnd = shouldAdjustComplimentTime("end", {
      oldStart: "11:00 AM",
      oldEnd: "2:00 PM",

      start: "11:00 AM", // should be 6 PM, 5 hr adjustment
      end: "9:00 AM",
    });

    expect(impossibleEnd).toMatchObject({
      shouldAdjust: true,
      adjustment: 60 * 5,
    });

    const sameStartAsEnd = shouldAdjustComplimentTime("end", {
      oldStart: "7:00 PM",
      oldEnd: "7:15 PM",

      start: "7:15 PM",
      end: "7:00 PM",
    });

    expect(sameStartAsEnd).toMatchObject({
      shouldAdjust: true,
      adjustment: 30,
    });

    const noAdjustment = shouldAdjustComplimentTime("end", {
      oldStart: "9:45 PM",
      oldEnd: "11:45 PM",

      start: "5 PM",
      end: "11:45 PM",
    });

    expect(noAdjustment.shouldAdjust).toBe(false);
  });
});
