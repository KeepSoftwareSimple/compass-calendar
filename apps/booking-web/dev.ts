import { postcssPlugin } from "@web-build/plugins/postcss.plugin";
import { startStaticDevServer } from "@web-build/static-dev-server";
import { loadCompassConfig } from "@core/config/compass.config";
import { copyStaticAssets } from "./copy-static-assets";
import path from "node:path";

// loadCompassConfig() already resolves COMPASS_CONFIG_FILE itself.
const config = loadCompassConfig();

const WEB_PORT = Number(process.env.BOOKING_WEB_PORT) || 9081;
const OUTDIR = path.resolve(import.meta.dir, "../../build/booking-web");
const SRCDIR = path.resolve(import.meta.dir, "src");
const IS_DEV = (config.runtime.nodeEnv ?? "development") === "development";

const define: Record<string, string> = {
  "process.env": JSON.stringify({
    NODE_ENV: config.runtime.nodeEnv || "development",
    COMPASS_NODE_ENV: config.runtime.nodeEnv || "development",
    API_BASEURL: config.backend.apiUrl,
    POSTHOG_KEY: config.posthog?.key || "",
    POSTHOG_HOST: config.posthog?.host || "",
    PORT: String(config.backend.port ?? 3000),
  }),
  BUILD_VERSION: JSON.stringify("dev"),
};

async function build() {
  const result = await Bun.build({
    entrypoints: [path.resolve(import.meta.dir, "src/index.tsx")],
    outdir: path.join(OUTDIR, "meet"),
    target: "browser",
    sourcemap: IS_DEV ? "inline" : "none",
    minify: !IS_DEV,
    splitting: true,
    define,
    plugins: [postcssPlugin],
    publicPath: "/meet/",
  });

  if (!result.success) {
    console.error("[booking-web] build failed:");
    for (const message of result.logs) console.error(message);
    return false;
  }

  await copyStaticAssets(OUTDIR);
  return true;
}

await startStaticDevServer({
  label: "booking-web",
  port: WEB_PORT,
  outdir: OUTDIR,
  srcdir: SRCDIR,
  isDev: IS_DEV,
  build,
});
