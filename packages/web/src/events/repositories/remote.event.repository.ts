import { type EventId } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import {
  type CreateEventInput,
  type EventListQuery,
  type RecurrenceScope,
  type ReplaceEventInput,
} from "@core/types/event-command.contracts";
import { EventApi } from "@web/events/event.api";
import { type EventRepository } from "./event.repository.types";

export class RemoteEventRepository implements EventRepository {
  constructor(private readonly api: typeof EventApi = EventApi) {}

  async list(query: EventListQuery, signal?: AbortSignal): Promise<Event[]> {
    return this.api.list(query, signal);
  }

  async create(input: CreateEventInput): Promise<Event> {
    return this.api.create(input);
  }

  async replace(id: EventId, input: ReplaceEventInput): Promise<Event> {
    return this.api.replace(id, input);
  }

  async delete(id: EventId, scope: RecurrenceScope): Promise<void> {
    await this.api.delete(id, scope);
  }
}
