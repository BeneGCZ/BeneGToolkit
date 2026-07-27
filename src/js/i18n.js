/*
 * i18n.js - the translation engine, and English.
 *
 * Only English lives in this file. It is the fallback every missing key falls
 * back to, so it has to be here anyway - the other twelve languages sit in
 * lang/<code>.js and are fetched when they are actually wanted. Carrying all
 * thirteen meant half a megabyte of JavaScript parsed at every panel open,
 * twelve thirteenths of which nobody was ever going to read.
 *
 * How to add another language:
 *   1) copy lang/en-template or any existing pack, translate the values
 *      (keep the keys, and keep the {0}, {1} placeholders where they are)
 *   2) save it as lang/<code>.js
 *   3) add the language to the LANGUAGES list below
 *   4) done - the Settings switcher picks it up automatically
 */

var I18N = (function () {

    var DICT = {

        /* ============================ ENGLISH ============================ */
        en: {
            // --- Navigation ---
            "nav.curves": "Curves",
            "nav.main": "Main",
            "nav.organize": "Organize",
            "nav.tools": "Tools",
            "nav.settings": "Settings",
            "nav.guide": "Guide",

            // --- Curve editor ---
            "curves.title": "Curve editor",
            "curves.reverse": "Reverse curve",
            "curves.apply": "Apply",
            "curves.readKeys": "Read from keyframes",
            "curves.resize": "Drag to resize (double-click = default)",

            // --- Preset library ---
            "lib.title": "Preset library",
            "lib.sectionTitle": "Library",
            "lib.save": "+ Save",
            "lib.import": "Import",
            "lib.export": "Export",
            "lib.reset": "Reset panel to defaults",
            "lib.about": "Presets are stored in a file in your user folder and survive restarts. Import/Export via .flow is compatible with the Flow plugin.",
            "lib.namePlaceholder": "preset name",

            // --- Main: layers ---
            "main.layers": "Layers",
            "main.solid": "Solid",
            "main.null": "Null",
            "main.adjustment": "Adjustment",
            "main.camera": "Camera",
            "main.solidColor": "Solid color:",
            "main.parentLayers": "Parent layers",
            "main.anchorPoint": "Anchor point:",
            "main.centerAnchor": "Center Anchor",
            "main.centerInComp": "Center in comp",

            // --- Main: transform ---
            "main.transform": "Transform",
            "main.flip": "Flip",
            "main.flipX": "Flip X ↔",
            "main.flipY": "Flip Y ↕",
            "main.fitScale": "Fit / Scale",
            "main.fitToComp": "Fit to Comp",
            "main.fillToComp": "Fill to Comp",

            // --- Main: align ---
            "main.align": "Align",
            "main.alignLabel": "Align:",
            "main.distribute": "Distribute (min. 3 layers):",

            // --- Main: rename ---
            "main.rename": "Rename layers",
            "main.renameBtn": "Rename",
            "main.renamePlaceholder": "base name",

            // --- Main: pre-compose ---
            "main.precomp": "Pre-compose",
            "main.moveAll": "Move all",
            "main.leaveAll": "Leave all",
            "main.moveAllAttributes": "Move all attributes",
            "main.leaveAllAttributes": "Leave all attributes",
            "main.precompName": "pre-comp name",
            "main.precompAbout": "Each selected layer goes into its own pre-comp, trimmed to the layer's duration. <b>Move all</b> moves effects, masks and transforms inside. <b>Leave all</b> keeps them outside on the pre-comp layer (including keyframes and expressions).",

            // --- Tools: resolution ---
            "tools.resolution": "Comp resolution",
            "tools.widthPlaceholder": "width",
            "tools.heightPlaceholder": "height",
            "tools.set": "Set",
            "tools.scaleLayers": "Scale layers to new resolution",
            "tools.resolutionAbout": "Layers are always centered on the new center. Layers with animated position or scale are left untouched.",

            // --- Tools: fps ---
            "tools.fps": "Comp frame rate",
            "tools.fpsPlaceholder": "custom FPS",

            // --- Tools: duration ---
            "tools.duration": "Comp duration",
            "tools.durationPlaceholder": "± seconds (negative too)",
            "tools.durationApply": "Apply",

            // --- Tools: blur ---
            "tools.blur": "Motion Blur / Frame Blending",
            "tools.mblurOn": "MBlur ON",
            "tools.mblurOff": "MBlur OFF",
            "tools.fblendOn": "FBlend ON",
            "tools.fblendOff": "FBlend OFF",
            "tools.blurAbout": "Turning it on also enables the composition master switch so the effect is visible.",

            // --- Tools: cache ---
            "tools.cache": "Purge cache",
            "tools.cacheBtn": "Purge cache",

            // --- Organize ---
            "org.title": "Project organization",
            "org.about": "Sorts all items into folders by type:",
            "org.note": "Comps used inside other comps go to Precomps. Empty folders are removed.",
            "org.fullAbout": "Sorts all items into folders by type:<br /><b>Assets</b> · <b>Audio</b> · <b>Comps</b> · <b>Footage</b> · <b>Precomps</b> · <b>Solids</b><br />Comps used inside other comps go to Precomps. Empty folders are removed.",
            "org.run": "Organize project",
            "org.working": "Organizing project...",

            // --- Settings ---
            "settings.language": "Language",
            "settings.languageAbout": "Applies to the whole panel including messages.",
            "settings.langNote": "Translations other than English and Czech are machine-assisted and may contain mistakes, especially in the Guide. If something reads oddly, switch to English - that is the original wording.",
            "settings.about": "About",
            "settings.aboutText": "BeneG Toolkit — easing curve editor with .flow format support, a preset library and project organization tools.",

            /* --- Updates ---
               Keys added to en and cs only. t() falls back to English for any
               language that has not been translated yet, so the update dialog
               works everywhere and simply reads in English until then. */
            "upd.sectionTitle": "Updates",
            "upd.about": "New versions are published on GitHub. Presets, libraries, the last used curve and every other setting live outside the extension folder and are kept untouched by an update.",
            "upd.installedVersion": "Installed version",
            "upd.checkNow": "Check for updates",
            "upd.whatsNew": "What's new",
            "upd.autoCheck": "Check automatically on startup",
            "upd.allowPrerelease": "Offer beta versions too",
            "upd.allReleases": "All releases on GitHub",
            "upd.tipCheckNow": "Asks GitHub whether a newer version has been released",
            "upd.tipWhatsNew": "Shows the notes for the version currently installed",
            "upd.tipAutoCheck": "Checks once a day at most, and never interrupts what you are doing",
            "upd.tipPrerelease": "Includes releases marked as pre-release on GitHub",

            "upd.available": "An update is available",
            "upd.prerelease": "beta",
            "upd.install": "Install",
            "upd.later": "Later",
            "upd.skip": "Skip this version",
            "upd.close": "Close",
            "upd.gotIt": "Got it",
            "upd.retry": "Try again",
            "upd.openRelease": "Open the release page",
            "upd.noNotes": "This release came without any notes.",
            "upd.updatedTo": "Updated to version {0}",
            "upd.postponed": "Update postponed — you will be reminded tomorrow",
            "upd.skipped": "Version {0} skipped",
            "upd.noHistory": "No update has been installed through the panel yet",

            "upd.checking": "Checking for updates…",
            "upd.upToDate": "Up to date (version {0})",
            "upd.foundVersion": "Version {0} is available",
            "upd.lastChecked": "Last checked {0}",
            "upd.upToDateOn": "Version {0} — up to date as of {1}",
            "upd.neverChecked": "Not checked yet",
            "upd.installVersion": "Install version {0}",

            "upd.downloading": "Downloading…",
            "upd.downloadedBytes": "Downloaded {0}",
            "upd.unpacking": "Unpacking…",
            "upd.step_backup": "Backing up the current version…",
            "upd.step_write": "Installing files…",
            "upd.step_prune": "Removing retired files…",
            "upd.step_scripts": "Updating the shortcut scripts…",
            "upd.step_rollback": "Something failed — restoring the previous version…",

            "upd.doneTitle": "Version {0} installed",
            "upd.doneStatus": "Version {0} installed — restart After Effects",
            "upd.restartNeeded": "Restart After Effects to finish. The panel loads its ExtendScript when it opens, so the new version starts working after a restart.",
            "upd.dataKept": "Presets, libraries, colours, the last used curve, the effect presets folder and every other setting have been kept.",
            "upd.scriptsSynced": "Shortcut scripts refreshed: {0} file(s).",

            // --- Shortcut scripts, installed into After Effects on request ---
            "upd.scriptsTitle": "Shortcut scripts",
            "upd.scriptsAbout": "The scripts for keyboard shortcuts have to live in the After Effects Scripts folder, not in the panel. This copies them there for every installed version of After Effects — no administrator rights needed. Updates keep them current afterwards.",
            "upd.installScripts": "Install into After Effects",
            "upd.tipInstallScripts": "Copies scripts/*.jsx into the After Effects Scripts folder",
            "upd.scriptsWorking": "Copying…",
            "upd.scriptsDone": "Installed {0} file(s) for After Effects {1}. Restart After Effects, then assign shortcuts in Edit > Keyboard Shortcuts under Application > File > Scripts.",
            "upd.scriptsDoneStatus": "{0} script(s) installed — restart After Effects",
            "upd.scriptsPresent": "Installed for After Effects {0}",
            "upd.scriptsAbsent": "Not installed yet",
            "upd.scriptsNoTarget": "No After Effects preferences folder found. Launch After Effects once so it creates one, then try again.",
            "upd.scriptsMissing": "The scripts folder is missing from the extension.",
            "upd.scriptsFailed": "The scripts could not be copied: {0}",
            "upd.backupAt": "Backup of the previous version: {0}",

            "upd.notNewer": "The downloaded archive contains version {0}, which is not newer than the installed {1}. Nothing was changed.",
            "upd.rolledBack": "The previous version has been restored.",
            "upd.noWriteAccess": "The extension folder cannot be written to. It is probably installed under Program Files — install the update manually, or move the extension to the per-user CEP folder.",

            "upd.errRateLimit": "GitHub is rate limiting requests. Try again in a while.",
            "upd.errNotFound": "The repository or release was not found. Check the settings in update.json.",
            "upd.errTimeout": "The connection timed out.",
            "upd.errNetwork": "No connection to GitHub.",
            "upd.errDiskFull": "There is not enough free disk space.",
            "upd.errGeneric": "Update failed: {0}",
            "upd.errNoNode": "Updating is unavailable — this build of the panel has Node.js turned off.",
            "upd.errNoRelease": "No release has been published yet.",
            "upd.errNoAsset": "The release has no zip attached and no source archive.",

            // --- Status messages (panel) ---
            "msg.curveReversed": "Curve reversed",
            "msg.curveSet": "Curve set",
            "msg.curveRead": "Curve loaded",
            "msg.curveReadFail": "Could not read keyframes",
            "msg.invalidNumbers": "Enter valid numbers (e.g. 0.33)",
            "msg.invalidHex": "Invalid hex (e.g. #ff8800)",
            "msg.invalidSize": "Enter a valid width and height",
            "msg.invalidFps": "Enter a valid frame rate",
            "msg.enterSeconds": "Enter number of seconds",
            "msg.enterBaseName": "Enter a base name",
            "msg.libSwitched": "Library: {0}",
            "msg.libCreated": "Library '{0}' created",
            "msg.libExists": "A library with that name already exists",
            "msg.libNoRenameDefault": "The Default library cannot be renamed",
            "msg.libRenamed": "Renamed to '{0}'",
            "msg.libRenameFail": "Rename failed (name already exists?)",
            "msg.libNoDeleteDefault": "The Default library cannot be deleted",
            "msg.libDeleted": "Library deleted",
            "msg.libDeleteFail": "This library cannot be deleted",
            "msg.presetLoaded": "Preset '{0}' loaded",
            "msg.presetDeleted": "Preset deleted",
            "msg.presetSaved": "Preset saved",
            "msg.presetsRestored": "Default presets restored",
            "msg.importCancelled": "Import cancelled",
            "msg.importFail": "Import failed - check the file format",
            "msg.importBadResponse": "Import failed - invalid response",
            "msg.imported": "Imported {0} presets into library '{1}'",
            "msg.exportCancelled": "Export cancelled",
            "msg.exported": "Exported to .flow",
            "dlg.newLibName": "Name of the new library:",
            "dlg.newLibDefault": "New library",
            "dlg.renameLibName": "New library name:",
            "dlg.deleteLibConfirm": "Delete library '{0}' including its presets?",
            "dlg.presetName": "Preset name:",
            "dlg.presetNameDefault": "My preset",
            "dlg.restoreDefaultsConfirm": "Reset the whole panel to its original state? This deletes every preset library you created or imported, the effect preset folder and its favourites, and the editor size.",
            "msg.easingApplied": "Easing applied",
            "msg.anchorCentered": "Anchor centered",
            "msg.layerCentered": "Layer centered",
            "msg.response": "Response: ",
            "curve.custom": "Custom",
            "guide.title": "Guide",
            "guide.intro": "Everything the panel does, explained. Each action is a single undo step, so Ctrl+Z always takes you back.",
            "guide.curvesTitle": "Curves",
            "guide.curvesText": "<b>What it does:</b> builds an easing curve and applies it to selected keyframes in the timeline — the same idea as the Flow plugin.",
            "guide.curvesHandles": "<b>The graph:</b> drag the two orange handles to shape the curve. The horizontal axis is time, the vertical is value. A curve that starts flat means a slow start; a steep middle means the movement rushes through the centre.",
            "guide.curvesNumbers": "<b>The four numbers</b> below the graph are the bezier values (X1, Y1, X2, Y2). You can type them directly — handy for copying an exact ease from somewhere else. Values above 1.00 or below 0.00 create overshoot, where the animation goes past its target and comes back.",
            "guide.curvesModifiers": "<b>While dragging:</b> <b>Shift</b> snaps to 0.10 steps. <b>Ctrl</b> keeps the handle length fixed so it only rotates around its keyframe. <b>Shift+Ctrl</b> mirrors the opposite handle for a symmetrical curve, snapping in fine 0.01 steps.",
            "guide.curvesApply": "<b>Apply:</b> select at least two keyframes in the timeline (or one keyframe with another after it) and press Apply. The easing is written into the keyframes themselves, so it works with any property.",
            "guide.curvesRead": "<b>Read from keyframes:</b> the reverse direction — select keyframes that already have an ease you like and pull their curve into the editor.",
            "guide.curvesLibrary": "<b>Preset library:</b> Save stores the current curve under a name. You can keep several libraries (the dropdown) and switch between them — useful for separating project-specific eases from your everyday ones. Presets live in a file in your user folder, so they survive restarts and AE updates.",
            "guide.curvesFlow": "<b>Import / Export</b> use the .flow format, so presets can be shared with the Flow plugin or with other people.",
            "guide.curvesResize": "<b>Resizing:</b> drag the three dots under the graph to make the editor taller. Double-click resets it. The size is remembered.",
            "guide.mainTitle": "Main — layers",
            "guide.mainLayers": "<b>Creating layers:</b> Solid, Null, Adjustment and Camera. Pick a colour first if you want a coloured solid. If layers are selected when you create a Null, the panel can parent them to it — a quick way to rig a group.",
            "guide.mainAnchor": "<b>Center Anchor</b> moves the anchor point to the middle of the layer without the layer visually moving — the usual fix before scaling or rotating. <b>Center in comp</b> puts the layer itself in the middle of the composition.",
            "guide.mainTransform": "<b>Fit / Fill:</b> Fit scales the layer so the whole of it is visible inside the comp; Fill scales it so the comp is fully covered, cropping the overflow. <b>Flip</b> mirrors the layer horizontally or vertically by inverting its scale.",
            "guide.mainAlign": "<b>Align</b> works against the composition bounds, like AE's own Align panel set to Composition. <b>Distribute</b> spaces layers evenly and needs at least three of them.",
            "guide.mainRename": "<b>Rename layers</b> renames every selected layer to a common base with a number — BG 1, BG 2, BG 3. Layers are numbered top to bottom as they sit in the timeline.",
            "guide.precompTitle": "Pre-compose",
            "guide.precompIntro": "Each selected layer goes into its own pre-composition, trimmed to that layer's in and out points. The head and tail outside the trim are discarded, and the layer keeps its exact position in the timeline — nothing shifts.",
            "guide.precompMove": "<b>Move all attributes</b> is the standard behaviour: effects, masks and transforms move inside the new composition. The pre-comp layer in the main comp is left clean.",
            "guide.precompLeave": "<b>Leave all attributes</b> keeps effects, masks, transforms, blending mode and parenting outside on the pre-comp layer — including keyframes, interpolation and expressions. The composition inside is still trimmed, which AE's own Pre-compose dialog cannot do: it only offers trimming together with Move all.",
            "guide.precompNote": "<b>Note:</b> the panel makes one pre-comp per layer, which also works around AE's rule that Leave all attributes is only available for a single selected layer.",
            "guide.toolsTitle": "Tools — composition",
            "guide.toolsResolution": "<b>Resolution:</b> presets or your own width and height. Layers are always re-centred on the new centre, because AE otherwise leaves them anchored to the top-left corner. Tick <b>Scale layers</b> if you also want them resized proportionally — going from 1920×1080 to 3840×2160 doubles their scale so they cover the same area as before. Layers with animated position or scale are left untouched so the animation is not broken.",
            "guide.toolsFps": "<b>Frame rate</b> changes the composition frame rate. 23.976 is the NTSC film rate; AE stores it internally as 24000/1001.",
            "guide.toolsDuration": "<b>Duration</b> adds or removes seconds. Negative values shorten the comp — it will not go below one frame. The input field takes any number, including decimals.",
            "guide.toolsBlur": "<b>Motion Blur / Frame Blending</b> switches the property on the selected layers and turns on the composition master switch too, otherwise the effect would not show. Layers that do not support the switch are skipped.",
            "guide.toolsCache": "<b>Purge cache</b> clears all AE caches at once. Useful when previews behave oddly or memory is full.",
            "guide.organizeTitle": "Organize",
            "guide.organizeText": "<b>What it does:</b> one click sorts every item in the project into folders by type. Numbered prefixes keep the folders in a sensible order, since the project panel sorts alphabetically.",
            "guide.organizeFolders": "<b>Comps</b> — compositions not used anywhere else · <b>Precomps</b> — compositions used inside another comp, detected automatically · <b>Footage</b> — video and stills · <b>Audio</b> — audio-only files · <b>Solids</b> — solids · <b>Assets</b> — PSD, AI, EPS and SVG. Empty folders left behind are removed. The project panel lists them alphabetically.",
            "guide.organizeWarn": "<b>Worth knowing:</b> this moves everything in the project at once. It is one undo step, but on a big project save first.",
            "guide.tipsTitle": "Good to know",
            "guide.tipUndo": "Every action is wrapped in a single undo group, so one Ctrl+Z reverts it completely — including bulk actions like Organize.",
            "guide.tipStatus": "The status line at the bottom reports what happened, including how many layers were affected. Errors show in red.",
            "guide.tipSkipped": "When a message says something was skipped, it usually means those layers have keyframes or an expression on the property, and the panel deliberately left them alone rather than breaking your animation.",
            "guide.tipLanguage": "The language switcher is in Settings and covers the whole panel including messages. Your choice is remembered.",
            "guide.troubleTitle": "Troubleshooting",
            "guide.troubleNoComp": "<b>\"No active composition\":</b> click into a comp in the timeline first. Having it open in the project panel is not enough.",
            "guide.troubleHidden": "<b>Layers were skipped:</b> shy or locked layers are handled automatically, but layers with animated properties are skipped on purpose. Check the status line for the count.",
            "guide.troubleNothing": "<b>Nothing happens:</b> restart After Effects. If a panel file fails to load, buttons stop responding — a restart reloads them.",
            "guide.curvesPreview": "<b>Preview:</b> the thin strip under the numbers runs a dot along the current curve. Hover to play it, click to replay. Handy for judging the timing before committing it to keyframes.",
            "guide.fxTitle": "Effect presets",
            "guide.fxIntro": "<b>What it does:</b> point the panel at a folder of .ffx files and apply them to the selected layers with one click. This is your own shortlist - the full set still lives in Effects &amp; Presets.",
            "guide.fxFolders": "<b>Folders:</b> subfolders become groups, nested paths included, so Color/Warm shows up as \"Color / Warm\". Click a group heading to collapse it. The filter box searches by name across every group.",
            "guide.fxFavorites": "<b>Favorites:</b> the star next to each preset pins it to the top of the page. Favourites are stored by file path, so they survive a restart and a change of folder.",
            "guide.shortcutsTitle": "Keyboard shortcuts",
            "guide.shortcutsWhy": "The panel only receives keystrokes while it has focus - click into the timeline and shortcuts inside the panel stop responding. That is how extensions work in After Effects, not something the panel can change.",
            "guide.shortcutsHow": "<b>The way around it:</b> the scripts folder shipped with the panel contains a standalone script for every action. After Effects runs those as ordinary commands, so a shortcut assigned to one works from anywhere, timeline included.",
            "guide.shortcutsWhere": "<b>Installing them:</b> Settings &gt; Shortcut scripts &gt; Install into After Effects does it for you, for every version of After Effects you have, and needs no administrator rights. Restart After Effects afterwards - the Scripts folder is only read at startup - then assign keys in Edit &gt; Keyboard Shortcuts under Application &gt; File &gt; Scripts. Nothing is pre-assigned, so nothing collides with the defaults you already use. Updates keep the scripts current from then on. Copying them by hand still works too; scripts/README.txt has the folder paths.",
            "guide.updatesTitle": "Updates",
            "guide.updatesHow": "The panel checks GitHub for a new version once a day, a few seconds after it opens. It says nothing when there is nothing to say. Settings &gt; Updates &gt; Check for updates asks straight away and reports every outcome, including that you are already up to date.",
            "guide.updatesIndicator": "<b>How you know:</b> a waiting update shows in three places at once - the version at the foot of the sidebar turns into the new number in blue, a dot appears on the Settings tab, and Settings names the version with a button to install it. That stays visible across restarts and works offline, so the panel can always answer whether an update is waiting.",
            "guide.updatesChoices": "<b>Install</b> downloads it, backs up the current version and writes the new one, then asks you to restart After Effects - the panel loads its ExtendScript when it opens, so the new code starts working after a restart. <b>Later</b> silences the dialog for a day but leaves the indicators showing. <b>Skip this version</b> turns them off for that version only; a newer one still gets through.",
            "guide.updatesKept": "Nothing you own is touched. Presets and libraries, the last curve in the editor, saved colours, the effect presets folder and its favourites, the language and the remembered fields all live outside the panel folder and come through an update unchanged. The previous version is kept as a backup in case you need it.",
            "guide.troubleUpdate": "<b>No update is offered:</b> automatic checking may be off in Settings, the last check may have been under a day ago, or the version may have been postponed or skipped. Check for updates ignores all three and always reports what it found.",
            "guide.tipReset": "<b>Reset:</b> the button at the bottom of the preset library returns the whole panel to its original state - every curve library, the effect preset folder with its favourites, and the editor size. It cannot be undone.",
            "guide.support": "SUPPORT",
            "ae.flipApplied": "Flip {0} applied to {1} layers",
            "ae.compSwitchSet": "Composition {0} {1}",
            "curves.previewHint": "Click to preview the easing",
            "nav.presets": "Presets",
            "fx.title": "Effect presets",
            "fx.about": "Pick a folder of .ffx presets and apply them to the selected layers with one click. Subfolders become groups. This is your own shortlist - the full set still lives in Effects & Presets.",
            "fx.chooseFolder": "Choose folder",
            "fx.refresh": "Refresh",
            "fx.parseError": "The preset list could not be read",
            "fx.filter": "filter presets",
            "fx.favorites": "Favorites",
            "fx.all": "All presets",
            "fx.star": "Add to favorites",
            "fx.unstar": "Remove from favorites",
            "fx.loaded": "{0} presets found",
            "fx.emptyFolder": "No .ffx files in this folder.",
            "fx.noMatch": "Nothing matches the filter.",
            "ae.presetNoFolder": "No preset folder chosen",
            "ae.presetFolderMissing": "The preset folder no longer exists",
            "ae.presetMissing": "Preset file not found",
            "ae.presetFailed": "The preset could not be applied",
            "ae.presetApplied": "Preset applied to {0} layers",
            "tip.anchorTL": "Top left",
            "tip.anchorTC": "Top center",
            "tip.anchorTR": "Top right",
            "tip.anchorML": "Middle left",
            "tip.anchorMC": "Center",
            "tip.anchorMR": "Middle right",
            "tip.anchorBL": "Bottom left",
            "tip.anchorBC": "Bottom center",
            "tip.anchorBR": "Bottom right",
            "tip.alignLeft": "Align left",
            "tip.alignCH": "Center horizontally",
            "tip.alignRight": "Align right",
            "tip.alignTop": "Align top",
            "tip.alignCV": "Center vertically",
            "tip.alignBottom": "Align bottom",
            "tip.alignCenter": "Center on both axes",
            "tip.distL": "Distribute by left edges",
            "tip.distCH": "Distribute by horizontal centers",
            "tip.distR": "Distribute by right edges",
            "tip.distT": "Distribute by top edges",
            "tip.distCV": "Distribute by vertical centers",
            "tip.distB": "Distribute by bottom edges",
            "tip.libNew": "New library",
            "tip.libRename": "Rename library",
            "tip.libDelete": "Delete library",
            "tip.savePreset": "Save the current curve",
            "tip.import": "Import a .flow file",
            "tip.export": "Export the active library to .flow",
            "tip.pickColor": "Choose a colour",
            "tip.resizeEditor": "Drag to resize (double-click resets)",
            "lib.deletePreset": "Delete preset",
            "msg.presetProtected": "Built-in presets cannot be deleted",
            "tip.precompMove": "Pre-comp trimmed to the layer, effects moved inside",
            "tip.precompLeave": "Pre-comp trimmed to the layer, effects stay outside",
            "tip.fit": "Scale the layer to fit inside the composition",
            "tip.fill": "Scale the layer to cover the composition",
            "tip.flipX": "Mirror horizontally",
            "tip.flipY": "Mirror vertically",
            "tip.centerAnchor": "Anchor to the layer centre, layer stays put",
            "tip.centerComp": "Move the layer to the centre of the composition",
            "tip.purge": "Clear all After Effects caches",
            "tip.organize": "Sort every project item into folders by type",
            "tip.readCurve": "Load the easing from the selected keyframes",
            "tip.applyCurve": "Apply this curve to the selected keyframes",
            "tip.fxFolder": "Choose a folder containing .ffx presets",
            "tip.fxRefresh": "Rescan the folder",
            "tip.resetPanel": "Return the whole panel to its original state",
            "tip.copyHex": "Copy the hex value",
            "msg.hexCopied": "Copied {0}",
            "msg.hexCopyFailed": "The value could not be copied",
            "msg.colorPicked": "Colour set to {0}",
            "cp.eyedropper": "Pick a colour from the screen",
            "cp.ok": "OK",
            "cp.cancel": "Cancel",
            "status.ready": "Ready",
            "status.noComp": "No active composition",
            "status.noSelection": "No layers selected",
            "status.colorsReset": "Colors restored",
            "status.presetsReset": "Presets restored",
            "status.presetSaved": "Preset saved",
            "status.presetDeleted": "Preset deleted",
            "status.enterName": "Enter a name",
            "status.invalidValue": "Invalid value",
            "status.scriptError": "ExtendScript error",
            "status.done": "Done",

            // --- Messages returned by ExtendScript ---
            "ae.unknownLayerType": "Unknown layer type",
            "ae.noLayerSelected": "No layer selected",
            "ae.transformCopiedMsg": "Transform copied",
            "ae.nothingCopied": "Nothing copied",
            "ae.transformPastedTo": "Transform pasted to {0} layers",
            "ae.min2Keys": "Select at least 2 keyframes",
            "ae.min2KeysOrNext": "Select at least 2 keyframes (or a keyframe with one after it)",
            "ae.appliedTo": "Applied to {0} transitions",
            "ae.nullsCreated": "Created {0} nulls (one per layer)",
            "ae.nullCentered": "Null at center",
            "ae.enterBaseName": "Enter a base name",
            "ae.renamedWithSource": "Renamed {0} layers ({1} incl. source)",
            "ae.precompsCreated": "Created {0} pre-comps ({1})",
            "ae.cannotOpenFile": "Cannot open file",
            "ae.invalidFpsAE": "Invalid frame rate",
            "ae.noDimensions": "Layers have no dimensions",
            "ae.allCachesPurged": "All caches purged",
            "ae.imageCachePurged": "Image cache purged",
            "ae.undoCachePurged": "Undo cache purged",
            "ae.snapshotCachePurged": "Snapshot cache purged",
            "ae.unknownCacheType": "Unknown cache type",
            "ae.solidAdded": "Solid added",
            "ae.noSolidSelected": "No solid selected",
            "ae.colorChanged": "Color changed on {0} solids",
            "ae.noCompFound": "Open or select a composition (none found)",
            "ae.unknownSwitch": "Unknown switch",
            "ae.easeCopied": "Ease copied",
            "ae.copyEaseFirst": "Copy an ease first",
            "ae.selectTargetKeys": "Select target keyframes",
            "ae.easePastedTo": "Ease pasted to {0} keyframes",
            "ae.pasteCmdNotFound": "Paste command not found",
            "ae.pastedFromClipboard": "Pasted from clipboard",
            "ae.selectedNoDimensions": "Selected layers have no dimensions",
            "ae.unknownAlignMode": "Unknown align mode",
            "ae.alignedCount": "Aligned {0} layers",
            "ae.distributeNeeds3": "Distribute needs at least 3 layers",
            "ae.distributedCount": "Distributed {0} layers",
            "ae.projectEmpty": "Project is empty",
            "ae.noMotionBlur": "Selected layers do not support motion blur",
            "ae.noFrameBlending": "Selected layers do not support frame blending (footage/pre-comp only)",
            "ae.layerAddedMsg": "{0} added",
            "ae.switchAppliedTo": "Applied to {0} layers",
            "ae.switchAppliedToPre": "Applied to {0} layers (incl. pre-comps)",
            "ae.parentedCount": ", parented {0}",
            "ae.fpsSetTo": "Frame rate set to {0}",
            "ae.createdCount": "Created {0}× {1}",
            "ae.parentedSuffix": " + parented {0} layers",
            "ae.fitApplied": "{0} applied to {1} layers",
            "ae.anchorSetOn": "Anchor set on {0} layers",
            "ae.switchOn": "on",
            "ae.switchOff": "off",
            "ae.motionBlurName": "Motion blur",
            "ae.frameBlendPixelName": "Frame blending (Pixel Motion)",
            "ae.frameBlendMixName": "Frame blending (Frame Mix)",
            "ae.switchResult": "{0} {1} on {2} layers (incl. pre-comps)",
            "ae.pickFlowFile": "Choose a .flow file",
            "ae.saveAsFlow": "Save as .flow",
            "ae.flowFilter": "Flow presets:*.flow;*.json,All:*.*",
            "ae.flowFilterSave": "Flow presets:*.flow",
            "ae.noComp": "No active composition",
            "ae.noSelection": "Select at least one layer",
            "ae.noSelection2": "Select at least two layers",
            "ae.noSelection3": "Select at least three layers",
            "ae.invalidResolution": "Invalid resolution",
            "ae.invalidFps": "Invalid frame rate",
            "ae.tooShort": "Composition cannot be shorter than one frame",
            "ae.resolutionSet": "{0}×{1} set",
            "ae.centered": ", centered {0}",
            "ae.scaled": ", scaled {0}",
            "ae.skipped": " ({0} animated skipped)",
            "ae.durationSet": "Duration: {0}s ({1}s)",
            "ae.fpsSet": "Frame rate: {0}",
            "ae.layerAdded": "Layer added: {0}",
            "ae.layersRenamed": "Renamed {0} layers",
            "ae.precompCreated": "Created {0} pre-comps",
            "ae.anchorCentered": "Anchor centered on {0} layers",
            "ae.centeredInComp": "Centered {0} layers",
            "ae.flipped": "Flipped {0} layers",
            "ae.scaledToComp": "Scaled {0} layers",
            "ae.aligned": "Aligned {0} layers",
            "ae.distributed": "Distributed {0} layers",
            "ae.easingApplied": "Easing applied to {0} keyframes",
            "ae.switchSet": "Switch set on {0} layers",
            "ae.cachePurged": "Cache purged",
            "ae.nullCreated": "Null created",
            "ae.transformCopied": "Transform copied",
            "ae.transformPasted": "Transform pasted",
            "ae.sorted": "Sorted {0} items",
            "ae.orgComps": "Comps: {0}",
            "ae.orgPrecomps": "Pre-comps: {0}",
            "ae.orgFootage": "Footage: {0}",
            "ae.orgAudio": "Audio: {0}",
            "ae.orgSolids": "Solids: {0}",
            "ae.orgAssets": "Assets: {0}",
            "ae.orgEmptyRemoved": "Empty folders removed: {0}",
            "ae.cannotMove": "Cannot move: {0}",

            // --- Guide ---,
            "guide.curvesRamps": "<b>Speed ramps:</b> the presets from slowMid down to hitOut are meant for Time Remapping. Enable it on a layer (Layer &gt; Time &gt; Enable Time Remapping), select both keyframes and hit Apply. Read the curve as a speed profile: its slope is the playback rate, so a flat middle is slow motion and steep ends are the fast parts either side of it. Nothing here overshoots, because on Time Remap that would mean reading past the end of the footage.",
            "guide.curvesMatched": "<b>Where you are:</b> whichever preset the editor is currently sitting on lights up in the library, whether you clicked it, typed the values or dragged the handles onto it. The match is exact, and the editor works in hundredths - the same precision the four fields show - so the number in the field is the number being stored. The curve you leave on is remembered and comes back when you reopen the panel.",
            "guide.mainColor": "<b>Colour:</b> the swatch next to Solid opens a picker with a hex field, recent colours and an eyedropper. The eyedropper samples anywhere on screen, not just inside the panel - on Windows a helper waits for your next click, so give it a moment until the button starts pulsing before clicking; on macOS it opens the system colour panel, whose magnifier does the same job. The colour is also used by the coloured-solid shortcut script.",
            "guide.troubleSize": "<b>The panel opens at an odd width:</b> once a panel has been docked, After Effects remembers its size in the workspace and ignores what the extension asks for. There is no way around this from inside the extension. Size it how you want, then Window &gt; Workspace &gt; Save Changes to This Workspace, and quit After Effects through File &gt; Exit so the preferences are written. Switching back to that workspace later restores the layout. The panel itself is built to work at any width, down to a narrow dock.",
            "main.transformValues": "Transform values",
            "main.tfAnchor": "Anchor",
            "main.tfPosition": "Position",
            "main.tfScale": "Scale",
            "main.tfRotation": "Rotation",
            "main.tfOpacity": "Opacity",
            "main.transformAbout": "Drag a value sideways to scrub it, or click it to type. Shift coarsens the drag, Ctrl refines it. The rows follow the selection on their own, and only the value you change is written, so the rest of the layer is left alone even with several layers selected. The chain keeps Scale proportional. A keyframed property is written the way the timeline writes it: on a keyframe it updates that one, between keyframes it drops a new one. A row driven by an expression is dimmed, since the expression decides the value. A 3D layer keeps its Z.",
            "main.shapes": "Shape layers",
            "main.shapeFill": "Fill",
            "main.shapeStroke": "Stroke",
            "main.shapeWidth": "Width",
            "main.shapesAbout": "The rows show what the selected shape group actually carries - which group is decided by what you have selected in the timeline. Pick a colour or drag a value and it goes in straight away; only what you touch is written, and a keyframed property gets a keyframe just as it would in the timeline. Rows the shape does not have are hidden: an ellipse has no roundness.",
            "msg.transformRead": "Read from '{0}'",
            "msg.nothingToApply": "Fill in at least one value",
            "ae.invalidValue": "Invalid value",
            "ae.nothingToApply": "Nothing to apply",
            "ae.noShapeSelected": "No shape layer among the selected ones",
            "ae.noShapeStyleFound": "No fill or stroke found on those layers",
            "ae.shapeStyleApplied": "Style applied to {0} shape layers",
            "ae.transformAppliedTo": "Transform applied to {0} layers",
            "ae.transformReadFail": "Could not read the transform",
            "tip.scaleLink": "Keep Scale proportional",
            "main.resetTransform": "Reset",
            "tip.resetTransform": "Reset the transform of the selected layers",
            "tip.stopwatch": "Switch animation on or off (removes every keyframe). Alt-click adds or removes an expression",
            "tip.prevKey": "Go to the previous keyframe",
            "tip.nextKey": "Go to the next keyframe",
            "ae.stopwatchOn": "Animation on for {0} layers",
            "ae.stopwatchOff": "Animation off for {0} layers",
            "ae.noKeysOnProp": "That property has no keyframes",
            "ae.noMoreKeys": "No keyframe that way",
            "ae.jumpedToKey": "Moved to the keyframe",
            "ae.transformReset": "Transform reset on {0} layers",
            "tip.keyHere": "Add or remove a keyframe at the current time",
            "ae.notAnimated": "Switch the stopwatch on first",
            "ae.keyAdded": "Keyframe added on {0} layers",
            "ae.keyRemoved": "Keyframe removed from {0} layers",
            "sh.size": "Size",
            "sh.roundness": "Roundness",
            "sh.fillColor": "Fill",
            "sh.strokeColor": "Stroke",
            "sh.strokeWidth": "Stroke width",
            "sh.lineCap": "Line cap",
            "sh.lineJoin": "Line join",
            "sh.anchor": "Anchor Point",
            "sh.position": "Position",
            "sh.scale": "Scale",
            "sh.skew": "Skew",
            "sh.skewAxis": "Skew Axis",
            "sh.rotation": "Rotation",
            "sh.opacity": "Opacity",
            "main.shapeProps": "Shape properties",
            "main.shapeTransform": "Shape transform",
            "ae.rowNotOnShape": "This shape has no such property",
            "ae.propAnimated": "That property is animated and cannot be set from here",
            "ae.shapePropSet": "Shape property set",
            "ae.shapeReset": "Reset {0} properties",
            "ae.propExpression": "That property is driven by an expression",
            "ae.exprAdded": "Expression added on {0} layers",
            "ae.exprRemoved": "Expression removed from {0} layers",
            "guide.rowModifiers": "<b>Modifier keys on the rows:</b> Shift while dragging a value coarsens the step tenfold, Ctrl refines it. Alt-clicking a stopwatch adds or removes an expression instead of switching animation - the same reflex as in the timeline. It hands the job to After Effects itself, through Animation &gt; Add Expression, so the expression row opens ready for typing and the text is the property's own reference, exactly as an Alt-click in the timeline would leave it.",
            "sh.tNone": "None",
            "sh.tSolid": "Solid Color",
            "sh.tLinear": "Linear Gradient",
            "sh.tRadial": "Radial Gradient",
            "sh.toggleOn": "Switch this fill or stroke on or off",
            "sh.gradStart": "Gradient start",
            "sh.gradEnd": "Gradient end",
            "ae.gradientOpened": "Gradient selected - use the editor After Effects opened",
            "ae.shapeTypeFailed": "After Effects would not change the fill type"
        },

        /* ============================ DEUTSCH ============================ */
        /* ============================ ESPANOL ============================ */
        /* ============================ POLSKI ============================ */
        /* ============================ FRANCAIS ============================ */
        /* ============================ ITALIANO ============================ */
        /* ============================ PORTUGUES ============================ */
        /* ============================ RUSSKIJ ============================ */
        /* ============================ HINDI ============================ */
        /* ============================ NIHONGO ============================ */
        /* ============================ HANGUGEO ============================ */
        /* ============================ ZHONGWEN ============================ */
        /* ============================= CZECH ============================= */
    };

    // Language list for the Settings switcher
    var LANGUAGES = [
        { code: "en", name: "English" },
        { code: "cs", name: "Čeština" },
        { code: "de", name: "Deutsch" },
        { code: "es", name: "Español" },
        { code: "pl", name: "Polski" },
        { code: "fr", name: "Français" },
        { code: "it", name: "Italiano" },
        { code: "pt", name: "Português" },
        { code: "ru", name: "Русский" },
        { code: "hi", name: "हिन्दी" },
        { code: "ja", name: "日本語" },
        { code: "ko", name: "한국어" },
        { code: "zh", name: "中文" }
    ];

    var current = "en";

    /* Loads the saved language, otherwise tries the system one, otherwise English. */
    function init() {
        var saved = null;
        try { saved = window.localStorage.getItem("fp_lang"); } catch (e) {}

        /*
         * Checked against the list, not against DICT: at this point only the
         * pack the bootstrap loaded is present, and asking DICT would send a
         * perfectly good saved language back to English.
         */
        if (saved && known(saved)) {
            current = saved;
        } else {
            var sys = (navigator.language || "en").substring(0, 2).toLowerCase();
            current = known(sys) ? sys : "en";
        }
        return current;
    }

    /* Translates a key. Extra arguments replace {0}, {1}, ... */
    function t(key) {
        var pack = DICT[current] || DICT.en;
        var s = pack[key];
        if (s === undefined) s = DICT.en[key];
        if (s === undefined) return key;

        for (var i = 1; i < arguments.length; i++) {
            s = s.replace("{" + (i - 1) + "}", String(arguments[i]));
        }
        return s;
    }

    /* Switches the language and stores the choice. */
    /* Is this a language the panel ships at all? */
    function known(code) {
        for (var i = 0; i < LANGUAGES.length; i++) {
            if (LANGUAGES[i].code === code) return true;
        }
        return false;
    }

    /* Called by each lang/<code>.js as it loads. */
    function addPack(code, table) {
        if (code && table) DICT[code] = table;
    }

    /*
     * Fetches a pack that is not in memory yet.
     *
     * English is compiled in and every pack is loaded at most once, so this
     * usually does nothing at all. A pack that fails to arrive is not fatal:
     * t() already falls through to English key by key, so the panel stays
     * readable rather than filling up with raw key names.
     */
    function loadPack(code, cb) {
        if (code === "en" || DICT[code]) { cb(true); return; }
        if (!known(code)) { cb(false); return; }

        var el = document.createElement("script");
        el.src = "lang/" + code + ".js";
        el.onload = function () { cb(!!DICT[code]); };
        el.onerror = function () { cb(false); };
        document.head.appendChild(el);
    }

    /*
     * Switches the language, fetching the pack first when it has to.
     *
     * The callback is optional and the return value is kept for callers that
     * only want to know the code was valid - the repaint happens either way,
     * as soon as there is something to repaint with.
     */
    function setLanguage(code, cb) {
        if (!known(code)) { if (cb) cb(false); return false; }

        loadPack(code, function (ok) {
            if (ok) {
                current = code;
                try { window.localStorage.setItem("fp_lang", code); } catch (e) {}
                apply();
            }
            if (cb) cb(ok);
        });
        return true;
    }

    function getLanguage() { return current; }
    function getLanguages() { return LANGUAGES; }

    /*
     * Walks the DOM and translates every element carrying a data-i18n attribute:
     *   data-i18n           -> text content (or innerHTML when the text holds a tag)
     *   data-i18n-placeholder -> input placeholder
     *   data-i18n-title       -> title (tooltip)
     */
    function apply() {
        var els = document.querySelectorAll("[data-i18n]");
        for (var i = 0; i < els.length; i++) {
            var key = els[i].getAttribute("data-i18n");
            var val = t(key);
            if (val.indexOf("<") > -1) els[i].innerHTML = val;
            else els[i].textContent = val;
        }

        var ph = document.querySelectorAll("[data-i18n-placeholder]");
        for (var p = 0; p < ph.length; p++) {
            ph[p].setAttribute("placeholder", t(ph[p].getAttribute("data-i18n-placeholder")));
        }

        var ti = document.querySelectorAll("[data-i18n-title]");
        for (var k = 0; k < ti.length; k++) {
            ti[k].setAttribute("title", t(ti[k].getAttribute("data-i18n-title")));
        }
    }

    /*
     * Translates a response coming back from ExtendScript.
     * ExtendScript returns either "I18N:key|arg1|arg2" (translatable) or
     * plain text, which is passed through unchanged.
     */
    function translateResponse(res) {
        if (!res || typeof res !== "string") return res;

        var isError = false;
        var body = res;
        if (body.indexOf("ERROR:") === 0) {
            isError = true;
            body = body.substring(6);
        }

        /*
         * Composed message: several I18N chunks joined by ";;".
         * Each is translated separately and concatenated without a separator,
         * because the individual parts already carry their own punctuation.
         */
        if (body.indexOf(";;") > -1) {
            var chunks = body.split(";;");
            var out2 = "";
            for (var c = 0; c < chunks.length; c++) {
                out2 += translateOne(chunks[c]);
            }
            return isError ? "ERROR:" + out2 : out2;
        }

        var out = translateOne(body);
        return isError ? "ERROR:" + out : out;
    }

    /* Translates a single "I18N:key|arg1|arg2" chunk, or returns it unchanged. */
    function translateOne(chunk) {
        if (chunk.indexOf("I18N:") !== 0) return chunk;
        var parts = chunk.substring(5).split("|");
        var args = [parts[0]];
        /*
         * An argument may itself be an I18N key (e.g. a switch name or an
         * on/off state), so those are resolved recursively.
         */
        for (var i = 1; i < parts.length; i++) {
            var a = parts[i];
            if (a.indexOf("I18N:") === 0) a = translateOne(a);
            args.push(a);
        }
        return t.apply(null, args);
    }

    return {
        init: init,
        addPack: addPack,
        loadPack: loadPack,
        t: t,
        apply: apply,
        setLanguage: setLanguage,
        getLanguage: getLanguage,
        getLanguages: getLanguages,
        translateResponse: translateResponse
    };
})();
