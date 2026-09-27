import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  firstEventPromptActions,
  initialFirstEventPromptState,
  noteFirstRealEventCreated,
  useFirstEventPromptStore,
} from "@web/components/FirstEventPrompt/first-event.store";
import {
  initialShortcutShowcaseState,
  useShortcutShowcaseStore,
} from "@web/components/ShortcutShowcase/showcase.store";
import { beforeEach, describe, expect, it } from "bun:test";

const markShowcaseSeen = () => {
  persistentBrowserStore.set(STORAGE_KEYS.HAS_SEEN_SHORTCUT_SHOWCASE, "true");
};

describe("firstEventPromptActions", () => {
  beforeEach(() => {
    useFirstEventPromptStore.setState({ ...initialFirstEventPromptState });
    useShortcutShowcaseStore.setState(initialShortcutShowcaseState);
    persistentBrowserStore.set(STORAGE_KEYS.FIRST_EVENT_DONE, "");
    persistentBrowserStore.set(STORAGE_KEYS.HAS_SEEN_SHORTCUT_SHOWCASE, "");
  });

  it("completes and celebrates on the first real event when the showcase is not active", () => {
    noteFirstRealEventCreated();
    expect(useFirstEventPromptStore.getState().isCelebrating).toBe(true);
    expect(persistentBrowserStore.get(STORAGE_KEYS.FIRST_EVENT_DONE)).toBe(
      "completed",
    );

    // A second create while still celebrating (or after) is a no-op.
    noteFirstRealEventCreated();
    expect(useFirstEventPromptStore.getState().isCelebrating).toBe(true);
  });

  it("completes on the first create even when the showcase was never seen", () => {
    noteFirstRealEventCreated();
    expect(useFirstEventPromptStore.getState().isCelebrating).toBe(true);
    expect(persistentBrowserStore.get(STORAGE_KEYS.FIRST_EVENT_DONE)).toBe(
      "completed",
    );
  });

  it("ignores a create while the showcase takeover is active", () => {
    markShowcaseSeen();
    useShortcutShowcaseStore.setState({ isActive: true });
    noteFirstRealEventCreated();
    expect(useFirstEventPromptStore.getState().isCelebrating).toBe(false);
  });

  it("finalize retires the card after the celebration", () => {
    markShowcaseSeen();
    noteFirstRealEventCreated();
    firstEventPromptActions.finalizeCompleted();
    expect(useFirstEventPromptStore.getState()).toEqual({
      isDone: true,
      isCelebrating: false,
    });
  });

  it("dismiss retires the card immediately, recorded separately from completion", () => {
    markShowcaseSeen();
    firstEventPromptActions.dismiss();
    expect(useFirstEventPromptStore.getState().isDone).toBe(true);
    expect(persistentBrowserStore.get(STORAGE_KEYS.FIRST_EVENT_DONE)).toBe(
      "dismissed",
    );

    // Done means done: a later real create changes nothing.
    noteFirstRealEventCreated();
    expect(useFirstEventPromptStore.getState().isCelebrating).toBe(false);
  });

  it("a real create that lands mid-dismiss-fade wins over the deferred dismiss", () => {
    // FirstEventPrompt defers dismiss() behind a fade-out, so a create can
    // resolve and start celebrating before the deferred dismiss() actually
    // runs. It must not clobber that completion back to "dismissed".
    markShowcaseSeen();
    noteFirstRealEventCreated();
    expect(useFirstEventPromptStore.getState().isCelebrating).toBe(true);

    firstEventPromptActions.dismiss();
    expect(useFirstEventPromptStore.getState().isCelebrating).toBe(true);
    expect(useFirstEventPromptStore.getState().isDone).toBe(false);
    expect(persistentBrowserStore.get(STORAGE_KEYS.FIRST_EVENT_DONE)).toBe(
      "completed",
    );
  });
});
