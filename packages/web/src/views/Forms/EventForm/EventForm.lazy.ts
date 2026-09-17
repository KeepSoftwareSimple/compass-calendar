import { lazyRouteComponent } from "@tanstack/react-router";

// Lazy: EventForm transitively pulls in TipTap, react-datepicker, and
// react-select — none of which should download on app boot. This is the only
// static edge into that graph, so splitting here keeps the editor stack in
// its own chunk until a form opens (or the first-input preload warms it).
// lazyRouteComponent works as a plain Suspense child and adds .preload()
// plus a one-time reload when a deploy invalidates the chunk hash.
export const LazyEventForm = lazyRouteComponent(
  () => import("@web/views/Forms/EventForm/EventForm"),
  "EventForm",
);

/**
 * Starts downloading the form chunk on the user's first input, so the form
 * opens without a visible fetch. Deliberately input-driven rather than a
 * timer: an idle timer would fire during Lighthouse's trace window and count
 * the chunk back into the boot script-transfer budget it was split to avoid.
 * app.bootstrap arms it after the router's first navigation resolves, so an
 * early mouse move cannot start this download while boot chunks are in flight.
 */
export const preloadEventFormOnFirstInput = (): void => {
  const controller = new AbortController();
  const warm = () => {
    controller.abort();
    void LazyEventForm.preload?.();
  };
  for (const type of ["pointermove", "pointerdown", "keydown"] as const) {
    window.addEventListener(type, warm, {
      passive: true,
      signal: controller.signal,
    });
  }
};
