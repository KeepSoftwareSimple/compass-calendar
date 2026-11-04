import { useHotkey } from "@tanstack/react-hotkeys";
import { meetingSetupRootHref } from "@web/booking/meeting-setup.search";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";

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
    <a
      href={href}
      className="c-focus-ring inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md border border-border bg-surface-panel px-2.5 py-1 font-medium text-sm text-text transition-colors hover:bg-surface-raised"
    >
      Edit page
      <ShortcutKeys keys="E" />
    </a>
  );
}
