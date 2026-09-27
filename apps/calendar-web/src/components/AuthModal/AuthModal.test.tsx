import {
  type AnyRouter,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, type ReactElement } from "react";
import "@testing-library/jest-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTestEmailPasswordPort } from "@web/__tests__/helpers/web-test-seams";
import { createTestRouter } from "@web/__tests__/utils/providers/createTestRouter";
import {
  registerEmailPasswordPort,
  resetEmailPasswordPort,
} from "@web/auth/compass/hooks/emailpassword.port";
import { registerUseCompleteAuthenticationForTests } from "@web/auth/compass/hooks/useCompleteAuthentication.registry";
import { markGoogleAuthNeedsConsentRetry } from "@web/auth/providers/authorization/provider-authorization.storage";
import { registerUseStartProviderAuthorizationForTests } from "@web/auth/providers/authorization/useStartProviderAuthorization";
import {
  resetProviderAvailabilityForTests,
  setProviderAvailabilityForTests,
} from "@web/auth/providers/useIsProviderAvailable";
import { AuthModal } from "./AuthModal";
import { AuthModalProvider } from "./AuthModalProvider";
import { useAuthModal, validateAuthSearch } from "./hooks/useAuthModal";
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const mockGoogleLogin = mock();
const mockUseStartProviderAuthorization = mock(() => ({
  loading: false,
  startAuthorization: mockGoogleLogin,
}));
const mockCompleteAuthentication = mock().mockResolvedValue(undefined);
let mockEmailPassword = createTestEmailPasswordPort();

// mock.module is process-wide. Capture the real hook and flip the flag off in
// afterAll so later files do not inherit this file's unauthenticated default.
const actualUseSession = (await import("@web/auth/compass/session/useSession"))
  .useSession;
let isSessionMocked = true;
const mockUseSession = mock(() => ({
  authenticated: false,
  userId: undefined as string | undefined,
}));
mock.module("@web/auth/compass/session/useSession", () => ({
  useSession: (...args: Parameters<typeof actualUseSession>) =>
    isSessionMocked ? mockUseSession(...args) : actualUseSession(...args),
}));

const { redirectToToday, loadTodayData } = await import("@web/routers/loaders");
const { ROOT_ROUTES } = await import("@web/common/constants/routes");

async function waitForRouterIdle(router: AnyRouter) {
  await waitFor(() => {
    expect(router.state.status).toBe("idle");
  });
}

async function waitForAuthModal(
  heading: RegExp | string = /hey, welcome back/i,
) {
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
  });
}

const ModalTrigger = () => {
  const { openModal } = useAuthModal();
  return (
    <button type="button" onClick={() => openModal("login")}>
      Open Modal
    </button>
  );
};

/**
 * Renders `component` and `AuthModal` as the root route's content on a
 * memory-history router, mirroring how RootShell mounts them in production.
 */
const renderWithProviders = async (
  component: ReactElement,
  initialRoute: string = "/day",
) => {
  const router = createTestRouter(
    <AuthModalProvider>
      {component}
      <AuthModal />
    </AuthModalProvider>,
    { initialEntries: [initialRoute] },
  );
  const result = render(<RouterProvider router={router} />);
  await waitForRouterIdle(router);
  return { router, ...result };
};

const DayRedirectShell = () => (
  <AuthModalProvider>
    <AuthModal />
    <Outlet />
  </AuthModalProvider>
);

