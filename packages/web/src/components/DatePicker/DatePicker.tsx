import classNames from "classnames";
import type React from "react";
import { useEffect, useId, useRef } from "react";
import * as ReactDatePickerModule from "react-datepicker";
import { type ReactDatePickerProps } from "react-datepicker";
import dayjs from "@core/util/date/dayjs";
import { darken, isDark } from "@web/common/styles/color.utils";
import { colors, lightColors } from "@web/common/styles/colors";
import { type CSSVariables } from "@web/common/styles/css.types";
import { theme } from "@web/common/styles/theme";
import { MonthNavButton } from "@web/components/DatePicker/MonthNavButton";
import { ChevronLeftIcon } from "@web/components/Icons/ChevronLeftIcon";
import { ChevronRightIcon } from "@web/components/Icons/ChevronRightIcon";
import { selectTheme, useThemeStore } from "@web/settings/theme/theme.store";
import { useFloatingLayer } from "@web/shortcuts/floating-layer";
import { Focusable, INPUT_RESET_CLASSNAME } from "../Focusable/Focusable";
import { CircleIcon } from "../Icons/CircleIcon";
import { TooltipWrapper } from "../Tooltip/TooltipWrapper";

export interface Props extends Omit<ReactDatePickerProps, "autoFocus"> {
  animationOnToggle?: boolean;
  bgColor?: string;
  headerActionsClassName?: string;
  headerClassName?: string;
  headerEndContent?: React.ReactNode;
  inputClassName?: string;
  inputColor?: string;
  isOpen?: boolean;
  monthTextClassName?: string;
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

export const DatePicker: React.FC<Props> = (datePickerProps) => {
  const {
    animationOnToggle = true,
    bgColor,
    calendarClassName,
    headerActionsClassName,
    headerClassName,
    headerEndContent,
    inputClassName,
    inputColor,
    isOpen = true,
    monthTextClassName,
    monthNav,
    withUnderline = true,
    portalId = "root",
    view,
    withTodayButton = true,
    ...props
  } = datePickerProps;
  const layerId = useId();
  const calendarRef = useRef<HTMLDivElement>(null);
  const onCalendarCloseRef = useRef(datePickerProps.onCalendarClose);
  onCalendarCloseRef.current = datePickerProps.onCalendarClose;
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
  const datePickerStyle: CSSVariables = {
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

  // react-datepicker paints z-index via popperClassName on the positioned
  // node (popperProps.style is ignored by react-popper). "!z-22" equals
  // Z_INDEX_FLOATING_MENU; keep the literal static so Tailwind can see it.
  return (
    <ReactDatePicker
      popperClassName="!z-22"
      calendarClassName={classNames("calendar", calendarClassName, {
        "calendar--open": isOpen,
        "calendar--animation": animationOnToggle,
      })}
      calendarContainer={({ children, className }) => (
        <div
          ref={calendarRef}
          className={classNames("c-date-picker", className)}
          data-dark={usesThemeText ? "true" : "false"}
          data-view={view}
          style={datePickerStyle}
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
        />
      }
      dateFormat={"M-d-yyyy"}
      formatWeekDay={(day) => day[0]}
      open={isOpen}
      {...props}
      // Close the picker when the user clicks away (react-datepicker has no
      // onCalendarClose for outside-clicks). onCalendarOpen/onCalendarClose/
      // onSelect flow straight through {...props}. Kept as a fallback for
      // contexts where bubble-phase delivery still reaches document.
      onClickOutside={() => {
        datePickerProps.onCalendarClose?.();
      }}
      portalId={portalId}
      showPopperArrow={false}
      renderCustomHeader={(headerProps) => {
        const { customHeaderCount, monthDate } = headerProps;
        const selectedMonth = dayjs(monthDate).format("MMM YYYY");
        const currentMonth = dayjs().format("MMM YYYY");

        return (
          <div
            className={classNames(
              "flex items-center px-2 pt-0 pb-1.25",
              headerClassName,
            )}
          >
            <div className={classNames("w-16 items-start")}>
              <span
                className={classNames("relative", monthTextClassName)}
                style={{ color: headerColor }}
              >
                {selectedMonth}
              </span>
            </div>

            {!customHeaderCount && (
              <div
                className={classNames(
                  "flex items-center",
                  headerActionsClassName,
                )}
              >
                <div className="flex items-center gap-1">
                  <MonthNavButton
                    ariaLabel="Previous month"
                    color={headerColor}
                    isSidebarStyle={view === "sidebar"}
                    onClick={
                      monthNav?.onPrev ?? (() => headerProps.decreaseMonth())
                    }
                    shortcut={monthNav ? [...monthNav.prevShortcut] : undefined}
                  >
                    <ChevronLeftIcon />
                  </MonthNavButton>
                  <MonthNavButton
                    ariaLabel="Next month"
                    color={headerColor}
                    isSidebarStyle={view === "sidebar"}
                    onClick={
                      monthNav?.onNext ?? (() => headerProps.increaseMonth())
                    }
                    shortcut={monthNav ? [...monthNav.nextShortcut] : undefined}
                  >
                    <ChevronRightIcon />
                  </MonthNavButton>
                </div>
                {withTodayButton && (
                  <TooltipWrapper
                    description={currentMonth}
                    shortcut={view === "sidebar" ? "T" : undefined}
                  >
                    <button
                      type="button"
                      aria-label="Go to this month"
                      className={classNames(
                        "flex h-6 w-6 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-text/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                        currentMonth === selectedMonth && "invisible",
                      )}
                      style={{ color: headerColor }}
                      onClick={
                        monthNav?.onToday ??
                        (() => {
                          headerProps.changeMonth(dayjs().month());
                          headerProps.changeYear(dayjs().year());
                        })
                      }
                    >
                      <CircleIcon />
                    </button>
                  </TooltipWrapper>
                )}
              </div>
            )}
            {!customHeaderCount && headerEndContent ? (
              <div className="ml-auto flex items-center">
                {headerEndContent}
              </div>
            ) : null}
          </div>
        );
      }}
    />
  );
};
