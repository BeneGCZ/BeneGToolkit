/*
 * BeneG Toolkit - Distribute Top Edges
 *
 * Spaces the selected layers evenly by their top edges. Needs at least three layers.
 *
 * Assign a keyboard shortcut in Edit > Keyboard Shortcuts (Application >
 * File > Scripts) to run this from the timeline, where the panel's own
 * shortcuts cannot reach.
 */

#include "_BeneGToolkit_Panel.jsx"

(function () {
    bgtRun("distributeLayers('vTop')");
})();
