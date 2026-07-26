/*
 * BeneG Toolkit - Precompose Move All
 *
 * Puts each selected layer into its own pre-comp trimmed to the layer duration, moving effects and transforms inside.
 *
 * Assign a keyboard shortcut in Edit > Keyboard Shortcuts (Application >
 * File > Scripts) to run this from the timeline, where the panel's own
 * shortcuts cannot reach.
 */

#include "_BeneGToolkit_Panel.jsx"

(function () {
    bgtRun("precompSelected('', true)");
})();