const renderWithDayRedirectRoute = async (initialRoute: string) => {
  const dayRootRoute = createRootRoute({ validateSearch: validateAuthSearch });
  const dayRoute = createRoute({
    getParentRoute: () => dayRootRoute,
    path: "/day",
    component: DayRedirectShell,
  });
  const dayIndexRoute = createRoute({
    getParentRoute: () => dayRoute,
    path: "/",
    beforeLoad: () => redirectToToday(ROOT_ROUTES.DAY_DATE),
  });
  const dayDateRoute = createRoute({
    getParentRoute: () => dayRoute,
    path: "$dateString",
    component: () => <div>Day route loaded</div>,
  });

  const router = createRouter({
    routeTree: dayRootRoute.addChildren([
      dayRoute.addChildren([dayIndexRoute, dayDateRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: [initialRoute] }),
    defaultPendingMs: 0,
  });

  const result = render(<RouterProvider router={router} />);
  await waitForRouterIdle(router);
  return { router, ...result };
};

function installAuthModalTestSeams() {
  mockGoogleLogin.mockClear();
  mockUseStartProviderAuthorization.mockClear();
  mockCompleteAuthentication.mockClear();
  mockCompleteAuthentication.mockResolvedValue(undefined);
  mockEmailPassword = createTestEmailPasswordPort();

  registerUseStartProviderAuthorizationForTests(
    mockUseStartProviderAuthorization,
  );
  registerUseCompleteAuthenticationForTests(() => mockCompleteAuthentication);
  registerEmailPasswordPort(mockEmailPassword);
  resetProviderAvailabilityForTests();
  setProviderAvailabilityForTests("google", "available");
  mockUseSession.mockReset().mockReturnValue({
    authenticated: false,
    userId: undefined,
  });
}

function setSignInAvailability(options: {
  google?: "available" | "unavailable";
  microsoft?: "available" | "unavailable";
  apple?: "available" | "unavailable";
}) {
  resetProviderAvailabilityForTests();
  setProviderAvailabilityForTests("google", options.google ?? "unavailable");
  setProviderAvailabilityForTests(
    "microsoft",
    options.microsoft ?? "unavailable",
  );
  setProviderAvailabilityForTests("apple", options.apple ?? "unavailable");
}

describe("AuthModal", () => {
  beforeEach(() => {
    sessionStorage.clear();
    installAuthModalTestSeams();
  });

  afterAll(() => {
    resetEmailPasswordPort();
  });

  describe("Modal Open/Close", () => {
    it("opens modal when triggered", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      expect(
        screen.queryByRole("heading", { name: /hey, welcome back/i }),
      ).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /open modal/i }));
      await waitForAuthModal();
    });

    it("closes modal when backdrop is clicked", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));
      await waitForAuthModal();

      const backdrop = screen.getByRole("presentation");
      expect(backdrop).toBeInTheDocument();

      await user.click(backdrop);

      await waitFor(() => {
        expect(
          screen.queryByRole("heading", { name: /hey, welcome back/i }),
        ).not.toBeInTheDocument();
      });
    });

    it("closes modal when Escape key is pressed", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));
      await waitForAuthModal();

      const backdrop = screen.getByRole("presentation");
      await act(async () => {
        backdrop.focus();
      });

      await user.keyboard("{Escape}");

      await waitFor(() => {
        expect(
          screen.queryByRole("heading", { name: /hey, welcome back/i }),
        ).not.toBeInTheDocument();
      });
    });

    it("opens with a pushed ?auth= entry and closes on browser back", async () => {
      const user = userEvent.setup();
      const { router } = await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));
      await waitForAuthModal();
      await waitFor(() => {
        expect(router.state.location.searchStr).toBe("?auth=login");
      });

      await act(async () => {
        router.history.back();
      });

      await waitFor(() => {
        expect(
          screen.queryByRole("heading", { name: /hey, welcome back/i }),
        ).not.toBeInTheDocument();
      });
    });

    it("removes the ?auth= param when the modal is dismissed", async () => {
      const user = userEvent.setup();
      const { router } = await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));
      await waitForAuthModal();
      await waitFor(() => {
        expect(router.state.location.searchStr).toBe("?auth=login");
      });

      const backdrop = screen.getByRole("presentation");
      await act(async () => {
        backdrop.focus();
      });
      await user.keyboard("{Escape}");

      await waitFor(() => {
        expect(router.state.location.searchStr).toBe("");
      });
    });
  });

  describe("Google retry after a withheld refresh token", () => {
    it("does not force prompt=consent on a normal mount", async () => {
      await renderWithProviders(<ModalTrigger />);

      expect(mockUseStartProviderAuthorization).toHaveBeenCalledWith(
        "google",
        expect.objectContaining({ prompt: undefined }),
      );
    });

    it("forces prompt=consent once, after Google withheld a refresh token on the prior attempt", async () => {
      markGoogleAuthNeedsConsentRetry();

      await renderWithProviders(<ModalTrigger />);

      expect(mockUseStartProviderAuthorization).toHaveBeenCalledWith(
        "google",
        expect.objectContaining({ prompt: "consent" }),
      );
    });
  });

  describe("Auth view switching", () => {
    it("shows sign up when on sign in form", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));

      await waitFor(() => {
        const signUpSwitch = screen.getByRole("button", { name: /^sign up$/i });
        expect(signUpSwitch).toBeInTheDocument();
      });
    });

    it("switches to Sign Up form when switch is clicked", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /^sign up$/i }),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /^sign up$/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /nice to meet you/i }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: /^log in$/i }),
        ).toBeInTheDocument();
      });
    });

    it("shows Name field only on Sign Up form", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));

      // Login form - no Name field
      await waitFor(() => {
        expect(screen.queryByLabelText(/name/i)).not.toBeInTheDocument();
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      });

      // Switch to sign up
      await user.click(screen.getByRole("button", { name: /^sign up$/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
      });
    });
  });

  describe("Login Form", () => {
    it("renders email and password fields", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      });
    });

    it("renders submit button", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));

      await waitFor(() => {
        // Look for the submit button by type - CTA is "login"
        const submitButton = screen.getByRole("button", { name: /^log in$/i });
        expect(submitButton).toBeInTheDocument();
        expect(submitButton).toHaveAttribute("type", "submit");
      });
    });

    it("shows email error on blur with invalid email", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/email/i), "invalid-email");

      await user.tab();

      await waitFor(() => {
        expect(
          screen.getByText(/please enter a valid email address/i),
        ).toBeInTheDocument();
      });
    });

    it("navigates to forgot password when link is clicked", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /forgot password/i }),
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole("button", { name: /forgot password/i }),
      );

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /reset password/i }),
        ).toBeInTheDocument();
      });
    });

    it("does not await Google import after email/password login", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/email/i), "test@example.com");

      await user.type(screen.getByLabelText(/password/i), "password123");

      await user.click(screen.getByRole("button", { name: /^log in$/i }));

      await waitFor(() => {
        expect(mockCompleteAuthentication).toHaveBeenCalledWith(
          expect.objectContaining({
            email: "test@example.com",
          }),
        );
      });
    });
  });

  describe("Sign Up Form", () => {
    it("renders name, email, and password fields", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /^sign up$/i }),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /^sign up$/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      });
    });

    it("shows password error for short password", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /^sign up$/i }),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /^sign up$/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/password/i), "short");

      await user.tab();

      await waitFor(() => {
        expect(
          screen.getByText(/password must be at least 8 characters/i),
        ).toBeInTheDocument();
      });
    });

    it("updates greeting when user types name", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /^sign up$/i }),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /^sign up$/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: /^nice to meet you$/i }),
        ).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/name/i), "Alex");

      await waitFor(() => {
        expect(
          screen.getByRole("heading", {
            name: /nice to meet you, alex/i,
          }),
        ).toBeInTheDocument();
      });
    });

    it("does not await Google import after email/password signup", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /^sign up$/i }),
        ).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /^sign up$/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/name/i), "Alex");

      await user.type(screen.getByLabelText(/email/i), "test@example.com");

      await user.type(screen.getByLabelText(/password/i), "password123");

      await user.click(screen.getByRole("button", { name: /^sign up$/i }));

      await waitFor(() => {
        expect(mockCompleteAuthentication).toHaveBeenCalledWith(
          expect.objectContaining({
            email: "test@example.com",
          }),
        );
      });
      expect(mockEmailPassword.signUp).toHaveBeenCalledWith({
        shouldTryLinkingWithSessionUser: false,
        formFields: [
          { id: "name", value: "Alex" },
          { id: "email", value: "test@example.com" },
          { id: "password", value: "password123" },
        ],
      });
    });

    // Signing up is always a fresh identity. Linking it to whatever session
    // the browser still holds is how a just-deleted account's leftover cookie
    // dragged the new one into its dead session.
    it("skips existing-session linking during email/password sign up", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /^sign up$/i }),
        ).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /^sign up$/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
      });
      await user.type(screen.getByLabelText(/name/i), "Alex");
      await user.type(screen.getByLabelText(/email/i), "test@example.com");
      await user.type(screen.getByLabelText(/password/i), "password123");
      await user.click(screen.getByRole("button", { name: /^sign up$/i }));

      await waitFor(() => {
        expect(mockEmailPassword.signUp).toHaveBeenCalledWith(
          expect.objectContaining({ shouldTryLinkingWithSessionUser: false }),
        );
      });
    });

    it("skips existing-session linking during email/password sign in", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/email/i), "test@example.com");
      await user.type(screen.getByLabelText(/password/i), "password123");
      await user.click(screen.getByRole("button", { name: /^log in$/i }));

      await waitFor(() => {
        expect(mockEmailPassword.signIn).toHaveBeenCalledWith({
          shouldTryLinkingWithSessionUser: false,
          formFields: [
            { id: "email", value: "test@example.com" },
            { id: "password", value: "password123" },
          ],
        });
      });
    });
  });

  describe("Forgot Password Form", () => {
    it("renders email field and instructions", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /forgot password/i }),
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole("button", { name: /forgot password/i }),
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
        expect(
          screen.getByText(/enter your email address/i),
        ).toBeInTheDocument();
      });
    });

    it("shows success message after submission", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /forgot password/i }),
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole("button", { name: /forgot password/i }),
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/email/i), "test@example.com");
      await user.click(
        screen.getByRole("button", { name: /send reset link/i }),
      );

      await waitFor(() => {
        expect(screen.getByText(/check your email/i)).toBeInTheDocument();
      });
    });

    it("shows forgot password errors inline without the shared auth banner", async () => {
      mockEmailPassword.sendPasswordResetEmail.mockResolvedValue({
        status: "PASSWORD_RESET_NOT_ALLOWED",
        reason: "Password reset disabled",
      });

      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /forgot password/i }),
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole("button", { name: /forgot password/i }),
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      });

      await user.type(screen.getByLabelText(/email/i), "test@example.com");
      await user.click(
        screen.getByRole("button", { name: /send reset link/i }),
      );

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent(
          "Password reset disabled",
        );
      });

      expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument();
      expect(screen.queryAllByText("Password reset disabled")).toHaveLength(1);
    });

    it("navigates back to sign in when link is clicked", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /forgot password/i }),
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole("button", { name: /forgot password/i }),
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /back to sign in/i }),
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole("button", { name: /back to sign in/i }),
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /^sign up$/i }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("heading", { name: /hey, welcome back/i }),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Google Sign In", () => {
    it("renders Google sign in button", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));

      await waitFor(() => {
        const googleButton = screen.getByRole("button", {
          name: /continue with google/i,
        });
        expect(googleButton).toBeInTheDocument();
        expect(googleButton).toHaveTextContent(/continue with google/i);
      });
    });

    it("calls googleLogin when Google button is clicked", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /continue with google/i }),
        ).toBeInTheDocument();
      });

      await user.click(
        screen.getByRole("button", { name: /continue with google/i }),
      );

      expect(mockGoogleLogin).toHaveBeenCalled();
    });

    it("hides provider sign in when no providers are configured", async () => {
      const user = userEvent.setup();
      setSignInAvailability({});
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));
      await waitForAuthModal();

      expect(
        screen.queryByRole("button", { name: /continue with google/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /continue with microsoft/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /continue with apple/i }),
      ).not.toBeInTheDocument();
    });

    it("keeps consistent button label when switching views", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /continue with google/i }),
        ).toHaveTextContent(/continue with google/i);
      });

      await user.click(screen.getByRole("button", { name: /^sign up$/i }));

      // Google button label stays consistent as "Continue with Google"
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /continue with google/i }),
        ).toHaveTextContent(/continue with google/i);
      });
    });
  });

  describe("Provider sign-in buttons", () => {
    it("renders all three configured provider buttons", async () => {
      const user = userEvent.setup();
      setSignInAvailability({
        google: "available",
        microsoft: "available",
        apple: "available",
      });
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));
      await waitForAuthModal();

      expect(
        screen.getByRole("button", { name: "Continue with Google" }),
      ).toHaveTextContent("Continue with Google");
      expect(
        screen.getByRole("button", { name: "Continue with Microsoft" }),
      ).toHaveTextContent("Continue with Microsoft");
      expect(
        screen.getByRole("button", { name: "Continue with Apple" }),
      ).toHaveTextContent("Continue with Apple");
    });

    it("renders only Google when it is the sole configured provider", async () => {
      const user = userEvent.setup();
      setSignInAvailability({ google: "available" });
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));
      await waitForAuthModal();

      expect(
        screen.getByRole("button", { name: "Continue with Google" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Continue with Microsoft" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Continue with Apple" }),
      ).not.toBeInTheDocument();
    });

    it("starts Microsoft auth with M when focus is not in a field", async () => {
      const mockMicrosoftStart = mock();
      registerUseStartProviderAuthorizationForTests((provider) => ({
        loading: false,
        startAuthorization:
          provider === "microsoft" ? mockMicrosoftStart : mock(),
      }));
      const user = userEvent.setup();
      setSignInAvailability({
        google: "available",
        microsoft: "available",
      });
      await renderWithProviders(<ModalTrigger />);
      await user.click(screen.getByRole("button", { name: /open modal/i }));
      await waitForAuthModal();

      screen.getByRole("dialog").focus();
      await user.keyboard("m");

      expect(mockMicrosoftStart).toHaveBeenCalled();
    });
  });

  describe("Privacy and Terms Links", () => {
    it("renders pricing, privacy, and terms links", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));

      await waitFor(() => {
        expect(
          screen.getByRole("link", { name: /pricing/i }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("link", { name: /terms/i }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("link", { name: /privacy/i }),
        ).toBeInTheDocument();
      });
    });

    it("shows an Esc hint to leave the form", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));
      await waitForAuthModal();

      expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
      expect(
        within(screen.getByRole("button", { name: /back/i })).getByText("Esc"),
      ).toBeInTheDocument();
    });

    it("links open in new tab", async () => {
      const user = userEvent.setup();
      await renderWithProviders(<ModalTrigger />);

      await user.click(screen.getByRole("button", { name: /open modal/i }));

      await waitFor(() => {
        const pricingLink = screen.getByRole("link", {
          name: /pricing/i,
        });
        const termsLink = screen.getByRole("link", {
          name: /terms/i,
        });
        const privacyLink = screen.getByRole("link", {
          name: /privacy/i,
        });

        expect(pricingLink).toHaveAttribute("target", "_blank");
        expect(termsLink).toHaveAttribute("target", "_blank");
        expect(privacyLink).toHaveAttribute("target", "_blank");
        expect(pricingLink).toHaveAttribute("rel", "noopener noreferrer");
        expect(termsLink).toHaveAttribute("rel", "noopener noreferrer");
        expect(privacyLink).toHaveAttribute("rel", "noopener noreferrer");
        expect(pricingLink).toHaveAttribute(
          "href",
          "https://compasscalendar.com/pricing",
        );
      });
    });
  });
});

