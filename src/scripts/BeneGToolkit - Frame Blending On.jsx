/*
 * BeneG Toolkit - Frame Blending On
 *
 * Enables pixel-motion frame blending on the selected layers.
 *
 * Assign a keyboard shortcut in Edit > Keyboard Shortcuts (Application >
 * File > Scripts) to run this from the timeline, where the panel's own
 * shortcuts cannot reach.
 */

#include "_BeneGToolkit_Panel.jsx"

(function () {
    bgtRun("setLayerSwitch('frameBlendPixel',true)");
})();
