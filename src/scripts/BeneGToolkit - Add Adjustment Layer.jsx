/*
 * BeneG Toolkit - Add Adjustment Layer
 *
 * Adds an adjustment layer.
 *
 * Assign a keyboard shortcut in Edit > Keyboard Shortcuts (Application >
 * File > Scripts) to run this from the timeline, where the panel's own
 * shortcuts cannot reach.
 */

#include "_BeneGToolkit_Panel.jsx"

(function () {
    bgtRun("addLayer('adjustment', false)");
})();
