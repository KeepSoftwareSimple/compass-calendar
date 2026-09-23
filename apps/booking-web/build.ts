import { postcssPlugin } from "@web-build/plugins/postcss.plugin";
import { copyStaticAssets } from "./copy-static-assets";
import path from "node:path";

const bundleNodeEnv =
  process.env.NODE_ENV === "development" ? "development" : "production";
if (process.env.NODE_ENV !== bundleNodeEnv) {
  const child = Bun.spawn([process.execPath, import.meta.path], {
    env: { ...process.env, NODE_ENV: bundleNodeEnv },
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  process.exit(await child.exited);
}

const OUTDIR = path.resolve(import.meta.dir, "../../build/booking-web");

const define: Record<string, string> = {
  "process.env": JSON.stringify({
    NODE_ENV: bundleNodeEnv,
    API_BASEURL: process.env.API_BASEURL ?? "http://localhost:3000/api",
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "",
    POSTHOG_KEY: process.env.POSTHOG_KEY ?? "",
    POSTHOG_HOST: process.env.POSTHOG_HOST ?? "",
    PORT: process.env.PORT ?? "3000",
  }),
  BUILD_VERSION: JSON.stringify(process.env.BUILD_VERSION ?? "production"),
};

console.log("[booking-web] building...");

const result = await Bun.build({
  entrypoints: [path.resolve(import.meta.dir, "src/index.tsx")],
  outdir: OUTDIR,
  target: "browser",
  sourcemap: "external",
  minify: true,
  splitting: true,
  define,
  plugins: [postcssPlugin],
  publicPath: "/",
});

if (!result.success) {
  console.error("[booking-web] build failed:");
  for (const message of result.logs) {
    console.error(message);
  }
  process.exit(1);
}

await copyStaticAssets(OUTDIR);

console.log(`[booking-web] build complete → ${OUTDIR}`);
