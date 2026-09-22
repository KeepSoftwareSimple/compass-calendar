import { EyeIcon } from "@phosphor-icons/react/dist/csr/Eye";
import { EyeSlashIcon } from "@phosphor-icons/react/dist/csr/EyeSlash";
import { type CommandItem } from "@web/components/CommandPalette/command-palette.types";
import {
  setTipsMuted,
  useIsTipsMuted,
} from "@web/shortcuts/tips/shortcut-tips-muted.store";

/** Sidebar shortcut-tip visibility, toggled from the command palette. */
export function useShortcutTipsCmdItems(): CommandItem[] {
  const muted = useIsTipsMuted();

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
  ];
}
