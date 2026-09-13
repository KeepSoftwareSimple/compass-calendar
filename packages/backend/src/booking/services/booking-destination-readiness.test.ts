import { ObjectId } from "mongodb";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import { type ProviderCalendar } from "@core/types/sync/connection.contracts";
import { destinationReadinessReason } from "@backend/booking/services/booking-destination-readiness";
import { describe, expect, it } from "bun:test";

const calendarId = () => CalendarIdSchema.parse(new ObjectId().toString());

const catalogCalendar = (
  id: string,
  overrides: {
    connectionId?: string;
    canWriteEvents?: boolean;
    active?: boolean;
  } = {},
) =>
  ({
    id,
    connectionId: overrides.connectionId ?? "conn-dest",
    active: overrides.active ?? true,
    capabilities: {
      canReadEvents: true,
      canWriteEvents: overrides.canWriteEvents ?? true,
      canReadBusy: true,
      canInviteAttendees: true,
    },
  }) as unknown as ProviderCalendar;

describe("destinationReadinessReason", () => {
  it("is silent when the destination is writable on a healthy connection", () => {
    const destination = calendarId();
    expect(
      destinationReadinessReason(destination, {
        calendars: [catalogCalendar(destination)],
        connections: [{ id: "conn-dest", state: "healthy" }],
      }),
    ).toBeNull();
  });

  it("does not let a healthy blocker mask a missing destination", () => {
    const destination = calendarId();
    const blocker = calendarId();
    expect(
      destinationReadinessReason(destination, {
        calendars: [catalogCalendar(blocker, { connectionId: "conn-block" })],
        connections: [
          { id: "conn-block", state: "healthy" },
          { id: "conn-dest", state: "healthy" },
        ],
      }),
    ).toMatchObject({
      kind: "calendar",
      reason: "notImported",
      calendarId: destination,
    });
  });

  it("reports a disconnected destination connection", () => {
    const destination = calendarId();
    expect(
      destinationReadinessReason(destination, {
        calendars: [catalogCalendar(destination)],
        connections: [{ id: "conn-dest", state: "disconnected" }],
      }),
    ).toMatchObject({
      kind: "connection",
      reason: "disconnected",
      connectionState: "disconnected",
    });
  });

  it("treats an inactive destination as missing", () => {
    const destination = calendarId();
    expect(
      destinationReadinessReason(destination, {
        calendars: [catalogCalendar(destination, { active: false })],
        connections: [{ id: "conn-dest", state: "healthy" }],
      }),
    ).toMatchObject({
      kind: "calendar",
      reason: "notImported",
      calendarId: destination,
    });
  });

  it("reports a read-only destination", () => {
    const destination = calendarId();
    expect(
      destinationReadinessReason(destination, {
        calendars: [catalogCalendar(destination, { canWriteEvents: false })],
        connections: [{ id: "conn-dest", state: "healthy" }],
      }),
    ).toMatchObject({
      kind: "calendar",
      reason: "notWritable",
      calendarId: destination,
    });
  });
});
