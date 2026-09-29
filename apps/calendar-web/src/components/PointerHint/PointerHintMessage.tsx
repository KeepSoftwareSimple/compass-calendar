import { type FC } from "react";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";

const PLACEHOLDER_PATTERN = /\{(\d+)\}/g;

type Props = {
  message: string;
  keys: string[][];
};

/** Renders pointer-teaching copy with registry keycaps at `{0}`, `{1}`, … placeholders. */
export const PointerHintMessage: FC<Props> = ({ message, keys }) => {
  const parts: Array<string | { keyIndex: number }> = [];
  let lastIndex = 0;
  for (const match of message.matchAll(PLACEHOLDER_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push(message.slice(lastIndex, index));
    }
    const keyIndex = Number(match[1]);
    parts.push({ keyIndex });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < message.length) parts.push(message.slice(lastIndex));

  return (
    <span>
      {parts.map((part, i) =>
        typeof part === "string" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: template parts are order-stable
          <span key={i}>{part}</span>
        ) : (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: template parts are order-stable
            key={i}
            className="inline-flex whitespace-nowrap align-middle"
          >
            <ShortcutKeys keys={keys[part.keyIndex] ?? []} />
          </span>
        ),
      )}
    </span>
  );
};
