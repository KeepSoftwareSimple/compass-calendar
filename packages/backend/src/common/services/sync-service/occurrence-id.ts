// Re-exported from packages/core so the backend, sync, and web all decode and
// compose occurrence ids with the exact same codec — a client- and
// server-side implementation that drifted (different date format, different
// separator-splitting rule) is exactly how "delete this instance only" once
// silently escalated into "delete the whole series" (an undecodable id
// coerced to scope "all" in resolveCommandTarget). See
// packages/core/src/util/occurrence-id.ts for the format and its tests.
export {
  composeOccurrenceId,
  decodeOccurrenceId,
  looksLikeOccurrenceId,
} from "@core/util/occurrence-id";
