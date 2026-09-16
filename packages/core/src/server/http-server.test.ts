import {
  configureHttpServer,
  HTTP_SERVER_LIMITS,
  INTERNAL_HTTP_SERVER_LIMITS,
} from "@core/server/http-server";
import { afterEach, describe, expect, it } from "bun:test";
import { createServer, type Server } from "node:http";
import { type AddressInfo, connect, type Socket } from "node:net";

describe("configureHttpServer", () => {
  const servers: Server[] = [];
  const sockets: Socket[] = [];

  afterEach(async () => {
    for (const socket of sockets.splice(0)) {
      socket.destroy();
    }
    await Promise.all(servers.splice(0).map(closeServer));
  });

  it("applies the public limits by default", () => {
    const server = track(configureHttpServer(createServer()));

    expect(server.headersTimeout).toBe(HTTP_SERVER_LIMITS.headersTimeoutMs);
    expect(server.requestTimeout).toBe(HTTP_SERVER_LIMITS.requestTimeoutMs);
    expect(server.keepAliveTimeout).toBe(HTTP_SERVER_LIMITS.keepAliveTimeoutMs);
    expect(server.maxHeadersCount).toBe(HTTP_SERVER_LIMITS.maxHeadersCount);
    expect(server.maxRequestsPerSocket).toBe(
      HTTP_SERVER_LIMITS.maxRequestsPerSocket,
    );
  });

  it("applies the internal Sync limits when given them", () => {
    const server = track(
      configureHttpServer(createServer(), INTERNAL_HTTP_SERVER_LIMITS),
    );

    expect(server.keepAliveTimeout).toBe(
      INTERNAL_HTTP_SERVER_LIMITS.keepAliveTimeoutMs,
    );
    expect(server.maxRequestsPerSocket).toBe(0);
    expect(server.headersTimeout).toBe(
      INTERNAL_HTTP_SERVER_LIMITS.headersTimeoutMs,
    );
    expect(server.requestTimeout).toBe(
      INTERNAL_HTTP_SERVER_LIMITS.requestTimeoutMs,
    );
    expect(server.maxHeadersCount).toBe(
      INTERNAL_HTTP_SERVER_LIMITS.maxHeadersCount,
    );
  });

  it(
    "keeps an idle keep-alive socket usable for 10s on the internal limits",
    async () => {
      const server = track(
        configureHttpServer(
          createServer((_req, res) => {
            res.setHeader("Content-Length", "2");
            res.end("ok");
          }),
          INTERNAL_HTTP_SERVER_LIMITS,
        ),
      );
      const port = await listen(server);
      const socket = trackSocket(await connectTo(port));

      const first = await keepAliveGet(socket);
      expect(statusLine(first)).toBe("HTTP/1.1 200 OK");

      await Bun.sleep(10_000);

      const second = await keepAliveGet(socket);
      expect(statusLine(second)).toBe("HTTP/1.1 200 OK");
    },
    { timeout: 15_000 },
  );

  it("enforces maxRequestsPerSocket with 503 after the cap", async () => {
    const server = track(
      configureHttpServer(
        createServer((_req, res) => {
          res.setHeader("Content-Length", "2");
          res.end("ok");
        }),
        { ...HTTP_SERVER_LIMITS, maxRequestsPerSocket: 2 },
      ),
    );
    const port = await listen(server);
    const socket = trackSocket(await connectTo(port));

    expect(statusLine(await keepAliveGet(socket))).toBe("HTTP/1.1 200 OK");
    expect(statusLine(await keepAliveGet(socket))).toBe("HTTP/1.1 200 OK");
    expect(statusLine(await keepAliveGet(socket))).toBe(
      "HTTP/1.1 503 Service Unavailable",
    );
  });

  it("does not cap requests when maxRequestsPerSocket is 0", async () => {
    const server = track(
      configureHttpServer(
        createServer((_req, res) => {
          res.setHeader("Content-Length", "2");
          res.end("ok");
        }),
        INTERNAL_HTTP_SERVER_LIMITS,
      ),
    );
    const port = await listen(server);
    const socket = trackSocket(await connectTo(port));

    for (let i = 0; i < 5; i++) {
      expect(statusLine(await keepAliveGet(socket))).toBe("HTTP/1.1 200 OK");
    }
  });

  // Bun 1.3.14 assigns these four node:http knobs but does not enforce
  // them. The tests below pin that so a runtime change is a failing
  // assertion rather than a silent policy drift. keepAliveTimeout is
  // still set (65s internal) for Node and for a future Bun that honors it.
  it("does not close a keep-alive socket when keepAliveTimeout elapses", async () => {
    const server = track(
      configureHttpServer(
        createServer((_req, res) => {
          res.setHeader("Content-Length", "2");
          res.end("ok");
        }),
        { ...HTTP_SERVER_LIMITS, keepAliveTimeoutMs: 200 },
      ),
    );
    const port = await listen(server);
    const socket = trackSocket(await connectTo(port));

    expect(statusLine(await keepAliveGet(socket))).toBe("HTTP/1.1 200 OK");
    await Bun.sleep(600);
    expect(socket.destroyed).toBe(false);
    expect(statusLine(await keepAliveGet(socket))).toBe("HTTP/1.1 200 OK");
  });

  it("does not close a socket that stalls mid-headers past headersTimeout", async () => {
    const server = track(
      configureHttpServer(
        createServer((_req, res) => res.end("ok")),
        {
          ...HTTP_SERVER_LIMITS,
          headersTimeoutMs: 200,
          keepAliveTimeoutMs: 50,
        },
      ),
    );
    const port = await listen(server);
    const socket = trackSocket(await connectTo(port));
    socket.write("GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n");
    await Bun.sleep(600);
    expect(socket.destroyed).toBe(false);
    expect(socket.readable).toBe(true);
  });

  it("does not close a socket that stalls mid-body past requestTimeout", async () => {
    const server = track(
      configureHttpServer(
        createServer((_req, res) => res.end("ok")),
        {
          ...HTTP_SERVER_LIMITS,
          requestTimeoutMs: 200,
          headersTimeoutMs: 10_000,
        },
      ),
    );
    const port = await listen(server);
    const socket = trackSocket(await connectTo(port));
    socket.write(
      "POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 1000\r\n\r\npartial",
    );
    await Bun.sleep(600);
    expect(socket.destroyed).toBe(false);
    expect(socket.readable).toBe(true);
  });

  it("does not reject a request that exceeds maxHeadersCount", async () => {
    const server = track(
      configureHttpServer(
        createServer((_req, res) => {
          res.setHeader("Content-Length", "2");
          res.end("ok");
        }),
        { ...HTTP_SERVER_LIMITS, maxHeadersCount: 5 },
      ),
    );
    const port = await listen(server);
    const socket = trackSocket(await connectTo(port));
    const extra = Array.from({ length: 30 }, (_, i) => `X-H-${i}: v${i}`).join(
      "\r\n",
    );
    socket.write(
      `GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: keep-alive\r\n${extra}\r\n\r\n`,
    );
    const response = await readHttpResponse(socket);
    expect(statusLine(response)).toBe("HTTP/1.1 200 OK");
  });

  function track(server: Server): Server {
    servers.push(server);
    return server;
  }

  function trackSocket(socket: Socket): Socket {
    sockets.push(socket);
    return socket;
  }
});

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      resolve((server.address() as AddressInfo).port);
    });
    server.once("error", reject);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function connectTo(port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: "127.0.0.1", port }, () => resolve(socket));
    socket.once("error", reject);
  });
}

async function keepAliveGet(socket: Socket): Promise<string> {
  socket.write(
    "GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: keep-alive\r\n\r\n",
  );
  return readHttpResponse(socket);
}

function readHttpResponse(socket: Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `timed out waiting for HTTP response: ${JSON.stringify(data)}`,
        ),
      );
    }, 2_000);
    const finish = (value: string) => {
      cleanup();
      resolve(value);
    };
    const onData = (chunk: Buffer) => {
      data += chunk.toString("latin1");
      const headerEnd = data.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const body = data.slice(headerEnd + 4);
      const lengthMatch = /content-length:\s*(\d+)/i.exec(
        data.slice(0, headerEnd),
      );
      if (lengthMatch && body.length < Number(lengthMatch[1])) return;
      finish(data);
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
    };
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

function statusLine(response: string): string {
  return response.split("\r\n")[0] ?? "";
}
