/** Shared backend test environment variables for preload and test-with-mongo. */
export function applyBackendTestEnv(mongoUri: string): void {
  process.env["BASEURL"] = "https://foo.yourdomain.app";
  process.env["CORS"] =
    "https://foo.yourdomain.app,http://localhost:3000,http://localhost:9080";
  process.env["PORT"] = "3000";
  process.env["MONGO_URI"] = mongoUri;
  process.env["DB"] = "test-db";
  process.env["GOOGLE_CLIENT_ID"] = "googleClientId";
  process.env["GOOGLE_CLIENT_SECRET"] = "googleSecret";
  process.env["SUPERTOKENS_URI"] = "http://localhost:3000";
  process.env["SUPERTOKENS_KEY"] = "sTKey";
  process.env["TOKEN_COMPASS_SYNC"] = "secretToken2";
  process.env["SYNC_SERVICE_URL"] = "http://localhost:3010";
  process.env["SYNC_INTERNAL_AUTH_TOKEN"] = "syncInternalAuthToken";
  process.env["FRONTEND_URL"] = "http://localhost:9080";
  process.env["TZ"] = "Etc/UTC";
  process.env["NODE_ENV"] = "test";
  process.env["LOG_LEVEL"] = "debug";
  // The `debug` package (pulled in by mongodb-memory-server) decides whether
  // to colorize by calling tty.isatty(process.stderr.fd) at import time. Under
  // `bun test --parallel` with piped stderr that lazy stderr init has crashed
  // workers ("EEXIST: file already exists, epoll_ctl", then
  // "undefined is not an object (evaluating 'process.stderr.fd')") and failed
  // an otherwise green run. Any DEBUG_COLORS value makes `debug` skip the tty
  // probe entirely.
  process.env["DEBUG_COLORS"] = "0";
}

export function backendTestSpawnEnv(
  mongoUri: string,
): Record<string, string | undefined> {
  applyBackendTestEnv(mongoUri);
  return {
    ...process.env,
    COMPASS_TEST_MONGO_URI: mongoUri,
    SYNC_MONGO_URI: mongoUri,
  };
}
