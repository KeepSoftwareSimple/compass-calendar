import { usePaletteAwareOverlayDismiss } from "@web/settings/usePaletteAwareOverlayDismiss";
import { TimezonePickerDialog } from "@web/timezone/TimezonePickerDialog";
import {
  selectTimezoneDialogOpen,
  selectTimezoneDialogPurpose,
  timezoneDialogActions,
  useTimezoneDialogStore,
} from "@web/timezone/timezone-dialog.store";

export function TimezoneDialogHost() {
  const isOpen = useTimezoneDialogStore(selectTimezoneDialogOpen);
  const purpose = useTimezoneDialogStore(selectTimezoneDialogPurpose);
  const { skipFocusRestoreRef, handleDismiss } = usePaletteAwareOverlayDismiss(
    isOpen,
    timezoneDialogActions.close,
  );

  if (!isOpen) return null;

  return (
    <TimezonePickerDialog
      onDismiss={handleDismiss}
      purpose={purpose}
      skipFocusRestoreRef={skipFocusRestoreRef}
    />
  );
}
