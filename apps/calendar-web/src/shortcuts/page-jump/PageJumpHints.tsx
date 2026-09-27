import { useMemo } from "react";
import { useConnectedAccounts } from "@web/calendars/useDefaultTargetCalendar";
import { PageJumpHintOverlay } from "@web/shortcuts/page-jump/PageJumpHintOverlay";
import {
  buildCalendarPageJumpTargets,
  type PageJumpTargets,
} from "@web/shortcuts/page-jump/page-jump.targets";
import { usePageJumpShortcut } from "@web/shortcuts/page-jump/usePageJumpShortcut";

/**
 * Self-contained mount for the page-level hold-Mod jump gesture: hook plus
 * hint overlay. Rendered once per view (Day, Week, Life). Week uses the
 * default calendar map (one chip per connected account); Day and Life pass
 * their own lists.
 */
export function PageJumpHints({ targets }: { targets?: PageJumpTargets }) {
  const accounts = useConnectedAccounts();
  const resolvedTargets = useMemo(
    () => targets ?? buildCalendarPageJumpTargets(accounts),
    [accounts, targets],
  );
  const { areHintsVisible } = usePageJumpShortcut(resolvedTargets);
  return (
    <PageJumpHintOverlay targets={resolvedTargets} visible={areHintsVisible} />
  );
}
