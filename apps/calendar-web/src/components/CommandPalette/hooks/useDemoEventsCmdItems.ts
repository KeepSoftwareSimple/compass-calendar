import { EraserIcon } from "@phosphor-icons/react/dist/csr/Eraser";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import { dismissDemoEventsBanner } from "@web/components/DemoEventsBanner/DemoEventsBanner";
import { clearDemoEvents } from "@web/events/demo-events.util";
import { useDemoEventsPresent } from "@web/events/hooks/useDemoEventsPresent";
import { type CommandItem } from "../command-palette.types";

const CLEAR_DEMO_EVENTS_TOAST_ID = "clear-demo-events";

export function useDemoEventsCmdItems(): CommandItem[] {
  const queryClient = useQueryClient();
  const demoEventsPresent = useDemoEventsPresent();

  const handleClearDemoEvents = useCallback(async () => {
    const removedCount = await clearDemoEvents(queryClient);
    dismissDemoEventsBanner();

    if (removedCount > 0) {
      showStatusToast(
        CLEAR_DEMO_EVENTS_TOAST_ID,
        removedCount === 1
          ? "Removed 1 sample event"
          : `Removed ${removedCount} sample events`,
      );
    }
  }, [queryClient]);

  if (!demoEventsPresent) {
    return [];
  }

  return [
    {
      id: "clear-sample-events",
      label: "Clear sample events",
      icon: EraserIcon,
      keywords: ["demo", "sample", "remove"],
      onClick: () => {
        void handleClearDemoEvents();
      },
    },
  ];
}
