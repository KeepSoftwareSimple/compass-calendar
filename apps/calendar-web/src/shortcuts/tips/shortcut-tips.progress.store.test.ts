import { act, renderHook } from "@testing-library/react";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  initialShortcutShowcaseState,
  useShortcutShowcaseStore,
} from "@web/components/ShortcutShowcase/showcase.store";
import { readShortcutHintProgress } from "@web/shortcuts/tips/shortcut-tips.progress.storage";
import {
  shortcutHintProgressActions,
  useShortcutHintProgress,
} from "@web/shortcuts/tips/shortcut-tips.progress.store";
import { describe, expect, it } from "bun:test";

describe("shortcutHintProgress", () => {
  it("records a demonstrated primitive and notifies subscribers", () => {
    const { result } = renderHook(() => useShortcutHintProgress());
    expect(result.current).toEqual([]);

    act(() => shortcutHintProgressActions.demonstrate("page-jump"));

    expect(result.current).toEqual(["page-jump"]);
    expect(readShortcutHintProgress()).toEqual(["page-jump"]);
  });

  it("moves a repeated primitive to the end instead of duplicating it", () => {
    const { result } = renderHook(() => useShortcutHintProgress());

    act(() => shortcutHintProgressActions.demonstrate("page-jump"));
    act(() => shortcutHintProgressActions.demonstrate("event-jump"));
    act(() => shortcutHintProgressActions.demonstrate("page-jump"));

    expect(result.current).toEqual(["event-jump", "page-jump"]);
  });

  it("does not persist while the Shortcut Showcase is open", () => {
    useShortcutShowcaseStore.setState({ isActive: true }, false);
    const { result } = renderHook(() => useShortcutHintProgress());

    act(() => shortcutHintProgressActions.demonstrate("page-jump"));

    expect(result.current).toEqual([]);
    expect(readShortcutHintProgress()).toEqual([]);

    useShortcutShowcaseStore.setState(initialShortcutShowcaseState, true);
  });

  it("falls back to an empty list for corrupt storage", () => {
    persistentBrowserStore.set(
      STORAGE_KEYS.SHORTCUT_TIPS_DEMONSTRATED,
      "{not json",
    );

    expect(readShortcutHintProgress()).toEqual([]);
  });

  it("skips unknown ids from storage", () => {
    persistentBrowserStore.set(
      STORAGE_KEYS.SHORTCUT_TIPS_DEMONSTRATED,
      JSON.stringify(["page-jump", "not-a-hint"]),
    );

    expect(readShortcutHintProgress()).toEqual(["page-jump"]);
  });
});
