# BeneG Toolkit

A free panel for Adobe After Effects: an easing curve editor with a preset
library, plus layer, transform and composition tools that would otherwise cost
you a dozen menu clicks each.

Works with After Effects CC 2019 (16.0) and newer, on Windows and macOS.
Available in 13 languages.

---

## What it does

### Curves

Shape an easing curve by dragging its handles, or pick one from the library.
Select keyframes in the timeline and press **Apply**. *Read from keyframes*
pulls an existing ease back into the editor so you can adjust it.

Presets are stored in named libraries and use the `.flow` format, so anything
you have made for the Flow plugin imports directly — and anything you build here
exports back out.

### Main

Create solids, coloured solids, nulls, adjustment layers and cameras. Centre the
anchor point or the whole layer, fit or fill to the composition, flip on either
axis. Align and distribute selected layers. Rename layers in a batch, or
pre-compose each selected layer into its own trimmed composition.

### Tools

Composition resolution, frame rate and duration in one click. Motion blur and
frame blending switches. Cache purging.

### Organize

Sorts every item in your project into folders by type — one button, one undo
step.

### Keyboard shortcuts

After Effects only sends keystrokes to a panel while that panel has focus, which
makes panel buttons awkward to bind a key to. So the toolkit also ships every
action as a standalone script.

**Settings → Shortcut scripts → Install into After Effects** copies them into
every version of After Effects you have installed. No administrator rights
needed. Restart After Effects afterwards, then assign your keys in
**Edit → Keyboard Shortcuts**, under *Application → File → Scripts*.

Nothing is bound by default, so nothing collides with shortcuts you already use.
Updates keep the scripts current from then on.

### Updates

The panel checks GitHub once a day and tells you when a new version is out,
along with what changed. Install it straight away, postpone for a day, or skip
that version entirely.

Your presets, libraries, last used curve and all other settings live outside the
extension folder, so an update never touches them.

---

## Installing

### Step 1 — Allow unsigned panels

The toolkit is not signed with a paid Adobe certificate, so After Effects will
not load it until you flip one switch. You only ever do this once.

**Windows.** Save the following as `enable.reg` and double-click it:

```
Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\Software\Adobe\CSXS.11]
"PlayerDebugMode"="1"

[HKEY_CURRENT_USER\Software\Adobe\CSXS.12]
"PlayerDebugMode"="1"
```

**macOS.** Open Terminal and run both lines:

```bash
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
```

### Step 2 — Download

Grab the latest `BeneGToolkit-x.x.x.zip` from the
[Releases page](../../releases/latest) and unzip it. You should end up with a
folder called `BeneGToolkit`.

### Step 3 — Copy it into the extensions folder

The whole `BeneGToolkit` folder goes into one of two places. Either works —
pick whichever suits you.

**Just for you.** No administrator rights needed.

```
Windows   C:\Users\<YourName>\AppData\Roaming\Adobe\CEP\extensions\
macOS     ~/Library/Application Support/Adobe/CEP/extensions/
```

On Windows you can paste `%APPDATA%\Adobe\CEP\extensions` straight into the
Explorer address bar instead of clicking your way through a hidden folder.

**For everyone on the machine.** Windows and macOS will ask for administrator
rights when you copy the folder in.

```
Windows   C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\
macOS     /Library/Application Support/Adobe/CEP/extensions/
```

If the `CEP` or `extensions` folders are not there, create them. Either way the
path has to end up as `...\CEP\extensions\BeneGToolkit\`, with `index.html` and
the `CSXS` folder directly inside.

One thing to know about the system-wide option: the panel updates itself by
rewriting its own files, so it needs write access to wherever it sits. In a
system folder that usually stays with the account that installed it and updates
carry on working — but not on every machine, and not for other users of the same
computer. See the troubleshooting note below if you hit it.

### Step 4 — Open it

Restart After Effects, then:

```
Window → Extensions → BeneG Toolkit
```

Dock it wherever you like — After Effects remembers.

---

## If something goes wrong

**The panel is not in the Window → Extensions menu.**
Almost always step 1. Make sure you added the key for *both* CSXS.11 and
CSXS.12, and restart After Effects fully. Newer versions of After Effects may
use a higher CSXS number — if 11 and 12 do not do it, try 13 as well. Otherwise
check the folder is nested correctly: `extensions\BeneGToolkit\index.html`, not
`extensions\BeneGToolkit\BeneGToolkit\index.html`.

**An update will not install.**
If the panel reports that it cannot write to its own folder, it is installed
system-wide under an account that no longer has write access to it. Download the
new version from the [Releases page](../../releases/latest) and replace the
folder by hand — you will be asked for administrator rights, and that is all it
needs. Installing per-user instead avoids the situation for good.

**"No active composition."**
Open a composition in the timeline first. Having it selected in the Project
panel is not enough — After Effects needs it actually open.

**The easing will not apply.**
The keyframes themselves have to be selected and highlighted in the timeline,
not just the property they belong to.

**Buttons do nothing.**
Restart After Effects. If it persists, please
[open an issue](../../issues) and say which button and which version of After
Effects you are on.

---

## Languages

The whole interface — every button, tooltip, message and the built-in guide — is
translated into 13 languages:

| | | |
|---|---|---|
| English | Deutsch | Español |
| Čeština | Français | Italiano |
| Polski | Português | Русский |
| 日本語 | 한국어 | 中文 |
| हिन्दी | | |

On first launch the panel picks the language your system is set to. If that one
is not on the list, it falls back to English. You can change it any time in
**Settings → Language**, and the choice survives an After Effects restart.

---

## Licence and feedback

Free to use. Bug reports and feature requests are welcome on the
[Issues page](../../issues).
