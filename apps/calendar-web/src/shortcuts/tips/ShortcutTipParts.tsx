import { type FC } from "react";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
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
export const ShortcutTipParts: FC<{
  parts: readonly ShortcutTipPart[];
}> = ({ parts }) => {
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
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: parts are a fixed, order-stable literal
              key={i}
              className="inline-flex whitespace-nowrap align-middle"
            >
              <ShortcutKeys keys={[...partKeycaps(part)]} />
            </span>
          ),
        )}
      </span>
    </span>
  );
};
