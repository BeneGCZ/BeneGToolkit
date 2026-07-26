/*
 * main.js - core panel logic: navigation, curve editor, preset library
 * and calls into After Effects.
 */

var cs = new CSInterface();

// Initialize the language first, so every message is already translated
I18N.init();
I18N.apply();

var editor = new CurveEditor("curveCanvas");

// --- Calling into ExtendScript ---
function callAE(script, okMsg) {
    cs.evalScript(script, function (res) {
        // ExtendScript returns "I18N:key|arg" keys - translate them here
        res = I18N.translateResponse(res);
        if (res && res.indexOf("ERROR:") === 0) {
            setStatus(res.replace("ERROR:", ""), true);
        } else {
            setStatus(okMsg || res || I18N.t("status.done"));
        }
    });
}

function setStatus(msg, isError) {
    var el = document.getElementById("status");
    el.textContent = msg;
    el.className = isError ? "status error" : "status";
}

// ====== NAVIGACE SIDEBARU ======
var navBtns = document.querySelectorAll(".nav-btn");
for (var n = 0; n < navBtns.length; n++) {
    navBtns[n].addEventListener("click", function () {
        var page = this.getAttribute("data-page");
        for (var i = 0; i < navBtns.length; i++) navBtns[i].classList.remove("active");
        this.classList.add("active");
        var pages = document.querySelectorAll(".page");
        for (var j = 0; j < pages.length; j++) pages[j].classList.remove("active");
        document.getElementById("page-" + page).classList.add("active");

        /*
         * The canvas only gets real dimensions once its page becomes visible,
         * visible. After switching to Curves we recalculate and redraw,
         * otherwise it would stay blank (a broken image).
         */
        if (page === "curves" && typeof editor !== "undefined" && editor) {
            window.setTimeout(function () {
                try {
                    editor._setupHiDPI();
                    editor.draw();
                } catch (e) {}
            }, 20);
        }
    });
}

/*
 * Formats a bezier value for its field.
 *
 * A handle nudged a fraction below zero leaves something like -0.0001 behind,
 * which toFixed rounds to the string "-0.00". The number is right and the
 * preset matching, which works to thousandths, is unaffected - but a field
 * reading "-0.00" looks like a bug to anyone using the panel.
 */
function fmtBez(n) {
    var s = Number(n).toFixed(2);
    return (s === "-0.00") ? "0.00" : s;
}

// ====== CURVE EDITOR ======
editor.onChange = function (v) {
    // Update the bezier fields only while the user is not typing into them
    if (!bezierEditing) {
        document.getElementById("bez0").value = fmtBez(v.x1);
        document.getElementById("bez1").value = fmtBez(v.y1);
        document.getElementById("bez2").value = fmtBez(v.x2);
        document.getElementById("bez3").value = fmtBez(v.y2);
    }
    var shape = document.getElementById("shapeDisplay");
    if (shape) shape.textContent = v.shape || "";

    highlightMatchingPresets(v);

    rememberCurve(v);
};

/*
 * Remember the current curve so the panel opens where the user left off.
 *
 * Writing on every change would hit the disk continuously while dragging a
 * handle, so the save is deferred until half a second after the last change.
 */
var curveSaveTimer = null;
var pendingCurve = null;

function rememberCurve(v) {
    pendingCurve = [v.x1, v.y1, v.x2, v.y2];
    if (curveSaveTimer) window.clearTimeout(curveSaveTimer);
    curveSaveTimer = window.setTimeout(flushCurveSave, 500);
}

/*
 * Writes the pending curve out now instead of waiting for the timer.
 *
 * The deferral above is what made the panel forget which preset was in use:
 * click a card, close the panel within half a second, and the timeout dies
 * with the page before it ever writes. Anything that is a deliberate choice -
 * picking a preset - flushes straight away, and closing the panel flushes
 * whatever is still outstanding.
 */
function flushCurveSave() {
    if (curveSaveTimer) {
        window.clearTimeout(curveSaveTimer);
        curveSaveTimer = null;
    }
    if (!pendingCurve) return;

    try {
        PresetLibrary.saveSetting("lastCurve", pendingCurve);
    } catch (e) {}
    pendingCurve = null;
}

// Closing the panel tears the page down, so save on the way out
window.addEventListener("beforeunload", flushCurveSave);
window.addEventListener("unload", flushCurveSave);

// Right click on the graph opens the context menu
var curveMenu = document.getElementById("curveMenu");
document.getElementById("curveCanvas").addEventListener("contextmenu", function (e) {
    e.preventDefault();
    // Position the menu at the cursor
    curveMenu.style.left = e.clientX + "px";
    curveMenu.style.top = e.clientY + "px";
    curveMenu.classList.add("open");
});

// Clicking a menu item runs the action
var menuItems = curveMenu.querySelectorAll(".menu-item");
for (var mi = 0; mi < menuItems.length; mi++) {
    menuItems[mi].addEventListener("click", function () {
        var action = this.getAttribute("data-action");
        if (action === "reverse") {
            editor.reverse();
            setStatus(I18N.t("msg.curveReversed"));
        }
        curveMenu.classList.remove("open");
    });
}

// Clicking anywhere else closes the menu
document.addEventListener("click", function (e) {
    if (!curveMenu.contains(e.target)) curveMenu.classList.remove("open");
});

// Typing straight into the bezier fields
var bezierEditing = false;
var bezIds = ["bez0", "bez1", "bez2", "bez3"];
function applyBezierFromInputs() {
    var x1 = parseFloat(document.getElementById("bez0").value);
    var y1 = parseFloat(document.getElementById("bez1").value);
    var x2 = parseFloat(document.getElementById("bez2").value);
    var y2 = parseFloat(document.getElementById("bez3").value);
    // Invalid numbers are ignored, leaving the previous value in place
    if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) {
        setStatus(I18N.t("msg.invalidNumbers"), true);
        return;
    }
    editor.setBezier(x1, y1, x2, y2);
    setStatus(I18N.t("msg.curveSet"));
}
for (var bi = 0; bi < bezIds.length; bi++) {
    var el = document.getElementById(bezIds[bi]);
    el.addEventListener("focus", function () { bezierEditing = true; });
    el.addEventListener("blur", function () { bezierEditing = false; applyBezierFromInputs(); });
    el.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { this.blur(); }
    });
}

document.getElementById("applyCurve").addEventListener("click", function () {
    var v = editor.getValues();
    var script = "applyEasingToSelectedKeys(" +
        v.x1.toFixed(4) + "," + v.y1.toFixed(4) + "," +
        v.x2.toFixed(4) + "," + v.y2.toFixed(4) + ")";
    callAE(script, I18N.t("msg.easingApplied"));
});

document.getElementById("readCurve").addEventListener("click", function () {
    cs.evalScript("readEasingFromSelectedKeys()", function (res) {
        if (res && res.indexOf("ERROR:") === 0) {
            setStatus(res.replace("ERROR:", ""), true);
            return;
        }
        try {
            var data = JSON.parse(res);
            editor.setBezier(data.x1, data.y1, data.x2, data.y2);
            setStatus(I18N.t("msg.curveRead"));
        } catch (e) {
            setStatus(I18N.t("msg.curveReadFail"), true);
        }
    });
});

// ====== PRESET LIBRARY ======

/*
 * Cards paired with their curves, so a change in the editor can find which
 * tiles to light up without re-reading the grid out of the DOM.
 *
 * Declared before the init call below on purpose. init() renders the grid
 * straight away, and a "var presetCards = []" sitting further down the file
 * would run afterwards and wipe what that first render collected.
 */
var presetCards = [];

PresetLibrary.init(cs, renderLibrary);

/*
 * Restore the curve from the previous session. Done right after the library
 * initialises, since that is what resolves the settings file path.
 */
(function () {
    try {
        var last = PresetLibrary.loadSettings().lastCurve;
        if (last && last.length === 4) {
            editor.setBezier(last[0], last[1], last[2], last[3]);
        }
    } catch (e) {}

    /*
     * Light the matching card explicitly. setBezier above emits a change and
     * the grid highlights itself after rendering, but which of those two runs
     * last depends on whether the library read its file synchronously - and
     * the restored preset has to be lit either way.
     */
    highlightMatchingPresets();
})();

// ---- Library switcher ----
function refreshLibrarySelect() {
    var select = document.getElementById("librarySelect");
    if (!select) return;
    var libs = PresetLibrary.listLibraries();
    var active = PresetLibrary.getActive();
    select.innerHTML = "";
    for (var i = 0; i < libs.length; i++) {
        var o = document.createElement("option");
        o.value = libs[i];
        o.textContent = libs[i];
        if (libs[i] === active) o.selected = true;
        select.appendChild(o);
    }
}

