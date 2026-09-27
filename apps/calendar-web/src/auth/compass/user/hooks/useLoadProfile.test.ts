import { act, renderHook, waitFor } from "@testing-library/react";
import { Status } from "@core/errors/status.codes";
import { type UserProfile } from "@core/types/user.types";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realAuthStateUtil from "@web/auth/compass/state/auth.state.util";
import { type UseLoadProfileResult } from "@web/auth/compass/user/hooks/useLoadProfile";
import * as errorToast from "@web/common/utils/toast/error-toast.util";
import * as sessionExpiredToast from "@web/common/utils/toast/session-expired.toast";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

const getLastKnownEmail = mock(() => "person@example.com");
const markUserAsAuthenticated = mock();
const hasUserEverAuthenticated = mock(() => false);
const getProfile = mock();

const mockProfile: UserProfile = {
  firstName: "Person",
  lastName: "One",
  name: "Person One",
  email: "person@example.com",
  locale: "en-US",
  picture: "",
  userId: "user-1",
};

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

mockModuleForFile(
  "@web/auth/compass/state/auth.state.util",
  realAuthStateUtil,
  {
    getLastKnownEmail,
    hasUserEverAuthenticated,
    markUserAsAuthenticated,
  },
);

// mock.module is process-wide and not reliably restorable, so the real
// UserApi is captured up front and a flag (flipped off in afterAll) decides
// which implementation runs on each call. Without this, this file's partial
// UserApi shape (getProfile only) would permanently shadow the real module
// for other files' UserApi methods (e.g. another suite's updateMetadata).
const actualUserApi = (await import("@web/api/user.api")).UserApi;
let isUserApiMocked = true;

mock.module("@web/api/user.api", () => ({
  UserApi: {
    ...actualUserApi,
    getProfile: (...args: Parameters<typeof actualUserApi.getProfile>) =>
      isUserApiMocked ? getProfile(...args) : actualUserApi.getProfile(...args),
  },
}));

afterAll(() => {
  isUserApiMocked = false;
});

async function importHook() {
  const moduleUrl = new URL(
    `./useLoadProfile.ts?test=${Math.random().toString(36).slice(2)}`,
    import.meta.url,
  );

  return import(moduleUrl.href);
}

function renderToggleableAuth(
  useLoadProfile: (hasAuthenticatedBefore: boolean) => UseLoadProfileResult,
) {
  return renderHook(
    ({ hasAuthenticatedBefore }: { hasAuthenticatedBefore: boolean }) =>
      useLoadProfile(hasAuthenticatedBefore),
    { initialProps: { hasAuthenticatedBefore: true } },
  );
}

describe("useLoadProfile", () => {
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    getLastKnownEmail.mockClear().mockReturnValue("person@example.com");
    markUserAsAuthenticated.mockClear();
    hasUserEverAuthenticated.mockClear().mockReturnValue(false);
    getProfile.mockClear();
    consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    hasUserEverAuthenticated.mockReturnValue(false);
  });

  it("does not log backend-unavailable profile failures in frontend-only mode", async () => {
    const error = new Error("Request failed");
    error.name = "ApiError";
    getProfile.mockRejectedValue(error);
    const { useLoadProfile } = await importHook();

    const { result } = renderHook(() => useLoadProfile(true));

    await waitFor(() => {
      expect(result.current.email).toBeNull();
    });
    expect(getProfile).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("clears the profile and email once the user signs out", async () => {
    getProfile.mockResolvedValue(mockProfile);
    const { useLoadProfile } = await importHook();

    const { result, rerender } = renderToggleableAuth(useLoadProfile);

    await waitFor(() => {
      expect(result.current.email).toBe(mockProfile.email);
    });

    rerender({ hasAuthenticatedBefore: false });

    expect(result.current.email).toBeNull();
    expect(result.current.profile).toBeNull();
  });

  it("drops a profile response that resolves after the user has already signed out", async () => {
    let resolveProfile!: (profile: UserProfile) => void;
    getProfile.mockImplementation(
      () =>
        new Promise<UserProfile>((resolve) => {
          resolveProfile = resolve;
        }),
    );
    const { useLoadProfile } = await importHook();

    const { result, rerender } = renderToggleableAuth(useLoadProfile);

    expect(getProfile).toHaveBeenCalledTimes(1);

    rerender({ hasAuthenticatedBefore: false });
    expect(result.current.email).toBeNull();

    await act(async () => {
      resolveProfile(mockProfile);
      await flushPromises();
    });

    expect(result.current.email).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(markUserAsAuthenticated).not.toHaveBeenCalled();
  });

  it("does not show a signed-out toast when a first-time visitor's profile request is unauthorized", async () => {
    hasUserEverAuthenticated.mockReturnValue(false);
    const error = Object.assign(new Error("Request failed with status 401"), {
      response: { status: Status.UNAUTHORIZED },
    });
    getProfile.mockRejectedValue(error);
    const showSessionExpiredToast = spyOn(
      errorToast,
      "showSessionExpiredToast",
    ).mockReturnValue("toast-id");
    const openAuthModal = spyOn(
      sessionExpiredToast,
      "openAuthModalFromOutsideRouter",
    ).mockResolvedValue(undefined);
    const { useLoadProfile } = await importHook();

    renderHook(() => useLoadProfile(true));

    await waitFor(() => {
      expect(getProfile).toHaveBeenCalledTimes(1);
    });
    expect(showSessionExpiredToast).not.toHaveBeenCalled();
    expect(openAuthModal).not.toHaveBeenCalled();
    showSessionExpiredToast.mockRestore();
    openAuthModal.mockRestore();
  });

  it("shows a signed-out toast and opens the login modal when a returning visitor's profile request is unauthorized", async () => {
    hasUserEverAuthenticated.mockReturnValue(true);
    const error = Object.assign(new Error("Request failed with status 401"), {
      response: { status: Status.UNAUTHORIZED },
    });
    getProfile.mockRejectedValue(error);
    const showSessionExpiredToast = spyOn(
      errorToast,
      "showSessionExpiredToast",
    ).mockReturnValue("toast-id");
    const openAuthModal = spyOn(
      sessionExpiredToast,
      "openAuthModalFromOutsideRouter",
    ).mockResolvedValue(undefined);
    const { useLoadProfile } = await importHook();

    renderHook(() => useLoadProfile(true));

    await waitFor(() => {
      expect(showSessionExpiredToast).toHaveBeenCalledTimes(1);
    });
    expect(openAuthModal).toHaveBeenCalledWith("login");
    showSessionExpiredToast.mockRestore();
    openAuthModal.mockRestore();
  });
});
