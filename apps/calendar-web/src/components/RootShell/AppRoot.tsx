import { Outlet } from "@tanstack/react-router";

/** Minimal root outlet. Calendar chrome lives on the pathless calendar-shell layout. */
export function AppRoot() {
  return <Outlet />;
}
