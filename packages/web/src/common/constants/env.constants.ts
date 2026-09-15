import { z } from "zod/v4";
import { isBookingEnabled } from "@core/util/env.util";

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
  NODE_ENV: process.env.NODE_ENV,
  POSTHOG_KEY: process.env.POSTHOG_KEY,
  POSTHOG_HOST: process.env.POSTHOG_HOST,
});

// Compare NODE_ENV directly so production builds can fold this to `false`
// (build.ts defines `process.env.NODE_ENV` as a string literal). A runtime
// helper over `ENV_WEB.NODE_ENV` is not a compile-time constant, so `if
// (IS_DEV)` would keep dead imports in the boot graph.
export const IS_DEV = process.env.NODE_ENV === "development";
export const IS_BOOKING_ENABLED = isBookingEnabled(ENV_WEB.NODE_ENV);
