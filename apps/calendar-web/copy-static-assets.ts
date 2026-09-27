import path from "node:path";

// index.html references the bundle's outputs by fixed names: Bun names a JS
// entrypoint's outputs after the entry file (src/index.tsx -> /index.js +
// /index.css), so the HTML needs no tag rewriting and is copied verbatim like
// the other static assets. The assert fails the build loudly if that naming
// contract ever changes (e.g. the entry file is renamed or hashing is added).
export async function copyStaticAssets(outdir: string) {
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
}
