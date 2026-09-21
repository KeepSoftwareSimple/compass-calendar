import { ShuffleIcon } from "@phosphor-icons/react/dist/csr/Shuffle";
import { useEffect, useRef, useState } from "react";
import { ArrowButton } from "@web/components/Button/ArrowButton";
import { DatePicker } from "@web/components/DatePicker/DatePicker";
import { NumberInput } from "@web/components/NumberInput/NumberInput";
import { TooltipWrapper } from "@web/components/Tooltip/TooltipWrapper";
import { pageJumpAttrs } from "@web/shortcuts/page-jump/page-jump.targets";
import { LifeQuote } from "./LifeQuote";
import {
  clampLifespan,
  formatDateInputValue,
  getLifeVariationDescription,
  getRandomLifespan,
  LIFE_VARIATIONS,
  MAX_LIFESPAN,
  MIN_LIFESPAN,
  parseLifeDate,
} from "./life.utils";
import { type LifePreferences } from "./life-preferences.storage";

interface LifeSidebarContentProps {
  autoFocusBirthDate: boolean;
  onCycleVariation: (direction: -1 | 1) => void;
  preferences: LifePreferences;
  onShuffleAge: () => void;
  summary: string;
  today: Date;
  onPreferencesChange: (
    update: (current: LifePreferences) => LifePreferences,
  ) => void;
}

export function LifeSidebarContent({
  autoFocusBirthDate,
  onCycleVariation,
  preferences,
  onShuffleAge,
  summary,
  today,
  onPreferencesChange,
}: LifeSidebarContentProps) {
  const [isBirthDatePickerOpen, setIsBirthDatePickerOpen] = useState(false);
  const [lifespanInput, setLifespanInput] = useState(() =>
    String(preferences.lifespan),
  );
  const previousLifespanRef = useRef(preferences.lifespan);
  const birthDate = parseLifeDate(preferences.birthDate);
  const variation = LIFE_VARIATIONS[preferences.variation];

  useEffect(() => {
    if (!autoFocusBirthDate) return;
    document.getElementById("life-date-of-birth")?.focus();
  }, [autoFocusBirthDate]);

  useEffect(() => {
    if (previousLifespanRef.current !== preferences.lifespan) {
      setLifespanInput(String(preferences.lifespan));
      previousLifespanRef.current = preferences.lifespan;
    }
  }, [preferences.lifespan]);
  const clearBirthDate = () => {
    onPreferencesChange((current) => ({ ...current, birthDate: "" }));
    setIsBirthDatePickerOpen(false);
  };
  const setBirthDate = (date: Date) => {
    const minimumDate = new Date(1900, 0, 1);
    const maximumDate = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    if (date < minimumDate || date > maximumDate) return;

    const birthDateValue = formatDateInputValue(date);
    onPreferencesChange((current) => ({
      ...current,
      birthDate: birthDateValue,
      lifespan:
        current.variation === "random"
          ? getRandomLifespan(birthDateValue, today)
          : current.lifespan,
    }));
    setIsBirthDatePickerOpen(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-5 pb-5 text-sm">
      <section
        aria-label="Life variation"
        className="flex flex-col gap-2 text-text-muted"
        {...pageJumpAttrs("life-variation")}
      >
        <div className="flex items-center gap-1">
          <TooltipWrapper description="Previous life variation" shortcut="J">
            <ArrowButton
              direction="left"
              label="Previous life variation in sidebar"
              onClick={() => onCycleVariation(-1)}
            />
          </TooltipWrapper>
          <TooltipWrapper description="Next life variation" shortcut="K">
            <ArrowButton
              direction="right"
              label="Next life variation in sidebar"
              onClick={() => onCycleVariation(1)}
            />
          </TooltipWrapper>
          <h2 className="font-semibold text-text">{variation.label}</h2>
        </div>
        <p>{getLifeVariationDescription(preferences.lifespan)}</p>
        <p>
          Each dot represents one week of your life, and each row represents one
          year.
        </p>
      </section>

      <section className="flex flex-col gap-2 text-center">
        <p aria-live="polite" className="font-medium text-text" role="status">
          {summary}
        </p>
      </section>

      <section
        aria-label="Life details"
        className="flex flex-col items-center gap-4 text-center"
        {...pageJumpAttrs("life-details")}
      >
        <div className="flex w-full flex-col items-center gap-1 text-text-muted">
          <TooltipWrapper description="We don't store this information">
            <span className="cursor-help">Date of birth</span>
          </TooltipWrapper>
          <DatePicker
            aria-label="Date of birth"
            calendarClassName="lifeBirthDatePicker"
            dateFormat="MMM d, yyyy"
            id="life-date-of-birth"
            inputClassName="c-life-input w-44"
            isClearable
            isOpen={isBirthDatePickerOpen}
            maxDate={today}
            minDate={new Date(1900, 0, 1)}
            onCalendarClose={() => setIsBirthDatePickerOpen(false)}
            onCalendarOpen={() => setIsBirthDatePickerOpen(true)}
            onChange={(date) => (date ? setBirthDate(date) : clearBirthDate())}
            onChangeRaw={(event) => {
              const value = event.currentTarget.value;
              const date = parseLifeDate(value);
              if (date) {
                setBirthDate(date);
              } else if (!value) {
                clearBirthDate();
              }
            }}
            onInputClick={() => setIsBirthDatePickerOpen(true)}
            // Keep first impression on the grid: focus without opening. Enter/
            // arrows open via click so react-datepicker's internal open state
            // stays in sync (Escape / day-grid focus depend on it).
            onKeyDown={(event) => {
              if (isBirthDatePickerOpen) return;
              if (
                event.key !== "Enter" &&
                event.key !== "ArrowDown" &&
                event.key !== "ArrowUp"
              ) {
                return;
              }
              event.preventDefault();
              (event.target as HTMLElement).click();
            }}
            onSelect={(date) => {
              if (!date) return;
              setBirthDate(date);
            }}
            placeholderText="Select date"
            preventOpenOnFocus
            selected={birthDate ?? undefined}
            title="Date of birth"
            view="grid"
            withTodayButton={false}
            withUnderline={false}
          />
        </div>

        <div className="flex w-full flex-col items-center gap-1 text-text-muted">
          <span className="flex items-center gap-1">
            Age of Death
            <TooltipWrapper description="Choose a random age">
              <button
                aria-label="Shuffle life variation"
                className="flex size-6 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-panel hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                onClick={onShuffleAge}
                type="button"
              >
                <ShuffleIcon aria-hidden="true" size={14} />
              </button>
            </TooltipWrapper>
          </span>
          <NumberInput
            ariaLabel="Age of Death"
            id="life-age-of-death"
            max={MAX_LIFESPAN}
            min={MIN_LIFESPAN}
            onChange={(value) => {
              setLifespanInput(value);
              if (!value) return;

              const parsed = Number(value);
              if (!Number.isFinite(parsed)) return;
              onPreferencesChange((current) => ({
                ...current,
                lifespan: clampLifespan(parsed),
              }));
            }}
            value={lifespanInput}
          />
        </div>
      </section>

      <LifeQuote />
    </div>
  );
}
