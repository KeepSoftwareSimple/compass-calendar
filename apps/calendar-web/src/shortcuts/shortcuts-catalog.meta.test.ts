import { getPublicShortcutCatalog } from "@web/shortcuts/shortcuts.registry";
import {
  PUBLIC_SHORTCUT_CATALOG,
  PUBLIC_SHORTCUT_CATALOG_FINGERPRINT,
} from "@web/shortcuts/shortcuts-catalog.data";
import { fingerprintPublicShortcutCatalog } from "@web/shortcuts/shortcuts-catalog.meta.util";
import { describe, expect, it } from "bun:test";

describe("shortcuts catalog last-updated metadata", () => {
  it("fingerprints the live catalog and checked-in snapshot together", () => {
    const live = getPublicShortcutCatalog();
    const liveFingerprint = fingerprintPublicShortcutCatalog(live);
    const snapshotFingerprint = fingerprintPublicShortcutCatalog(
      PUBLIC_SHORTCUT_CATALOG,
    );

    expect(liveFingerprint).toBe(snapshotFingerprint);
    if (liveFingerprint !== PUBLIC_SHORTCUT_CATALOG_FINGERPRINT) {
      throw new Error(
        `Public shortcut catalog changed. Refresh shortcuts-catalog.json, then set shortcuts-catalog.meta.json fingerprint to ${liveFingerprint} and lastUpdated to the change date.`,
      );
    }
  });
});
