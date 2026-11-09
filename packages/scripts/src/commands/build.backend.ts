/**
 * Backend production build script.
 *
 * Bundles the Express app into a single Bun-native file.
 * All JS/TS dependencies (including @compass/core) are inlined.
 *
 * Usage:
 *   bun run build:backend
 */

import {
  COMPASS_BUILD_DEV,
  COMPASS_ROOT_DEV,
} from "@scripts/common/cli.constants";
import { $ } from "bun";
import path from "node:path";
import { styleText } from "node:util";

const BACKEND_BUILD = path.join(COMPASS_BUILD_DEV, "backend");

const log = {
  info: (msg: string) => console.log(styleText(["italic", "whiteBright"], msg)),
  error: (msg: string) => console.log(styleText(["bold", "red"], msg)),
  warning: (msg: string) => console.log(styleText("yellow", msg)),
  success: (msg: string) => console.log(styleText("green", msg)),
  tip: (msg: string) => console.log(styleText("yellowBright", msg)),
};

// 1. Clean old build
log.info("Removing old backend build ...");
await $`rm -rf ${BACKEND_BUILD}`.quiet();
log.success("Removed old backend build");

// 2. Bundle — full bundle so @compass/core and all JS/TS deps are inlined.
log.info("Bundling backend ...");
const result = await Bun.build({
  entrypoints: [path.join(COMPASS_ROOT_DEV, "packages/backend/src/app.ts")],
  outdir: BACKEND_BUILD,
  target: "bun",
  external: ["@resvg/resvg-js"],
  sourcemap: "inline",
  minify: false,
});

if (!result.success) {
  log.error("Backend bundle failed:");
  for (const msg of result.logs) console.error(msg);
  process.exit(1);
}
log.success(`Bundled → ${BACKEND_BUILD}/app.js`);

// 3. Copy config file when present for local bundled runs.
const configPath = process.env["COMPASS_CONFIG_FILE"]
  ? path.resolve(process.env["COMPASS_CONFIG_FILE"])
  : path.join(COMPASS_ROOT_DEV, "compass.yaml");

if (await Bun.file(configPath).exists()) {
  await $`cp ${configPath} ${BACKEND_BUILD}/compass.yaml`.quiet();
  log.success("Copied Compass config file");
} else {
  log.warning(`Compass config file not found: ${configPath}`);
}

// 4. Keep the native PNG renderer external and ship its font asset.
await Bun.write(
  path.join(BACKEND_BUILD, "package.json"),
  JSON.stringify({ dependencies: { "@resvg/resvg-js": "2.6.2" } }, null, 2),
);

for (const asset of ["Rubik-Regular.ttf", "Rubik-SemiBold.ttf", "OFL.txt"]) {
  await Bun.write(
    path.join(BACKEND_BUILD, "assets", asset),
    Bun.file(
      path.join(COMPASS_ROOT_DEV, "packages/backend/src/email/assets", asset),
    ),
  );
}

// 5. Install the renderer binary for the target production platform.
log.info("Installing production dependency metadata ...");
const install = Bun.spawnSync({
  cmd: ["bun", "install", "--production", "--ignore-scripts", "--no-progress"],
  cwd: BACKEND_BUILD,
  stderr: "inherit",
  stdout: "inherit",
});
if (install.exitCode !== 0) {
  log.error("Dependency installation failed");
  process.exit(install.exitCode);
}

log.success("Backend build complete");
log.tip(`  Runtime: cd ${BACKEND_BUILD} && bun app.js`);