document.getElementById("librarySelect").addEventListener("change", function () {
    PresetLibrary.switchLibrary(this.value);
    setStatus(I18N.t("msg.libSwitched", this.value));
});

document.getElementById("newLibrary").addEventListener("click", function () {
    var name = window.prompt(I18N.t("dlg.newLibName"), I18N.t("dlg.newLibDefault"));
    if (!name) return;
    if (PresetLibrary.createLibrary(name)) {
        refreshLibrarySelect();
        setStatus(I18N.t("msg.libCreated", name));
    } else {
        setStatus(I18N.t("msg.libExists"), true);
    }
});

document.getElementById("renameLibrary").addEventListener("click", function () {
    var old = PresetLibrary.getActive();
    if (old === "Default") {
        setStatus(I18N.t("msg.libNoRenameDefault"), true);
        return;
    }
    var name = window.prompt(I18N.t("dlg.renameLibName"), old);
    if (!name || name === old) return;
    if (PresetLibrary.renameLibrary(old, name)) {
        refreshLibrarySelect();
        setStatus(I18N.t("msg.libRenamed", name));
    } else {
        setStatus(I18N.t("msg.libRenameFail"), true);
    }
});

document.getElementById("deleteLibrary").addEventListener("click", function () {
    var active = PresetLibrary.getActive();
    if (active === "Default") {
        setStatus(I18N.t("msg.libNoDeleteDefault"), true);
        return;
    }
    if (!window.confirm(I18N.t("dlg.deleteLibConfirm", active))) return;
    if (PresetLibrary.deleteLibrary(active)) {
        refreshLibrarySelect();
        setStatus(I18N.t("msg.libDeleted"));
    } else {
        setStatus(I18N.t("msg.libDeleteFail"), true);
    }
});

// Populate the dropdown right after init
refreshLibrarySelect();

/*
 * The precision the curve editor works in.
 *
 * The editor quantises every value to hundredths, which is what the bezier
 * fields show, so that is the grid both sides of the comparison land on.
 * Presets imported from a .flow file can carry more decimals than that -
 * rounding them the same way compares what the panel can actually reach.
 */
function curveRound(n) {
    return Math.round(Number(n) * 100) / 100;
}

/*
 * Lights up the preset whose curve the editor is sitting on.
 *
 * This is an exact match, not a tolerance window: 0.051 does not count as
 * 0.05. What the rounding removes is representation dust, which is a real
 * problem here because not every value arrives as a literal. Read from
 * keyframes derives x and y from influence and speed, and the curve restored
 * at startup has been through the same arithmetic, so a value that displays as
 * 0.33 can be sitting in memory as 0.33000000000000007 and would fail a bare
 * === against a stored 0.33. Putting both on the thousandth grid compares the
 * numbers the panel means rather than their floating point spelling.
 *
 * Number() is applied because presets imported from a .flow file can arrive as
 * strings, and a string never equals a number.
 *
 * Several cards can light up at once. When two presets hold the same curve -
 * which the Flow defaults do, ease and quad are two pixels apart - showing
 * only one of them would be a lie about where the current values came from.
 */
function highlightMatchingPresets(v) {
    if (!v) v = editor.getValues();

    var cx1 = curveRound(v.x1), cy1 = curveRound(v.y1);
    var cx2 = curveRound(v.x2), cy2 = curveRound(v.y2);

    for (var i = 0; i < presetCards.length; i++) {
        var p = presetCards[i].value;
        var same = curveRound(p[0]) === cx1 &&
                   curveRound(p[1]) === cy1 &&
                   curveRound(p[2]) === cx2 &&
                   curveRound(p[3]) === cy2;

        if (same) presetCards[i].card.classList.add("matched");
        else presetCards[i].card.classList.remove("matched");
    }
}

function renderLibrary(presets) {
    // Refresh the dropdown after every change (switching / migration)
    refreshLibrarySelect();
    var grid = document.getElementById("presetGrid");
    grid.innerHTML = "";
    presetCards = [];
    for (var i = 0; i < presets.length; i++) {
        (function (index, preset) {
            var card = document.createElement("div");
            card.className = "preset-card";

            var cv = document.createElement("canvas");
            cv.width = 68; cv.height = 48;
            card.appendChild(cv);

            var label = document.createElement("div");
            label.className = "pname";
            label.textContent = preset.name;
            label.title = preset.name;
            card.appendChild(label);

            // Built-in presets in the Default library cannot be deleted,
            // so they simply do not get a delete control.
            var locked = PresetLibrary.isProtected(i);

            var del = null;
            if (!locked) {
                del = document.createElement("div");
                del.className = "pdel";
                del.innerHTML = "&times;";
                del.title = I18N.t("lib.deletePreset");
                card.appendChild(del);
            }

            // Clicking a card loads that curve into the editor
            card.addEventListener("click", function () {
                editor.setBezier(preset.value[0], preset.value[1], preset.value[2], preset.value[3]);
                // Deliberate choice - write it out now, so closing the panel
                // right afterwards still reopens on this preset
                flushCurveSave();
                setStatus(I18N.t("msg.presetLoaded", preset.name));
            });

            // Clicking the cross deletes it (without bubbling to the card)
            if (del) {
                del.addEventListener("click", function (e) {
                    e.stopPropagation();
                    if (PresetLibrary.remove(index)) {
                        setStatus(I18N.t("msg.presetDeleted"));
                    } else {
                        setStatus(I18N.t("msg.presetProtected"), true);
                    }
                });
            }

            grid.appendChild(card);
            presetCards.push({ card: card, value: preset.value });
            drawPresetThumbnail(cv, preset.value);
        })(i, presets[i]);
    }

    // Switching library rebuilds the grid, so the highlight has to be reapplied
    highlightMatchingPresets();
}

// Save the current curve as a preset
document.getElementById("savePreset").addEventListener("click", function () {
    var name = window.prompt(I18N.t("dlg.presetName"), I18N.t("dlg.presetNameDefault"));
    if (!name) return;
    var v = editor.getValues();
    PresetLibrary.add(name, [v.x1, v.y1, v.x2, v.y2]);
    setStatus(I18N.t("msg.presetSaved"));
});

// Import .flow - ExtendScript handles picking and reading the file (stable across versions)
document.getElementById("importFlow").addEventListener("click", function () {
    cs.evalScript("pickAndReadFlowFile()", function (res) {
        if (res === "CANCEL") { setStatus(I18N.t("msg.importCancelled")); return; }
        if (res && res.indexOf("ERROR:") === 0) {
            setStatus(res.replace("ERROR:", ""), true);
            return;
        }
        try {
            // Unwrap the {filename, content} envelope
            var wrap = JSON.parse(res);
            var result = PresetLibrary.importFlowToNewLibrary(wrap.content, wrap.filename);
            if (result) {
                refreshLibrarySelect();
                setStatus(I18N.t("msg.imported", result.count, result.library));
            } else {
                setStatus(I18N.t("msg.importFail"), true);
            }
        } catch (e) {
            setStatus(I18N.t("msg.importBadResponse"), true);
        }
    });
});

// Export .flow - the library builds the contents, ExtendScript handles the dialog and writing
document.getElementById("exportFlow").addEventListener("click", function () {
    var content = PresetLibrary.exportFlowContent();
    // Escape it so it can be passed as a string argument to evalScript
    var escaped = content.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "");
    cs.evalScript("pickAndWriteFlowFile('" + escaped + "')", function (res) {
        if (res === "CANCEL") { setStatus(I18N.t("msg.exportCancelled")); return; }
        if (res && res.indexOf("ERROR:") === 0) setStatus(res.replace("ERROR:", ""), true);
        else setStatus(I18N.t("msg.exported"));
    });
});

// Library reset
var resetBtn = document.getElementById("resetLibrary");
if (resetBtn) {
    resetBtn.addEventListener("click", function () {
        if (window.confirm(I18N.t("dlg.restoreDefaultsConfirm"))) {
            /*
             * Back to the first-run state. Beyond the curve libraries this also
             * clears the editor size, the last curve, and the effect preset
             * folder with its favourites - so the panel UI is refreshed too.
             */
            PresetLibrary.factoryReset();
            refreshLibrarySelect();

            // Effect presets: forget the folder and empty the list
            var pathEl = document.getElementById("presetFolderPath");
            var listEl = document.getElementById("presetList");
            var favEl = document.getElementById("presetFavList");
            var favSec = document.getElementById("fxFavSection");
            if (pathEl) pathEl.textContent = "";
            if (listEl) listEl.innerHTML = "";
            if (favEl) favEl.innerHTML = "";
            if (favSec) favSec.style.display = "none";

            // Curve editor back to the default square
            var wrap = document.getElementById("curveWrap");
            if (wrap) {
                wrap.style.width = "";
                wrap.style.height = "";
                wrap.style.marginLeft = "";
                wrap.style.marginRight = "";
            }
            try {
                editor.setBezier(0.33, 0, 0.67, 1);
                editor._setupHiDPI();
                editor.draw();
            } catch (e) {}

            setStatus(I18N.t("msg.presetsRestored"));
        }
    });
}

