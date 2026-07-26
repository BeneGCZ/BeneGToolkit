/*
 * BeneG Toolkit - Apply Last Curve
 *
 * Applies the easing curve currently loaded in the panel to the selected
 * keyframes. Shape a curve in the panel, then trigger this from the timeline.
 *
 * Assign a keyboard shortcut in Edit > Keyboard Shortcuts (Application >
 * File > Scripts).
 */

#include "_BeneGToolkit_Panel.jsx"

(function () {
    if (!bgtEnsureLoaded()) return;

    /*
     * The curve lives in settings.json, written by the panel whenever the
     * curve changes.
     */
    function loadCurve() {
        var paths = [];
        try {
            if ($.os.indexOf("Windows") !== -1) {
                var appData = Folder.userData.fsName;
                paths.push(appData + "/BeneGToolkit/settings.json");
            } else {
                var home = Folder("~").fsName;
                paths.push(home + "/Library/Application Support/BeneGToolkit/settings.json");
            }
        } catch (e) {}

        for (var i = 0; i < paths.length; i++) {
            var f = new File(paths[i]);
            if (!f.exists) continue;
            try {
                f.open("r");
                var txt = f.read();
                f.close();
                var data = eval("(" + txt + ")");   // ES3 has no JSON.parse
                if (data && data.lastCurve && data.lastCurve.length === 4) {
                    return data.lastCurve;
                }
            } catch (e) {}
        }
        return null;
    }

    var c = loadCurve();
    if (!c) {
        alert("No saved curve found.\n\n" +
              "Open the panel, shape a curve, then try again.",
              "BeneG Toolkit");
        return;
    }

    // Same function the panel's Apply button calls
    var res = applyEasingToSelectedKeys(c[0], c[1], c[2], c[3]);

    if (res && String(res).indexOf("ERROR:") === 0) {
        alert(bgtReadable(String(res).substring(6)), "BeneG Toolkit");
    }
})();
