import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { act } from "react";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { createCompassQueryClient } from "@web/api/query-client";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { CompassRequiredProviders } from "@web/components/CompassProvider/CompassProvider";
import {
  settingsActions,
  useSettingsStore,
} from "@web/settings/settings.store";
import { beforeEach, describe, expect, it } from "bun:test";

const renderHostTree = () => {
  server.use(
    http.get(`${ENV_WEB.API_BASEURL}/calendars`, () => HttpResponse.json([])),
  );
  return render(
    <CompassRequiredProviders queryClient={createCompassQueryClient()}>
      {null}
    </CompassRequiredProviders>,
  );
};

describe("SettingsModalHost", () => {
  it("does not load Settings until it is opened", () => {
    renderHostTree();

    expect(
      screen.queryByRole("dialog", { name: "Settings" }),
    ).not.toBeInTheDocument();
  });

  it("opens Settings and focuses Accounts on the first mount", async () => {
    renderHostTree();

    act(() => {
      settingsActions.openSettings();
    });

    expect(
      await screen.findByRole("dialog", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accounts" })).toHaveFocus();
  });

  describe("browser back", () => {
    const currentNav = () =>
      screen.getByRole("button", { current: true }).textContent;

    // jsdom history persists across tests, and the store reset between tests
    // skips the close that would unwind Settings entries.
    beforeEach(() => {
      window.history.replaceState(null, "");
    });

    it("steps back through Settings pages, then to the palette", async () => {
      renderHostTree();
      act(() => {
        settingsActions.openSettings("accounts", { fromPalette: true });
      });
      await screen.findByRole("dialog", { name: "Settings" });
      act(() => {
        settingsActions.setSettingsPage("billing");
      });
      expect(currentNav()).toContain("Billing");

      window.history.back();
      await waitFor(() => expect(currentNav()).toContain("Accounts"));

      window.history.back();
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "Settings" }),
        ).not.toBeInTheDocument(),
      );
      expect(useSettingsStore.getState().isCmdPaletteOpen).toBe(true);
      act(() => {
        settingsActions.closeCmdPalette();
      });
    });

    it("closes Settings without reopening the palette when not opened from it", async () => {
      renderHostTree();
      act(() => {
        settingsActions.openSettings();
      });
      await screen.findByRole("dialog", { name: "Settings" });

      window.history.back();
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "Settings" }),
        ).not.toBeInTheDocument(),
      );
      expect(useSettingsStore.getState().isCmdPaletteOpen).toBe(false);
    });

    it("drops its history entries when closed with Escape", async () => {
      const user = userEvent.setup();
      renderHostTree();
      act(() => {
        settingsActions.openSettings();
      });
      await screen.findByRole("dialog", { name: "Settings" });
      act(() => {
        settingsActions.setSettingsPage("billing");
      });
      expect(window.history.state?.compassSettingsDepth).toBe(2);

      await user.keyboard("{Escape}");
      await waitFor(() =>
        expect(window.history.state?.compassSettingsPage).toBeUndefined(),
      );
    });
  });
});
