import { type ShortcutOverlaySection } from "@web/shortcuts/shortcuts-overlay.types";
/** node:crypto — test/build-time fingerprinting only; never import this module from router-eager UI. */
import { createHash } from "node:crypto";

/** Deterministic JSON for catalog fingerprints (object key order varies by runtime). */
const stableJsonStringify = (value: unknown): string =>
  JSON.stringify(sortJson(value));

const sortJson = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortJson(record[key]);
    }
    return sorted;
  }
  return value;
};

export const fingerprintPublicShortcutCatalog = (
  catalog: ShortcutOverlaySection[],
): string =>
  createHash("sha256").update(stableJsonStringify(catalog)).digest("hex");
