import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import {
  type Modifier,
  type ModifierArguments,
  type Obj,
} from "@popperjs/core";
import classNames from "classnames";
import type React from "react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import * as ReactDatePickerModule from "react-datepicker";
import { type ReactDatePickerProps } from "react-datepicker";
import dayjs from "@core/util/date/dayjs";
import { darken, isDark } from "@web/common/styles/color.utils";
import { colors, lightColors } from "@web/common/styles/colors";
import { type CSSVariables } from "@web/common/styles/css.types";
import { theme } from "@web/common/styles/theme";
import {
  CAPTION_YEARS_PER_PAGE,
  reactDatepickerYearPageBounds,
  shiftYearPageBounds,
  type YearPageBounds,
  yearRangeCaptionFromBounds,
} from "@web/components/DatePicker/caption-picker-year-page";
import { MonthNavButton } from "@web/components/DatePicker/MonthNavButton";
import { ChevronLeftIcon } from "@web/components/Icons/ChevronLeftIcon";
import { ChevronRightIcon } from "@web/components/Icons/ChevronRightIcon";
import {
  MONTH_PICKER_CURRENT_KEYCAPS,
  MONTH_PICKER_NEXT_KEYCAPS,
  MONTH_PICKER_PREV_KEYCAPS,
  useMonthPickerShortcuts,
} from "@web/components/Sidebar/MonthPicker/useMonthPickerShortcuts";
import { selectTheme, useThemeStore } from "@web/settings/theme/theme.store";
import {
  isFloatingLayerOpen,
  useFloatingLayer,
} from "@web/shortcuts/floating-layer";
import { Focusable, INPUT_RESET_CLASSNAME } from "../Focusable/Focusable";
import { CircleIcon } from "../Icons/CircleIcon";
import { TooltipWrapper } from "../Tooltip/TooltipWrapper";

export type CaptionPickerView = "day" | "year" | "month";

export interface Props extends Omit<ReactDatePickerProps, "autoFocus"> {
  animationOnToggle?: boolean;
  bgColor?: string;
  headerActionsClassName?: string;
  headerClassName?: string;
  headerEndContent?:
    | React.ReactNode
    | ((context: { captionView: CaptionPickerView }) => React.ReactNode);
  /** Capture-phase keyboard handler on the popper calendar root (grid popovers portal here). */
  onCalendarKeyDownCapture?: React.KeyboardEventHandler<HTMLDivElement>;
  /** Fires when `captionPicker` moves between day grid, month list, and year list. */
  onCaptionViewChange?: (view: CaptionPickerView) => void;
  /** Focus moved to or from the text field (not the portaled calendar). */
  onPickerInputFocus?: () => void;
  onPickerInputBlur?: () => void;
  inputClassName?: string;
  inputColor?: string;
  isOpen?: boolean;
  monthTextClassName?: string;
  /** Grid popovers: click the caption to jump through year then month grids. */
  captionPicker?: boolean;
  /**
   * Sidebar-only: hover keycaps on the month chevrons, plus optional
   * overrides so the owner can move its own cursor instead of letting
   * react-datepicker step its internal month (MonthPicker remounts the grid
   * on those jumps to keep a focusable day in the new month).
   */
  monthNav?: {
    prevShortcut: readonly string[];
    nextShortcut: readonly string[];
    onPrev?: () => void;
    onNext?: () => void;
    onToday?: () => void;
  };
  withUnderline?: boolean;
  view: "sidebar" | "grid";
  withTodayButton?: boolean;
}

type ReactDatePickerComponent = typeof ReactDatePickerModule.default;

// Bun's __toESM(mod, nodeInterop=1) can wrap CJS+__esModule modules so
// .default points at the whole export object. Unwrap one level to reach the
// actual component function.
const reactDatePickerExport =
  ReactDatePickerModule.default as ReactDatePickerComponent & {
    default?: ReactDatePickerComponent;
  };
const ReactDatePicker = reactDatePickerExport.default ?? reactDatePickerExport;

/** Caption picker walks year, then month, then back to the day grid. */
const CAPTION_VIEW_AFTER_SELECT: Record<
  CaptionPickerView,
  CaptionPickerView | null
> = { year: "month", month: "day", day: null };

/**
 * Caps popper max-height to the space between the anchor and the viewport edge.
 * The calendar shell can be taller than the viewport, so without this Popper
 * never flips and the panel extends past the fold (Life constrained-height E2E).
 */
