import { EyeIcon } from "@phosphor-icons/react/dist/csr/Eye";
import { EyeSlashIcon } from "@phosphor-icons/react/dist/csr/EyeSlash";
import { track } from "@web/auth/posthog/track";
import { type CommandItem } from "@web/components/CommandPalette/command-palette.types";
import {
  setLevelHidden,
  useIsLevelHidden,
} from "@web/shortcuts/level/shortcut-level-hidden.store";
import {
  setTipsMuted,
  useIsTipsMuted,
} from "@web/shortcuts/tips/shortcut-tips-muted.store";

/** Sidebar shortcut-tip and shortcut-level visibility, toggled from the
 * command palette. */
export function useShortcutTipsCmdItems(): CommandItem[] {
  const muted = useIsTipsMuted();
  const levelHidden = useIsLevelHidden();

  return [
    {
      id: "toggle-shortcut-tips",
      label: muted ? "Show shortcut tips" : "Hide shortcut tips",
      icon: muted ? EyeIcon : EyeSlashIcon,
      keywords: [
        "sidebar",
        "hint",
        "tips",
        "teaching",
        "shortcuts",
        "keyboard",
      ],
      onClick: () => setTipsMuted(!muted),
    },
    {
      id: "toggle-shortcut-level",
      label: levelHidden ? "Show shortcut level" : "Hide shortcut level",
      icon: levelHidden ? EyeIcon : EyeSlashIcon,
      keywords: ["level", "progress", "badge", "shortcuts", "keyboard"],
      onClick: () => {
        const nextHidden = !levelHidden;
        setLevelHidden(nextHidden);
        track("shortcut_level_badge_toggled", { hidden: nextHidden });
      },
    },
  ];
}
