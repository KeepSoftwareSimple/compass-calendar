import { PlusIcon } from "@phosphor-icons/react/dist/csr/Plus";
import { emitViewCommand } from "@web/common/utils/dom/view-command-bus";
import { type CommandItem } from "@web/components/CommandPalette/command-palette.types";

/**
 * View-agnostic "Common Actions" for the command palette. Emitting a view
 * command (rather than calling a view-specific function) is what lets this
 * list work identically for Week and Day: each view already has a
 * shortcut-driven listener for these commands. `queueMicrotask` defers the
 * emit until after the palette unmounts, so draft-creation focus/measurement
 * doesn't fight the closing modal.
 */
export const eventCommandPaletteItems: CommandItem[] = [
  {
    id: "create-event",
    label: "Create event",
    icon: PlusIcon,
    shortcut: "c",
    keywords: ["new event", "add event", "schedule"],
    onClick: () => queueMicrotask(() => emitViewCommand("CREATE_TIMED_DRAFT")),
  },
  {
    id: "create-allday-event",
    label: "Create all-day event",
    icon: PlusIcon,
    shortcut: "shift+c",
    keywords: ["new event", "add event", "all day"],
    onClick: () => queueMicrotask(() => emitViewCommand("CREATE_ALLDAY_DRAFT")),
  },
];