const capGridPopperMaxHeight: Modifier<"capGridPopperMaxHeight", Obj> = {
  name: "capGridPopperMaxHeight",
  enabled: true,
  /** Run before rects so flip/preventOverflow see the capped height. */
  phase: "read",
  fn({ state }: ModifierArguments<Obj>) {
    const el = state.elements.popper;
    if (!(el instanceof HTMLElement)) return;

    const ref = state.rects.reference;
    const placement = state.placement;
    const pad = 8;
    const min = 80;
    const bottomSpace = Math.max(
      0,
      window.innerHeight - ref.y - ref.height - pad,
    );
    const topSpace = Math.max(0, ref.y - pad);
    const maxH = placement.startsWith("top")
      ? Math.max(min, topSpace)
      : Math.max(min, bottomSpace);

    el.style.maxHeight = `${maxH}px`;
  },
};

/**
 * Grid poppers: keep the calendar inside the viewport on short windows so the
 * last week row and focus outline are not clipped below the fold (Life/E2E).
 * Sidebar pickers use their own layout; do not override Popper there.
 */
const GRID_POPPER_MODIFIERS: ReadonlyArray<Partial<Modifier<string, Obj>>> = [
  capGridPopperMaxHeight,
  {
    name: "flip",
    options: {
      boundary: "viewport",
      fallbackPlacements: ["top-start", "top", "bottom-start", "bottom"],
    },
  },
  {
    name: "preventOverflow",
    options: {
      boundary: "viewport",
      padding: 8,
    },
  },
];

