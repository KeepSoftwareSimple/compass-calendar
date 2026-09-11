// sort-imports-ignore

import { createRequire } from "node:module";
import path from "node:path";

type AliasApi = {
  addAliases(aliases: Record<string, string>): void;
};

const isBuildRuntime =
  typeof (globalThis as { Bun?: unknown }).Bun === "undefined" &&
  __dirname.includes(`${path.sep}build${path.sep}`);

if (isBuildRuntime) {
  const require = createRequire(__filename);
  const aliasApi = require("module-alias") as AliasApi;

  aliasApi.addAliases({
    "@backend": `${__dirname}`,
    "@core": `${path.resolve(__dirname, "../../core/src")}`,
  });
}

import { Logger } from "@core/logger/winston.logger";
import { startPostHogLogs } from "./logging/posthog-logs";

startPostHogLogs();

export const logger: ReturnType<typeof Logger> = Logger("app:root");
