import { ArrowDownIcon } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { CommandIcon } from "@phosphor-icons/react/dist/csr/Command";
import { ControlIcon } from "@phosphor-icons/react/dist/csr/Control";
import { WindowsLogoIcon } from "@phosphor-icons/react/dist/csr/WindowsLogo";
import { type Icon } from "@phosphor-icons/react/dist/lib/types";
import { detectPlatform } from "@tanstack/react-hotkeys";
import { expandModInShortcutDisplay } from "@web/shortcuts/shortcut.util";

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
export function ShortCutLabel({ k }: { k: string; size?: number }) {
  const display = expandModInShortcutDisplay(k);

  return display.split("+").map((_key) => {
    const key = _key.trim();
    const testId = `${key.toLowerCase()}-icon`;
    const IconComponent = keyIconMap[key];

    if (IconComponent) {
      return <IconComponent key={key} data-testid={testId} weight="regular" />;
    }

    return (
      <span key={key} data-testid={testId} className="leading-none">
        {key}
      </span>
    );
  });
}
