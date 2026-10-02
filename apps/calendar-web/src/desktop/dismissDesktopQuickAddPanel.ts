import { isDesktop } from "@web/desktop/isDesktop";

let quickAddSessionActive = false;

export function beginDesktopQuickAddSession(): void {
  quickAddSessionActive = true;
}

export function endDesktopQuickAddSession(): void {
  quickAddSessionActive = false;
}

export function isDesktopQuickAddSessionActive(): boolean {
  return quickAddSessionActive;
}

/** Tell the macOS shell to hide the quick-add panel after a successful create. */
export function dismissDesktopQuickAddPanelIfActive(): void {
  if (!isDesktop() || !isDesktopQuickAddSessionActive()) return;
  endDesktopQuickAddSession();
  window.compassDesktop?.dismissQuickAddPanel?.();
}
