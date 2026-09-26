# Shortcut Levels

A small `Lv N` badge in the sidebar footer, between the `?` legend button and
Refresh. It shows how many distinct keyboard shortcuts this browser has used
against a fixed level table, so people can see their own progress without
opening the legend. It is additive: the rotating sidebar tip and the legend's
own "used" check marks are unchanged.

## Level model

A shortcut counts once it has been used at least once. The level is computed
from `SHORTCUT_LEVELS` (`packages/web/src/shortcuts/level/shortcut-level.ts`)
against the current `SHORTCUTS_REGISTRY` length, so a build that adds or
removes a registry row changes the denominator automatically:

| Level | Name | Distinct shortcuts used |
|---|---|---|
| 1 | Newcomer | 0 |
| 2 | Explorer | 4 |
| 3 | Navigator | 10 |
| 4 | Editor | 20 |
| 5 | Power user | 35 |
| 6 | Keyboard master | 55 |

`shortcut-level.ts` has no imports. The badge component
(`components/Sidebar/SidebarActions/ShortcutLevelBadge.tsx`) is the only file
that imports the registry as a value; the level model, the usage-profile
storage, and the telemetry module never do, so the level cannot be pulled into
the hotkey registration path the way it was once by accident (see the
`shortcut_invoked` registry-id work).

## Where the count comes from

The badge reads the same per-browser usage profile the legend's check marks
use (`shortcuts/tips/shortcut-personalization.storage.ts`,
`STORAGE_KEYS.SHORTCUT_PERSONALIZATION`), through a reactive
`useShortcutUsageProfile()` hook so the badge updates live as shortcuts run.
No server sync: a new device starts at level 1.

## Try next

Hovering or focusing the badge opens a tooltip with the level name, progress
to the next level, and up to three unused, unlocked shortcuts from the
current view's legend sections (edit-section rows first when a calendar event
is focused). Clicking the badge opens the `?` legend, same as the `?` button.

## Level-up

Reaching a new level pulses the badge (`c-level-pulse`,
`motion-reduce:animate-none`) and shows a status toast. The last celebrated
level is stored under `STORAGE_KEYS.SHORTCUT_LEVEL_CELEBRATED`; an absent key
seeds silently on first mount so a returning browser with existing history is
not congratulated for a level it already had. Nothing is celebrated while the
badge is hidden; showing it again celebrates the accumulated jump once.

## Hiding it

`STORAGE_KEYS.SHORTCUT_LEVEL_HIDDEN`, toggled from the command palette
("Hide shortcut level" / "Show shortcut level") or the tooltip's own "Hide
level" button. Settings has no boolean toggles today, so the palette is the
convention this follows.

## Telemetry

`shortcut_level_up` (`level`, `level_name`, `used`, `total`) and
`shortcut_level_badge_toggled` (`hidden`). No other new event names; shortcut
usage itself is still recorded as `shortcut_invoked`.

## Out of scope

- Syncing the level to the account across devices
- Mastery weighting (counting a shortcut only after repeated use)
- A Settings-modal toggle
- Counting a command-palette run as shortcut use

## File map

`packages/web/src/shortcuts/level/` (the level model and the hidden-badge
store), `components/Sidebar/SidebarActions/ShortcutLevelBadge.tsx`. Acceptance:
[Shortcuts](../acceptance/shortcuts.md) (Scenario 28).
