import { useHotkey } from "@tanstack/react-hotkeys";
import { isHigherEscapeOwner } from "@web/shortcuts/escape-ownership";

type BookingShortcutOptions = {
  enabled?: boolean;
  ignoreInputs?: boolean;
};

export function useBookingShortcut(
  key: "Escape",
  handler: (event: KeyboardEvent) => void,
  options: BookingShortcutOptions = {},
) {
  useHotkey(
    key,
    (event) => {
      if (isHigherEscapeOwner()) {
        return;
      }
      handler(event);
    },
    {
      enabled: options.enabled ?? true,
      ignoreInputs: options.ignoreInputs ?? true,
    },
  );
}
