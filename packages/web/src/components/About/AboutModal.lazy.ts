import { lazyRouteComponent } from "@tanstack/react-router";

// Lazy: About is a palette-only dialog. A static import from CompassProvider
// kept its overlay and social-icon graph on the boot path of every page load.
export const LazyAboutModal = lazyRouteComponent(
  () => import("@web/components/About/AboutModal"),
  "AboutModal",
);
