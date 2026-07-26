# BeneG Toolkit — CEP panel for After Effects

An easing curve editor (Flow-style) with a preset library, layer tools,
composition settings and a one-click project organizer.

## Project structure

```
BeneGToolkit/
├── CSXS/
│   └── manifest.xml        # panel definition (ID, version, host compatibility)
├── css/
│   └── style.css           # panel styling
├── js/
│   ├── CSInterface.js      # Adobe library for panel <-> AE communication
│   ├── curveEditor.js      # interactive bezier curve editor on a canvas
│   ├── i18n.js             # translations (English, Czech)
│   ├── library.js          # preset library, .flow import/export
│   ├── tools.js            # Tools page bindings
│   ├── updater.js          # automatic updates from GitHub releases
│   └── main.js             # wires the UI to ExtendScript
├── jsx/
│   └── main.jsx            # ExtendScript — all logic that drives AE
├── scripts/                # standalone .jsx for keyboard shortcuts
├── index.html              # panel markup
├── update.json             # which GitHub repository updates come from
├── CHANGELOG.md            # release notes, read by the release workflow
├── UPDATER.md              # how to publish an update
├── .debug                  # enables DevTools during development
└── README.md
```

## Installation (Windows)

### 1. Allow unsigned panels

Without this step AE refuses to load a development panel. Open **Registry
Editor** (Win+R → `regedit`) and set the key (try CSXS 11 and 12):

```
HKEY_CURRENT_USER\Software\Adobe\CSXS.11
```

Create a **String Value** (REG_SZ):
- Name: `PlayerDebugMode`
- Value: `1`

Faster route — save as `enable.reg` and double-click:

```
Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\Software\Adobe\CSXS.11]
"PlayerDebugMode"="1"

[HKEY_CURRENT_USER\Software\Adobe\CSXS.12]
"PlayerDebugMode"="1"
```

### 2. Copy the panel into the extensions folder

Copy the whole `BeneGToolkit` folder to either:

```
C:\Users\<YourName>\AppData\Roaming\Adobe\CEP\extensions\BeneGToolkit
C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\BeneGToolkit
```

(Create the `CEP\extensions` folders if they do not exist.)

### 3. Launch it in After Effects

Restart AE and open the panel from:

```
Window → Extensions → BeneG Toolkit
```

## Features

**Curves** — drag the orange handles to shape an easing curve, or pick a
preset. Select keyframes in the timeline and press Apply. *Read from
keyframes* pulls an existing ease back into the editor. The preset library
supports multiple named libraries and imports/exports the `.flow` format,
so presets are interchangeable with the Flow plugin.

**Main** — create solids, nulls, adjustment layers and cameras; center the
anchor point or the layer; fit, fill and flip; align and distribute; batch
rename; and pre-compose each selected layer into its own trimmed comp.

**Tools** — composition resolution, frame rate and duration, motion blur
and frame blending switches, cache purging.

**Organize** — sorts every project item into folders by type in one undo step.

**Updates** — the panel checks GitHub once a day and offers any new version with
its release notes, which can be installed straight away, postponed for a day or
skipped. Presets, libraries, the last used curve and every other setting live
outside the extension folder and come through an update untouched. Publishing
one is covered in `UPDATER.md`.

## Localisation

The interface and all messages are translated through `js/i18n.js`.
English and Czech are included; the switcher lives in Settings.

To add a language, copy the `cs` block, translate the values (keep the keys)
and add an entry to the `LANGUAGES` list. Placeholders such as `{0}` are
filled in at runtime — keep them in place.

## Debugging

With `PlayerDebugMode=1` and the `.debug` file present, open
`http://localhost:8088` in a browser for Chrome DevTools.

ExtendScript errors surface in the status line at the bottom of the panel.

## Common problems

- **Panel missing from the menu:** wrong CSXS version in the registry, or the
  folder is in the wrong place. Add `PlayerDebugMode` for CSXS.12 as well.
- **Buttons do nothing:** open DevTools (localhost:8088) and check the console.
  A syntax error in any panel file stops every binding in that file.
- **"No active composition":** click into a composition in the timeline first;
  having it selected in the project panel is not enough.
- **Easing will not apply:** the keyframes must actually be selected
  (highlighted) in AE, not just the property.
