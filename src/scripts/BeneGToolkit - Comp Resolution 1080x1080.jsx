/*
 * BeneG Toolkit - Comp Resolution 1080x1080
 *
 * Sets the composition to 1080x1080 and re-centres the layers.
 *
 * Assign a keyboard shortcut in Edit > Keyboard Shortcuts (Application >
 * File > Scripts) to run this from the timeline, where the panel's own
 * shortcuts cannot reach.
 */

#include "_BeneGToolkit_Panel.jsx"

(function () {
    bgtRun("setCompResolution(1080,1080,false)");
})();
