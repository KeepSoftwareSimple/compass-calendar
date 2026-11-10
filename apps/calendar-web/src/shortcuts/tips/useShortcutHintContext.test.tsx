import { act, renderHook, waitFor } from "@testing-library/react";
import { type PropsWithChildren } from "react";
import { UserApi } from "@web/api/user.api";
import { UserContext } from "@web/auth/compass/user/context/UserContext";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import {
  initialFirstEventPromptState,
  useFirstEventPromptStore,
} from "@web/components/FirstEventPrompt/first-event.store";
import {
  createGridEventDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import { draftActions } from "@web/events/stores/draft.store";
import { CALENDAR_VIEW_INTERACTION_ID_ATTRIBUTES } from "@web/grid/interaction/view-event-registry";
import { eventJumpActions } from "@web/shortcuts/shift-hint/event-jump.store";
import { writeShortcutUsageProfile } from "@web/shortcuts/tips/shortcut-personalization.storage";
import { getHintPlainText } from "@web/shortcuts/tips/shortcut-tips.data";
import {
  resetShortcutHintProgressStoreForTests,
  shortcutHintProgressActions,
} from "@web/shortcuts/tips/shortcut-tips.progress.store";
import {
  SHORTCUT_HINT_NEWCOMER_ROTATION_MS,
  SHORTCUT_HINT_ROTATION_MS,
  useShortcutHintContext,
} from "@web/shortcuts/tips/useShortcutHintContext";
import { writeLifePreferences } from "@web/views/Life/life-preferences.storage";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
  spyOn,
} from "bun:test";

const focusCalendarEvent = () => {
  const card = document.createElement("div");
  card.setAttribute(CALENDAR_VIEW_INTERACTION_ID_ATTRIBUTES[0], "evt-1");
  card.tabIndex = -1;
  document.body.appendChild(card);
  card.focus();
  return card;
};

