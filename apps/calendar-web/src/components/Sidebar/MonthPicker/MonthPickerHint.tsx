import { type FC, type ReactNode, useState } from "react";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import { type MonthPickerUnit } from "./monthPickerCursor";

interface Props {
  children: ReactNode;
  unit: MonthPickerUnit;
}

const hintSlotClassName =
  "mt-1.5 flex min-h-10 w-full items-center justify-center px-0";

const hintClassName =
  "pointer-coarse:hidden flex max-w-full flex-wrap items-center justify-center gap-x-1 gap-y-0.5 font-medium text-text leading-snug invisible opacity-0 transition-opacity duration-200 ease-in-out group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100";

const hintSeparator = (
  <span aria-hidden className="text-text-muted">
    ·
  </span>
);

function statusText(
  isFocused: boolean,
  hasMovedWithArrows: boolean,
  unit: MonthPickerUnit,
): string {
  if (!isFocused) return "I focuses the picker";
  if (hasMovedWithArrows) {
    return `Up and down arrows move by ${unit}. Enter opens it. U returns to the grid.`;
  }
  return `Up and down arrows move by ${unit}. U returns to the grid.`;
}

/**
 * Caption under the month grid. Hover (or any unfocused glance) only
 * advertises `I`. Focusing the picker reveals the arrow keycaps; using an
 * arrow then adds Enter, styled as the same kind of keycap as `I`.
 *
 * Hint state lives here so updating it does not re-render react-datepicker
 * (a parent setState resets its keyboard cursor).
 */
export const MonthPickerHint: FC<Props> = ({ children, unit }) => {
  const [isFocused, setIsFocused] = useState(false);
  const [hasMovedWithArrows, setHasMovedWithArrows] = useState(false);

  return (
    <div
      className="group relative min-w-0"
      onBlurCapture={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setIsFocused(false);
      }}
      onFocusCapture={() => setIsFocused(true)}
      onKeyDownCapture={(event) => {
        if (
          event.key === "ArrowUp" ||
          event.key === "ArrowDown" ||
          event.key === "ArrowLeft" ||
          event.key === "ArrowRight"
        ) {
          setHasMovedWithArrows(true);
        }
      }}
    >
      {children}
      <div className={hintSlotClassName}>
        <span
          role="status"
          data-testid="month-picker-keycap-hint"
          className={hintClassName}
          style={{ fontSize: "var(--font-size-s)" }}
        >
          <span className="sr-only">
            {statusText(isFocused, hasMovedWithArrows, unit)}
          </span>
          {isFocused ? (
            <>
              <ShortcutKeys keys={["ArrowUp", "ArrowDown"]} />
              <span aria-hidden>{unit}</span>
              {hasMovedWithArrows ? (
                <>
                  {hintSeparator}
                  <ShortcutKeys keys="Enter" />
                  <span aria-hidden>open</span>
                </>
              ) : null}
              {hintSeparator}
              <ShortcutKeys keys="U" />
              <span aria-hidden>back</span>
            </>
          ) : (
            <>
              <ShortcutKeys keys="I" />
              <span aria-hidden>focus</span>
            </>
          )}
        </span>
      </div>
    </div>
  );
};
