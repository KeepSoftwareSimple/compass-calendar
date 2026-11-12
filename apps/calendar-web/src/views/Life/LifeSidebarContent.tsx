import { ShuffleIcon } from "@phosphor-icons/react/dist/csr/Shuffle";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  clampLifespan,
  formatDateInputValue,
  getLifeVariationDescription,
  getRandomLifespan,
  LIFE_VARIATIONS,
  MAX_LIFESPAN,
  MIN_LIFESPAN,
} from "@core/life/life-math";
import { ID_LIFE_BIRTH_DATE } from "@web/common/constants/web.constants";
import { ArrowButton } from "@web/components/Button/ArrowButton";
import { NumberInput } from "@web/components/NumberInput/NumberInput";
import { TooltipWrapper } from "@web/components/Tooltip/TooltipWrapper";
import {
  selectPageJumpHintsVisible,
  usePageJumpHintStore,
} from "@web/shortcuts/page-jump/page-jump.store";
import {
  pageJumpAttrs,
  pageJumpChipAttrs,
} from "@web/shortcuts/page-jump/page-jump.targets";
import { LifeBirthDateField } from "@web/views/Life/LifeBirthDateField";
import { LifeQuote } from "./LifeQuote";
import { type LifePreferences } from "./life-preferences.storage";

interface LifeSidebarContentProps {
  autoFocusBirthDate: boolean;
  /** Rendered at the far right of the variation title row. */
  headerEndContent?: ReactNode;
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
  headerEndContent,
  onCycleVariation,
  preferences,
  onShuffleAge,
  summary,
  today,
  onPreferencesChange,
}: LifeSidebarContentProps) {
  const pageJumpHintsVisible = usePageJumpHintStore(selectPageJumpHintsVisible);
  const [isBirthDatePickerOpen, setIsBirthDatePickerOpen] = useState(false);
  const [lifespanInput, setLifespanInput] = useState(() =>
    String(preferences.lifespan),
  );
  const previousLifespanRef = useRef(preferences.lifespan);

  useEffect(() => {
    if (!autoFocusBirthDate) return;
    document.getElementById(ID_LIFE_BIRTH_DATE)?.focus();
  }, [autoFocusBirthDate]);

  useEffect(() => {
    if (previousLifespanRef.current !== preferences.lifespan) {
      setLifespanInput(String(preferences.lifespan));
      previousLifespanRef.current = preferences.lifespan;
    }
  }, [preferences.lifespan]);

  const minimumBirthDate = new Date(1900, 0, 1);
  const maximumBirthDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );

  const commitBirthDate = (date: Date | null) => {
    if (!date) {
      onPreferencesChange((current) => ({ ...current, birthDate: "" }));
      setIsBirthDatePickerOpen(false);
      return;
    }
    if (date < minimumBirthDate || date > maximumBirthDate) return;

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
        <div className="flex w-full items-center gap-1">
          <div className="flex min-w-0 items-center gap-1">
            <div
              className="flex shrink-0 items-center gap-1"
              {...pageJumpChipAttrs("life-variation", {
                placement: "outside-trailing",
              })}
            >
              <TooltipWrapper
                description="Previous life variation"
                shortcut="J"
              >
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
            </div>
            <span
              aria-hidden
              className={
                pageJumpHintsVisible
                  ? "inline-block w-7 shrink-0"
                  : "inline-block w-7 shrink-0 invisible"
              }
            />
            <h2 className="min-w-0 font-semibold text-text">
              {LIFE_VARIATIONS[preferences.variation].label}
            </h2>
          </div>
          {headerEndContent ? (
            <div className="ml-auto flex shrink-0 items-center">
              {headerEndContent}
            </div>
          ) : null}
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
          <TooltipWrapper description="Saved to your account when signed in">
            <span className="cursor-help">Date of birth</span>
          </TooltipWrapper>
          <div
            className="w-full max-w-44"
            {...pageJumpChipAttrs("life-details")}
          >
            <LifeBirthDateField
              id={ID_LIFE_BIRTH_DATE}
              isOpen={isBirthDatePickerOpen}
              maxDate={maximumBirthDate}
              minDate={minimumBirthDate}
              onCalendarClose={() => setIsBirthDatePickerOpen(false)}
              onCalendarOpen={() => {
                flushSync(() => setIsBirthDatePickerOpen(true));
              }}
              onCommit={commitBirthDate}
              storedBirthDate={preferences.birthDate}
              today={today}
            />
          </div>
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
