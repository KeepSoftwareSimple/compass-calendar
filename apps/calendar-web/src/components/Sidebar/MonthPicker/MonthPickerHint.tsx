import { type FC, type ReactNode, useState } from "react";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import { type MonthPickerUnit } from "./monthPickerCursor";

interface Props {
  children: ReactNode;
  unit: MonthPickerUnit;
}

const hintClassName =
  "c-context-tooltip top-full bottom-auto left-1/2 mt-1.5 mb-0 flex -translate-x-1/2 items-center gap-1.5";

function statusText(
  isFocused: boolean,
  hasMovedWithArrows: boolean,
  unit: MonthPickerUnit,
): string {
  if (!isFocused) return "I focuses the picker";
  if (hasMovedWithArrows) {
    return `Up and down arrows move by ${unit}. Enter opens it.`;
  }
  return `Up and down arrows move by ${unit}`;
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
      className="group relative"
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
      <span role="status" className={hintClassName}>
        <span className="sr-only">
          {statusText(isFocused, hasMovedWithArrows, unit)}
        </span>
        {isFocused ? (
          <>
            <ShortcutKeys keys={["ArrowUp", "ArrowDown"]} />
            <span aria-hidden>move by {unit}</span>
            {hasMovedWithArrows ? (
              <>
                <span aria-hidden>·</span>
                <ShortcutKeys keys="Enter" />
                <span aria-hidden>opens it</span>
              </>
            ) : null}
          </>
        ) : (
          <>
            <ShortcutKeys keys="I" />
            <span aria-hidden>focuses the picker</span>
          </>
        )}
      </span>
    </div>
  );
};
