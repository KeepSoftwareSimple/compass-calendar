import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import * as userMetadataUtil from "@web/auth/compass/user/util/user-metadata.util";
import { CONSENT_REQUIRED_COPY } from "@web/auth/providers/provider-copy.util";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import {
  applyConnectRedirect,
  readConnectStatus,
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
    it("reads the sync callback's stateMismatch, consentRequired, and accountMismatch", () => {
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
      expect(
        readConnectStatus("?provider=microsoft&status=accountMismatch"),
      ).toEqual({
        provider: "microsoft",
        status: "accountMismatch",
      });
    });
  });

  describe("showConnectStatusToast", () => {
    it("does not toast success after a connected redirect", () => {
      showConnectStatusToast({ provider: "google", status: "connected" });
      runToastAfterPaint();
      expect(mocks.success).not.toHaveBeenCalled();
    });

    it("does not toast success for a Microsoft connected redirect", () => {
      showConnectStatusToast({ provider: "microsoft", status: "connected" });
      runToastAfterPaint();
      expect(mocks.success).not.toHaveBeenCalled();
    });

    it("explains an expired connection link", () => {
      showConnectStatusToast({ provider: "google", status: "stateMismatch" });
      runToastAfterPaint();
      expect(mocks.error).toHaveBeenCalledWith(
        "That connection link expired. Please try connecting again.",
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

    it("explains a reconnect that consented as a different account", () => {
      showConnectStatusToast({
        provider: "microsoft",
        status: "accountMismatch",
      });
      runToastAfterPaint();
      expect(mocks.error).toHaveBeenCalledWith(
        "That wasn't the same account. Reconnect again and pick the account Compass already has.",
        expect.objectContaining({
          autoClose: false,
          toastId: "connect-account-mismatch",
        }),
      );
    });

    it("explains a generic connect error without sending the user to Settings", () => {
      showConnectStatusToast({ provider: "microsoft", status: "error" });
      runToastAfterPaint();
      expect(mocks.error).toHaveBeenCalledWith(
        "We couldn't connect your Microsoft account. Please try again.",
        expect.objectContaining({ autoClose: false }),
      );
    });
  });

  describe("applyConnectRedirect", () => {
    it("force-refreshes metadata for every OAuth return", async () => {
      const refreshSpy = spyOn(
        userMetadataUtil,
        "refreshUserMetadata",
      ).mockResolvedValue(undefined);

      await applyConnectRedirect({ provider: "google", status: "connected" });
      expect(refreshSpy).toHaveBeenCalledWith({ force: true });

      refreshSpy.mockClear();
      await applyConnectRedirect({ provider: "microsoft", status: "error" });
      expect(refreshSpy).toHaveBeenCalledWith({ force: true });

      refreshSpy.mockRestore();
    });
  });
});
