import {
  ALWAYS_BOOT_SOURCES,
  collectBootOutputKeys,
  injectModulePreloads,
} from "../../inject-module-preloads";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const HTML = `<!doctype html>
<html>
  <head>
    <link rel="stylesheet" href="/index.css" />
  </head>
  <body></body>
</html>
`;

const staticImport = (p: string) => ({ path: p, kind: "import-statement" });
const dynamicImport = (p: string) => ({ path: p, kind: "dynamic-import" });

describe("injectModulePreloads", () => {
  let outdir: string;

  beforeEach(() => {
    outdir = mkdtempSync(path.join(tmpdir(), "inject-preloads-"));
  });

  afterEach(() => {
    rmSync(outdir, { recursive: true, force: true });
  });

  const writeHtml = (content: string) =>
    Bun.write(path.join(outdir, "index.html"), content);

  const readHtml = () => Bun.file(path.join(outdir, "index.html")).text();

  it("preloads the static closure plus the entry's boot dynamic import, excluding lazy chunks", async () => {
    await writeHtml(HTML);
    const metafile = {
      outputs: {
        "./index.js": {
          entryPoint: "src/index.tsx",
          imports: [
            staticImport("./chunk-static.js"),
            dynamicImport("./chunk-boot.js"),
          ],
        },
        "./chunk-static.js": { imports: [staticImport("./chunk-deep.js")] },
        "./chunk-deep.js": { imports: [] },
        "./chunk-boot.js": {
          imports: [
            staticImport("./chunk-shared.js"),
            dynamicImport("./chunk-lazy.js"),
          ],
        },
        "./chunk-shared.js": { imports: [] },
        "./chunk-lazy.js": { imports: [] },
      },
    };

    const critical = await injectModulePreloads(outdir, metafile, []);

    expect(critical).toEqual([
      "chunk-static.js",
      "chunk-boot.js",
      "chunk-deep.js",
      "chunk-shared.js",
    ]);
    expect(await readHtml()).toBe(`<!doctype html>
<html>
  <head>
    <link rel="stylesheet" href="/index.css" />
    <link rel="modulepreload" href="/chunk-static.js" />
  <link rel="modulepreload" href="/chunk-boot.js" />
  <link rel="modulepreload" href="/chunk-deep.js" />
  <link rel="modulepreload" href="/chunk-shared.js" />
</head>
  <body></body>
</html>
`);
  });

  it("visits shared chunks once and accepts a JSON-string metafile", async () => {
    await writeHtml(HTML);
    const metafile = JSON.stringify({
      outputs: {
        "./index.js": {
          entryPoint: "src/index.tsx",
          imports: [staticImport("./chunk-a.js"), staticImport("./chunk-b.js")],
        },
        "./chunk-a.js": { imports: [staticImport("./chunk-shared.js")] },
        "./chunk-b.js": { imports: [staticImport("./chunk-shared.js")] },
        "./chunk-shared.js": { imports: [] },
      },
    });

    const critical = await injectModulePreloads(outdir, metafile, []);

    expect(critical).toEqual(["chunk-a.js", "chunk-b.js", "chunk-shared.js"]);
  });

  it("preloads the chunk holding an always-boot source plus its static closure", async () => {
    await writeHtml(HTML);
    const metafile = {
      outputs: {
        "./index.js": {
          entryPoint: "src/index.tsx",
          imports: [staticImport("./chunk-boot.js")],
        },
        "./chunk-boot.js": {
          imports: [dynamicImport("./chunk-rootshell.js")],
        },
        "./chunk-rootshell.js": {
          // Input keys are cwd-relative in real builds; matched by suffix.
          inputs: { "packages/web/src/components/RootShell/RootShell.tsx": {} },
          imports: [
            staticImport("./chunk-auth.js"),
            dynamicImport("./chunk-lazy.js"),
          ],
        },
        "./chunk-auth.js": { imports: [] },
        "./chunk-lazy.js": { imports: [] },
      },
    };

    const critical = await injectModulePreloads(outdir, metafile, [
      "packages/web/src/components/RootShell/RootShell.tsx",
    ]);

    // The entry's own graph first, the always-boot closure after it.
    expect(critical).toEqual([
      "chunk-boot.js",
      "chunk-rootshell.js",
      "chunk-auth.js",
    ]);
  });

  it("preloads the week view's route chunks by default, not other lazy views", () => {
    // Every calendar load renders these four in series after React mounts,
    // so the default set must carry them; a lazy sibling view must not ride
    // along. Guards the list against a silent revert.
    expect(ALWAYS_BOOT_SOURCES).toEqual([
      "src/components/RootShell/AppRoot.tsx",
      "src/components/RootShell/RootShell.tsx",
      "src/views/Root.tsx",
      "src/views/Week/WeekView.tsx",
    ]);
    const metafile = {
      outputs: {
        "./index.js": {
          entryPoint: "src/index.tsx",
          imports: [staticImport("./chunk-boot.js")],
        },
        "./chunk-boot.js": {
          imports: [
            dynamicImport("./chunk-approot.js"),
            dynamicImport("./chunk-rootshell.js"),
            dynamicImport("./chunk-root.js"),
            dynamicImport("./chunk-week.js"),
            dynamicImport("./chunk-life.js"),
          ],
        },
        "./chunk-approot.js": {
          inputs: { "packages/web/src/components/RootShell/AppRoot.tsx": {} },
          imports: [],
        },
        "./chunk-rootshell.js": {
          inputs: { "packages/web/src/components/RootShell/RootShell.tsx": {} },
          imports: [],
        },
        "./chunk-root.js": {
          inputs: { "packages/web/src/views/Root.tsx": {} },
          imports: [staticImport("./chunk-root-only.js")],
        },
        "./chunk-root-only.js": { imports: [] },
        "./chunk-week.js": {
          inputs: { "packages/web/src/views/Week/WeekView.tsx": {} },
          imports: [
            staticImport("./chunk-week-only.js"),
            dynamicImport("./chunk-monthpicker.js"),
          ],
        },
        "./chunk-week-only.js": { imports: [] },
        "./chunk-monthpicker.js": { imports: [] },
        "./chunk-life.js": {
          inputs: { "packages/web/src/views/Life/LifeView.tsx": {} },
          imports: [],
        },
      },
    };

    const keys = collectBootOutputKeys(metafile);

    expect(keys).toEqual([
      "./index.js",
      "./chunk-boot.js",
      "./chunk-approot.js",
      "./chunk-rootshell.js",
      "./chunk-root.js",
      "./chunk-root-only.js",
      "./chunk-week.js",
      "./chunk-week-only.js",
    ]);
    expect(keys).not.toContain("./chunk-life.js");
    expect(keys).not.toContain("./chunk-monthpicker.js");
  });

  it("fails loudly when an always-boot source is in no output", async () => {
    await writeHtml(HTML);
    const metafile = {
      outputs: {
        "./index.js": {
          entryPoint: "src/index.tsx",
          imports: [staticImport("./chunk-a.js")],
        },
        "./chunk-a.js": { imports: [] },
      },
    };

    expect(
      injectModulePreloads(outdir, metafile, ["packages/web/src/Gone.tsx"]),
    ).rejects.toThrow("Always-boot source");
  });

  it("injects inside head even when a comment contains the closing tag text", async () => {
    await writeHtml(`<!doctype html>
<html>
  <head>
    <!-- links are injected before </head> -->
  </head>
  <body></body>
</html>
`);
    const metafile = {
      outputs: {
        "./index.js": {
          entryPoint: "src/index.tsx",
          imports: [staticImport("./chunk-a.js")],
        },
        "./chunk-a.js": { imports: [] },
      },
    };

    await injectModulePreloads(outdir, metafile, []);

    expect(await readHtml()).toBe(`<!doctype html>
<html>
  <head>
    <!-- links are injected before </head> -->
    <link rel="modulepreload" href="/chunk-a.js" />
</head>
  <body></body>
</html>
`);
  });

  it("fails loudly when the build passes no metafile", async () => {
    await writeHtml(HTML);

    expect(injectModulePreloads(outdir, undefined)).rejects.toThrow("metafile");
  });

  it("fails loudly when the walk finds no chunks", async () => {
    await writeHtml(HTML);
    const metafile = {
      outputs: {
        "./index.js": { entryPoint: "src/index.tsx", imports: [] },
      },
    };

    expect(injectModulePreloads(outdir, metafile, [])).rejects.toThrow(
      "No boot-critical chunks found",
    );
  });

  it("fails loudly when index.html has no head", async () => {
    await writeHtml("<html><body></body></html>");
    const metafile = {
      outputs: {
        "./index.js": {
          entryPoint: "src/index.tsx",
          imports: [staticImport("./chunk-a.js")],
        },
        "./chunk-a.js": { imports: [] },
      },
    };

    expect(injectModulePreloads(outdir, metafile, [])).rejects.toThrow(
      "no <head>",
    );
  });
});
