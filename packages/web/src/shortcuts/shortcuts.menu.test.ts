import { getShortcutMenuSections } from "@web/shortcuts/shortcuts.registry";

const stripMetadata = (
  shortcuts: ReadonlyArray<{ keys: unknown; label: unknown }>,
) => shortcuts.map(({ keys, label }) => ({ keys, label }));

describe("shortcut menu sections", () => {
  describe("getShortcutMenuSections", () => {
    it("returns the same action-based sections for both views", () => {
      const dayIds = getShortcutMenuSections({
        view: "day",
        isViewingCurrentPeriod: true,
      }).map((section) => section.id);
      const weekIds = getShortcutMenuSections({
        view: "week",
        isViewingCurrentPeriod: true,
      }).map((section) => section.id);

      expect(dayIds).toEqual(["navigate", "create", "focus", "edit", "other"]);
      expect(weekIds).toEqual(dayIds);
    });

    it("labels navigation with the view's period", () => {
      const [navigate] = getShortcutMenuSections({
        view: "week",
        isViewingCurrentPeriod: false,
      });

      expect(stripMetadata(navigate.shortcuts)).toContainEqual({
        keys: ["j"],
        label: "Previous week",
      });
      expect(stripMetadata(navigate.shortcuts)).toContainEqual({
        keys: ["k"],
        label: "Next week",
      });
      expect(stripMetadata(navigate.shortcuts)).toContainEqual({
        keys: ["d"],
        label: "Go to Day view",
      });
      expect(stripMetadata(navigate.shortcuts)).toContainEqual({
        keys: ["Mod", "Shift", ","],
        label: "Previous month in picker",
      });
      expect(stripMetadata(navigate.shortcuts)).toContainEqual({
        keys: ["Mod", "Shift", "."],
        label: "Next month in picker",
      });
      expect(stripMetadata(navigate.shortcuts)).not.toContainEqual({
        keys: ["w"],
        label: "Go to Week view",
      });

      const [dayNavigate] = getShortcutMenuSections({
        view: "day",
        isViewingCurrentPeriod: false,
      });
      expect(stripMetadata(dayNavigate.shortcuts)).not.toContainEqual({
        keys: ["d"],
        label: "Go to Day view",
      });
      expect(stripMetadata(dayNavigate.shortcuts)).toContainEqual({
        keys: ["w"],
        label: "Go to Week view",
      });
    });

    it("keeps Life shortcuts focused on navigation and shell controls", () => {
      const sections = getShortcutMenuSections({
        view: "life",
        isViewingCurrentPeriod: true,
      });

      expect(sections.map((section) => section.id)).toEqual([
        "navigate",
        "focus",
        "other",
      ]);
      expect(stripMetadata(sections[0]?.shortcuts ?? [])).toEqual([
        { keys: ["j"], label: "Previous life variation" },
        { keys: ["k"], label: "Next life variation" },
        { keys: ["t"], label: "Focus current week" },
        { keys: ["d"], label: "Go to Day view" },
        { keys: ["w"], label: "Go to Week view" },
      ]);
      // Life mounts its own hold-Mod jump targets, so the gesture stays
      // discoverable via the same row shown on Day/Week.
      expect(stripMetadata(sections[1]?.shortcuts ?? [])).toEqual([
        {
          keys: ["Mod", "1-9"],
          label: "Jump to a page area (hold Mod for hints)",
        },
      ]);
    });

    it("lists PageUp/PageDown and Alt+Arrow grid scroll in day and week, not life", () => {
      for (const view of ["day", "week"] as const) {
        const [navigate] = getShortcutMenuSections({
          view,
          isViewingCurrentPeriod: true,
        });

        expect(stripMetadata(navigate.shortcuts)).toContainEqual({
          keys: ["PageUp"],
          label: "Scroll grid up",
        });
        expect(stripMetadata(navigate.shortcuts)).toContainEqual({
          keys: ["PageDown"],
          label: "Scroll grid down",
        });
        expect(stripMetadata(navigate.shortcuts)).toContainEqual({
          keys: ["Alt", "ArrowUp"],
          label: "Scroll grid up one hour",
        });
        expect(stripMetadata(navigate.shortcuts)).toContainEqual({
          keys: ["Alt", "ArrowDown"],
          label: "Scroll grid down one hour",
        });
      }

      const [lifeNavigate] = getShortcutMenuSections({
        view: "life",
        isViewingCurrentPeriod: true,
      });
      expect(stripMetadata(lifeNavigate.shortcuts)).not.toContainEqual({
        keys: ["PageUp"],
        label: "Scroll grid up",
      });
      expect(stripMetadata(lifeNavigate.shortcuts)).not.toContainEqual({
        keys: ["PageDown"],
        label: "Scroll grid down",
      });
      expect(stripMetadata(lifeNavigate.shortcuts)).not.toContainEqual({
        keys: ["Alt", "ArrowUp"],
        label: "Scroll grid up one hour",
      });
      expect(stripMetadata(lifeNavigate.shortcuts)).not.toContainEqual({
        keys: ["Alt", "ArrowDown"],
        label: "Scroll grid down one hour",
      });
    });

    it("lists the Up Next shortcuts in both views", () => {
      for (const view of ["day", "week"] as const) {
        const [navigate] = getShortcutMenuSections({
          view,
          isViewingCurrentPeriod: true,
        });

        expect(stripMetadata(navigate.shortcuts)).toContainEqual({
          keys: ["n"],
          label: "Open Up Next event",
        });
        expect(stripMetadata(navigate.shortcuts)).toContainEqual({
          keys: ["v"],
          label: "Join Up Next meeting",
        });
      }
    });

    it.each([
      ["day", true, "Scroll to now"],
      ["day", false, "Go to today"],
      ["week", true, "Scroll to now"],
      ["week", false, "Go to current week"],
    ] as const)("labels 't' for %s view when isViewingCurrentPeriod=%p", (view, isViewingCurrentPeriod, label) => {
      const [navigate] = getShortcutMenuSections({
        view,
        isViewingCurrentPeriod,
      });

      expect(stripMetadata(navigate.shortcuts)).toContainEqual({
        keys: ["t"],
        label,
      });
    });

    it("includes the all-day event shortcut in both views' Create section", () => {
      const findCreate = (view: "day" | "week") =>
        getShortcutMenuSections({ view, isViewingCurrentPeriod: true }).find(
          (section) => section.id === "create",
        );

      expect(stripMetadata(findCreate("day")?.shortcuts ?? [])).toContainEqual({
        keys: ["Shift", "C"],
        label: "Create all-day event",
      });
      expect(stripMetadata(findCreate("week")?.shortcuts ?? [])).toContainEqual(
        {
          keys: ["Shift", "C"],
          label: "Create all-day event",
        },
      );
      expect(stripMetadata(findCreate("day")?.shortcuts ?? [])).toContainEqual({
        keys: ["Shift", "Arrow keys"],
        label: "Place timed draft on grid",
      });
      expect(stripMetadata(findCreate("week")?.shortcuts ?? [])).toContainEqual(
        {
          keys: ["Shift", "Arrow keys"],
          label: "Place timed draft on grid",
        },
      );
      expect(stripMetadata(findCreate("day")?.shortcuts ?? [])).toContainEqual({
        keys: ["Escape"],
        label: "Discard placed draft",
      });
      expect(stripMetadata(findCreate("week")?.shortcuts ?? [])).toContainEqual(
        {
          keys: ["Escape"],
          label: "Discard placed draft",
        },
      );
    });

    it("lists u/i focus shortcuts per view", () => {
      const findFocus = (view: "day" | "week") =>
        getShortcutMenuSections({
          view,
          isViewingCurrentPeriod: true,
        }).find((section) => section.id === "focus");

      expect(stripMetadata(findFocus("day")?.shortcuts ?? [])).toEqual([
        { keys: ["i"], label: "Focus month picker" },
        { keys: ["u"], label: "Focus calendar event" },
        { keys: ["h"], label: "Toggle event jump keys" },
        {
          keys: ["Shift", "m"],
          label:
            "Focus a day's events (Shift + M T W R F, Shift + S then U or A)",
        },
        { keys: ["f"], label: "Focus latest notice" },
        {
          keys: ["Mod", "1-9"],
          label: "Jump to a page area (hold Mod for hints)",
        },
      ]);
      expect(stripMetadata(findFocus("week")?.shortcuts ?? [])).toEqual([
        { keys: ["i"], label: "Focus month picker" },
        { keys: ["u"], label: "Focus calendar event" },
        { keys: ["h"], label: "Toggle event jump keys" },
        {
          keys: ["Shift", "m"],
          label:
            "Focus a day's events (Shift + M T W R F, Shift + S then U or A)",
        },
        { keys: ["f"], label: "Focus latest notice" },
        {
          keys: ["Mod", "1-9"],
          label: "Jump to a page area (hold Mod for hints)",
        },
      ]);
    });

    it("includes Delete in the day and week Edit sections", () => {
      for (const view of ["day", "week"] as const) {
        const edit = getShortcutMenuSections({
          view,
          isViewingCurrentPeriod: true,
        }).find((section) => section.id === "edit");

        expect(stripMetadata(edit?.shortcuts ?? [])).toContainEqual({
          keys: ["Delete"],
          label: "Delete focused event",
        });
        expect(stripMetadata(edit?.shortcuts ?? [])).toContainEqual({
          keys: ["Mod", "D"],
          label: "Duplicate focused event",
        });
        expect(stripMetadata(edit?.shortcuts ?? [])).toContainEqual({
          keys: ["Mod", "C"],
          label: "Copy focused event",
        });
        expect(stripMetadata(edit?.shortcuts ?? [])).toContainEqual({
          keys: ["Mod", "V"],
          label: "Paste copied event",
        });
        expect(stripMetadata(edit?.shortcuts ?? [])).toContainEqual({
          keys: ["ArrowUp"],
          label:
            view === "week"
              ? "Focus previous event on day"
              : "Focus previous event",
        });
        expect(stripMetadata(edit?.shortcuts ?? [])).toContainEqual({
          keys: ["ArrowDown"],
          label:
            view === "week" ? "Focus next event on day" : "Focus next event",
        });
        expect(stripMetadata(edit?.shortcuts ?? [])).toContainEqual({
          keys: ["ArrowLeft"],
          label:
            view === "day"
              ? "Focus previous event"
              : "Focus event on previous day",
        });
        expect(stripMetadata(edit?.shortcuts ?? [])).toContainEqual({
          keys: ["ArrowRight"],
          label:
            view === "day" ? "Focus next event" : "Focus event on next day",
        });
        expect(stripMetadata(edit?.shortcuts ?? [])).toContainEqual({
          keys: ["Enter"],
          label: "Open focused event",
        });
        expect(stripMetadata(edit?.shortcuts ?? [])).toContainEqual({
          keys: ["x"],
          label: "Hide or show focused event",
        });
      }
    });

    it("lists e-then-field edit sequences with nothing focused", () => {
      for (const view of ["day", "week"] as const) {
        const edit = getShortcutMenuSections({
          view,
          isViewingCurrentPeriod: true,
        }).find((section) => section.id === "edit");
        const shortcuts = stripMetadata(edit?.shortcuts ?? []);

        expect(shortcuts).toContainEqual({
          keys: ["e", "t"],
          label: "Edit title",
        });
        expect(shortcuts).toContainEqual({
          keys: ["e", "d"],
          label: "Edit description",
        });
        expect(shortcuts).toContainEqual({
          keys: ["e", "s"],
          label: "Edit start time",
        });
        expect(shortcuts).toContainEqual({
          keys: ["e", "e"],
          label: "Edit end time",
        });
        expect(shortcuts).toContainEqual({
          keys: ["e", "r"],
          label: "Edit recurrence",
        });
        expect(shortcuts).toContainEqual({
          keys: ["e", "a"],
          label: "Edit guests",
        });
        expect(
          shortcuts.some((shortcut) => shortcut.label === "Edit account"),
        ).toBe(false);
        expect(shortcuts).toContainEqual({
          keys: ["e", "c"],
          label: "Edit color",
        });
      }
    });

    it("lists Life and undo/redo in day/week navigate and other sections", () => {
      const sections = getShortcutMenuSections({
        view: "day",
        isViewingCurrentPeriod: true,
      });
      const navigate = sections.find((section) => section.id === "navigate");
      const other = sections.find((section) => section.id === "other");

      expect(stripMetadata(navigate?.shortcuts ?? [])).toContainEqual({
        keys: ["l"],
        label: "Go to Life view",
      });
      expect(stripMetadata(other?.shortcuts ?? [])).toContainEqual({
        keys: ["Mod", "Z"],
        label: "Undo last change",
      });
      expect(stripMetadata(other?.shortcuts ?? [])).toContainEqual({
        keys: ["Mod", "Shift", "Z"],
        label: "Redo last change",
      });
    });

    it("lists Shift+Arrow reschedule shortcuts in the day and week Edit sections", () => {
      for (const view of ["day", "week"] as const) {
        const edit = getShortcutMenuSections({
          view,
          isViewingCurrentPeriod: true,
        }).find((section) => section.id === "edit");

        expect(stripMetadata(edit?.shortcuts ?? [])).toContainEqual({
          keys: ["Shift", "ArrowLeft"],
          label: "Move event to previous day",
        });
        expect(stripMetadata(edit?.shortcuts ?? [])).toContainEqual({
          keys: ["Shift", "ArrowRight"],
          label: "Move event to next day",
        });
        expect(stripMetadata(edit?.shortcuts ?? [])).toContainEqual({
          keys: ["Shift", "ArrowUp"],
          label: "Move event 15 min earlier",
        });
        expect(stripMetadata(edit?.shortcuts ?? [])).toContainEqual({
          keys: ["Arrow keys"],
          label: "Move draft event",
        });
      }
    });

    it("labels the Other section with a sidebar toggle", () => {
      const other = getShortcutMenuSections({
        view: "day",
        isViewingCurrentPeriod: true,
      }).find((section) => section.id === "other");

      expect(other?.title).toBe("Other");
      expect(stripMetadata(other?.shortcuts ?? [])).toContainEqual({
        keys: ["]"],
        label: "Toggle sidebar",
      });
    });
  });
});
