import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { ID_MAIN } from "@web/common/constants/web.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { AuthModalContext } from "@web/components/AuthModal/hooks/useAuthModal";
import { BottomNoticeStack } from "@web/components/BottomNoticeStack/BottomNoticeStack";
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
    expect(
      screen.getByText("Your calendar is ready. Add something to it."),
    ).toBeTruthy();
    const addEvent = screen.getByRole("button", { name: "Add event" });
    expect(addEvent).toBeTruthy();
    expect(addEvent.className).toContain("c-button-primary");
    expect(screen.getByText("C")).toBeTruthy();
  });

  const rectOf = (left: number, right: number) =>
    ({
      left,
      right,
      x: left,
      width: right - left,
      top: 0,
      bottom: 0,
      y: 0,
      height: 0,
      toJSON: () => ({}),
    }) as DOMRect;

  /** Places the stack and the main column, which ends where the sidebar begins. */
  const withStackGeometry = (
    geometry: { stackRight: number; mainRight: number },
    run: () => void,
  ) => {
    const main = document.createElement("div");
    main.id = ID_MAIN;
    document.body.appendChild(main);
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.id === ID_MAIN) return rectOf(0, geometry.mainRight);
      if (this.classList.contains("compass-bottom-notice-stack")) {
        return rectOf(16, geometry.stackRight);
      }
      return original.call(this);
    };
    try {
      run();
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original;
      main.remove();
    }
  };

  it("keeps the default bottom inset at 1280px when the right sidebar is open", () => {
    markShowcaseSeen();
    act(() => viewActions.setSidebarOpen(true));
    withStackGeometry({ stackRight: 400, mainRight: 903 }, () => {
      render(
        <BottomNoticeStack>
          <FirstEventPrompt />
        </BottomNoticeStack>,
      );

      const stack = screen.getByRole("region", { name: "Notifications" });
      expect(stack.getAttribute("data-clears-sidebar-footer")).toBeNull();
      expect(stack.className).not.toContain(
        "compass-bottom-notice-stack--clears-footer",
      );
    });
  });

  it("lifts the bottom stack above the footer on narrow layouts with the sidebar open", () => {
    isNarrowSidebarLayout = true;
    markShowcaseSeen();
    act(() => viewActions.setSidebarOpen(true));
    withStackGeometry({ stackRight: 344, mainRight: 96 }, () => {
      render(
        <BottomNoticeStack>
          <FirstEventPrompt />
        </BottomNoticeStack>,
      );

      const stack = screen.getByRole("region", { name: "Notifications" });
      expect(stack).toHaveAttribute("data-clears-sidebar-footer", "true");
      expect(
        screen.getByRole("complementary", { name: "Create your first event" }),
      ).toBeTruthy();
    });
  });

  it("uses the shared bottom stack width on narrow layouts when the sidebar is closed", () => {
    isNarrowSidebarLayout = true;
    markShowcaseSeen();
    act(() => viewActions.setSidebarOpen(false));
    withStackGeometry({ stackRight: 344, mainRight: 360 }, () => {
      render(
        <BottomNoticeStack>
          <FirstEventPrompt />
        </BottomNoticeStack>,
      );

      expect(
        screen.getByRole("complementary", { name: "Create your first event" }),
      ).toBeTruthy();
      const stack = screen.getByRole("region", { name: "Notifications" });
      expect(stack.getAttribute("data-clears-sidebar-footer")).toBeNull();
    });
  });

  it("creates the default first event when Add event is clicked", async () => {
    const user = userEvent.setup();
    markShowcaseSeen();
    render(<FirstEventPrompt />);

    await user.click(screen.getByRole("button", { name: "Add event" }));

    expect(quickCreateFirstEvent).toHaveBeenCalledTimes(1);
  });

  it("creates the default first event when C is pressed", async () => {
    const user = userEvent.setup();
    markShowcaseSeen();
    render(<FirstEventPrompt />);

    await user.keyboard("c");

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
