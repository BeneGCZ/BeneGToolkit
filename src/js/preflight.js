#!/usr/bin/env node
/*
 * preflight.js - checks a BeneGToolkit release folder before it is zipped.
 *
 *   node preflight.js ./BeneGToolkit
 *
 * Everything in here is a mistake that has already been made by someone, or
 * one the code makes easy to make. The point is not to prove the release is
 * good - only a running After Effects can do that - but to catch the failures
 * that are silent. A missing lang/ folder does not throw anything; the panel
 * just quietly speaks English to a German user until one of them writes in.
 *
 * Exits non-zero when something is wrong, so it can sit in a build script.
 */

var fs = require("fs");
var path = require("path");

var root = process.argv[2] || "./BeneGToolkit";
var problems = [];
var warnings = [];
var notes = [];

function fail(msg) { problems.push(msg); }
function warn(msg) { warnings.push(msg); }
function note(msg) { notes.push(msg); }

function read(rel) {
    try { return fs.readFileSync(path.join(root, rel), "utf8"); }
    catch (e) { return null; }
}
function exists(rel) {
    try { fs.statSync(path.join(root, rel)); return true; }
    catch (e) { return false; }
}

/* ---------------------------------------------------------------- layout */

if (!exists(".")) {
    console.error("Slozka neexistuje: " + root);
    process.exit(2);
}

/*
 * validate() in the updater refuses an archive without these two, so getting
 * them wrong means the update is rejected rather than half-installed. That is
 * the friendly failure - it is checked first anyway, because everything below
 * assumes the layout is right.
 */
var required = [
    "CSXS/manifest.xml",
    "index.html",
    "css/style.css",
    "js/main.js",
    "js/i18n.js",
    "js/updater.js",
    "js/curveEditor.js",
    "js/CSInterface.js",
    "js/colorPicker.js",
    "js/library.js",
    "js/tools.js",
    "update.json"
];
required.forEach(function (f) {
    if (!exists(f)) fail("chybi " + f);
});

/* ------------------------------------------------- the compiled host code */

/*
 * The one that turns a working-looking panel into a dead one. main.js calls
 * pollPanel(), which only exists in a freshly compiled jsxbin - ship the old
 * one and every value in the panel sits at "--" for ever, with no error
 * anywhere.
 */
if (!exists("jsx/main.jsxbin")) {
    fail("chybi jsx/main.jsxbin - manifest na nej ukazuje jako ScriptPath");
} else {
    var bin = null;
    try { bin = fs.readFileSync(path.join(root, "jsx/main.jsxbin")); } catch (e) {}

    if (bin) {
        var src = read("jsx/main.jsx");
        if (src && bin.length && fs.statSync(path.join(root, "jsx/main.jsxbin")).mtime <
                                 fs.statSync(path.join(root, "jsx/main.jsx")).mtime) {
            fail("jsx/main.jsxbin je starsi nez jsx/main.jsx - zapomenuta rekompilace?");
        }
        /*
         * A jsxbin is obfuscated, so pollPanel cannot be looked for directly.
         * Its absence from the source is checkable though, and that is the
         * mistake worth catching: editing main.jsx and compiling the wrong file.
         */
        if (src && src.indexOf("function pollPanel") === -1) {
            fail("jsx/main.jsx neobsahuje pollPanel() - main.js ji vola a bez ni panel neukaze zadne hodnoty");
        }
        if (bin.length < 1000) {
            fail("jsx/main.jsxbin je podezrele maly (" + bin.length + " B)");
        }
    }
}

/* ------------------------------------------------------------- languages */

var i18n = read("js/i18n.js");
var langDir = path.join(root, "lang");
var packs = [];
try {
    packs = fs.readdirSync(langDir).filter(function (n) { return /\.js$/.test(n); });
} catch (e) {}

if (!packs.length) {
    fail("slozka lang/ je prazdna nebo chybi - panel bude cely anglicky a nic to nenahlasi");
}

