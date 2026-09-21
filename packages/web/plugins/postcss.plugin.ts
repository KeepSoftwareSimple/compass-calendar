import tailwindcss from "@tailwindcss/postcss";
import { type BunPlugin } from "bun";
import postcss from "postcss";
import {
  inlineBootPhosphorIcons,
  stripUnusedPhosphorWeights,
} from "../../scripts/src/testing/check-agent-constraints";

/**
 * Bun plugin that processes CSS files through PostCSS + Tailwind 4.
 *
 * Bun's CSS bundler does not automatically run PostCSS, so Tailwind 4's
 * @theme, @source, @utility, and @import "tailwindcss" directives would be
 * treated as invalid rules without this plugin.
 */
export const postcssPlugin: BunPlugin = {
  name: "postcss",
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async ({ path }) => {
      const css = await Bun.file(path).text();
      const result = await postcss([tailwindcss()]).process(css, {
        from: path,
      });
      return { contents: result.css, loader: "css" };
    });

    // Same plugin as CSS so build.ts does not grow a second plugin file.
    // Defs drop weights the app never requests. Four boot modules inline
    // X and Check so those glyphs do not form their own boot chunk.
    build.onLoad(
      { filter: /phosphor-icons\/react\/dist\/defs\/.+\.es\.js$/ },
      async ({ path }) => ({
        contents: stripUnusedPhosphorWeights(await Bun.file(path).text()),
        loader: "js",
      }),
    );
    build.onLoad(
      {
        filter:
          /(?:ConnectCalendarPrompt|DiscardUnsavedChangesDialog|MissingPermissionsModal|PointerHint)\.tsx$/,
      },
      async ({ path }) => ({
        contents: inlineBootPhosphorIcons(path, await Bun.file(path).text()),
        loader: "tsx",
      }),
    );
  },
};
