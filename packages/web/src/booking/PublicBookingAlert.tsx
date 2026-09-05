import { type Ref } from "react";

interface PublicBookingAlertProps {
  message: string;
  alertRef: Ref<HTMLParagraphElement>;
}

export function PublicBookingAlert({
  message,
  alertRef,
}: PublicBookingAlertProps) {
  return (
    <p
      ref={alertRef}
      role="alert"
      tabIndex={-1}
      className="rounded-md border border-warning/40 bg-surface-panel px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent"
    >
      {message}
    </p>
  );
}
