import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import {
  SHORTCUT_PRO_TOOLTIP,
  ShortcutProBadge,
} from "@web/billing/ShortcutProBadge";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import { TooltipDescription } from "@web/components/Tooltip/Description/TooltipDescription";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@web/components/Tooltip/Tooltip";
import { type Shortcut } from "@web/shortcuts/global.shortcut.types";

const ROW_CLASSNAME =
  "flex min-h-9 items-center justify-between gap-4 rounded-default py-1.5 text-[13px] text-text leading-tight";

function ShortcutRowContent({ shortcut }: { shortcut: Shortcut }) {
  return (
    <>
      <span className="min-w-0 flex-1 break-words">
        {shortcut.locked ? (
          <span className="sr-only">Premium shortcut. </span>
        ) : null}
        {shortcut.label}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {shortcut.locked ? <ShortcutProBadge /> : null}
        <ShortcutKeys className="shrink-0" keys={shortcut.keys} />
        {shortcut.used ? (
          <span className="shrink-0 text-text">
            <span className="sr-only">used</span>
            <CheckIcon aria-hidden="true" size={14} />
          </span>
        ) : null}
      </span>
    </>
  );
}

function ShortcutRow({ shortcut }: { shortcut: Shortcut }) {
  if (!shortcut.locked) {
    return (
      <li className={ROW_CLASSNAME}>
        <ShortcutRowContent shortcut={shortcut} />
      </li>
    );
  }

  return (
    <li className={ROW_CLASSNAME}>
      <Tooltip>
        <TooltipTrigger className="flex min-h-9 w-full cursor-default items-center justify-between gap-4 rounded-default">
          <ShortcutRowContent shortcut={shortcut} />
        </TooltipTrigger>
        <TooltipContent>
          <TooltipDescription description={SHORTCUT_PRO_TOOLTIP} />
        </TooltipContent>
      </Tooltip>
    </li>
  );
}

export const ShortcutList = ({ shortcuts }: { shortcuts: Shortcut[] }) => {
  if (!shortcuts.length) return null;

  return (
    <ul className="space-y-1.5">
      {shortcuts.map((shortcut) => (
        // Key on combo + label: a key combo can legitimately appear more than
        // once in a section, so the combo alone is not unique and collides as
        // a React key.
        <ShortcutRow
          key={`${shortcut.keys.join("-")}-${shortcut.label}`}
          shortcut={shortcut}
        />
      ))}
    </ul>
  );
};
