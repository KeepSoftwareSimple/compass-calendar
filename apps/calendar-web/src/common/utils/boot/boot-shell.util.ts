/**
 * The static calendar skeleton in index.html (`#boot-shell`) is painted before
 * React mounts and is removed by the first render. Screens shown mid-boot,
 * like the OAuth callback, reuse it as their backdrop so the page does not
 * blank out between the skeleton and the calendar.
 */
let bootShell: HTMLElement | null = null;

/** Call before the first React render, while `#boot-shell` is still in the DOM. */
export function captureBootShell(): void {
  bootShell = document.getElementById("boot-shell");
}

/**
 * A fresh copy of the captured skeleton (keeping its id, which its index.html
 * styles target; the original is gone by now), or null when none was captured.
 */
export function cloneBootShell(): Node | null {
  return bootShell?.cloneNode(true) ?? null;
}
