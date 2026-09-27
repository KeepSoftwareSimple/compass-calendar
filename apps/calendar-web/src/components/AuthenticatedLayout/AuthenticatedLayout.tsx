import { Outlet } from "@tanstack/react-router";
import { useResponsiveLayout } from "@web/components/AuthenticatedLayout/useResponsiveLayout";

/**
 * Layout component for authenticated routes
 * Handles shared logic like data refetching that should run for all authenticated views
 */
export const AuthenticatedLayout = () => {
  useResponsiveLayout();
  return <Outlet />;
};