if (i18n) {
    /* Every language offered in Settings must have a pack to offer. */
    var listed = [];
    var m = i18n.match(/var LANGUAGES = \[([\s\S]*?)\];/);
    if (m) {
        var codes = m[1].match(/code:\s*"([a-z]{2})"/g) || [];
        listed = codes.map(function (c) { return c.match(/"([a-z]{2})"/)[1]; });
    }
    if (!listed.length) fail("v js/i18n.js se nepodarilo najit seznam LANGUAGES");

    listed.forEach(function (code) {
        if (code === "en") return;              // built in, never has a pack
        if (packs.indexOf(code + ".js") === -1) {
            fail("jazyk " + code + " je v LANGUAGES, ale lang/" + code + ".js chybi");
        }
    });

    packs.forEach(function (p) {
        var code = p.replace(/\.js$/, "");
        if (code !== "en" && listed.indexOf(code) === -1) {
            warn("lang/" + p + " existuje, ale " + code + " neni v LANGUAGES - nikdo se k nemu nedostane");
        }
    });

    /* Key parity: missing keys are not fatal, t() falls back to English. */
    function keysOf(text) {
        var out = {};
        (text.match(/^\s*"[^"]+":/gm) || []).forEach(function (k) {
            out[k.replace(/^\s*"/, "").replace(/":$/, "")] = true;
        });
        return out;
    }
    var enBlock = i18n.match(/en:\s*\{([\s\S]*?)\n    \};/);
    var enKeys = enBlock ? keysOf(enBlock[1]) : keysOf(i18n);
    var enCount = Object.keys(enKeys).length;

    packs.forEach(function (p) {
        var text = null;
        try { text = fs.readFileSync(path.join(langDir, p), "utf8"); } catch (e) { return; }

        if (text.indexOf("I18N.addPack(") === -1) {
            fail("lang/" + p + " nevola I18N.addPack() - nenacte se");
        }
        var k = keysOf(text);
        var missing = Object.keys(enKeys).filter(function (key) { return !k[key]; });
        if (missing.length) {
            note("lang/" + p + ": " + missing.length + " z " + enCount +
                 " klicu chybi, propadnou do anglictiny");
        }
    });
}

/* -------------------------------------------------------------- manifest */

var mf = read("CSXS/manifest.xml");
if (mf) {
    var bundle = mf.match(/ExtensionBundleVersion\s*=\s*"([^"]+)"/);
    var extv = mf.match(/<Extension Id="[^"]+" Version="([^"]+)"/);

    if (!bundle) {
        fail("v manifestu chybi ExtensionBundleVersion - updater podle nej pozna verzi");
    } else {
        note("verze v manifestu: " + bundle[1]);
        if (extv && extv[1] !== bundle[1]) {
            warn("ExtensionBundleVersion (" + bundle[1] + ") a Extension Version (" +
                 extv[1] + ") se lisi");
        }
        if (bundle[1] === "1.0.0") {
            warn("verze je porad 1.0.0 - zapomenuty bump? Updater nabidne update jen na vyssi cislo");
        }
    }

    var sp = mf.match(/<ScriptPath>\.\/(.*?)<\/ScriptPath>/);
    if (sp && !exists(sp[1])) fail("ScriptPath v manifestu ukazuje na " + sp[1] + ", ktery neexistuje");

    var mp = mf.match(/<MainPath>\.\/(.*?)<\/MainPath>/);
    if (mp && !exists(mp[1])) fail("MainPath v manifestu ukazuje na " + mp[1] + ", ktery neexistuje");
}

/* ------------------------------------------------- what index.html loads */

var html = read("index.html");
if (html) {
    var refs = (html.match(/(?:src|href)="([^"]+)"/g) || [])
        .map(function (r) { return r.replace(/^(?:src|href)="/, "").replace(/"$/, ""); })
        .filter(function (r) {
            return r !== "#" && r.indexOf("http") !== 0 && r.indexOf("' +") === -1;
        });

    refs.forEach(function (r) {
        if (!exists(r)) fail("index.html odkazuje na " + r + ", ktery ve slozce neni");
    });

    /* The bootstrap is what makes the split packs load at all. */
    if (html.indexOf("lang/") === -1) {
        fail("index.html neobsahuje zavadec jazykovych packu - panel zustane anglicky");
    }
}

/* ------------------------------------------------------------ JS syntax */

function walk(dir, out) {
    out = out || [];
    fs.readdirSync(dir).forEach(function (n) {
        var full = path.join(dir, n);
        if (fs.statSync(full).isDirectory()) walk(full, out);
        else if (/\.js$/.test(n)) out.push(full);
    });
    return out;
}
try {
    walk(root).forEach(function (f) {
        try { new Function(fs.readFileSync(f, "utf8")); }
        catch (e) { fail("syntakticka chyba v " + path.relative(root, f) + ": " + e.message); }
    });
} catch (e) {}

/* ------------------------------------------------------------- reporting */

console.log("\nKontrola: " + path.resolve(root) + "\n");

notes.forEach(function (n) { console.log("  i  " + n); });
if (notes.length) console.log("");

warnings.forEach(function (w) { console.log("  !  " + w); });
if (warnings.length) console.log("");

if (problems.length) {
    problems.forEach(function (p) { console.log("  X  " + p); });
    console.log("\n" + problems.length + " problem(u) - takhle to nevydavej.\n");
    process.exit(1);
}

console.log("  Vse sedi. Zabal obsah teto slozky a nahraj jako asset releasu.\n");
