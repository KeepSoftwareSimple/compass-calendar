# Contextual Pointer Guidance

Every click teaches the keyboard path for the clicked control instead of
failing silently. Clicks are not blocked: text selection, copy buttons, and
native buttons keep working. Acceptance coverage lives in
[Shortcuts](../acceptance/shortcuts.md#scenario-13-the-mouse-teaches-the-keyboard).

## How it works

1. Interactive targets opt in with `data-pointer-action` (and
   `data-pointer-event-id` for a specific event). Working controls that have
   a shortcut carry `data-pointer-shortcut`, usually stamped by
   `TooltipWrapper`'s `shortcut` prop.
2. `usePointerHintTracker` (mounted in `RootShell`) listens for `pointerdown`
   at window capture without calling `preventDefault`. It resolves the nearest
   annotated ancestor in `composedPath()` and pulses the pointer-hint store.
   Native buttons and links are marked `performed: true`; a working control
   with nothing to teach stays silent, as does whitespace.
3. `PointerHint` renders copy for the attempt. A performed click says
   `Next time, press <key>`. Sidebar open/close teach `]`. Event open teaches
   the current jump token plus Enter, or `H` if no token is available. An
   empty timed-grid click teaches the matching HHMM digits (`1200`, `1830`)
   so the same create can be typed. An empty all-day-row click teaches
   `Shift+C`. The sidebar month picker (`calendar.date-pick`) teaches `I`,
   then the arrow keys and Enter. The X turns tips off for that browser
   (`compass.pointer-hint.dismissed-permanently`).
4. A primary event click also dispatches `compass:pointer-event-jump` so the
   mounted grid's event-jump owner can assign tokens and focus the event.
   Right-clicks teach nothing so `M` still opens the context menu. An
   empty-grid click parks that HHMM as a short-lived teaching target so
   typing the shown digits creates at the clicked instant. Both keep working
   after tips are turned off.
5. `pointer_hint_shown` and `pointer_hint_dismissed` are captured so
   adoption can be read as a funnel into `shortcut_invoked`.

Unannotated controls that look clickable (`role="button"`) get the generic
fallback. A subtree can opt out with `data-pointer-pass` (MobileGate, the
welcome modal, copy buttons) so those clicks stay silent.

`/life` is a public lead magnet: the tracker is disabled and `PointerHint`
is not mounted there.

## Adding a target

- For a dead target, add a `POINTER_ACTIONS` id and teach it in
  `PointerHint`. For a working control, pass `shortcut` to `TooltipWrapper`
  or spread `pointerShortcutAttributes`.
- Annotate the interactive element, not an inner icon.
- Keep the shown shortcut executable from the current view and lock state.
