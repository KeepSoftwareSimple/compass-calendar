import {
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
} from "@floating-ui/react";
import classNames from "classnames";
import { type KeyboardEvent, useId, useRef, useState } from "react";
import { type Calendar } from "@core/types/calendar.contracts";
import { type CalendarId } from "@core/types/domain-primitives";
import { useCalendarsQuery } from "@web/calendars/calendar.query";
import {
  compareCalendars,
  getWritableCalendars,
  spansMultipleAccounts,
} from "@web/calendars/calendar.util";
import {
  useConnectedAccountEmails,
  useDefaultTargetCalendar,
} from "@web/calendars/useDefaultTargetCalendar";
import { Z_INDEX_FLOATING_MENU } from "@web/common/constants/web.constants";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import {
  digitPickIndex,
  PICK_KEY_LABELS,
} from "@web/shortcuts/digit-pick.util";
import { useFloatingLayer } from "@web/shortcuts/floating-layer";
import { recordHandledShortcutInvocation } from "@web/shortcuts/tips/shortcut-telemetry";

interface CalendarSelectProps {
  value: CalendarId | null;
  onChange: (calendarId: CalendarId) => void;
  /** When set, marks the control invalid and links it for assistive tech. */
  error?: string;
  errorId?: string;
  id?: string;
}

const calendarOptionLabel = (calendar: Calendar): string =>
  calendar.isPrimary ? `${calendar.name} (primary)` : calendar.name;

// With two accounts connected, each has its own primary and its own calendar
// named e.g. "Work", so an option needs its account to be unambiguous. With
// one account the label is already unique and stays as it was.
const calendarOptionDescription = (
  calendar: Calendar,
  showAccount: boolean,
): string =>
  showAccount && calendar.accountEmail
    ? `${calendarOptionLabel(calendar)} on ${calendar.accountEmail}`
    : calendarOptionLabel(calendar);

/**
 * Labeled calendar picker for NEW/DUPLICATE event forms (writable calendars
 * only). Existing-event forms never render this - A6 forbids moving a saved
 * event between calendars, so the edit form shows read-only text instead
 * (see EventForm.tsx).
 *
 * Follows SelectView.tsx's floating-ui pattern (useFloating +
 * useListNavigation + useClick + useDismiss + useRole, roving tabindex, no
 * FloatingFocusManager) rather than a generalized SelectView, since that
 * component is view-switcher-specific and this field has its own writable-
 * filter/no-calendar-state concerns.
 */
