import { lazyRouteComponent } from "@tanstack/react-router";
import { Suspense } from "react";
import { usePaletteAwareOverlayDismiss } from "@web/settings/usePaletteAwareOverlayDismiss";
import {
  selectTimezoneDialogOpen,
  selectTimezoneDialogPurpose,
  timezoneDialogActions,
  useTimezoneDialogStore,
} from "@web/timezone/timezone-dialog.store";

// Lazy: CompassProvider always mounts this host, and a static import of the
// picker pulled TimezoneCombobox (and its catalog helpers) into every boot
// chunk. The host stays thin so first-open still owns focus after the chunk
// lands. No preload helper: opening is already a deliberate user action.
const LazyTimezonePickerDialog = lazyRouteComponent(
  () => import("@web/timezone/TimezonePickerDialog"),
  "TimezonePickerDialog",
);

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
