import type React from "react";
import { useEffect, useId, useRef } from "react";
import { type CSSObjectWithLabel, type Props as RSProps } from "react-select";
import CreatableSelect from "react-select/creatable";
import { type SelectOption } from "@web/common/types/component.types";
import { type TimeOption } from "@web/common/types/util.types";
import {
  filterTimeOption,
  parseUserTime,
} from "@web/common/utils/datetime/web.date.util";
import { useFloatingLayer } from "@web/shortcuts/floating-layer";
import { resolveTimePickerSelection } from "./resolveTimePickerSelection";

export interface Props extends Omit<RSProps, "onChange" | "value"> {
  isMenuOpen: boolean;
  onChange: (option: SelectOption<string>) => void;
  options?: TimeOption[];
  selectClassName?: string;
  setIsMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  value: SelectOption<string>;
}

// react-select's default neutral80 is hsl(0,0%,20%) / #333. Class-based CSS
// in .c-time-picker loses to emotion style objects for these roles — same
// recipe as FreqSelect.
const themeColor =
  (cssVar: string) =>
  (base: CSSObjectWithLabel): CSSObjectWithLabel => ({
    ...base,
    color: cssVar,
  });

const timePickerTextStyles = {
  singleValue: themeColor("var(--text)"),
  input: themeColor("var(--text)"),
  placeholder: themeColor("var(--text-muted)"),
  option: (
    base: CSSObjectWithLabel,
    { isFocused, isSelected }: { isFocused: boolean; isSelected: boolean },
  ): CSSObjectWithLabel => ({
    ...base,
    color: isFocused ? "var(--on-accent)" : "var(--text)",
    backgroundColor: isFocused
      ? "var(--accent)"
      : isSelected
        ? "var(--surface-raised)"
        : "transparent",
  }),
};

const TIMEPICKER = "timepicker";

const MENU_NAV_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

function optionFromFocusedMenu(
  container: HTMLElement | null,
  options: TimeOption[] | undefined,
  currentValue: string | undefined,
): TimeOption | undefined {
  const combobox = container?.querySelector<HTMLElement>('[role="combobox"]');
  const activeId = combobox?.getAttribute("aria-activedescendant");
  const focusedEl = activeId
    ? document.getElementById(activeId)
    : container?.getElementsByClassName(`${TIMEPICKER}__option--is-focused`)[0];
  const focusedLabel = focusedEl?.textContent?.trim();
  if (!focusedLabel) return undefined;

  const listed = options?.find((option) => option.label === focusedLabel);
  if (listed) return listed;

  const created = parseUserTime(focusedLabel, currentValue);
  return created?.label === focusedLabel ? created : undefined;
}

