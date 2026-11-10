import { Suspense } from "react";
import { usePaletteAwareOverlayDismiss } from "@web/settings/usePaletteAwareOverlayDismiss";
import { LazyTimezonePickerDialog } from "@web/timezone/TimezonePickerDialog.lazy";
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
    <Suspense fallback={null}>
      <LazyTimezonePickerDialog
        onDismiss={handleDismiss}
        purpose={purpose}
        skipFocusRestoreRef={skipFocusRestoreRef}
      />
    </Suspense>
  );
}
