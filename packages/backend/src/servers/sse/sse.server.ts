import { type Response } from "express";
import { SSE_MESSAGE_EVENT } from "@core/constants/sse.constants";
import { Logger } from "@core/logger/winston.logger";
import { type CalendarId, type EventId } from "@core/types/domain-primitives";
import { type ServerMessage } from "@core/types/server-message.contracts";
import {
  defaultSchedule,
  type TickScheduler,
} from "@backend/servers/sse/tick-scheduler";

const logger = Logger("app:sse.server");
const HEARTBEAT_INTERVAL_MS = 25_000;
export const SSE_RETRY_HINT_MS = 5_000;
export const SSE_STREAM_LIFETIME_MS = 20 * 60 * 1000;

export class SSEServer {
  private connections = new Map<string, Set<Response>>();
  private lifetimes = new WeakMap<Response, { clear: () => void }>();
  private schedule: TickScheduler;

  constructor(schedule: TickScheduler = defaultSchedule) {
    this.schedule = schedule;
    // .unref() prevents the interval from keeping the Node.js process alive in
    // tests and graceful shutdown scenarios.
    setInterval(() => {
      for (const [userId, conns] of this.connections) {
        for (const res of conns) {
          try {
            res.write(": keepalive\n\n");
          } catch {
            this.removeConnection(userId, res);
          }
        }
      }
    }, HEARTBEAT_INTERVAL_MS).unref();
  }

  private removeConnection(userId: string, res: Response): void {
    this.lifetimes.get(res)?.clear();
    this.lifetimes.delete(res);
    const conns = this.connections.get(userId);
    if (!conns) return;
    conns.delete(res);
    if (conns.size === 0) this.connections.delete(userId);
    logger.debug(`SSE dead connection removed for user: ${userId}`);
  }

  subscribe(userId: string, res: Response): () => void {
    try {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
    } catch {
      // The client can disconnect between the request arriving and headers
      // being flushed. Bun's runtime throws on flushHeaders() in that race
      // instead of no-op'ing like Node, so treat it like any other dead
      // connection: nothing was registered, so there is nothing to tear down.
      logger.debug(
        `SSE connection already closed before open for user: ${userId}`,
      );
      return () => {};
    }

    const conns = this.connections.get(userId) ?? new Set<Response>();
    conns.add(res);
    this.connections.set(userId, conns);
    try {
      res.write(`retry: ${SSE_RETRY_HINT_MS}\n\n`);
    } catch {
      this.removeConnection(userId, res);
      return () => {};
    }

    this.lifetimes.set(
      res,
      this.schedule(() => {
        try {
          res.end();
        } catch {
          // Already closed.
        }
        this.removeConnection(userId, res);
      }, SSE_STREAM_LIFETIME_MS),
    );
    logger.debug(
      `SSE connection opened for user: ${userId} (total: ${conns.size})`,
    );

    return () => {
      this.removeConnection(userId, res);
      logger.debug(`SSE connection closed for user: ${userId}`);
    };
  }

  // Active SSE connections for a user.
  subscriberCount(userId: string): number {
    return this.connections.get(userId)?.size ?? 0;
  }

  // Every currently-connected user id. The Sync change-feed bridge's single
  // global poller uses this to broad-invalidate everyone on a
  // resyncRequired: with one shared cursor for the whole process, a stale
  // cursor means any currently-subscribed user may have missed something,
  // not just one.
  connectedUserIds(): string[] {
    return [...this.connections.keys()];
  }

  publish(userId: string, message: ServerMessage): void {
    const conns = this.connections.get(userId);
    if (!conns?.size) return;
    const payload = `event: ${SSE_MESSAGE_EVENT}\ndata: ${JSON.stringify(message)}\n\n`;
    for (const res of conns) {
      try {
        res.write(payload);
      } catch {
        this.removeConnection(userId, res);
      }
    }
  }

  publishTo(res: Response, message: ServerMessage): void {
    const payload = `event: ${SSE_MESSAGE_EVENT}\ndata: ${JSON.stringify(message)}\n\n`;
    try {
      res.write(payload);
    } catch {
      // Connection already closed
    }
  }

  publishEventsChanged(
    userId: string,
    payload: {
      calendarId: CalendarId;
      eventIds: EventId[];
      reason: "created" | "updated" | "deleted" | "reconciled";
    },
  ): void {
    this.publish(userId, { type: "eventsChanged", ...payload });
  }

  publishCalendarsChanged(userId: string, calendarIds: CalendarId[]): void {
    this.publish(userId, { type: "calendarsChanged", calendarIds });
  }

  publishSyncStatus(
    userId: string,
    sync: Extract<ServerMessage, { type: "syncStatusChanged" }>["sync"],
  ): void {
    this.publish(userId, { type: "syncStatusChanged", sync });
  }

  publishImportCompleted(
    userId: string,
    payload: {
      operation: "full" | "incremental" | "repair";
      eventsCount: number;
      calendarsCount: number;
    },
  ): void {
    this.publish(userId, { type: "importCompleted", ...payload });
  }

  publishUserMetadata(userId: string, metadata: Record<string, unknown>): void {
    this.publish(userId, { type: "userMetadataChanged", metadata });
  }
}

export const sseServer = new SSEServer();
