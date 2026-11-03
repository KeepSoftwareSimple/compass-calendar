import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import IconButton from "@web/components/IconButton/IconButton";

/** Small × used by bottom-notice cards and the app-update toast. */
export function NoticeDismissButton({
  ariaLabel = "Dismiss",
  onClick,
}: {
  ariaLabel?: string;
  onClick: () => void;
}) {
  return (
    <IconButton
      aria-label={ariaLabel}
      className="shrink-0 text-text-muted hover:text-text"
      onClick={onClick}
      size="small"
    >
      <XIcon aria-hidden="true" size={14} />
    </IconButton>
  );
}
