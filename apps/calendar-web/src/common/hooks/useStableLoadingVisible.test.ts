import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import {
  STABLE_LOADING_MIN_VISIBLE_MS,
  STABLE_LOADING_SHOW_DELAY_MS,
  useStableLoadingVisible,
} from "@web/common/hooks/useStableLoadingVisible";
import { afterEach, describe, expect, it, setSystemTime } from "bun:test";

describe("useStableLoadingVisible", () => {
  afterEach(() => {
    setSystemTime();
  });

  it("does not show loading until the show delay elapses", async () => {
    setSystemTime(new Date("2026-02-05T00:00:00.000Z"));
    const { result, rerender } = renderHook(
      ({ loading }) => useStableLoadingVisible(loading),
      { initialProps: { loading: false } },
    );

    rerender({ loading: true });
    expect(result.current).toBe(false);

    await act(async () => {
      setSystemTime(new Date(Date.now() + STABLE_LOADING_SHOW_DELAY_MS - 1));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current).toBe(false);

    await act(async () => {
      setSystemTime(new Date(Date.now() + STABLE_LOADING_SHOW_DELAY_MS + 1));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it("keeps loading visible for the minimum duration once shown", async () => {
    setSystemTime(new Date("2026-02-05T00:00:00.000Z"));
    const { result, rerender } = renderHook(
      ({ loading }) => useStableLoadingVisible(loading),
      { initialProps: { loading: true } },
    );

    await act(async () => {
      setSystemTime(new Date(Date.now() + STABLE_LOADING_SHOW_DELAY_MS + 1));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => {
      expect(result.current).toBe(true);
    });

    rerender({ loading: false });
    expect(result.current).toBe(true);

    await act(async () => {
      setSystemTime(new Date(Date.now() + STABLE_LOADING_MIN_VISIBLE_MS - 1));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current).toBe(true);

    await act(async () => {
      setSystemTime(new Date(Date.now() + STABLE_LOADING_MIN_VISIBLE_MS + 1));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });
});
