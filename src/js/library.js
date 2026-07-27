/*
 * library.js - manages the curve preset library.
 *
 * Preset = { name: string, value: [x1, y1, x2, y2] }
 * This is EXACTLY the Flow plugin (.flow) format, so import/export is 1:1.
 *
 * Storage: a JSON file in the user folder via CEP/Node fs. Thanks to
 * --enable-nodejs in the manifest, require('fs') and require('path') are available.
 */

var PresetLibrary = (function () {

    var presets = [];        // a VIEW of the currently active library
    var storePath = null;    // path to the JSON file on disk
    var colorsStorePath = null; // path to the colour file
    var settingsStorePath = null; // UI settings (editor size, last curve)
    var onChangeCb = null;

    // Multi-library model: { libraries: { name: [presets] }, active: name }
    var store = { libraries: {}, active: "Default" };

    // Default presets (Flow style), used on first run.
    // Values taken from the Flow plugin - the complete default set,
    // all 25 presets matching Flow 1:1.
    var DEFAULTS = [
        { name: "linear",     value: [0.00, 0.00, 1.00, 1.00] },

        { name: "easeIn",     value: [0.42, 0.00, 1.00, 1.00] },
        { name: "easeOut",    value: [0.00, 0.00, 0.58, 1.00] },
        { name: "ease",       value: [0.42, 0.00, 0.58, 1.00] },

        { name: "quadIn",     value: [0.26, 0.00, 0.60, 0.20] },
        { name: "quadOut",    value: [0.40, 0.80, 0.74, 1.00] },
        { name: "quad",       value: [0.48, 0.04, 0.52, 0.96] },

        { name: "cubicIn",    value: [0.40, 0.00, 0.68, 0.06] },
        { name: "cubicOut",   value: [0.32, 0.94, 0.60, 1.00] },
        { name: "cubic",      value: [0.66, 0.00, 0.34, 1.00] },

        { name: "quartIn",    value: [0.52, 0.00, 0.74, 0.00] },
        { name: "quartOut",   value: [0.26, 1.00, 0.48, 1.00] },
        { name: "quart",      value: [0.76, 0.00, 0.24, 1.00] },

        { name: "quintIn",    value: [0.64, 0.00, 0.78, 0.00] },
        { name: "quintOut",   value: [0.22, 1.00, 0.36, 1.00] },
        { name: "quint",      value: [0.84, 0.00, 0.16, 1.00] },

        { name: "expoIn",     value: [0.66, 0.00, 0.86, 0.00] },
        { name: "expoOut",    value: [0.14, 1.00, 0.34, 1.00] },
        { name: "expo",       value: [0.90, 0.00, 0.10, 1.00] },

        { name: "circIn",     value: [0.54, 0.00, 1.00, 0.44] },
        { name: "circOut",    value: [0.00, 0.56, 0.46, 1.00] },
        { name: "circ",       value: [0.88, 0.14, 0.12, 0.86] },

        { name: "backIn",     value: [0.60, -0.28, 0.73, 0.04] },
        { name: "backOut",    value: [0.17, 0.89, 0.32, 1.27] },
        { name: "back",       value: [0.68, -0.55, 0.27, 1.55] },

        /*
         * Speed ramps for Time Remap.
         *
         * Read these as a speed profile: x is time, y is the remapped value, so
         * the slope of the curve IS the playback rate. Each was checked to keep
         * x increasing (no time running backwards) and y inside 0-1 (no reading
         * past the end of the footage), which is why nothing here overshoots the
         * way back does.
         *
         * Speed ranges are the slowest and fastest point of each curve.
         */
        /*
         * Fast -> slow -> fast. This is the shape people mean by a speed ramp:
         * the clip runs, drops into slow motion, then snaps back out.
         *
         * Only two symmetric versions are here on purpose. Milder variants were
         * tried and dropped - plotted as value against time they sit within a
         * few pixels of these, because what separates them is the tangent at
         * the very ends, which the thumbnail cannot show. Two tiles that look
         * identical are worse than one.
         *
         * Every curve keeps x increasing (no time running backwards) and y
         * inside 0-1 (no reading past the end of the footage).
         */
        { name: "slowMid",  value: [0.05, 0.45, 0.95, 0.55] },   // 9x .. 0.58x
        { name: "whip",     value: [0.02, 0.48, 0.98, 0.52] },   // 24x .. 0.53x

        // Asymmetric - only one side snaps, the other stays at normal speed
        { name: "hitIn",    value: [0.06, 0.52, 0.72, 0.72] },   // fast -> slow -> normal
        { name: "hitOut",   value: [0.28, 0.28, 0.94, 0.48] },   // normal -> slow -> fast

        // Hard starts and stops, up to 14x
        { name: "snapIn",   value: [0.70, 0.00, 0.95, 0.30] },
        { name: "snapOut",  value: [0.05, 0.70, 0.30, 1.00] }
    ];


    // --- Node modules (available thanks to --enable-nodejs) ---
    function fs() { return (typeof require === "function") ? require("fs") : null; }
    function pathMod() { return (typeof require === "function") ? require("path") : null; }

    /*
     * mkdirSync(dir, {recursive:true}) needs Node 10.12; CEP 9 (After Effects
     * 2019/2020) ships an older Node that ignores the option. One level under
     * an existing parent still works there, but this is safe on every version.
     */
    function ensureDirCompat(dir) {
        var f = (typeof require === "function") ? require("fs") : null;
        var p = (typeof require === "function") ? require("path") : null;
        if (!f || !p || !dir) return false;
        try {
            if (f.existsSync(dir)) return true;
            var parent = p.dirname(dir);
            if (parent && parent !== dir) ensureDirCompat(parent);
            f.mkdirSync(dir);
            return true;
        } catch (e) {
            try { return f.existsSync(dir); } catch (e2) { return false; }
        }
    }


    // Resolves the panel data folder through CSInterface
    function resolveStorePath(cs) {
        try {
            var p = pathMod();
            // userDataFolder is the standard location for extension data
            var base = cs.getSystemPath(SystemPath.USER_DATA);
            var dir = p.join(base, "BeneGToolkit");

            ensureDirCompat(dir);
            return p.join(dir, "presets.json");
        } catch (e) {
            return null;
        }
    }

    function init(cs, cb) {
        onChangeCb = cb;
        storePath = resolveStorePath(cs);
        // Path for colors - stored next to presets.json
        try {
            if (storePath) {
                colorsStorePath = storePath.replace("presets.json", "colors.json");
                settingsStorePath = storePath.replace("presets.json", "settings.json");
            }
        } catch (e) {}
        load();
    }

    // Points `presets` at the currently active library
    function syncActiveView() {
        if (!store.libraries[store.active]) {
            // The active library is missing - take the first one or create Default
            var names = [];
            for (var k in store.libraries) names.push(k);
            store.active = names.length ? names[0] : "Default";
            if (!store.libraries[store.active]) {
                store.libraries[store.active] = DEFAULTS.slice(0);
            }
        }
        presets = store.libraries[store.active];
    }

    /*
     * Brings a stored file up to date with presets added after it was written.
     *
     * Two jobs. First, any DEFAULTS the stored "Default" library is missing get
     * appended - a fresh install gets them from DEFAULTS directly, but someone
     * upgrading already has a file on disk and would otherwise never see them.
     * Matching is by name, so a preset the user edited keeps their values.
     *
     * Second, the short-lived separate "Speed Ramp" library is folded away. It
     * is only removed when still untouched; if anything was added, renamed or
     * changed inside it, it stays exactly where it is.
     */
    function ensureBuiltinLibraries() {
        var changed = false;
        if (!store.libraries) store.libraries = {};
        if (!store.libraries["Default"]) store.libraries["Default"] = [];

        var target = store.libraries["Default"];
        var have = {};
        var i;

        for (i = 0; i < target.length; i++) have[target[i].name] = true;

        for (i = 0; i < DEFAULTS.length; i++) {
            if (!have[DEFAULTS[i].name]) {
                target.push({ name: DEFAULTS[i].name, value: DEFAULTS[i].value.slice(0) });
                changed = true;
            }
        }

        var stray = store.libraries["Speed Ramp"];
        if (stray) {
            var pristine = (stray.length === 8);
            if (pristine) {
                var seeded = "rampIn rampOut rampInOut slowMid whip glide snapIn snapOut";
                for (i = 0; i < stray.length; i++) {
                    if (seeded.indexOf(stray[i].name) === -1) { pristine = false; break; }
                }
            }
            if (pristine) {
                delete store.libraries["Speed Ramp"];
                if (store.active === "Speed Ramp") store.active = "Default";
                changed = true;
            }
        }

        /*
         * Presets that shipped in an earlier build and are not in DEFAULTS any
         * more. They are dropped only when still carrying the values they were
         * seeded with - retuned copies are the user's now.
         */
        var retired = {
            rampSoft:     "0.6,0,0.4,1",
            rampHold:     "0.95,0,0.05,1",
            rampInOut:    "0.85,0,0.15,1",
            rampIn:       "0.55,0,0.85,0.45",   // too close to cubicIn
            rampOut:      "0.15,0.55,0.45,1",   // too close to cubicOut
            glide:        "0.35,0,0.65,1",      // too close to ease
            slowMidSoft:  "0.15,0.55,0.85,0.45",
            slowMidLong:  "0.1,0.52,0.9,0.48"
        };
        for (i = target.length - 1; i >= 0; i--) {
            var seededValue = retired[target[i].name];
            if (seededValue && String(target[i].value) === seededValue) {
                target.splice(i, 1);
                changed = true;
            }
        }

        if (store.speedRampsSeeded) {
            delete store.speedRampsSeeded;
            changed = true;
        }

        return changed;
    }

    function load() {
        try {
            if (storePath && fs().existsSync(storePath)) {
                var txt = fs().readFileSync(storePath, "utf8");
                var parsed = JSON.parse(txt);

                // Migration: the old format was a plain ARRAY of presets (single library).
                // The new format is { libraries: {...}, active: "..." }.
                if (parsed instanceof Array) {
                    // Old single library -> move it to "Moje" and add Default
                    store = {
                        libraries: {
                            "Default": DEFAULTS.slice(0),
                            "Moje": parsed
                        },
                        active: "Moje"
                    };
                    save();
                } else if (parsed && parsed.libraries) {
                    store = parsed;
                } else {
                    store = { libraries: { "Default": DEFAULTS.slice(0) }, active: "Default" };
                    save();
                }
            } else {
                store = { libraries: { "Default": DEFAULTS.slice(0) }, active: "Default" };
                save();
            }
        } catch (e) {
            store = { libraries: { "Default": DEFAULTS.slice(0) }, active: "Default" };
        }
        if (ensureBuiltinLibraries()) save();
        syncActiveView();
        if (onChangeCb) onChangeCb(presets);
    }

    function save() {
        try {
            if (storePath) {
                fs().writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");
            }
        } catch (e) { /* tichy fail - pamet stale drzi presety */ }
    }

    // --- Library management ---
    function listLibraries() {
        var names = [];
        for (var k in store.libraries) names.push(k);
        return names;
    }

    function getActive() { return store.active; }

    function switchLibrary(name) {
        if (store.libraries[name]) {
            store.active = name;
            syncActiveView();
            save();
            if (onChangeCb) onChangeCb(presets);
        }
    }

    function createLibrary(name) {
        if (!name || store.libraries[name]) return false;
        store.libraries[name] = [];
        store.active = name;
        syncActiveView();
        save();
        if (onChangeCb) onChangeCb(presets);
        return true;
    }

    function deleteLibrary(name) {
        // The Default library cannot be deleted
        if (name === "Default") return false;
        // Refuse to delete the last remaining library
        var names = listLibraries();
        if (names.length <= 1) return false;
        if (!store.libraries[name]) return false;
        delete store.libraries[name];
        if (store.active === name) {
            store.active = listLibraries()[0];
        }
        syncActiveView();
        save();
        if (onChangeCb) onChangeCb(presets);
        return true;
    }

    function renameLibrary(oldName, newName) {
        // The Default library cannot be renamed
        if (oldName === "Default") return false;
        if (!store.libraries[oldName] || store.libraries[newName] || !newName) return false;
        store.libraries[newName] = store.libraries[oldName];
        delete store.libraries[oldName];
        if (store.active === oldName) store.active = newName;
        syncActiveView();
        save();
        if (onChangeCb) onChangeCb(presets);
        return true;
    }

    function add(name, value) {
        presets.push({ name: name, value: value.slice(0) });
        save();
        if (onChangeCb) onChangeCb(presets);
    }

    /*
     * True when the preset is one of the built-in ones sitting in the Default
     * library. Those are the panel's baseline, so they are protected from
     * deletion - a user preset with the same name elsewhere is not.
     */
    function isProtected(index) {
        if (store.active !== "Default") return false;
        var p = presets[index];
        if (!p) return false;
        for (var i = 0; i < DEFAULTS.length; i++) {
            if (DEFAULTS[i].name === p.name) return true;
        }
        return false;
    }

    function remove(index) {
        if (index < 0 || index >= presets.length) return false;
        if (isProtected(index)) return false;

        presets.splice(index, 1);
        save();
        if (onChangeCb) onChangeCb(presets);
        return true;
    }

    function rename(index, newName) {
        if (index >= 0 && index < presets.length) {
            presets[index].name = newName;
            save();
            if (onChangeCb) onChangeCb(presets);
        }
    }

    function getAll() { return presets; }

    function resetDefaults() {
        // Default presets ALWAYS belong to the "Default" library, not to whichever
        // one is currently active. If Default is missing, it is created.
        if (!store.libraries["Default"]) store.libraries["Default"] = [];
        var target = store.libraries["Default"];

        // For each default preset: if one with the same name exists, its values are
        // CORRECTED; if it is missing, it is added. User presets with other names
        // inside Default are left untouched.
        for (var i = 0; i < DEFAULTS.length; i++) {
            var found = false;
            for (var j = 0; j < target.length; j++) {
                if (target[j].name === DEFAULTS[i].name) {
                    target[j].value = DEFAULTS[i].value.slice(0);
                    found = true;
                    break;
                }
            }
            if (!found) {
                target.push({ name: DEFAULTS[i].name, value: DEFAULTS[i].value.slice(0) });
            }
        }

        // Switch to Default so the user sees the result
        store.active = "Default";
        syncActiveView();
        save();
        if (onChangeCb) onChangeCb(presets);
    }

    /*
     * Factory reset - discards every library and rebuilds the store exactly as
     * it looks on a first run: a single "Default" library holding the built-in
     * presets. Everything the user saved or imported is lost, which is why the
     * caller asks for confirmation first.
     */
    function factoryReset() {
        var arr = [];
        for (var i = 0; i < DEFAULTS.length; i++) {
            arr.push({ name: DEFAULTS[i].name, value: DEFAULTS[i].value.slice(0) });
        }

        store = { libraries: { "Default": arr }, active: "Default" };
        presets = arr;
        save();

        // Everything else the panel remembers goes too - editor size, last
        // curve, effect preset folder and favourites.
        clearSettings();

        if (onChangeCb) onChangeCb(presets);
    }

    // Hard reset - wipes EVERYTHING in the active library and restores defaults only
    function hardReset() {
        var arr = [];
        for (var i = 0; i < DEFAULTS.length; i++) {
            arr.push({ name: DEFAULTS[i].name, value: DEFAULTS[i].value.slice(0) });
        }
        store.libraries[store.active] = arr;
        presets = arr;
        save();
        if (onChangeCb) onChangeCb(presets);
    }

    // --- Import from the CONTENTS of a .flow file (string) ---
    // File reading is handled by ExtendScript; this receives the loaded text.
    function importFlowContent(txt) {
        try {
            var arr = JSON.parse(txt);
            if (!(arr instanceof Array)) return -1;
            var added = 0;
            for (var i = 0; i < arr.length; i++) {
                var item = arr[i];
                if (item && item.value instanceof Array && item.value.length === 4) {
                    presets.push({
                        name: item.name || ("Import " + (i + 1)),
                        value: [item.value[0], item.value[1], item.value[2], item.value[3]]
                    });
                    added++;
                }
            }
            save();
            if (onChangeCb) onChangeCb(presets);
            return added;
        } catch (e) {
            return -1;
        }
    }

    // --- Import .flow into a NEW library (named after the file) ---
    // If a library with that name exists, a number is appended. Returns
    // { count, library }, or null on failure.
    function importFlowToNewLibrary(txt, baseName) {
        try {
            var arr = JSON.parse(txt);
            if (!(arr instanceof Array)) return null;

            // Build the presets
            var newPresets = [];
            for (var i = 0; i < arr.length; i++) {
                var item = arr[i];
                if (item && item.value instanceof Array && item.value.length === 4) {
                    newPresets.push({
                        name: item.name || ("Import " + (i + 1)),
                        value: [item.value[0], item.value[1], item.value[2], item.value[3]]
                    });
                }
            }
            if (newPresets.length === 0) return null;

            // Unique library name
            var libName = baseName || "Import";
            var suffix = 1;
            while (store.libraries[libName]) {
                suffix++;
                libName = (baseName || "Import") + " " + suffix;
            }

            store.libraries[libName] = newPresets;
            store.active = libName;
            syncActiveView();
            save();
            if (onChangeCb) onChangeCb(presets);
            return { count: newPresets.length, library: libName };
        } catch (e) {
            return null;
        }
    }
    function exportFlowContent() {
        var out = [];
        for (var i = 0; i < presets.length; i++) {
            out.push({
                _id: makeId(),
                name: presets[i].name,
                value: presets[i].value.slice(0)
            });
        }
        return JSON.stringify(out, null, 4);
    }

    // --- Import a .flow file (JSON array of {_id,name,value}) ---
    // Returns the number of presets loaded, or -1 on failure.
    function importFlowFile(filePath) {
        try {
            var txt = fs().readFileSync(filePath, "utf8");
            return importFlowContent(txt);
        } catch (e) {
            return -1;
        }
    }

    // --- Export to .flow, readable back by the Flow plugin ---
    function exportFlowFile(filePath) {
        try {
            var out = [];
            for (var i = 0; i < presets.length; i++) {
                out.push({
                    // _id in the format Flow uses (random uuid-like string)
                    _id: makeId(),
                    name: presets[i].name,
                    value: presets[i].value.slice(0)
                });
            }
            fs().writeFileSync(filePath, JSON.stringify(out, null, 4), "utf8");
            return true;
        } catch (e) {
            return false;
        }
    }

    function makeId() {
        // Simple uuid-like id (the Flow format does not require an exact structure)
        function s() { return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1); }
        return s() + s() + "-" + s() + "-4" + s().substr(0, 3) + "-y" + s().substr(0, 3) + "-" + s() + s() + s();
    }

    // --- Editor colors (stored next to the presets) ---
    var DEFAULT_COLORS = {
        curve: "#ffffff", handle: "#f2b21e", endpoint: "#888888",
        grid: "#2a2a2a", ref: "#3a3a3a", bg: "#141414"
    };

    function loadColors() {
        try {
            if (colorsStorePath && fs().existsSync(colorsStorePath)) {
                return JSON.parse(fs().readFileSync(colorsStorePath, "utf8"));
            }
        } catch (e) {}
        var copy = {};
        for (var k in DEFAULT_COLORS) copy[k] = DEFAULT_COLORS[k];
        return copy;
    }

    function saveColors(colors) {
        try {
            if (colorsStorePath) {
                fs().writeFileSync(colorsStorePath, JSON.stringify(colors, null, 2), "utf8");
            }
        } catch (e) {}
    }

    /*
     * UI settings (editor size, last used curve).
     *
     * Written to disk rather than localStorage - CEP panels routinely lose
     * localStorage when the host application restarts, which is exactly when
     * these values matter.
     */
    function loadSettings() {
        try {
            if (settingsStorePath && fs().existsSync(settingsStorePath)) {
                return JSON.parse(fs().readFileSync(settingsStorePath, "utf8"));
            }
        } catch (e) {}
        return {};
    }

    /* Wipes the settings file - editor size, last curve, preset folder, favourites. */
    function clearSettings() {
        try {
            if (!settingsStorePath) return;
            fs().writeFileSync(settingsStorePath, "{}", "utf8");
        } catch (e) {}
    }

    function saveSetting(key, value) {
        try {
            if (!settingsStorePath) return;
            var cur = loadSettings();
            cur[key] = value;
            fs().writeFileSync(settingsStorePath, JSON.stringify(cur, null, 2), "utf8");
        } catch (e) {}
    }

    function defaultColors() {
        var copy = {};
        for (var k in DEFAULT_COLORS) copy[k] = DEFAULT_COLORS[k];
        return copy;
    }

    return {
        init: init,
        add: add,
        remove: remove,
        rename: rename,
        getAll: getAll,
        isProtected: isProtected,
        resetDefaults: resetDefaults,
        hardReset: hardReset,
        factoryReset: factoryReset,
        importFlowFile: importFlowFile,
        exportFlowFile: exportFlowFile,
        importFlowContent: importFlowContent,
        importFlowToNewLibrary: importFlowToNewLibrary,
        exportFlowContent: exportFlowContent,
        loadColors: loadColors,
        saveColors: saveColors,
        loadSettings: loadSettings,
        saveSetting: saveSetting,
        clearSettings: clearSettings,
        // Diagnostics: where the settings actually live
        _settingsPath: function () { return settingsStorePath; },
        defaultColors: defaultColors,
        _setColorsPath: function (p) { colorsStorePath = p; },
        // Sprava vice knihoven
        listLibraries: listLibraries,
        getActive: getActive,
        switchLibrary: switchLibrary,
        createLibrary: createLibrary,
        deleteLibrary: deleteLibrary,
        renameLibrary: renameLibrary
    };
})();

