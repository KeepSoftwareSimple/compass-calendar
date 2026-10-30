import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { AuthModalContext } from "@web/components/AuthModal/hooks/useAuthModal";
import {
  initialFirstEventPromptState,
  noteFirstRealEventCreated,
  useFirstEventPromptStore,
} from "@web/components/FirstEventPrompt/first-event.store";
import {
  initialShortcutShowcaseState,
  useShortcutShowcaseStore,
} from "@web/components/ShortcutShowcase/showcase.store";
import * as realUseIsNarrowSidebarLayout from "@web/components/Sidebar/hooks/useIsNarrowSidebarLayout";
import {
  createGridEventDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import { draftActions } from "@web/events/stores/draft.store";
import { viewActions } from "@web/events/stores/view.store";
import {
  initialSettingsState,
  settingsActions,
  useSettingsStore,
} from "@web/settings/settings.store";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";

const quickCreateFirstEvent = mock(() => undefined);

mock.module(
  "@web/components/FirstEventPrompt/useQuickCreateFirstEvent",
  () => ({
    useQuickCreateFirstEvent: () => quickCreateFirstEvent,
  }),
);

let isNarrowSidebarLayout = false;
let isNarrowLayoutMocked = true;
const actualUseIsNarrowSidebarLayout =
  realUseIsNarrowSidebarLayout.useIsNarrowSidebarLayout;
mockModuleForFile(
  "@web/components/Sidebar/hooks/useIsNarrowSidebarLayout",
  realUseIsNarrowSidebarLayout,
  {
    useIsNarrowSidebarLayout: () =>
      isNarrowLayoutMocked
        ? isNarrowSidebarLayout
        : actualUseIsNarrowSidebarLayout(),
  },
);

afterAll(() => {
  isNarrowLayoutMocked = false;
});

const moduleUrl = new URL(
  `./FirstEventPrompt.tsx?test=${Math.random().toString(36).slice(2)}`,
  import.meta.url,
);
const { FirstEventPrompt } = (await import(
  moduleUrl.href
)) as typeof import("./FirstEventPrompt");

const markShowcaseSeen = () => {
  persistentBrowserStore.set(STORAGE_KEYS.HAS_SEEN_SHORTCUT_SHOWCASE, "true");
};

describe("FirstEventPrompt", () => {
  beforeEach(() => {
    isNarrowSidebarLayout = false;
    quickCreateFirstEvent.mockClear();
    draftActions.discard();
    useFirstEventPromptStore.setState({ ...initialFirstEventPromptState });
    useShortcutShowcaseStore.setState(initialShortcutShowcaseState);
    useSettingsStore.setState(initialSettingsState);
    persistentBrowserStore.set(STORAGE_KEYS.FIRST_EVENT_DONE, "");
    persistentBrowserStore.set(STORAGE_KEYS.HAS_SEEN_SHORTCUT_SHOWCASE, "");
  });

  afterEach(() => {
    draftActions.discard();
    useFirstEventPromptStore.setState({ ...initialFirstEventPromptState });
    useShortcutShowcaseStore.setState(initialShortcutShowcaseState);
    useSettingsStore.setState(initialSettingsState);
  });

  it("shows before the showcase has ever been seen", () => {
    render(<FirstEventPrompt />);
    expect(
      screen.getByRole("complementary", { name: "Create your first event" }),
    ).toBeTruthy();
  });

  it("stays hidden while the auth modal is open", () => {
    markShowcaseSeen();
    render(
      <AuthModalContext.Provider
        value={{
          isOpen: true,
          currentView: "login",
          openModal: () => {},
          openStartTrialStep: () => {},
          closeModal: () => {},
          setView: () => {},
        }}
      >
        <FirstEventPrompt />
      </AuthModalContext.Provider>,
    );
    expect(
      screen.queryByRole("complementary", { name: "Create your first event" }),
    ).toBeNull();
  });

  it("stays hidden while the showcase takeover is active", () => {
    markShowcaseSeen();
    useShortcutShowcaseStore.setState({ isActive: true });
    render(<FirstEventPrompt />);
    expect(
      screen.queryByRole("complementary", { name: "Create your first event" }),
    ).toBeNull();
  });

  it("stays hidden while Settings is open", () => {
    markShowcaseSeen();
    settingsActions.openSettings();
    render(<FirstEventPrompt />);
    expect(
      screen.queryByRole("complementary", { name: "Create your first event" }),
    ).toBeNull();
  });

  it("hides while the event form is open, then returns when discarded", () => {
    markShowcaseSeen();
    render(<FirstEventPrompt />);
    expect(
      screen.getByRole("complementary", { name: "Create your first event" }),
    ).toBeTruthy();

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
    });

    expect(
      screen.queryByRole("complementary", { name: "Create your first event" }),
    ).toBeNull();
    expect(persistentBrowserStore.get(STORAGE_KEYS.FIRST_EVENT_DONE)).toBe("");

    act(() => draftActions.discard());
    expect(
      screen.getByRole("complementary", { name: "Create your first event" }),
    ).toBeTruthy();
  });

  it("shows a primary add action once the showcase has been seen", () => {
    markShowcaseSeen();
    render(<FirstEventPrompt />);

    const prompt = screen.getByRole("complementary", {
      name: "Create your first event",
    });
    expect(prompt).toBeTruthy();
    expect(screen.getByText("Add your first event.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add Coffee" })).toBeTruthy();
  });

  it("lifts above the sidebar footer on wide layouts", () => {
    markShowcaseSeen();
    act(() => viewActions.setSidebarOpen(true));
    render(<FirstEventPrompt />);

    const prompt = screen.getByRole("complementary", {
      name: "Create your first event",
    });
    expect(prompt).toHaveAttribute("data-clears-sidebar-footer", "true");
    expect(prompt.className).toContain("bottom-20");
  });

  it("uses full-width bottom anchoring on narrow layouts", () => {
    isNarrowSidebarLayout = true;
    markShowcaseSeen();
    render(<FirstEventPrompt />);

    const prompt = screen.getByRole("complementary", {
      name: "Create your first event",
    });
    expect(prompt.className).toContain("inset-x-4");
    expect(
      document.documentElement.getAttribute("data-first-event-prompt-live"),
    ).toBe("");
  });

  it("creates the default first event when Add Coffee is clicked", async () => {
    const user = userEvent.setup();
    markShowcaseSeen();
    render(<FirstEventPrompt />);

    await user.click(screen.getByRole("button", { name: "Add Coffee" }));

    expect(quickCreateFirstEvent).toHaveBeenCalledTimes(1);
  });

  it("celebrates on the first real event, then retires the card for good", async () => {
    markShowcaseSeen();
    render(<FirstEventPrompt />);

    act(() => noteFirstRealEventCreated());
    expect(screen.getByText("It's on the calendar.")).toBeTruthy();
    expect(persistentBrowserStore.get(STORAGE_KEYS.FIRST_EVENT_DONE)).toBe(
      "completed",
    );

    await waitFor(
      () => {
        expect(
          screen.queryByRole("complementary", {
            name: "Create your first event",
          }),
        ).toBeNull();
      },
      { timeout: 5000 },
    );
  });

  it("dismiss fades the card out, then hides it and persists the choice", async () => {
    const user = userEvent.setup();
    markShowcaseSeen();
    render(<FirstEventPrompt />);

    const prompt = screen.getByRole("complementary", {
      name: "Create your first event",
    });
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    // Fades out (matching UpNextBanner) rather than vanishing instantly.
    expect(prompt).toHaveAttribute("data-closing");

    await waitFor(() => {
      expect(
        screen.queryByRole("complementary", {
          name: "Create your first event",
        }),
      ).toBeNull();
    });
    expect(persistentBrowserStore.get(STORAGE_KEYS.FIRST_EVENT_DONE)).toBe(
      "dismissed",
    );
  });

  it("stays hidden once done, regardless of how it got there", () => {
    useFirstEventPromptStore.setState({
      ...initialFirstEventPromptState,
      isDone: true,
    });
    markShowcaseSeen();
    render(<FirstEventPrompt />);
    expect(
      screen.queryByRole("complementary", { name: "Create your first event" }),
    ).toBeNull();
  });
});
