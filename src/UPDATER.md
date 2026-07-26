# Automatic updates

The panel checks GitHub for new releases and installs them itself. This file is
for you, the person publishing them.

## One-time setup

1. **Point it at your repository.** Open `update.json` and set `owner` and
   `repo` to your GitHub account and repository name. Nothing else has to
   change.

2. **Push the repository to GitHub**, including `.github/workflows/release.yml`.
   The repository can be public or private — but a private one needs a token to
   read releases, which the panel does not have, so **the repository has to be
   public** for updates to reach anyone.

3. **Ship this version normally**, by hand. Automatic updates start working for
   a user only once they are running a version that contains the updater, so
   1.1.0 is the last release anyone installs manually.

## Publishing an update

```
# 1. bump the version in CSXS/manifest.xml (both places)
#    ExtensionBundleVersion="1.2.0"  and  <Extension ... Version="1.2.0" />

# 2. write what changed in CHANGELOG.md, under "## [1.2.0] - 2026-08-01"

# 3. commit, tag, push
git add -A
git commit -m "1.2.0"
git tag v1.2.0
git push && git push origin v1.2.0
```

The workflow then checks that the tag and the manifest agree, lifts your
CHANGELOG section out as the release notes, builds `BeneGToolkit-1.2.0.zip` and
publishes the release. Every panel picks it up within a day, or immediately when
someone presses **Check for updates**.

If the tag and the manifest disagree, the build fails on purpose — a mismatch
would produce an update the panel refuses to install, and failing early is
easier to notice than a silent no-op on other people's machines.

You can also skip the workflow and create the release by hand: tag it `v1.2.0`,
attach a zip of the extension folder, and paste the notes into the release body.
The panel reads the release body directly, so that works identically. It even
works with no zip attached at all — it falls back to GitHub's source archive.

## What the user sees

Whether an update exists is visible at any moment, without pressing anything, in
three places that all read the same stored answer:

- the version at the foot of the sidebar, which changes from `v1.1.0` to
  `● 1.2.0` in the accent colour and becomes clickable
- a dot on the **Settings** tab
- Settings → Updates, which names the waiting version and grows an
  **Install version 1.2.0** button

That answer is written to `settings.json`, so it survives closing the panel and
restarting After Effects, and it shows even with no connection — the panel
reports what the last check found instead of going quiet. **Later** silences the
dialog but deliberately leaves all three showing; **Skip this version** turns
them off. They also go off on their own once the installed version catches up, so
a stale record cannot leave the dot lit forever.

An update is also offered in a dialog with your release notes rendered from Markdown
(headings, dash lists, `code`, **bold** and links), and three choices:

- **Install** — downloads, verifies, backs up, installs, then asks for an After
  Effects restart.
- **Later** — silences it for 24 hours.
- **Skip this version** — never offers that specific version again. A newer one
  still gets through.

After the restart the panel shows the notes once more as "Updated to 1.2.0", so
the change log is not something they have to go looking for. It stays available
under Settings → Updates → **What's new**.

The automatic check is quiet: once a day at most, four seconds after the panel
opens, and it says nothing at all when there is no update. Only the manual
button reports "up to date".

## What is preserved

Nothing an update touches is anywhere near the user's data. Their data lives in

```
Windows  %APPDATA%\BeneGToolkit\
macOS    ~/Library/Application Support/BeneGToolkit/
```

as `presets.json`, `colors.json` and `settings.json`. The installer only writes
inside the extension folder, so it cannot reach them. Concretely, all of this
survives an update:

- every curve preset and every named library, including the active one
- the last curve in the editor, and therefore what **Apply Last Curve** applies
- saved colours
- the effect presets folder and the favourites in it
- the interface language
- the remembered page, input fields and curve editor size

Belt and braces on top of that: the three files are copied aside before an
install starts, and any that turn up missing or unreadable afterwards are put
straight back.

## What happens during an install

1. The zip is downloaded to memory — nothing is touched on disk yet.
2. Every entry's CRC is checked, so a truncated download is refused rather than
   half-installed.
3. The archive must contain `CSXS/manifest.xml` and `index.html`, and its
   manifest version must be newer than what is installed. A wrong file attached
   to a release gets rejected instead of breaking the panel.
4. The current extension folder is copied to
   `<user data>/BeneGToolkit/backups/<version>_<timestamp>/`. The two most
   recent backups are kept.
5. Files are written. If any write fails, the backup goes back and the user is
   told the previous version was restored.
6. Files the *previous* release installed and this one no longer ships are
   deleted — so a renamed script stops appearing in the After Effects Scripts
   menu. This is tracked in `.installed.json`, and only files the updater
   installed itself are ever eligible. Anything the user dropped into the folder
   stays.
7. The shortcut scripts are refreshed wherever they were installed (see below).

## New scripts and new files

You do not have to do anything for these. The installer writes every file in the
archive and creates folders as needed, so a new script, a new JS module, a new
language, a whole new subfolder — all of it installs on its own.

The one case that needed handling is `scripts/*.jsx`. Those live in the After
Effects **Scripts** folder, outside the extension, because After Effects only
offers a keyboard shortcut for something it loaded from there at startup.

Two halves cover it:

- **First-time install** is the button in Settings → Shortcut scripts. It asks
  After Effects where its preferences folder is and which version is running,
  lists the version folders After Effects itself created, and copies the scripts
  into the `Scripts` folder of every one of them — creating it when it does not
  exist yet. Only the per-user folder is used, so it never needs administrator
  rights. Nothing happens without the user pressing the button: writing into
  After Effects is not something an update should do on its own.
- **Keeping them current** is the updater's job. It looks for Scripts folders
  that already contain `_BeneGToolkit_Panel.jsx` — the marker that the user set
  this up — and writes the current set there, removing ones a release has
  dropped. Folders that were never set up are left alone.

New scripts still need an After Effects restart before they appear in the menu,
which the update needs anyway.

## Translations

The dialog's strings are in `js/i18n.js` under the `upd.` prefix, in English and
Czech. `I18N.t()` falls back to English for any missing key, so the other eleven
languages show the dialog in English until someone translates the block. Nothing
breaks in the meantime.

## Troubleshooting

**"The extension folder cannot be written to."** The panel is installed under
`Program Files`, where a normal user cannot write. Move it to
`%APPDATA%\Adobe\CEP\extensions\BeneGToolkit` — the per-user folder — or install
updates by hand with administrator rights.

**"The repository or release was not found."** `owner` or `repo` in
`update.json` is wrong, or the repository is private, or no release has been
published yet.

**"GitHub is rate limiting requests."** Unauthenticated requests to the GitHub
API are capped per IP address per hour. A daily check nowhere near reaches it;
pressing the button repeatedly while testing does.

**Nothing happens on startup.** Automatic checking may be off in Settings, the
last check may have been under 24 hours ago, or the update may have been
postponed or skipped. The manual button ignores all three.

**Testing the whole flow.** Set `ExtensionBundleVersion` in your local
`CSXS/manifest.xml` to something low, like `0.0.1`, open the panel and press
Check for updates. The installed version then really is older than the release,
and the full download-and-install path runs.

## Files this feature added

```
js/updater.js                    the updater itself
update.json                      repository configuration
CHANGELOG.md                     release notes, read by the workflow
UPDATER.md                       this file
.github/workflows/release.yml    builds the zip and publishes the release
```

and it touched `index.html` (the Settings block and the script tag),
`css/style.css` (the dialog), `js/i18n.js` (the `upd.` strings) and `js/main.js`
(the language is now mirrored into `settings.json`).
