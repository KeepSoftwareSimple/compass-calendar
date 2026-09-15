import {
  combineCoreBootSplitsPlugin,
  isCoreBootSharedSpecifier,
  loadCoreBootSharedSource,
} from "../../plugins/combine-core-boot-splits.plugin";
import { describe, expect, it } from "bun:test";

describe("combineCoreBootSplitsPlugin", () => {
  it("matches the shared @core specifiers and file paths, not neighbors", () => {
    expect(isCoreBootSharedSpecifier("@core/constants/core.constants")).toBe(
      true,
    );
    expect(isCoreBootSharedSpecifier("@core/constants/date.constants")).toBe(
      true,
    );
    expect(isCoreBootSharedSpecifier("@core/types/domain-primitives")).toBe(
      true,
    );
    expect(
      isCoreBootSharedSpecifier("@core/types/compass-event.contracts"),
    ).toBe(true);
    expect(isCoreBootSharedSpecifier("@core/util/occurrence-id")).toBe(true);
    expect(
      isCoreBootSharedSpecifier(
        "/repo/packages/core/src/constants/date.constants.ts",
      ),
    ).toBe(true);
    expect(isCoreBootSharedSpecifier("@core/types/type.utils")).toBe(false);
    expect(
      isCoreBootSharedSpecifier("@core/types/event-command.contracts"),
    ).toBe(false);
  });

  it("emits one module that still exports each helper's public API", async () => {
    const source = await loadCoreBootSharedSource();
    expect(source).toContain("export const APP_NAME");
    expect(source).toContain("export const YEAR_MONTH_DAY_FORMAT");
    expect(source).toContain("export const EventIdSchema");
    expect(source).toContain("export const CompassEventSchema");
    expect(source).toContain("export function composeOccurrenceId");
    expect(source).toContain('from "zod/v4"');
    expect(source).toContain("@core/types/type.utils");
    expect(source).not.toContain("@core/constants/core.constants");
  });

  it("collapses the helpers into one build module", async () => {
    const result = await Bun.build({
      entrypoints: [
        `${import.meta.dir}/combine-core-boot-splits.plugin.fixture.ts`,
      ],
      plugins: [combineCoreBootSplitsPlugin],
      minify: true,
    });

    expect(result.success).toBe(true);
    const source = (
      await Promise.all(result.outputs.map((output) => output.text()))
    ).join("\n");
    expect(source).toContain("Compass Calendar");
    expect(source).toContain("YYYY-MM-DD");
  });
});
