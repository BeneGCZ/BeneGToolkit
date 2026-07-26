/*
 * BeneG Toolkit - Add Solid
 *
 * Adds a solid layer to the active composition.
 *
 * Assign a keyboard shortcut in Edit > Keyboard Shortcuts (Application >
 * File > Scripts) to run this from the timeline, where the panel's own
 * shortcuts cannot reach.
 */

#include "_BeneGToolkit_Panel.jsx"

(function () {
    bgtRun("addLayer('solid', false)");
})();
