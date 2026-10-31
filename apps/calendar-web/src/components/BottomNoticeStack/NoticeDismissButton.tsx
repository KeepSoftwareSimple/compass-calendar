import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import IconButton from "@web/components/IconButton/IconButton";

/** The X in a notice card or notice toast header. */
export function NoticeDismissButton({
  label = "Dismiss",
  onClick,
}: {
  label?: string;
  onClick: () => void;
}) {
  return (
    <IconButton
      aria-label={label}
      className="shrink-0 text-text-muted hover:text-text"
      onClick={onClick}
      size="small"
    >
      <XIcon aria-hidden="true" size={14} />
    </IconButton>
  );
}
