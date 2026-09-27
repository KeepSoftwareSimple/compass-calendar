import { session } from "@web/auth/compass/session/Session";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";

// Legacy task keys ("compass.today.tasks.*") are still matched by this prefix,
// so account-deletion cleanup keeps clearing them even though the Tasks
// feature was removed.
const isCompassStorageKey = (key: string) => key.startsWith("compass.");

/**
 * Clears all Compass-related browser storage including:
 * - LocalStorage (tasks, preferences, auth flags)
 * - Session cookies (via SuperTokens signOut)
 * - IndexedDB (compass-local database)
 *
 * This is typically called after account deletion to ensure a clean state.
 */
export async function clearAllBrowserStorage(): Promise<void> {
  try {
    // 1. Sign out from SuperTokens session (clears session cookies)
    try {
      await session.signOut();
    } catch (error) {
      // Deleted users can have stale auth cookies that no longer map to a
      // server-side session. Continue clearing local browser state anyway.
      console.warn("Failed to sign out during browser cleanup:", error);
    }

    // 2. Clear all localStorage keys that start with 'compass.'
    persistentBrowserStore
      .keys()
      .filter(isCompassStorageKey)
      .forEach((key) => persistentBrowserStore.remove(key));

    // 3. Clear IndexedDB 'compass-local' database if it exists
    if (window.indexedDB) {
      const databases = await window.indexedDB.databases();
      const compassDb = databases.find((db) => db.name === "compass-local");
      if (compassDb) {
        await new Promise<void>((resolve, reject) => {
          const deleteRequest =
            window.indexedDB.deleteDatabase("compass-local");
          deleteRequest.onsuccess = () => resolve();
          deleteRequest.onerror = () =>
            reject(new Error("Failed to delete IndexedDB"));
          deleteRequest.onblocked = () => {
            console.warn(
              "IndexedDB deletion blocked - close all Compass tabs and try again",
            );
            resolve();
          };
        });
      }
    }
  } catch (error) {
    console.error("Error clearing browser storage:", error);
    throw error;
  }
}
