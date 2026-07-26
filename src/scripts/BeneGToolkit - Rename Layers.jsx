/*
 * BeneG Toolkit - Rename Layers
 *
 * Renames every selected layer to a common base with a number - BG 1, BG 2,
 * BG 3 - numbered top to bottom as they sit in the timeline.
 *
 * Unlike the other scripts this one asks for input, since a base name cannot
 * be guessed.
 *
 * Assign a keyboard shortcut in Edit > Keyboard Shortcuts (Application >
 * File > Scripts).
 */

#include "_BeneGToolkit_Panel.jsx"

(function () {
    if (!bgtEnsureLoaded()) return;

    var base = prompt("Base name for the selected layers:", "Layer", "BeneG Toolkit");
    if (base === null) return;          // cancelled
    if (base === "") {
        alert("Enter a base name.", "BeneG Toolkit");
        return;
    }

    // Escape quotes so the value survives being embedded in the call
    var safe = base.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    bgtRun("renameSelectedLayers('" + safe + "')");
})();
