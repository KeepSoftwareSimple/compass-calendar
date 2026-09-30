# Pointer intent

When a newcomer reaches for the mouse on the calendar grid or chrome, Compass
infers what they were trying to do, shows the keys that do it once in the
existing top-center `PointerHint` pill, and stops teaching that intent after
the user invokes the named shortcut or hits the session rules below.

Grid clicks are never blocked. Chrome controls stay mouse-operable and teach on
the working click. `/life` and mobile skip the tracker entirely.

## Intent table

| Signal | Taught registry ids | Pill copy (placeholders become keycaps) |
| --- | --- | --- |
| Event card click (no drag) | `edit-open`, `focus-shift-hold` | Press {0} to open. Hold {1} to jump to any event. |
| Timed slot click | `create-typed-time`, `create-timed` | Type HHMM for that slot, or press {1}. |
| All-day slot click | `create-allday` | Press {0} for an all-day event. |
| Card drag (8px+) | `edit-move-later`, `edit-move-hour-later` | {0} moves 15 min. {1} moves an hour. |
| Three vertical wheel gestures on `#mainGrid` | `nav-scroll-hour-down`, `nav-today` | {0} scrolls an hour. {1} jumps to now. |
| Horizontal swipe week nav | `nav-next` or `nav-previous` | Next time, press {0}. |
| Header or other chrome click with a registry shortcut | that id | Next time, press … (default pill shape) |
| Form field click (location, etc.) | `edit-jump-field-digit` | Mod+digit chip flash plus pill |
| Right-click opens event menu | `edit-menu` | Next time, press M. |
| Hover-hunt (4s, 3+ targets) | `focus-page-jump` | Hold Mod/Cmd to see where you can jump. |

Card click also arms event jump (`requestPointerEventJump`) so Enter opens the
event the user clicked. Hover-hunt briefly reveals page-jump chips so the hold
hint is demonstrated, not described.

## Rules

- **Once per intent per session.** Each named intent teaches at most once.
- **Session cap.** At most three pointer-sourced pills per session
  (`MAX_POINTER_HINTS_PER_SESSION`), counting every surface in the intent table.
- **Retire on use.** No hint for a registry id the per-browser usage profile
  already records as invoked.
- **Level 2 (Explorer).** No pointer hints at all, from any row of the intent
  table, once the browser reaches Explorer (four shortcuts used).
- **Muted and dismissed.** `compass.shortcuts.tips-muted` and
  `compass.pointer-hint.dismissed-permanently` suppress pills. Palette and
  pointer sources share the same store.
- **App lock.** No hints while billing gate, auth modal, or another onboarding
  surface holds the app lock.
- **One channel.** Hints use `PointerHint` in the `pointerHint` onboarding
  slot (lowest priority). Attempts carry `source: "palette" | "pointer"`,
  optional `message`, and `keys` for placeholder expansion.
- **Surface slot.** Only one pill at a time; a visible pill blocks another pulse.

Context menu **Edit**, **Duplicate**, **Delete**, **Hide**, and color swatches
refuse a real pointer click with the existing “Keyboard only, press …” toast;
keyboard paths still run.

## Telemetry

1. `pointer_intent_detected { intent, view }` on every classified intent, even
   when no pill is shown (muted, retired, capped, or Explorer).
2. `pointer_hint_shown { intent, shortcut_id, view, source }` when the pill
   renders (`source` is `pointer` or `palette`).
3. `pointer_hint_dismissed` when the user clicks the pill X (persists dismiss).
4. Funnel to watch: detected → shown → `shortcut_invoked` for the taught id
   within 60 seconds.

## File map

- Intent model and copy: `apps/calendar-web/src/views/Week/pointer-intent/pointer-intent.ts`
- Capture-phase grid tracker: `apps/calendar-web/src/views/Week/pointer-intent/attachPointerIntentTracker.ts`
- Notify + PostHog: `apps/calendar-web/src/views/Week/pointer-intent/pointer-intent.actions.ts`
- Teach policy (cap, mute, lock, Explorer, usage), shared by every surface below: `apps/calendar-web/src/shortcuts/pointer-intent/pointer-hint.teach-policy.ts`
- Grid intent adapter for that policy: `apps/calendar-web/src/views/Week/pointer-intent/pointer-intent.teach-policy.ts`
- Session counters: `apps/calendar-web/src/views/Week/pointer-intent/pointer-intent.session.ts`
- Chrome click teach helper: `apps/calendar-web/src/shortcuts/pointer-intent/pulseClickTaughtShortcut.ts`
- Real-pointer click predicate: `apps/calendar-web/src/shortcuts/pointer-intent/real-mouse-click.ts`
- Context menu M teach: `apps/calendar-web/src/shortcuts/context-menu/context-menu-pointer-hint.ts`
- Pill UI + store: `apps/calendar-web/src/components/PointerHint/PointerHint.tsx`,
  `apps/calendar-web/src/shortcuts/keyboard-only/pointer-hint.store.ts`
- Event jump bridge: `apps/calendar-web/src/shortcuts/keyboard-only/pointer-grid-bridge.ts`
- Newcomer sidebar cadence (60 s): `apps/calendar-web/src/shortcuts/tips/useShortcutHintContext.ts`
- Intent-aware tip ranking: `apps/calendar-web/src/shortcuts/tips/rankShortcutHints.ts`

Acceptance: [Shortcuts scenario 13](../acceptance/shortcuts.md#scenario-13-the-mouse-teaches-the-keyboard),
[Onboarding scenario 5](../acceptance/onboarding.md#scenario-5-sidebar-tip-mute).
E2e: `e2e/timed/mouse-teaches.spec.ts`, `e2e/accessibility/teaching-surface-a11y.spec.ts`.
