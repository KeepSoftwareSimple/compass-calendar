# macOS repository boundary

The native app lives in [compass-calendar-mac](https://github.com/KeepSoftwareSimple/compass-calendar-mac).
Swift sources, Xcode configuration, snapshots, native CI, release feeds, and parity accounting are owned there.
The source tree and file history before extraction remain available in this repository's Git history.

API schemas, web behavior, and their export generators remain here because they are owned by core and web.
Native CI tests the committed generated artifacts independently. Web CI does not clone or build the native app.
Export changes explicitly when updating the native app's API or parity baseline:

```sh
# From compass-calendar after bun install:
export COMPASS_MACOS_DIR=/absolute/path/to/compass-calendar-mac/apps/calendar-macos
bun cli contracts:swift
bun cli desktop:export
bun cli contracts:swift --check
bun cli desktop:export --check
```

Without COMPASS_MACOS_DIR, exports write under build/desktop-export, never into a tracked native folder.
The native repository provides .github/scripts/sync-from-web.sh to run these commands and record the source commit.
Review and commit generated changes in the native repo. Ordinary web changes do not launch native CI.

The organization ruleset still requires a check named `macos` in this repository.
`test-repository-boundary.yml` supplies it on Ubuntu and verifies Swift sources and Mac runner jobs remain
absent. The native repository owns the actual `macos` build and test rollup. No organization settings change
is needed for this extraction.

Signing, notarization, Sparkle credentials, and any parity worker credentials must be configured separately in
the native repository by an owner. Existing releases and appcasts stay available in the source repository so
installed versions keep their current update URL. Publishing a signed bridge release to that old feed, with
the new repository feed embedded, is a separate release operation.
