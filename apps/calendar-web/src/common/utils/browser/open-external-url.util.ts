/** Opens a URL in a new tab with noopener/noreferrer (same window features as elsewhere). */
export function openExternalUrl(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}
