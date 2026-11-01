import type React from "react";
import { useEffect, useRef, useState } from "react";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { parseUserDate } from "@web/common/utils/datetime/web.date.util";
import { resolveFormControlJumpIds } from "@web/common/utils/form/form.util";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";
import { DatePicker } from "@web/components/DatePicker/DatePicker";
import { hasCommandModifier } from "@web/shortcuts/keyboard-modifiers.util";
import {
  EVENT_FORM_DATE_INPUT_FORMAT,
  formatEventFormDateLabel,
} from "@web/views/Forms/EventForm/DateControlsSection/DateTimeSection/eventFormDateField.util";
import {
  calendarAction,
  closedFieldAction,
  isEventFormDateCalendarKey,
  isEventFormDateFieldClosedKey,
  movePickerCursor,
} from "@web/views/Forms/EventForm/DateControlsSection/DateTimeSection/eventFormDateFieldKeys.util";
import {
  EventFormCalendarPopoverHints,
  EventFormHintKeys,
  EventFormInfieldHint,
} from "@web/views/Forms/EventForm/EventFormFocusedHint";

const DATE_FIELD_CLASSNAME =
  "c-event-form-date-field flex min-w-0 flex-1 items-center [&_.react-datepicker-wrapper]:w-full [&_.react-datepicker\\_\\_input-container]:w-full [&_input]:w-full [&_input]:min-w-0";

const stopPropagation = (e: React.MouseEvent<HTMLDivElement>) => {
  e.stopPropagation();
};

/** Keys the field acts on itself never reach the form's own shortcuts. */
const consume = (event: React.KeyboardEvent) => {
  event.preventDefault();
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation();
};

export interface EventFormDateFieldProps {
  calendarClassName?: string;
  id?: string;
  inputId?: string;
  isOpen: boolean;
  onCalendarClose: () => void;
  onCalendarOpen: () => void;
  onCommit: (date: Date) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  selected: Date;
  sideLabel: "start" | "end";
  title: string;
}

