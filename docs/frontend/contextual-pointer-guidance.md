# Pointer intent teaching

When a newcomer reaches for the mouse on `/week` or `/day`, Compass classifies
that gesture into a named **intent**, shows the matching keyboard shortcut once
in the top-center `PointerHint` pill, and stops teaching that intent after the
browser uses the shortcut or hits the session caps. Clicks are never blocked;
the timed grid stays inert while chrome stays mouse-operable.

Palette runs still show **Next time, press …** after a row with a shortcut;
pointer intents reuse the same pill and store. `compass.shortcuts.tips-muted`
(`STORAGE_KEYS.SHORTCUT_TIPS_MUTED`) mutes both channels.

## Intent table

| Intent | Signal | Registry ids taught | Pill copy (placeholders become keycaps) |
| --- | --- | --- | --- |
| `card-click` | Left-click an event card (no drag) | `edit-open`, `focus-shift-hold` | Press {0} to open. Hold {1} to jump to any event. |
| `slot-click` | Left-click empty timed column | `create-typed-time`, `create-timed` | Type {timeKey} to create at {timeLabel}, or press {1}. |
| `allday-click` | Left-click empty all-day row | `create-allday` | Press {0} for an all-day event. |
| `card-drag` | Drag an event card ≥ 8px | `edit-move-later`, `edit-move-hour-later` | {0} moves 15 min. {1} moves an hour. |
| `grid-scroll` | Three vertical wheel gestures on `#mainGrid` within 10s | `nav-scroll-hour-down`, `nav-today` | {0} scrolls an hour. {1} jumps to now. |
| `swipe-next` | Horizontal trackpad swipe navigates forward | `nav-next` | Next time, press {0}. |
| `swipe-prev` | Horizontal trackpad swipe navigates backward | `nav-previous` | Next time, press {0}. |
| `hover-hunt` | Hover four distinct interactive targets in 4s | `focus-page-jump` | Hold Cmd/Ctrl to see where you can jump. |
| `chrome-click` | Pointer click on chrome with a `shortcutId` tooltip | per control (e.g. `nav-next`) | Next time, press {keys}. |
| `context-menu-open` | Right-click opens the grid menu | `edit-menu` | Next time, press {keys}. |
| Form field / Save | Pointer click on taught form controls | `edit-jump-field-digit`, `edit-save`, etc. | Next time, press … or field digit flash |

Card clicks call `requestPointerEventJump` so the taught open shortcut works
immediately. Hover-hunt briefly reveals page-jump chips (2s) so hold-Mod is
demonstrated, not only described.

## Rules

- **Once per intent, self-retiring:** each intent teaches at most once per
  session; at most three pointer hints total per session; never while a hint is
  visible, the app lock is held, tips are muted or permanently dismissed, on
  `/life` or mobile, or after the browser reaches shortcut level 2 (Explorer,
  four distinct shortcuts used).
- **Usage profile:** no hint for a registry id the profile already records as
  used (`shortcut_invoked` / handled invocations).
- **One channel:** `PointerHint` in the `pointerHint` onboarding surface slot
  (lowest priority). `PointerHintAttempt.source` is `"palette"` or `"pointer"`.
- **Keys from the registry:** copy uses `{0}` placeholders; keycaps come from
  registry/runtime bindings via `ShortcutKeys`, not literal strings in messages.
- **Context menu:** Edit, Duplicate, Delete, Hide, and color swatches refuse
  real mouse clicks with the keyboard-only toast; Hide teaches `x` on pointer
  click without hiding.

## Telemetry funnel

1. `pointer_intent_detected { intent, view }` on every classified gesture
   (fires even when the hint is muted or retired).
2. `pointer_hint_shown { intent, shortcut_id, view, source }` when the pill
   renders.
3. `shortcut_invoked` for the taught id within 60s measures conversion.

## File map

| Area | Path |
| --- | --- |
| Intent names, copy templates, session cap | `apps/calendar-web/src/views/Week/pointer-intent/pointer-intent.ts` |
| Capture-phase grid tracker | `apps/calendar-web/src/views/Week/pointer-intent/attachPointerIntentTracker.ts` |
| Teach policy (mute, Explorer, caps) | `apps/calendar-web/src/views/Week/pointer-intent/pointer-intent.teach-policy.ts` |
| Session memory (shown intents, detections) | `apps/calendar-web/src/views/Week/pointer-intent/pointer-intent.session.ts` |
| Pulse + PostHog | `apps/calendar-web/src/views/Week/pointer-intent/pointer-intent.actions.ts` |
| Chrome / form clicks | `apps/calendar-web/src/shortcuts/pointer-intent/pulseClickTaughtShortcut.ts` |
| Context menu `m` hint | `apps/calendar-web/src/shortcuts/context-menu/context-menu-pointer-hint.ts` |
| Pill UI + store | `apps/calendar-web/src/components/PointerHint/PointerHint.tsx`, `apps/calendar-web/src/shortcuts/keyboard-only/pointer-hint.store.ts` |
| Surface slot | `apps/calendar-web/src/components/RootShell/onboarding-surface.ts` |
| Swipe → intent | `apps/calendar-web/src/common/hooks/useHorizontalNavigation.ts` (callback from `WeekView`) |
| Palette channel | `apps/calendar-web/src/components/CommandPalette/palette-shortcut-telemetry.ts` |

Acceptance: [Shortcuts scenario 13](../acceptance/shortcuts.md#scenario-13-the-mouse-teaches-the-keyboard).
E2e: `e2e/timed/mouse-teaches.spec.ts`, `e2e/accessibility/teaching-surface-a11y.spec.ts`.
