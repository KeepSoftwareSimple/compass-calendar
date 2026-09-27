import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod/v4";
import * as envConstants from "@web/common/constants/env.constants";
import { APP_VERSION } from "@web/common/constants/version.constants";
import { useVisibleAfterHidden } from "@web/common/hooks/useVisibleAfterHidden";

const MIN_HIDDEN_DURATION_MS = 30_000;
const BACKUP_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const versionResponseSchema = z.object({
  version: z.string().optional(),
});

function getVersionCheckUrl() {
  if (typeof window === "undefined") {
    return null;
  }

  const origin =
    window.location.origin && window.location.origin !== "null"
      ? window.location.origin
      : "http://localhost";
  const url = new URL("/version.json", origin);
  url.searchParams.set("t", Date.now().toString());
  return url.toString();
}

export interface VersionCheckResult {
  isUpdateAvailable: boolean;
  currentVersion: string;
}

/**
 * Checks for new application versions by polling `/version.json`.
 *
 * Performs version checks:
 * - On initial mount
 * - When the tab becomes visible after being hidden for 30+ seconds
 * - Every 5 minutes as a backup poll
 *
 * Disabled in development mode.
 */
export const useVersionCheck = (): VersionCheckResult => {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const isCheckingRef = useRef(false);

  const checkVersion = useCallback(async () => {
    if (isCheckingRef.current) {
      return;
    }

    const versionCheckUrl = getVersionCheckUrl();
    if (!versionCheckUrl) {
      return;
    }

    isCheckingRef.current = true;

    try {
      const response = await fetch(versionCheckUrl, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });

      if (!response.ok) {
        return;
      }

      const parsedResponse = versionResponseSchema.safeParse(
        await response.json(),
      );

      if (!parsedResponse.success) {
        return;
      }

      const { version: serverVersion } = parsedResponse.data;

      if (!serverVersion) {
        return;
      }

      setIsUpdateAvailable(serverVersion !== APP_VERSION);
    } catch (error) {
      console.error("Version check failed:", error);
    } finally {
      isCheckingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (envConstants.IS_DEV) {
      return;
    }

    checkVersion();
    const backupInterval = window.setInterval(
      checkVersion,
      BACKUP_CHECK_INTERVAL_MS,
    );

    return () => {
      clearInterval(backupInterval);
    };
  }, [checkVersion]);

  useVisibleAfterHidden(
    checkVersion,
    MIN_HIDDEN_DURATION_MS,
    !envConstants.IS_DEV,
  );

  return { isUpdateAvailable, currentVersion: APP_VERSION };
};
