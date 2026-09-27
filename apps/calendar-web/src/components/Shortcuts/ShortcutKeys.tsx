import classNames from "classnames";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { ShortCutLabel } from "./ShortcutLabel";

/** Aliases for keys users might write differently than the canonical token. */
const keyAliases: Record<string, string> = {
  cmd: "Meta",
  command: "Meta",
  ctrl: "Control",
};

/**
 * Normalizes a single key token for display: uppercases lone letters
 * (keyboard convention, `w` -> `W`) and resolves common aliases. Named tokens
 * (`Shift`, `Enter`, `Mod`, `Arrow*`) pass through to `ShortCutLabel`.
 */
function normalizeKeyToken(key: string): string {
  const alias = keyAliases[key.toLowerCase()];
  if (alias) return alias;
  if (key.length === 1 && /[a-z]/i.test(key)) return key.toUpperCase();
  return key;
}

/**
 * Normalizes a `string | string[]` shortcut to a key array. A lone string is
 * treated as a single key (never split), so callers pass `"?"` for a one-key
 * hint and `["Mod", "K"]` for a combo — no `"+"` parsing involved.
 */
function toKeyArray(keys: string | string[]): string[] {
  return Array.isArray(keys) ? keys : [keys];
}

interface Props {
  /** A single key (`"?"`) or one key per entry (`["Mod", "K"]`). */
  keys: string | string[];
  title?: string;
  className?: string;
}

/**
 * Renders a keyboard shortcut as one keycap chip per key, so multi-step combos
 * read as distinct keys (`[⌘] [K]`) rather than a single `"+"`-joined string.
 */
export function ShortcutKeys({ keys, title, className }: Props) {
  const cleaned = toKeyArray(keys)
    .map((key) => key.trim())
    .filter(Boolean);

  // Nothing to render -> emit nothing, rather than an empty chip row.
  if (cleaned.length === 0) return null;

  return (
    <span
      title={title}
      className={classNames("inline-flex items-center gap-1", className)}
    >
      {cleaned.map((key, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: keycap sequences repeat keys; position is the identity
        <ShortcutHint key={`${key}-${index}`} variant="keycap">
          <ShortCutLabel k={normalizeKeyToken(key)} />
        </ShortcutHint>
      ))}
    </span>
  );
}
