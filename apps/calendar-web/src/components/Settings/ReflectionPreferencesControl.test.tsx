import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReflectionPreferences } from "@core/types/life-preferences.contracts";
import { UserApi } from "@web/api/user.api";
import { SessionContext } from "@web/auth/compass/session/session.context";
import { UserContext } from "@web/auth/compass/user/context/UserContext";
import { ReflectionPreferencesControl } from "@web/components/Settings/ReflectionPreferencesControl";
import { settingsActions } from "@web/settings/settings.store";
import { setPinnedTimeZone } from "@web/timezone/effective-timezone.store";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

const preferences: ReflectionPreferences = {
  enabled: false,
  timeZone: "America/Denver",
  excludedCalendarIds: [],
};
const response = { available: true, paused: false, preferences };
const control = (userId: string, authenticated = true) => (
  <SessionContext.Provider
    value={{ authenticated, setAuthenticated: () => {} }}
  >
    <UserContext.Provider value={{ userId }}>
      <ReflectionPreferencesControl />
    </UserContext.Provider>
  </SessionContext.Provider>
);
afterEach(() => mock.restore());

describe("reflection preference control", () => {
  it("does not load email preferences for a signed-out cached account", () => {
    const load = spyOn(UserApi, "getReflectionPreferences");
    render(control("cached-account", false));
    expect(
      screen.getByText("Sign in to manage calendar reflection emails."),
    ).toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
  });

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
      name: "Weekly reflection emails",
    });
    await user.tab();
    expect(checkbox).toHaveFocus();
    expect(checkbox).toHaveAccessibleDescription(/Sundays at 10:30 a.m./);
    await user.keyboard(" ");
    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("not saved");
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toHaveAccessibleDescription(/not saved/);
    await user.keyboard(" ");
    await waitFor(() => expect(checkbox).toBeChecked());
    expect(save).toHaveBeenLastCalledWith({ ...preferences, enabled: true });
  });

  it("pauses and resumes emails when the feedback service is unavailable", async () => {
    spyOn(UserApi, "getReflectionPreferences").mockResolvedValue({
      ...response,
      preferences: { ...preferences, enabled: true },
    });
    const save = spyOn(UserApi, "saveReflectionPreferences").mockImplementation(
      async (input) => ({
        ...response,
        paused: !input.enabled,
        preferences: input,
      }),
    );
    const user = userEvent.setup();
    render(control("account-a"));
    const checkbox = await screen.findByRole("checkbox", {
      name: "Weekly reflection emails",
    });
    expect(
      screen.queryByRole("button", { name: "Share feedback" }),
    ).not.toBeInTheDocument();
    await user.click(checkbox);
    await screen.findByText("Emails are paused.");
    expect(
      screen.queryByRole("button", { name: "Share feedback" }),
    ).not.toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
    expect(save).toHaveBeenLastCalledWith(preferences);
    await user.click(checkbox);
    await waitFor(() => expect(checkbox).toBeChecked());
    expect(
      screen.queryByRole("button", { name: "Share feedback" }),
    ).not.toBeInTheDocument();
  });
  it("still shows the paused note after a reload, and the server's reason when enabling is refused", async () => {
    spyOn(UserApi, "getReflectionPreferences").mockResolvedValue({
      ...response,
      paused: true,
    });
    const refused = Object.assign(new Error("refused"), {
      config: {},
      response: {
        status: 403,
        data: { message: "You unsubscribed from all Compass emails." },
      },
    });
    spyOn(UserApi, "saveReflectionPreferences").mockRejectedValue(refused);
    const user = userEvent.setup();
    render(control("account-a"));
    expect(await screen.findByText("Emails are paused.")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You unsubscribed from all Compass emails.",
    );
  });

  it("previews the sample before opting in and saves the displayed app timezone", async () => {
    setPinnedTimeZone("Pacific/Auckland");
    spyOn(UserApi, "getReflectionPreferences").mockResolvedValue({
      ...response,
      preferences: null,
    });
    const save = spyOn(UserApi, "saveReflectionPreferences").mockImplementation(
      async (input) => ({ ...response, preferences: input }),
    );
    const user = userEvent.setup();
    render(control("account-a"));
    const checkbox = await screen.findByRole("checkbox", {
      name: "Weekly reflection emails",
    });
    expect(checkbox).toHaveAccessibleDescription(
      "Highlights from previous years and your updated Life in Weeks as a PDF Sundays at 10:30 a.m. (Pacific/Auckland)",
    );
    const preview = screen.getByRole("button", {
      name: "Preview a sample email",
    });
    await user.click(preview);
    expect(preview).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("article", { name: "Sample weekly reflection" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Open sample Life in Weeks PDF/ }),
    ).toHaveAttribute("href", "/sample-life-in-weeks.pdf");
    await user.click(preview);
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    await user.click(checkbox);
    expect(save).toHaveBeenCalledWith({
      ...preferences,
      timeZone: "Pacific/Auckland",
      enabled: true,
    });
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
        name: "Weekly reflection emails",
      }),
    );
    rerender(control("account-b"));
    await waitFor(() => expect(screen.getByRole("checkbox")).toBeEnabled());
    await act(async () =>
      finish({ ...response, preferences: { ...preferences, enabled: true } }),
    );
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("focuses the toggle once when an email link asked for it, so Space turns it on", async () => {
    spyOn(UserApi, "getReflectionPreferences").mockResolvedValue(response);
    const save = spyOn(UserApi, "saveReflectionPreferences").mockResolvedValue({
      ...response,
      preferences: { ...preferences, enabled: true },
    });
    settingsActions.openSettings("notifications", {
      focus: "weekly-reflection",
    });
    const user = userEvent.setup();
    render(control("account-a"));
    const checkbox = await screen.findByRole("checkbox", {
      name: "Weekly reflection emails",
    });
    await waitFor(() => expect(checkbox).toHaveFocus());
    await user.keyboard(" ");
    await waitFor(() => expect(checkbox).toBeChecked());
    expect(save).toHaveBeenCalledWith({ ...preferences, enabled: true });
    settingsActions.closeSettings();
  });
});
