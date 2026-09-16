import {
  editSequenceRegistryKeys,
  REGISTRY_RUNTIME_KEY_SOURCES,
} from "@web/shortcuts/app-shortcut-bindings";
import { EDIT_SEQUENCE_LETTER_FIELDS } from "@web/shortcuts/edit-sequence/edit-sequence.fields";
import { SHORTCUTS_REGISTRY } from "@web/shortcuts/shortcuts.registry";

/** Display-only rows: gestures without a single runtime hotkey string. */
const LEGEND_ONLY_IDS = new Set([
  "create-place-timed",
  "create-typed-time",
  "edit-move",
  "edit-move-edge",
  "edit-pick-by-number",
]);

const isEditSequenceLegendRow = (id: string) => {
  if (!id.startsWith("edit-focus-")) return false;
  const field = id.replace("edit-focus-", "");
  return EDIT_SEQUENCE_LETTER_FIELDS.some((row) => row.field === field);
};

describe("shortcuts.registry bindings", () => {
  it("derives every runtime-owned row from KEYMAP or APP_SHORTCUT_BINDINGS", () => {
    for (const shortcut of SHORTCUTS_REGISTRY) {
      if (LEGEND_ONLY_IDS.has(shortcut.id)) continue;

      if (isEditSequenceLegendRow(shortcut.id)) {
        const field = shortcut.id.replace("edit-focus-", "");
        const entry = EDIT_SEQUENCE_LETTER_FIELDS.find(
          (row) => row.field === field,
        );
        expect(entry).toBeDefined();
        expect(shortcut.keys).toEqual(editSequenceRegistryKeys(entry!.key));
        continue;
      }

      const source = REGISTRY_RUNTIME_KEY_SOURCES[shortcut.id];
      expect(source).toBeDefined();
      expect(shortcut.keys).toEqual([...source]);
    }
  });

  it("lists every runtime-owned registry id in REGISTRY_RUNTIME_KEY_SOURCES", () => {
    const runtimeIds = SHORTCUTS_REGISTRY.filter(
      (shortcut) =>
        !LEGEND_ONLY_IDS.has(shortcut.id) &&
        !isEditSequenceLegendRow(shortcut.id),
    ).map((shortcut) => shortcut.id);

    expect(Object.keys(REGISTRY_RUNTIME_KEY_SOURCES).sort()).toEqual(
      runtimeIds.sort(),
    );
  });

  it("lists every REGISTRY_RUNTIME_KEY_SOURCES id as a ShortcutRegistryId", () => {
    const registryIds = new Set<string>(
      SHORTCUTS_REGISTRY.map((shortcut) => shortcut.id),
    );
    for (const id of Object.keys(REGISTRY_RUNTIME_KEY_SOURCES)) {
      expect(registryIds.has(id)).toBe(true);
    }
  });

  it("keeps registry sections aligned with id prefixes", () => {
    const sectionByPrefix = {
      nav: "navigate",
      create: "create",
      focus: "focus",
      edit: "edit",
      other: "other",
    } as const;

    for (const shortcut of SHORTCUTS_REGISTRY) {
      const prefix = shortcut.id.split("-")[0];
      expect(prefix).toBeDefined();
      expect(shortcut.section).toBe(
        sectionByPrefix[prefix as keyof typeof sectionByPrefix],
      );
    }
  });
});