describe("URL Parameter Support", () => {
  beforeEach(() => {
    installAuthModalTestSeams();
  });

  it("opens sign in modal when ?auth=login is present", async () => {
    await renderWithProviders(<div />, "/?auth=login");

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /hey, welcome back/i }),
      ).toBeInTheDocument();
    });
  });

  it("ignores ?auth= while a session already exists", async () => {
    mockUseSession.mockReturnValue({
      authenticated: true,
      userId: "user-1",
    });
    const { router } = await renderWithProviders(<div />, "/?auth=login");

    expect(
      screen.queryByRole("heading", { name: /hey, welcome back/i }),
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(router.state.location.search).not.toEqual(
        expect.objectContaining({ auth: "login" }),
      );
    });
  });

  it("opens sign up modal when ?auth=signup is present", async () => {
    await renderWithProviders(<div />, "/?auth=signup");

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /nice to meet you/i }),
      ).toBeInTheDocument();
    });
  });

  it("opens forgot password modal when ?auth=forgot is present", async () => {
    await renderWithProviders(<div />, "/?auth=forgot");

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /reset password/i }),
      ).toBeInTheDocument();
    });
  });

  it("handles case-insensitive param values", async () => {
    await renderWithProviders(<div />, "/?auth=LOGIN");

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /hey, welcome back/i }),
      ).toBeInTheDocument();
    });
  });

  it("does not open modal for invalid param value", async () => {
    await renderWithProviders(<div />, "/?auth=invalid");

    // renderWithProviders waits for the router's initial match, so there is
    // no deferred modal work left to poll for here.

    expect(
      screen.queryByRole("heading", { name: /hey, welcome back/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /nice to meet you/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /reset password/i }),
    ).not.toBeInTheDocument();
  });

  it("works on different routes", async () => {
    await renderWithProviders(<div />, "/week?auth=signup");

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /nice to meet you/i }),
      ).toBeInTheDocument();
    });
  });

  it("preserves an unrelated search param across a modal open/close round-trip", async () => {
    const user = userEvent.setup();
    const { router } = await renderWithProviders(
      <ModalTrigger />,
      "/?ref=newsletter",
    );

    await user.click(screen.getByRole("button", { name: /open modal/i }));
    await waitForAuthModal();
    await waitFor(() => {
      expect(router.state.location.search as Record<string, unknown>).toEqual({
        ref: "newsletter",
        auth: "login",
      });
    });

    const backdrop = screen.getByRole("presentation");
    await act(async () => {
      backdrop.focus();
    });
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(router.state.location.search as Record<string, unknown>).toEqual({
        ref: "newsletter",
      });
    });
  });

  it("opens reset password after the /day redirect preserves auth params", async () => {
    const { dateString } = loadTodayData();

    const { router } = await renderWithDayRedirectRoute(
      "/day?auth=reset&token=reset-token",
    );

    await waitFor(() => {
      expect(screen.getByText("Day route loaded")).toBeInTheDocument();
    });
    await waitForAuthModal(/set new password/i);

    // The ?auth param stays in the URL while the modal is open (URL is the
    // modal's source of truth), so the redirect preserves both params
    expect(router.state.location.pathname).toBe(`/day/${dateString}`);
    expect(router.state.location.search).toEqual({
      auth: "reset",
      token: "reset-token",
    });
  });

  it("submits reset password with the initial token after the URL changes", async () => {
    const user = userEvent.setup();
    const { router } = await renderWithProviders(
      <div />,
      "/day?auth=reset&token=reset-token",
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /set new password/i }),
      ).toBeInTheDocument();
    });

    // Simulate something else clearing the token param out from under the
    // modal (auth stays "reset" so the modal itself stays open) before the
    // user finishes the form.
    await act(async () => {
      void router.navigate({
        to: ".",
        search: (prev) => ({ auth: prev.auth }),
      });
    });
    await waitFor(() => {
      expect(router.state.status).toBe("idle");
    });

    await user.type(
      screen.getByLabelText(/^new password$/i),
      "updatedpassword",
    );
    await user.click(screen.getByRole("button", { name: /set new password/i }));

    await waitFor(() => {
      expect(mockEmailPassword.submitNewPassword).toHaveBeenCalledWith({
        formFields: [{ id: "password", value: "updatedpassword" }],
      });
    });

    await waitFor(() => {
      expect(router.state.location.search.token).toBeUndefined();
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Password reset successful. Log in with your new password.",
    );
    expect(
      screen.getByRole("heading", { name: /hey, welcome back/i }),
    ).toBeInTheDocument();
    expect(mockCompleteAuthentication).not.toHaveBeenCalled();
    expect(
      mockEmailPassword.getResetPasswordTokenFromURL,
    ).not.toHaveBeenCalled();
  });

  it("switches to signUp (not back to loginAfterReset) when Sign up is clicked after reset", async () => {
    const user = userEvent.setup();
    mockEmailPassword.submitNewPassword.mockResolvedValue({
      status: "OK",
    });
    await renderWithProviders(<div />, "/day?auth=reset&token=reset-token");

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /set new password/i }),
      ).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/^new password$/i), "newpassword123");
    await user.click(screen.getByRole("button", { name: /set new password/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Password reset successful. Log in with your new password.",
      );
    });

    await user.click(screen.getByRole("button", { name: /^sign up$/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /nice to meet you/i }),
      ).toBeInTheDocument();
    });
  });
});

