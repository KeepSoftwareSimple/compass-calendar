import { lazyRouteComponent } from "@tanstack/react-router";

// Lazy: SettingsModal is a static import of its host, which CompassProvider
// always mounts, so a static import here would put the whole booking admin
// stack (weekly-hours editor, the timezone combobox, the booking Zod
// contracts) in the boot chunk of every page load — ~21KB gz that production
// never runs, since IS_BOOKING_ENABLED is false outside dev. This is the only
// static edge into that graph. No preload helper: unlike the event form, the
// section is already behind a settings page the user has to navigate to.
export const LazyBookingSettingsSection = lazyRouteComponent(
  () => import("@web/booking/BookingSettingsSection"),
  "BookingSettingsSection",
);
