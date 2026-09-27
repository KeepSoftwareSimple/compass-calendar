import {
  EVENT_DELETED_TOAST_ID,
  getToastDefaultOptions,
} from "@web/common/constants/toast.constants";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import { getToast } from "@web/common/utils/toast/toast.port";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";

/**
 * "Deleted" status toast for event deletes. Shows a Mod+Z keycap hint when the
 * delete was recorded in undo history; recurring deletes aren't undoable, so
 * hinting Cmd+Z there would undo an unrelated earlier change.
 */
export function showDeletedToast(withUndoHint: boolean): void {
  showStatusToast(
    EVENT_DELETED_TOAST_ID,
    withUndoHint ? (
      <span className="inline-flex items-center gap-2">
        Deleted
        <ShortcutKeys keys={["Mod", "Z"]} title="Undo" />
      </span>
    ) : (
      "Deleted"
    ),
  );
}

/**
 * Flip the "Deleted" toast to "Restored" when the user undoes the delete.
 * `toast.update` only touches a live toast, so once the "Deleted" toast has
 * auto-dismissed this is a no-op — restoring after it's gone shows nothing,
 * which is what we want. It shares `EVENT_DELETED_TOAST_ID` so it updates the
 * existing toast in place rather than stacking a second one.
 */
export function showRestoredToast(): void {
  getToast().update(EVENT_DELETED_TOAST_ID, {
    render: "Restored",
    autoClose: getToastDefaultOptions().autoClose,
  });
}

/**
 * The restore mutation failed server-side after the optimistic insert already
 * rolled back. Unlike showRestoredToast, this uses showStatusToast's
 * create-or-update so it still surfaces even if the "Deleted" toast already
 * auto-dismissed by the time the failure comes back.
 */
export function showRestoreFailedToast(): void {
  showStatusToast(EVENT_DELETED_TOAST_ID, "Couldn't restore the event");
}
