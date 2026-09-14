import {
  attributeBootBytesByPackage,
  bootSizeBudgetViolations,
  packageNameFromInput,
} from "../../boot-size-report";
import { describe, expect, it } from "bun:test";

const staticImport = (p: string) => ({ path: p, kind: "import-statement" });
const dynamicImport = (p: string) => ({ path: p, kind: "dynamic-import" });

const bunPkg = (name: string, version: string, file: string) =>
  `node_modules/.bun/${name.replace("/", "+")}@${version}/node_modules/${name}/${file}`;

describe("packageNameFromInput", () => {
  it("keys on the last node_modules segment, including scoped packages", () => {
    expect(packageNameFromInput(bunPkg("zod", "4.5.4", "index.js"))).toBe(
      "zod",
    );
    expect(
      packageNameFromInput(
        bunPkg("@phosphor-icons/react", "2.1.7", "dist/index.es.js"),
      ),
    ).toBe("@phosphor-icons/react");
    expect(packageNameFromInput("packages/web/src/index.tsx")).toBeNull();
  });
});

describe("attributeBootBytesByPackage", () => {
  it("sums bytesInOutput on the boot set and ignores lazy chunks", () => {
    const metafile = {
      outputs: {
        "./index.js": {
          entryPoint: "src/index.tsx",
          imports: [dynamicImport("./chunk-boot.js")],
          inputs: {
            "src/index.tsx": { bytesInOutput: 100 },
            [bunPkg("zod", "4.5.4", "index.js")]: { bytesInOutput: 500 },
            [bunPkg("zod", "4.5.4", "v4/locales/en.js")]: {
              bytesInOutput: 200,
            },
            [bunPkg("@phosphor-icons/react", "2.1.7", "dist/index.es.js")]: {
              bytesInOutput: 300,
            },
          },
        },
        "./chunk-boot.js": {
          imports: [staticImport("./chunk-shared.js")],
          inputs: {
            [bunPkg("dexie", "4.2.1", "dist/dexie.js")]: {
              bytesInOutput: 400,
            },
          },
        },
        "./chunk-shared.js": {
          imports: [dynamicImport("./chunk-lazy.js")],
          inputs: {
            [bunPkg("rrule", "2.7.2", "dist/esm/index.js")]: {
              bytesInOutput: 50,
            },
          },
        },
        "./chunk-lazy.js": {
          imports: [],
          inputs: {
            [bunPkg("zod", "4.5.4", "huge-lazy.js")]: {
              bytesInOutput: 9999,
            },
          },
        },
      },
    };

    const attributed = attributeBootBytesByPackage(metafile, [
      "./index.js",
      "./chunk-boot.js",
      "./chunk-shared.js",
    ]);

    expect(attributed).toEqual([
      { name: "zod", bytes: 700, localeBytes: 200 },
      { name: "dexie", bytes: 400, localeBytes: 0 },
      { name: "@phosphor-icons/react", bytes: 300, localeBytes: 0 },
      { name: "rrule", bytes: 50, localeBytes: 0 },
    ]);
  });
});

describe("bootSizeBudgetViolations", () => {
  it("names the package and the delta when a ceiling is breached", () => {
    const violations = bootSizeBudgetViolations(
      {
        chunkCount: 3,
        totalRawBytes: 1000,
        totalGzipBytes: 400,
        packages: [
          { name: "zod", bytes: 700, localeBytes: 200 },
          { name: "dexie", bytes: 400, localeBytes: 0 },
        ],
      },
      {
        chunkCount: 3,
        totalGzipBytes: 500,
        packages: { zod: 100, dexie: 400 },
      },
    );

    expect(violations).toEqual(["zod: 700 B exceeds ceiling 100 B by 600 B"]);
  });

  it("fails packages that have no declared ceiling", () => {
    const violations = bootSizeBudgetViolations(
      {
        chunkCount: 1,
        totalRawBytes: 50,
        totalGzipBytes: 20,
        packages: [{ name: "lodash", bytes: 50, localeBytes: 0 }],
      },
      { chunkCount: 10, totalGzipBytes: 100, packages: {} },
    );

    expect(violations).toEqual(["lodash: 50 B has no declared ceiling"]);
  });
});
