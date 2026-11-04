import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReflectionPreferences } from "@core/types/life-preferences.contracts";
import { UserApi } from "@web/api/user.api";
import { UserContext } from "@web/auth/compass/user/context/UserContext";
import { ReflectionPreferencesControl } from "@web/views/Life/ReflectionPreferencesControl";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

const preferences: ReflectionPreferences = {
  enabled: false,
  timeZone: "America/Denver",
  excludedCalendarIds: [],
};
const response = { available: true, trial: true, preferences };
const control = (userId: string) => (
  <UserContext.Provider value={{ userId }}>
    <ReflectionPreferencesControl />
  </UserContext.Provider>
);
afterEach(() => mock.restore());

describe("reflection preference control", () => {
  it("supports keyboard opt-in and announces a failed enrollment without claiming it saved", async () => {
    spyOn(UserApi, "getReflectionPreferences").mockResolvedValue(response);
    const save = spyOn(UserApi, "saveReflectionPreferences")
      .mockRejectedValueOnce(new Error("history incomplete"))
      .mockResolvedValue({
        ...response,
        preferences: { ...preferences, enabled: true },
      });
    const user = userEvent.setup();
    render(control("account-a"));
    const checkbox = await screen.findByRole("checkbox", {
      name: "Email me calendar reflections",
    });
    await user.tab();
    expect(checkbox).toHaveFocus();
    expect(checkbox).toHaveAccessibleDescription(/Daily trial at 10:30 a.m./);
    await user.keyboard(" ");
    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("not saved");
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toHaveAccessibleDescription(/not saved/);
    await user.keyboard(" ");
    await waitFor(() => expect(checkbox).toBeChecked());
    expect(save).toHaveBeenLastCalledWith({ ...preferences, enabled: true });
  });

  it("ignores a former account's pending response after the account changes", async () => {
    spyOn(UserApi, "getReflectionPreferences").mockResolvedValue(response);
    let finish!: (value: typeof response) => void;
    spyOn(UserApi, "saveReflectionPreferences").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    const { rerender } = render(control("account-a"));
    await user.click(
      await screen.findByRole("checkbox", {
        name: "Email me calendar reflections",
      }),
    );
    rerender(control("account-b"));
    await waitFor(() => expect(screen.getByRole("checkbox")).toBeEnabled());
    await act(async () =>
      finish({ ...response, preferences: { ...preferences, enabled: true } }),
    );
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
});
