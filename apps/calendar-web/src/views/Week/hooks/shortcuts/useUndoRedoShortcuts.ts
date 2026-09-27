import { type EventMutationDependencies } from "@web/events/mutations/useEventMutations";
import { useUndoRedo } from "@web/events/mutations/useUndoRedo";
import { KEYMAP } from "@web/shortcuts/keymap";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";

/**
 * Registers Mod+Z (undo) and Mod+Shift+Z (redo) for event changes.
 * Mount once under HotkeysProvider (see `GlobalShortcutsHost` in
 * CompassProvider).
 *
 * `ignoreInputs: true` is load-bearing: Meta/Ctrl combos fire inside text
 * fields by default, and Mod+Z there must stay native text undo.
 */
export function useUndoRedoShortcuts(
  dependencies: EventMutationDependencies = {},
) {
  const { undo, redo } = useUndoRedo(dependencies);

  useAppShortcut(
    KEYMAP.undo.hotkey,
    (event) => {
      // Never undo on a shifted press, regardless of how the hotkey
      // library matches Mod+Z vs Mod+Shift+Z.
      if (event.shiftKey) return;
      undo();
    },
    { ignoreInputs: true, shortcutId: "other-undo" },
  );

  useAppShortcut(KEYMAP.redo.hotkey, () => redo(), {
    ignoreInputs: true,
    shortcutId: "other-redo",
  });
}
