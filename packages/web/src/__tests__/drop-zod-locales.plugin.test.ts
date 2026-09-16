import {
  dropZodLocalesPlugin,
  EMPTY_ZOD_LOCALES_MODULE,
  ZOD_LOCALES_BARREL_FILTER,
} from "../../plugins/drop-zod-locales.plugin";
import { describe, expect, it } from "bun:test";

describe("dropZodLocalesPlugin", () => {
  it("matches the locales barrel, not the English locale module", () => {
    expect(
      ZOD_LOCALES_BARREL_FILTER.test(
        "node_modules/.bun/zod@4.5.4/node_modules/zod/v4/locales/index.js",
      ),
    ).toBe(true);
    expect(
      ZOD_LOCALES_BARREL_FILTER.test(
        "node_modules/.bun/zod@4.5.4/node_modules/zod/locales/index.js",
      ),
    ).toBe(true);
    expect(
      ZOD_LOCALES_BARREL_FILTER.test(
        "node_modules/.bun/zod@4.5.4/node_modules/zod/v4/locales/en.js",
      ),
    ).toBe(false);
    expect(
      ZOD_LOCALES_BARREL_FILTER.test(
        "node_modules/.bun/zod@4.5.4/node_modules/zod/v4/classic/external.js",
      ),
    ).toBe(false);
  });

  it("stubs the locales barrel so unused locale tables are not emitted", async () => {
    const result = await Bun.build({
      entrypoints: [
        new URL(import.meta.resolve("./drop-zod-locales.plugin.fixture.ts"))
          .pathname,
      ],
      plugins: [dropZodLocalesPlugin],
      minify: true,
    });

    expect(result.success).toBe(true);
    const source = (
      await Promise.all(result.outputs.map((output) => output.text()))
    ).join("\n");
    expect(source).not.toContain("dirección de correo electrónico");
    expect(source).toContain("Invalid input");
  });

  it("exports an empty module for the barrel", () => {
    expect(EMPTY_ZOD_LOCALES_MODULE).toBe("export {};\n");
  });
});
