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
