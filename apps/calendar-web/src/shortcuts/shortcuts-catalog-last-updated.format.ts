/** Display date for the public `/shortcuts` page. Kept separate from
 * shortcuts-catalog.meta.util.ts so the router-eager catalog page never
 * pulls node:crypto into the browser boot graph. */
export const formatShortcutsCatalogLastUpdated = (isoDate: string): string => {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
};
