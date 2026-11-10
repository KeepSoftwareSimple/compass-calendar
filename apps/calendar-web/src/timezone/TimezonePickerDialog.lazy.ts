import { lazy } from "react";
import { importOrReload } from "@web/common/utils/browser/missing-chunk-reload.util";

// Lazy: CompassProvider always mounts TimezoneDialogHost, so a static import
// of the picker would put city-timezones (via TimezoneCombobox) on every boot.
export const LazyTimezonePickerDialog = lazy(() =>
  importOrReload(() => import("@web/timezone/TimezonePickerDialog")).then(
    (module) => ({ default: module.TimezonePickerDialog }),
  ),
);
