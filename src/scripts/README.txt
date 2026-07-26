BeneG Toolkit - keyboard shortcut scripts
=========================================

WHY THESE EXIST

The panel is a CEP extension, and CEP only receives keystrokes while the panel
has focus. Click into the timeline and panel shortcuts stop responding - that
is a limitation of the extension system, not a bug.

These standalone scripts work around it. After Effects runs them as ordinary
script commands, so a shortcut assigned to one of them fires from anywhere,
including the timeline.

They do not duplicate the panel's logic - each one loads the panel's own code
and calls the same function the button would, so behaviour stays identical.


INSTALLATION

1. Install the files. The panel does this for you:

     Settings > Shortcut scripts > Install into After Effects

   It copies the current set into every version of After Effects you have,
   creates the Scripts folder when it does not exist yet, and needs no
   administrator rights. From then on updates keep the scripts current,
   including ones added in a later release.

   To do it by hand instead, copy every .jsx file in this folder, including
   _BeneGToolkit_Panel.jsx, into the After Effects Scripts folder:

     Per-user (no admin rights needed, recommended):
       Windows:  %APPDATA%\Adobe\After Effects\<version>\Scripts
       macOS:    ~/Library/Preferences/Adobe/After Effects/<version>/Scripts

     System-wide:
       Windows:  C:\Program Files\Adobe\Adobe After Effects <version>\Support Files\Scripts
       macOS:    /Applications/Adobe After Effects <version>/Scripts

   Use one or the other, not both. A set in the system-wide folder appears in
   the Scripts menu alongside the per-user one the panel manages, and the
   duplicates are indistinguishable there.

2. Restart After Effects. The Scripts folder is only scanned at startup.

3. Check File > Scripts - every script should be listed there by name.
   If they are missing, the files are in the wrong folder.

4. Edit > Keyboard Shortcuts. In the left-hand list choose "Application",
   expand the "File" group, then "Scripts". Every installed script appears
   there by filename.

   Searching alone will not find them: the search box matches menu commands,
   and scripts only surface once that group is expanded.

5. Click the shortcut column next to a script and press your key combination.

   Nothing is pre-assigned on purpose - After Effects has hundreds of default
   shortcuts and any choice made here would likely collide with one you use.

THE SCRIPTS

Curves
  Apply Last Curve          Applies the curve currently loaded in the panel to
                            the selected keyframes.

Layers
  Add Solid                 Adds a solid.
  Add Colored Solid         Adds a solid, asking for a colour first.
  Add Null                  Adds a null object.
  Add Null and Parent       Adds a null and parents the selection to it.
  Add Adjustment Layer      Adds an adjustment layer.
  Add Camera                Adds a camera.
  Rename Layers             Renames the selection to a numbered base name,
                            asking for the name first.

Transform
  Center Anchor Point       Anchor to the layer centre, layer stays put.
  Center In Comp            Centres the layers in the composition.
  Fit To Comp               Scales layers to fit inside the composition.
  Fill To Comp              Scales layers to cover the composition.
  Flip X / Flip Y           Mirrors layers, keyframed scale included.

Anchor point (nine positions)
  Anchor Top Left / Top Center / Top Right
  Anchor Middle Left / Middle Center / Middle Right
  Anchor Bottom Left / Bottom Center / Bottom Right

Align
  Align Left / Center H / Right
  Align Top / Center V / Bottom
  Align Center              Both axes at once.

Distribute (three or more layers)
  Distribute Left Edges / Centers H / Right Edges
  Distribute Top Edges / Centers V / Bottom Edges

Pre-compose
  Precompose Move All       Each layer into its own pre-comp, trimmed to the
                            layer duration, effects moved inside.
  Precompose Leave All      Same, but effects and transforms stay outside.

Composition
  Comp Resolution 1920x1080 / 3840x2160 / 1080x1080 / 1080x1920
  Comp FPS 23.976 / 24 / 25 / 30 / 60
  Comp Duration Plus 1s / Plus 5s
  Comp Duration Minus 1s / Minus 5s

Switches
  Motion Blur On / Off
  Frame Blending On / Off

Project
  Purge Cache               Clears all After Effects caches.
  Organize Project          Sorts every project item into folders by type.


NOTES

Apply Last Curve reads settings.json, the same file the panel writes to, so the
panel has to have been opened at least once for a curve to exist.

The scripts locate the panel automatically in both the per-user and the
system-wide CEP extensions folder, so the extension has to be installed for
them to work.

Every script is a single undo step - one Ctrl+Z reverts it completely.

Successful actions stay silent; only errors interrupt with a dialog. The two
scripts that need input - Rename Layers and Add Colored Solid - are the
exception, since a name or colour cannot be guessed.

Resolution scripts re-centre the layers but do not scale them, matching the
panel's default. Use the panel itself when scaling is wanted.
