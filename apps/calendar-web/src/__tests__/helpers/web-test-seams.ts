import { resetUseCompleteAuthenticationForTests } from "@web/auth/compass/hooks/useCompleteAuthentication.registry";
import {
  registerSessionApiPort,
  resetSessionApiPort,
  type SessionApiPort,
} from "@web/auth/compass/session/session.port";
import {
  registerUseStartProviderAuthorizationForTests,
  resetUseStartProviderAuthorizationForTests,
  type UseStartProviderAuthorization,
} from "@web/auth/providers/authorization/useStartProviderAuthorization";
import {
  resetProviderAvailabilityForTests,
  setProviderAvailabilityForTests,
} from "@web/auth/providers/useIsProviderAvailable";
import { resetEmbeddedCheckoutForTests } from "@web/billing/embedded-checkout/embedded-checkout.seam";
import {
  registerToastPort,
  resetToastPort,
  type ToastApi,
  type ToastPort,
} from "@web/common/utils/toast/toast.port";
import {
  type NotificationPort,
  registerNotificationPort,
  resetNotificationPort,
} from "@web/notifications/notification.port";
import { mock } from "bun:test";

export function createDefaultTestSessionPort(): SessionApiPort {
  return {
    doesSessionExist: mock().mockResolvedValue(true),
    getUserId: mock().mockResolvedValue("mock-user-id"),
    signOut: mock().mockResolvedValue(undefined),
    getAccessToken: mock().mockResolvedValue("mock-access-token"),
    validateClaims: mock().mockResolvedValue([]),
    getClaimValue: mock(),
    PrimitiveClaim: mock() as unknown as SessionApiPort["PrimitiveClaim"],
    BooleanClaim: mock() as unknown as SessionApiPort["BooleanClaim"],
    PrimitiveArrayClaim:
      mock() as unknown as SessionApiPort["PrimitiveArrayClaim"],
    attemptRefreshingSession: mock().mockResolvedValue(true),
    getInvalidClaimsFromResponse: mock().mockResolvedValue([]),
    getAccessTokenPayloadSecurely: mock().mockResolvedValue({
      mockKey: "mockValue",
    }),
  };
}

export function createTestToastPort() {
  const toastFn = mock(() => "mock-toast-id");
  const toastUpdate = mock();
  const toastDismiss = mock();
  const toastError = mock();
  const toastInfo = mock();
  const toastSuccess = mock();
  const toastIsActive = mock(() => false);

  const toast = Object.assign(toastFn, {
    dismiss: toastDismiss,
    error: toastError,
    info: toastInfo,
    isActive: toastIsActive,
    success: toastSuccess,
    update: toastUpdate,
    warning: mock(),
    warn: mock(),
    loading: mock(),
    promise: mock(),
    dark: mock(),
    done: mock(),
    onChange: mock(),
    clearWaitingQueue: mock(),
  }) as ToastApi;

  return {
    port: { toast } satisfies ToastPort,
    mocks: {
      toast: toastFn,
      update: toastUpdate,
      dismiss: toastDismiss,
      error: toastError,
      info: toastInfo,
      success: toastSuccess,
      isActive: toastIsActive,
    },
  };
}

/**
 * jsdom has no Notification global, so without a seam every test would see an
 * unsupported browser and the notification UI would silently vanish. The
 * default port is supported but ungranted — the state a first-run user is in.
 */
export function createTestNotificationPort(options?: {
  permission?: NotificationPermission;
  /** What requestPermission resolves to; defaults to the current permission. */
  respondWith?: NotificationPermission;
  supported?: boolean;
  /** What show returns; defaults to true so de-dupe keys burn like production. */
  showSucceeds?: boolean;
}) {
  let permission: NotificationPermission = options?.permission ?? "default";
  const permissionListeners = new Set<() => void>();

  const show = mock(
    (..._args: Parameters<NotificationPort["show"]>): boolean =>
      options?.showSucceeds !== false,
  );
  const requestPermission = mock(async () => {
    permission = options?.respondWith ?? permission;
    return permission;
  });

  const setPermission = (next: NotificationPermission) => {
    permission = next;
    for (const listener of permissionListeners) listener();
  };

  const isSupported = () => options?.supported ?? true;

  const port: NotificationPort = {
    isSupported,
    // Matches production: with no Notification API there is nothing to grant.
    getPermission: () => (isSupported() ? permission : "denied"),
    requestPermission,
    show,
    observePermission: (onChange) => {
      permissionListeners.add(onChange);
      return () => permissionListeners.delete(onChange);
    },
  };

  return { port, setPermission, mocks: { show, requestPermission } };
}

export function createDefaultTestProviderAuthorizationHook(): UseStartProviderAuthorization {
  return () => ({
    loading: false,
    startAuthorization: mock(),
  });
}

export function createTestEmailPasswordPort() {
  return {
    signUp: mock().mockResolvedValue({
      status: "OK" as const,
      user: { emails: ["test@example.com"] },
    }),
    signIn: mock().mockResolvedValue({
      status: "OK" as const,
      user: { emails: ["test@example.com"] },
    }),
    sendPasswordResetEmail: mock().mockResolvedValue({ status: "OK" as const }),
    submitNewPassword: mock().mockResolvedValue({ status: "OK" as const }),
    getResetPasswordTokenFromURL: mock().mockReturnValue("token"),
  };
}

export function installDefaultWebTestSeams(): void {
  registerSessionApiPort(createDefaultTestSessionPort());
  registerToastPort(createTestToastPort().port);
  registerNotificationPort(createTestNotificationPort().port);
  registerUseStartProviderAuthorizationForTests(
    createDefaultTestProviderAuthorizationHook(),
  );
  // Skip /config fetch (no MSW handler); "unavailable" matches prior failed-fetch default.
  resetProviderAvailabilityForTests();
  setProviderAvailabilityForTests("google", "unavailable");
  setProviderAvailabilityForTests("microsoft", "unavailable");
  setProviderAvailabilityForTests("apple", "unavailable");
}

export function resetWebTestSeams(): void {
  resetSessionApiPort();
  resetToastPort();
  resetNotificationPort();
  resetUseStartProviderAuthorizationForTests();
  // AuthModal owns emailpassword reset — production SuperTokens patches XHR vs MSW.
  resetUseCompleteAuthenticationForTests();
  resetProviderAvailabilityForTests();
  resetEmbeddedCheckoutForTests();
}
