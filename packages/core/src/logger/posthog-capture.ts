import { sanitizeBookingTelemetry } from "@core/booking/booking-telemetry";
import { Logger } from "@core/logger/winston.logger";

const logger = Logger("posthog:capture");

export interface PostHogCaptureClient {
  capture: (input: {
    event: string;
    distinctId: string;
    properties: Record<string, unknown>;
  }) => Promise<void>;
  shutdown: () => Promise<void>;
}

export interface PostHogCaptureOptions {
  apiKey: string;
  host: string;
  /** Reported as `$lib` so PostHog can split events by emitting service. */
  lib: string;
  fetch?: typeof fetch;
}

const DEFAULT_HOST = "https://us.i.posthog.com";

// Thin HTTP capture client for server-side product events. No-ops are handled
// by the caller when apiKey is absent — this client always attempts delivery.
export function createPostHogCaptureClient(
  options: PostHogCaptureOptions,
): PostHogCaptureClient {
  const host = options.host.replace(/\/+$/, "") || DEFAULT_HOST;
  const send = options.fetch ?? globalThis.fetch;

  return {
    async capture({ event, distinctId, properties }) {
      const response = await send(new URL("/i/v0/e/", host), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: options.apiKey,
          distinct_id: distinctId,
          event,
          properties: {
            ...sanitizeBookingTelemetry(properties, { dropUnsafeKeys: true }),
            $lib: options.lib,
          },
        }),
      });
      if (!response.ok) {
        throw new Error(
          `PostHog capture rejected with status ${response.status}`,
        );
      }
    },
    async shutdown() {
      // Stateless HTTP client — nothing to flush.
    },
  };
}

// Best-effort capture: log and continue on failure so telemetry never takes
// down the process that emits it.
export async function captureSafely(
  client: PostHogCaptureClient | null,
  input: {
    event: string;
    distinctId: string;
    properties: Record<string, unknown>;
  },
): Promise<boolean> {
  if (!client) return false;
  try {
    await client.capture(input);
    return true;
  } catch (error) {
    logger.warn(
      `PostHog capture failed for ${input.event}: ${
        error instanceof Error ? error.message : "unknown"
      }`,
    );
    return false;
  }
}

export { DEFAULT_HOST as DEFAULT_POSTHOG_HOST };
