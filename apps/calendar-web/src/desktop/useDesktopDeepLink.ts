import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { isDesktop } from "@web/desktop/isDesktop";

const AUTH_DEEP_LINK =
  /^compass:\/\/auth\/(?<provider>google|microsoft|apple)\/callback(?<query>\?.*)?$/;

/**
 * Forwards compass:// OAuth callbacks into the existing provider callback route
 * so `complete-provider-authorization` runs inside the app web view.
 */
export function useDesktopDeepLink(): void {
  const router = useRouter();

  useEffect(() => {
    if (!isDesktop()) {
      return;
    }

    const bridge = window.compassDesktop;
    if (!bridge) {
      return;
    }

    return bridge.onDeepLink((url) => {
      const match = AUTH_DEEP_LINK.exec(url);
      if (!match?.groups?.provider) {
        return;
      }

      const query = match.groups.query ?? "";
      router.history.replace(`/auth/${match.groups.provider}/callback${query}`);
    });
  }, [router]);
}
