import { join } from "node:path";

export const runWebDesktopFixtures = async (
  outputDir: string,
): Promise<void> => {
  const scriptPath = join(
    process.cwd(),
    "apps/calendar-web/src/desktop-export/export-fixtures/write-fixture-files.ts",
  );
  const proc = Bun.spawn(["bun", scriptPath, outputDir], {
    cwd: process.cwd(),
    env: process.env,
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) {
    process.exit(code ?? 1);
  }
};
