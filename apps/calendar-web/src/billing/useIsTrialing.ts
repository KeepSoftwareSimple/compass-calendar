import { useAppAccess } from "@web/billing/useAppAccess";

/**
 * True only while a Stripe trial is running. Gates the surfaces that offer an
 * early upgrade: the sidebar badge, the palette command, the "B" shortcut, and
 * that shortcut's row in the `?` legend.
 */
export function useIsTrialing(): boolean {
  const access = useAppAccess();
  return access.kind === "server" && access.status === "trialing";
}
