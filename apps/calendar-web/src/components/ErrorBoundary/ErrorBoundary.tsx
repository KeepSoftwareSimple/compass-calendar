import { Component, type ErrorInfo, type PropsWithChildren } from "react";
import { getPosthogClient } from "@web/auth/posthog/posthog.bootstrap";
import {
  isMissingChunkError,
  reloadOnceForMissingChunk,
} from "@web/common/utils/browser/missing-chunk-reload.util";
import { SomethingBrokeView } from "@web/components/ErrorBoundary/SomethingBrokeView";

interface ErrorBoundaryState {
  hasError: boolean;
  // A chunk that a deploy removed: render nothing while the one-time reload
  // runs, so the user does not see the error screen flash first.
  isReloading: boolean;
}

/**
 * Top-level React error boundary.
 *
 * Before this existed, a render-phase throw anywhere in the tree unmounted the
 * whole app and left a blank, unrecoverable page - and, because PostHog's
 * exception handlers only cover async/global errors (not render errors), it did
 * so with zero telemetry (see session 019fb57e). This boundary turns that into
 * a visible recovery surface and reports the caught error to PostHog so the
 * crash is no longer invisible.
 *
 * Reporting uses the PostHog singleton rather than a hook so the class can call
 * it directly; it is a no-op when PostHog is disabled.
 */
export class ErrorBoundary extends Component<
  PropsWithChildren,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, isReloading: false };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, isReloading: isMissingChunkError(error) };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    if (reloadOnceForMissingChunk(error, "react-error-boundary")) return;
    if (this.state.isReloading) this.setState({ isReloading: false });

    // React can deliver non-Error throwables (including `undefined`). Pass a
    // real Error to PostHog so we don't get "Primitive value captured as
    // exception: undefined" with no actionable message.
    const reportable =
      error instanceof Error
        ? error
        : new Error(
            `Non-Error render throw: ${
              error === undefined ? "undefined" : String(error)
            }`,
          );

    getPosthogClient()?.captureException(reportable, {
      $exception_handled: false,
      $exception_source: "react-error-boundary",
      componentStack: errorInfo.componentStack,
    });
    // Keep a console record for local dev / when PostHog is disabled.
    console.error("Uncaught render error:", error, errorInfo);
  }

  render() {
    if (this.state.isReloading) return null;
    if (this.state.hasError) {
      return <SomethingBrokeView />;
    }

    return this.props.children;
  }
}
