/** Shared hit target for sidebar footer icon buttons and the level badge. */
export const FOOTER_ICON_BUTTON_CLASS =
  "flex size-9 items-center justify-center rounded-default text-text-muted transition hover:bg-surface-panel hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/** Trailing reload slot: fixed size only, never flex-grow (would push the level chip away). */
export const SIDEBAR_REFRESH_SLOT_CLASS =
  "flex size-9 shrink-0 grow-0 basis-9 items-center justify-center";
