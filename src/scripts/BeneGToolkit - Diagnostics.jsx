/*
 * BeneG Toolkit - Diagnostics
 *
 * Run this when a shortcut script misbehaves. It reports which copy of the
 * panel was found, whether it evaluated, and which functions came through -
 * enough to tell a wrong install apart from a broken load.
 */

#include "_BeneGToolkit_Panel.jsx"

(function () {
    var lines = [];

    lines.push("After Effects: " + app.version);
    lines.push("OS: " + $.os);
    lines.push("");

    var f = bgtFindPanelScript();
    if (!f) {
        lines.push("main.jsx: NOT FOUND");
        lines.push("");
        lines.push("The extension is not in either CEP extensions folder,");
        lines.push("or its folder is named something unexpected.");
        alert(lines.join("\n"), "BeneG Toolkit - Diagnostics");
        return;
    }

    lines.push("Found: " + f.fsName);
    lines.push("Size: " + f.length + " bytes");
    lines.push("");

    var loaded = bgtEnsureLoaded();
    lines.push("Loaded: " + (loaded ? "yes" : "no"));

    if (loaded) {
        var probes = ["addLayer", "addColorSolid", "alignLayers", "setAnchorTo",
                      "distributeLayers", "purgeCache", "runOrganizer",
                      "applyEasingToSelectedKeys", "renameSelectedLayers"];
        var found = 0;
        var missing = [];

        for (var i = 0; i < probes.length; i++) {
            if (typeof $.global[probes[i]] === "function") found++;
            else missing.push(probes[i]);
        }

        lines.push("Functions reachable: " + found + " of " + probes.length);
        if (missing.length) lines.push("Missing: " + missing.join(", "));
    }

    alert(lines.join("\n"), "BeneG Toolkit - Diagnostics");
})();
