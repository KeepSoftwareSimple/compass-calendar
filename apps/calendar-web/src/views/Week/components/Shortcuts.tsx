import { EditSequenceMenu } from "@web/shortcuts/edit-sequence/EditSequenceMenu";
import { ShiftHintOverlay } from "@web/shortcuts/shift-hint/ShiftHintOverlay";
import {
  type ShortcutProps,
  useWeekShortcutOwner,
} from "@web/views/Week/hooks/shortcuts/useWeekShortcutOwner";

export function Shortcuts({
  children,
  shortcutsProps,
}: {
  children: React.ReactNode;
  shortcutsProps: ShortcutProps;
}) {
  const { getEditSequenceAnchor, shiftHints } =
    useWeekShortcutOwner(shortcutsProps);

  return (
    <>
      {children}
      <ShiftHintOverlay hints={shiftHints} />
      <EditSequenceMenu getAnchor={getEditSequenceAnchor} />
    </>
  );
}
