import {
  buildShortcutsExportDocument,
  emitShortcutIdsSwift,
} from "@scripts/desktop-export/emit-shortcuts";
import { SHORTCUTS_REGISTRY } from "@core/shortcuts/shortcuts.registry";
import { describe, expect, it } from "bun:test";

describe("emit-shortcuts", () => {
  it("serializes the registry, bindings, keymap, leader fields, and levels", () => {
    const doc = buildShortcutsExportDocument();
    expect(doc.registry).toHaveLength(SHORTCUTS_REGISTRY.length);
    expect(doc.bindings["nav-next"]).toBeDefined();
    expect(doc.keymap.createEvent.hotkey).toBe("C");
    expect(doc.editSequenceLeader).toBe("e");
    expect(doc.editSequenceFields.length).toBeGreaterThan(0);
    expect(doc.shortcutLevels[0]?.minUsed).toBe(0);
  });

  it("emits a Swift enum case for every registry id", () => {
    const swift = emitShortcutIdsSwift();
    for (const { id } of SHORTCUTS_REGISTRY) {
      expect(swift).toContain(`"${id}"`);
    }
  });
});
