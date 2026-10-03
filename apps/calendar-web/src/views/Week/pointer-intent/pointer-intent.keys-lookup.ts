import { REGISTRY_RUNTIME_KEY_SOURCES } from "@core/shortcuts/app-shortcut-bindings";
import { type ShortcutRegistryId } from "@web/shortcuts/shortcuts.registry";

/** Example digits row in the legend; slot hints use the real timeKey in copy. */
const CREATE_TYPED_TIME_KEYCAPS = ["1130"] as const;

export function pointerIntentKeysLookup(
  shortcutId: ShortcutRegistryId,
): readonly string[] | undefined {
  if (shortcutId === "create-typed-time") {
    return CREATE_TYPED_TIME_KEYCAPS;
  }
  return REGISTRY_RUNTIME_KEY_SOURCES[shortcutId];
}
