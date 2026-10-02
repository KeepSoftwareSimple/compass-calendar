import { emitContractsSwiftFile } from "@scripts/swift-contracts/emit-swift";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const CONTRACTS_SWIFT_OUTPUT = join(
  process.cwd(),
  "apps/calendar-macos/CompassKit/Sources/CompassKit/Generated/Contracts.swift",
);

export function writeContractsSwift(
  outputPath = CONTRACTS_SWIFT_OUTPUT,
): string {
  const contents = emitContractsSwiftFile();
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, contents, "utf8");
  return contents;
}

export function runContractsSwiftCommand(args: string[]): void {
  const check = args.includes("--check");
  const generated = emitContractsSwiftFile();

  if (!check) {
    writeContractsSwift();
    console.log(`Wrote ${CONTRACTS_SWIFT_OUTPUT}`);
    return;
  }

  const existing = readFileSync(CONTRACTS_SWIFT_OUTPUT, "utf8");
  if (existing === generated) {
    console.log("contracts:swift --check OK");
    return;
  }

  const tempDir = mkdtempSync(join(tmpdir(), "contracts-swift-"));
  const tempFile = join(tempDir, "Contracts.swift");
  writeFileSync(tempFile, generated, "utf8");
  console.error(
    `contracts:swift drift: regenerate with \`bun cli contracts:swift\` (temp at ${tempFile})`,
  );
  rmSync(tempDir, { recursive: true, force: true });
  process.exit(1);
}
