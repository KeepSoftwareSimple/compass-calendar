import { type BookingGuestActionKind } from "@core/types/booking.contracts";

export type BookingHostEmailKind = BookingGuestActionKind;

export function isBookingHostEmailKind(
  kind: string | undefined | null,
): kind is BookingHostEmailKind {
  return kind === "booked" || kind === "cancelled" || kind === "rescheduled";
}

export function buildBookingHostEmailLedgerId(input: {
  reservationId: string;
  lastGuestActionAt: Date;
  kind: BookingHostEmailKind;
}): string {
  return `booking-host:${input.reservationId}:${input.lastGuestActionAt.getTime()}:${input.kind}`;
}

export function parseBookingHostEmailLedgerId(id: string): {
  reservationId: string;
  kind: BookingHostEmailKind;
} | null {
  const match =
    /^booking-host:([0-9a-f]{24}):\d+:(booked|cancelled|rescheduled)$/.exec(id);
  if (!match) {
    return null;
  }
  return {
    reservationId: match[1] as string,
    kind: match[2] as BookingHostEmailKind,
  };
}
