import { microsoftStatus } from "@sync/providers/microsoft/microsoft-error";
import { microsoftGraphRequest } from "@sync/providers/microsoft/microsoft-graph-request";
import { afterEach, describe, expect, it, mock } from "bun:test";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("microsoftGraphRequest", () => {
  it("sends a bearer token and returns JSON on success", async () => {
    const fetchMock = mock(() =>
      Promise.resolve(jsonResponse(200, { id: "cal-1" })),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const data = await microsoftGraphRequest<{ id: string }>({
      accessToken: "token-1",
      url: "https://graph.microsoft.com/v1.0/me/calendars",
      fallbackError: "microsoft_calendar_list_failed",
    });

    expect(data).toEqual({ id: "cal-1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({
      Authorization: "Bearer token-1",
    });
  });

  it("throws the Graph status shape classifiers already read", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(jsonResponse(401, { error: { message: "Expired" } })),
    ) as unknown as typeof fetch;

    try {
      await microsoftGraphRequest({
        accessToken: "token-1",
        url: "https://graph.microsoft.com/v1.0/me/events",
        fallbackError: "microsoft_event_delta_failed",
      });
      expect.unreachable("expected the request to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Expired");
      expect(microsoftStatus(error)).toBe(401);
    }
  });

  it("retries a 429 after Retry-After and then succeeds", async () => {
    const fetchMock = mock(() => {
      if (fetchMock.mock.calls.length === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: { message: "throttled" } }), {
            status: 429,
            headers: { "Retry-After": "0", "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(jsonResponse(200, { id: "cal-2" }));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const data = await microsoftGraphRequest<{ id: string }>({
      accessToken: "token-1",
      url: "https://graph.microsoft.com/v1.0/me/calendars",
      fallbackError: "microsoft_calendar_list_failed",
    });

    expect(data).toEqual({ id: "cal-2" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("attaches HTTP status and content-type when the JSON body is not parseable", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response("<html>bad gateway</html>", {
          status: 502,
          headers: { "Content-Type": "text/html" },
        }),
      ),
    ) as unknown as typeof fetch;

    try {
      await microsoftGraphRequest({
        accessToken: "token-1",
        url: "https://graph.microsoft.com/v1.0/me/calendars",
        fallbackError: "microsoft_calendar_list_failed",
      });
      expect.unreachable("expected the request to reject");
    } catch (error) {
      expect((error as Error).message).toBe("Failed to parse JSON");
      expect(microsoftStatus(error)).toBe(502);
      expect(
        (error as { response?: { headers?: { "content-type"?: string } } })
          .response?.headers?.["content-type"],
      ).toBe("text/html");
    }
  });

  it("skips the JSON body on a successful emptyOk delete", async () => {
    const fetchMock = mock(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      microsoftGraphRequest<void>({
        accessToken: "token-1",
        url: "https://graph.microsoft.com/v1.0/subscriptions/sub-1",
        method: "DELETE",
        fallbackError: "microsoft_subscription_delete_failed",
        emptyOk: true,
      }),
    ).resolves.toBeUndefined();
  });
});
