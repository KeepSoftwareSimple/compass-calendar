import {
  CONTACT_SUGGESTION_MAX_RESULTS,
  CONTACT_SUGGESTION_QUERY_MAX_LENGTH,
  CONTACT_SUGGESTION_QUERY_MIN_LENGTH,
  ContactSuggestionSchema,
  ContactSuggestionsResponseSchema,
} from "@core/types/contact.contracts";
import { describe, expect, it } from "bun:test";

describe("ContactSuggestionSchema", () => {
  it("accepts an email with a display name", () => {
    expect(
      ContactSuggestionSchema.safeParse({
        email: "alice@example.com",
        displayName: "Alice Doe",
      }).success,
    ).toBe(true);
  });

  it("accepts a null display name (other contacts often have none)", () => {
    expect(
      ContactSuggestionSchema.safeParse({
        email: "alice@example.com",
        displayName: null,
      }).success,
    ).toBe(true);
  });

  it("requires the email", () => {
    expect(
      ContactSuggestionSchema.safeParse({ email: "", displayName: null })
        .success,
    ).toBe(false);
    expect(
      ContactSuggestionSchema.safeParse({ displayName: "Alice" }).success,
    ).toBe(false);
  });

  it("strips People-API fields riding along so the wire keeps email + name only", () => {
    for (const extra of [
      { photos: [{ url: "https://example.com/a.png" }] },
      { phoneNumbers: [{ value: "555-0100" }] },
      { emailAddresses: [{ value: "alice@example.com" }] },
      { metadata: { primary: true } },
      { responseStatus: "accepted" },
    ]) {
      const parsed = ContactSuggestionSchema.parse({
        email: "alice@example.com",
        displayName: null,
        ...extra,
      });
      expect(parsed).toEqual({
        email: "alice@example.com",
        displayName: null,
      });
    }
  });
});

describe("ContactSuggestionsResponseSchema", () => {
  it("accepts an empty list (the under-min-length response)", () => {
    expect(
      ContactSuggestionsResponseSchema.safeParse({ suggestions: [] }).success,
    ).toBe(true);
  });

  it("caps the page at the maximum", () => {
    const suggestion = { email: "a@example.com", displayName: null };
    expect(
      ContactSuggestionsResponseSchema.safeParse({
        suggestions: Array.from(
          { length: CONTACT_SUGGESTION_MAX_RESULTS },
          () => suggestion,
        ),
      }).success,
    ).toBe(true);
    expect(
      ContactSuggestionsResponseSchema.safeParse({
        suggestions: Array.from(
          { length: CONTACT_SUGGESTION_MAX_RESULTS + 1 },
          () => suggestion,
        ),
      }).success,
    ).toBe(false);
  });

  it("keeps the query bounds sane", () => {
    // The min-length gate is what keeps one-character queries from hitting
    // the People API at all; the max bounds a malformed request.
    expect(CONTACT_SUGGESTION_QUERY_MIN_LENGTH).toBe(2);
    expect(CONTACT_SUGGESTION_QUERY_MAX_LENGTH).toBeGreaterThan(
      CONTACT_SUGGESTION_QUERY_MIN_LENGTH,
    );
  });
});
