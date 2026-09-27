import { renderHook } from "@testing-library/react";
import { useOneShotAuthCallback } from "@web/auth/callback/useOneShotAuthCallback";
import { describe, expect, it, mock } from "bun:test";

describe("useOneShotAuthCallback", () => {
  it("starts the exchange once per mount", () => {
    const start = mock();

    renderHook(() => useOneShotAuthCallback(start));

    expect(start).toHaveBeenCalledTimes(1);
  });

  it("does not restart the exchange when the caller rerenders", () => {
    const start = mock();
    const { rerender } = renderHook(
      ({ callback }: { callback: () => void }) =>
        useOneShotAuthCallback(callback),
      { initialProps: { callback: start } },
    );

    rerender({ callback: start });
    rerender({ callback: mock() });

    expect(start).toHaveBeenCalledTimes(1);
  });
});
