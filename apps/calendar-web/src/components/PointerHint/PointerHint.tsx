import { X } from "@phosphor-icons/react/dist/csr/X";
import { type FC, type ReactNode } from "react";
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

const renderTeachingKey = (
  keys: string | string[],
  index: number,
): ReactNode => <ShortcutKeys key={index} keys={keys} />;

/** Replace `{0}`, `{1}`, … with keycap chips from `keys`. */
const formatTeachingMessage = (
  template: string,
  keys: string[][] | undefined,
): ReactNode[] => {
  const parts = template.split(/(\{\d+\})/);
  return parts.map((part, index) => {
    const match = /^\{(\d+)\}$/.exec(part);
    if (!match || !keys) return part;
    const keyGroup = keys[Number(match[1])];
    if (!keyGroup) return part;
    return renderTeachingKey(keyGroup, index);
  });
};

/**
 * "Next time, press X" teaching after a command palette selection with a
 * shortcut. Top-center to stay clear of the Up Next banner's bottom-center spot.
 */
export const PointerHint: FC = () => {
  const isVisible = usePointerHintStore(selectPointerHintVisible);
  const attempt = usePointerHintStore(selectPointerHintAttempt);

  if (!isVisible || !attempt) return null;

  const body =
    attempt.message && attempt.keys ? (
      formatTeachingMessage(attempt.message, attempt.keys)
    ) : attempt.message ? (
      attempt.message
    ) : attempt.shortcutKey ? (
      <>
        Next time, press <ShortcutKeys keys={attempt.shortcutKey} />.
      </>
    ) : null;

  if (!body) return null;

  const isGridSlotHint =
    attempt.tone === "soft" ||
    (attempt.source === "pointer" &&
      typeof attempt.message === "string" &&
      attempt.message.startsWith("Type "));

  return (
    <div
      aria-live="polite"
      className={
        isGridSlotHint
          ? "fixed top-3 left-1/2 flex max-w-[min(100vw-2rem,32rem)] -translate-x-1/2 starting:translate-y-1 items-start gap-2 rounded-md border border-border/80 bg-surface-panel/75 px-2.5 py-1 text-text-muted text-xs starting:opacity-0 shadow-md backdrop-blur-sm transition-all duration-200 ease-out motion-reduce:transition-none"
          : "fixed top-4 left-1/2 flex max-w-[min(100vw-2rem,36rem)] -translate-x-1/2 starting:translate-y-1 items-start gap-2 rounded-lg border border-border bg-surface-panel/90 px-3 py-1.5 text-sm text-text-primary starting:opacity-0 shadow-xl backdrop-blur-md transition-all duration-200 ease-out motion-reduce:transition-none"
      }
      data-pointer-hint=""
      data-pointer-hint-grid-slot={isGridSlotHint ? "" : undefined}
      role="status"
      style={{ zIndex: Z_INDEX_TOOLTIP }}
    >
      <span className="min-w-0 flex-1">{body}</span>
      <IconButton
        aria-label="Turn off keyboard tips"
        className="shrink-0 opacity-70 hover:opacity-100"
        onClick={() => {
          writePointerHintDismissedPermanently();
          track("pointer_hint_dismissed");
          pointerHintActions.hide();
        }}
        size="small"
        type="button"
      >
        <X size={16} />
      </IconButton>
    </div>
  );
};
