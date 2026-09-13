import { lazyRouteComponent } from "@tanstack/react-router";

// Lazy: CompassProvider used to statically import SettingsModal, which pulled
// billing, calendar admin, and the accounts page into every boot chunk even
// though the dialog is closed until the user opens it. This is the only
// static edge into that graph. Preload is input-driven rather than a timer so
// Lighthouse's idle trace window does not count the chunk as boot JS.
export const LazySettingsModal = lazyRouteComponent(
  () => import("@web/components/Settings/SettingsModal"),
  "SettingsModal",
);

/**
 * Starts downloading the Settings chunk on the user's first input, so Mod+,
 * (and the sidebar/palette entries) open without a visible fetch.
 */
export const preloadSettingsOnFirstInput = (): void => {
  const controller = new AbortController();
  const warm = () => {
    controller.abort();
    void LazySettingsModal.preload?.();
  };
  for (const type of ["pointermove", "pointerdown", "keydown"] as const) {
    window.addEventListener(type, warm, {
      passive: true,
      signal: controller.signal,
    });
  }
};
