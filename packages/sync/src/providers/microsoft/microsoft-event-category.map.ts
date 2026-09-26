import {
  type EventColorSlot,
  EventColorSlotSchema,
} from "@core/types/event-color.contracts";

// Compass slot labels used as Outlook category display names on write. Outlook
// matches categories by displayName; using the same names as the Compass picker
// keeps round-trips stable when the category exists in the mailbox master list.
const SLOT_DISPLAY_NAME: Record<EventColorSlot, string> = {
  lavender: "Lavender",
  mint: "Mint",
  plum: "Plum",
  coral: "Coral",
  gold: "Gold",
  orange: "Orange",
  blue: "Blue",
  slate: "Slate",
  indigo: "Indigo",
  green: "Green",
  red: "Red",
};

// Approximate Outlook on the web preset fills (365 palette). Used when Graph
// returns a category color enum but no hex on the event itself.
export const MICROSOFT_CATEGORY_PRESET_HEX: Readonly<Record<string, string>> = {
  preset0: "#DC626D",
  preset1: "#E8825D",
  preset2: "#BD814F",
  preset3: "#FDEE65",
  preset4: "#52CE90",
  preset5: "#57D2DA",
  preset6: "#85B44C",
  preset7: "#5CA9E5",
  preset8: "#A589CB",
  preset9: "#EE5FB7",
  preset10: "#C5CED1",
  preset11: "#4C596E",
  preset12: "#ABABAB",
  preset13: "#666666",
  preset14: "#3B3B3B",
  preset15: "#A4262C",
  preset16: "#CA5010",
  preset17: "#8E562E",
  preset18: "#C19C00",
  preset19: "#4CA64C",
  preset20: "#4BB4B7",
  preset21: "#6B8F2A",
  preset22: "#4179A3",
  preset23: "#A589CB",
  preset24: "#C34E98",
};

const LEGACY_CATEGORY_SUFFIX = / category$/i;

export function slotToOutlookCategoryName(slot: EventColorSlot): string {
  return SLOT_DISPLAY_NAME[slot];
}

export function outlookCategoryNameToSlot(
  displayName: string,
): EventColorSlot | undefined {
  const trimmed = displayName.trim();
  const withoutLegacy = trimmed.replace(LEGACY_CATEGORY_SUFFIX, "").trim();
  for (const slot of EventColorSlotSchema.options) {
    if (
      withoutLegacy.toLowerCase() === slot.toLowerCase() ||
      withoutLegacy.toLowerCase() === SLOT_DISPLAY_NAME[slot].toLowerCase()
    ) {
      return slot;
    }
  }
  return undefined;
}

// Fields for a Graph create/patch body: a slot sets one category, null clears
// categories, undefined leaves Outlook's existing categories untouched.
export function microsoftCategoryFields(
  color: EventColorSlot | null | undefined,
): { categories: readonly string[] } | Record<string, never> {
  if (color === undefined) return {};
  if (color === null) return { categories: [] };
  return { categories: [slotToOutlookCategoryName(color)] };
}
