import { type ComponentType, lazy } from "react";
import { importOrReload } from "@web/common/utils/browser/missing-chunk-reload.util";

export type EmbeddedCheckoutProps = {
  publishableKey: string;
  fetchClientSecret: () => Promise<string>;
  onComplete: () => void;
  className?: string;
};

/**
 * Production default is a lazy wrapper around the Stripe port so @stripe/*
 * stays out of the boot chunk. The lighthouse script budget has ~13 KB of
 * headroom; a static import of that stack fails the gate.
 */
const LazyEmbeddedCheckout = lazy(() =>
  importOrReload(() => import("./embedded-checkout.port")),
);

let embeddedCheckoutOverride: ComponentType<EmbeddedCheckoutProps> | null =
  null;

export function getEmbeddedCheckoutComponent(): ComponentType<EmbeddedCheckoutProps> {
  return embeddedCheckoutOverride ?? LazyEmbeddedCheckout;
}

export function setEmbeddedCheckoutForTests(
  component: ComponentType<EmbeddedCheckoutProps> | null,
): void {
  embeddedCheckoutOverride = component;
}

export function resetEmbeddedCheckoutForTests(): void {
  embeddedCheckoutOverride = null;
}
