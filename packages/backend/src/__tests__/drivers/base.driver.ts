import { type Application } from "express";
import { agent, type Request } from "supertest";
import { initExpressServer } from "@backend/servers/express/express.server";
import http from "node:http";

export class BaseDriver {
  private app?: Application;
  private http?: http.Server;
  private server?: ReturnType<typeof agent>;
  private serverUri?: string;

  private getSessionCookie(session?: { userId: string }): string {
    return `session=${JSON.stringify(session)}`;
  }

  private ensureServer(): void {
    if (this.app) return;

    this.app = initExpressServer();
    this.http = http.createServer(this.app);
    this.http.timeout = 3000;
    this.http.keepAliveTimeout = 4000;
    this.server = agent(this.http);
  }

  /**
   * listen
   *
   * @returns {string} the server's address
   */
  async listen(): Promise<string> {
    this.ensureServer();
    if (!this.http || !this.server) {
      throw new Error("BaseDriver failed to initialize the HTTP server");
    }

    this.serverUri = await new Promise((resolve, reject) => {
      this.http!.listen(0);
      this.http!.on("listening", () => {
        const address = this.http!.address();
        if (address && typeof address === "object") {
          resolve(`http://localhost:${address.port}`);
        } else {
          reject(new Error("Could not determine server address"));
        }
      });
      this.http!.on("error", reject);
    });

    if (!this.serverUri) {
      throw new Error("Server URI was not resolved");
    }
    return this.serverUri;
  }

  setSessionPlugin(session?: { userId: string }) {
    return (req: Request & { session?: { getUserId: () => string } }): void => {
      if (session) req.set("Cookie", this.getSessionCookie(session));
    };
  }

  getServer() {
    this.ensureServer();
    if (!this.server) {
      throw new Error("BaseDriver failed to initialize supertest agent");
    }
    return this.server;
  }

  getServerUri() {
    if (!this.serverUri) throw new Error("did you forget to call `listen`?");

    return this.serverUri;
  }

  /**
   * openSSEStream
   *
   * Opens an SSE stream for a user, collects events, and returns
   * a handle to close the stream and retrieve collected events.
   */
  openSSEStream(user?: { userId: string; sessionId?: string }): {
    close: () => void;
    waitForEvent: (eventName: string, timeoutMs?: number) => Promise<unknown>;
    /**
     * Resolves once a short event-loop settle passes with no matching event.
     * Prefer this over a fixed multi-hundred-ms timeout when asserting that a
     * publish did not fan out to this stream.
     */
    waitForNoEvent: (eventName: string, settleMs?: number) => Promise<void>;
  } {
    if (!this.serverUri) throw new Error("did you forget to call `listen`?");

    const eventListeners = new Map<string, Array<(data: unknown) => void>>();
    const pendingEvents = new Map<string, unknown[]>();

    const dispatchEvent = (dispatchKey: string, parsed: unknown) => {
      const listeners = eventListeners.get(dispatchKey) ?? [];
      if (listeners.length === 0) {
        const queue = pendingEvents.get(dispatchKey) ?? [];
        queue.push(parsed);
        pendingEvents.set(dispatchKey, queue);
        return;
      }

      for (const cb of listeners) cb(parsed);
    };

    const cookie = user ? this.getSessionCookie(user) : undefined;

    let controller: AbortController | undefined;

    const startStream = async () => {
      controller = new AbortController();
      const headers: Record<string, string> = {
        Accept: "text/event-stream",
      };
      if (cookie) headers["Cookie"] = cookie;

      try {
        const response = await fetch(`${this.serverUri}/api/events/stream`, {
          headers,
          signal: controller.signal,
        });

        const reader = response.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = "";
        let eventName = "message";
        let dataLine = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventName = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              dataLine = line.slice(6).trim();
            } else if (line === "") {
              if (dataLine) {
                const parsed = JSON.parse(dataLine) as unknown;
                // B10: every publish uses the single `message` SSE event
                // name; dispatch test listeners by the ServerMessage's own
                // `type` field instead.
                const dispatchKey =
                  parsed &&
                  typeof parsed === "object" &&
                  "type" in parsed &&
                  typeof (parsed as { type: unknown }).type === "string"
                    ? (parsed as { type: string }).type
                    : eventName;
                dispatchEvent(dispatchKey, parsed);
                eventName = "message";
                dataLine = "";
              }
            }
          }
        }
      } catch {
        // Stream closed or aborted
      }
    };

    void startStream();

    return {
      close: () => controller?.abort(),
      waitForEvent: (eventName: string, timeoutMs = 5000) =>
        new Promise((resolve, reject) => {
          const queued = pendingEvents.get(eventName);
          if (queued?.length) {
            resolve(queued.shift());
            if (queued.length === 0) pendingEvents.delete(eventName);
            else pendingEvents.set(eventName, queued);
            return;
          }

          const timer = setTimeout(() => {
            reject(new Error(`Timeout waiting for SSE event: ${eventName}`));
          }, timeoutMs);

          const listeners = eventListeners.get(eventName) ?? [];
          listeners.push((data) => {
            clearTimeout(timer);
            resolve(data);
          });
          eventListeners.set(eventName, listeners);
        }),
      waitForNoEvent: (eventName: string, settleMs = 40) =>
        new Promise((resolve, reject) => {
          if ((pendingEvents.get(eventName)?.length ?? 0) > 0) {
            reject(
              new Error(`Unexpected SSE event already queued: ${eventName}`),
            );
            return;
          }

          const timer = setTimeout(() => {
            const listeners = eventListeners.get(eventName) ?? [];
            eventListeners.set(
              eventName,
              listeners.filter((cb) => cb !== onEvent),
            );
            resolve();
          }, settleMs);

          const onEvent = () => {
            clearTimeout(timer);
            reject(new Error(`Unexpected SSE event: ${eventName}`));
          };
          const listeners = eventListeners.get(eventName) ?? [];
          listeners.push(onEvent);
          eventListeners.set(eventName, listeners);
        }),
    };
  }

  async teardown() {
    try {
      if (!this.http?.listening) return;

      await new Promise<void>((resolve, reject) => {
        this.http!.close((err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    } catch (error) {
      console.error(error);
    }
  }
}
