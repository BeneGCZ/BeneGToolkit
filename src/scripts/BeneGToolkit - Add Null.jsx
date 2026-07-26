/*
 * BeneG Toolkit - Add Null
 *
 * Adds a null object.
 *
 * Assign a keyboard shortcut in Edit > Keyboard Shortcuts (Application >
 * File > Scripts) to run this from the timeline, where the panel's own
 * shortcuts cannot reach.
 */

#include "_BeneGToolkit_Panel.jsx"

(function () {
    bgtRun("addLayer('null', false)");
})();
