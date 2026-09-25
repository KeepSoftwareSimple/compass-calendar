import { z } from "zod/v4";
import { isBookingEnabled, isDev } from "@core/util/env.util";

export const getApiBaseUrl = (apiBaseUrl?: string, port?: string): string => {
  if (apiBaseUrl) {
    return apiBaseUrl;
  }

  if (!port) {
    throw new Error("PORT is required when API_BASEURL is not configured");
  }

  return `http://localhost:${port}/api`;
};

const API_BASEURL = getApiBaseUrl(process.env.API_BASEURL, process.env.PORT);
const BACKEND_BASEURL = API_BASEURL.replace(/\/[^/]*$/, "");

/**
 * Compass runtime environment from compass.yaml (`runtime.nodeEnv`), not Bun's
 * bundler NODE_ENV. Shipped web builds re-exec with NODE_ENV=production for
 * React, and Bun inlines that shell value into `process.env.NODE_ENV` even
 * when define also sets NODE_ENV from config. COMPASS_NODE_ENV is define-only.
 */
export function readCompassRuntimeNodeEnv(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.COMPASS_NODE_ENV ?? env.NODE_ENV ?? "production";
}

const webEnvSchema = z.object({
  API_BASEURL: z.string().url(),
  BACKEND_BASEURL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  APPLE_SERVICES_ID: z.string().optional(),
  NODE_ENV: z.string(),
  POSTHOG_KEY: z
    .string()
    .optional()
    .transform((val) => (val === "undefined" ? undefined : val)),
  POSTHOG_HOST: z
    .string()
    .optional()
    .transform((val) => (val === "undefined" ? undefined : val)),
});

export const ENV_WEB = webEnvSchema.parse({
  API_BASEURL,
  BACKEND_BASEURL,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
  APPLE_SERVICES_ID: process.env.APPLE_SERVICES_ID,
  NODE_ENV: readCompassRuntimeNodeEnv(),
  POSTHOG_KEY: process.env.POSTHOG_KEY,
  POSTHOG_HOST: process.env.POSTHOG_HOST,
});

export const IS_DEV = isDev(ENV_WEB.NODE_ENV);
export const IS_BOOKING_ENABLED = isBookingEnabled(ENV_WEB.NODE_ENV);