export const EventFormDateField = ({
  calendarClassName,
  id,
  inputId,
  isOpen,
  onCalendarClose,
  onCalendarOpen,
  onCommit,
  onKeyDown,
  selected,
  sideLabel,
  title,
}: EventFormDateFieldProps) => {
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const containerRef = useRef<HTMLDivElement>(null);
  const skipBlurCloseRef = useRef(false);
  const calendarCloseRequestedRef = useRef(false);
  const requestCalendarClose = () => {
    if (calendarCloseRequestedRef.current) return;
    calendarCloseRequestedRef.current = true;
    onCalendarClose();
  };
  const [pickerCursor, setPickerCursor] = useState<Dayjs | null>(null);
  const pickerCursorRef = useRef<Dayjs | null>(null);
  const isGridFocusedRef = useRef(false);
  const setPickerCursorSync = (next: Dayjs | null) => {
    pickerCursorRef.current = next;
    setPickerCursor(next);
  };
  const keyboardSelectedDaySelector =
    ".react-datepicker__day--keyboard-selected:not(.react-datepicker__day--disabled)";
  const findKeyboardSelectedDay = () =>
    document.querySelector<HTMLElement>(
      `.react-datepicker-popper ${keyboardSelectedDaySelector}`,
    ) ??
    (calendarClassName
      ? document.querySelector<HTMLElement>(
          `.calendar.${calendarClassName} ${keyboardSelectedDaySelector}`,
        )
      : null);

  const focusKeyboardSelectedDay = () => {
    requestAnimationFrame(() => {
      const day = findKeyboardSelectedDay();
      if (!day) return;
      const scope =
        day.closest(".react-datepicker") ?? day.closest(".calendar");
      scope
        ?.querySelectorAll<HTMLElement>(".react-datepicker__day[tabindex]")
        .forEach((element) => {
          element.tabIndex = -1;
        });
      day.tabIndex = 0;
      day.focus({ preventScroll: true });
    });
  };
  const [pickerMonth, setPickerMonth] = useState(() =>
    dayjs(selected).startOf("month"),
  );

  const shownDateRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      pickerCursorRef.current = null;
      setPickerCursor(null);
      isGridFocusedRef.current = false;
      return;
    }
    calendarCloseRequestedRef.current = false;
    setPickerMonth(dayjs(selected).startOf("month"));
  }, [isOpen, selected]);

  useEffect(() => {
    if (isOpen) return;
    const input = containerRef.current?.querySelector("input");
    if (!input) return;
    // Closing the calendar (outside click, Escape) must not wipe a date the
    // user is still typing; blur commits or reverts it.
    const isDraft =
      input === document.activeElement &&
      shownDateRef.current === selected.getTime();
    if (isDraft) return;
    shownDateRef.current = selected.getTime();
    input.value = formatEventFormDateLabel(selected);
  }, [isOpen, selected]);

  const revertInput = (target: HTMLInputElement) => {
    target.value = formatEventFormDateLabel(selectedRef.current);
  };

  /**
   * Enter, Tab, and blur all land here: commit a typed date that changes the
   * day, quietly restore an emptied field, and explain anything unparseable.
   * The outcome tells Enter apart from the rest - a parseable date that is
   * already the committed one opens the calendar instead of committing.
   */
  const commitOrRevert = (
    target: HTMLInputElement,
  ): "committed" | "unchanged" | "rejected" => {
    const value = target.value.trim();
    const parsed = value ? parseUserDate(value, dayjs()) : null;
    if (parsed && !parsed.isSame(selectedRef.current, "day")) {
      const date = parsed.startOf("day").toDate();
      // Optimistic until the parent re-renders, so a blur right after Enter
      // doesn't commit the same draft twice.
      selectedRef.current = date;
      onCommit(date);
      return "committed";
    }
    if (value && !parsed) {
      showErrorToast(
        `Sorry, IDK what to do with a ${sideLabel} date of '${value}'. Try 10.17.26, 17.10.26, 10/17/2026, or 2026-10-17.`,
      );
    }
    revertInput(target);
    return parsed ? "unchanged" : "rejected";
  };

  const nudgeDays = (deltaDays: number) => {
    onCommit(dayjs(selectedRef.current).add(deltaDays, "day").toDate());
  };

  const pickFromOpenCalendar = (input: HTMLInputElement) => {
    const trimmed = input.value.trim();
    if (!trimmed && !pickerCursorRef.current) {
      revertInput(input);
      requestCalendarClose();
      return;
    }
    const parsed = trimmed ? parseUserDate(trimmed, dayjs()) : null;
    const showingCommitted =
      trimmed === formatEventFormDateLabel(selectedRef.current);
    const picked = (
      parsed && !showingCommitted
        ? parsed
        : (pickerCursorRef.current ?? dayjs(selectedRef.current))
    )
      .startOf("day")
      .toDate();
    selectedRef.current = picked;
    onCommit(picked);
    requestCalendarClose();
  };

  const handleOpenCalendarKeys = (
    event: React.KeyboardEvent,
    target: EventTarget | null,
  ) => {
    const input = containerRef.current?.querySelector("input");
    const isInputTarget = target instanceof HTMLInputElement;
    const isDayTarget =
      target instanceof HTMLElement &&
      target.classList.contains("react-datepicker__day");

    if (event.key === "Tab") {
      if (input instanceof HTMLInputElement) commitOrRevert(input);
      isGridFocusedRef.current = false;
      skipBlurCloseRef.current = true;
      requestCalendarClose();
      event.stopPropagation();
      return;
    }

    if (!isEventFormDateCalendarKey(event.key)) return;

    if (
      isInputTarget &&
      !isGridFocusedRef.current &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      return;
    }

    if (!isInputTarget && !isDayTarget && !isGridFocusedRef.current) return;

    consume(event);

    if (
      isInputTarget &&
      event.key === "ArrowDown" &&
      pickerCursorRef.current === null
    ) {
      const anchor = dayjs(selectedRef.current).startOf("day");
      setPickerCursorSync(anchor);
      isGridFocusedRef.current = true;
      focusKeyboardSelectedDay();
      return;
    }

    const action = calendarAction(event.key);

    switch (action.kind) {
      case "moveCursor": {
        const next = movePickerCursor(
          pickerCursorRef.current,
          selectedRef.current,
          action.days,
        );
        setPickerCursorSync(next);
        if (!next.isSame(pickerMonth, "month")) {
          setPickerMonth(next.startOf("month"));
        }
        isGridFocusedRef.current = true;
        focusKeyboardSelectedDay();
        break;
      }
      case "pickCursor":
        if (input instanceof HTMLInputElement) pickFromOpenCalendar(input);
        break;
      case "close":
        requestCalendarClose();
        isGridFocusedRef.current = false;
        input?.focus();
        break;
    }
  };

  const handleKeyDownCapture = (event: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    const target = event.target;

    if (isOpen) {
      handleOpenCalendarKeys(event, target);
      return;
    }

    if (!(target instanceof HTMLInputElement)) return;

    if (event.key === "Backspace") {
      event.stopPropagation();
      return;
    }

    if (!isEventFormDateFieldClosedKey(event.key)) {
      if (event.key === "Escape") {
        revertInput(target);
        event.stopPropagation();
      } else if (event.key === "Tab") {
        if (commitOrRevert(target) !== "committed") requestCalendarClose();
      }
      return;
    }

    const modKey = hasCommandModifier(event);
    const closedAction = closedFieldAction(event.key, {
      shiftKey: event.shiftKey,
      modKey,
      text: target.value,
      committedDate: selectedRef.current,
    });

    if (closedAction.kind === "ignore") {
      if (event.key === "Enter" && !modKey) {
        consume(event);
        commitOrRevert(target);
      }
      return;
    }

    consume(event);

    if (closedAction.kind === "openCalendar") {
      onCalendarOpen();
    } else if (closedAction.kind === "nudgeDays") {
      nudgeDays(closedAction.days);
    }
  };

  const { jumpId, resolvedInputId } = resolveFormControlJumpIds(id, inputId);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: stops date picker mouse events from bubbling to the form.
    <div
      ref={containerRef}
      className={`${DATE_FIELD_CLASSNAME} group/control ${isOpen ? "" : "group-focus-within/control:[&_.c-event-form-date-field__input]:pr-8"}`}
      id={jumpId}
      onBlur={(event) => {
        // react-datepicker skips onBlur while its calendar is open, so listen
        // on the wrapper. Moving into the calendar is not leaving the field.
        const next = event.relatedTarget;
        if (next instanceof Element && next.closest(".react-datepicker"))
          return;
        if (isOpen) {
          isGridFocusedRef.current = false;
          if (skipBlurCloseRef.current) {
            skipBlurCloseRef.current = false;
          } else {
            requestCalendarClose();
          }
        }
        if (event.target instanceof HTMLInputElement) {
          commitOrRevert(event.target);
        }
      }}
      onMouseDown={stopPropagation}
      onMouseUp={stopPropagation}
      tabIndex={-1}
      onKeyDownCapture={handleKeyDownCapture}
    >
      <DatePicker
        calendarClassName={calendarClassName}
        captionPicker
        dateFormat={EVENT_FORM_DATE_INPUT_FORMAT}
        {...(resolvedInputId ? { inputId: resolvedInputId } : {})}
        inputClassName="c-event-form-date-field__input"
        isOpen={isOpen}
        monthTextClassName="text-medium"
        onCalendarClose={requestCalendarClose}
        onCalendarKeyDownCapture={(event) => {
          if (!isOpen) return;
          handleOpenCalendarKeys(event, event.target);
        }}
        onCalendarOpen={onCalendarOpen}
        onChange={() => null}
        headerEndContent={
          isOpen ? <EventFormCalendarPopoverHints /> : undefined
        }
        onInputClick={onCalendarOpen}
        onFocus={(event) => {
          if (event.target instanceof HTMLInputElement) {
            isGridFocusedRef.current = false;
            event.target.select();
          }
        }}
        onSelect={(date) => {
          if (!date) return;
          onCommit(date);
        }}
        openToDate={pickerMonth.toDate()}
        highlightDates={
          isOpen && pickerCursor
            ? [
                {
                  "react-datepicker__day--keyboard-selected": [
                    pickerCursor.toDate(),
                  ],
                },
              ]
            : undefined
        }
        preventOpenOnFocus
        selected={selected}
        title={title}
        view="grid"
        withUnderline={false}
      />
      <EventFormInfieldHint visible={!isOpen}>
        <EventFormHintKeys
          keys="ArrowDown"
          label="Arrow down opens the calendar"
        />
      </EventFormInfieldHint>
    </div>
  );
};
