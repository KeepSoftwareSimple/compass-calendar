import path from "node:path";

export async function copyStaticAssets(outdir: string) {
  if (!(await Bun.file(path.join(outdir, "index.js")).exists())) {
    throw new Error(
      `Bundle output index.js missing from ${outdir}, but index.html references it by name`,
    );
  }

  await Bun.write(
    path.join(outdir, "index.html"),
    Bun.file(path.resolve(import.meta.dir, "src/index.html")),
  );
}
