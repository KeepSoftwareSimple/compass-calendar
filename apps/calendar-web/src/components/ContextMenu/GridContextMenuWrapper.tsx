import { FloatingPortal, useFloating } from "@floating-ui/react";
import { useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";
import { getCalendarEventIdFromElement } from "@web/common/utils/event/event.util";
import { type GridEventDraft } from "@web/events/event-draft.types";
import {
  editGridEventDraft,
  getGridDraftId,
  gridEventDraftToGridEvent,
} from "@web/events/grid-event-draft.adapter";
import { findEventInCache } from "@web/events/queries/event.query.cache";
import {
  draftActions,
  selectGridDraft,
  useDraftStore,
} from "@web/events/stores/draft.store";
import { maybePulseContextMenuOpenedByPointer } from "@web/shortcuts/context-menu/context-menu-pointer-hint";
import { ContextMenu } from "./ContextMenu";
import { contextMenuAnchorFromPointer } from "./contextMenu.anchor";
import {
  CONTEXT_MENU_FLOATING_OPTIONS,
  contextMenuStyle,
} from "./contextMenu.floating";

export const ContextMenuWrapper = ({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) => {
  const queryClient = useQueryClient();
  const gridDraft = useDraftStore(selectGridDraft);
  const contextMenuEvent = gridDraft
    ? gridEventDraftToGridEvent(gridDraft)
    : undefined;

  const [isOpen, setIsOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    ...CONTEXT_MENU_FLOATING_OPTIONS,
    open: isOpen,
    onOpenChange(newIsOpen, _, reason) {
      setIsOpen(newIsOpen);
      if (newIsOpen === false && reason === "escape-key") {
        handleDiscard();
      }
    },
  });

  const getDraftForEvent = (eventId: string): GridEventDraft | null => {
    // The id comes from the DOM (view-registry interaction id attrs), which
    // can legitimately disagree with the react-query cache: an in-progress
    // grid draft renders with `draft.clientId`/its edited source id (never
    // cached), so match it directly rather than looking it up.
    if (gridDraft && getGridDraftId(gridDraft) === eventId) {
      return gridDraft;
    }

    // A cache miss is an ordinary outcome (unsaved drafts, non-cache-backed
    // placeholderData during week navigation, optimistically removed events
    // still in the DOM for a frame). Treat it as a no-op — like every other
    // `findEventInCache` caller — instead of throwing and taking down the grid.
    const selectedEvent = findEventInCache(queryClient, eventId);
    if (!selectedEvent) return null;

    return editGridEventDraft(selectedEvent);
  };

  const handleDiscard = () => {
    closeMenu();
    draftActions.discard();
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) {
      console.error("target is not a HTMLElement");
      return;
    }
    const eventId = getCalendarEventIdFromElement(target);
    const hasClickedOnEvent = !!eventId;

    if (hasClickedOnEvent) {
      e.preventDefault();

      const draft = getDraftForEvent(eventId);
      if (!draft) return;

      const { reference, fromKeyboard } = contextMenuAnchorFromPointer(
        e,
        target,
      );
      refs.setReference(reference);

      draftActions.startGridDraft({ activity: "eventRightClick", draft });

      setIsOpen(true);
      if (!fromKeyboard) {
        maybePulseContextMenuOpenedByPointer();
      }
    }
  };

  const closeMenu = () => {
    setIsOpen(false);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: The display-contents wrapper only forwards right-clicks from its children.
    <div
      id={id}
      style={{ display: "contents" }}
      onContextMenu={handleContextMenu}
    >
      {children}
      {isOpen && (
        <FloatingPortal>
          <ContextMenu
            ref={refs.setFloating}
            event={contextMenuEvent}
            style={contextMenuStyle(floatingStyles)}
            context={context}
            close={closeMenu}
            onOutsideClick={handleDiscard}
          />
        </FloatingPortal>
      )}
    </div>
  );
};
