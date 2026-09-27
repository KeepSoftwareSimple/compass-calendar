export const APPLE_CREDENTIAL_INVALID_MESSAGE =
  "That email or app-specific password was not accepted";

export const APPLE_CREDENTIAL_RATE_LIMIT_MESSAGE =
  "Too many attempts. Try again in 15 minutes.";

export const APPLE_CREDENTIAL_PRIVACY_NOTE =
  "An app-specific password gives Compass access to your whole iCloud account. Compass uses it only for Calendar and stores it encrypted. You can revoke it any time at appleid.apple.com.";

export const APPLE_CREDENTIAL_INSTRUCTIONS = [
  "Sign in at appleid.apple.com.",
  "Open Sign-In and Security.",
  "Choose App-Specific Passwords.",
  'Generate a password and name it "Compass".',
  "Paste the generated password here.",
] as const;

export const APPLE_SELF_HOSTING_DOC_URL =
  "https://github.com/KeepSoftwareSimple/compass-calendar/blob/main/docs/self-hosting/apple-calendar.md";
