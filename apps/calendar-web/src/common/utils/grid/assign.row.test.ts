import { mar13To19 } from "@core/__mocks__/v1/events/events.allday.3";
import { type CompassEvent } from "@core/types/compass-event.contracts";
import { assignEventsToRow } from "@web/common/utils/grid/assign.row";
import { randomUUID } from "node:crypto";

const createId = () => randomUUID();

const assignsRowNumberToEachEvent = (events: CompassEvent[]) => {
  let res = true;
  if (events.length === 0) return false;
  for (const e of events) {
    if (!("row" in e) || typeof e.row !== "number") {
      res = false;
      break;
    }
  }
  return res;
};

const hasNumericRow = (
  event: CompassEvent,
): event is CompassEvent & { row: number } => {
  return "row" in event && typeof event.row === "number";
};

const noEventsOnSameRow = (events: CompassEvent[]) => {
  const rows = events.filter(hasNumericRow).map((event) => event.row);
  const noDuplicates = new Set(rows).size === rows.length;
  return noDuplicates;
};

describe("case: no events", () => {
  it("doesnt create any rows", () => {
    const { rowsCount, allDayEvents } = assignEventsToRow([]);
    expect(rowsCount).toBe(0);
    expect(allDayEvents).toHaveLength(0);
  });
  it("doesnt create any events", () => {
    const { allDayEvents } = assignEventsToRow([]);
    expect(assignsRowNumberToEachEvent(allDayEvents)).toBe(false);
  });
});
describe("case: 1 event, 1 day", () => {
  const { rowsCount, allDayEvents } = assignEventsToRow([
    { startDate: "2024-09-12", endDate: "2024-09-13" },
  ]);
  it("uses 1 row", () => {
    expect(rowsCount).toBe(1);
  });
  it("assigns event to row 1", () => {
    expect(allDayEvents[0].row).toBe(1);
  });
});

describe("case: 4 events, year change", () => {
  const { rowsCount, allDayEvents } = assignEventsToRow([
    /*
    29  30  31  1   2   3   4   5
    -----------------------------
    --  ------  -----

    364 365 366 367 368 369 370 371
    364 365 366 367 368
    */
    { startDate: "2024-12-29", endDate: "2025-01-05", _id: createId() },
    { startDate: "2024-12-30", endDate: "2025-01-01", _id: createId() },
    { startDate: "2025-01-01", endDate: "2025-01-03", _id: createId() },
    { startDate: "2024-12-29", endDate: "2024-12-30", _id: createId() },
  ]);
  it("uses 2 rows", () => {
    expect(rowsCount).toBe(2);
  });
  it("assigns first to row 1, rest to row 2", () => {
    expect(allDayEvents[0].row).toBe(1);
    expect(allDayEvents[1].row).toBe(2);
    expect(allDayEvents[2].row).toBe(2);
    expect(allDayEvents[3].row).toBe(2);
  });
});

describe("case: 2 overlapping events", () => {
  const { rowsCount, allDayEvents } = assignEventsToRow([
    { startDate: "2023-03-29", endDate: "2024-04-02" },
    { startDate: "2023-03-29", endDate: "2024-04-01" },
  ]);
  it("uses 2 rows", () => {
    expect(rowsCount).toBe(2);
  });
  it("assign first event to row 1, second to row 2", () => {
    expect(allDayEvents[0].row).toBe(1);
    expect(allDayEvents[1].row).toBe(2);
  });
});

describe("case: 10 multi-week events with identical times", () => {
  const events = [];
  for (let i = 1; i <= 10; i++) {
    events.push({
      startDate: "2023-12-28",
      endDate: "2024-02-05",
      _id: createId(),
    });
  }
  const { rowsCount, allDayEvents } = assignEventsToRow(events);
  it("creates 10 rows", () => {
    expect(rowsCount).toBe(10);
  });
  it("returns 10 events", () => {
    expect(allDayEvents).toHaveLength(10);
  });
  it("assigns unique row to each event", () => {
    expect(assignsRowNumberToEachEvent(allDayEvents)).toBe(true);
    expect(noEventsOnSameRow(allDayEvents)).toBe(true);
  });
});

describe("case: March 13-19", () => {
  const { rowsCount, allDayEvents } = assignEventsToRow(
    mar13To19 as Parameters<typeof assignEventsToRow>[0],
  );
  it("uses 5 rows", () => {
    expect(rowsCount).toBe(5);
  });
  it("assigns unique row to each", () => {
    expect(assignsRowNumberToEachEvent(allDayEvents)).toBe(true);
  });
});

describe("case: leap year (2024) + year change", () => {
  /*
    27  28  29  1 
    ------  --  --
        --
    <------------->
*/
  const { rowsCount, allDayEvents } = assignEventsToRow([
    { startDate: "2024-02-27", endDate: "2024-02-29", _id: createId() },
    { startDate: "2024-02-28", endDate: "2024-02-29", _id: createId() },
    { startDate: "2024-02-29", endDate: "2024-03-01", _id: createId() },
    { startDate: "2024-03-01", endDate: "2024-03-02", _id: createId() },
    { startDate: "2023-12-30", endDate: "2024-03-06", _id: createId() },
  ]);
  it("uses 3 rows", () => {
    expect(rowsCount).toBe(3);
  });
  it("assigns correctly", () => {
    expect(allDayEvents[0].row).toBe(1);
    expect(allDayEvents[1].row).toBe(2);
    expect(allDayEvents[2].row).toBe(1);
    expect(allDayEvents[3].row).toBe(1);
    expect(allDayEvents[4].row).toBe(3);
  });
});
