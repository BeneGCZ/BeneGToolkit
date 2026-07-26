/*
 * BeneG Toolkit - Add Colored Solid
 *
 * Adds a solid in a colour of your choosing. The panel takes the colour from
 * its own swatch; here a colour picker is shown instead.
 *
 * Assign a keyboard shortcut in Edit > Keyboard Shortcuts (Application >
 * File > Scripts).
 */

#include "_BeneGToolkit_Panel.jsx"

(function () {
    if (!bgtEnsureLoaded()) return;

    /*
     * $.colorPicker returns a packed 0xRRGGBB integer, or -1 when cancelled.
     * Default is a mid grey rather than black, which is rarely what anyone
     * actually wants.
     */
    var picked = $.colorPicker(0x808080);
    if (picked === -1) return;

    var r = (picked >> 16) & 0xFF;
    var g = (picked >> 8) & 0xFF;
    var b = picked & 0xFF;

    bgtRun("addColorSolid(" + r + "," + g + "," + b + ",'Solid',false)");
})();