export const CalendarSelect = ({
  value,
  onChange,
  error,
  errorId,
  id,
}: CalendarSelectProps) => {
  const { data } = useCalendarsQuery();
  const accountEmailOrder = useConnectedAccountEmails();
  const writableCalendars = getWritableCalendars(data ?? [], {
    hasConnectedAccount: accountEmailOrder.length > 0,
  }).sort(compareCalendars(accountEmailOrder));
  // Only disambiguate by account when there is something to disambiguate.
  const showAccount = spansMultipleAccounts(writableCalendars);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const listRef = useRef<Array<HTMLElement | null>>([]);
  const layerId = useId();
  useFloatingLayer(`calendarSelect:${layerId}`, isOpen);

  const selectedCalendar =
    writableCalendars.find((calendar) => calendar.id === value) ?? null;
  // A fresh create-draft has no calendarId yet; showing/selecting the
  // eventual default target here (rather than a blank control) is purely a
  // display default - it doesn't write to the draft until the user actually
  // picks something. useSaveEventForm.ts falls back to the
  // same default target at submit time if the user never touches this.
  const defaultCalendar = useDefaultTargetCalendar(writableCalendars) ?? null;
  const displayedCalendar = selectedCalendar ?? defaultCalendar;
  const displayedIndex = displayedCalendar
    ? writableCalendars.findIndex(
        (calendar) => calendar.id === displayedCalendar.id,
      )
    : -1;

  const { refs, context } = useFloating({
    open: isOpen,
    onOpenChange: (open) => {
      setIsOpen(open);
      if (open) {
        setActiveIndex(displayedIndex >= 0 ? displayedIndex : 0);
      } else {
        setActiveIndex(null);
        listRef.current = [];
      }
    },
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "listbox" });
  const listNavigation = useListNavigation(context, {
    listRef,
    activeIndex,
    onNavigate: setActiveIndex,
    loop: true,
  });

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions(
    [click, dismiss, role, listNavigation],
  );

  const selectCalendar = (calendar: Calendar) => {
    onChange(calendar.id);
    setIsOpen(false);
  };

  // Picks the Nth calendar directly, whether the list is open or still
  // closed - lets Mod+E, A, <digit> commit without opening it. Shared by the
  // trigger and the floating list's onKeyDown so the two never diverge.
  const pickCalendarByDigit = (e: KeyboardEvent<Element>): boolean => {
    const pickIndex = digitPickIndex(e);
    const pickedCalendar =
      pickIndex === null ? undefined : writableCalendars[pickIndex];
    if (!pickedCalendar) return false;

    e.preventDefault();
    e.stopPropagation();
    selectCalendar(pickedCalendar);
    recordHandledShortcutInvocation("edit-pick-by-number");
    return true;
  };

  if (writableCalendars.length === 0) {
    return (
      <p className="my-1.5 text-error text-xs">
        No writable calendar available
      </p>
    );
  }

  const dropdownId = "calendar-select-dropdown";
  const buttonLabel = displayedCalendar
    ? `Calendar: ${calendarOptionDescription(displayedCalendar, showAccount)}`
    : "Calendar";

  const hasError = Boolean(error);

  return (
    <div className="relative">
      <button
        id={id}
        ref={refs.setReference}
        {...getReferenceProps({
          onKeyDown: (e) => {
            if (pickCalendarByDigit(e)) return;

            // While the list is open, focus can sit on this trigger for a
            // frame - useListNavigation moves it to the active option
            // asynchronously - so a fast ArrowDown+Enter lands Enter here.
            // The button's native Enter-click would then toggle the dropdown
            // closed and LOSE the selection. Commit the active option
            // instead, mirroring the floating element's own handler.
            if (
              isOpen &&
              activeIndex !== null &&
              (e.key === "Enter" || e.key === " ")
            ) {
              e.preventDefault();
              const calendar = writableCalendars[activeIndex];
              if (calendar) {
                selectCalendar(calendar);
              }
            }
          },
        })}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={isOpen ? dropdownId : undefined}
        aria-label={buttonLabel}
        aria-invalid={hasError ? true : undefined}
        aria-describedby={hasError ? errorId : undefined}
        className={classNames(
          "c-focus-ring flex w-full items-center gap-2 rounded-xs px-1.5 py-1 text-left text-text text-xs hover:bg-text/10",
          hasError && "ring-1 ring-error",
        )}
        type="button"
      >
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{
            backgroundColor:
              displayedCalendar?.backgroundColor ?? "transparent",
          }}
        />
        <span className="min-w-0 flex-1 truncate">
          {displayedCalendar
            ? calendarOptionLabel(displayedCalendar)
            : "Select a calendar"}
        </span>
      </button>

      {isOpen && (
        <div
          ref={refs.setFloating}
          {...getFloatingProps({
            onKeyDown: (e) => {
              if (pickCalendarByDigit(e)) return;

              if (
                activeIndex !== null &&
                (e.key === "Enter" || e.key === " ")
              ) {
                e.preventDefault();
                const calendar = writableCalendars[activeIndex];
                if (calendar) {
                  selectCalendar(calendar);
                }
              }
            },
          })}
          id={dropdownId}
          aria-label="Calendar"
          className="absolute top-full left-0 mt-1 min-w-[200px] rounded border border-border bg-surface py-1 shadow-lg"
          role="listbox"
          style={{ zIndex: Z_INDEX_FLOATING_MENU }}
        >
          {writableCalendars.map((calendar, index) => {
            const isSelected = calendar.id === displayedCalendar?.id;
            const isActive = activeIndex === index;

            return (
              <div
                key={calendar.id}
                ref={(node) => {
                  listRef.current[index] = node;
                }}
                {...getItemProps({
                  onClick: () => selectCalendar(calendar),
                  active: isActive,
                })}
                role="option"
                aria-label={calendarOptionDescription(calendar, showAccount)}
                aria-selected={isSelected}
                tabIndex={isActive ? 0 : -1}
                className={classNames(
                  "flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors",
                  isSelected ? "text-accent" : "text-text-muted",
                  isActive ? "bg-text/10" : "hover:bg-text/10",
                )}
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: calendar.backgroundColor }}
                />
                <span className="min-w-0 flex-1 truncate">
                  {calendarOptionLabel(calendar)}
                </span>
                {showAccount && calendar.accountEmail ? (
                  <span
                    className="min-w-0 shrink truncate text-text-muted"
                    translate="no"
                  >
                    {calendar.accountEmail}
                  </span>
                ) : null}
                {index < PICK_KEY_LABELS.length && (
                  <ShortcutHint className="shrink-0">
                    {PICK_KEY_LABELS[index]}
                  </ShortcutHint>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
