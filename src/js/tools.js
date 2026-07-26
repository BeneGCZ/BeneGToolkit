/*
 * tools.js - wires the Tools and Colors pages to ExtendScript.
 * Expects the globals cs (CSInterface), callAE and setStatus from main.js.
 */

(function () {

    // Safe binding - if the element is missing we simply skip it, instead of
    // throwing and breaking every binding that follows in this file.
    function on(id, event, handler) {
        var el = document.getElementById(id);
        if (el) el.addEventListener(event, handler);
    }
    // Safe click binding that sends a command to AE
    function bindClick(id, aeCall) {
        on(id, "click", function () { callAE(aeCall); });
    }

    // ====== FPS ======
    var fpsBtns = document.querySelectorAll(".fps-btn");
    for (var i = 0; i < fpsBtns.length; i++) {
        fpsBtns[i].addEventListener("click", function () {
            callAE("setCompFPS(" + this.getAttribute("data-fps") + ")");
        });
    }
    on("applyFps", "click", function () {
        var v = parseFloat(document.getElementById("customFps").value);
        if (!v || v <= 0) { setStatus(I18N.t("msg.invalidFps"), true); return; }
        callAE("setCompFPS(" + v + ")");
    });

    // ====== COMP DURATION ======
    var expBtns = document.querySelectorAll(".exp-btn");
    for (var e = 0; e < expBtns.length; e++) {
        expBtns[e].addEventListener("click", function () {
            callAE("expandCompDuration(" + this.getAttribute("data-sec") + ")");
        });
    }
    on("applyExpand", "click", function () {
        var v = parseFloat(document.getElementById("customExpand").value);
        if (isNaN(v)) { setStatus(I18N.t("msg.enterSeconds"), true); return; }
        callAE("expandCompDuration(" + v + ")");
    });

    // ====== FIT / FILL ======
    bindClick("fitToComp", "scaleToComp('fit')");
    bindClick("fillToComp", "scaleToComp('fill')");

    // ====== FLIP ======
    bindClick("flipX", "flipLayers('x')");
    bindClick("flipY", "flipLayers('y')");

    // ====== MOTION BLUR / FRAME BLEND ======
    // On the selected layers
    bindClick("mbOn", "setLayerSwitch('motionBlur',true)");
    bindClick("mbOff", "setLayerSwitch('motionBlur',false)");
    bindClick("fbPixelOn", "setLayerSwitch('frameBlendPixel',true)");
    bindClick("fbOff", "setLayerSwitch('frameBlend',false)");

    // ====== PURGE CACHE ======
    bindClick("purgeAll", "purgeCache('all')");

    // ============================================================
    //  SOLID COLOR (preview + hex + picker)
    // ============================================================

    // Convert hex -> RGB 0-255
    function hexToRgb(hex) {
        hex = hex.replace("#", "");
        return {
            r: parseInt(hex.substring(0, 2), 16),
            g: parseInt(hex.substring(2, 4), 16),
            b: parseInt(hex.substring(4, 6), 16)
        };
    }

    var hexInput = document.getElementById("hexInput");
    var colorPreview = document.getElementById("colorPreview");

    var pickerSwatch = document.getElementById("pickerSwatch");

    function setSolidColorUI(hex) {
        if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
        if (hexInput) hexInput.value = hex;
        if (colorPreview) colorPreview.style.background = hex;
        if (pickerSwatch) pickerSwatch.style.background = hex;
    }

    /*
     * Opens the panel's own colour picker rather than a system dialog - it
     * matches the panel, keeps recently used colours to hand, and avoids
     * touching the project.
     */
    on("pickerHex", "click", function () {
        var current = hexInput ? hexInput.value : "#808080";
        ColorPicker.open(current, function (hex) {
            setSolidColorUI(hex);
            setStatus(I18N.t("msg.colorPicked", hex));
        });
    });
    on("hexInput", "change", function () {
        var v = this.value.trim();
        if (v.charAt(0) !== "#") v = "#" + v;
        if (/^#[0-9a-fA-F]{6}$/.test(v)) setSolidColorUI(v);
        else setStatus(I18N.t("msg.invalidHex"), true);
    });

    /*
     * Copy the hex value to the clipboard.
     *
     * navigator.clipboard is unavailable in CEP, so the value goes through a
     * hidden textarea and execCommand - the approach that predates it.
     */
    on("copyHex", "click", function () {
        var btn = this;
        var value = hexInput ? hexInput.value : "";
        if (!value) return;

        var ok = false;
        try {
            var tmp = document.createElement("textarea");
            tmp.value = value;
            tmp.style.position = "fixed";
            tmp.style.opacity = "0";
            document.body.appendChild(tmp);
            tmp.select();
            ok = document.execCommand("copy");
            document.body.removeChild(tmp);
        } catch (e) {
            ok = false;
        }

        if (ok) {
            setStatus(I18N.t("msg.hexCopied", value));
            btn.classList.add("copied");
            window.setTimeout(function () { btn.classList.remove("copied"); }, 900);
        } else {
            setStatus(I18N.t("msg.hexCopyFailed"), true);
        }
    });

    // Exposed so the restore step can refresh the swatch after loading a
    // stored hex value - the preview only updates through this function.
    window.setSolidColorUI = setSolidColorUI;

    // Expose the current color to main.js (used when creating a solid)
    window.getSolidColorRGB = function () {
        var hex = hexInput ? hexInput.value : "#808080";
        return hexToRgb(hex);
    };

})();