export const DatePicker: React.FC<Props> = (datePickerProps) => {
  const {
    animationOnToggle = true,
    bgColor,
    captionPicker = false,
    calendarClassName,
    headerActionsClassName,
    headerClassName,
    headerEndContent,
    onCalendarKeyDownCapture,
    onCaptionViewChange,
    onPickerInputFocus,
    onPickerInputBlur,
    inputClassName,
    inputColor,
    isOpen = true,
    monthTextClassName,
    monthNav,
    withUnderline = true,
    portalId = "root",
    view,
    withTodayButton = true,
    onFocus: onFocusProp,
    onBlur: onBlurProp,
    ...props
  } = datePickerProps;
  const layerId = useId();
  const calendarRef = useRef<HTMLDivElement>(null);
  const onCalendarCloseRef = useRef(datePickerProps.onCalendarClose);
  onCalendarCloseRef.current = datePickerProps.onCalendarClose;
  // react-datepicker fires onSelect and onChange in the same tick, so the new
  // view has to be readable before React re-renders. The ref is that read
  // path and `commitCaptionView` is the only writer of the pair.
  const [captionView, setCaptionView] = useState<CaptionPickerView>("day");
  const captionViewRef = useRef<CaptionPickerView>("day");
  const commitCaptionView = useCallback((next: CaptionPickerView) => {
    captionViewRef.current = next;
    setCaptionView(next);
  }, []);
  const [captionFocusDate, setCaptionFocusDate] = useState<Date | undefined>();
  /** Visible year cells; react-datepicker does not move `monthDate` with paging. */
  const [yearPageBounds, setYearPageBounds] = useState<YearPageBounds | null>(
    null,
  );
  useEffect(() => {
    if (isOpen) return;
    commitCaptionView("day");
    setCaptionFocusDate(undefined);
    setYearPageBounds(null);
  }, [commitCaptionView, isOpen]);

  useEffect(() => {
    onCaptionViewChange?.(captionView);
  }, [captionView, onCaptionViewChange]);
  // Sidebar month grid stays mounted and visible; only transient grid popovers
  // own Escape (same carve-out the old DOM probe encoded via Month picker).
  useFloatingLayer(`datePicker:${layerId}`, view === "grid" && isOpen);
  // EventForm (and similar shells) stop mousedown bubbling so grid clicks
  // underneath don't fire. That also blocks react-datepicker's document
  // bubble-phase outside-click listener. Capture-phase closes grid popovers
  // even when a parent calls stopPropagation.
  useEffect(() => {
    if (view !== "grid" || !isOpen) return;

    const onMouseDownCapture = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (calendarRef.current?.contains(target)) return;

      const input = document.querySelector(
        `[data-datepicker-input="${CSS.escape(layerId)}"]`,
      );
      if (input?.contains(target)) return;

      onCalendarCloseRef.current?.();
    };

    document.addEventListener("mousedown", onMouseDownCapture, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDownCapture, true);
    };
  }, [isOpen, layerId, view]);
  const isDarkTheme = useThemeStore(selectTheme) === "dark-abyss";
  const resolvedBgColor =
    bgColor ?? (isDarkTheme ? colors.background : lightColors.background);
  const datePickerStyle: CSSVariables & CSSProperties = {
    // Grid (popover) pickers read as an elevated surface a step above the app
    // background; the sidebar picker overrides this to transparent in CSS.
    "--date-picker-bg": bgColor ?? "var(--surface)",
  };
  const isDarkBackground = isDark(resolvedBgColor);
  // When the picker bg has the same polarity as the theme's surfaces, the
  // theme's standard --text already contrasts with it; a mismatched bg (e.g.
  // the light event-fill picker on the dark theme) needs --on-accent, the
  // token that flips polarity. The CSS keys off this via data-dark="true"|"false".
  const usesThemeText = isDarkBackground === isDarkTheme;
  const headerColor =
    view === "sidebar"
      ? "var(--text-muted)"
      : usesThemeText
        ? "var(--text)"
        : "var(--on-accent)";

  const isCaptionYearView = captionPicker && captionView === "year";
  const isCaptionMonthView = captionPicker && captionView === "month";
  const isCaptionDayGrid = !isCaptionYearView && !isCaptionMonthView;
  const shouldCommitSelection = !captionPicker || captionView === "day";

  const monthStepHandlersRef = useRef({
    onPrev: () => {},
    onNext: () => {},
    onGoToThisMonth: undefined as (() => void) | undefined,
  });

  const gridMonthNavShortcuts = captionPicker && view === "grid";
  const sidebarMonthNavShortcuts = Boolean(monthNav);
  const monthNavShortcutsEnabled =
    isOpen &&
    isCaptionDayGrid &&
    (gridMonthNavShortcuts ||
      (sidebarMonthNavShortcuts && !isFloatingLayerOpen()));

  const canGoToThisMonthInPicker =
    (view === "sidebar" && monthNav?.onToday !== undefined) ||
    (withTodayButton && gridMonthNavShortcuts);

  useMonthPickerShortcuts({
    enabled: monthNavShortcutsEnabled,
    onPrevMonth: () => {
      monthStepHandlersRef.current.onPrev();
    },
    onNextMonth: () => {
      monthStepHandlersRef.current.onNext();
    },
    onGoToThisMonth: canGoToThisMonthInPicker
      ? () => {
          monthStepHandlersRef.current.onGoToThisMonth?.();
        }
      : undefined,
  });

  const monthChevronShortcuts =
    monthNav != null
      ? {
          prev: monthNav.prevShortcut,
          next: monthNav.nextShortcut,
        }
      : gridMonthNavShortcuts && monthNavShortcutsEnabled
        ? {
            prev: MONTH_PICKER_PREV_KEYCAPS,
            next: MONTH_PICKER_NEXT_KEYCAPS,
          }
        : null;

  const handleCalendarClose = () => {
    commitCaptionView("day");
    setCaptionFocusDate(undefined);
    setYearPageBounds(null);
    datePickerProps.onCalendarClose?.();
  };

  const openCaptionPicker = () => {
    const selectedDate = datePickerProps.selected;
    const anchor =
      selectedDate instanceof Date && !Number.isNaN(selectedDate.getTime())
        ? selectedDate
        : new Date();
    setCaptionFocusDate(anchor);
    setYearPageBounds(
      reactDatepickerYearPageBounds(
        dayjs(anchor).year(),
        CAPTION_YEARS_PER_PAGE,
      ),
    );
    commitCaptionView("year");
  };

  const stepYearPage = (
    headerProps: Parameters<
      NonNullable<ReactDatePickerProps["renderCustomHeader"]>
    >[0],
    direction: -1 | 1,
  ) => {
    if (direction < 0) {
      headerProps.decreaseYear();
    } else {
      headerProps.increaseYear();
    }
    setYearPageBounds((current) => {
      const anchorYear = dayjs(headerProps.monthDate).year();
      const base =
        current ??
        reactDatepickerYearPageBounds(anchorYear, CAPTION_YEARS_PER_PAGE);
      return shiftYearPageBounds(base, direction, CAPTION_YEARS_PER_PAGE);
    });
  };

  const handleChange: ReactDatePickerProps["onChange"] = (date, event) => {
    if (captionPicker && captionViewRef.current !== "day") return;
    datePickerProps.onChange?.(date, event);
  };

  const handleSelect: ReactDatePickerProps["onSelect"] = (date, event) => {
    const nextCaptionView =
      captionPicker && date
        ? CAPTION_VIEW_AFTER_SELECT[captionViewRef.current]
        : null;
    if (nextCaptionView) {
      commitCaptionView(nextCaptionView);
      return;
    }
    datePickerProps.onSelect?.(date, event);
  };

  // react-datepicker paints z-index via popperClassName on the positioned
  // node (popperProps.style is ignored by react-popper). "!z-22" equals
  // Z_INDEX_FLOATING_MENU; keep the literal static so Tailwind can see it.
  return (
    <ReactDatePicker
      popperClassName={classNames(
        "!z-22",
        view === "grid" && "c-date-picker-popper-grid",
      )}
      calendarClassName={classNames("calendar", calendarClassName, {
        "calendar--open": isOpen,
        "calendar--animation": animationOnToggle,
      })}
      calendarContainer={({ children, className }) => (
        <div
          ref={calendarRef}
          className={classNames("c-date-picker", className)}
          data-caption-view={captionPicker ? captionView : undefined}
          data-dark={usesThemeText ? "true" : "false"}
          data-view={view}
          style={datePickerStyle}
          onKeyDownCapture={onCalendarKeyDownCapture}
        >
          {children}
        </div>
      )}
      customInput={
        <Focusable
          Component="input"
          className={classNames(
            INPUT_RESET_CLASSNAME,
            "w-28 transition-colors duration-300",
            inputClassName,
          )}
          data-datepicker-input={layerId}
          style={{
            backgroundColor: inputColor,
            color: inputColor ? theme.getContrastText(inputColor) : undefined,
          }}
          underlineColor={darken(resolvedBgColor, -15)}
          withUnderline={withUnderline}
          onFocus={(event) => {
            onPickerInputFocus?.();
            onFocusProp?.(event as React.FocusEvent<HTMLInputElement, Element>);
          }}
          onBlur={(event) => {
            onPickerInputBlur?.();
            onBlurProp?.(event as React.FocusEvent<HTMLInputElement, Element>);
          }}
        />
      }
      dateFormat={"M-d-yyyy"}
      formatWeekDay={(day) => day[0]}
      open={isOpen}
      {...props}
      popperModifiers={
        view === "grid" ? GRID_POPPER_MODIFIERS : props.popperModifiers
      }
      openToDate={captionFocusDate ?? props.openToDate}
      onCalendarClose={handleCalendarClose}
      onChange={handleChange}
      onSelect={handleSelect}
      shouldCloseOnSelect={
        shouldCommitSelection ? props.shouldCloseOnSelect : false
      }
      showFourColumnMonthYearPicker={isCaptionMonthView}
      showMonthYearPicker={isCaptionMonthView}
      showYearPicker={isCaptionYearView}
      yearItemNumber={CAPTION_YEARS_PER_PAGE}
      // Close the picker when the user clicks away (react-datepicker has no
      // onCalendarClose for outside-clicks). onCalendarOpen/onCalendarClose/
      // onSelect flow straight through {...props}. Kept as a fallback for
      // contexts where bubble-phase delivery still reaches document.
      onClickOutside={() => {
        handleCalendarClose();
      }}
      portalId={portalId}
      showPopperArrow={false}
      renderCustomHeader={(headerProps) => {
        const { customHeaderCount, monthDate } = headerProps;
        const selectedMonth = dayjs(monthDate).format("MMM YYYY");
        const selectedYear = dayjs(monthDate).format("YYYY");
        const currentMonth = dayjs().format("MMM YYYY");
        const visibleYearPage =
          yearPageBounds ??
          reactDatepickerYearPageBounds(
            dayjs(monthDate).year(),
            CAPTION_YEARS_PER_PAGE,
          );
        const captionLabel = isCaptionYearView
          ? yearRangeCaptionFromBounds(visibleYearPage)
          : isCaptionMonthView
            ? `Select month, ${selectedYear}`
            : selectedMonth;
        const useYearNavigation = isCaptionYearView || isCaptionMonthView;
        const headerNav = useYearNavigation
          ? {
              onPrev: () => stepYearPage(headerProps, -1),
              onNext: () => stepYearPage(headerProps, 1),
              prevDisabled: headerProps.prevYearButtonDisabled,
              nextDisabled: headerProps.nextYearButtonDisabled,
              prevLabel: "Previous years",
              nextLabel: "Next years",
            }
          : {
              onPrev: monthNav?.onPrev ?? (() => headerProps.decreaseMonth()),
              onNext: monthNav?.onNext ?? (() => headerProps.increaseMonth()),
              prevDisabled: headerProps.prevMonthButtonDisabled,
              nextDisabled: headerProps.nextMonthButtonDisabled,
              prevLabel: "Previous month",
              nextLabel: "Next month",
            };

        const jumpToThisMonth =
          monthNav?.onToday ??
          (() => {
            headerProps.changeMonth(dayjs().month());
            headerProps.changeYear(dayjs().year());
          });
        monthStepHandlersRef.current = {
          onPrev: headerNav.onPrev,
          onNext: headerNav.onNext,
          // Same rule that decides whether the shortcut is offered at all;
          // spelling it twice let the two drift.
          onGoToThisMonth: canGoToThisMonthInPicker
            ? jumpToThisMonth
            : undefined,
        };

        const resolvedHeaderEndContent =
          typeof headerEndContent === "function"
            ? headerEndContent({ captionView })
            : headerEndContent;

        const captionBlock = (
          <div className="min-w-0 shrink-0 items-start">
            {captionPicker && captionView === "day" ? (
              <button
                type="button"
                aria-label="Choose month and year"
                className={classNames(
                  "relative inline-flex cursor-pointer items-center gap-0.5 rounded-sm border border-text/15 bg-text/5 px-1.5 py-0.5 text-left font-medium transition-colors hover:border-text/25 hover:bg-text/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  monthTextClassName,
                )}
                style={{ color: headerColor }}
                onClick={openCaptionPicker}
              >
                {selectedMonth}
                <CaretDownIcon aria-hidden size={12} weight="bold" />
              </button>
            ) : (
              <span
                className={classNames(
                  "relative font-medium",
                  monthTextClassName,
                )}
                style={{ color: headerColor }}
              >
                {captionLabel}
              </span>
            )}
          </div>
        );

        const navBlock = !customHeaderCount && (
          <div
            className={classNames(
              "flex shrink-0 items-center",
              headerActionsClassName,
            )}
          >
            <div className="flex items-center gap-1">
              <MonthNavButton
                ariaLabel={headerNav.prevLabel}
                color={headerColor}
                disabled={headerNav.prevDisabled}
                isSidebarStyle={view === "sidebar"}
                onClick={headerNav.prevDisabled ? undefined : headerNav.onPrev}
                shortcut={
                  monthChevronShortcuts
                    ? [...monthChevronShortcuts.prev]
                    : undefined
                }
                shortcutId={
                  monthChevronShortcuts ? "nav-month-prev" : undefined
                }
              >
                <ChevronLeftIcon />
              </MonthNavButton>
              <MonthNavButton
                ariaLabel={headerNav.nextLabel}
                color={headerColor}
                disabled={headerNav.nextDisabled}
                isSidebarStyle={view === "sidebar"}
                onClick={headerNav.nextDisabled ? undefined : headerNav.onNext}
                shortcut={
                  monthChevronShortcuts
                    ? [...monthChevronShortcuts.next]
                    : undefined
                }
                shortcutId={
                  monthChevronShortcuts ? "nav-month-next" : undefined
                }
              >
                <ChevronRightIcon />
              </MonthNavButton>
            </div>
            {withTodayButton && (
              <TooltipWrapper
                description="Go to this month"
                shortcut={
                  view === "sidebar"
                    ? [...MONTH_PICKER_CURRENT_KEYCAPS]
                    : undefined
                }
                shortcutId={
                  view === "sidebar" ? "nav-month-current" : undefined
                }
              >
                <button
                  type="button"
                  aria-label="Go to this month"
                  className={classNames(
                    "flex h-6 w-6 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-text/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    currentMonth === selectedMonth && "invisible",
                  )}
                  style={{ color: headerColor }}
                  onClick={jumpToThisMonth}
                >
                  <CircleIcon />
                </button>
              </TooltipWrapper>
            )}
          </div>
        );

        return (
          <div
            className={classNames(
              "flex w-full min-w-0 items-center justify-between gap-2 px-2 py-2",
              headerClassName,
            )}
          >
            {captionBlock}
            <div className="ml-auto flex min-w-0 items-center gap-2">
              {navBlock}
              {!customHeaderCount && resolvedHeaderEndContent
                ? resolvedHeaderEndContent
                : null}
            </div>
          </div>
        );
      }}
    />
  );
};