describe("useShortcutHintContext", () => {
  beforeEach(() => {
    draftActions.discard();
    useFirstEventPromptStore.setState(initialFirstEventPromptState, true);
  });

  afterEach(() => {
    draftActions.discard();
    useFirstEventPromptStore.setState(initialFirstEventPromptState, true);
    eventJumpActions.reset();
    resetShortcutHintProgressStoreForTests();
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
    jest.useRealTimers();
  });

  it("returns create-event on an idle calendar before the first real event", () => {
    const { result } = renderHook(() => useShortcutHintContext());
    expect(result.current!.id).toBe("create-event");
  });

  it("switches to first-event-save when the form opens", () => {
    const { result } = renderHook(() => useShortcutHintContext());

    act(() => {
      draftActions.startGridDraft({
        activity: "createShortcut",
        draft: createGridEventDraft(
          timedGridSchedule(
            new Date("2026-05-20T09:00:00.000"),
            new Date("2026-05-20T10:00:00.000"),
          ),
        ),
      });
      draftActions.setFormOpen(true);
    });

    expect(result.current!.id).toBe("first-event-save");
  });

  it("returns page-jump once the first event is done and the calendar is idle", () => {
    useFirstEventPromptStore.setState({ isDone: true }, false);
    const { result } = renderHook(() => useShortcutHintContext());
    expect(result.current!.id).toBe("page-jump");
  });

  it("returns edit-sequence when a calendar event is focused", () => {
    focusCalendarEvent();
    const { result } = renderHook(() => useShortcutHintContext());
    expect(result.current!.id).toBe("edit-sequence");
  });

  it("returns life-this-week on the Life path", () => {
    writeLifePreferences({
      birthDate: "1990-01-01",
      lifespan: 80,
      variation: "average",
    });
    window.history.replaceState({}, "", "/life");
    const { result } = renderHook(() => useShortcutHintContext());
    expect(result.current!.id).toBe("life-this-week");
  });

  it("uses account life preferences for the Life T tip when signed in", async () => {
    spyOn(UserApi, "getLifePreferences").mockResolvedValue({
      preferences: {
        birthDate: "1990-06-15",
        lifespan: 80,
        variation: "average",
      },
      revision: 1,
    });
    window.history.replaceState({}, "", "/life");
    const { result } = renderHook(() => useShortcutHintContext(), {
      wrapper: ({ children }: PropsWithChildren) => (
        <UserContext.Provider value={{ userId: "signed-in-user" }}>
          {children}
        </UserContext.Provider>
      ),
    });
    await waitFor(() => expect(result.current?.id).toBe("life-this-week"));
  });

  it("shows command-palette on Life when no birth date is set", () => {
    localStorage.removeItem(STORAGE_KEYS.LIFE_PREFERENCES);
    useFirstEventPromptStore.setState({ isDone: true }, false);
    window.history.replaceState({}, "", "/life");
    const { result } = renderHook(() => useShortcutHintContext());
    expect(result.current?.id).toBe("command-palette");
  });

  it("does not show form tips on Life while a sidebar-hidden draft form is open", () => {
    writeLifePreferences({
      birthDate: "1990-01-01",
      lifespan: 80,
      variation: "average",
    });
    useFirstEventPromptStore.setState({ isDone: true }, false);
    window.history.replaceState({}, "", "/life");
    act(() => {
      draftActions.startGridDraft({
        activity: "createShortcut",
        draft: createGridEventDraft(
          timedGridSchedule(
            new Date("2026-05-20T09:00:00.000"),
            new Date("2026-05-20T10:00:00.000"),
          ),
        ),
      });
      draftActions.setFormOpen(true);
    });
    const { result } = renderHook(() => useShortcutHintContext());
    expect(result.current?.id).toBe("life-this-week");
  });

  it("advances to event-jump after hold-Mod is demonstrated", () => {
    useFirstEventPromptStore.setState({ isDone: true }, false);
    const { result } = renderHook(() => useShortcutHintContext());
    expect(result.current!.id).toBe("page-jump");

    act(() => shortcutHintProgressActions.demonstrate("page-jump"));

    expect(result.current!.id).toBe("event-jump");
  });

  it("teaches week-column letters on /week after event jump is demonstrated", () => {
    window.history.replaceState({}, "", "/week");
    useFirstEventPromptStore.setState({ isDone: true }, false);
    act(() => {
      shortcutHintProgressActions.demonstrate("page-jump");
      shortcutHintProgressActions.demonstrate("event-jump");
      // Exactly one jumpable column, so the assertion does not depend on
      // which weekday the suite runs on.
      eventJumpActions.setJumpableDayPrefixes(["w"]);
    });

    const { result } = renderHook(() => useShortcutHintContext());
    expect(result.current!.id).toBe("week-day-focus");
    expect(getHintPlainText(result.current!)).toBe(
      "Shift+W jumps to Wednesday",
    );
  });

  it("falls through the column tip when no day has a jump key", () => {
    window.history.replaceState({}, "", "/week");
    useFirstEventPromptStore.setState({ isDone: true }, false);
    act(() => {
      shortcutHintProgressActions.demonstrate("page-jump");
      shortcutHintProgressActions.demonstrate("event-jump");
      eventJumpActions.setJumpableDayPrefixes([]);
    });

    const { result } = renderHook(() => useShortcutHintContext());
    expect(result.current!.id).toBe("command-palette");
  });

  it("re-ranks every 60 seconds for newcomer browsers", () => {
    jest.useFakeTimers();
    useFirstEventPromptStore.setState({ isDone: true }, false);

    const { result } = renderHook(() => useShortcutHintContext());
    const first = result.current;

    act(() => {
      jest.advanceTimersByTime(SHORTCUT_HINT_NEWCOMER_ROTATION_MS);
    });

    expect(result.current).not.toBe(first);
    jest.useRealTimers();
  });

  it("re-ranks on a five-minute cadence after reaching Explorer", () => {
    jest.useFakeTimers();
    useFirstEventPromptStore.setState({ isDone: true }, false);
    writeShortcutUsageProfile({
      version: 2,
      actions: {},
      shortcuts: {
        "nav-previous": { invocations: 1, recentImpressions: 0 },
        "nav-next": { invocations: 1, recentImpressions: 0 },
        "nav-today": { invocations: 1, recentImpressions: 0 },
        "create-timed": { invocations: 1, recentImpressions: 0 },
      },
    });

    const { result } = renderHook(() => useShortcutHintContext());
    const first = result.current;

    act(() => {
      jest.advanceTimersByTime(SHORTCUT_HINT_NEWCOMER_ROTATION_MS);
    });
    expect(result.current).toBe(first);

    act(() => {
      jest.advanceTimersByTime(
        SHORTCUT_HINT_ROTATION_MS - SHORTCUT_HINT_NEWCOMER_ROTATION_MS,
      );
    });
    expect(result.current).not.toBe(first);
    jest.useRealTimers();
  });

  it("does not re-rank while the document is hidden and re-ranks once on return", () => {
    jest.useFakeTimers();
    const hiddenDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "hidden",
    );
    const visibilityDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "visibilityState",
    );
    const setHidden = (hidden: boolean) => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => hidden,
      });
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => (hidden ? "hidden" : "visible"),
      });
    };

    const { result } = renderHook(() => useShortcutHintContext());
    const first = result.current;

    setHidden(true);
    act(() => {
      jest.advanceTimersByTime(SHORTCUT_HINT_ROTATION_MS * 2);
    });
    expect(result.current).toBe(first);

    setHidden(false);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).not.toBe(first);

    if (hiddenDescriptor) {
      Object.defineProperty(document, "hidden", hiddenDescriptor);
    } else {
      Reflect.deleteProperty(document, "hidden");
    }
    if (visibilityDescriptor) {
      Object.defineProperty(document, "visibilityState", visibilityDescriptor);
    } else {
      Reflect.deleteProperty(document, "visibilityState");
    }
    jest.useRealTimers();
  });
});
