import type React from "react";
import { useEffect, useRef, useState } from "react";
import { parseLifeDate } from "@core/life/life-math";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { DatePicker } from "@web/components/DatePicker/DatePicker";
import {
  consumeDatePickerKey,
  focusKeyboardSelectedDay,
} from "@web/components/DatePicker/date-picker-keyboard-dom.util";
import {
  consumeUiFocusTextInsertSuppress,
  shouldSuppressUiFocusTextInsert,
  stripTrailingLetter,
} from "@web/shortcuts/ui-focus/ui-focus-text-insert.util";
import {
  calendarAction,
  isEventFormDateCalendarKey,
  isEventFormDateFieldClosedKey,
  movePickerCursor,
} from "@web/views/Forms/EventForm/DateControlsSection/DateTimeSection/eventFormDateFieldKeys.util";
import { EventFormInfieldHint } from "@web/views/Forms/EventForm/EventFormFocusedHint";
import { LifeBirthDatePopoverHints } from "@web/views/Life/LifeBirthDatePopoverHints";
import {
  formatLifeBirthDatePreview,
  lifeBirthDateDraftPreview,
  lifeBirthDateGridAnchor,
  parseLifeBirthDateInput,
} from "@web/views/Life/parseLifeBirthDateInput.util";

const LIFE_BIRTH_INPUT_CLASSNAME =
  "c-life-input c-life-birth-date-field__input w-full max-w-44";

const calendarMonthCaptionSelector =
  '.lifeBirthDatePicker [aria-label="Choose month and year"]';

const readOpenCalendarMonthLabel = (): string | null =>
  document.querySelector(calendarMonthCaptionSelector)?.textContent?.trim() ??
  null;

export interface LifeBirthDateFieldProps {
  id: string;
  isOpen: boolean;
  maxDate: Date;
  minDate: Date;
  onCalendarClose: () => void;
  onCalendarOpen: () => void;
  onCommit: (date: Date | null) => void;
  storedBirthDate: string;
  today: Date;
}