export const TimePicker = ({
  isMenuOpen,
  onChange: _onChange,
  options,
  selectClassName,
  setIsMenuOpen,
  value,
  id,
  inputId,
  ...props
}: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const userAdjustedRef = useRef(false);
  const remapEnterRef = useRef(false);
  const layerId = useId();
  useFloatingLayer(`timePicker:${layerId}`, isMenuOpen);

  const { value: selectValue, options: selectOptions } =
    resolveTimePickerSelection(value, options);
  const parseInput = (input: string) => parseUserTime(input, value?.value);

  const cancelScrollToSelected = () => {
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
  };

  /** Menu options mount after open; wait for paint instead of a magic delay. */
  const scheduleScrollToSelected = () => {
    cancelScrollToSelected();
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        const defaultOpt = containerRef.current?.getElementsByClassName(
          `${TIMEPICKER}__option--is-selected`,
        )[0];
        defaultOpt?.scrollIntoView();
      });
    });
  };

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, []);

  const focusedMenuOption = () =>
    optionFromFocusedMenu(containerRef.current, selectOptions, value?.value);

  const commitFocusedOption = () => {
    if (!userAdjustedRef.current) return;
    const option = focusedMenuOption();
    if (option) _onChange(option);
  };

  // Jump ids live on this visible wrapper. react-select's dummy input is
  // often 2px (hidden behind the selected value), which fails the hold-Mod
  // hint-chip visibility check. `inputId` without a separate `id` is the
  // jump id; the actual input then gets `${inputId}-input`.
  const jumpId = id ?? inputId;
  const resolvedInputId = id
    ? inputId
    : inputId
      ? `${inputId}-input`
      : undefined;

  return (
    <div ref={containerRef} className="c-time-picker" id={jumpId}>
      <CreatableSelect
        {...props}
        inputId={resolvedInputId}
        className={selectClassName}
        classNamePrefix={TIMEPICKER}
        styles={timePickerTextStyles}
        value={selectValue}
        maxMenuHeight={4 * 41}
        blurInputOnSelect
        menuIsOpen={isMenuOpen}
        //@ts-expect-error uses custom onChange to manage focus in parent
        onChange={(option: SelectOption<string> | null) => {
          if (!option) return;
          // Enter-only: react-select can report the draft time after a
          // filter. Pointer clicks must keep the clicked option.
          if (remapEnterRef.current) {
            remapEnterRef.current = false;
            _onChange(focusedMenuOption() ?? option);
            return;
          }
          _onChange(option);
        }}
        onKeyDown={(e) => {
          const key = e.key;

          if (MENU_NAV_KEYS.has(key)) {
            userAdjustedRef.current = true;
          }

          if (key === "Enter" || key === "Backspace") {
            e.stopPropagation();
          }

          if (key === "Enter" && !e.nativeEvent.isComposing) {
            // Bare Enter must not adopt the first list row (often 12 AM).
            // After typing or arrowing, let react-select select so it
            // clears the filter; onChange remaps to the announced row.
            if (!userAdjustedRef.current) {
              e.preventDefault();
              setIsMenuOpen(false);
            } else {
              remapEnterRef.current = true;
            }
          }

          if (key === "Shift") {
            e.stopPropagation();
          }

          if (key === "Escape") {
            setIsMenuOpen(false);
            e.stopPropagation();
          }

          if (key === "Tab") {
            // Commit only after the user changed the draft (arrows or
            // typing). Bare Tab through must leave the current time
            // alone so keyboard users can move past the pickers.
            // react-select's tabSelectsValue preventDefaults Tab and,
            // with blurInputOnSelect, leaves focus on the document
            // instead of the next field.
            if (e.nativeEvent.isComposing) return;
            if (!e.shiftKey) commitFocusedOption();
            setIsMenuOpen(false);
          }
        }}
        onInputChange={(_inputValue, { action }) => {
          if (action === "input-change") {
            userAdjustedRef.current = true;
          }
        }}
        onMenuOpen={() => {
          userAdjustedRef.current = false;
          setIsMenuOpen(true);
          scheduleScrollToSelected();
        }}
        onMenuClose={() => {
          remapEnterRef.current = false;
          cancelScrollToSelected();
          setIsMenuOpen(false);
        }}
        openMenuOnFocus={true}
        options={selectOptions}
        filterOption={(option, inputValue) =>
          filterTimeOption(option, inputValue, value?.value)
        }
        tabSelectsValue={false}
        ariaLiveMessages={{
          guidance: ({
            context,
            isSearchable,
            isMulti,
            isInitialFocus,
            "aria-label": ariaLabel,
          }) => {
            switch (context) {
              case "menu":
                return "Use Up and Down to choose options, press Enter to select the currently focused option, press Escape to exit the menu, press Tab to confirm a newly chosen option and exit, or to leave the current time unchanged.";
              case "input":
                return isInitialFocus
                  ? `${ariaLabel || "Select"} is focused ${isSearchable ? ",type to refine list" : ""}, press Down to open the menu, ${isMulti ? " press left to focus selected values" : ""}`
                  : "";
              case "value":
                return "Use left and right to toggle between focused values, press Backspace to remove the currently focused value";
              default:
                return "";
            }
          },
        }}
        isValidNewOption={(inputValue) => {
          const parsed = parseInput(inputValue);
          if (!parsed) return false;
          // Don't show create row if the parsed time is already in options
          if (
            selectOptions?.some((o) => (o as TimeOption).value === parsed.value)
          ) {
            return false;
          }
          return true;
        }}
        getNewOptionData={(inputValue) => {
          return parseInput(inputValue) as TimeOption;
        }}
        formatCreateLabel={(inputValue) => {
          return parseInput(inputValue)?.label ?? inputValue;
        }}
        createOptionPosition="first"
      />
    </div>
  );
};
