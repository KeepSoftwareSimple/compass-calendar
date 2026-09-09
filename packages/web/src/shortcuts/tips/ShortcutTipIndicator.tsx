import classNames from "classnames";
import { type FC, useEffect } from "react";
import {
  SHORTCUT_PRO_TOOLTIP,
  ShortcutProBadge,
} from "@web/billing/ShortcutProBadge";
import { TooltipWrapper } from "@web/components/Tooltip/TooltipWrapper";
import { ShortcutTipParts } from "@web/shortcuts/tips/ShortcutTipParts";
import { beginShortcutSuggestionPresentation } from "@web/shortcuts/tips/shortcut-telemetry";
import {
  getHintPlainText,
  type RankedShortcutHint,
} from "@web/shortcuts/tips/shortcut-tips.data";

const isWriteHint = (featureArea: RankedShortcutHint["featureArea"]) =>
  featureArea === "event_creation" || featureArea === "event_editing";

/**
 * Always-on next-shortcut in the sidebar status bar. Pure display: the
 * caller (SidebarStatusBar) chooses this after mode and operational status.
 */
export const ShortcutTipIndicator: FC<{
  hint: RankedShortcutHint;
  locked?: boolean;
}> = ({ hint, locked = false }) => {
  const { actionId, featureArea, id, reasonCode } = hint;
  const suggestionText = getHintPlainText(hint);
  useEffect(
    () =>
      beginShortcutSuggestionPresentation({
        actionId,
        featureArea,
        id,
        reasonCode,
        suggestionText,
      }),
    [actionId, featureArea, id, reasonCode, suggestionText],
  );

  const showLock = locked && isWriteHint(featureArea);
  const body = (
    <span
      aria-live="polite"
      className={classNames(
        "block w-full text-pretty break-words text-center text-text-muted text-xs leading-5 opacity-80",
        showLock && "c-focus-ring",
      )}
      role="status"
      tabIndex={showLock ? 0 : undefined}
    >
      <ShortcutTipParts parts={hint.parts} />
      {showLock ? (
        <>
          <span className="sr-only"> Premium shortcut.</span>
          <ShortcutProBadge className="ml-1.5 align-middle" />
        </>
      ) : null}
    </span>
  );

  if (!showLock) return body;

  return (
    <TooltipWrapper description={SHORTCUT_PRO_TOOLTIP}>{body}</TooltipWrapper>
  );
};
