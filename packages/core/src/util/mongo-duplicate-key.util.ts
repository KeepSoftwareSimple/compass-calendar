// "Did this write lose a race on a unique index?" - the E11000 check that
// every repository racing an upsert or an idempotent insert needs.
//
// Duck-typed on `code` rather than `instanceof MongoServerError` so core stays
// free of a hard mongodb runtime dependency (same reason as
// mongo-network-error.util), and so a bulk write error, which is a
// MongoBulkWriteError and not a MongoServerError, is matched too.
//
// Bulk writes are why there are two predicates. `insertMany`/`bulkWrite`
// report per-document failures in `writeErrors`, and a caller that swallows
// the error needs to know whether duplicates were *all* that went wrong,
// while a caller that retries only needs to know a duplicate was *among*
// them. Reaching for the wrong one silently drops real write failures, so
// the two are named rather than left to whoever copies the snippet next.

const DUPLICATE_KEY_CODE = 11000;

const topLevelCode = (error: unknown): unknown =>
  typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;

const writeErrorCodes = (error: unknown): readonly unknown[] => {
  const writeErrors = (
    error as { writeErrors?: readonly { code?: unknown }[] } | null | undefined
  )?.writeErrors;
  return Array.isArray(writeErrors)
    ? writeErrors.map((entry) => entry?.code)
    : [];
};

/**
 * True when the error is a duplicate-key error, or when any document in a
 * bulk write failed on a unique index. For callers that react to the
 * duplicate (converge on the winning row, retry, report a taken slug) and
 * rethrow otherwise.
 */
export function isDuplicateKeyError(error: unknown): boolean {
  if (topLevelCode(error) === DUPLICATE_KEY_CODE) {
    return true;
  }
  return writeErrorCodes(error).some((code) => code === DUPLICATE_KEY_CODE);
}

/**
 * True only when duplicates are the *whole* failure: a plain duplicate-key
 * error, or a bulk write whose every write error was one. For callers that
 * swallow the error, where a mixed batch must still throw.
 */
export function isOnlyDuplicateKeyError(error: unknown): boolean {
  if (topLevelCode(error) === DUPLICATE_KEY_CODE) {
    return true;
  }
  const codes = writeErrorCodes(error);
  if (codes.length === 0) {
    return false;
  }
  return codes.every((code) => code === DUPLICATE_KEY_CODE);
}
