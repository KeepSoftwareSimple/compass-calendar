import {
  type ContactSuggestion,
  ContactSuggestionSchema,
} from "@core/types/contact.contracts";

// Provider-neutral suggestion assembly, shared by every ContactsPort adapter.
// Only the shape of a provider's match is provider-specific; turning a raw
// address into a candidate and ordering the merged list are the same work
// whether the names came from Google People or Microsoft Graph.

// The contract owns the bounds a suggestion must satisfy, so read them off the
// schema instead of restating 320/256 in each adapter, where they drift.
const EmailSchema = ContactSuggestionSchema.shape.email;
const DisplayNameSchema = ContactSuggestionSchema.shape.displayName;

// Build one candidate from a provider-supplied address and name. Both are
// trimmed and bounds-checked against the contract: an unusable email drops the
// candidate entirely (a malformed contact must not break the whole suggestion
// list), while an unusable name only drops the name, keeping the address.
export function toContactSuggestion(
  email: string | null | undefined,
  displayName: string | null | undefined,
): ContactSuggestion | null {
  const parsedEmail = EmailSchema.safeParse(email ?? "");
  if (!parsedEmail.success) return null;
  const parsedName = DisplayNameSchema.safeParse(displayName ?? null);
  return {
    email: parsedEmail.data,
    displayName: parsedName.success ? parsedName.data : null,
  };
}

// Rank by how directly the suggestion matches the typed prefix: email or name
// prefix match first, then substring match, then the provider's own relevance
// order. The sort is stable, so equal ranks keep source order (for Google,
// saved contacts ahead of other contacts). De-duplicates by case-insensitive
// email, keeping the best-ranked (first) occurrence.
export function rankContactSuggestions(
  candidates: readonly ContactSuggestion[],
  query: string,
): ContactSuggestion[] {
  const needle = query.trim().toLowerCase();
  const rank = (suggestion: ContactSuggestion): number => {
    const email = suggestion.email.toLowerCase();
    const name = suggestion.displayName?.toLowerCase() ?? "";
    if (email.startsWith(needle) || name.startsWith(needle)) return 0;
    if (email.includes(needle) || name.includes(needle)) return 1;
    return 2;
  };

  const ranked = candidates
    .map((suggestion, index) => ({ suggestion, index, rank: rank(suggestion) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index);

  return dedupeContactSuggestionsByEmail(
    ranked.map(({ suggestion }) => suggestion),
  );
}

// The same address can reach a list twice: two People surfaces for one
// account, or one person who is both a past guest and a saved contact. Keep
// the first occurrence, because every list reaching here is already ordered
// best-first.
export function dedupeContactSuggestionsByEmail(
  suggestions: readonly ContactSuggestion[],
): ContactSuggestion[] {
  const seen = new Set<string>();
  const unique: ContactSuggestion[] = [];
  for (const suggestion of suggestions) {
    const key = suggestion.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(suggestion);
  }
  return unique;
}
