/**
 * Save-error anchors for Meeting settings fields. Hold-Mod chords for
 * in-page fields are gone: Settings only reveals sidebar digits and Enter.
 */
export const BOOKING_FIELDS = [
  "enabled",
  "address",
  "duration",
  "destination",
  "blocking",
  "timezone",
  "hours",
  "more",
  "notice",
  "horizon",
  "link",
] as const;

export type BookingField = (typeof BOOKING_FIELDS)[number];

export const BOOKING_FIELD_ATTR = "data-booking-field";

export const bookingFieldAttrs = (field: BookingField) =>
  ({ [BOOKING_FIELD_ATTR]: field }) as const;

const FOCUSABLE =
  'input, select, textarea, button, summary, [role="combobox"], [tabindex]:not([tabindex="-1"])';

/**
 * Focus a booking field by data attribute rather than a selector map.
 *
 * Focus, never click: several of these targets are checkboxes, and the
 * Settings idiom's focus-then-click would toggle them on the way past.
 */
export function focusBookingField(field: BookingField): boolean {
  const anchor = document.querySelector<HTMLElement>(
    `[${BOOKING_FIELD_ATTR}="${field}"]`,
  );
  if (!anchor) return false;

  let enclosing: HTMLElement | null = anchor.closest("details");
  while (enclosing instanceof HTMLDetailsElement) {
    enclosing.open = true;
    enclosing = enclosing.parentElement?.closest("details") ?? null;
  }

  const target = anchor.matches(FOCUSABLE)
    ? anchor
    : anchor.querySelector<HTMLElement>(FOCUSABLE);
  if (!target) return false;

  target.focus();
  return true;
}
