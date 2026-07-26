/*
 * BeneG Toolkit - Precompose Leave All
 *
 * Same, but effects, masks and transforms stay outside on the pre-comp layer.
 *
 * Assign a keyboard shortcut in Edit > Keyboard Shortcuts (Application >
 * File > Scripts) to run this from the timeline, where the panel's own
 * shortcuts cannot reach.
 */

#include "_BeneGToolkit_Panel.jsx"

(function () {
    bgtRun("precompSelected('', false)");
})();
