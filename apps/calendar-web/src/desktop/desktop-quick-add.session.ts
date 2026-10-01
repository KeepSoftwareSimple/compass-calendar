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
