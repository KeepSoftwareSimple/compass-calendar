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

    // zod/v4 re-exports every locale as a property of the z namespace, so
    // Bun emits the locales barrel even though Compass never calls
    // z.config or z.locales. English stays: classic/schemas.js imports
    // ../locales/en.js directly.
    build.onLoad(
      {
        filter: /[/\\]zod[/\\](?:v4[/\\])?locales[/\\]index\.(?:js|cjs|mjs)$/,
      },
      () => ({
        contents: "export {};\n",
        loader: "js",
      }),
    );

    // zod/v4's namespace object (`import { z }`) keeps every re-export.
    // Compile and JSON Schema are not called anywhere in Compass. Replace
    // those modules with empty exports so the boot set does not pay for them.
    // Parse, checks, and locales/en stay real.
    build.onLoad(
      {
        filter:
          /[/\\]zod[/\\]v4[/\\](?:core[/\\]compile|core[/\\]to-json-schema|core[/\\]json-schema-processors|core[/\\]json-schema-generator|classic[/\\]from-json-schema)\.js$/,
      },
      async ({ path }) => ({
        contents: stubUnusedZodModule(await Bun.file(path).text()),
        loader: "js",
      }),
    );
  },
};

function stubUnusedZodModule(source: string): string {
  const classNames = new Set<string>();
  const constNames = new Set<string>();
  const names = new Set<string>();
  for (const match of source.matchAll(
    /export\s+(?:async\s+)?(?:function|class|const|let|var)\s+(\w+)/g,
  )) {
    const name = match[1];
    if (!name) continue;
    names.add(name);
    if (match[0].includes(" class ")) classNames.add(name);
    if (
      match[0].includes(" const ") ||
      match[0].includes(" let ") ||
      match[0].includes(" var ")
    ) {
      constNames.add(name);
    }
  }

  return `${[...names]
    .map((name) => {
      if (classNames.has(name)) return `export class ${name} extends Error {}`;
      if (constNames.has(name))
        return `export const ${name} = () => undefined;`;
      return `export function ${name}() { return undefined; }`;
    })
    .join("\n")}\n`;
}
