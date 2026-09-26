/**
 * A `?flag=1` search value as the router hands it over. TanStack Router
 * JSON-parses search values, so `?flag` arrives as a boolean and `?flag=1`
 * as a number; anything richer than these three is not a flag.
 */
export type SearchFlag = string | number | boolean;

/** Keep a flag search value if it is one, else drop it. */
export function searchFlagValue(value: unknown): SearchFlag | undefined {
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? value
    : undefined;
}

/** True for the values a `?flag=1` link can carry: 1, "1", true, "true". */
export function isSearchFlagOn(value: SearchFlag | undefined): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}
