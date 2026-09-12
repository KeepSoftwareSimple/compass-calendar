import {
  type ProviderEventWriter,
  type ProviderPatchInput,
  ProviderWriteError,
  type ProviderWriteResult,
} from "@sync/providers/provider-event-writer.port";

// Exchange rewrites an item's change key on its own in the seconds after a
// create, so an If-Match against any version read in that window fails with
// HTTP 412 ErrorIrresolvableConflict. Patching against a version read back
// after the create (#3665) did not close the window: the 2026-09-12 nightly
// read the pre-bump key and still lost the patch. Mirrors what a sync pull
// does for a real user, refresh the stored version and write again, but
// bounded, so a conflict that persists is still the smoke's verdict. Any
// other failure is rethrown untouched.
const PATCH_ATTEMPTS = 5;
const RETRY_DELAY_MS = 1500;

export async function patchWithFreshVersion(
  writer: Pick<ProviderEventWriter, "patchEvent">,
  input: ProviderPatchInput,
  readVersion: () => Promise<string | null>,
  delayMs = RETRY_DELAY_MS,
): Promise<ProviderWriteResult> {
  let attempt = input;
  for (let n = 1; ; n += 1) {
    try {
      return await writer.patchEvent(attempt);
    } catch (error) {
      if (!isVersionConflict(error) || n >= PATCH_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      attempt = { ...attempt, expectedVersion: await readVersion() };
    }
  }
}

function isVersionConflict(error: unknown): boolean {
  return (
    error instanceof ProviderWriteError && error.reason === "versionConflict"
  );
}
