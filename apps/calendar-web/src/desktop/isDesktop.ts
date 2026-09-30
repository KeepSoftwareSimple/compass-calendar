import "./compass-desktop.global";

/** True when the page runs inside the Compass macOS shell (bridge injected). */
export function isDesktop(): boolean {
  return typeof window.compassDesktop?.version === "string";
}
