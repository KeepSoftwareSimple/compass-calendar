import {
  type FloatingContext,
  useDismiss,
  useInteractions,
  useListNavigation,
  useRole,
} from "@floating-ui/react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { type GridEvent } from "@web/common/types/web.event.types";
import { useFloatingLayer } from "@web/shortcuts/floating-layer";
import {
  ContextMenuItems,
  type ContextMenuItemsActions,
  ContextMenuItemsView,
  ContextMenuNavContext,
} from "./ContextMenuItems";

interface ContextMenuProps {
  actions?: ContextMenuItemsActions;
  event?: GridEvent;
  onOutsideClick: () => void;
  close: () => void;
  style: React.CSSProperties;
  context: FloatingContext;
}

export const ContextMenu = React.forwardRef<HTMLUListElement, ContextMenuProps>(
  ({ actions, event, onOutsideClick, close, style, context }, ref) => {
    // Seed the active index to the first item so it carries tabIndex={0} and
    // arrow-key navigation has a starting point.
    const [activeIndex, setActiveIndex] = useState<number | null>(0);
    const listRef = useRef<Array<HTMLElement | null>>([]);
    const menuRef = useRef<HTMLUListElement | null>(null);
    const setMenuRef = useCallback(
      (node: HTMLUListElement | null) => {
        menuRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );

    // The menu opens from a raw contextmenu handler rather than a floating-ui
    // interaction, so FloatingFocusManager never seats focus for us. Do it
    // ourselves: pull focus into the first item once the menu is open, and hand
    // focus back to the opener (the event card, for a Shift+F10 keyboard open)
    // when it closes.
    const openerRef = useRef<HTMLElement | null>(
      typeof document === "undefined"
        ? null
        : (document.activeElement as HTMLElement | null),
    );
    // Depend on the boolean, not `event`: `event` is a fresh object every
    // render, so a `[event]` effect would re-run and its cleanup would cancel
    // the pending timeout before it ever fired. `hasEvent` only flips when the
    // menu opens or closes.
    const hasEvent = !!event;
    useFloatingLayer("contextMenu", hasEvent);
    useEffect(() => {
      if (!hasEvent) return;
      // Seat focus on the first item, deferred and retried for a short window.
      // A synchronous focus is a no-op (the portalled menu isn't laid out during
      // the commit), and opening writes the grid draft, whose re-render reclaims
      // focus to the source card once, shortly after. So we can't stop at the
      // first success: keep re-seating focus whenever it has fallen back out of
      // the menu, until the draft settles. setTimeout (not rAF) keeps firing in
      // a background tab. The in-menu guard leaves arrow-key focus alone.
      let attemptsLeft = 12;
      let id: ReturnType<typeof setTimeout>;
      const tryFocus = () => {
        const menu = menuRef.current;
        if (menu && !menu.contains(document.activeElement)) {
          menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
        }
        if (attemptsLeft-- > 0) id = setTimeout(tryFocus, 16);
      };
      id = setTimeout(tryFocus, 0);
      return () => clearTimeout(id);
    }, [hasEvent]);
    useEffect(() => {
      return () => {
        const opener = openerRef.current;
        if (opener && document.contains(opener)) opener.focus();
      };
    }, []);

    const dismiss = useDismiss(context, {
      outsidePress: (event) => {
        event.preventDefault(); // Prevents clicking another UI element when dismissing
        onOutsideClick();
        return true;
      },
    });

    const role = useRole(context, { role: "menu" });

    const listNavigation = useListNavigation(context, {
      listRef,
      activeIndex,
      onNavigate: setActiveIndex,
      loop: true,
    });

    const { getFloatingProps, getItemProps } = useInteractions([
      dismiss,
      role,
      listNavigation,
    ]);

    if (!event) return null;

    return (
      <ul
        className="c-context-menu"
        ref={setMenuRef}
        style={style}
        {...getFloatingProps()}
      >
        <ContextMenuNavContext.Provider
          value={{ getItemProps, listRef, activeIndex }}
        >
          {actions ? (
            <ContextMenuItemsView
              actions={actions}
              close={close}
              event={event}
            />
          ) : (
            <ContextMenuItems event={event} close={close} />
          )}
        </ContextMenuNavContext.Provider>
      </ul>
    );
  },
);

ContextMenu.displayName = "ContextMenu";