describe("Shortcut hints", () => {
  beforeEach(() => {
    installAuthModalTestSeams();
  });

  it("shows U, G, and Enter chips on login and switches to signup with U", async () => {
    const user = userEvent.setup();
    await renderWithProviders(<ModalTrigger />);

    await user.click(screen.getByRole("button", { name: /open modal/i }));
    await waitForAuthModal();

    expect(
      within(screen.getByRole("button", { name: /^sign up$/i })).getByText("U"),
    ).toBeTruthy();
    expect(
      within(
        screen.getByRole("button", { name: "Continue with Google" }),
      ).getByText("G"),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("button", { name: /^log in$/i })).getByText(
        "Enter",
      ),
    ).toBeTruthy();

    screen.getByRole("dialog").focus();
    await user.keyboard("u");

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /nice to meet you/i }),
      ).toBeInTheDocument();
    });
  });

  it("types letters into email instead of switching views", async () => {
    const user = userEvent.setup();
    await renderWithProviders(<ModalTrigger />);
    await user.click(screen.getByRole("button", { name: /open modal/i }));
    await waitForAuthModal();

    const email = screen.getByLabelText(/email/i);
    expect(email).toHaveFocus();
    await user.keyboard("user@example.com");

    expect(email).toHaveValue("user@example.com");
    expect(
      screen.getByRole("heading", { name: /hey, welcome back/i }),
    ).toBeInTheDocument();
  });

  it("shows i on signup and switches back to login with i", async () => {
    const user = userEvent.setup();
    await renderWithProviders(<div />, "/?auth=signup");
    await waitForAuthModal(/nice to meet you/i);

    expect(
      within(screen.getByRole("button", { name: /^log in$/i })).getByText("i"),
    ).toBeTruthy();

    screen.getByRole("dialog").focus();
    await user.keyboard("i");

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /hey, welcome back/i }),
      ).toBeInTheDocument();
    });
  });

  it("starts Google auth with G when focus is not in a field", async () => {
    const user = userEvent.setup();
    await renderWithProviders(<ModalTrigger />);
    await user.click(screen.getByRole("button", { name: /open modal/i }));
    await waitForAuthModal();

    screen.getByRole("dialog").focus();
    await user.keyboard("g");

    expect(mockGoogleLogin).toHaveBeenCalled();
  });
});

