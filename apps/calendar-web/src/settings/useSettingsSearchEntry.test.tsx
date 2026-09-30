import { RouterProvider } from "@tanstack/react-router";
import { render, waitFor } from "@testing-library/react";
import { createTestRouter } from "@web/__tests__/utils/providers/createTestRouter";
import { SessionContext } from "@web/auth/compass/session/session.context";
import { validateAuthSearch } from "@web/components/AuthModal/hooks/useAuthModal";
import {
  selectIsSettingsOpen,
  selectSettingsPage,
  settingsActions,
  useSettingsStore,
} from "@web/settings/settings.store";
import { useSettingsSearchEntry } from "@web/settings/useSettingsSearchEntry";
import { afterEach, describe, expect, it } from "bun:test";

function Probe({ isMobile }: { isMobile: boolean }) {
  useSettingsSearchEntry({ isMobile });
  return null;
}

function Harness({
  authenticated,
  isMobile,
}: {
  authenticated: boolean;
  isMobile: boolean;
}) {
  return (
    <SessionContext.Provider
      value={{ authenticated, setAuthenticated: () => {} }}
    >
      <Probe isMobile={isMobile} />
    </SessionContext.Provider>
  );
}

async function renderEntry({
  authenticated,
  isMobile = false,
  path = "/?settings=billing",
}: {
  authenticated: boolean;
  isMobile?: boolean;
  path?: string;
}) {
  const router = createTestRouter(
    <Harness authenticated={authenticated} isMobile={isMobile} />,
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  await waitFor(() => {
    expect(router.state.status).toBe("idle");
  });
  return router;
}

describe("useSettingsSearchEntry", () => {
  afterEach(() => {
    settingsActions.closeSettings();
  });

  it("opens Settings on the named page and consumes the param when signed in", async () => {
    const router = await renderEntry({ authenticated: true });

    await waitFor(() => {
      expect(selectIsSettingsOpen(useSettingsStore.getState())).toBe(true);
    });
    expect(selectSettingsPage(useSettingsStore.getState())).toBe("billing");
    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
  });

  it("survives the utm params the email layout appends", async () => {
    const router = await renderEntry({
      authenticated: true,
      path: "/?settings=accounts&utm_source=email&utm_campaign=welcome",
    });

    await waitFor(() => {
      expect(selectIsSettingsOpen(useSettingsStore.getState())).toBe(true);
    });
    expect(selectSettingsPage(useSettingsStore.getState())).toBe("accounts");
    await waitFor(() => {
      expect(router.state.location.search).not.toHaveProperty("settings");
    });
  });

  it("asks an anonymous visitor to log in and keeps the param for after login", async () => {
    const router = await renderEntry({ authenticated: false });

    await waitFor(() => {
      expect(router.state.location.search).toEqual({
        auth: "login",
        settings: "billing",
      });
    });
    expect(selectIsSettingsOpen(useSettingsStore.getState())).toBe(false);
  });

  it("leaves the param alone on a phone", async () => {
    const router = await renderEntry({ authenticated: true, isMobile: true });

    expect(selectIsSettingsOpen(useSettingsStore.getState())).toBe(false);
    expect(router.state.location.search).toEqual({ settings: "billing" });
  });

  it("drops a value that is not a Settings page", () => {
    expect(validateAuthSearch({ settings: "bogus" }).settings).toBeUndefined();
    expect(validateAuthSearch({ settings: 1 }).settings).toBeUndefined();
    expect(validateAuthSearch({ settings: "booking" }).settings).toBe(
      "booking",
    );
  });
});
