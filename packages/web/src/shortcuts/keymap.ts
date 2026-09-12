/**
 * Shared bindings for the shortcuts the Shortcut Showcase teaches.
 *
 * Each entry pairs the runtime binding with the keycaps shown in hints so a
 * remap here propagates to the real handlers, the showcase, and its hint
 * chips in one edit. Bindings come in four shapes because the app has four
 * dispatch styles: tanstack hotkey strings, the bespoke `e`… sequence engine,
 * bare-letter capture listeners (`h`, `f`, `m`), and the hold-Mod + digit-chord
 * engine (`jumpFormField`).
 *
 * Only taught bindings live here — this is not a registry of every shortcut.
 * `shortcuts.registry.ts` remains the display list for the help overlay; its
 * rows for these bindings derive from this table, so a remap here updates the
 * legend by construction.
 */
export const KEYMAP = {
  createEvent: { hotkey: "C", keycaps: ["C"] },
  saveDraft: { hotkey: "Enter", keycaps: ["Enter"] },
  // 1-9 are the form's fields in DOM order; 0 is the action toolbar above the
  // title (duplicate / delete / close); `-` is RSVP (Going?).
  jumpFormField: {
    holdModifier: "Mod",
    digits: ["0", "9", "-"],
    keycaps: ["Mod", "0-9", "-"],
  },
  // Same hold-Mod gesture outside the form: digits follow the active view's
  // target list order (page-jump.targets.ts). Day view numbers left to right
  // (view, columns, sidebar), up to the physical top row.
  jumpPageTarget: {
    holdModifier: "Mod",
    digits: ["1", "9"],
    keycaps: ["Mod", "1-9"],
  },
  moveFocus: {
    hotkeys: {
      up: "ArrowUp",
      down: "ArrowDown",
      left: "ArrowLeft",
      right: "ArrowRight",
    },
    keycaps: ["ArrowLeft", "ArrowUp", "ArrowDown", "ArrowRight"],
  },
  editTitle: { sequence: { leader: "e", second: "t" }, keycaps: ["E", "T"] },
  eventJump: { bareLetter: "h", keycaps: ["H"] },
  moveEvent: {
    hotkeys: {
      up: "Shift+ArrowUp",
      down: "Shift+ArrowDown",
      left: "Shift+ArrowLeft",
      right: "Shift+ArrowRight",
    },
    keycaps: ["Shift", "ArrowRight"],
    // Timed start/end edges only move in time. Left/right stay whole-event
    // day shifts; the practice and edge-focus tip teach the vertical axis.
    timedEdgeKeycaps: ["Shift", "ArrowUp", "ArrowDown"],
  },
  edgeFocus: { hotkey: "Tab", keycaps: ["Tab"] },
  undo: { hotkey: "Mod+Z", keycaps: ["Mod", "Z"] },
  redo: { hotkey: "Mod+Shift+Z", keycaps: ["Mod", "Shift", "Z"] },
  commandPalette: { hotkey: "Mod+K", keycaps: ["Mod", "K"] },
} as const;
