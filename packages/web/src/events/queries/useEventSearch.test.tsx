import { act, renderHook, waitFor } from "@testing-library/react";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { createMockOfflineDataStore } from "@web/__tests__/utils/storage/mock-offline-data-store.util";
import { resetOfflineDataStoreForTests } from "@web/common/storage/offline-data/offline-data.store.registry";
import { useEventSearch } from "@web/events/queries/useEventSearch";
import { resetEventRepositorySourceForTests } from "@web/events/repositories/event.repository.source.store";
import { afterEach, describe, expect, it } from "bun:test";

describe("useEventSearch", () => {
  afterEach(() => {
    resetOfflineDataStoreForTests();
    resetEventRepositorySourceForTests();
  });

  it("debounces then returns local title matches", async () => {
    resetEventRepositorySourceForTests();
    const dentist = createMockEvent({
      content: { kind: "details", title: "Dentist", description: "" },
    });
    const store = createMockOfflineDataStore();
    store.searchByTitle.mockResolvedValue([dentist]);
    resetOfflineDataStoreForTests(store as never);
    const { wrapper } = createStoreWrapper();

    const { result, rerender } = renderHook(
      ({ query }: { query: string }) => useEventSearch(query),
      { wrapper, initialProps: { query: "d" } },
    );

    expect(store.searchByTitle).not.toHaveBeenCalled();

    rerender({ query: "dent" });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    await waitFor(() => {
      expect(result.current.data?.[0]?.id).toBe(dentist.id);
    });
    expect(store.searchByTitle).toHaveBeenCalledWith(
      "dent",
      expect.any(Number),
    );
  });
});
