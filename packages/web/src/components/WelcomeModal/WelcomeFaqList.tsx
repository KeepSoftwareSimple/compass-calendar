import classNames from "classnames";
import { useId } from "react";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { pointerShortcutAttributes } from "@web/shortcuts/keyboard-only/pointer-action";
import { ShortcutTipParts } from "@web/shortcuts/tips/ShortcutTipParts";
import { FAQ_ITEMS } from "./faq";
import { flashedShortcutClass } from "./useFlashedWelcomeShortcut";

/**
 * The FAQ disclosure rows. Digits 1-5 toggle them; state lives in the caller
 * (useFaqDisclosure) so the digit listener can be mounted once per surface.
 */
export function WelcomeFaqList({
  expanded,
  onToggle,
  flashedKey,
  describedById,
}: {
  expanded: Set<string>;
  onToggle: (question: string, source: "pointer" | "keyboard") => void;
  flashedKey: string | null;
  describedById?: string;
}) {
  const disclosureIdPrefix = useId();

  return (
    <div
      aria-describedby={describedById}
      className="flex w-full flex-col divide-y divide-border"
    >
      {FAQ_ITEMS.map((item, index) => {
        const isExpanded = expanded.has(item.question);
        const answerId = `${disclosureIdPrefix}-faq-answer-${index}`;
        const state = isExpanded ? "open" : "closed";
        const digit = String(index + 1);

        return (
          <div key={item.question} className="py-3">
            <button
              type="button"
              aria-controls={answerId}
              aria-expanded={isExpanded}
              className="c-focus-ring flex w-full cursor-pointer select-none items-center justify-between gap-3 text-left font-medium text-sm text-text transition-colors hover:text-text-lightest"
              onClick={(event) =>
                onToggle(
                  item.question,
                  event.detail === 0 ? "keyboard" : "pointer",
                )
              }
              {...pointerShortcutAttributes(digit)}
            >
              <span>{item.question}</span>
              <span
                className={classNames(
                  "shrink-0",
                  flashedShortcutClass(flashedKey, digit),
                )}
              >
                <ShortcutHint>{digit}</ShortcutHint>
              </span>
            </button>
            <div
              id={answerId}
              aria-hidden={!isExpanded}
              className="c-disclosure-content"
              data-state={state}
            >
              <div>
                <div className="mt-2 text-sm text-text-muted leading-relaxed">
                  {typeof item.answer === "string" ? (
                    item.answer
                  ) : (
                    <ShortcutTipParts parts={item.answer} />
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
