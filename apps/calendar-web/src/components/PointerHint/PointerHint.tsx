import { X } from "@phosphor-icons/react/dist/csr/X";
import { type FC } from "react";
import { track } from "@web/auth/posthog/track";
import { Z_INDEX_TOOLTIP } from "@web/common/constants/web.constants";
import IconButton from "@web/components/IconButton/IconButton";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import { writePointerHintDismissedPermanently } from "@web/shortcuts/keyboard-only/pointer-hint.storage";
import {
  pointerHintActions,
  selectPointerHintAttempt,
  selectPointerHintVisible,
  usePointerHintStore,
} from "@web/shortcuts/keyboard-only/pointer-hint.store";

const PLACEHOLDER_PATTERN = /\{(\d+)\}/g;

function renderPointerHintMessage(message: string, keys: string[][]) {
  const parts: Array<string | { keyIndex: number }> = [];
  let lastIndex = 0;
  for (const match of message.matchAll(PLACEHOLDER_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push(message.slice(lastIndex, index));
    }
    parts.push({ keyIndex: Number(match[1]) });
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
}

/**
 * Keyboard teaching after a command palette selection or a pointer intent on
 * the grid. Top-center to stay clear of the Up Next banner's bottom-center spot.
 */
export const PointerHint: FC = () => {
  const isVisible = usePointerHintStore(selectPointerHintVisible);
  const attempt = usePointerHintStore(selectPointerHintAttempt);

  if (!isVisible || !attempt?.shortcutKey) return null;

  const body =
    attempt.source === "pointer" && attempt.message && attempt.keys ? (
      renderPointerHintMessage(attempt.message, attempt.keys)
    ) : (
      <>
        Next time, press <ShortcutKeys keys={attempt.shortcutKey} />.
      </>
    );

  return (
    <div
      aria-live="polite"
      className="fixed top-4 left-1/2 flex max-w-[min(100vw-2rem,36rem)] -translate-x-1/2 starting:translate-y-1 items-start gap-2 rounded-lg border border-border bg-surface-panel/90 px-3 py-1.5 text-sm text-text starting:opacity-0 shadow-xl backdrop-blur-md transition-all duration-200 ease-out motion-reduce:transition-none"
      data-pointer-hint=""
      role="status"
      style={{ zIndex: Z_INDEX_TOOLTIP }}
    >
      <span className="min-w-0 flex-1">{body}</span>
      <IconButton
        aria-label="Turn off keyboard tips"
        className="shrink-0 opacity-70 hover:opacity-100"
        type="button"
        onClick={() => {
          writePointerHintDismissedPermanently();
          track("pointer_hint_dismissed");
          pointerHintActions.hide();
        }}
        size="small"
      >
        <X size={16} />
      </IconButton>
    </div>
  );
};
