/**
 * Fixed environment for every desktop-export producer. The web fixture
 * modules run in-process under `bun cli desktop:export` and again under
 * `test:scripts`/`test:web`, and the Swift parity tests compare their output
 * byte for byte, so both entry points have to pin the same clock, timezone,
 * and API base before any module reads them. Keeping one copy is what stops
 * a drifted `TZ` from showing up as unexplained fixture churn.
 */
export const ensureDesktopExportEnv = (): void => {
  process.env["TZ"] = "UTC";
  process.env["PORT"] ??= "3001";
  process.env["API_BASEURL"] ??= "http://127.0.0.1:3001/api";
  process.env["NODE_ENV"] ??= "test";
  process.env["COMPASS_NODE_ENV"] ??= "test";
};
