import { Copy, Eye, EyeSlash, PenNib, Trash } from "@phosphor-icons/react";
import type React from "react";
import { createContext, useContext } from "react";
import {
  type EventColorSlot,
  EventColorSlotSchema,
} from "@core/types/event-color.contracts";
import {
  isEventReadOnly,
  useCalendarLookup,
} from "@web/calendars/useCalendarLookup";
import { ID_CONTEXT_MENU_ITEMS } from "@web/common/constants/web.constants";
import {
  EVENT_COLOR_SLOT_HEX,
  eventColorLabel,
} from "@web/common/styles/theme.util";
import { type GridEvent } from "@web/common/types/web.event.types";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import {
  useHiddenEventIds,
  useToggleEventHidden,
} from "@web/events/hidden/hidden-events.query";
import { draftActions } from "@web/events/stores/draft.store";
import {
  digitPickIndex,
  PICK_KEY_LABELS,
} from "@web/shortcuts/digit-pick.util";
import { HIDE_EVENT_LETTER } from "@web/shortcuts/hide-event/hide-event.constants";
import { isBareLetterKey } from "@web/shortcuts/is-bare-letter-key";
import { useDeleteEvent } from "@web/views/Forms/hooks/useDeleteEvent";
import { useDuplicateEvent } from "@web/views/Forms/hooks/useDuplicateEvent";
import { useSetEventColor } from "@web/views/Forms/hooks/useSetEventColor";

export interface ContextMenuAction {
  id: string;
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  keys?: string[];
}

// Supplied by ContextMenu so each item can wire into floating-ui's roving-focus
// list navigation (arrow keys) and register its node in the shared listRef. The
// menu still renders standalone (e.g. in tests) without a provider, in which
// case items fall back to plain roving-free buttons.
interface ContextMenuNavContextValue {
  getItemProps: (
    userProps?: React.HTMLProps<HTMLElement>,
  ) => Record<string, unknown>;
  listRef: React.MutableRefObject<Array<HTMLElement | null>>;
  activeIndex: number | null;
}

export const ContextMenuNavContext =
  createContext<ContextMenuNavContextValue | null>(null);

export interface ContextMenuItemsActions {
  delete: () => void;
  duplicate: () => void;
  edit: () => void;
  setColor: (color: EventColorSlot | null) => void;
  toggleHidden: () => void;
}

interface ContextMenuItemsProps {
  event: GridEvent;
  close: () => void;
}

interface ContextMenuItemsViewProps extends ContextMenuItemsProps {
  actions: ContextMenuItemsActions;
}

const COLOR_OPTIONS: Array<EventColorSlot | null> = [
  null,
  ...EventColorSlotSchema.options,
];

const colorSwatchClassName =
  "h-5 w-5 shrink-0 cursor-pointer rounded-sm border border-transparent focus-visible:ring-2 focus-visible:ring-accent aria-checked:border-text aria-checked:outline aria-checked:outline-2 aria-checked:outline-offset-1 aria-checked:outline-text";

