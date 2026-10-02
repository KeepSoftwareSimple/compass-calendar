export const ensureDesktopExportEnv = (): void => {
  process.env["PORT"] ??= "3001";
  process.env["API_BASEURL"] ??= "http://127.0.0.1:3001/api";
  process.env["NODE_ENV"] ??= "test";
  process.env["COMPASS_NODE_ENV"] ??= "test";
};