/*
 * Draws a small bezier curve preview into a canvas (used by the library grid).
 * value = [x1, y1, x2, y2]
 */
function drawPresetThumbnail(canvas, value) {
    var ctx = canvas.getContext("2d");
    var pad = 6;

    // HiDPI - a sharp preview rather than a rasterised one. The logical size comes
    // from the attributes set at creation; the bitmap itself is scaled up.
    var dpr = (typeof window !== "undefined" && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    var quality = dpr * 2;
    var W = canvas.width;   // logical width (68)
    var H = canvas.height;  // logical height (48)
    // Raise the internal resolution once, and only if it has not been raised yet
    if (!canvas._hidpiDone) {
        canvas.style.width = W + "px";
        canvas.style.height = H + "px";
        canvas.width = Math.round(W * quality);
        canvas.height = Math.round(H * quality);
        canvas._logicalW = W;
        canvas._logicalH = H;
        canvas._hidpiDone = true;
    }
    var LW = canvas._logicalW, LH = canvas._logicalH;
    ctx.setTransform(quality, 0, 0, quality, 0, 0);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.clearRect(0, 0, LW, LH);

    // Dynamic Y range for the preview too, so overshoot presets are fully visible
    var yv1 = value[1], yv2 = value[3];
    var lo = Math.min(0, 1, yv1, yv2);
    var hi = Math.max(0, 1, yv1, yv2);
    var span = hi - lo;
    var margin = Math.max(span * 0.2, 0.35);
    var YMIN = lo - margin, YMAX = hi + margin, yspan = YMAX - YMIN;
    function px(nx, ny) {
        return {
            x: pad + nx * (LW - pad * 2),
            y: pad + (YMAX - ny) / yspan * (LH - pad * 2)
        };
    }

    var p0 = px(0, 0), p3 = px(1, 1);
    var c1 = px(value[0], value[1]), c2 = px(value[2], value[3]);

    // Referencni linky 0 a 1
    ctx.strokeStyle = "#252525";
    ctx.lineWidth = 1;
    var y0 = px(0, 0).y, y1 = px(0, 1).y;
    ctx.beginPath(); ctx.moveTo(pad, y0); ctx.lineTo(LW - pad, y0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad, y1); ctx.lineTo(LW - pad, y1); ctx.stroke();

    // The curve itself, white as in Flow
    ctx.strokeStyle = "#e8e8e8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p3.x, p3.y);
    ctx.stroke();

    // Koncove body
    ctx.fillStyle = "#777";
    ctx.beginPath(); ctx.arc(p0.x, p0.y, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(p3.x, p3.y, 1.8, 0, Math.PI * 2); ctx.fill();
}

/*
 * ColorLibrary - the saved palette colours, stored on disk next to the presets.
 */
var ColorLibrary = (function () {
    var colors = null;
    var storePath = null;

    function fs() { return (typeof require === "function") ? require("fs") : null; }

    /*
     * mkdirSync(dir, {recursive:true}) needs Node 10.12; CEP 9 (After Effects
     * 2019/2020) ships an older Node that ignores the option. One level under
     * an existing parent still works there, but this is safe on every version.
     */
    function ensureDirCompat(dir) {
        var f = (typeof require === "function") ? require("fs") : null;
        var p = (typeof require === "function") ? require("path") : null;
        if (!f || !p || !dir) return false;
        try {
            if (f.existsSync(dir)) return true;
            var parent = p.dirname(dir);
            if (parent && parent !== dir) ensureDirCompat(parent);
            f.mkdirSync(dir);
            return true;
        } catch (e) {
            try { return f.existsSync(dir); } catch (e2) { return false; }
        }
    }

    function ensurePath() {
        if (storePath) return;
        try {
            var cs = new CSInterface();
            var p = require("path");
            var base = cs.getSystemPath(SystemPath.USER_DATA);
            var dir = p.join(base, "BeneGToolkit");
            ensureDirCompat(dir);
            storePath = p.join(dir, "colors_palette.json");
        } catch (e) { storePath = null; }
    }

    function load() {
        ensurePath();
        if (colors !== null) return colors;
        try {
            if (storePath && fs().existsSync(storePath)) {
                colors = JSON.parse(fs().readFileSync(storePath, "utf8"));
            } else {
                colors = [];
            }
        } catch (e) { colors = []; }
        return colors;
    }

    function save() {
        ensurePath();
        try {
            if (storePath) fs().writeFileSync(storePath, JSON.stringify(colors), "utf8");
        } catch (e) {}
    }

    function add(hex) {
        load();
        // Nepridavat duplicity
        if (colors.indexOf(hex) === -1) { colors.push(hex); save(); }
    }

    function remove(index) {
        load();
        if (index >= 0 && index < colors.length) { colors.splice(index, 1); save(); }
    }

    return { load: load, add: add, remove: remove };
})();
