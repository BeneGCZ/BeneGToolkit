/*
 * BeneG Toolkit - Comp Duration Plus 5s
 *
 * Extends the composition by five seconds.
 *
 * Assign a keyboard shortcut in Edit > Keyboard Shortcuts (Application >
 * File > Scripts) to run this from the timeline, where the panel's own
 * shortcuts cannot reach.
 */

#include "_BeneGToolkit_Panel.jsx"

(function () {
    bgtRun("expandCompDuration(5)");
})();
