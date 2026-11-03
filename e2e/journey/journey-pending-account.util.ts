import { type JourneyScope } from "./journey-leg.util";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type JourneyPendingAccount = {
  readonly scope: JourneyScope;
  readonly email: string;
  readonly password: string;
  readonly createdAtMs: number;
};

const pendingAccountPath = (scope: JourneyScope): string =>
  join(
    process.cwd(),
    "e2e",
    "test-results",
    scope === "PROD" ? "prod-journey" : "staging-journey",
    "journey-pending-account.json",
  );

export const writePendingJourneyAccount = async (
  account: JourneyPendingAccount,
): Promise<void> => {
  const path = pendingAccountPath(account.scope);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(account)}\n`, "utf8");
};

export const readPendingJourneyAccount = async (
  scope: JourneyScope,
): Promise<JourneyPendingAccount | null> => {
  const path = pendingAccountPath(scope);
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as JourneyPendingAccount;
  } catch {
    return null;
  }
};

export const clearPendingJourneyAccount = async (
  scope: JourneyScope,
): Promise<void> => {
  const path = pendingAccountPath(scope);
  await rm(path, { force: true });
};
