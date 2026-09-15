import { loadCompassConfig } from "@core/config/compass.config";
import { copyStaticAssets } from "./copy-static-assets";
import { injectModulePreloads } from "./inject-module-preloads";
import { phosphorWeightsPlugin } from "./plugins/phosphor-weights.plugin";
import { postcssPlugin } from "./plugins/postcss.plugin";
import { execSync } from "node:child_process";
import path from "node:path";

const config = loadCompassConfig();

function getBuildHash(): string {
  const fallbackBuildRef = process.env.COMPASS_BUILD_REF || "self-host";
  const compassRepoRoot = path.resolve(import.meta.dir, "../..");

  try {
    const gitWorkTreeRoot = path.resolve(
      execSync("git rev-parse --show-toplevel", {
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim(),
    );

    if (gitWorkTreeRoot !== compassRepoRoot) {
      return fallbackBuildRef;
    }
  } catch {
    return fallbackBuildRef;
  }

  return execSync("git rev-parse --short HEAD", {
    stdio: ["ignore", "pipe", "inherit"],
  })
    .toString()
    .trim();
}

const buildHash = getBuildHash();
const BUILD_VERSION =
  buildHash === "self-host" ? `${Date.now()}-self-host` : buildHash;
const OUTDIR = path.resolve(import.meta.dir, "../../build/web");

// Define process.env as a whole object so both dot and bracket notation work:
// process.env.NODE_ENV and process.env["NODE_ENV"] are both replaced correctly.
const define: Record<string, string> = {
  "process.env": JSON.stringify({
    NODE_ENV: config.runtime.nodeEnv || "production",
    API_BASEURL: config.backend.apiUrl,
    GOOGLE_CLIENT_ID: config.google?.clientId || "",
    MICROSOFT_CLIENT_ID:
      process.env.MICROSOFT_CLIENT_ID || config.microsoft?.clientId || "",
    APPLE_SERVICES_ID:
      process.env.APPLE_SERVICES_ID || config.apple?.signIn?.servicesId || "",
    POSTHOG_KEY: config.posthog?.key || "",
    POSTHOG_HOST: config.posthog?.host || "",
    PORT: String(config.backend.port ?? 3000),
  }),
  BUILD_VERSION: JSON.stringify(BUILD_VERSION),
};

// biome-ignore lint/suspicious/noConsole: Preserve build progress output.
console.log(`Building version ${BUILD_VERSION}...`);

const result = await Bun.build({
  entrypoints: [path.resolve(import.meta.dir, "src/index.tsx")],
  outdir: OUTDIR,
  target: "browser",
  sourcemap: "external",
  minify: true,
  splitting: true,
  metafile: true,
  define,
  plugins: [postcssPlugin, phosphorWeightsPlugin],
  publicPath: "/",
});

if (!result.success) {
  console.error("Build failed:");
  for (const message of result.logs) {
    console.error(message);
  }
  process.exit(1);
}

await Bun.write(
  path.join(OUTDIR, "version.json"),
  JSON.stringify({ version: BUILD_VERSION }, null, 2),
);

await copyStaticAssets(OUTDIR);
const preloaded = await injectModulePreloads(OUTDIR, result.metafile);

// biome-ignore lint/suspicious/noConsole: Preserve build progress output.
console.log(`Build complete → ${OUTDIR}`);
// biome-ignore lint/suspicious/noConsole: Preserve build progress output.
console.log(`  ${result.outputs.length} files written`);
// biome-ignore lint/suspicious/noConsole: Preserve build progress output.
console.log(`  ${preloaded.length} boot chunks modulepreloaded in index.html`);
