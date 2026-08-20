import { EDIT_SEQUENCE_FIELD_BY_KEY } from "@web/shortcuts/edit-sequence/edit-sequence.fields";
import { KEYMAP } from "@web/shortcuts/keymap";
import {
  filterShortcutsByContext,
  getShortcutsBySection,
  SHORTCUTS_REGISTRY,
} from "@web/shortcuts/shortcuts.registry";

describe("shortcuts.registry", () => {
  describe("filterShortcutsByContext", () => {
    it("filters out life-specific shortcuts in day view", () => {
      const shortcuts = filterShortcutsByContext({
        view: "day",
        isViewingCurrentPeriod: true,
      });

      const ids = shortcuts.map((s) => s.id);
      expect(ids).not.toContain("nav-life-prev");
      expect(ids).not.toContain("nav-life-next");
      expect(ids).not.toContain("nav-life-current");
    });

    it("includes only life-specific shortcuts in life view navigate section", () => {
      const shortcuts = filterShortcutsByContext({
        view: "life",
        isViewingCurrentPeriod: true,
      });

      const navigateIds = shortcuts
        .filter((s) => s.section === "navigate")
        .map((s) => s.id);

      expect(navigateIds).toContain("nav-life-prev");
      expect(navigateIds).toContain("nav-life-next");
      expect(navigateIds).toContain("nav-life-current");
      expect(navigateIds).toContain("nav-day-view");
      expect(navigateIds).toContain("nav-week-view");

      // Should not contain day/week specific shortcuts
      expect(navigateIds).not.toContain("nav-previous");
      expect(navigateIds).not.toContain("nav-next");
      expect(navigateIds).not.toContain("nav-shift-left");
      expect(navigateIds).not.toContain("nav-shift-right");
    });

    it("excludes form-open shortcuts when form is not open", () => {
      const shortcuts = filterShortcutsByContext({
        view: "day",
        isViewingCurrentPeriod: true,
        isFormOpen: false,
      });

      const ids = shortcuts.map((s) => s.id);
      expect(ids).not.toContain("edit-save");
    });

    it("includes form-open shortcuts when form is open", () => {
      const shortcuts = filterShortcutsByContext({
        view: "day",
        isViewingCurrentPeriod: true,
        isFormOpen: true,
      });

      const ids = shortcuts.map((s) => s.id);
      expect(ids).toContain("edit-save");
    });

    it("lists s event jump toggle in day and week focus sections", () => {
      for (const view of ["day", "week"] as const) {
        const shortcuts = filterShortcutsByContext({
          view,
          isViewingCurrentPeriod: true,
        });
        expect(shortcuts.map((shortcut) => shortcut.id)).toContain(
          "focus-shift-hold",
        );
      }

      const life = filterShortcutsByContext({
        view: "life",
        isViewingCurrentPeriod: true,
      }).map((shortcut) => shortcut.id);
      expect(life).not.toContain("focus-shift-hold");
    });

    it("lists time travel in day and week but not life", () => {
      for (const view of ["day", "week"] as const) {
        const ids = filterShortcutsByContext({
          view,
          isViewingCurrentPeriod: true,
        }).map((shortcut) => shortcut.id);
        expect(ids).toContain("other-time-travel");
      }

      const life = filterShortcutsByContext({
        view: "life",
        isViewingCurrentPeriod: true,
      }).map((shortcut) => shortcut.id);
      expect(life).not.toContain("other-time-travel");
    });

    it("lists h keyboard-only mode in every view's other section", () => {
      for (const view of ["day", "week", "life"] as const) {
        const ids = filterShortcutsByContext({
          view,
          isViewingCurrentPeriod: true,
        }).map((shortcut) => shortcut.id);
        expect(ids).toContain("other-keyboard-only");
      }
    });

    it("lists the edit sequences with nothing focused, so the legend can show them", () => {
      // Regression: these were gated on live DOM focus, which the legend itself
      // stole when it focused its search input, making them unreachable.
      const ids = filterShortcutsByContext({
        view: "day",
        isViewingCurrentPeriod: true,
      }).map((shortcut) => shortcut.id);

      expect(ids).toContain("edit-focus-title");
      expect(ids).toContain("edit-focus-location");
      expect(ids).toContain("edit-focus-description");
      expect(ids).toContain("edit-focus-start");
      expect(ids).toContain("edit-focus-end");
      expect(ids).toContain("edit-focus-recurrence");
      expect(ids).toContain("edit-focus-calendar");
      expect(ids).toContain("edit-focus-color");
    });

    it("excludes the in-form leader row when the form is closed and includes it when open", () => {
      const closed = filterShortcutsByContext({
        view: "day",
        isViewingCurrentPeriod: true,
        isFormOpen: false,
      }).map((shortcut) => shortcut.id);
      expect(closed).not.toContain("edit-field-leader-in-form");

      const open = filterShortcutsByContext({
        view: "day",
        isViewingCurrentPeriod: true,
        isFormOpen: true,
      }).map((shortcut) => shortcut.id);
      expect(open).toContain("edit-field-leader-in-form");
    });
  });

  describe("getShortcutsBySection", () => {
    it("groups non-empty sections by id, in display order, with shortcuts", () => {
      const shortcuts = filterShortcutsByContext({
        view: "day",
        isViewingCurrentPeriod: true,
      });

      const sections = getShortcutsBySection(shortcuts);
      const byId = Object.fromEntries(
        sections.map((section) => [section.id, section]),
      );

      expect(byId.navigate.shortcuts.length).toBeGreaterThan(0);
      expect(byId.create.shortcuts.length).toBeGreaterThan(0);
      expect(byId.edit.shortcuts.length).toBeGreaterThan(0);
      expect(sections.every((section) => section.shortcuts.length > 0)).toBe(
        true,
      );
    });

    it("sets a display title for each section", () => {
      const shortcuts = filterShortcutsByContext({
        view: "day",
        isViewingCurrentPeriod: true,
      });

      const byId = Object.fromEntries(
        getShortcutsBySection(shortcuts).map((section) => [
          section.id,
          section,
        ]),
      );

      expect(byId.navigate.title).toBe("Navigate");
      expect(byId.create.title).toBe("Create");
      expect(byId.edit.title).toBe("Edit");
    });
  });

  // Registry rows derive from KEYMAP by construction; these pin the two
  // remaining cross-module facts a derivation cannot express.
  describe("keymap coherence", () => {
    it("maps the taught edit-sequence second key to the title field", () => {
      expect(EDIT_SEQUENCE_FIELD_BY_KEY[KEYMAP.editTitle.sequence.second]).toBe(
        "title",
      );
    });

    it("lists the taught edit-title sequence in the legend", () => {
      const entry = SHORTCUTS_REGISTRY.find(
        (shortcut) => shortcut.id === "edit-focus-title",
      );
      expect(entry?.keys).toEqual([
        KEYMAP.editTitle.sequence.leader,
        KEYMAP.editTitle.sequence.second,
      ]);
    });
  });
});
