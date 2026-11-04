import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { PLACES_AUTOCOMPLETE_URL } from "@web/views/Forms/EventForm/LocationField/places.client";
import {
  PLACE_SUGGESTION_DEBOUNCE_MS,
  usePlaceSuggestions,
} from "@web/views/Forms/EventForm/LocationField/usePlaceSuggestions";
import { describe, expect, it } from "bun:test";

describe("usePlaceSuggestions", () => {
  it("reports isSearching while debouncing and while the query is pending", async () => {
    let resolveSearch: (body: unknown) => void = () => {};
    server.use(
      http.post(PLACES_AUTOCOMPLETE_URL, async () => {
        return new Promise((resolve) => {
          resolveSearch = (body) =>
            resolve(HttpResponse.json(body ?? { suggestions: [] }));
        });
      }),
    );
    const { wrapper } = createStoreWrapper();

    const { result, rerender } = renderHook(
      ({ query }: { query: string }) => usePlaceSuggestions(query, "test-key"),
      { wrapper, initialProps: { query: "" } },
    );

    rerender({ query: "zoc" });
    expect(result.current.isSearching).toBe(true);

    await act(async () => {
      await new Promise((resolve) =>
        setTimeout(resolve, PLACE_SUGGESTION_DEBOUNCE_MS + 50),
      );
    });
    expect(result.current.isSearching).toBe(true);

    await act(async () => {
      resolveSearch({
        suggestions: [
          { placePrediction: { text: { text: "Zocalo, Bozeman, MT, USA" } } },
        ],
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(result.current.isSearching).toBe(false);
    });
    expect(result.current.suggestions[0]).toContain("Zocalo");
  });
});
