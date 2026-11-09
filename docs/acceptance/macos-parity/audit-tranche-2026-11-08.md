# macOS web parity audit tranche (2026-11-08)

City timezone search branch: `cursor/city-timezone-search-afc2`. Bare **f** event-jump wiring lives on `cursor/mac-f-preview-audit-afc2`, not this PR.

## City timezone search

- **User report:** Second timezone picker, typing `tampa`, no results.
- **Architecture:** `city-timezones` in `@core/timezone/city-timezone-search`; web `filterTimeZones`; `city-timezone-index.json` via `desktop:export` for `CityTimezoneSearch.swift`.
- **Florida:** US state query prefers US rows; surfaces both `America/New_York` and `America/Chicago` with span note.
