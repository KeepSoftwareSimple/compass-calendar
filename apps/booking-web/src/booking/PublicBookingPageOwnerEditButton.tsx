import { PencilSimpleIcon } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { useHotkey } from "@tanstack/react-hotkeys";
import { meetingSetupRootHref } from "@web/booking/meeting-setup.search";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import { TooltipDescription } from "@web/components/Tooltip/Description/TooltipDescription";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@web/components/Tooltip/Tooltip";

const EDIT_ICON_SIZE = 16;

interface PublicBookingPageOwnerEditButtonProps {
  enabled: boolean;
}

export function PublicBookingPageOwnerEditButton({
  enabled,
}: PublicBookingPageOwnerEditButtonProps) {
  const href = meetingSetupRootHref();

  useHotkey(
    "E",
    () => {
      window.location.assign(href);
    },
    { enabled, ignoreInputs: true },
  );

  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <Tooltip placement="top">
        <TooltipTrigger asChild>
          <a
            href={href}
            aria-label="Edit page"
            aria-keyshortcuts="E"
            className="c-focus-ring flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-panel hover:text-text"
          >
            <PencilSimpleIcon aria-hidden size={EDIT_ICON_SIZE} />
          </a>
        </TooltipTrigger>
        <TooltipContent>
          <TooltipDescription description="Edit page (E)" />
        </TooltipContent>
      </Tooltip>
      <ShortcutKeys keys="E" />
    </span>
  );
}
