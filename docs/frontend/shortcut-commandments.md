# Shortcut Commandments

Product rules for Compass keyboard shortcuts. The `?` legend lists every
binding; this doc is the *why* — the constraints a new shortcut must satisfy
so the keyboard calendar stays learnable.

`Mod` is Command on Mac and Control on Windows/Linux. Users often say
"Meta" for the same hold-to-reveal gesture.

Acceptance walkthroughs live in [Shortcuts](../acceptance/shortcuts.md).
The display registry is `packages/web/src/shortcuts/shortcuts.registry.ts`.

---

## 1. You can target any element any time

If a control is on screen and interactive, there is a keyboard path to it
from the current context — Day, Week, or Life; creating or editing; caret
in a field or focus on the grid. You do not have to change views, close
the form, or enter a special mode first.

"Any element" means first-class targets (form fields, page areas, events),
not every DOM node. Save, All-day, and RSVP are actions or modifiers on
those targets, not their own jump digits.

## 2. You can always discover the sequence by holding Mod

Holding Mod (Meta/Cmd on Mac, Ctrl elsewhere) for a beat reveals the jump
keys for whatever is currently targetable. Do not make the user memorize
`Mod+8` for guests or `Mod+3` for Up next. If they can see it, they can
hold Mod and read the chip.

The `?` overlay is the catalog. Hold-Mod is in-the-moment discovery.

## 3. Hints never lie

A chip appears only when the matching key would actually do something.
Unmounted targets get no chip and their digit is a no-op (calendar picker
on an edit draft, collapsed sidebar, empty Up Next, guests on a calendar
that cannot invite).

Scrolled-out targets keep their shortcut but hide the chip, so a portaled
keycap does not float over empty space.

## 4. Chip the field, not a child widget

Hint chips anchor on the visible control. Focus may land on a descendant
(the caret inside a combobox, the selected color swatch). Never put the
jump id on a hidden 2px react-select dummy input, or the chip vanishes
even though the shortcut still works.

Form fields: `getEventFormFieldAnchor` vs `getEventFormFieldElement` in
`packages/web/src/common/utils/form/form.util.ts`. Page areas already
split `getPageJumpAnchor` / `getPageJumpFocusElement`.

## 5. Typing always types

Bare letter shortcuts stand down while the caret is in an editable field.
Mod chords stay available so discovery and jumps still work while typing:
`Mod+digit` (jump), `Mod+E` (same field jumps as `e`…), `Mod+K` (command
palette).

## 6. One hold-Mod gesture; context chooses the map

The hold is the same everywhere. Digits are a single namespace, so the
open event form takes them over for its fields (1–9 in DOM order). With
the form closed, the same hold numbers page areas left to right (view
dropdown, then Day calendar columns, then month picker / Up next /
each connected calendar account — or Life's grid/variation/details).
With no accounts, the last sidebar slot is the calendar list as a whole.
Day view inserts writable columns after `1` so Shift+Arrow / C can seed
a draft on a focused column.

Do not run both maps at once. Do not invent a second hold key.

Settings is an OverlayPanel with its own letter map while it holds app-lock
(`packages/web/src/settings/useSettingsShortcuts.ts`). Those letters are not
page-jump digits; they activate controls already on the Settings overlay.
Billing: `U` Update card,
`C` Cancel subscription, `R` Resume subscription. Accounts: `A` Add account,
`E` Export, `D` Delete account, `O` Log out. `B` (trial badge / Start
Premium) is registered by `UpgradeConfirmationProvider` and keeps working
while Settings is open. Meeting settings reveal only sidebar digits
`Mod+1/2/3` and Enter on Save or Continue. Weekly hours plus and minus
buttons and weekday checkboxes have no chips. A weekday checkbox is not
an editable target, so `j` and `k` still step the wizard. Inside the
Meeting setup wizard, `j` and `k` step back and forward because the
calendar period keys are locked out by the modal. Meeting settings do not use an
`e` leader. The `?` overlay remains the catalog; hold-Mod still reveals
the chips.

## 7. Leaders wait, then teach

`e` then a letter within ~600ms is silent muscle memory. Hold the leader
and the which-key menu appears. Hold-Mod uses the same cadence
(`MOD_HOLD_HINT_MS` / `ARM_WINDOW_MS`). A new sequence should feel like
these two, not like a third timing model.

## 8. Escape peels the innermost layer

Escape closes the open listbox, then the form, then event-jump, then the
palette. A shortcut that swallows Escape while a floating layer is open
is a bug. Floating layers register with `useFloatingLayer`.

Dismissible `OverlayPanel`s (Settings, confirmations, About) listen for
Escape on `document`, last-in-wins, so the key still peels the top overlay
when focus has fallen to `document.body`. Panels that omit `onDismiss`
(the billing gate) stay undismissible. Toasts advertise Esc only when no
higher owner holds the key.

---

## Adding a jump target

1. Give it a stable, visible anchor (wrapper id or `pageJumpAttrs`).
2. Make sure hold-Mod chips that anchor, and that the digit/letter focuses
   a usable control inside it.
3. Omit the chip when the target is not rendered or not focusable.
4. Add a registry row only if the `?` legend should list it; hold-Mod is
   still the way to discover the live mapping.

Form field digits live in
`packages/web/src/shortcuts/edit-sequence/edit-sequence.fields.ts` (DOM
order, 1–9). Page-area digits live in
`packages/web/src/shortcuts/page-jump/page-jump.targets.ts`. Day-view
calendar columns are built by `buildDayPageJumpTargets` in left-to-right
order (view, columns, sidebar). Meeting save-error field anchors live in
`packages/web/src/booking/booking-sequence.fields.ts`.
