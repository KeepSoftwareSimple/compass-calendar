import { useSyncExternalStore } from "react";
import {
  getSseDegradedSinceMs,
  isSseDegraded,
  subscribeSseDegraded,
} from "@web/sse/client/sse.client";

/**
 * Whether the live SSE stream has been down long enough that displayed data
 * can no longer be trusted as fresh. Surfaces sse.client's previously
 * analytics-only degraded signal to the UI, so a dead stream on an open tab
 * doesn't keep claiming "Calendar connected" / "Updated N minutes ago".
 */
export function useSseDegraded(): boolean {
  return useSyncExternalStore(subscribeSseDegraded, isSseDegraded);
}

/**
 * Epoch ms at which the stream became degraded, or null while healthy. The
 * sidebar uses it to offer a reload once an outage has run long enough that
 * native EventSource reconnect is unlikely to recover on its own.
 */
export function useSseDegradedSince(): number | null {
  return useSyncExternalStore(subscribeSseDegraded, getSseDegradedSinceMs);
}
