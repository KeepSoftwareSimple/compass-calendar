declare module "*.css";

declare const BUILD_VERSION: string;

interface Window {
  __COMPASS_E2E_STORE__?: Record<string, unknown>;
  __COMPASS_E2E_TEST__?: boolean;
  __COMPASS_E2E_HOOKS__?: Record<string, unknown>;
}
