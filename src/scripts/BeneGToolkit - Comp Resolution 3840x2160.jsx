/*
 * BeneG Toolkit - Comp Resolution 3840x2160
 *
 * Sets the composition to 3840x2160 and re-centres the layers.
 *
 * Assign a keyboard shortcut in Edit > Keyboard Shortcuts (Application >
 * File > Scripts) to run this from the timeline, where the panel's own
 * shortcuts cannot reach.
 */

#include "_BeneGToolkit_Panel.jsx"

(function () {
    bgtRun("setCompResolution(3840,2160,false)");
})();
