import { useCallback, useRef } from "react";
import { type EventRegistry } from "@web/grid/interaction/event.registry";

export const useEventRegistrationRef = <TType extends string>({
  eventId,
  eventType,
  isEnabled,
  registry,
}: {
  eventId: string | undefined;
  eventType: TType;
  isEnabled: boolean;
  registry: EventRegistry<TType>;
}) => {
  const unregisterRef = useRef<(() => void) | null>(null);

  return useCallback(
    (node: HTMLDivElement | null) => {
      unregisterRef.current?.();
      unregisterRef.current = null;

      if (!node || !eventId || !isEnabled) {
        return;
      }

      unregisterRef.current = registry.register({
        element: node,
        eventId,
        eventType,
      });
    },
    [eventId, eventType, isEnabled, registry],
  );
};
