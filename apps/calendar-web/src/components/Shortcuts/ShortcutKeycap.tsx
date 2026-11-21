import { ArrowDownIcon } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { CommandIcon } from "@phosphor-icons/react/dist/csr/Command";
import { ControlIcon } from "@phosphor-icons/react/dist/csr/Control";
import { WindowsLogoIcon } from "@phosphor-icons/react/dist/csr/WindowsLogo";
import { type Icon } from "@phosphor-icons/react/dist/lib/types";
import { detectPlatform } from "@tanstack/react-hotkeys";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import {
  expandModInShortcutDisplay,
  isMacForwardDelete,
} from "@web/shortcuts/shortcut.util";

// `Meta` is the platform "command" key: ⌘ on macOS, the Windows logo elsewhere.
const metaIcon: Icon =
  detectPlatform() === "mac" ? CommandIcon : WindowsLogoIcon;

const keyIconMap: Record<string, Icon> = {
  Meta: metaIcon,
  Control: ControlIcon,
  ArrowUp: ArrowUpIcon,
  ArrowDown: ArrowDownIcon,
  ArrowLeft: ArrowLeftIcon,
  ArrowRight: ArrowRightIcon,
};
export function ShortcutKeycap({
  keyToken,
  className,
}: {
  keyToken: string;
  className?: string;
}) {
  if (isMacForwardDelete(keyToken)) {
    return (
      <>
        <ShortcutHint className={className}>fn</ShortcutHint>
        <ShortcutHint className={className}>
          <span data-testid="delete-icon">⌫</span>
        </ShortcutHint>
      </>
    );
  }

  const display = expandModInShortcutDisplay(keyToken);

  return (
    <ShortcutHint className={className}>
      {display.split("+").map((key) => {
        const testId = `${key.toLowerCase()}-icon`;
        const IconComponent = keyIconMap[key];
        return IconComponent ? (
          <IconComponent key={key} data-testid={testId} weight="regular" />
        ) : (
          <span key={key} data-testid={testId} className="leading-none">
            {key}
          </span>
        );
      })}
    </ShortcutHint>
  );
}
