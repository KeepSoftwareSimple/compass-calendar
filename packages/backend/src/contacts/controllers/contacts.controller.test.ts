import { type Response } from "express";
import { type SessionRequest } from "supertokens-node/framework/express";
import { Status } from "@core/errors/status.codes";
import { CONTACT_SUGGESTION_QUERY_MAX_LENGTH } from "@core/types/contact.contracts";
import * as syncServiceFactory from "@backend/common/services/sync-service/sync-service.factory";
import contactsController, {
  contactSuggestionsFailureLogLine,
} from "./contacts.controller";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

const sessionReq = (userId: string, query: Record<string, unknown> = {}) =>
  ({
    session: { getUserId: () => userId },
    query,
    params: {},
    body: {},
  }) as unknown as SessionRequest;

const jsonRes = () => {
  const json = mock();
  const res = {
    status: mock().mockReturnThis(),
    json,
  } as unknown as Response;
  return { res, json };
};

const mockClient = (
  getContactSuggestions: ReturnType<typeof mock>,
): ReturnType<typeof spyOn> =>
  spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
    getContactSuggestions,
  } as unknown as ReturnType<typeof syncServiceFactory.getSyncServiceClient>);

afterEach(() => {
  mock.restore();
});

describe("ContactsController suggestions", () => {
  const userId = "507f1f77bcf86cd799439011";

  it("proxies sync's ranked suggestions through unchanged", async () => {
    const suggestions = [
      { email: "ada@example.com", displayName: "Ada Lovelace" },
      { email: "al@example.com", displayName: null },
    ];
    const getContactSuggestions = mock(() =>
      Promise.resolve({
        ok: true,
        value: { suggestions },
        correlationId: "corr-1",
      }),
    );
    mockClient(getContactSuggestions);

    const { res, json } = jsonRes();
    await contactsController.suggestions(
      sessionReq(userId, { q: "a" + "d" }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(Status.OK);
    expect(json).toHaveBeenCalledWith({ suggestions });
    // Principal-scoped and query-forwarding.
    expect((getContactSuggestions.mock.calls as unknown[][])[0]?.[1]).toBe("ad");
  });

  it("answers a sub-minimum query with a typed empty 200 and no sync call", async () => {
    const getContactSuggestions = mock();
    mockClient(getContactSuggestions);

    const { res, json } = jsonRes();
    await contactsController.suggestions(sessionReq(userId, { q: " a " }), res);

    expect(getContactSuggestions).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(Status.OK);
    expect(json).toHaveBeenCalledWith({ suggestions: [] });
  });

  it("degrades to a typed empty 200 when sync is down (no error-toast storm)", async () => {
    const getContactSuggestions = mock(() =>
      Promise.resolve({
        ok: false,
        error: { kind: "unavailable", status: 503, correlationId: "corr-2" },
      }),
    );
    mockClient(getContactSuggestions);

    const { res, json } = jsonRes();
    await contactsController.suggestions(sessionReq(userId, { q: "ada" }), res);

    expect(res.status).toHaveBeenCalledWith(Status.OK);
    expect(json).toHaveBeenCalledWith({ suggestions: [] });
  });

  it("degrades a capability refusal (403) to the same typed empty 200", async () => {
    const getContactSuggestions = mock(() =>
      Promise.resolve({
        ok: false,
        error: {
          kind: "unexpectedStatus",
          status: 403,
          correlationId: "corr-3",
        },
      }),
    );
    mockClient(getContactSuggestions);

    const { res, json } = jsonRes();
    await contactsController.suggestions(sessionReq(userId, { q: "ada" }), res);

    expect(res.status).toHaveBeenCalledWith(Status.OK);
    expect(json).toHaveBeenCalledWith({ suggestions: [] });
  });

  it("rejects a missing or non-string query with 400, without calling sync", async () => {
    const getContactSuggestions = mock();
    mockClient(getContactSuggestions);

    const { res: missingRes, json: missingJson } = jsonRes();
    await contactsController.suggestions(sessionReq(userId, {}), missingRes);
    expect(missingRes.status).toHaveBeenCalledWith(Status.BAD_REQUEST);
    expect(missingJson).toHaveBeenCalledWith({ error: "invalid_query" });

    const { res: arrayRes } = jsonRes();
    await contactsController.suggestions(
      sessionReq(userId, { q: ["a", "b"] }),
      arrayRes,
    );
    expect(arrayRes.status).toHaveBeenCalledWith(Status.BAD_REQUEST);

    expect(getContactSuggestions).not.toHaveBeenCalled();
  });

  it("rejects an over-length query with 400, without calling sync", async () => {
    const getContactSuggestions = mock();
    mockClient(getContactSuggestions);

    const { res } = jsonRes();
    await contactsController.suggestions(
      sessionReq(userId, {
        q: "a".repeat(CONTACT_SUGGESTION_QUERY_MAX_LENGTH + 1),
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(Status.BAD_REQUEST);
    expect(getContactSuggestions).not.toHaveBeenCalled();
  });

  it("answers 401 for a sessionless request", async () => {
    const getContactSuggestions = mock();
    mockClient(getContactSuggestions);

    const { res } = jsonRes();
    await contactsController.suggestions(
      { query: { q: "ada" } } as unknown as SessionRequest,
      res,
    );

    expect(res.status).toHaveBeenCalledWith(Status.UNAUTHORIZED);
    expect(getContactSuggestions).not.toHaveBeenCalled();
  });

  it("degrades a timeout to the typed empty 200 too", async () => {
    const getContactSuggestions = mock(() =>
      Promise.resolve({
        ok: false,
        error: { kind: "timeout", correlationId: "corr-4" },
      }),
    );
    mockClient(getContactSuggestions);

    const { res, json } = jsonRes();
    await contactsController.suggestions(
      sessionReq(userId, { q: "secret person" }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(Status.OK);
    expect(json).toHaveBeenCalledWith({ suggestions: [] });
  });

  it("builds its only log line from content-free error facts (no query, no contacts)", () => {
    // The controller's single log emission goes through this exported
    // builder, whose input type (SyncClientError) physically cannot carry
    // the query or a suggestion. Pin the rendered shape so a future edit
    // cannot quietly template extra data in.
    expect(
      contactSuggestionsFailureLogLine({
        kind: "unavailable",
        status: 503,
        correlationId: "corr-9",
      }),
    ).toBe(
      "Contact suggestions unavailable (unavailable 503) [correlationId=corr-9]",
    );
    expect(
      contactSuggestionsFailureLogLine({
        kind: "timeout",
        correlationId: "corr-10",
      }),
    ).toBe("Contact suggestions unavailable (timeout) [correlationId=corr-10]");
  });
});
