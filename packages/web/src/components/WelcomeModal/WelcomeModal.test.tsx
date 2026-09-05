import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { dispatchMissingKey } from "@web/__tests__/utils/keyboard.test.util";
import {
  registerUseStartGoogleAuthorizationForTests,
  resetUseStartGoogleAuthorizationForTests,
} from "@web/auth/google/authorization/useStartGoogleAuthorization";
import {
  resetGoogleAvailabilityForTests,
  resetProviderAvailabilityForTests,
  setGoogleAvailabilityForTests,
  setProviderAvailabilityForTests,
} from "@web/auth/providers/useIsProviderAvailable";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";

const mockOpenModal = mock();
const mockCloseModal = mock();
const mockSetView = mock();
const authModalState = { isOpen: false };
// mock.module is process-wide, not scoped to this file, and isn't reliably
// "restorable" afterward (another file's top-level dynamic import can race
// with this file's afterAll). So the factory spreads the real module's other
// exports (AuthModalContext, useAuthModalState, validateAuthSearch - needed
// by AuthModalProvider/router code elsewhere) and checks a flag on every
// useAuthModal() call instead of freezing the mock in at registration time.
const actualAuthModal = {
  ...(await import("@web/components/AuthModal/hooks/useAuthModal")),
};
let isAuthModalMocked = true;

mock.module("@web/components/AuthModal/hooks/useAuthModal", () => ({
  ...actualAuthModal,
  useAuthModal: (...args: unknown[]) =>
    isAuthModalMocked
      ? {
          isOpen: authModalState.isOpen,
          currentView: "login",
          openModal: mockOpenModal,
          closeModal: mockCloseModal,
          setView: mockSetView,
        }
      : // biome-ignore lint/correctness/useHookAtTopLevel: this is a mock.module factory, not a component - the flag is stable for the lifetime of any given render (it only flips once, in afterAll, after this file's components have unmounted).
        actualAuthModal.useAuthModal(...(args as [])),
}));

afterAll(() => {
  isAuthModalMocked = false;
});

const { WelcomeModal } =
  require("./WelcomeModal") as typeof import("./WelcomeModal");
const { STORAGE_KEYS } =
  require("@web/common/constants/storage.constants") as typeof import("@web/common/constants/storage.constants");

const { useShortcutShowcaseStore, initialShortcutShowcaseState } =
  require("@web/components/ShortcutShowcase/showcase.store") as typeof import("@web/components/ShortcutShowcase/showcase.store");

const WELCOME_DIALOG = { name: "Welcome to Compass Calendar" };

// Screens 1 and 2 each seat focus on one primary button, and Enter is its
// native activation. Two presses reach the screen with the auth choices.
const goToChooseScreen = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.keyboard("{Enter}");
  await user.keyboard("{Enter}");
  expect(
    screen.getByRole("button", { name: "Explore without an account" }),
  ).toBeTruthy();
};

