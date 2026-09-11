import { Origin } from "@core/constants/core.constants";
import {
  type CompassEvent,
  ValidatedCompassEventSchema,
} from "@core/types/compass-event.contracts";

describe("ValidatedCompassEventSchema", () => {
  it("strips unexpected properties", () => {
    const event = {
      startDate: "2023-01-01",
      endDate: "2023-01-02",
      origin: Origin.COMPASS,
      user: "user123",
      unexpectedProperty: "unexpectedValue",
    };

    const parsedEvent = ValidatedCompassEventSchema.parse(event);
    expect(parsedEvent).not.toHaveProperty("unexpectedProperty");
  });

  it("validates a correct event", () => {
    const event: CompassEvent = {
      startDate: "2023-01-01",
      endDate: "2023-01-02",
      origin: Origin.COMPASS,
      user: "user123",
    };

    const parsedEvent = ValidatedCompassEventSchema.parse(event);
    expect(parsedEvent).toMatchObject(event);
  });

  it("invalidates when properties are missing", () => {
    const event = {
      startDate: "2023-01-01",
      endDate: "2023-01-02",
      origin: Origin.GOOGLE,
    };

    expect(() => ValidatedCompassEventSchema.parse(event)).toThrow();
  });

  it("invalidates when types are incorrect", () => {
    const event = {
      startDate: 20230101,
      endDate: "2023-01-02",
      origin: "INVALID_ORIGIN",
      user: 123,
    } as unknown as CompassEvent;

    expect(() => ValidatedCompassEventSchema.parse(event)).toThrow();
  });

  it("invalidates when date format is invalid", () => {
    const event: CompassEvent = {
      startDate: "01-01-2023", // wrong format
      endDate: "2023-02-21",
      origin: Origin.GOOGLE_IMPORT,
      user: "user123",
    };

    expect(() => ValidatedCompassEventSchema.parse(event)).toThrow();
  });

  it("invalidates when datetime format is invalid", () => {
    const event: CompassEvent = {
      startDate: "2023-01-01T05:00:00", // missing offset
      endDate: "2023-01-02T15:00:00+02:00",
      origin: Origin.COMPASS,
      user: "user123",
    };

    expect(() => ValidatedCompassEventSchema.parse(event)).toThrow();
  });
});
