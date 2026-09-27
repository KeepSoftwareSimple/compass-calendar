/**
 * Copy text, reporting whether it landed.
 *
 * `navigator.clipboard.writeText` rejects on a denied permission or a
 * non-secure context, and it is absent entirely in some environments. Callers
 * used to invoke it directly with no `.catch()`, so a refusal surfaced as an
 * unhandled rejection and left the UI claiming nothing had happened.
 *
 * Note for callers that copy after an await: Safari ends the user-gesture
 * chain at the first await, so a copy that follows a network round trip can
 * fail there even with permission granted. Always leave a manual path.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    // Not `clipboard?.writeText(...)`: optional chaining yields undefined,
    // which awaits successfully and would report a copy that never happened.
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
