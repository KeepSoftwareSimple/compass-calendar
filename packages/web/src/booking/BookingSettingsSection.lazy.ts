import { lazyRouteComponent } from "@tanstack/react-router";

// Lazy: SettingsModal used to mount unconditionally in CompassRequiredProviders.
// A static import here still puts the whole booking admin stack (weekly-hours
// editor, the timezone combobox, the booking Zod contracts) in the Settings
// chunk — ~21KB gz that production never runs, since IS_BOOKING_ENABLED is
// false outside dev. Keep the split so opening Accounts does not download
// Booking. No preload helper: the section is already behind a settings page
// the user has to navigate to.
export const LazyBookingSettingsSection = lazyRouteComponent(
  () => import("@web/booking/BookingSettingsSection"),
  "BookingSettingsSection",
);