export function LifeBirthDateField({
  id,
  isOpen,
  maxDate,
  minDate,
  onCalendarClose,
  onCalendarOpen,
  onCommit,
  storedBirthDate,
  today,
}: LifeBirthDateFieldProps) {
  const todayDayjs = dayjs(today);
  const committedDate = parseLifeDate(storedBirthDate);
  const committedRef = useRef(committedDate);
  committedRef.current = committedDate;

  const containerRef = useRef<HTMLDivElement>(null);
  const calendarCloseRequestedRef = useRef(false);
  const requestCalendarClose = () => {
    if (calendarCloseRequestedRef.current) return;
    calendarCloseRequestedRef.current = true;
    onCalendarClose();
  };

  const [pickerMonth, setPickerMonth] = useState(() =>
    dayjs(committedDate ?? today).startOf("month"),
  );
  const pickerMonthRef = useRef(pickerMonth);
  const syncPickerMonth = (next: Dayjs) => {
    const month = next.startOf("month");
    pickerMonthRef.current = month;
    setPickerMonth(month);
  };

  const [pickerCursor, setPickerCursor] = useState<Dayjs | null>(null);
  const pickerCursorRef = useRef<Dayjs | null>(null);
  const [gridFocused, setGridFocused] = useState(false);
  const isGridFocusedRef = useRef(false);
  const setGridFocusedSync = (next: boolean) => {
    isGridFocusedRef.current = next;
    setGridFocused(next);
  };
  const setPickerCursorSync = (next: Dayjs | null) => {
    pickerCursorRef.current = next;
    setPickerCursor(next);
  };

  const [draftText, setDraftText] = useState("");
  const shownDateRef = useRef<number | null>(null);
  const draftParseKeyRef = useRef("");
  const [monthNudgeTick, setMonthNudgeTick] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reopen picks month from input parse or committed date.
  useEffect(() => {
    if (!isOpen) {
      pickerCursorRef.current = null;
      setPickerCursor(null);
      setGridFocusedSync(false);
      return;
    }
    calendarCloseRequestedRef.current = false;
    const inputValue =
      containerRef.current?.querySelector("input")?.value.trim() ?? "";
    const anchor = lifeBirthDateGridAnchor(
      parseLifeBirthDateInput(inputValue, parseOptions),
    );
    if (anchor) {
      applyGridAnchor(anchor);
      return;
    }
    syncPickerMonth(dayjs(committedRef.current ?? today));
  }, [isOpen, today]);

  useEffect(() => {
    committedRef.current = parseLifeDate(storedBirthDate);
  }, [storedBirthDate]);

  useEffect(() => {
    if (isOpen) return;
    const input = containerRef.current?.querySelector("input");
    if (!input) return;
    const committed = committedRef.current;
    const isDraft =
      input === document.activeElement &&
      committed &&
      shownDateRef.current === committed.getTime();
    if (isDraft) return;
    shownDateRef.current = committed?.getTime() ?? null;
    input.value = committed ? formatLifeBirthDatePreview(committed) : "";
    setDraftText("");
  }, [isOpen]);

  const parseOptions = {
    today: todayDayjs,
    minDate,
    maxDate,
  };

  const draftParse = parseLifeBirthDateInput(draftText, parseOptions);

  const applyGridAnchor = (anchor: { month: Dayjs; cursor: Dayjs }) => {
    setPickerCursorSync(anchor.cursor);
    if (!anchor.month.isSame(pickerMonthRef.current, "month")) {
      syncPickerMonth(anchor.month);
      setMonthNudgeTick((tick) => tick + 1);
    }
  };

  const syncGridFromDraft = () => {
    const anchor = lifeBirthDateGridAnchor(draftParse);
    if (!anchor) return;
    applyGridAnchor(anchor);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: draftParse identity tracks typed parse results.
  useEffect(() => {
    const key =
      draftParse.kind === "date"
        ? `date:${draftParse.date.getTime()}`
        : draftParse.kind === "year"
          ? `year:${draftParse.year}`
          : "";
    if (key === draftParseKeyRef.current) return;
    draftParseKeyRef.current = key;
    if (!key) return;
    syncGridFromDraft();
  }, [draftParse]);

  useEffect(() => {
    if (!isOpen || monthNudgeTick === 0) return;

    const targetLabel = pickerMonthRef.current.format("MMM YYYY");
    let attempts = 0;
    let cancelled = false;

    const step = () => {
      if (cancelled || attempts++ > 24) return;
      const label = readOpenCalendarMonthLabel();
      if (label === targetLabel) return;

      const current = label ? dayjs(label, "MMM YYYY") : null;
      if (!current?.isValid()) return;

      const delta = pickerMonthRef.current.diff(current, "month");
      if (delta === 0) return;

      const navLabel = delta > 0 ? "Next month" : "Previous month";
      document
        .querySelector(".calendar.lifeBirthDatePicker")
        ?.querySelector<HTMLButtonElement>(`button[aria-label="${navLabel}"]`)
        ?.click();
      requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
    return () => {
      cancelled = true;
    };
  }, [isOpen, monthNudgeTick]);

  const revertInput = (target: HTMLInputElement) => {
    const committed = committedRef.current;
    target.value = committed ? formatLifeBirthDatePreview(committed) : "";
    setDraftText("");
    draftParseKeyRef.current = "";
  };

  const commitParsedDate = (date: Date) => {
    committedRef.current = date;
    shownDateRef.current = date.getTime();
    onCommit(date);
    setDraftText("");
    draftParseKeyRef.current = "";
  };

  const openCalendar = () => {
    onCalendarOpen();
  };

  const openCalendarFromInput = (input: HTMLInputElement) => {
    setDraftText(input.value);
    const parsed = parseLifeBirthDateInput(input.value.trim(), parseOptions);
    const anchor = lifeBirthDateGridAnchor(parsed);
    if (anchor) {
      applyGridAnchor(anchor);
      setGridFocusedSync(true);
    }
    openCalendar();
    if (anchor) focusKeyboardSelectedDay("lifeBirthDatePicker");
  };

  const commitOrRevert = (
    target: HTMLInputElement,
  ): "committed" | "unchanged" | "rejected" | "year" => {
    const value = target.value.trim();
    if (!value && committedRef.current) {
      revertInput(target);
      return "unchanged";
    }
    if (shouldSuppressUiFocusTextInsert("i") && value.endsWith("i")) {
      stripTrailingLetter(target, "i");
    }
    setDraftText(target.value);
    const committed = committedRef.current;
    if (committed && value === formatLifeBirthDatePreview(committed)) {
      return "unchanged";
    }

    const parsed = parseLifeBirthDateInput(value, parseOptions);

    if (parsed.kind === "empty") {
      onCommit(null);
      setDraftText("");
      draftParseKeyRef.current = "";
      return "committed";
    }
    if (parsed.kind === "year") {
      const anchor = lifeBirthDateGridAnchor(parsed);
      if (anchor) applyGridAnchor(anchor);
      return "year";
    }
    if (parsed.kind === "invalid") {
      revertInput(target);
      return "rejected";
    }
    if (
      committedRef.current &&
      parsed.date.getTime() === committedRef.current.getTime()
    ) {
      return "unchanged";
    }
    commitParsedDate(parsed.date);
    return "committed";
  };

  const pickFromOpenCalendar = (input: HTMLInputElement) => {
    const trimmed = input.value.trim();
    const parsed = trimmed
      ? parseLifeBirthDateInput(trimmed, parseOptions)
      : null;
    const picked =
      parsed?.kind === "date"
        ? dayjs(parsed.date)
        : (pickerCursorRef.current ??
          dayjs(committedRef.current ?? today).startOf("day"));
    commitParsedDate(picked.startOf("day").toDate());
    requestCalendarClose();
  };

  const stepCalendarMonth = (deltaMonths: number) => {
    const label = deltaMonths < 0 ? "Previous month" : "Next month";
    document
      .querySelector(".calendar.lifeBirthDatePicker")
      ?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
      ?.click();
    syncPickerMonth(pickerMonthRef.current.add(deltaMonths, "month"));
  };

  const stepCalendarYear = (deltaYears: number) => {
    syncPickerMonth(pickerMonthRef.current.add(deltaYears, "year"));
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
      setGridFocusedSync(false);
      requestCalendarClose();
      event.stopPropagation();
      return;
    }

    if (event.key === "PageDown") {
      consumeDatePickerKey(event);
      if (event.shiftKey) stepCalendarYear(1);
      else stepCalendarMonth(1);
      return;
    }
    if (event.key === "PageUp") {
      consumeDatePickerKey(event);
      if (event.shiftKey) stepCalendarYear(-1);
      else stepCalendarMonth(-1);
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

    consumeDatePickerKey(event);

    if (
      isInputTarget &&
      event.key === "ArrowDown" &&
      pickerCursorRef.current === null
    ) {
      syncGridFromDraft();
      const anchor =
        pickerCursorRef.current ??
        dayjs(committedRef.current ?? today).startOf("day");
      setPickerCursorSync(anchor);
      setGridFocusedSync(true);
      focusKeyboardSelectedDay("lifeBirthDatePicker");
      return;
    }

    const action = calendarAction(event.key);
    switch (action.kind) {
      case "moveCursor": {
        const next = movePickerCursor(
          pickerCursorRef.current,
          committedRef.current ?? today,
          action.days,
        );
        setPickerCursorSync(next);
        if (!next.isSame(pickerMonthRef.current, "month")) {
          syncPickerMonth(next);
        }
        setGridFocusedSync(true);
        focusKeyboardSelectedDay("lifeBirthDatePicker");
        break;
      }
      case "pickCursor":
        if (input instanceof HTMLInputElement) pickFromOpenCalendar(input);
        break;
      case "close":
        requestCalendarClose();
        setGridFocusedSync(false);
        input?.focus();
        break;
    }
  };

  const handleKeyDownCapture = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (consumeUiFocusTextInsertSuppress(event.key)) {
      consumeDatePickerKey(event);
      return;
    }

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
        commitOrRevert(target);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      consumeDatePickerKey(event);
      openCalendarFromInput(target);
      return;
    }

    if (event.key === "Enter") {
      consumeDatePickerKey(event);
      const outcome = commitOrRevert(target);
      if (outcome === "unchanged" || outcome === "year") {
        openCalendarFromInput(target);
      }
    }
  };

  const draftTrimmed = draftText.trim();
  const previewLine = lifeBirthDateDraftPreview(draftParse, draftTrimmed);

  const previewIsError = draftParse.kind === "invalid" && draftTrimmed !== "";

  const popoverHintMode = gridFocused ? "grid" : "typing";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: keyboard routing for the birth-date field matches EventFormDateField.
    <div
      ref={containerRef}
      className="c-life-birth-date-field flex w-full max-w-44 flex-col items-center gap-1"
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Element && next.closest(".react-datepicker"))
          return;
        if (isOpen) {
          setGridFocusedSync(false);
          requestCalendarClose();
        }
        if (event.target instanceof HTMLInputElement) {
          commitOrRevert(event.target);
        }
      }}
      onKeyDownCapture={handleKeyDownCapture}
    >
      <p
        aria-live="polite"
        className={`h-4 w-full shrink-0 truncate text-xs leading-4 ${
          previewIsError ? "text-danger" : "text-text-muted"
        }`}
        data-testid="life-birth-date-preview"
        title={previewLine || undefined}
      >
        {previewLine || "\u00a0"}
      </p>
      <div className="group/control relative w-full">
        <DatePicker
          aria-label="Date of birth"
          calendarClassName="lifeBirthDatePicker"
          captionPicker
          dateFormat="MMM d, yyyy"
          headerEndContent={
            isOpen
              ? ({ captionView }) => (
                  <LifeBirthDatePopoverHints
                    mode={
                      captionView === "year"
                        ? "year"
                        : captionView === "month"
                          ? "month"
                          : popoverHintMode
                    }
                  />
                )
              : undefined
          }
          id={id}
          inputClassName={LIFE_BIRTH_INPUT_CLASSNAME}
          isClearable
          isOpen={isOpen}
          maxDate={maxDate}
          minDate={minDate}
          onCalendarClose={requestCalendarClose}
          onCalendarKeyDownCapture={(event) => {
            if (!isOpen) return;
            handleOpenCalendarKeys(event, event.target);
          }}
          onCalendarOpen={onCalendarOpen}
          onChange={(date) => {
            if (!date) onCommit(null);
          }}
          onFocus={(event) => {
            if (event.target instanceof HTMLInputElement) {
              setGridFocusedSync(false);
              event.target.select();
            }
          }}
          onInputClick={onCalendarOpen}
          onMonthChange={(date) => {
            syncPickerMonth(dayjs(date));
          }}
          onSelect={(date, event) => {
            if (!date || !isOpen) return;
            const target = event?.target;
            if (
              !(target instanceof HTMLElement) ||
              !target.classList.contains("react-datepicker__day")
            ) {
              return;
            }
            commitParsedDate(date);
          }}
          onChangeRaw={(event) => {
            if (event.type === "click") return;
            setDraftText(event.currentTarget.value);
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
          placeholderText="Select date"
          preventOpenOnFocus
          selected={committedDate ?? undefined}
          title="Date of birth"
          view="grid"
          withTodayButton={false}
          withUnderline={false}
        />
        <EventFormInfieldHint
          testId="life-birth-date-field-hint"
          visible={!isOpen}
        >
          <LifeBirthDatePopoverHints mode="closed" />
        </EventFormInfieldHint>
      </div>
    </div>
  );
}
