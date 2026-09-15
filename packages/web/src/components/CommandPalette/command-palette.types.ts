import type { Icon } from "@phosphor-icons/react/dist/lib/types";

export interface CommandItem {
  id: string;
  label: string;
  icon: Icon;
  onClick?: () => void;
  disabled?: boolean;
  /** A single key (`"?"`) or one key per combo entry (`["Shift", "W"]`), rendered as keycap chips. */
  shortcut?: string | string[];
  /** Status pill shown at the end of the row (e.g. the account row's plan). Decoration only: never searched. */
  badge?: string;
  /** Extra search terms (synonyms) matched by the palette's fuzzy filter; never rendered. */
  keywords?: string[];
}

export interface CommandSection {
  id: string;
  heading: string;
  items: CommandItem[];
}
