import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import * as userMetadataUtil from "@web/auth/compass/user/util/user-metadata.util";
import { CONSENT_REQUIRED_COPY } from "@web/auth/providers/provider-copy.util";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import {
  readConnectStatus,
  refreshUserMetadataAfterConnect,
  showConnectStatusToast,
} from "./connect-status.util";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

describe("connect-status.util", () => {
  const { port, mocks } = createTestToastPort();

  let rafCallbacks: FrameRequestCallback[];
  let rafSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    mocks.toast.mockClear();
    mocks.info.mockClear();
    mocks.success.mockClear();
    mocks.error.mockClear();
    registerToastPort(port);
    rafCallbacks = [];
    rafSpy = spyOn(globalThis, "requestAnimationFrame").mockImplementation(((
      callback: FrameRequestCallback,
    ) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    }) as typeof requestAnimationFrame);
  });

  afterEach(() => {
    rafSpy.mockRestore();
  });

  const runToastAfterPaint = () => {
    const first = [...rafCallbacks];
    rafCallbacks = [];
    for (const callback of first) callback(0);
    const second = [...rafCallbacks];
    rafCallbacks = [];
    for (const callback of second) callback(0);
  };

  describe("readConnectStatus", () => {
    it("reads google and microsoft redirects", () => {
      expect(readConnectStatus("?provider=google&status=connected")).toEqual({
        provider: "google",
        status: "connected",
      });
      expect(readConnectStatus("?provider=microsoft&status=connected")).toEqual(
        {
          provider: "microsoft",
          status: "connected",
        },
      );
    });

    it("returns null when provider or status is missing", () => {
      expect(readConnectStatus("?status=connected")).toBeNull();
      expect(
        readConnectStatus("?provider=outlook&status=connected"),
      ).toBeNull();
      expect(readConnectStatus("?provider=google&status=pending")).toBeNull();
      expect(readConnectStatus("")).toBeNull();
    });

    // These two are redirected by the sync callback. Dropping them here left
    // the user on the calendar after a failed connect with no toast at all.
    it("reads the sync callback's stateMismatch and consentRequired", () => {
      expect(
        readConnectStatus("?provider=google&status=stateMismatch"),
      ).toEqual({
        provider: "google",
        status: "stateMismatch",
      });
      expect(
        readConnectStatus("?provider=microsoft&status=consentRequired"),
      ).toEqual({
        provider: "microsoft",
        status: "consentRequired",
      });
    });
  });

  describe("showConnectStatusToast", () => {
    it("keeps the Google connected toast unchanged", () => {
      showConnectStatusToast({ provider: "google", status: "connected" });
      runToastAfterPaint();
      expect(mocks.success).toHaveBeenCalledWith(
        "Google Calendar connected.",
        expect.objectContaining({ toastId: "google-connect-success" }),
      );
    });

    it("shows a Microsoft connected toast", () => {
      showConnectStatusToast({ provider: "microsoft", status: "connected" });
      runToastAfterPaint();
      expect(mocks.success).toHaveBeenCalledWith(
        "Microsoft connected.",
        expect.objectContaining({ toastId: "connect-success" }),
      );
    });

    it("explains an expired connection link", () => {
      showConnectStatusToast({ provider: "google", status: "stateMismatch" });
      runToastAfterPaint();
      expect(mocks.error).toHaveBeenCalledWith(
        "That connection link expired. Please try connecting again from Settings.",
        expect.objectContaining({
          autoClose: false,
          toastId: "connect-state-mismatch",
        }),
      );
    });

    it("explains that an admin has to approve Compass", () => {
      showConnectStatusToast({
        provider: "microsoft",
        status: "consentRequired",
      });
      runToastAfterPaint();
      expect(mocks.error).toHaveBeenCalledWith(
        CONSENT_REQUIRED_COPY,
        expect.objectContaining({
          autoClose: false,
          toastId: "connect-consent-required",
        }),
      );
    });
  });

  describe("refreshUserMetadataAfterConnect", () => {
    it("force-refreshes metadata after a completed connect", () => {
      const refreshSpy = spyOn(
        userMetadataUtil,
        "refreshUserMetadata",
      ).mockResolvedValue(undefined);

      refreshUserMetadataAfterConnect("connected");
      expect(refreshSpy).toHaveBeenCalledWith({ force: true });

      refreshSpy.mockRestore();
    });
  });
});
