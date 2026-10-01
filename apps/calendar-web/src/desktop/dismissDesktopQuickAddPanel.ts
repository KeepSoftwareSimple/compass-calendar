import {
  endDesktopQuickAddSession,
  isDesktopQuickAddSessionActive,
} from "@web/desktop/desktop-quick-add.session";
import { isDesktop } from "@web/desktop/isDesktop";

/** Tell the macOS shell to hide the quick-add panel after a successful create. */
export function dismissDesktopQuickAddPanelIfActive(): void {
  if (!isDesktop() || !isDesktopQuickAddSessionActive()) return;
  endDesktopQuickAddSession();
  window.compassDesktop?.dismissQuickAddPanel?.();
}
