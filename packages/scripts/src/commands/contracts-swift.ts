import {
  assertGeneratedFilesMatch,
  writeGeneratedFiles,
} from "@scripts/desktop-export/write-check";
import { emitContractsSwiftFile } from "@scripts/swift-contracts/emit-swift";
import { join } from "node:path";

export const CONTRACTS_SWIFT_OUTPUT = join(
  process.cwd(),
  "apps/calendar-macos/CompassKit/Sources/CompassKit/Generated/Contracts.swift",
);

export function writeContractsSwift(
  outputPath = CONTRACTS_SWIFT_OUTPUT,
): string {
  const contents = emitContractsSwiftFile();
  writeGeneratedFiles([{ path: outputPath, contents }]);
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

  assertGeneratedFilesMatch(
    [{ path: CONTRACTS_SWIFT_OUTPUT, contents: generated }],
    "contracts:swift",
  );
  console.log("contracts:swift --check OK");
}
