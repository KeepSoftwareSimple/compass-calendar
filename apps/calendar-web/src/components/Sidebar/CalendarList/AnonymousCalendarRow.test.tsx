import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import { createMockConnection } from "@web/__tests__/utils/factories/calendar.factory";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realSession from "@web/auth/compass/session/useSession";
import * as realAuthStateUtil from "@web/auth/compass/state/auth.state.util";
import * as realSignupFunnel from "@web/auth/posthog/signup-funnel";
import { userMetadataActions } from "@web/auth/state/user-metadata.store";
import * as realAppAccess from "@web/billing/useAppAccess";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import * as realAuthModal from "@web/components/AuthModal/hooks/useAuthModal";
import {
  ANONYMOUS_CALENDAR_ROW_TRIAL_MESSAGE,
  AnonymousCalendarRow,
} from "./AnonymousCalendarRow";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockOpenModal = mock();
const mockTrackLocalModeSelected = mock();
const mockTrackSignupStartedAtClick = mock(
  async (_source: realSignupFunnel.SignupSource) => {},
);

let mockAuthenticated = false;
let mockAppAccess: realAppAccess.AppAccess = { kind: "open" };

beforeEach(() => {
  mockOpenModal.mockClear();
  mockTrackLocalModeSelected.mockClear();
  mockTrackSignupStartedAtClick.mockClear();
  mockAuthenticated = false;
  mockAppAccess = { kind: "open" };
  userMetadataActions.clear();
});

mockModuleForFile(
  "@web/components/AuthModal/hooks/useAuthModal",
  realAuthModal,
  { useAuthModal: () => ({ openModal: mockOpenModal }) },
);

mockModuleForFile("@web/auth/posthog/signup-funnel", realSignupFunnel, {
  trackLocalModeSelected: (
    ...args: Parameters<typeof realSignupFunnel.trackLocalModeSelected>
  ) => mockTrackLocalModeSelected(...args),
  trackSignupStartedAtClick: (
    ...args: Parameters<typeof realSignupFunnel.trackSignupStartedAtClick>
  ) => mockTrackSignupStartedAtClick(...args),
});

mockModuleForFile(
  "@web/auth/compass/state/auth.state.util",
  realAuthStateUtil,
  {
    shouldShowAnonymousCalendarChangeSignUpPrompt: () => false,
    subscribeToAuthState: (callback: () => void) => {
      callback();
      return () => {};
    },
  },
);

mockModuleForFile("@web/auth/compass/session/useSession", realSession, {
  useSession: () => ({
    authenticated: mockAuthenticated,
    setAuthenticated: () => {},
  }),
});

mockModuleForFile("@web/billing/useAppAccess", realAppAccess, {
  useAppAccess: () => mockAppAccess,
});

describe("AnonymousCalendarRow", () => {
  const mockCalendar: Calendar = {
    id: CalendarIdSchema.parse(createObjectIdString()),
    name: "Compass",
    description: "",
    timeZone: null,
    foregroundColor: "#000000",
    backgroundColor: "#ffffff",
    provider: "local",
    access: "owner",
    capabilities: getCalendarCapabilities("owner"),
    isPrimary: true,
    isVisible: true,
    isActive: true,
  };

  it("renders trial sync copy for anonymous visitors", async () => {
    render(<AnonymousCalendarRow calendar={mockCalendar} />);

    expect(screen.getByText("On this device only")).toBeInTheDocument();
    expect(ANONYMOUS_CALENDAR_ROW_TRIAL_MESSAGE).toBe(
      "Start your free trial to sync",
    );
    screen
      .getByRole("button", {
        name: "Start your free trial to save this calendar",
      })
      .focus();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Start free trial" }),
      ).toBeInTheDocument();
    });
  });

  it("hides trial prompts for a paying subscriber", () => {
    mockAuthenticated = true;
    mockAppAccess = {
      kind: "server",
      status: "active",
      isReadOnly: false,
      trialEndsAt: null,
    };
    userMetadataActions.set({
      syncConnections: [createMockConnection("owner@example.com")],
    });

    render(<AnonymousCalendarRow calendar={mockCalendar} />);

    expect(
      screen.queryByRole("button", { name: "Start free trial" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(ANONYMOUS_CALENDAR_ROW_TRIAL_MESSAGE),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "On this device only calendar" }),
    ).toBeInTheDocument();
  });

  it("hides trial prompts for a trialing subscriber", () => {
    mockAuthenticated = true;
    mockAppAccess = {
      kind: "server",
      status: "trialing",
      isReadOnly: false,
      trialEndsAt: "2026-12-01T00:00:00.000Z",
    };

    render(<AnonymousCalendarRow calendar={mockCalendar} />);

    expect(
      screen.queryByText(ANONYMOUS_CALENDAR_ROW_TRIAL_MESSAGE),
    ).not.toBeInTheDocument();
  });

  it("keeps trial prompts for signed-in users awaiting checkout", async () => {
    mockAuthenticated = true;
    mockAppAccess = {
      kind: "server",
      status: "awaiting_checkout",
      isReadOnly: true,
      trialEndsAt: null,
    };

    render(<AnonymousCalendarRow calendar={mockCalendar} />);

    screen
      .getByRole("button", {
        name: "Start your free trial to save this calendar",
      })
      .focus();
    await waitFor(() => {
      expect(
        screen.getByText(ANONYMOUS_CALENDAR_ROW_TRIAL_MESSAGE),
      ).toBeInTheDocument();
    });
  });

  it("records local mode when the row is clicked without opening sign-up", async () => {
    const user = userEvent.setup();
    render(<AnonymousCalendarRow calendar={mockCalendar} />);

    const button = screen.getByRole("button", {
      name: "Start your free trial to save this calendar",
    });
    await user.click(button);

    expect(mockTrackLocalModeSelected).toHaveBeenCalledWith("anon_nudge");
    expect(mockTrackSignupStartedAtClick).not.toHaveBeenCalled();
    expect(mockOpenModal).not.toHaveBeenCalled();
  });

  it("starts signup from the tooltip trial CTA", async () => {
    const user = userEvent.setup();
    render(<AnonymousCalendarRow calendar={mockCalendar} />);

    screen
      .getByRole("button", {
        name: "Start your free trial to save this calendar",
      })
      .focus();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Start free trial" }),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Start free trial" }));

    expect(mockTrackSignupStartedAtClick).toHaveBeenCalledWith("anon_nudge");
    expect(mockOpenModal).toHaveBeenCalledWith("signUp");
  });

  it("is keyboard accessible on the row without opening sign-up", async () => {
    const user = userEvent.setup();
    render(<AnonymousCalendarRow calendar={mockCalendar} />);

    const button = screen.getByRole("button", {
      name: "Start your free trial to save this calendar",
    });
    button.focus();
    await user.keyboard("{Enter}");

    expect(mockTrackLocalModeSelected).toHaveBeenCalledWith("anon_nudge");
    expect(mockOpenModal).not.toHaveBeenCalled();
  });

  it("displays the calendar's background color on the dot", () => {
    render(<AnonymousCalendarRow calendar={mockCalendar} />);

    const dot = screen
      .getByRole("button", {
        name: "Start your free trial to save this calendar",
      })
      .querySelector("span[aria-hidden]");

    expect(dot).toHaveStyle({
      backgroundColor: "#ffffff",
      borderColor: "#ffffff",
    });
  });
});
