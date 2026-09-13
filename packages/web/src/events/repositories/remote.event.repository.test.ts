import { type EventId } from "@core/types/domain-primitives";
import {
  type CreateEventInput,
  type EventListQuery,
} from "@core/types/event-command.contracts";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { type EventApi } from "@web/events/event.api";
import { RemoteEventRepository } from "@web/events/repositories/remote.event.repository";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const api = {
  create: mock(),
  list: mock(),
  replace: mock(),
  delete: mock(),
  // Not part of the repository surface — RSVP bypasses the repository (it
  // only exists for provider-backed events), but the mock mirrors the full
  // EventApi shape.
  rsvpEvent: mock(),
} satisfies Record<keyof typeof EventApi, ReturnType<typeof mock>>;

const repository = new RemoteEventRepository(api as unknown as typeof EventApi);

function createBackendUnavailableError(): Error {
  const error = new Error("Request failed");
  error.name = "ApiError";
  return error;
}

describe("RemoteEventRepository", () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockClear();
  });

  describe("create", () => {
    it("calls EventApi.create with the command input", async () => {
      const event = createMockEvent();
      const input: CreateEventInput = {
        calendarId: event.calendarId,
        content: event.content as CreateEventInput["content"],
        schedule: event.schedule,
        recurrence: { kind: "single" as const },
      };

      api.create.mockResolvedValue(event);

      const result = await repository.create(input);

      expect(api.create).toHaveBeenCalledWith(input);
      expect(result).toEqual(event);
    });

    it("fails closed when the backend is unavailable", async () => {
      const event = createMockEvent();
      const input: CreateEventInput = {
        calendarId: event.calendarId,
        content: event.content as CreateEventInput["content"],
        schedule: event.schedule,
        recurrence: { kind: "single" as const },
      };

      api.create.mockRejectedValue(createBackendUnavailableError());
      await expect(repository.create(input)).rejects.toMatchObject({
        name: "ApiError",
      });
    });
  });

  describe("list", () => {
    it("calls EventApi.list and returns its events", async () => {
      const events = [createMockEvent()];
      api.list.mockResolvedValue(events);

      const query = {
        kind: "range" as const,
        start: "2024-01-01T00:00:00.000Z",
        end: "2024-01-31T00:00:00.000Z",
      } as unknown as EventListQuery;
      const result = await repository.list(query);

      expect(api.list).toHaveBeenCalledWith(query, undefined);
      expect(result).toEqual(events);
    });

    it("forwards the abort signal to EventApi.list", async () => {
      const events = [createMockEvent()];
      api.list.mockResolvedValue(events);
      const query = {
        kind: "range" as const,
        start: "2024-01-01T00:00:00.000Z",
        end: "2024-01-31T00:00:00.000Z",
      } as unknown as EventListQuery;
      const controller = new AbortController();

      await repository.list(query, controller.signal);

      expect(api.list).toHaveBeenCalledWith(query, controller.signal);
    });

    it("does not replace cloud events with local events when the backend is unavailable", async () => {
      const query = {
        kind: "range" as const,
        start: "2024-01-01T00:00:00.000Z",
        end: "2024-01-31T00:00:00.000Z",
      } as unknown as EventListQuery;

      api.list.mockRejectedValue(createBackendUnavailableError());
      await expect(repository.list(query)).rejects.toMatchObject({
        name: "ApiError",
      });
    });
  });

  describe("delete", () => {
    it("calls EventApi.delete with the event id and scope", async () => {
      api.delete.mockResolvedValue(undefined);

      await repository.delete("event-1" as EventId, "all");

      expect(api.delete).toHaveBeenCalledWith("event-1", "all");
      expect(api.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe("replace", () => {
    const baseInput = {
      content: {
        kind: "details" as const,
        title: "Updated",
        description: "",
        location: "",
      },
      schedule: createMockEvent().schedule,
      recurrence: { kind: "preserve" as const },
      scope: "this" as const,
    };

    it("calls EventApi.replace with the event id and input", async () => {
      const event = createMockEvent();
      api.replace.mockResolvedValue(event);

      const result = await repository.replace(event.id, baseInput);

      expect(api.replace).toHaveBeenCalledWith(event.id, baseInput);
      expect(result).toEqual(event);
    });

    it("fails closed when the backend is unavailable", async () => {
      const event = createMockEvent();
      api.replace.mockRejectedValue(createBackendUnavailableError());
      await expect(
        repository.replace(event.id, baseInput),
      ).rejects.toMatchObject({ name: "ApiError" });
    });

    it("also fails closed for scope-all occurrence replaces", async () => {
      const occurrenceId =
        "aaaaaaaaaaaaaaaaaaaaaaaa::2026-07-03T16:00:00.000Z" as EventId;
      const input = { ...baseInput, scope: "all" as const };
      const unavailable = createBackendUnavailableError();
      api.replace.mockRejectedValue(unavailable);

      await expect(repository.replace(occurrenceId, input)).rejects.toBe(
        unavailable,
      );
    });
  });
});
