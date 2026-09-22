import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  hasShowcaseInProgress,
  markShowcaseInProgress,
} from "@web/components/ShortcutShowcase/showcase.storage";
import {
  initialShortcutShowcaseState,
  shortcutShowcaseActions,
  useShortcutShowcaseStore,
} from "@web/components/ShortcutShowcase/showcase.store";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

describe("shortcutShowcaseActions", () => {
  beforeEach(() => {
    useShortcutShowcaseStore.setState(initialShortcutShowcaseState);
    persistentBrowserStore.set(STORAGE_KEYS.HAS_SEEN_SHORTCUT_SHOWCASE, "");
    persistentBrowserStore.remove(STORAGE_KEYS.SHORTCUT_SHOWCASE_STEP);
  });

  // Module-level singleton shared across the bun process: never leave the
  // showcase active for suites that run after this file.
  afterEach(() => {
    useShortcutShowcaseStore.setState(initialShortcutShowcaseState);
  });

  it("activates from the palette and records the entry", () => {
    shortcutShowcaseActions.replay();
    const state = useShortcutShowcaseStore.getState();
    expect(state.isActive).toBe(true);
    expect(state.entry).toBe("palette");
    expect(hasShowcaseInProgress()).toBe(true);
    expect(
      persistentBrowserStore.get(STORAGE_KEYS.HAS_SEEN_SHORTCUT_SHOWCASE),
    ).not.toBe("true");
  });

  it("activates from a shared link even after the showcase was seen", () => {
    shortcutShowcaseActions.replay();
    shortcutShowcaseActions.finish();
    expect(useShortcutShowcaseStore.getState().isActive).toBe(false);

    shortcutShowcaseActions.startFromLink();
    const state = useShortcutShowcaseStore.getState();
    expect(state.isActive).toBe(true);
    expect(state.entry).toBe("link");
  });

  it("finish leaves, marks seen, and clears the in-progress marker", () => {
    shortcutShowcaseActions.replay();
    shortcutShowcaseActions.finish();
    expect(useShortcutShowcaseStore.getState().isActive).toBe(false);
    expect(
      persistentBrowserStore.get(STORAGE_KEYS.HAS_SEEN_SHORTCUT_SHOWCASE),
    ).toBe("true");
    expect(hasShowcaseInProgress()).toBe(false);
  });

  it("skip() leaves immediately and marks seen; skipping inactive is a no-op", () => {
    shortcutShowcaseActions.replay();
    shortcutShowcaseActions.skip("signup", { phase: "running", tasks_done: 2 });
    expect(useShortcutShowcaseStore.getState().isActive).toBe(false);
    expect(
      persistentBrowserStore.get(STORAGE_KEYS.HAS_SEEN_SHORTCUT_SHOWCASE),
    ).toBe("true");
    expect(hasShowcaseInProgress()).toBe(false);

    shortcutShowcaseActions.skip();
    expect(useShortcutShowcaseStore.getState().isActive).toBe(false);
  });

  it("arms skip on the first requestSkip and leaves on the second", () => {
    shortcutShowcaseActions.replay();
    shortcutShowcaseActions.requestSkip();
    expect(useShortcutShowcaseStore.getState().isActive).toBe(true);
    expect(useShortcutShowcaseStore.getState().skipPending).toBe(true);
    expect(
      persistentBrowserStore.get(STORAGE_KEYS.HAS_SEEN_SHORTCUT_SHOWCASE),
    ).not.toBe("true");
    expect(hasShowcaseInProgress()).toBe(true);

    shortcutShowcaseActions.requestSkip();
    expect(useShortcutShowcaseStore.getState().isActive).toBe(false);
    expect(useShortcutShowcaseStore.getState().skipPending).toBe(false);
    expect(
      persistentBrowserStore.get(STORAGE_KEYS.HAS_SEEN_SHORTCUT_SHOWCASE),
    ).toBe("true");
  });

  it("requestSkip on an inactive showcase is a no-op", () => {
    shortcutShowcaseActions.requestSkip();
    expect(useShortcutShowcaseStore.getState().isActive).toBe(false);
    expect(useShortcutShowcaseStore.getState().skipPending).toBe(false);
  });

  it("re-offers an unfinished attempt after reload without marking seen", () => {
    shortcutShowcaseActions.replay();

    useShortcutShowcaseStore.setState(initialShortcutShowcaseState);
    shortcutShowcaseActions.resumeIfInProgress();
    const state = useShortcutShowcaseStore.getState();
    expect(state.isActive).toBe(true);
    // A resumed attempt is the same attempt: no entry, no started event.
    expect(state.entry).toBeNull();
    expect(
      persistentBrowserStore.get(STORAGE_KEYS.HAS_SEEN_SHORTCUT_SHOWCASE),
    ).not.toBe("true");
  });

  it("re-offers a legacy saved lesson step as a fresh game attempt", () => {
    persistentBrowserStore.set(
      STORAGE_KEYS.SHORTCUT_SHOWCASE_STEP,
      "edgeResize",
    );
    shortcutShowcaseActions.resumeIfInProgress();
    expect(useShortcutShowcaseStore.getState().isActive).toBe(true);
  });

  it("does not resume after the showcase has been seen", () => {
    shortcutShowcaseActions.replay();
    shortcutShowcaseActions.skip();
    markShowcaseInProgress();
    shortcutShowcaseActions.resumeIfInProgress();
    expect(useShortcutShowcaseStore.getState().isActive).toBe(false);
  });
});
