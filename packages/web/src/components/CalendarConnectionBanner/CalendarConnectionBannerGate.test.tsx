import { HotkeyManager, HotkeysProvider } from "@tanstack/react-hotkeys";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import "@testing-library/jest-dom";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { createMockConnection } from "@web/__tests__/utils/factories/calendar.factory";
import { AuthApi } from "@web/api/auth.api";
import * as Track from "@web/auth/posthog/track";
import { userMetadataActions } from "@web/auth/state/user-metadata.store";
import { CalendarConnectionBannerGate } from "./CalendarConnectionBannerGate";

describe("CalendarConnectionBannerGate", () => {
  let assign: ReturnType<typeof spyOn>;
  let beginSpy: ReturnType<typeof spyOn>;
  let trackSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    HotkeyManager.resetInstance();
    assign = spyOn(window.location, "assign").mockImplementation(() => {});
    beginSpy = spyOn(AuthApi, "beginConnection").mockResolvedValue({
      kind: "redirect",
      authorizationUrl: "#consent",
    });
    trackSpy = spyOn(Track, "track").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    userMetadataActions.clear();
    assign.mockRestore();
    beginSpy.mockRestore();
    trackSpy.mockRestore();
  });

  it("starts reconnect authorization with intent reconnect", async () => {
    const connection = createMockConnection("primary@example.com", {
      id: "connection-reconnect",
      state: "actionRequired",
      stateReason: "authorizationRevoked",
      connectionState: "RECONNECT_REQUIRED",
    });
    const { wrapper } = createStoreWrapper({
      userMetadata: {
        current: {
          connections: [connection],
          google: {
            connectionState: "RECONNECT_REQUIRED",
            connections: [connection],
          },
        },
        status: "loaded",
      },
    });
    const user = userEvent.setup();

    render(
      <HotkeysProvider>
        <CalendarConnectionBannerGate />
      </HotkeysProvider>,
      { wrapper },
    );

    await user.click(screen.getByRole("button", { name: "Reconnect" }));

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith("#consent");
    });
    expect(beginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: "connection-reconnect",
        provider: "google",
      }),
    );
    expect(trackSpy).toHaveBeenCalledWith("oauth_redirect_started", {
      provider: "google",
      intent: "reconnect",
    });
  });
});
