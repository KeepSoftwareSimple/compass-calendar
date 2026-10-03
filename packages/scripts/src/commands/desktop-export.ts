import { ensureDesktopExportEnv } from "@core/desktop/desktop-export-env";

export async function runDesktopExportCommand(args: string[]): Promise<void> {
  ensureDesktopExportEnv();

  const { runDesktopExport } = await import(
    "@scripts/desktop-export/desktop-export"
  );
  const check = args.includes("--check");
  await runDesktopExport(check);
}
