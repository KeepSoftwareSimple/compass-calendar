import { z } from "zod/v4";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";

/**
 * Decode one JSON-encoded value out of persistent browser storage. A missing
 * key, unreadable storage, malformed JSON, and a value the schema rejects all
 * resolve to `fallback`: a corrupted device-local preference degrades to its
 * default, it never throws into a render.
 */
export function readJsonValue<Schema extends z.ZodType>(
  key: string,
  schema: Schema,
  fallback: z.output<Schema>,
): z.output<Schema> {
  const raw = persistentBrowserStore.get(key);
  if (!raw) return fallback;

  try {
    return schema.parse(JSON.parse(raw)) as z.output<Schema>;
  } catch {
    return fallback;
  }
}

/** JSON-encode `value` under `key`. False when storage refused the write. */
export function writeJsonValue(key: string, value: unknown): boolean {
  return persistentBrowserStore.set(key, JSON.stringify(value));
}

// Every id list here holds non-empty identifier strings, so a blank or
// whitespace-only entry is corruption rather than a value worth keeping.
const StoredIdListSchema = z.array(z.string().trim().min(1)).readonly();

/**
 * Read a stored list of ids. An absent key and a stored empty list mean the
 * same thing to every caller, so both read back as an empty list.
 */
export function readIdList(key: string): readonly string[] {
  return readJsonValue(key, StoredIdListSchema, []);
}

/**
 * Write a list of ids, removing the key when the list is empty so an absent
 * key and a stored `[]` can never disagree about what "nothing" looks like.
 */
export function writeIdList(key: string, ids: readonly string[]): boolean {
  if (ids.length === 0) return persistentBrowserStore.remove(key);
  return writeJsonValue(key, ids);
}

/** {@link readIdList} for the membership keys that want a Set. */
export function readIdSet(key: string): ReadonlySet<string> {
  return new Set(readIdList(key));
}

/** {@link writeIdList} for the membership keys that hold a Set. */
export function writeIdSet(key: string, ids: ReadonlySet<string>): boolean {
  return writeIdList(key, [...ids]);
}