// ====== MAIN: LAYERS ======
// When "Parent layers" is ticked, the selected layers are parented to the new one.
function addLayerWithParent(type) {
    var box = document.getElementById("parentLayers");
    var doParent = box ? box.checked : false;

    // Create the solid using the color picked in the bar
    if (type === "solid" && typeof window.getSolidColorRGB === "function") {
        var c = window.getSolidColorRGB();
        callAE("addColorSolid(" + c.r + "," + c.g + "," + c.b + ",'Solid'," + doParent + ")");
        return;
    }
    callAE("addLayer('" + type + "'," + doParent + ")");
}
function bindAddLayer(id, type) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("click", function () { addLayerWithParent(type); });
}
bindAddLayer("addNull", "null");
bindAddLayer("addAdjustment", "adjustment");
bindAddLayer("addSolid", "solid");
bindAddLayer("addCamera", "camera");

// ====== MAIN: TRANSFORM ======
document.getElementById("centerAnchor").addEventListener("click", function () { callAE("centerAnchorPoint()", I18N.t("msg.anchorCentered")); });
document.getElementById("centerComp").addEventListener("click", function () { callAE("centerInComp()", I18N.t("msg.layerCentered")); });

// ====== MAIN: RESOLUTION ======
var resBtns = document.querySelectorAll(".res-btn");
for (var r = 0; r < resBtns.length; r++) {
    resBtns[r].addEventListener("click", function () {
        applyResolution(this.getAttribute("data-w"), this.getAttribute("data-h"));
    });
}
document.getElementById("applyRes").addEventListener("click", function () {
    var w = parseInt(document.getElementById("customW").value, 10);
    var h = parseInt(document.getElementById("customH").value, 10);
    if (!w || !h) { setStatus(I18N.t("msg.invalidSize"), true); return; }
    applyResolution(w, h);
});
function applyResolution(w, h) {
    var scaleEl = document.getElementById("scaleLayersRes");
    var doScale = scaleEl ? scaleEl.checked : false;
    callAE("setCompResolution(" + w + "," + h + "," + doScale + ")");
}

