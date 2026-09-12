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
      expect(navigateIds).not.toContain("nav-month-prev");
      expect(navigateIds).not.toContain("nav-month-next");
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

    it("hides the subscribe row unless a trial is running", () => {
      const ids = filterShortcutsByContext({
        view: "week",
        isViewingCurrentPeriod: true,
        isTrialing: false,
      }).map((s) => s.id);

      expect(ids).not.toContain("other-subscribe");
    });

    it("lists the subscribe row in every view while trialing", () => {
      for (const view of ["day", "week", "life"] as const) {
        const shortcut = filterShortcutsByContext({
          view,
          isViewingCurrentPeriod: true,
          isTrialing: true,
        }).find((s) => s.id === "other-subscribe");

        expect(shortcut?.keys).toEqual(["b"]);
        expect(shortcut?.label).toBe("Subscribe now");
      }
    });

    it("lists f and m, and never advertises F10, in the legend", () => {
      const week = filterShortcutsByContext({
        view: "week",
        isViewingCurrentPeriod: true,
      });
      const byId = Object.fromEntries(
        week.map((shortcut) => [shortcut.id, shortcut]),
      );

      expect(byId["focus-notice"]?.keys).toEqual(["f"]);
      expect(byId["edit-menu"]?.keys).toEqual(["m"]);
      expect(byId["edit-menu"]?.label).toBe("Open event menu");
      expect(byId["edit-hide"]?.keys).toEqual(["x"]);
      expect(byId["edit-hide"]?.label).toBe("Hide or show focused event");
      expect(byId["edit-hide"]?.requiresWrite).toBeUndefined();

      // Shift+F10 still opens the menu where the OS has that key; it is just
      // not advertised, since it would duplicate the m row's label.
      for (const view of ["day", "week", "life"] as const) {
        const shortcuts = filterShortcutsByContext({
          view,
          isViewingCurrentPeriod: true,
        });
        expect(
          shortcuts.filter((shortcut) => shortcut.keys.includes("F10")),
        ).toEqual([]);
      }
    });

    it("lists h event jump toggle in day and week focus sections", () => {
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

    it("lists day-letter focus in both calendar views", () => {
      for (const view of ["week", "day"] as const) {
        const ids = filterShortcutsByContext({
          view,
          isViewingCurrentPeriod: true,
        }).map((shortcut) => shortcut.id);
        expect(ids).toContain("focus-week-day");
      }
    });

    it("lists month-picker navigation in day and week, not life", () => {
      for (const view of ["day", "week"] as const) {
        const ids = filterShortcutsByContext({
          view,
          isViewingCurrentPeriod: true,
        }).map((shortcut) => shortcut.id);
        expect(ids).toContain("nav-month-prev");
        expect(ids).toContain("nav-month-next");
      }

      const life = filterShortcutsByContext({
        view: "life",
        isViewingCurrentPeriod: true,
      }).map((shortcut) => shortcut.id);
      expect(life).not.toContain("nav-month-prev");
      expect(life).not.toContain("nav-month-next");
    });

    it("lists the month picker step row with a per-view unit, not in life", () => {
      const label = (view: "day" | "week") =>
        filterShortcutsByContext({ view, isViewingCurrentPeriod: true }).find(
          (shortcut) => shortcut.id === "nav-picker-step",
        )?.label;

      expect(label("week")).toBe(
        "Move the month picker by a week (Enter opens it)",
      );
      expect(label("day")).toBe(
        "Move the month picker by a day (Enter opens it)",
      );

      const life = filterShortcutsByContext({
        view: "life",
        isViewingCurrentPeriod: true,
      }).map((shortcut) => shortcut.id);
      expect(life).not.toContain("nav-picker-step");
    });

    it("lists the page jump shortcut in day, week, and life", () => {
      for (const view of ["day", "week", "life"] as const) {
        const ids = filterShortcutsByContext({
          view,
          isViewingCurrentPeriod: true,
        }).map((shortcut) => shortcut.id);
        expect(ids).toContain("focus-page-jump");
      }
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
      expect(ids).toContain("edit-focus-attendees");
      expect(ids).not.toContain("edit-focus-calendar");
      expect(ids).toContain("edit-focus-color");
      expect(ids).toContain("edit-focus-rsvp");
      expect(ids).not.toContain("other-booking-jump");
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

    it("excludes the digit-jump row when the form is closed and includes it when open", () => {
      const closed = filterShortcutsByContext({
        view: "day",
        isViewingCurrentPeriod: true,
        isFormOpen: false,
      }).map((shortcut) => shortcut.id);
      expect(closed).not.toContain("edit-jump-field-digit");

      const open = filterShortcutsByContext({
        view: "day",
        isViewingCurrentPeriod: true,
        isFormOpen: true,
      }).map((shortcut) => shortcut.id);
      expect(open).toContain("edit-jump-field-digit");
    });

    it("lists the digit-pick row regardless of form state, since it also applies in the context menu", () => {
      const closed = filterShortcutsByContext({
        view: "day",
        isViewingCurrentPeriod: true,
        isFormOpen: false,
      }).map((shortcut) => shortcut.id);
      expect(closed).toContain("edit-pick-by-number");

      const open = filterShortcutsByContext({
        view: "day",
        isViewingCurrentPeriod: true,
        isFormOpen: true,
      }).map((shortcut) => shortcut.id);
      expect(open).toContain("edit-pick-by-number");
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
