import { Outlet } from "@tanstack/react-router";
import { DateNavigationProvider } from "@web/views/Day/context/DateNavigationContext";

export function DayView() {
  return (
    <DateNavigationProvider>
      <Outlet />
    </DateNavigationProvider>
  );
}
