import { FloatingPortal, useFloating } from "@floating-ui/react";
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useMemo,
  useState,
} from "react";
import { type GridEvent } from "@web/common/types/web.event.types";
import { getCalendarEventIdFromElement } from "@web/common/utils/event/event.util";
import { ContextMenu } from "@web/components/ContextMenu/ContextMenu";
import { type ContextMenuItemsActions } from "@web/components/ContextMenu/ContextMenuItems";
import {
  CONTEXT_MENU_FLOATING_OPTIONS,
  contextMenuStyle,
  cursorReference,
} from "@web/components/ContextMenu/contextMenu.floating";
import { useToggleEventHidden } from "@web/events/hidden/hidden-events.query";
import { useDeleteEvent } from "@web/views/Forms/hooks/useDeleteEvent";
import { useDuplicateEvent } from "@web/views/Forms/hooks/useDuplicateEvent";
import { useSetEventColor } from "@web/views/Forms/hooks/useSetEventColor";

export const useDayCalendarContextMenu = ({
  getDayEventById,
  onOpenEvent,
}: {
  getDayEventById: (eventId: string) => GridEvent | null;
  onOpenEvent: (event: GridEvent) => void;
}) => {
  const [contextMenuEvent, setContextMenuEvent] = useState<GridEvent | null>(
    null,
  );
  const [isOpen, setIsOpen] = useState(false);
  const contextMenuEventId = contextMenuEvent?._id ?? "";
  const duplicateContextMenuEvent = useDuplicateEvent(contextMenuEventId);
  const deleteContextMenuEvent = useDeleteEvent(contextMenuEventId);
  const setContextMenuEventColor = useSetEventColor(contextMenuEventId);
  const toggleEventHidden = useToggleEventHidden();

  const { context, refs, floatingStyles } = useFloating({
    ...CONTEXT_MENU_FLOATING_OPTIONS,
    open: isOpen,
    onOpenChange: setIsOpen,
  });

  const closeContextMenu = useCallback(() => {
    setIsOpen(false);
    setContextMenuEvent(null);
  }, []);

  const handleContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      const target = event.target;

      if (!(target instanceof HTMLElement)) {
        return;
      }

      const eventId = getCalendarEventIdFromElement(target);

      if (!eventId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const selectedEvent = getDayEventById(eventId);

      if (!selectedEvent) {
        return;
      }

      refs.setReference(cursorReference(event.clientX, event.clientY));
      setContextMenuEvent(selectedEvent);
      setIsOpen(true);
    },
    [getDayEventById, refs],
  );

  const contextMenuActions = useMemo<ContextMenuItemsActions>(
    () => ({
      delete: () => {
        deleteContextMenuEvent();
      },
      duplicate: () => {
        duplicateContextMenuEvent();
      },
      edit: () => {
        if (!contextMenuEvent) {
          return;
        }

        onOpenEvent(contextMenuEvent);
      },
      setColor: (color) => {
        setContextMenuEventColor(color);
      },
      toggleHidden: () => {
        if (!contextMenuEventId) {
          return;
        }
        toggleEventHidden(contextMenuEventId);
      },
    }),
    [
      contextMenuEvent,
      contextMenuEventId,
      deleteContextMenuEvent,
      duplicateContextMenuEvent,
      onOpenEvent,
      setContextMenuEventColor,
      toggleEventHidden,
    ],
  );

  return {
    contextMenu: isOpen ? (
      <FloatingPortal>
        <ContextMenu
          actions={contextMenuActions}
          close={closeContextMenu}
          context={context}
          event={contextMenuEvent ?? undefined}
          onOutsideClick={closeContextMenu}
          ref={refs.setFloating}
          style={contextMenuStyle(floatingStyles)}
        />
      </FloatingPortal>
    ) : null,
    handleContextMenu,
  };
};