// ====== MAIN: RENAME ======
document.getElementById("renameLayers").addEventListener("click", function () {
    var base = document.getElementById("renameBase").value;
    if (!base) { setStatus(I18N.t("msg.enterBaseName"), true); return; }
    base = base.replace(/'/g, "\\'");
    callAE("renameSelectedLayers('" + base + "')");
});

// ====== MAIN: PRECOMP ======
function doPrecomp(moveAll) {
    var el = document.getElementById("precompName");
    var name = (el ? el.value || "" : "").replace(/'/g, "\\'");
    callAE("precompSelected('" + name + "'," + moveAll + ")");
}
var pcMove = document.getElementById("precompMove");
if (pcMove) pcMove.addEventListener("click", function () { doPrecomp(true); });
var pcLeave = document.getElementById("precompLeave");
if (pcLeave) pcLeave.addEventListener("click", function () { doPrecomp(false); });

// ====== MAIN: ALIGN & DISTRIBUTE ======
// Alignment is always relative to the composition, as in AE set to Composition.
var alignBtns = document.querySelectorAll(".align-btn");
for (var albn = 0; albn < alignBtns.length; albn++) {
    alignBtns[albn].addEventListener("click", function () {
        callAE("alignLayers('" + this.getAttribute("data-align") + "','composition')");
    });
}
var distBtns = document.querySelectorAll(".dist-btn");
for (var dbn = 0; dbn < distBtns.length; dbn++) {
    distBtns[dbn].addEventListener("click", function () {
        callAE("distributeLayers('" + this.getAttribute("data-dist") + "')");
    });
}

// ====== MAIN: ANCHOR POINT GRID ======
var anchorBtns = document.querySelectorAll(".anchor-btn");
for (var ab = 0; ab < anchorBtns.length; ab++) {
    anchorBtns[ab].addEventListener("click", function () {
        callAE("setAnchorTo('" + this.getAttribute("data-anchor") + "')");
    });
}

// ====== SETTINGS: EDITOR COLORS ======
var colorMap = {
    colCurve: "curve",
    colHandle: "handle",
    colEndpoint: "endpoint",
    colBg: "bg",
    colGrid: "grid"
};

// Load the stored colors and apply them to the editor and the pickers
function applyStoredColors() {
    var saved = PresetLibrary.loadColors();
    for (var id in colorMap) {
        var key = colorMap[id];
        if (saved[key]) {
            editor.setColor(key, saved[key]);
            var picker = document.getElementById(id);
            if (picker) picker.value = saved[key];
        }
    }
    // the ref color has no picker, but it is stored as well
    if (saved.ref) editor.setColor("ref", saved.ref);
}
applyStoredColors();

// Color changed in a picker -> apply and store it
for (var cid in colorMap) {
    (function (id, key) {
        var picker = document.getElementById(id);
        if (!picker) return;
        picker.addEventListener("input", function () {
            editor.setColor(key, this.value);
            // Save the current set of colours
            var current = PresetLibrary.loadColors();
            current[key] = this.value;
            PresetLibrary.saveColors(current);
        });
    })(cid, colorMap[cid]);
}

/*
 * Sweep up any colour-picker nulls stranded by an interrupted run - a crash
 * with the dialog open can leave one behind in the project.
 *
 * Wrapped because this sits at the top level of the file. An exception here
 * stops the rest of main.js from ever running, and everything below - the
 * effect presets page, the language switcher, the reset button - would simply
 * never initialise, with no visible clue as to why. Housekeeping is not worth
 * taking the panel down for.
 */
try {
    cs.evalScript("cleanupPickerNulls()", function () {});
} catch (e) {}

// ====== EFFECT PRESETS ======
/*
 * Lists .ffx files from a folder the user picks and applies them to the
 * selected layers. The folder is remembered, so it only has to be chosen once.
 */
(function () {
    var pickBtn = document.getElementById("pickPresetFolder");
    var refreshBtn = document.getElementById("refreshPresets");
    var pathEl = document.getElementById("presetFolderPath");
    var listEl = document.getElementById("presetList");
    var filterEl = document.getElementById("presetFilter");
    if (!pickBtn || !listEl) return;

    var presets = [];
    var collapsedGroups = {};

    function savedFolder() {
        try { return PresetLibrary.loadSettings().fxFolder || ""; } catch (e) { return ""; }
    }

    /* Favourites are stored by full path, so they survive a refresh. */
    function favorites() {
        try { return PresetLibrary.loadSettings().fxFavorites || []; } catch (e) { return []; }
    }

    function isFavorite(path) {
        var f = favorites();
        for (var i = 0; i < f.length; i++) if (f[i] === path) return true;
        return false;
    }

    function toggleFavorite(path) {
        var f = favorites();
        var out = [];
        var found = false;
        for (var i = 0; i < f.length; i++) {
            if (f[i] === path) found = true;
            else out.push(f[i]);
        }
        if (!found) out.push(path);
        try { PresetLibrary.saveSetting("fxFavorites", out); } catch (e) {}
        render();
    }

    /* Builds one row: the preset button plus its star toggle. */
    function makeRow(p) {
        var row = document.createElement("div");
        row.className = "fx-row";

        var btn = document.createElement("button");
        btn.className = "fx-item";
        btn.textContent = p.name;
        btn.title = p.path;
        btn.addEventListener("click", function () {
            var safe = p.path.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
            callAE("applyEffectPreset('" + safe + "')");
        });

        var star = document.createElement("button");
        star.className = "fx-star" + (isFavorite(p.path) ? " on" : "");
        star.innerHTML = isFavorite(p.path) ? "&#9733;" : "&#9734;";
        star.title = I18N.t(isFavorite(p.path) ? "fx.unstar" : "fx.star");
        star.addEventListener("click", function (e) {
            e.stopPropagation();
            toggleFavorite(p.path);
        });

        row.appendChild(btn);
        row.appendChild(star);
        return row;
    }

    function renderFavorites() {
        var favEl = document.getElementById("presetFavList");
        var section = document.getElementById("fxFavSection");
        if (!favEl) return;

        favEl.innerHTML = "";
        var favs = favorites();

        // Match stored paths against what is actually on disk
        var shown = presets.filter(function (p) {
            return favs.indexOf(p.path) > -1;
        });

        // Hide the whole section when there is nothing starred yet
        if (section) section.style.display = shown.length ? "" : "none";
        if (!shown.length) return;

        shown.forEach(function (p) { favEl.appendChild(makeRow(p)); });
    }

    function render() {
        renderFavorites();

        var q = (filterEl && filterEl.value || "").toLowerCase();
        listEl.innerHTML = "";

        var shown = presets.filter(function (p) {
            return !q || p.name.toLowerCase().indexOf(q) > -1;
        });

        if (shown.length === 0) {
            var empty = document.createElement("div");
            empty.className = "fx-empty";
            empty.textContent = presets.length === 0
                ? I18N.t("fx.emptyFolder")
                : I18N.t("fx.noMatch");
            listEl.appendChild(empty);
            return;
        }

        // Group by subfolder, ungrouped entries first
        var groups = {};
        for (var i = 0; i < shown.length; i++) {
            var g = shown[i].group || "";
            if (!groups[g]) groups[g] = [];
            groups[g].push(shown[i]);
        }

        /*
         * Groups are collapsible, because a full preset tree can run to
         * hundreds of entries. Collapsed state is per session only - it is
         * navigation, not a setting worth persisting.
         */
        Object.keys(groups).sort().forEach(function (g) {
            var body = document.createElement("div");

            if (g) {
                var head = document.createElement("div");
                head.className = "fx-group";

                var collapsed = collapsedGroups[g] === true;
                head.innerHTML = (collapsed ? "&#9656; " : "&#9662; ") + g +
                                 ' <span class="fx-count">' + groups[g].length + "</span>";

                head.addEventListener("click", function () {
                    collapsedGroups[g] = !collapsed;
                    render();
                });

                listEl.appendChild(head);
                if (collapsed) return;   // header only
            }

            groups[g].forEach(function (p) { body.appendChild(makeRow(p)); });
            listEl.appendChild(body);
        });
    }

    function loadFrom(folder) {
        if (!folder) return;
        pathEl.textContent = folder;

        var safe = folder.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        cs.evalScript("listPresets('" + safe + "')", function (res) {
            if (!res || res.indexOf("ERROR:") === 0) {
                presets = [];
                render();
                setStatus(I18N.translateResponse(res || "").replace("ERROR:", ""), true);
                return;
            }
            try {
                presets = JSON.parse(res);
            } catch (e) {
                presets = [];
                setStatus(I18N.t("fx.parseError"), true);
                return;
            }
            render();
            setStatus(I18N.t("fx.loaded", presets.length));
        });
    }

    pickBtn.addEventListener("click", function () {
        cs.evalScript("pickPresetFolder()", function (res) {
            if (!res || res.indexOf("ERROR:") === 0) return;   // cancelled
            try { PresetLibrary.saveSetting("fxFolder", res); } catch (e) {}
            loadFrom(res);
        });
    });

    if (refreshBtn) {
        refreshBtn.addEventListener("click", function () { loadFrom(savedFolder()); });
    }

    if (filterEl) {
        filterEl.addEventListener("input", render);
    }

    // Restore the previously chosen folder on startup
    var initial = savedFolder();
    if (initial) loadFrom(initial);
})();

// ====== REMEMBERED UI STATE ======
/*
 * Keeps the panel where the user left it: the open page, the text typed into
 * the input fields, and the chosen solid colour.
 *
 * Everything lands in settings.json alongside the presets, since CEP panels
 * routinely lose localStorage when After Effects restarts - which is exactly
 * when these values matter.
 */
(function () {
    // Fields worth restoring. Transient ones like the preset filter are left out.
    var FIELDS = [
        "customW", "customH", "customFps", "customExpand",
        "renameBase", "precompName", "hexInput"
    ];

    var saveTimer = null;

    function persist(key, value) {
        try { PresetLibrary.saveSetting(key, value); } catch (e) {}
    }

    /* Typing should not hit the disk on every keystroke. */
    function persistLater(key, value) {
        if (saveTimer) window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(function () { persist(key, value); }, 400);
    }

    function restore() {
        var s;
        try { s = PresetLibrary.loadSettings(); } catch (e) { return; }
        if (!s) return;

        // --- input fields ---
        var vals = s.uiFields || {};
        for (var i = 0; i < FIELDS.length; i++) {
            var el = document.getElementById(FIELDS[i]);
            if (el && vals[FIELDS[i]] !== undefined && vals[FIELDS[i]] !== null) {
                el.value = vals[FIELDS[i]];
            }
        }

        // The picker and the swatch both mirror the hex field
        var hex = document.getElementById("hexInput");
        if (hex && /^#[0-9a-f]{6}$/i.test(hex.value) &&
            typeof window.setSolidColorUI === "function") {
            window.setSolidColorUI(hex.value);
        }

        // --- open page ---
        if (s.uiPage) {
            var btn = document.querySelector('.nav-btn[data-page="' + s.uiPage + '"]');
            if (btn) btn.click();
        }
    }

    function collect() {
        var out = {};
        for (var i = 0; i < FIELDS.length; i++) {
            var el = document.getElementById(FIELDS[i]);
            if (el) out[FIELDS[i]] = el.value;
        }
        return out;
    }

    // Watch the fields
    for (var i = 0; i < FIELDS.length; i++) {
        (function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.addEventListener("input", function () {
                persistLater("uiFields", collect());
            });
            el.addEventListener("change", function () {
                persist("uiFields", collect());
            });
        })(FIELDS[i]);
    }

    // Watch the open page
    var navBtns = document.querySelectorAll(".nav-btn");
    for (var n = 0; n < navBtns.length; n++) {
        navBtns[n].addEventListener("click", function () {
            persist("uiPage", this.getAttribute("data-page"));
        });
    }

    /*
     * Restoring is deferred: the library resolves the settings path during its
     * own init, and the page switch has to run after the nav handlers exist.
     */
    window.setTimeout(restore, 120);
})();

// ====== LANGUAGE SWITCHER ======
(function () {
    var sel = document.getElementById("langSelect");
    if (!sel) return;

    var langs = I18N.getLanguages();
    for (var i = 0; i < langs.length; i++) {
        var opt = document.createElement("option");
        opt.value = langs[i].code;
        opt.textContent = langs[i].name;
        sel.appendChild(opt);
    }
    sel.value = I18N.getLanguage();

    sel.addEventListener("change", function () {
        I18N.setLanguage(this.value);
        setStatus(I18N.t("status.done"));
    });
})();

// ====== ORGANIZE ======
var runOrgBtn = document.getElementById("runOrganize");
if (runOrgBtn) {
    runOrgBtn.addEventListener("click", function () {
        runOrganizeNow(document.getElementById("orgLog"));
    });
}

function runOrganizeNow(logEl) {
        setStatus(I18N.t("org.working"));
        logEl.textContent = I18N.t("org.working");

        cs.evalScript("runOrganizer()", function (res) {
            if (!res || res === "EvalScript error." || res === "undefined") {
                setStatus(I18N.t("status.scriptError"), true);
                logEl.textContent = I18N.t("msg.response") + String(res);
                return;
            }
            if (res.indexOf("ERROR:") === 0) {
                setStatus(res.replace("ERROR:", ""), true);
                logEl.textContent = res;
                return;
            }
            try {
                var data = JSON.parse(res);
                setStatus(I18N.translateResponse(data.status) || I18N.t("status.done"));
                logEl.innerHTML = "";
                for (var i = 0; i < data.log.length; i++) {
                    var line = document.createElement("div");
                    line.textContent = I18N.translateResponse(data.log[i]);
                    logEl.appendChild(line);
                }
            } catch (e) {
                setStatus(I18N.t("status.done"));
                logEl.textContent = res;
            }
        });
}

// ====== EASING PREVIEW ======
/*
 * Runs a dot along a track using the current curve, so the timing can be felt
 * before committing it to keyframes. Clicking replays it.
 *
 * The bezier is evaluated by hand rather than handed to a CSS transition,
 * because CSS rejects control points outside 0..1 - exactly the overshoot
 * curves that benefit most from a preview.
 */
(function () {
    var host = document.getElementById("easePreview");
    if (!host) return;
    var dot = host.querySelector(".ease-dot");
    if (!dot) return;

    var DURATION = 1000;   // ms per run
    var PAUSE = 400;       // ms held at the end before looping back
    var raf = null;
    var startedAt = 0;

    // Cubic bezier value at parameter t (P0 = 0,0 and P3 = 1,1 are fixed)
    function bezier(t, a, b) {
        var u = 1 - t;
        return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
    }

    /*
     * The curve is defined as value-over-time, so for a given elapsed time we
     * need the parameter t whose x matches it. Solved by bisection - cheap
     * enough at 60fps and robust for any control point placement.
     */
    function solveT(x, x1, x2) {
        var lo = 0, hi = 1, mid = x;
        for (var i = 0; i < 20; i++) {
            mid = (lo + hi) / 2;
            if (bezier(mid, x1, x2) < x) lo = mid;
            else hi = mid;
        }
        return mid;
    }

    function frame(now) {
        var v = editor.getValues();
        var elapsed = now - startedAt;

        if (elapsed > DURATION + PAUSE) {
            startedAt = now;
            elapsed = 0;
        }

        var progress = Math.min(1, elapsed / DURATION);
        var t = solveT(progress, v.x1, v.x2);
        var eased = bezier(t, v.y1, v.y2);

        var travel = host.clientWidth - 10;
        dot.style.transform = "translateX(" + (eased * travel) + "px)";

        raf = window.requestAnimationFrame(frame);
    }

    function start() {
        stop();
        startedAt = window.performance ? window.performance.now() : Date.now();
        raf = window.requestAnimationFrame(frame);
    }

    function stop() {
        if (raf) { window.cancelAnimationFrame(raf); raf = null; }
    }

    host.addEventListener("click", start);
    host.addEventListener("mouseenter", start);
    host.addEventListener("mouseleave", function () {
        stop();
        dot.style.transform = "translateX(0)";
    });
})();

// ====== CURVE EDITOR RESIZING ======
/*
 * The handle (three dots) below the editor - drag up/down to change height.
 * Double-click restores the default. The size is remembered between sessions.
 */
(function () {
    var wrap = document.getElementById("curveWrap");
    var handle = document.getElementById("curveResize");
    if (!wrap || !handle) return;

    var MIN_SIZE = 120;
    var MAX_SIZE = 900;

    /*
     * The editor is always square, so dragging changes width and height
     * together. Without an explicit size it simply fills the panel width
     * (aspect-ratio keeps it square); once the user drags, both dimensions
     * are pinned and the square is centred, leaving margins at the sides.
     */
    function applySize(px) {
        px = Math.round(px);
        if (px < MIN_SIZE) px = MIN_SIZE;
        if (px > MAX_SIZE) px = MAX_SIZE;

        // Never grow past the available width, or the square would overflow
        var avail = wrap.parentNode ? wrap.parentNode.clientWidth : px;
        if (avail > 0 && px > avail) px = avail;

        wrap.style.width = px + "px";
        wrap.style.height = px + "px";
        wrap.style.marginLeft = "auto";
        wrap.style.marginRight = "auto";

        redraw();
        return px;
    }

    function clearSize() {
        wrap.style.width = "";
        wrap.style.height = "";
        wrap.style.marginLeft = "";
        wrap.style.marginRight = "";
        redraw();
    }

    function redraw() {
        try {
            if (typeof editor !== "undefined" && editor) {
                editor._setupHiDPI();
                editor.draw();
            }
        } catch (e) {}
    }

    /*
     * Restore the stored size.
     *
     * Deferred, because applySize() clamps against the parent width and at
     * startup the layout is often not measured yet - clamping against a width
     * of 0 silently threw the stored size away.
     */
    (function restoreStoredSize() {
        var attempts = 0;
        function attempt() {
            attempts++;
            var saved = null;
            try { saved = PresetLibrary.loadSettings().curveSize; } catch (e) {}
            if (!saved) return;

            var avail = wrap.parentNode ? wrap.parentNode.clientWidth : 0;
            if (avail > 0) {
                applySize(parseInt(saved, 10));
                return;
            }
            if (attempts < 30) window.setTimeout(attempt, 100);
        }
        window.setTimeout(attempt, 50);
    })();

    var dragging = false;
    var startY = 0;
    var startSize = 0;

    handle.addEventListener("mousedown", function (e) {
        dragging = true;
        startY = e.clientY;
        startSize = wrap.getBoundingClientRect().height;
        handle.classList.add("dragging");
        e.preventDefault();
    });

    document.addEventListener("mousemove", function (e) {
        if (!dragging) return;
        applySize(startSize + (e.clientY - startY));
        e.preventDefault();
    });

    document.addEventListener("mouseup", function () {
        if (!dragging) return;
        dragging = false;
        handle.classList.remove("dragging");
        try {
            PresetLibrary.saveSetting("curveSize",
                Math.round(wrap.getBoundingClientRect().height));
        } catch (e) {}
    });

    // Double-click goes back to filling the panel width
    handle.addEventListener("dblclick", function () {
        clearSize();
        try { PresetLibrary.saveSetting("curveSize", null); } catch (e) {}
    });

    // Keep a pinned square from overflowing when the panel gets narrower
    if (typeof window !== "undefined") {
        window.addEventListener("resize", function () {
            if (!wrap.style.width) return;
            applySize(parseInt(wrap.style.width, 10));
        });
    }
})();

// ====== SUPPORT LINK ======
(function () {
    var btn = document.getElementById("supportBtn");
    if (!btn) return;

    var URL = "https://linktr.ee/beneg";

    btn.addEventListener("click", function () {
        /*
         * CEP has its own API for opening links - more reliable than
         * calling a system command. Should that fail, it falls back to
         * ExtendScript (jak to resi puvodni ScriptUI verze).
         */
        try {
            cs.openURLInDefaultBrowser(URL);
            return;
        } catch (e) {}

        var script =
            'if ($.os.indexOf("Windows") != -1) {' +
            '  system.callSystem(\'cmd.exe /c "start ' + URL + '"\');' +
            '} else {' +
            '  system.callSystem(\'open "' + URL + '"\');' +
            '}';
        cs.evalScript(script);
    });
})();

// ====== KEYBOARD SHORTCUTS ======
// NOTE: a CEP panel only receives key events while it has FOCUS (click into it first).
// Global shortcuts that also work in the timeline are not possible from CEP -
// that would need a separate ScriptUI script assigned in the menu. These are
// therefore "panel focus" shortcuts, useful while working inside the panel.
//
// Mapping (hold Alt + key):
//   Alt+A = Apply easing    Alt+R = Read from keyframes
//   Alt+C = Copy ease           Alt+V = Paste ease
//   Alt+F = Fit to comp         Alt+G = Fill to comp
//   Alt+X = Flip X              Alt+Y = Flip Y
document.addEventListener("keydown", function (e) {
    if (!e.altKey) return;
    var handled = true;
    switch (e.key.toLowerCase()) {
        case "a": document.getElementById("applyCurve").click(); break;
        case "r": document.getElementById("readCurve").click(); break;
        case "f": callAE("scaleToComp('fit')"); break;
        case "g": callAE("scaleToComp('fill')"); break;
        case "x": callAE("flipLayers('x')"); break;
        case "y": callAE("flipLayers('y')"); break;
        default: handled = false;
    }
    if (handled) e.preventDefault();
});

setStatus(I18N.t("status.ready"));

/* ============================================================
 *  TRANSFORM ROWS - the timeline's Transform block, in the panel
 * ============================================================ */

/*
 * Each row carries the same controls the timeline gives a property: jump to
 * the previous keyframe, the stopwatch, jump to the next. The values scrub by
 * dragging and take typing on a click, and the whole block follows the
 * selection on its own.
 *
 * Following the selection has to be done by polling, because After Effects
 * sends CEP no event when it changes. Three things keep that cheap: it runs
 * only while the Main page is visible, never has two requests in flight, and
 * compares one short string against the last answer - if nothing moved,
 * nothing is touched.
 */
(function () {
    /*
     * What one pixel of drag is worth. Position moves a pixel at a time
     * because that is its unit; scale, rotation and opacity move in half
     * steps, since their useful range is a hundred units rather than a
     * couple of thousand and at 1:1 they run away from you.
     */
    var STEP = { ax: 1, ay: 1, px: 1, py: 1, sx: 0.5, sy: 0.5, rot: 0.5, op: 0.5 };
    var ROW_INDEX = { anchor: 0, position: 1, scale: 2, rotation: 3, opacity: 4 };
    var KEY_ROW = { ax: 0, ay: 0, px: 1, py: 1, sx: 2, sy: 2, rot: 3, op: 4 };

    var POLL_MS = 400;
    var lastSignature = null;
    var inFlight = false;
    var busy = false;          // dragging or typing - polling must not fight it
    var values = null;
    var linked = true;

    var rows = document.querySelectorAll(".prop-row[data-row]");
    /*
     * Scoped to the transform rows on purpose. The shape section uses the same
     * .prop-num class, and an unscoped query would hand its stroke width to
     * this block, which has no row for it.
     */
    var nums = document.querySelectorAll(".prop-row[data-row] .prop-num");
    if (!rows.length || !nums.length) return;

    function mainVisible() {
        var page = document.getElementById("page-main");
        return page && page.classList.contains("active");
    }

    // The unit belongs with the number, the way the timeline prints it
    var UNIT = { ax: "", ay: "", px: "", py: "", sx: "%", sy: "%", rot: "\u00b0", op: "%" };
    function num(n) { return String(Math.round(Number(n) * 10) / 10); }
    function fmt(n, key) { return num(n) + (UNIT[key] || ""); }

    function paint() {
        for (var i = 0; i < nums.length; i++) {
            var k = nums[i].getAttribute("data-key");
            if (nums[i].querySelector("input")) continue;      // being typed into
            nums[i].textContent = (values === null) ? "--" : fmt(values[k], k);
        }
    }

    /*
     * Reflects the ExtendScript state onto the rows.
     *
     * "keyed" lights the stopwatch and wakes the navigator; "keyhere" fills
     * the diamond, meaning a keyframe sits on this exact frame. Those are
     * separate states - an animated property spends most of its time between
     * keyframes, and the diamond has to say so.
     */
    function paintState(flags, here) {
        for (var i = 0; i < rows.length; i++) {
            var st = flags ? flags.charAt(i) : "";
            var keyed = (st === "1" || st === "3");
            var expr = (st === "2" || st === "3");
            rows[i].classList[keyed ? "add" : "remove"]("keyed");
            rows[i].classList[expr ? "add" : "remove"]("expr");
            rows[i].classList[flags ? "remove" : "add"]("empty");
            rows[i].classList[(here && here.charAt(i) === "1") ? "add" : "remove"]("keyhere");
        }
    }

    function poll() {
        if (inFlight || busy || !mainVisible()) return;
        inFlight = true;

        cs.evalScript("pollTransform()", function (res) {
            inFlight = false;
            if (busy) return;
            if (res === lastSignature) return;
            lastSignature = res;

            if (!res || res === "NONE") { values = null; paint(); paintState(null, null); return; }

            var p = res.split("|");
            if (p.length < 8) return;
            var a = p[2].split(","), pos = p[3].split(","), sc = p[4].split(",");

            values = {
                ax: +a[0], ay: +a[1], px: +pos[0], py: +pos[1],
                sx: +sc[0], sy: +sc[1], rot: +p[5], op: +p[6]
            };
            paint();
            paintState(p[7], p[8]);
        });
    }

    /*
     * The kind of paint and whether it is switched on at all.
     *
     * Both arrive as "type:onOff", with "-" for a fill or stroke the shape does
     * not have. In that case the row still shows its type as None, because
     * that is exactly what it means and it is also how one gets added back.
     */
    function paintGraphic(kind, raw) {
        var sel = document.querySelector('.prop-type[data-stype="' + kind + '"]');
        var chk = document.querySelector('.prop-check[data-sen="' + kind + '"]');
        if (!sel || !chk) return;

        // No shape group at all - the controls have nothing to act on
        if (raw === null) {
            chk.checked = false;
            chk.disabled = true;
            sel.value = "none";
            sel.disabled = true;
            return;
        }

        var bits = String(raw).split(":");
        if (document.activeElement !== sel) sel.value = bits[0] || "none";

        var missing = (bits[1] === "-");
        chk.checked = !missing && bits[1] === "1";
        chk.disabled = missing;
        sel.disabled = false;
    }

    /* Dims the two Reset links when there is nothing for them to reset. */
    function setBlockEnabled(on) {
        var ids = ["resetShapeProps", "resetShapeTf"];
        for (var i = 0; i < ids.length; i++) {
            var el = document.getElementById(ids[i]);
            if (el) el.classList[on ? "remove" : "add"]("disabled");
        }
    }

    function refresh() { lastSignature = null; poll(); }

    function report(res) {
        if (res && res.indexOf("ERROR:") === 0) {
            setStatus(I18N.translateResponse(res.substring(6)), true);
        } else if (res) {
            setStatus(I18N.translateResponse(res));
        }
        refresh();
    }

    /*
     * Only an expression blocks editing now. A keyframed property is written
     * with setValueAtTime, exactly as the timeline does it, so dragging it is
     * a normal thing to want.
     */
    function isLocked(key) { return rows[KEY_ROW[key]].classList.contains("expr"); }

    /*
     * Sends one property. One call per gesture, so one undo step.
     *
     * Polling stays blocked until After Effects answers. Without that, a poll
     * fires in the gap between the write going out and it landing, reads the
     * value that is still there, and paints it back over the number just
     * dragged - which looks exactly like the value refusing to move.
     */
    function commit(key) {
        var payload = {};
        payload[key] = values[key];
        if (linked && (key === "sx" || key === "sy")) {
            payload.sx = values.sx;
            payload.sy = values.sy;
        }

        busy = true;
        cs.evalScript("applyLayerTransform('" + JSON.stringify(payload) + "')", function (res) {
            busy = false;
            if (res && res.indexOf("ERROR:") === 0) {
                setStatus(I18N.translateResponse(res.substring(6)), true);
            } else if (res && res.indexOf("|0") > -1) {
                // Nothing was written - say so rather than let it snap back in silence
                setStatus(I18N.translateResponse(res), true);
            }
            refresh();
        });
    }

    function applyValue(key, next) {
        if (key === "op") next = Math.max(0, Math.min(100, next));
        if (linked && (key === "sx" || key === "sy")) {
            var other = (key === "sx") ? "sy" : "sx";
            var prev = values[key];
            if (Math.abs(prev) > 0.001) values[other] = values[other] * (next / prev);
            else values[other] = next;
        }
        values[key] = next;
        paint();
    }

    /* ---- scrub, and click to type ---- */
    for (var i = 0; i < nums.length; i++) {
        (function (span) {
            var key = span.getAttribute("data-key");

            span.addEventListener("mousedown", function (e) {
                if (values === null || isLocked(key)) return;
                e.preventDefault();

                var startX = e.clientX, startVal = values[key], moved = 0;
                busy = true;
                span.classList.add("scrubbing");

                function onMove(ev) {
                    var dx = ev.clientX - startX;
                    moved = Math.max(moved, Math.abs(dx));
                    // Shift coarsens, Ctrl refines - the same reflex as in AE
                    var mult = ev.shiftKey ? 10 : (ev.ctrlKey || ev.metaKey ? 0.1 : 1);
                    applyValue(key, startVal + dx * STEP[key] * mult);
                }
                function onUp() {
                    document.removeEventListener("mousemove", onMove);
                    document.removeEventListener("mouseup", onUp);
                    span.classList.remove("scrubbing");
                    if (moved < 3) { busy = false; startEdit(span, key); return; }  // a click, not a drag
                    commit(key);          // keeps busy set until the write comes back
                }
                document.addEventListener("mousemove", onMove);
                document.addEventListener("mouseup", onUp);
            });
        })(nums[i]);
    }

    function startEdit(span, key) {
        if (values === null || isLocked(key)) return;

        var input = document.createElement("input");
        input.type = "text";
        input.className = "prop-edit";
        input.value = num(values[key]);

        span.textContent = "";
        span.appendChild(input);
        busy = true;
        input.focus();
        input.select();

        var done = false;
        function finish(save) {
            if (done) return;
            done = true;
            busy = false;
            var raw = input.value.replace(",", ".").trim();
            span.removeChild(input);
            paint();

            if (!save) { refresh(); return; }
            var n = parseFloat(raw);
            if (isNaN(n)) { setStatus(I18N.t("msg.invalidNumbers"), true); refresh(); return; }
            applyValue(key, n);
            commit(key);            // sets busy again until the write comes back
        }

        input.addEventListener("blur", function () { finish(true); });
        input.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { e.preventDefault(); finish(true); }
            else if (e.key === "Escape") { e.preventDefault(); finish(false); }
        });
    }

    /* ---- stopwatch and keyframe navigation ---- */
    for (var r = 0; r < rows.length; r++) {
        (function (row) {
            var name = row.getAttribute("data-row");

            /*
             * The stopwatch switches animation on and off. Alt-clicking it
             * adds or removes an expression instead, which is the reflex
             * After Effects trains into everyone.
             */
            var watch = row.querySelector(".kf-watch");
            if (watch) watch.addEventListener("click", function (e) {
                if (values === null) return;
                if (e.altKey) {
                    cs.evalScript("toggleTransformExpression('" + name + "')", report);
                } else {
                    cs.evalScript("toggleTransformStopwatch('" + name + "')", report);
                }
            });

            // The diamond adds or removes a keyframe on this frame only
            var dot = row.querySelector(".kf-dot");
            if (dot) dot.addEventListener("click", function () {
                if (values === null || !row.classList.contains("keyed")) return;
                cs.evalScript("toggleKeyAtTime('" + name + "')", report);
            });

            var navs = row.querySelectorAll(".kf-nav");
            for (var n = 0; n < navs.length; n++) {
                (function (nav) {
                    nav.addEventListener("click", function () {
                        if (values === null || !row.classList.contains("keyed")) return;
                        cs.evalScript("gotoTransformKey('" + name + "', " +
                                      nav.getAttribute("data-dir") + ")", report);
                    });
                })(navs[n]);
            }
        })(rows[r]);
    }

    /* ---- Reset ---- */
    var resetEl = document.getElementById("resetTransform");
    if (resetEl) resetEl.addEventListener("click", function () {
        cs.evalScript("resetTransform()", report);
    });

    /* ---- the Scale chain ---- */
    var linkEl = document.getElementById("scaleLink");
    if (linkEl) linkEl.addEventListener("click", function () {
        linked = !linked;
        linkEl.classList[linked ? "add" : "remove"]("on");
    });

    var timer = window.setInterval(poll, POLL_MS);
    window.addEventListener("beforeunload", function () {
        if (timer) window.clearInterval(timer);
    });
    poll();
})();


