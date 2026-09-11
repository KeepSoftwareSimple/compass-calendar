import { renderHook } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { jsonResponse } from "@web/__tests__/helpers/msw-v2";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { createMockConnection } from "@web/__tests__/utils/factories/calendar.factory";
import { userMetadataActions } from "@web/auth/state/user-metadata.store";
import { ENV_WEB } from "@web/common/constants/env.constants";
import {
  CONTACT_SUGGESTION_DEBOUNCE_MS,
  rankContactSuggestions,
  useContactSuggestions,
} from "./useContactSuggestions";
import { afterEach, describe, expect, it } from "bun:test";

// WP-06: the browser side of the quota guard (debounce + min length), the
// ranking contract, and the silent-fallback behavior of the suggestion source.

const SUGGESTIONS_URL = `${ENV_WEB.API_BASEURL}/contacts/suggestions`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const seedCapability = (canSuggestContacts: boolean) => {
  userMetadataActions.set({
    google: {
      connectionState: "HEALTHY",
      connections: [
        createMockConnection("a@example.com", { canSuggestContacts }),
      ],
    },
  });
};

const serveSuggestions = (
  suggestions: Array<{ email: string; displayName: string | null }>,
) => {
  const queries: string[] = [];
  server.use(
    http.get(SUGGESTIONS_URL, ({ request }) => {
      queries.push(new URL(request.url).searchParams.get("q") ?? "");
      return jsonResponse({ suggestions }, 200);
    }),
  );
  return queries;
};

const renderSuggestions = () => {
  const { wrapper } = createStoreWrapper();
  return renderHook(() => useContactSuggestions(), { wrapper });
};

afterEach(() => {
  userMetadataActions.clear();
});

describe("useContactSuggestions", () => {
  it("offers no suggestion source without the contacts capability", () => {
    seedCapability(false);
    const { result } = renderSuggestions();
    expect(result.current.canSuggestContacts).toBe(false);
    expect(result.current.suggestionSource).toBeUndefined();
  });

  it("debounces ≥250ms: no request during the pause, one after it", async () => {
    seedCapability(true);
    const queries = serveSuggestions([
      { email: "ada@example.com", displayName: "Ada Lovelace" },
    ]);
    const { result } = renderSuggestions();
    const source = result.current.suggestionSource;
    if (!source) throw new Error("expected a suggestion source");

    expect(CONTACT_SUGGESTION_DEBOUNCE_MS).toBeGreaterThanOrEqual(250);

    const pending = source("ada");
    // Well inside the debounce window: nothing on the wire yet.
    await sleep(100);
    expect(queries).toHaveLength(0);

    const results = await pending;
    expect(queries).toEqual(["ada"]);
    expect(results).toEqual([
      { email: "ada@example.com", displayName: "Ada Lovelace" },
    ]);
  });

  it("resolves empty for a sub-2-char query without any request", async () => {
    seedCapability(true);
    const queries = serveSuggestions([
      { email: "ada@example.com", displayName: "Ada Lovelace" },
    ]);
    const { result } = renderSuggestions();
    const source = result.current.suggestionSource;
    if (!source) throw new Error("expected a suggestion source");

    await expect(source("a")).resolves.toEqual([]);
    expect(queries).toHaveLength(0);
  });

  it("supersedes a pending query with a newer keystroke (one request total)", async () => {
    seedCapability(true);
    const queries = serveSuggestions([
      { email: "ada@example.com", displayName: "Ada Lovelace" },
    ]);
    const { result } = renderSuggestions();
    const source = result.current.suggestionSource;
    if (!source) throw new Error("expected a suggestion source");

    const first = source("ad");
    await sleep(50);
    const second = source("ada");

    await expect(first).resolves.toEqual([]);
    const results = await second;
    expect(results).toHaveLength(1);
    expect(queries).toEqual(["ada"]);
  });

  it("ranks the page with the command-palette scorer (label + email keyword)", async () => {
    seedCapability(true);
    // Server order deliberately wrong for the query: the client re-ranks.
    serveSuggestions([
      { email: "zed@example.com", displayName: "Zed" },
      { email: "ada@example.com", displayName: "Ada Lovelace" },
    ]);
    const { result } = renderSuggestions();
    const source = result.current.suggestionSource;
    if (!source) throw new Error("expected a suggestion source");

    const results = await source("ada");
    expect(results.map(({ email }) => email)).toEqual([
      "ada@example.com",
      // Zero-score entries stay (the People API matched on data the scorer
      // cannot see) but sort last.
      "zed@example.com",
    ]);
  });

  it("resolves empty on a proxy failure — silent fallback, nothing thrown", async () => {
    seedCapability(true);
    server.use(
      http.get(SUGGESTIONS_URL, () => new HttpResponse(null, { status: 503 })),
    );
    const { result } = renderSuggestions();
    const source = result.current.suggestionSource;
    if (!source) throw new Error("expected a suggestion source");

    await expect(source("ada")).resolves.toEqual([]);
  });

  it("cancels on unmount: the pending query resolves empty and never hits the wire", async () => {
    seedCapability(true);
    const queries = serveSuggestions([
      { email: "ada@example.com", displayName: "Ada Lovelace" },
    ]);
    const { result, unmount } = renderSuggestions();
    const source = result.current.suggestionSource;
    if (!source) throw new Error("expected a suggestion source");

    const pending = source("ada");
    unmount();

    await expect(pending).resolves.toEqual([]);
    // Past the debounce window: the cancelled timer never fired.
    await sleep(CONTACT_SUGGESTION_DEBOUNCE_MS + 100);
    expect(queries).toHaveLength(0);
  });
});

describe("rankContactSuggestions", () => {
  it("is stable for equal scores (server order preserved)", () => {
    const page = [
      { email: "amy@example.com", displayName: "Amy" },
      { email: "ann@example.com", displayName: "Ann" },
    ];
    // Both zero-score for an unrelated query: server order stands.
    expect(rankContactSuggestions(page, "zzz")).toEqual(page);
  });

  it("prefers a display-name prefix hit over an email-only hit", () => {
    const page = [
      { email: "ada@example.com", displayName: "Zed" },
      { email: "zed@example.com", displayName: "Ada Lovelace" },
    ];
    expect(rankContactSuggestions(page, "ada")[0]?.email).toBe(
      "zed@example.com",
    );
  });
});
