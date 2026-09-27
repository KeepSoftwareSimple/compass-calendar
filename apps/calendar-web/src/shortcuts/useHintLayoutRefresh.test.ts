import { act, renderHook } from "@testing-library/react";
import { useHintLayoutRefresh } from "@web/shortcuts/useHintLayoutRefresh";
import { describe, expect, it } from "bun:test";

describe("useHintLayoutRefresh", () => {
  it("re-renders on window resize while active", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      useHintLayoutRefresh(true);
    });
    const afterMount = renders;

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(renders).toBe(afterMount + 1);
  });

  it("re-renders on a capture-phase scroll while active", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      useHintLayoutRefresh(true);
    });
    const afterMount = renders;

    act(() => {
      document.dispatchEvent(new Event("scroll", { bubbles: false }));
    });

    expect(renders).toBe(afterMount + 1);
  });

  it("does not listen while inactive", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      useHintLayoutRefresh(false);
    });
    const afterMount = renders;

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(renders).toBe(afterMount);
  });
});
