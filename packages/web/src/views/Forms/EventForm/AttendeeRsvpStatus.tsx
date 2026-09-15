import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { MinusIcon } from "@phosphor-icons/react/dist/csr/Minus";
import { QuestionIcon } from "@phosphor-icons/react/dist/csr/Question";
import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { type AttendeeResponseStatus } from "@core/types/event-attendance.contracts";
import { ATTENDEE_RSVP_LABEL } from "@web/views/Forms/EventForm/attendee-rsvp";

const STATUS_ICON = {
  accepted: CheckIcon,
  declined: XIcon,
  tentative: QuestionIcon,
  needsAction: MinusIcon,
} as const;

const STATUS_CLASS: Record<AttendeeResponseStatus, string> = {
  accepted: "bg-success text-on-accent",
  declined: "bg-error text-on-accent",
  tentative: "bg-warning text-on-accent",
  needsAction: "bg-text-subtle text-on-accent",
};

/**
 * Compact RSVP badge for guest chips and the read-only guest list. Decorative
 * only — the parent row/chip carries the accessible name so color is never
 * the sole signal.
 */
export const AttendeeRsvpStatus = ({
  status,
}: {
  status: AttendeeResponseStatus;
}) => {
  const Icon = STATUS_ICON[status];
  return (
    <span
      aria-hidden
      title={ATTENDEE_RSVP_LABEL[status]}
      className={`inline-flex size-3.5 shrink-0 items-center justify-center rounded-full ${STATUS_CLASS[status]}`}
    >
      <Icon size={10} weight="bold" />
    </span>
  );
};
