# Changelog

The release workflow lifts the section matching the tag out of this file and
uses it as the GitHub release body — which is exactly what the panel shows in
its update dialog. So this is the text your users read. Write it for them, not
for yourself: what changed, what got fixed, what they need to do differently.

Keep the heading format `## [version] - date`. The version has to match
`ExtensionBundleVersion` in `CSXS/manifest.xml`.

## [1.1.0] - 2026-07-26

### Added
- **Automatic updates.** The panel checks GitHub once a day and offers any new
  version with its release notes. Install straight away, postpone for a day, or
  skip a version entirely.
- A waiting update is shown permanently, not only in the dialog: the version in
  the sidebar, a dot on the Settings tab and a line plus an install button in
  Settings. It survives a restart and shows even offline.
- Update settings in Settings → Updates: a manual check, the installed version,
  automatic checking on or off, and whether beta versions get offered.
- **One-click install for the shortcut scripts.** Settings → Shortcut scripts
  copies them into the After Effects Scripts folder for every installed version,
  no administrator rights and no hunting through AppData.
- The shortcut scripts are refreshed by an update afterwards, so scripts added
  in a new release show up without being copied by hand.

### Changed
- The Guide has an Updates section, and its keyboard shortcuts section now
  points at the install button instead of telling you to copy files by hand.
- The interface language is now stored alongside the presets as well, so it
  survives an After Effects restart even when CEP drops its local storage.

### Fixed
- Nothing yet — this is where fixed things go.

## [1.0.0] - 2026-07-25

- First release: curve editor, preset library with `.flow` import and export,
  layer and transform tools, composition settings, project organizer and the
  standalone shortcut scripts.
