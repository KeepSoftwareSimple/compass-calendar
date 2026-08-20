import { TimezonePickerDialog } from "@web/timezone/TimezonePickerDialog";
import {
  selectTimezoneDialogOpen,
  selectTimezoneDialogPurpose,
  selectTimezoneDialogRestoreFocus,
  timezoneDialogActions,
  useTimezoneDialogStore,
} from "@web/timezone/timezone-dialog.store";

export function TimezoneDialogHost() {
  const isOpen = useTimezoneDialogStore(selectTimezoneDialogOpen);
  const purpose = useTimezoneDialogStore(selectTimezoneDialogPurpose);
  const restoreFocus = useTimezoneDialogStore(selectTimezoneDialogRestoreFocus);
  if (!isOpen) return null;

  return (
    <TimezonePickerDialog
      onDismiss={timezoneDialogActions.close}
      purpose={purpose}
      restoreFocus={restoreFocus}
    />
  );
}
