import { render, waitFor } from "@testing-library/react";
import { type UserProfile } from "@core/types/user.types";
import { UserApi } from "@web/api/user.api";
import { SessionContext } from "@web/auth/compass/session/session.context";
import { UserProvider } from "@web/auth/compass/user/context/UserProvider";
import * as errorToast from "@web/common/utils/toast/error-toast.util";
import { setPendingReflectionOptIn } from "@web/components/WelcomeModal/pending-reflection-opt-in";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

const profile = {
  userId: "account-a",
  email: "a@example.com",
  isSynthetic: false,
} as UserProfile;
const saved = {
  available: true,
  paused: false,
  preferences: {
    enabled: true,
    timeZone: "UTC",
    excludedCalendarIds: [],
  },
};
const renderProvider = () =>
  render(
    <SessionContext.Provider
      value={{ authenticated: true, setAuthenticated: () => {} }}
    >
      <UserProvider>
        <div />
      </UserProvider>
    </SessionContext.Provider>,
  );

beforeEach(() => {
  spyOn(UserApi, "getProfile").mockResolvedValue(profile);
});
afterEach(() => {
  mock.restore();
  localStorage.clear();
});

describe("sign-up reflection opt-in", () => {
  it("enrolls once the account exists and then forgets the choice", async () => {
    setPendingReflectionOptIn(true);
    const save = spyOn(UserApi, "saveReflectionPreferences").mockResolvedValue(
      saved,
    );
    renderProvider();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]![0]).toMatchObject({ enabled: true });
    await waitFor(() =>
      expect(
        localStorage.getItem("compass.onboarding.pending-reflection-opt-in"),
      ).toBeNull(),
    );
  });

  it("keeps the choice and tells the user when saving fails", async () => {
    setPendingReflectionOptIn(true);
    spyOn(UserApi, "saveReflectionPreferences").mockRejectedValue(
      new Error("down"),
    );
    const toast = spyOn(errorToast, "showErrorToast").mockReturnValue(1);
    renderProvider();
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(
      localStorage.getItem("compass.onboarding.pending-reflection-opt-in"),
    ).toBe("true");
  });

  it("does nothing when sign-up did not ask for reflections", async () => {
    const save = spyOn(UserApi, "saveReflectionPreferences");
    renderProvider();
    await waitFor(() => expect(UserApi.getProfile).toHaveBeenCalled());
    expect(save).not.toHaveBeenCalled();
  });
});
