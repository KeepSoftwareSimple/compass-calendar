# Palette keyboard tips

After you run a command from the palette that has a shortcut, Compass shows a
short **Next time, press …** pill at the top of the screen. The pill is driven
by `pulsePaletteTaughtShortcut` in
`packages/web/src/components/CommandPalette/palette-shortcut-telemetry.ts` and
`PointerHint` in `packages/web/src/components/PointerHint/PointerHint.tsx`.

Clicks on the calendar grid and other controls no longer open this pill. The
command palette is the only teaching surface for that copy.

Dismissal is stored in localStorage under
`compass.pointer-hint.dismissed-permanently` (`STORAGE_KEYS.POINTER_HINT_DISMISSED_PERMANENTLY`).
The X on the pill sets that flag and emits `pointer_hint_dismissed`.

Shift-hold and mod-hold overlays are separate: they implement event jump and
page jump, not click-to-teach. See [Shortcuts](../acceptance/shortcuts.md).
