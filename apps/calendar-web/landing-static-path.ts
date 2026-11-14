/**
 * The landing game (src/landing) is a static page outside the SPA. The build
 * copies it to LANDING_HTML with its assets under LANDING_ASSET_DIR, and the
 * static servers answer LANDING_PATH with that file instead of the app shell.
 */
export const LANDING_PATH = "/start";
export const LANDING_HTML = "start.html";
export const LANDING_ASSET_DIR = "start";

export function isLandingPath(pathname: string): boolean {
  const path = pathname.split("?")[0]?.replace(/\/+$/, "") || "/";
  return path === LANDING_PATH;
}
