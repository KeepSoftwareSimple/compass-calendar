import classNames from "classnames";
import { type FC } from "react";
import { ShortcutKeycap } from "@web/components/Shortcuts/ShortcutKeycap";
import { useHintShortcutCelebrationClass } from "@web/shortcuts/tips/hint-shortcut-celebration.class";
import {
  getPartsPlainText,
  type ShortcutTipPart,
} from "@web/shortcuts/tips/shortcut-tips.data";

const partKeycaps = (
  part: Exclude<ShortcutTipPart, string>,
): readonly string[] => ("keys" in part ? part.keys : [part.key]);

/**
 * Prose with inline keycap chips. The visible chips are aria-hidden; the
 * reconstituted sentence is the accessible name.
 */
const KeycapGroup: FC<{
  hintId?: string;
  part: Exclude<ShortcutTipPart, string>;
}> = ({ hintId, part }) => {
  const celebrationClass = useHintShortcutCelebrationClass(hintId, part);
  const keys = partKeycaps(part);

  return (
    <span className="inline-flex pointer-coarse:hidden items-center gap-1 whitespace-nowrap align-middle">
      {keys.map((key, index) => (
        <ShortcutKeycap
          // biome-ignore lint/suspicious/noArrayIndexKey: keycap sequences repeat keys; position is the identity
          key={`${key}-${index}`}
          className={classNames(celebrationClass)}
          keyToken={key.length === 1 ? key.toUpperCase() : key}
        />
      ))}
    </span>
  );
};

export const ShortcutTipParts: FC<{
  hintId?: string;
  parts: readonly ShortcutTipPart[];
}> = ({ hintId, parts }) => {
  const plainText = getPartsPlainText(parts);

  return (
    <span>
      <span className="sr-only">{plainText}</span>
      <span aria-hidden>
        {parts.map((part, i) =>
          typeof part === "string" ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: parts are a fixed, order-stable literal
            <span key={i}>{part}</span>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: parts are a fixed, order-stable literal
            <KeycapGroup key={i} hintId={hintId} part={part} />
          ),
        )}
      </span>
    </span>
  );
};
