import { RouterProvider } from "@tanstack/react-router";
import { render, waitFor } from "@testing-library/react";
import { createTestRouter } from "@web/__tests__/utils/providers/createTestRouter";
import { endDesktopQuickAddSession } from "@web/desktop/desktop-quick-add.session";
import { useDesktopQuickAddEntry } from "@web/desktop/useDesktopQuickAddEntry";
import {
  selectIsCmdPaletteCreateMode,
  selectIsCmdPaletteOpen,
  settingsActions,
  useSettingsStore,
} from "@web/settings/settings.store";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

function Probe() {
  useDesktopQuickAddEntry();
  return null;
}

async function renderEntry(initialEntries: string[]) {
  const router = createTestRouter(<Probe />, { initialEntries });
  render(<RouterProvider router={router} />);
  await waitFor(() => {
    expect(router.state.status).toBe("idle");
  });
  return router;
}

describe("useDesktopQuickAddEntry", () => {
  beforeEach(() => {
    endDesktopQuickAddSession();
    delete window.compassDesktop;
    settingsActions.closeCmdPalette();
  });

  afterEach(() => {
    endDesktopQuickAddSession();
    delete window.compassDesktop;
  });

  it("ignores the quickAdd flag without the desktop bridge", async () => {
    await renderEntry(["/?quickAdd=1"]);
    expect(selectIsCmdPaletteOpen(useSettingsStore.getState())).toBe(false);
  });

  it("opens the palette in create mode when desktop and quickAdd=1", async () => {
    window.compassDesktop = {
      version: "0.1.0",
      platform: "macos",
      openExternal: () => {},
      setAgenda: () => {},
      restartToUpdate: () => {},
      onDeepLink: () => () => {},
      onUpdateReady: () => () => {},
    };
    const router = await renderEntry(["/?quickAdd=1"]);
    await waitFor(() => {
      expect(selectIsCmdPaletteOpen(useSettingsStore.getState())).toBe(true);
      expect(selectIsCmdPaletteCreateMode(useSettingsStore.getState())).toBe(
        true,
      );
    });
    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
  });
});
