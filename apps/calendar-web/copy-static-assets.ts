import { LANDING_ASSET_DIR, LANDING_HTML } from "./landing-static-path";
import path from "node:path";

// index.html references the bundle's outputs by fixed names: Bun names a JS
// entrypoint's outputs after the entry file (src/index.tsx -> /index.js +
// /index.css), so the HTML needs no tag rewriting and is copied verbatim like
// the other static assets. The assert fails the build loudly if that naming
// contract ever changes (e.g. the entry file is renamed or hashing is added).
export async function copyStaticAssets(outdir: string, apiBaseUrl: string) {
  for (const bundleOutput of ["index.js", "index.css"]) {
    if (!(await Bun.file(path.join(outdir, bundleOutput)).exists())) {
      throw new Error(
        `Bundle output ${bundleOutput} missing from ${outdir}, but index.html references it by name`,
      );
    }
  }

  await Bun.write(
    path.join(outdir, "index.html"),
    Bun.file(path.resolve(import.meta.dir, "src/index.html")),
  );

  // Copied unhashed (not via Bun's asset pipeline) so index.html's favicon
  // link and meta tags like og:image reference stable URLs across builds.
  await Bun.write(
    path.join(outdir, "favicon.ico"),
    Bun.file(path.resolve(import.meta.dir, "src/favicon.ico")),
  );
  await Bun.write(
    path.join(outdir, "og-image.png"),
    Bun.file(path.resolve(import.meta.dir, "src/assets/png/og-image.png")),
  );
  await Bun.write(
    path.join(outdir, "sitemap.xml"),
    Bun.file(path.resolve(import.meta.dir, "src/sitemap.xml")),
  );
  await Bun.write(
    path.join(outdir, "robots.txt"),
    Bun.file(path.resolve(import.meta.dir, "src/robots.txt")),
  );

  await Bun.write(
    path.join(outdir, "sample-life-in-weeks.pdf"),
    Bun.file(
      path.resolve(import.meta.dir, "src/assets/sample-life-in-weeks.pdf"),
    ),
  );

  // The landing game at /start is plain static files, kept out of the app
  // bundle so it costs the calendar nothing at boot.
  const landingDir = path.resolve(import.meta.dir, "src/landing");
  await Bun.write(
    path.join(outdir, LANDING_HTML),
    Bun.file(path.join(landingDir, "index.html")),
  );
  // The landing page is not bundled, so it gets the API base URL from a
  // generated script instead of the bundle's process.env define.
  await Bun.write(
    path.join(outdir, LANDING_ASSET_DIR, "config.js"),
    `window.COMPASS_API_BASEURL = ${JSON.stringify(apiBaseUrl)};\n`,
  );
  for (const asset of [
    "crt.css",
    "journey.js",
    "gamebook.js",
    "gamebook.story.js",
  ]) {
    await Bun.write(
      path.join(outdir, LANDING_ASSET_DIR, asset),
      Bun.file(path.join(landingDir, asset)),
    );
  }
}
