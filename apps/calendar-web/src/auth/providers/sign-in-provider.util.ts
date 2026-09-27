import { type ProviderKind } from "@core/types/sync/identity.contracts";

export const CONTINUE_WITH_LABEL: Record<ProviderKind, string> = {
  google: "Continue with Google",
  microsoft: "Continue with Microsoft",
  apple: "Continue with Apple",
};

export const SIGN_IN_SHORTCUT_KEY: Record<ProviderKind, string> = {
  google: "G",
  microsoft: "M",
  apple: "A",
};

const SIGN_IN_SHORTCUT_LETTER: Record<ProviderKind, string> = {
  google: "g",
  microsoft: "m",
  apple: "a",
};

export function signInProviderForShortcutLetter(
  letter: string,
  available: readonly ProviderKind[],
): ProviderKind | undefined {
  const normalized = letter.toLowerCase();
  return available.find((kind) => SIGN_IN_SHORTCUT_LETTER[kind] === normalized);
}
