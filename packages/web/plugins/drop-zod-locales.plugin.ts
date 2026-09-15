import { type BunPlugin } from "bun";

/**
 * `zod/v4` re-exports every locale table (`export * as locales from
 * "../locales/index.js"`). Compass never calls `z.config` / `z.locales`, but
 * Bun still emits the barrel because it is a property of the `z` namespace.
 * English stays: `classic/schemas.js` imports `../locales/en.js` directly.
 */
export const ZOD_LOCALES_BARREL_FILTER =
  /[/\\]zod[/\\](?:v4[/\\])?locales[/\\]index\.(?:js|cjs|mjs)$/;

export const EMPTY_ZOD_LOCALES_MODULE = "export {};\n";

export const dropZodLocalesPlugin: BunPlugin = {
  name: "drop-zod-locales",
  setup(build) {
    build.onLoad({ filter: ZOD_LOCALES_BARREL_FILTER }, () => ({
      contents: EMPTY_ZOD_LOCALES_MODULE,
      loader: "js",
    }));
  },
};