/* ============================================================
 *  SHAPE GROUP - properties and transform of the selected group
 * ============================================================ */

/*
 * Which group these rows show follows the timeline selection, which is how
 * After Effects itself decides. Clicking a path, a fill or any property inside
 * a group counts as picking that group, so the panel does not need a tree of
 * its own - and there is no second idea of "what is selected" to disagree with
 * the timeline.
 *
 * Rows the selected shape does not have are hidden rather than greyed: an
 * ellipse has no roundness at all, and a control leading nowhere is worse than
 * no control.
 */
(function () {
    /*
     * Per row: how a pixel of drag moves it, and the unit printed after the
     * number. Angles and percentages move in half steps because their useful
     * range is small; sizes and positions move a pixel at a time.
     */
    var SPEC = {
        size:        { step: 1,   unit: "",       pair: true },
        roundness:   { step: 0.5, unit: "" },
        fillColor:   { colour: true },
        strokeColor: { colour: true },
        strokeWidth: { step: 0.5, unit: " px" },
        lineCap:     { step: 1,   unit: "",  min: 1, max: 3 },
        lineJoin:    { step: 1,   unit: "",  min: 1, max: 3 },
        anchor:      { step: 1,   unit: "",  pair: true },
        position:    { step: 1,   unit: "",  pair: true },
        scale:       { step: 0.5, unit: "%", pair: true },
        skew:        { step: 0.5, unit: "" },
        skewAxis:    { step: 0.5, unit: "\u00b0" },
        rotation:    { step: 0.5, unit: "\u00b0" },
        opacity:     { step: 0.5, unit: "%", min: 0, max: 100 }
    };

    var POLL_MS = 500;
    var lastSignature = null;
    var inFlight = false;
    var busy = false;
    var data = null;                 // row -> { vals:[..]|hex, state, here }
    var linked = { size: true, scale: true };

    var nameEl = document.getElementById("shapeGroupName");
    var rows = document.querySelectorAll(".prop-row[data-srow]");
    if (!rows.length) return;

    function mainVisible() {
        var page = document.getElementById("page-main");
        return page && page.classList.contains("active");
    }
    function n1(v) { return String(Math.round(Number(v) * 10) / 10); }

    function paint() {
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var id = row.getAttribute("data-srow");
            var d = data ? data[id] : null;
            var isPaint = (id === "fillColor" || id === "strokeColor");

            /*
             * With a shape group selected, the fill and stroke rows never
             * hide: they carry the type dropdown, and hiding them when there
             * is no colour to show - a gradient, or nothing painted - took
             * away the only way of switching back.
             *
             * With no shape group at all there is nothing to switch, so they
             * go too. Leaving them behind showed the last shape's colours and
             * ticks over an empty selection, which reads as though a mask or a
             * plain layer had a fill.
             */
            var gone = !data || !d || (d.text === "" && !isPaint);
            row.classList[gone ? "add" : "remove"]("na");
            if (gone) continue;

            row.classList[(d.state === 1 || d.state === 3) ? "add" : "remove"]("keyed");
            row.classList[(d.state === 2 || d.state === 3) ? "add" : "remove"]("expr");
            row.classList[d.here ? "add" : "remove"]("keyhere");

            var sw = row.querySelector(".prop-swatch");
            if (sw) {
                if (d.text === "GRAD") {
                    // A ramp, not one colour - clicking opens AE's own editor
                    sw.style.background = "linear-gradient(90deg,#2a2a2a,#6a6a6a)";
                    sw.classList.remove("no-pick");
                    sw.classList.add("is-grad");
                    continue;
                }
                sw.classList.remove("is-grad");
                if (!d.text) {
                    sw.style.background = "#1a1a1a";
                    sw.classList.add("no-pick");
                } else {
                    sw.style.background = d.text;
                    sw.classList.remove("no-pick");
                }
                continue;
            }

            var parts = row.querySelectorAll(".prop-num");
            var vals = d.text.split(" ");
            for (var k = 0; k < parts.length; k++) {
                if (parts[k].querySelector("input")) continue;
                parts[k].textContent = n1(vals[k]) + (SPEC[id].unit || "");
            }
        }
    }

    function poll() {
        if (inFlight || busy || !mainVisible()) return;
        inFlight = true;

        cs.evalScript("pollShapeGroup()", function (res) {
            inFlight = false;
            if (busy) return;
            if (res === lastSignature) return;
            lastSignature = res;

            if (!res || res === "NONE") {
                data = null;
                if (nameEl) nameEl.textContent = "--";
                paintGraphic("fill", null);
                paintGraphic("stroke", null);
                setBlockEnabled(false);
                paint();
                return;
            }

            var p = res.split("|");
            if (nameEl) nameEl.textContent = p[0] + (p[1] && p[1] !== "-" ? "  \u00b7  " + p[1] : "");

            paintGraphic("fill", p[2]);
            paintGraphic("stroke", p[3]);
            setBlockEnabled(true);

            data = {};
            for (var i = 4; i < p.length; i++) {
                var eq = p[i].indexOf("=");
                var id = p[i].substring(0, eq);
                var rest = p[i].substring(eq + 1);
                if (rest === "") { data[id] = { text: "" }; continue; }
                var bits = rest.split(",");
                data[id] = { text: bits[0], state: +bits[1], here: bits[2] === "1" };
            }
            paint();
        });
    }

    /*
     * The kind of paint and whether it is switched on at all.
     *
     * Both arrive as "type:onOff", with "-" for a fill or stroke the shape does
     * not have. In that case the row still shows its type as None, because
     * that is exactly what it means and it is also how one gets added back.
     */
    function paintGraphic(kind, raw) {
        var sel = document.querySelector('.prop-type[data-stype="' + kind + '"]');
        var chk = document.querySelector('.prop-check[data-sen="' + kind + '"]');
        if (!sel || !chk) return;

        // No shape group at all - the controls have nothing to act on
        if (raw === null) {
            chk.checked = false;
            chk.disabled = true;
            sel.value = "none";
            sel.disabled = true;
            return;
        }

        var bits = String(raw).split(":");
        if (document.activeElement !== sel) sel.value = bits[0] || "none";

        var missing = (bits[1] === "-");
        chk.checked = !missing && bits[1] === "1";
        chk.disabled = missing;
        sel.disabled = false;
    }

    /* Dims the two Reset links when there is nothing for them to reset. */
    function setBlockEnabled(on) {
        var ids = ["resetShapeProps", "resetShapeTf"];
        for (var i = 0; i < ids.length; i++) {
            var el = document.getElementById(ids[i]);
            if (el) el.classList[on ? "remove" : "add"]("disabled");
        }
    }

    function refresh() { lastSignature = null; poll(); }

    function report(res) {
        if (res && res.indexOf("ERROR:") === 0) {
            setStatus(I18N.translateResponse(res.substring(6)), true);
        }
        refresh();
    }

    /*
     * Polling stays blocked until After Effects answers, for the same reason as
     * in the transform block: a poll landing mid-write repaints the old value
     * over the one just set.
     */
    function send(id) {
        var d = data[id];
        busy = true;
        cs.evalScript("setShapeProp('" + id + "', '" + d.text + "')", function (res) {
            busy = false;
            report(res);
        });
    }

    /* ---- scrub and type ---- */
    var numEls = document.querySelectorAll(".prop-num[data-sk]");
    for (var i = 0; i < numEls.length; i++) {
        (function (span) {
            var id = span.getAttribute("data-sk");
            var part = parseInt(span.getAttribute("data-part"), 10);

            span.addEventListener("mousedown", function (e) {
                if (!data || !data[id] || data[id].text === "") return;
                if (span.closest(".prop-row").classList.contains("expr")) return;
                e.preventDefault();

                var startX = e.clientX, moved = 0;
                var startVals = data[id].text.split(" ").map(Number);
                busy = true;
                span.classList.add("scrubbing");

                function onMove(ev) {
                    var dx = ev.clientX - startX;
                    moved = Math.max(moved, Math.abs(dx));
                    var mult = ev.shiftKey ? 10 : (ev.ctrlKey || ev.metaKey ? 0.1 : 1);
                    setPart(id, part, startVals[part] + dx * SPEC[id].step * mult, startVals);
                }
                function onUp() {
                    document.removeEventListener("mousemove", onMove);
                    document.removeEventListener("mouseup", onUp);
                    span.classList.remove("scrubbing");
                    if (moved < 3) { busy = false; edit(span, id, part); return; }
                    send(id);          // keeps busy set until the write comes back
                }
                document.addEventListener("mousemove", onMove);
                document.addEventListener("mouseup", onUp);
            });
        })(numEls[i]);
    }

    function setPart(id, part, next, startVals) {
        var s = SPEC[id];
        if (s.min !== undefined) next = Math.max(s.min, next);
        if (s.max !== undefined) next = Math.min(s.max, next);
        next = Math.round(next * 10) / 10;

        var vals = data[id].text.split(" ").map(Number);
        // With the chain on, the other half follows the same ratio
        if (s.pair && linked[id]) {
            var other = part === 0 ? 1 : 0;
            var base = (startVals || vals)[part];
            if (Math.abs(base) > 0.001) {
                vals[other] = Math.round((startVals || vals)[other] * (next / base) * 10) / 10;
            }
        }
        vals[part] = next;
        data[id].text = vals.join(" ");
        paint();
    }

    function edit(span, id, part) {
        var row = span.closest(".prop-row");
        if (row.classList.contains("expr")) return;

        var vals = data[id].text.split(" ");
        var input = document.createElement("input");
        input.type = "text";
        input.className = "prop-edit";
        input.value = n1(vals[part]);
        span.textContent = "";
        span.appendChild(input);
        busy = true;
        input.focus();
        input.select();

        var done = false;
        function finish(save) {
            if (done) return;
            done = true;
            busy = false;
            var raw = input.value.replace(",", ".").trim();
            span.removeChild(input);
            paint();
            if (!save) { refresh(); return; }
            var v = parseFloat(raw);
            if (isNaN(v)) { setStatus(I18N.t("msg.invalidNumbers"), true); refresh(); return; }
            setPart(id, part, v, null);
            send(id);
        }
        input.addEventListener("blur", function () { finish(true); });
        input.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { e.preventDefault(); finish(true); }
            else if (e.key === "Escape") { e.preventDefault(); finish(false); }
        });
    }

    /* ---- colours ---- */
    var swatches = document.querySelectorAll(".prop-swatch[data-sk]");
    for (var s = 0; s < swatches.length; s++) {
        (function (sw) {
            var id = sw.getAttribute("data-sk");
            sw.addEventListener("click", function () {
                if (!data || !data[id] || data[id].text === "") return;
                if (sw.closest(".prop-row").classList.contains("expr")) return;

                /*
                 * A gradient has a ramp rather than one colour, and scripting
                 * cannot touch a ramp at all. Clicking hands the job to After
                 * Effects' own gradient editor instead of doing nothing.
                 */
                if (data[id].text === "GRAD") {
                    var kind = (id === "fillColor") ? "fill" : "stroke";
                    cs.evalScript("openGradientEditor('" + kind + "')", report);
                    return;
                }
                busy = true;
                ColorPicker.open(data[id].text, function (hex) {
                    busy = false;
                    data[id].text = hex;
                    sw.style.background = hex;
                    send(id);
                });
                window.setTimeout(function () { busy = false; }, 60000);
            });
        })(swatches[s]);
    }

    /* ---- kind of paint, and whether it paints ---- */
    var types = document.querySelectorAll(".prop-type[data-stype]");
    for (var ty = 0; ty < types.length; ty++) {
        (function (sel) {
            var kind = sel.getAttribute("data-stype");
            sel.addEventListener("change", function () {
                busy = true;
                cs.evalScript("setShapeGraphicType('" + kind + "', '" + sel.value + "')", function (res) {
                    busy = false;
                    report(res);
                });
            });
        })(types[ty]);
    }

    var checks = document.querySelectorAll(".prop-check[data-sen]");
    for (var ch = 0; ch < checks.length; ch++) {
        (function (box) {
            var kind = box.getAttribute("data-sen");
            box.addEventListener("change", function () {
                busy = true;
                cs.evalScript("setShapeGraphicEnabled('" + kind + "', '" + box.checked + "')", function (res) {
                    busy = false;
                    report(res);
                });
            });
        })(checks[ch]);
    }

    /* ---- chains ---- */
    var links = document.querySelectorAll(".prop-link[data-sklink]");
    for (var L = 0; L < links.length; L++) {
        (function (el) {
            var id = el.getAttribute("data-sklink");
            el.addEventListener("click", function () {
                linked[id] = !linked[id];
                el.classList[linked[id] ? "add" : "remove"]("on");
            });
        })(links[L]);
    }

    /* ---- stopwatch, diamond, arrows ---- */
    for (var r = 0; r < rows.length; r++) {
        (function (row) {
            var id = row.getAttribute("data-srow");
            function act(a) {
                if (!data || !data[id] || data[id].text === "") return;
                cs.evalScript("shapeKeyAction('" + id + "', '" + a + "')", report);
            }
            // Alt-click adds or removes an expression, as in the timeline
            var w = row.querySelector(".kf-watch");
            if (w) w.addEventListener("click", function (e) {
                act(e.altKey ? "expr" : "watch");
            });
            var dot = row.querySelector(".kf-dot");
            if (dot) dot.addEventListener("click", function () {
                if (!row.classList.contains("keyed")) return;
                act("dot");
            });
            var navs = row.querySelectorAll(".kf-nav");
            for (var n = 0; n < navs.length; n++) {
                (function (nav) {
                    nav.addEventListener("click", function () {
                        if (!row.classList.contains("keyed")) return;
                        act(nav.getAttribute("data-dir"));
                    });
                })(navs[n]);
            }
        })(rows[r]);
    }

    /* ---- resets ---- */
    var rp = document.getElementById("resetShapeProps");
    if (rp) rp.addEventListener("click", function () {
        if (!data) return;
        cs.evalScript("resetShapeBlock('props')", report);
    });
    var rt = document.getElementById("resetShapeTf");
    if (rt) rt.addEventListener("click", function () {
        if (!data) return;
        cs.evalScript("resetShapeBlock('transform')", report);
    });

    var timer = window.setInterval(poll, POLL_MS);
    window.addEventListener("beforeunload", function () {
        if (timer) window.clearInterval(timer);
    });
    poll();
})();


