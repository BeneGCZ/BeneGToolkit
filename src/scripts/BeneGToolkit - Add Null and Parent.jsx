/*
 * BeneG Toolkit - Add Null and Parent
 *
 * Adds a null and parents the selected layers to it.
 *
 * Assign a keyboard shortcut in Edit > Keyboard Shortcuts (Application >
 * File > Scripts) to run this from the timeline, where the panel's own
 * shortcuts cannot reach.
 */

#include "_BeneGToolkit_Panel.jsx"

(function () {
    bgtRun("addLayer('null', true)");
})();
