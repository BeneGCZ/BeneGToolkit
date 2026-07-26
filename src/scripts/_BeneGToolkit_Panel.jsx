/*
 * BeneG Toolkit - shared loader for the standalone shortcut scripts.
 *
 * WHY THESE SCRIPTS EXIST
 *
 * The panel is a CEP extension, and CEP only receives keystrokes while it has
 * focus - click into the timeline and panel shortcuts stop responding. These
 * standalone scripts sidestep that: After Effects runs them as ordinary script
 * commands, so a shortcut assigned in Edit > Keyboard Shortcuts works from
 * anywhere.
 *
 * HOW THEY WORK
 *
 * Rather than duplicating the panel's logic, each script loads the panel's own
 * main.jsx and calls the same function the button would. One implementation,
 * one place to fix things.
 *
 * SCOPE - the reason "Function addLayer is undefined" used to appear
 *
 * $.evalFile does not reliably publish a file's function declarations into the
 * scope this script can see. Everything below therefore goes through $.global
 * explicitly: the panel source is evaluated at global scope, and functions are
 * looked up there by name instead of being resolved by a bare eval.
 */

// Cached so repeated runs in one session do not re-evaluate the file
var BGT_LOADED = (typeof BGT_LOADED !== "undefined") ? BGT_LOADED : false;

// Remembered so error messages can say which copy was actually used
var BGT_PATH = (typeof BGT_PATH !== "undefined") ? BGT_PATH : "";

// Present near the top of main.jsx - proof the file really evaluated
var BGT_CANARY = "isOrganizerLoaded";

/*
 * Finds the panel's main.jsx.
 *
 * Folder names are the OUTER loop on purpose. With the roots outer, a stray
 * copy in the per-user folder would win over a correct one installed
 * system-wide, and the shortcuts would silently run against the wrong code.
 */
function bgtFindPanelScript() {
    var roots = [];

    try {
        if ($.os.indexOf("Windows") !== -1) {
            var appData = Folder.userData.fsName;                    // %APPDATA%
            roots.push(appData + "/Adobe/CEP/extensions");
            roots.push("C:/Program Files (x86)/Common Files/Adobe/CEP/extensions");
            roots.push("C:/Program Files/Common Files/Adobe/CEP/extensions");
        } else {
            var home = Folder("~").fsName;
            roots.push(home + "/Library/Application Support/Adobe/CEP/extensions");
            roots.push("/Library/Application Support/Adobe/CEP/extensions");
        }
    } catch (e) {}

    var names = ["BeneGToolkit", "BeneG Toolkit"];

    for (var n = 0; n < names.length; n++) {
        for (var r = 0; r < roots.length; r++) {
            var f = new File(roots[r] + "/" + names[n] + "/jsx/main.jsxbin");
            if (f.exists) return f;
        }
    }
    return null;
}

/* Reads a file as UTF-8 text. Returns null if it cannot be read. */
function bgtReadFile(f) {
    try {
        f.encoding = "UTF-8";
        if (!f.open("r")) return null;
        var src = f.read();
        f.close();
        return src;
    } catch (e) {
        try { f.close(); } catch (e2) {}
        return null;
    }
}

/* True once the panel's functions are reachable through $.global. */
function bgtPanelReady() {
    return typeof $.global[BGT_CANARY] === "function";
}

/* Loads the panel logic once per session. Returns true on success. */
function bgtEnsureLoaded() {
    if (BGT_LOADED && bgtPanelReady()) return true;

    var f = bgtFindPanelScript();
    if (!f) {
        alert("BeneG Toolkit panel not found.\n\n" +
              "These scripts call the panel's own code, so the extension has to " +
              "be installed in the CEP extensions folder.",
              "BeneG Toolkit");
        return false;
    }

    BGT_PATH = f.fsName;

    // Evaluating the source at global scope is what makes the declarations
    // visible here; $.evalFile alone is not dependable for that.
    var src = bgtReadFile(f);
    if (src === null) {
        alert("Could not read the panel script:\n" + BGT_PATH, "BeneG Toolkit");
        return false;
    }

    try {
        $.global.eval(src);
    } catch (e) {
        alert("Could not load the panel script:\n" + BGT_PATH + "\n\n" + e.toString(),
              "BeneG Toolkit");
        return false;
    }

    if (!bgtPanelReady()) {
        alert("The panel script loaded but defined nothing usable.\n\n" +
              "Loaded from:\n" + BGT_PATH, "BeneG Toolkit");
        return false;
    }

    BGT_LOADED = true;
    return true;
}

/*
 * Runs a panel function and reports the outcome.
 *
 * "call" looks like "addLayer('solid', false)". The name is resolved through
 * $.global first, so a missing function produces a message naming the file it
 * looked in rather than a bare ReferenceError.
 *
 * The panel returns messages as i18n keys ("I18N:key|arg"), which only the
 * panel can translate - here they are stripped down to something readable
 * rather than shown raw.
 */
function bgtRun(call) {
    if (!bgtEnsureLoaded()) return;

    var name = String(call).split("(")[0];
    // Trim, without relying on String.trim which old ExtendScript lacks
    name = name.replace(/^\s+/, "").replace(/\s+$/, "");

    if (typeof $.global[name] !== "function") {
        alert("The panel does not provide " + name + "().\n\n" +
              "Loaded from:\n" + BGT_PATH + "\n\n" +
              "This usually means an older copy of the extension is installed " +
              "and is being found first.", "BeneG Toolkit");
        return;
    }

    var res;
    try {
        res = $.global.eval(call);
    } catch (e) {
        alert("Error: " + e.toString(), "BeneG Toolkit");
        return;
    }

    if (!res) return;
    res = String(res);

    var isError = (res.indexOf("ERROR:") === 0);
    if (isError) res = res.substring(6);

    // Only errors are worth interrupting for; successes stay silent
    if (isError) {
        alert(bgtReadable(res), "BeneG Toolkit");
    }
}

/* Turns "I18N:ae.noComp" into "no comp" - crude, but better than raw keys. */
function bgtReadable(msg) {
    if (msg.indexOf("I18N:") !== 0) return msg;

    var body = msg.substring(5).split("|")[0];      // drop arguments
    var dot = body.lastIndexOf(".");
    if (dot > -1) body = body.substring(dot + 1);

    // camelCase -> spaced words
    var out = "";
    for (var i = 0; i < body.length; i++) {
        var ch = body.charAt(i);
        if (ch >= "A" && ch <= "Z" && i > 0) out += " " + ch.toLowerCase();
        else out += ch;
    }
    return out.charAt(0).toUpperCase() + out.substring(1);
}