/*
 * Decides whether the two shape blocks sit side by side.
 *
 * Measured rather than left to a media query: the choice depends on how wide a
 * column would be, and a media query only knows the width of the window. Those
 * two part company as soon as the panel is docked, since the sidebar and the
 * page padding come off the top.
 *
 * A row needs roughly 250px at full size and about 185px with the compact
 * metrics, which is where the two thresholds come from.
 */
(function () {
    var cols = document.querySelector(".shape-cols");
    if (!cols) return;

    var TWO_UP = 400;      // below this, one column reads better than two cramped ones
    var ROOMY = 560;       // above this, the columns can use full-size rows

    function fit() {
        var w = cols.clientWidth;
        if (!w) return;                        // hidden page reports zero
        var two = w >= TWO_UP;
        cols.classList[two ? "add" : "remove"]("two-up");
        cols.classList[(two && w < ROOMY) ? "add" : "remove"]("tight");
    }

    if (typeof ResizeObserver !== "undefined") {
        try { new ResizeObserver(fit).observe(cols); } catch (e) {}
    }
    window.addEventListener("resize", fit);

    // The page starts hidden, so the first measurement has to wait for it
    var navBtns = document.querySelectorAll(".nav-btn");
    for (var i = 0; i < navBtns.length; i++) {
        navBtns[i].addEventListener("click", function () { window.setTimeout(fit, 30); });
    }
    window.setTimeout(fit, 100);
    fit();
})();