export function ContextMenuItemsView({
  actions,
  close,
  event,
}: ContextMenuItemsViewProps) {
  const calendarLookup = useCalendarLookup();
  // Read-only (unwritable calendar or busy content) events can be inspected
  // ("View" below opens the read-only form) but never mutated - Delete is
  // hidden entirely rather than merely disabled, since there's nothing
  // useful to click through to (packet 08 step 8).
  const isReadOnly = isEventReadOnly(
    calendarLookup,
    event.calendarId,
    event.isBusy ?? false,
  );
  const isHidden = useHiddenEventIds().has(event._id ?? "");

  const menuActions: ContextMenuAction[] = [
    {
      id: "edit",
      label: isReadOnly ? "View" : "Edit",
      onClick: actions.edit,
      icon: <PenNib aria-hidden="true" size={20} />,
    },
    {
      id: "duplicate",
      label: "Duplicate",
      onClick: actions.duplicate,
      icon: <Copy aria-hidden="true" size={20} />,
    },
    {
      id: "hide",
      label: isHidden ? "Show event" : "Hide event",
      keys: [HIDE_EVENT_LETTER],
      onClick: actions.toggleHidden,
      icon: isHidden ? (
        <Eye aria-hidden="true" size={20} />
      ) : (
        <EyeSlash aria-hidden="true" size={20} />
      ),
    },
    ...(isReadOnly
      ? []
      : [
          {
            id: "delete",
            label: "Delete",
            onClick: actions.delete,
            icon: <Trash aria-hidden="true" size={20} />,
          },
        ]),
  ];

  const nav = useContext(ContextMenuNavContext);
  const selectedColor = event.color ?? null;
  const pickColor = (color: EventColorSlot | null) => {
    actions.setColor(color);
    close();
  };

  return (
    // role="none" keeps the menu -> menuitem ownership valid across this
    // container. Escape ownership is registered via useFloatingLayer on
    // ContextMenu; the id remains a stable test/DOM anchor.
    <div
      id={ID_CONTEXT_MENU_ITEMS}
      role="none"
      onKeyDown={(keyEvent) => {
        if (!isBareLetterKey(keyEvent.nativeEvent, HIDE_EVENT_LETTER)) {
          return;
        }
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        actions.toggleHidden();
        close();
      }}
    >
      {menuActions.map((item, index) => {
        const select = () => {
          item.onClick();
          close();
        };
        const itemProps = nav
          ? nav.getItemProps({ onClick: select })
          : { onClick: select };
        return (
          <button
            className="c-context-menu-item"
            key={item.id}
            type="button"
            role="menuitem"
            ref={(node) => {
              if (nav) nav.listRef.current[index] = node;
            }}
            tabIndex={nav ? (nav.activeIndex === index ? 0 : -1) : undefined}
            {...itemProps}
          >
            {item.icon}
            <span className="text-l">{item.label}</span>
            {item.keys && <ShortcutKeys keys={item.keys} className="ml-auto" />}
          </button>
        );
      })}
      {!isReadOnly && (
        <fieldset
          className="group/menu-colors m-0 min-w-0 border-border border-t px-3 py-2"
          onKeyDown={(keyEvent) => {
            const pickIndex = digitPickIndex(keyEvent);
            const pickedColor =
              pickIndex === null ? undefined : COLOR_OPTIONS[pickIndex];
            if (pickedColor !== undefined) {
              keyEvent.preventDefault();
              keyEvent.stopPropagation();
              pickColor(pickedColor);
            }
          }}
        >
          <legend className="sr-only">Event color</legend>
          <div className="grid grid-cols-6 gap-1.5">
            {COLOR_OPTIONS.map((slot, colorIndex) => {
              const index = menuActions.length + colorIndex;
              const label = eventColorLabel(slot);
              const checked = selectedColor === slot;
              const select = () => pickColor(slot);
              const itemProps = nav
                ? nav.getItemProps({ onClick: select })
                : { onClick: select };
              return (
                <span key={label} className="group relative inline-flex">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={checked}
                    aria-label={label}
                    className={
                      slot === null
                        ? `${colorSwatchClassName} border-border bg-bg-primary`
                        : colorSwatchClassName
                    }
                    style={
                      slot === null
                        ? undefined
                        : { backgroundColor: EVENT_COLOR_SLOT_HEX[slot] }
                    }
                    ref={(node) => {
                      if (nav) nav.listRef.current[index] = node;
                    }}
                    tabIndex={
                      nav ? (nav.activeIndex === index ? 0 : -1) : undefined
                    }
                    {...itemProps}
                  />
                  <span className="c-context-tooltip" role="tooltip">
                    {label}
                  </span>
                  {PICK_KEY_LABELS[colorIndex] && (
                    <span
                      aria-hidden
                      className="pointer-events-none invisible absolute inset-0 flex items-center justify-center rounded-sm bg-bg-primary/70 font-semibold text-[10px] text-text group-focus-within/menu-colors:visible"
                    >
                      {PICK_KEY_LABELS[colorIndex]}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </fieldset>
      )}
    </div>
  );
}

export function ContextMenuItems({ event, close }: ContextMenuItemsProps) {
  const eventId = event._id ?? "";
  const deleteEvent = useDeleteEvent(eventId);
  const duplicateEvent = useDuplicateEvent(eventId);
  const setEventColor = useSetEventColor(eventId);
  const toggleEventHidden = useToggleEventHidden();

  const menuActions: ContextMenuItemsActions = {
    delete: () => {
      deleteEvent();
    },
    duplicate: () => {
      duplicateEvent();
    },
    // Right-click seeds gridDraft with the form closed; Edit opens it.
    edit: () => {
      draftActions.setFormOpen(true);
    },
    setColor: (color) => {
      setEventColor(color);
    },
    toggleHidden: () => {
      toggleEventHidden(eventId);
    },
  };

  return (
    <ContextMenuItemsView actions={menuActions} close={close} event={event} />
  );
}