describe("WelcomeModal", () => {
  beforeEach(() => {
    localStorage.clear();
    mockOpenModal.mockClear();
    mockCloseModal.mockClear();
    authModalState.isOpen = false;
    window.history.replaceState(null, "", window.location.href);
    useShortcutShowcaseStore.setState(initialShortcutShowcaseState);
  });

  afterEach(() => {
    useShortcutShowcaseStore.setState(initialShortcutShowcaseState);
  });

  it("shows the new copy and the pixel pirate mascot", () => {
    render(<WelcomeModal />);

    expect(
      screen.getByRole("heading", {
        name: "The Keyboard Calendar",
      }),
    ).toBeTruthy();
    expect(screen.getByText(/No clicks allowed/)).toBeTruthy();
    expect(screen.getByRole("img", { name: /pixel pirate/i })).toBeTruthy();
    expect(screen.getByText("No signup required")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Product Hunt/i })).toBeNull();
  });

  it("opens the auth modal from the Log in pill", async () => {
    const user = userEvent.setup();

    const { rerender } = render(<WelcomeModal />);

    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(mockOpenModal).toHaveBeenCalledWith("login");
    expect(localStorage.getItem(STORAGE_KEYS.HAS_SEEN_WELCOME)).toBe("true");

    // The welcome screen hides while the auth modal is open
    authModalState.isOpen = true;
    rerender(<WelcomeModal />);
    expect(
      screen.queryByRole("dialog", { name: "Welcome to Compass Calendar" }),
    ).toBeNull();
  });

  it("does not restore underlay focus when handing off to auth", async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <button type="button">Outside calendar</button>,
    );
    const outside = screen.getByRole("button", { name: "Outside calendar" });
    outside.focus();

    rerender(
      <>
        <button type="button">Outside calendar</button>
        <WelcomeModal />
      </>,
    );
    expect(
      screen.getByRole("button", { name: "Get started for free" }),
    ).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Log in" }));
    authModalState.isOpen = true;
    rerender(
      <>
        <button type="button">Outside calendar</button>
        <WelcomeModal />
      </>,
    );

    expect(
      screen.queryByRole("dialog", { name: "Welcome to Compass Calendar" }),
    ).toBeNull();
    expect(outside).not.toHaveFocus();
  });

  it("reappears when the auth modal closes (e.g. via the browser back button)", async () => {
    const user = userEvent.setup();

    const { rerender } = render(<WelcomeModal />);

    await user.click(screen.getByRole("button", { name: "Log in" }));
    authModalState.isOpen = true;
    rerender(<WelcomeModal />);
    expect(
      screen.queryByRole("dialog", { name: "Welcome to Compass Calendar" }),
    ).toBeNull();

    // Back press pops the ?auth= entry, which closes the auth modal
    authModalState.isOpen = false;
    rerender(<WelcomeModal />);
    expect(
      screen.getByRole("dialog", { name: "Welcome to Compass Calendar" }),
    ).toBeTruthy();
  });

  it("opens on a single Get started action with the headline as the page heading", () => {
    render(<WelcomeModal />);

    expect(
      screen.getByRole("heading", { level: 1, name: "The Keyboard Calendar" }),
    ).toBeTruthy();
    expect(screen.getByText("Step 1 of 3")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Get started for free" }),
    ).toHaveFocus();
    expect(screen.getByText("No account needed.")).toBeTruthy();
    for (const name of [
      "Sign up",
      "Continue with Google",
      "Explore without an account",
      "Who is Compass for?",
    ]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.queryByRole("link", { name: "Terms" })).toBeNull();
  });

  it("advances with Enter or a click, and Escape steps back", async () => {
    const user = userEvent.setup();
    render(<WelcomeModal />);

    await user.keyboard("{Enter}");
    expect(screen.getByText("Step 2 of 3")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Who is Compass for?" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Step 3 of 3")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Connect the calendar you use" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "If you view your calendar in Apple Calendar, it may still be hosted by Google or Microsoft.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Terms" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign up" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.getByText("Step 2 of 3")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Step 1 of 3")).toBeTruthy();

    // Escape on the first screen is a no-op: the dialog stays and nothing
    // starts the practice game behind the visitor's back.
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", WELCOME_DIALOG)).toBeTruthy();
    expect(screen.getByText("Step 1 of 3")).toBeTruthy();
    expect(useShortcutShowcaseStore.getState().isActive).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.HAS_SEEN_WELCOME)).toBeNull();
  });

  it("ignores the auth shortcuts before the last screen, except Log in", async () => {
    const user = userEvent.setup();
    render(<WelcomeModal />);

    await user.keyboard("s");
    await user.keyboard("u");
    await user.keyboard("g");

    expect(mockOpenModal).not.toHaveBeenCalled();
    expect(useShortcutShowcaseStore.getState().isActive).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.HAS_SEEN_WELCOME)).toBeNull();
    expect(screen.getByText("Step 1 of 3")).toBeTruthy();

    await user.keyboard("i");
    expect(mockOpenModal).toHaveBeenCalledWith("login");
  });

  it("toggles FAQ with digits only on the second screen", async () => {
    const user = userEvent.setup();
    render(<WelcomeModal />);

    await user.keyboard("1");
    await user.keyboard("{Enter}");

    // The press on screen 1 did not pre-open the row.
    const question = screen.getByRole("button", {
      name: "Who is Compass for?",
    });
    expect(question).toHaveAttribute("aria-expanded", "false");

    await user.keyboard("1");
    expect(question).toHaveAttribute("aria-expanded", "true");
  });

  it("lets the mouse through on the welcome overlay", () => {
    render(<WelcomeModal />);

    expect(
      screen
        .getByRole("button", { name: "Get started for free" })
        .closest("[data-pointer-pass]"),
    ).not.toBeNull();
  });

  it("expands and collapses FAQ answers on the second screen", async () => {
    const user = userEvent.setup();

    render(<WelcomeModal />);
    await user.keyboard("{Enter}");

    const questionButton = screen.getByRole("button", {
      name: "Who is Compass for?",
    });
    const answerId = questionButton.getAttribute("aria-controls");
    expect(answerId).toBeTruthy();

    const answer = document.getElementById(answerId as string);
    expect(questionButton).toHaveAttribute("aria-expanded", "false");
    expect(answer).toHaveAttribute("aria-hidden", "true");
    expect(answer).toHaveAttribute("data-state", "closed");

    await user.click(questionButton);

    expect(questionButton).toHaveAttribute("aria-expanded", "true");
    expect(answer).toHaveAttribute("aria-hidden", "false");
    expect(answer).toHaveAttribute("data-state", "open");
    expect(
      screen.getByText(/Compass is for busy professionals who live at/),
    ).toBeTruthy();

    await user.click(questionButton);

    expect(questionButton).toHaveAttribute("aria-expanded", "false");
    expect(answer).toHaveAttribute("aria-hidden", "true");
    expect(answer).toHaveAttribute("data-state", "closed");
  });

  it("shows shortcut keycaps on auth and explore actions without hover", async () => {
    const user = userEvent.setup();
    render(<WelcomeModal />);
    await goToChooseScreen(user);

    for (const [name, key] of [
      ["Sign up", "U"],
      ["Log in", "i"],
      ["Explore without an account", "S"],
    ] as const) {
      const hint = within(screen.getByRole("button", { name })).getByText(key);
      expect(hint.className).not.toMatch(/opacity-0/);
    }
  });

  it("opens sign up with the U shortcut", async () => {
    const user = userEvent.setup();
    render(<WelcomeModal />);
    await goToChooseScreen(user);

    await user.keyboard("u");

    expect(mockOpenModal).toHaveBeenCalledWith("signUp");
    expect(localStorage.getItem(STORAGE_KEYS.HAS_SEEN_WELCOME)).toBe("true");
  });

  it("opens log in with the I shortcut", async () => {
    const user = userEvent.setup();
    render(<WelcomeModal />);

    await user.keyboard("i");

    expect(mockOpenModal).toHaveBeenCalledWith("login");
    expect(localStorage.getItem(STORAGE_KEYS.HAS_SEEN_WELCOME)).toBe("true");
  });

  it("starts the practice after exploring without an account", async () => {
    const user = userEvent.setup();

    render(<WelcomeModal />);
    await goToChooseScreen(user);

    await user.keyboard("s");

    expect(localStorage.getItem(STORAGE_KEYS.HAS_SEEN_WELCOME)).toBe("true");
    await waitFor(() => {
      expect(useShortcutShowcaseStore.getState().isActive).toBe(true);
    });
    expect(useShortcutShowcaseStore.getState().entry).toBe("welcome");
    expect(
      localStorage.getItem(STORAGE_KEYS.HAS_SEEN_SHORTCUT_SHOWCASE),
    ).not.toBe("true");
    expect(
      localStorage.getItem(STORAGE_KEYS.HAS_PENDING_SHOWCASE_OFFER),
    ).toBeNull();
  });

  it("cancels a pending practice start when login opens during dismiss", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<WelcomeModal />);
    await goToChooseScreen(user);

    await user.keyboard("s");
    await user.keyboard("i");

    expect(mockOpenModal).toHaveBeenCalledWith("login");
    authModalState.isOpen = true;
    rerender(<WelcomeModal />);
    expect(
      screen.queryByRole("dialog", { name: "Welcome to Compass Calendar" }),
    ).toBeNull();

    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 500);
      });
    });
    expect(useShortcutShowcaseStore.getState().isActive).toBe(false);

    authModalState.isOpen = false;
    rerender(<WelcomeModal />);
    expect(
      screen.getByRole("dialog", { name: "Welcome to Compass Calendar" }),
    ).toBeVisible();
    expect(useShortcutShowcaseStore.getState().isActive).toBe(false);
  });

  it("does not start practice if explore is pressed after login before auth opens", async () => {
    const user = userEvent.setup();
    render(<WelcomeModal />);
    await goToChooseScreen(user);

    await user.keyboard("i");
    expect(mockOpenModal).toHaveBeenCalledWith("login");
    expect(
      screen.queryByRole("dialog", { name: "Welcome to Compass Calendar" }),
    ).toBeNull();

    await user.keyboard("s");
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 500);
      });
    });
    expect(useShortcutShowcaseStore.getState().isActive).toBe(false);
  });

  it("does not mark the practice seen when logging in", async () => {
    const user = userEvent.setup();
    render(<WelcomeModal />);

    await user.keyboard("i");

    expect(mockOpenModal).toHaveBeenCalledWith("login");
    expect(
      localStorage.getItem(STORAGE_KEYS.HAS_SEEN_SHORTCUT_SHOWCASE),
    ).not.toBe("true");
    expect(
      localStorage.getItem(STORAGE_KEYS.HAS_PENDING_SHOWCASE_OFFER),
    ).toBeNull();
  });

  it("defers the practice offer to after signup", async () => {
    const user = userEvent.setup();
    render(<WelcomeModal />);
    await goToChooseScreen(user);

    await user.click(screen.getByRole("button", { name: "Sign up" }));

    expect(mockOpenModal).toHaveBeenCalledWith("signUp");
    expect(localStorage.getItem(STORAGE_KEYS.HAS_PENDING_SHOWCASE_OFFER)).toBe(
      "true",
    );
    expect(
      localStorage.getItem(STORAGE_KEYS.HAS_SEEN_SHORTCUT_SHOWCASE),
    ).not.toBe("true");
  });

  it("ignores KeyboardEvents with no key instead of throwing", () => {
    render(<WelcomeModal />);
    const getStarted = screen.getByRole("button", {
      name: "Get started for free",
    });

    expect(() => {
      act(() => {
        dispatchMissingKey("keydown", getStarted);
      });
    }).not.toThrow();

    expect(mockOpenModal).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.HAS_SEEN_WELCOME)).toBeNull();
  });

  it("ignores the shortcut keys when a modifier is held", async () => {
    const user = userEvent.setup();
    render(<WelcomeModal />);

    await user.keyboard("{Meta>}u{/Meta}");

    expect(mockOpenModal).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.HAS_SEEN_WELCOME)).toBeNull();
  });

  it("focuses the sign up CTA and keeps Tab inside the dialog", async () => {
    const user = userEvent.setup();

    render(
      <>
        <button type="button">Outside calendar</button>
        <WelcomeModal />
      </>,
    );

    await goToChooseScreen(user);

    // Not the panel's first focusable (Log in): the primary action is signing
    // up, so that is where focus lands.
    const signUp = screen.getByRole("button", { name: "Sign up" });
    expect(signUp).toHaveFocus();

    const terms = screen.getByRole("link", { name: "Terms" });
    terms.focus();
    expect(terms).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Log in" })).toHaveFocus();
    expect(
      screen.getByRole("button", { name: "Outside calendar" }),
    ).not.toHaveFocus();
  });

  describe("with Google available", () => {
    const startGoogleAuthorization = mock();

    beforeEach(() => {
      startGoogleAuthorization.mockClear();
      registerUseStartGoogleAuthorizationForTests(() => ({
        loading: false,
        startGoogleAuthorization,
      }));
      resetGoogleAvailabilityForTests();
      setGoogleAvailabilityForTests("available");
    });

    afterEach(() => {
      // Unmount before restoring the seams. resetGoogleAvailabilityForTests
      // emits synchronously, so a still-mounted modal would re-render against
      // the real hook after the mock had already rendered without one, and
      // React would throw "Should have a queue" on the hook-count change.
      cleanup();
      resetUseStartGoogleAuthorizationForTests();
      resetGoogleAvailabilityForTests();
    });

    it("leads with the Google round trip that also connects the calendar", async () => {
      const user = userEvent.setup();
      render(<WelcomeModal />);
      await goToChooseScreen(user);

      expect(
        screen.getByRole("button", { name: "Continue with Google" }),
      ).toBeTruthy();
      expect(
        screen.getByText(/Signs you up and connects your Google Calendar/),
      ).toBeTruthy();
      expect(
        within(
          screen.getByRole("button", { name: "Continue with Google" }),
        ).getByText("G"),
      ).toBeTruthy();
      // Email signup steps aside to a clearly secondary label.
      expect(
        screen.getByRole("button", { name: "Sign up with email" }),
      ).toHaveClass("w-full", "h-10", "c-button-elevated");
    });

    it("starts Google auth from the button and queues the practice offer", async () => {
      const user = userEvent.setup();
      render(<WelcomeModal />);
      await goToChooseScreen(user);

      await user.click(
        screen.getByRole("button", { name: "Continue with Google" }),
      );

      expect(startGoogleAuthorization).toHaveBeenCalled();
      expect(localStorage.getItem(STORAGE_KEYS.HAS_SEEN_WELCOME)).toBe("true");
      expect(
        localStorage.getItem(STORAGE_KEYS.HAS_PENDING_SHOWCASE_OFFER),
      ).toBe("true");
    });

    it("starts Google auth with the G shortcut", async () => {
      const user = userEvent.setup();
      render(<WelcomeModal />);
      await goToChooseScreen(user);

      await user.keyboard("g");

      expect(startGoogleAuthorization).toHaveBeenCalled();
    });
  });

  describe("with Microsoft connect available", () => {
    beforeEach(() => {
      setProviderAvailabilityForTests("microsoft", "available");
    });

    afterEach(() => {
      cleanup();
      resetProviderAvailabilityForTests();
    });

    it("offers a Connect Microsoft button and the host explainer", async () => {
      const user = userEvent.setup();
      render(<WelcomeModal />);
      await goToChooseScreen(user);

      expect(
        screen.getByRole("heading", { name: "Connect the calendar you use" }),
      ).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Connect Microsoft" }),
      ).toBeTruthy();
      await user.click(
        screen.getByRole("button", { name: "Connect Microsoft" }),
      );
      expect(mockOpenModal).toHaveBeenCalledWith("signUp");
    });
  });
});
