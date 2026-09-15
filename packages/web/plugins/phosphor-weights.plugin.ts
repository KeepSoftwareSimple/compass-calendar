import { type BunPlugin } from "bun";

/** Weights the app actually passes. IconBase looks them up dynamically, so unused entries cannot tree-shake. */
const UNUSED_WEIGHT_ENTRY =
  /\n {2}\[\n {4}"(?:thin|light|duotone)",[\s\S]*?\n {2}\],?/g;

export function stripUnusedPhosphorWeights(source: string): string {
  return source.replace(UNUSED_WEIGHT_ENTRY, "");
}

/**
 * Phosphor CSR icon defs ship six SVG weights. Deep imports drop unused
 * glyphs; this drops the three weights no web source requests so the boot
 * set stays under the 30 KB phosphor ceiling.
 */
export const phosphorWeightsPlugin: BunPlugin = {
  name: "phosphor-weights",
  setup(build) {
    build.onLoad(
      { filter: /phosphor-icons\/react\/dist\/defs\/.+\.es\.js$/ },
      async ({ path }) => ({
        contents: stripUnusedPhosphorWeights(await Bun.file(path).text()),
        loader: "js",
      }),
    );
  },
};