describe("Initial focus", () => {
  beforeEach(() => {
    installAuthModalTestSeams();
  });

  it("focuses email on login so typing can start immediately", async () => {
    const user = userEvent.setup();
    await renderWithProviders(<div />, "/?auth=login");
    await waitForAuthModal();

    const email = screen.getByLabelText(/email/i);
    expect(email).toHaveFocus();
    await user.keyboard("returning@example.com");
    expect(email).toHaveValue("returning@example.com");
    expect(
      screen.getByRole("heading", { name: /hey, welcome back/i }),
    ).toBeInTheDocument();
  });

  it("focuses email on signup so typing can start immediately", async () => {
    const user = userEvent.setup();
    await renderWithProviders(<div />, "/?auth=signup");
    await waitForAuthModal(/nice to meet you/i);

    const email = screen.getByLabelText(/email/i);
    expect(email).toHaveFocus();
    await user.keyboard("new@example.com");
    expect(email).toHaveValue("new@example.com");
    expect(screen.getByLabelText(/name/i)).toHaveValue("");
  });

  it("reseats email when switching from login to signup", async () => {
    const user = userEvent.setup();
    await renderWithProviders(<div />, "/?auth=login");
    await waitForAuthModal();

    await user.click(screen.getByRole("button", { name: /^sign up$/i }));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /nice to meet you/i }),
      ).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/email/i)).toHaveFocus();
  });
});

afterAll(() => {
  isSessionMocked = false;
});
