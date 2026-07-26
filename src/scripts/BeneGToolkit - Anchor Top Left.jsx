/*
 * BeneG Toolkit - Anchor Top Left
 *
 * Moves the anchor point to the top left of each selected layer, adjusting position so the layer stays put.
 *
 * Assign a keyboard shortcut in Edit > Keyboard Shortcuts (Application >
 * File > Scripts) to run this from the timeline, where the panel's own
 * shortcuts cannot reach.
 */

#include "_BeneGToolkit_Panel.jsx"

(function () {
    bgtRun("setAnchorTo('tl')");
})();
