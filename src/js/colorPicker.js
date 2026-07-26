/*
 * colorPicker.js - the panel's own colour picker.
 *
 * Replaces the browser's <input type="color">, whose dialog looks foreign
 * inside After Effects and whose eyedropper does nothing in a CEP panel.
 *
 * Layout follows the familiar arrangement: a saturation/value field, a hue
 * strip below it, and hex plus RGB fields that stay in sync with both.
 *
 * Usage:
 *   ColorPicker.open("#ff8800", function (hex) { ... });
 *
 * The callback fires only on OK; cancelling leaves the original colour alone.
 */

var ColorPicker = (function () {

    var overlay, field, hue, preview, hexInput, rInput, gInput, bInput, recentEl;
    var fieldCtx, hueCtx;

    // Current colour in HSV - the field and strip both work in this space
    var h = 0, s = 1, v = 1;

    var onAccept = null;
    var startHex = "#808080";
    var initialised = false;

    /* ---------------------------------------------------------------
     *  Colour conversion
     * ------------------------------------------------------------- */

    function hsvToRgb(h, s, v) {
        var i = Math.floor(h * 6);
        var f = h * 6 - i;
        var p = v * (1 - s);
        var q = v * (1 - f * s);
        var t = v * (1 - (1 - f) * s);
        var r, g, b;

        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            default: r = v; g = p; b = q; break;
        }

        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    function rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var d = max - min;
        var hh = 0;

        if (d !== 0) {
            if (max === r) hh = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            else if (max === g) hh = ((b - r) / d + 2) / 6;
            else hh = ((r - g) / d + 4) / 6;
        }

        return [hh, max === 0 ? 0 : d / max, max];
    }

    function toHex(rgb) {
        function p(n) {
            var x = n.toString(16);
            return x.length === 1 ? "0" + x : x;
        }
        return "#" + p(rgb[0]) + p(rgb[1]) + p(rgb[2]);
    }

    function parseHex(str) {
        var m = String(str).trim().replace(/^#/, "");
        if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
        return [
            parseInt(m.substring(0, 2), 16),
            parseInt(m.substring(2, 4), 16),
            parseInt(m.substring(4, 6), 16)
        ];
    }

    /* ---------------------------------------------------------------
     *  Rendering
     * ------------------------------------------------------------- */

    /*
     * The field shows every saturation and value for the current hue: white to
     * hue left-to-right, then black layered over it top-to-bottom.
     */
    function drawField() {
        var w = field.width, ht = field.height;
        var pure = hsvToRgb(h, 1, 1);

        fieldCtx.fillStyle = "rgb(" + pure[0] + "," + pure[1] + "," + pure[2] + ")";
        fieldCtx.fillRect(0, 0, w, ht);

        var white = fieldCtx.createLinearGradient(0, 0, w, 0);
        white.addColorStop(0, "rgba(255,255,255,1)");
        white.addColorStop(1, "rgba(255,255,255,0)");
        fieldCtx.fillStyle = white;
        fieldCtx.fillRect(0, 0, w, ht);

        var black = fieldCtx.createLinearGradient(0, 0, 0, ht);
        black.addColorStop(0, "rgba(0,0,0,0)");
        black.addColorStop(1, "rgba(0,0,0,1)");
        fieldCtx.fillStyle = black;
        fieldCtx.fillRect(0, 0, w, ht);

        // Marker, outlined in both colours so it stays visible on any shade
        var cx = s * w;
        var cy = (1 - v) * ht;

        fieldCtx.beginPath();
        fieldCtx.arc(cx, cy, 6, 0, Math.PI * 2);
        fieldCtx.strokeStyle = "rgba(0,0,0,0.6)";
        fieldCtx.lineWidth = 3;
        fieldCtx.stroke();

        fieldCtx.beginPath();
        fieldCtx.arc(cx, cy, 6, 0, Math.PI * 2);
        fieldCtx.strokeStyle = "#fff";
        fieldCtx.lineWidth = 1.5;
        fieldCtx.stroke();
    }

    function drawHue() {
        var w = hue.width, ht = hue.height;
        var grad = hueCtx.createLinearGradient(0, 0, w, 0);

        for (var i = 0; i <= 6; i++) {
            var c = hsvToRgb(i / 6, 1, 1);
            grad.addColorStop(i / 6, "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")");
        }

        hueCtx.fillStyle = grad;
        hueCtx.fillRect(0, 0, w, ht);

        var x = h * w;
        hueCtx.beginPath();
        hueCtx.rect(x - 2, 0, 4, ht);
        hueCtx.strokeStyle = "#fff";
        hueCtx.lineWidth = 2;
        hueCtx.stroke();
    }

    /* Pushes the current colour into every readout. */
    function sync(skipHexField) {
        var rgb = hsvToRgb(h, s, v);
        var hex = toHex(rgb);

        preview.style.background = hex;
        if (!skipHexField) hexInput.value = hex;
        rInput.value = rgb[0];
        gInput.value = rgb[1];
        bInput.value = rgb[2];

        drawField();
        drawHue();
    }

    function setFromRgb(rgb) {
        var hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
        h = hsv[0]; s = hsv[1]; v = hsv[2];
    }

    /* ---------------------------------------------------------------
     *  Recently used colours
     * ------------------------------------------------------------- */

    function loadRecent() {
        try { return PresetLibrary.loadSettings().recentColors || []; }
        catch (e) { return []; }
    }

    function pushRecent(hex) {
        var list = loadRecent();
        var out = [hex];

        for (var i = 0; i < list.length && out.length < 12; i++) {
            if (list[i] !== hex) out.push(list[i]);
        }

        try { PresetLibrary.saveSetting("recentColors", out); } catch (e) {}
    }

    function renderRecent() {
        recentEl.innerHTML = "";
        var list = loadRecent();

        for (var i = 0; i < list.length; i++) {
            (function (hex) {
                var b = document.createElement("button");
                b.style.background = hex;
                b.title = hex;
                b.addEventListener("click", function () {
                    var rgb = parseHex(hex);
                    if (rgb) { setFromRgb(rgb); sync(); }
                });
                recentEl.appendChild(b);
            })(list[i]);
        }
    }

    /* ---------------------------------------------------------------
     *  Screen sampling (the eyedropper)
     *
     *  The EyeDropper API is not an option inside After Effects. CEP embeds
     *  its own Chromium and the API is either absent or - in the newer
     *  builds - present but unimplemented, so open() never resolves. That is
     *  exactly why the button worked in a normal browser and did nothing in
     *  the panel.
     *
     *  So the panel asks the operating system instead, through the Node
     *  runtime that the manifest already enables:
     *
     *    Windows  a PowerShell helper waits for the next left click and
     *             reads that one pixel off the screen
     *    macOS    the system colour panel, whose magnifier samples the screen
     *
     *  If Node is unavailable the host's own picker is the last resort, and
     *  in a plain browser the EyeDropper API is still used, so the page keeps
     *  working when tested outside After Effects.
     * ------------------------------------------------------------- */

    var picking = false;
    var activeProc = null;

    function inCep() {
        return typeof window.__adobe_cep__ !== "undefined";
    }

    /* Node lives on cep_node in mixed context, plain require otherwise. */
    function nodeRequire() {
        try {
            if (window.cep_node && window.cep_node.require) return window.cep_node.require;
        } catch (e) {}
        try {
            if (typeof require === "function") return require;
        } catch (e2) {}
        return null;
    }

    var WIN_PICKER = [
        "$ErrorActionPreference='Stop'",
        "Add-Type -AssemblyName System.Windows.Forms",
        "Add-Type -AssemblyName System.Drawing",
        "$sig='[DllImport(\"user32.dll\")] public static extern short GetAsyncKeyState(int k);'",
        "$sig=$sig+'[DllImport(\"user32.dll\")] public static extern bool SetProcessDPIAware();'",
        "Add-Type -MemberDefinition $sig -Name Native -Namespace BGT",
        // Without this the cursor position and the screen grab disagree on
        // any display that is not at 100% scaling
        "try { [BGT.Native]::SetProcessDPIAware() | Out-Null } catch {}",
        // The click that opened the eyedropper must not count as the pick
        "while (([BGT.Native]::GetAsyncKeyState(1) -band 0x8000) -ne 0) { Start-Sleep -Milliseconds 20 }",
        "Write-Output 'READY'",
        "$deadline = (Get-Date).AddSeconds(60)",
        "while ((Get-Date) -lt $deadline) {",
        "  if ((([BGT.Native]::GetAsyncKeyState(0x1B) -band 0x8000) -ne 0) -or (([BGT.Native]::GetAsyncKeyState(2) -band 0x8000) -ne 0)) { Write-Output 'CANCEL'; exit }",
        "  if (([BGT.Native]::GetAsyncKeyState(1) -band 0x8000) -ne 0) {",
        "    $p = [System.Windows.Forms.Cursor]::Position",
        "    $bmp = New-Object System.Drawing.Bitmap 1,1",
        "    $g = [System.Drawing.Graphics]::FromImage($bmp)",
        "    $g.CopyFromScreen($p.X, $p.Y, 0, 0, (New-Object System.Drawing.Size 1,1))",
        "    $c = $bmp.GetPixel(0,0)",
        "    $g.Dispose(); $bmp.Dispose()",
        "    Write-Output ('#{0:X2}{1:X2}{2:X2}' -f $c.R, $c.G, $c.B)",
        "    exit",
        "  }",
        "  Start-Sleep -Milliseconds 15",
        "}",
        "Write-Output 'CANCEL'"
    ].join("\n");

    /*
     * Returns true if a helper was launched. done() gets an [r,g,b] array, or
     * null when the user backed out; ready() fires once the helper is actually
     * listening, so the button can say so.
     */
    function nativePick(done, ready) {
        var req = nodeRequire();
        if (!req) return false;

        var cp, os, Buf;
        try {
            cp = req("child_process");
            os = req("os");
            Buf = (typeof Buffer !== "undefined") ? Buffer : req("buffer").Buffer;
        } catch (e) { return false; }

        var platform = os.platform();
        var proc;

        try {
            if (platform === "win32") {
                // EncodedCommand sidesteps every layer of shell quoting
                var enc = Buf.from(WIN_PICKER, "utf16le").toString("base64");
                proc = cp.spawn("powershell.exe", [
                    "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden",
                    "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc
                ]);
            } else if (platform === "darwin") {
                // AppleScript colours are 16-bit, hence the 257 either way
                var cur = hsvToRgb(h, s, v);
                var def = (cur[0] * 257) + "," + (cur[1] * 257) + "," + (cur[2] * 257);
                proc = cp.spawn("osascript", [
                    "-e", "set c to (choose color default color {" + def + "})",
                    "-e", "set AppleScript's text item delimiters to \",\"",
                    "-e", "return c as text"
                ]);
                if (ready) ready();
            } else {
                return false;
            }
        } catch (e2) {
            return false;
        }

        activeProc = proc;

        var out = "";
        var settled = false;

        function finish(rgb) {
            if (settled) return;
            settled = true;
            activeProc = null;
            done(rgb);
        }

        proc.stdout.on("data", function (chunk) {
            out += String(chunk);
            if (ready && platform === "win32" && out.indexOf("READY") !== -1) {
                ready();
                ready = null;
            }
        });

        proc.on("error", function () { finish(null); });

        proc.on("close", function () {
            var text = out.replace(/READY/g, "").trim();
            if (!text || text.indexOf("CANCEL") !== -1) return finish(null);

            var hexRgb = parseHex(text.split(/\s+/).pop());
            if (hexRgb) return finish(hexRgb);

            // macOS hands back three 16-bit components
            var parts = text.split(",");
            if (parts.length === 3) {
                var rgb = [
                    Math.round(parseInt(parts[0], 10) / 257),
                    Math.round(parseInt(parts[1], 10) / 257),
                    Math.round(parseInt(parts[2], 10) / 257)
                ];
                if (!isNaN(rgb[0]) && !isNaN(rgb[1]) && !isNaN(rgb[2])) return finish(rgb);
            }

            finish(null);
        });

        return true;
    }

    /* Last resort inside the host: the application's own colour dialog. */
    function hostPick(done) {
        if (!inCep() || typeof CSInterface === "undefined") return false;

        try {
            var cur = hsvToRgb(h, s, v);
            var start = (cur[0] << 16) | (cur[1] << 8) | cur[2];
            var cs = new CSInterface();

            cs.evalScript(
                "(function(){try{return String($.colorPicker(" + start + "));}catch(e){return '-1';}})()",
                function (res) {
                    var n = parseInt(res, 10);
                    if (isNaN(n) || n < 0) return done(null);
                    done([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
                }
            );
            return true;
        } catch (e) {
            return false;
        }
    }

    function screenPick(done, ready) {
        // Outside CEP the real API is both available and the nicest option
        if (!inCep() && typeof window.EyeDropper !== "undefined") {
            try {
                new window.EyeDropper().open().then(function (res) {
                    done(parseHex(res.sRGBHex));
                }).catch(function () {
                    done(null);
                });
                return;
            } catch (e) { /* fall through */ }
        }

        if (nativePick(done, ready)) return;
        if (hostPick(done)) return;

        done(null);
    }

    /* ---------------------------------------------------------------
     *  Interaction
     * ------------------------------------------------------------- */

    function fieldPick(e) {
        var r = field.getBoundingClientRect();
        var x = Math.max(0, Math.min(r.width, e.clientX - r.left));
        var y = Math.max(0, Math.min(r.height, e.clientY - r.top));
        s = x / r.width;
        v = 1 - y / r.height;
        sync();
    }

    function huePick(e) {
        var r = hue.getBoundingClientRect();
        var x = Math.max(0, Math.min(r.width, e.clientX - r.left));
        h = x / r.width;
        sync();
    }

    function bind() {
        var draggingField = false, draggingHue = false;

        field.addEventListener("mousedown", function (e) {
            draggingField = true; fieldPick(e); e.preventDefault();
        });
        hue.addEventListener("mousedown", function (e) {
            draggingHue = true; huePick(e); e.preventDefault();
        });

        document.addEventListener("mousemove", function (e) {
            if (draggingField) fieldPick(e);
            else if (draggingHue) huePick(e);
        });
        document.addEventListener("mouseup", function () {
            draggingField = draggingHue = false;
        });

        // Typing a hex value should not fight the field being redrawn
        hexInput.addEventListener("input", function () {
            var rgb = parseHex(this.value);
            if (rgb) { setFromRgb(rgb); sync(true); }
        });

        function fromRgbInputs() {
            var rgb = [
                Math.max(0, Math.min(255, parseInt(rInput.value, 10) || 0)),
                Math.max(0, Math.min(255, parseInt(gInput.value, 10) || 0)),
                Math.max(0, Math.min(255, parseInt(bInput.value, 10) || 0))
            ];
            setFromRgb(rgb);
            sync();
        }

        rInput.addEventListener("input", fromRgbInputs);
        gInput.addEventListener("input", fromRgbInputs);
        bInput.addEventListener("input", fromRgbInputs);

        /*
         * Eyedropper. See the Screen sampling section above for why this is not
         * simply the EyeDropper API - inside CEP that API is either missing or
         * present but non-functional, which is what made the button look dead.
         */
        var eyeBtn = document.getElementById("cpEyedropper");
        if (eyeBtn) {
            eyeBtn.addEventListener("click", function () {
                if (picking) return;
                picking = true;
                eyeBtn.classList.add("picking");

                screenPick(function (rgb) {
                    picking = false;
                    eyeBtn.classList.remove("picking");
                    eyeBtn.classList.remove("armed");
                    if (rgb) { setFromRgb(rgb); sync(); }
                }, function () {
                    // The helper is listening - tell the user they may click
                    eyeBtn.classList.add("armed");
                });
            });
        }

        document.getElementById("cpCancel").addEventListener("click", close);

        document.getElementById("cpOk").addEventListener("click", function () {
            var hex = toHex(hsvToRgb(h, s, v));
            pushRecent(hex);

            /*
             * Grab the callback before closing - close() clears it, so calling
             * it afterwards would silently do nothing.
             */
            var cb = onAccept;
            close();
            if (cb) cb(hex);
        });

        // Clicking the backdrop cancels, the same as Escape
        overlay.addEventListener("mousedown", function (e) {
            if (e.target === overlay) close();
        });

        document.addEventListener("keydown", function (e) {
            if (!overlay.classList.contains("open")) return;
            if (e.key === "Escape") close();
            if (e.key === "Enter") document.getElementById("cpOk").click();
        });
    }

    function init() {
        if (initialised) return true;

        overlay = document.getElementById("colorPicker");
        if (!overlay) return false;

        field = document.getElementById("cpField");
        hue = document.getElementById("cpHue");
        preview = document.getElementById("cpPreview");
        hexInput = document.getElementById("cpHex");
        rInput = document.getElementById("cpR");
        gInput = document.getElementById("cpG");
        bInput = document.getElementById("cpB");
        recentEl = document.getElementById("cpRecent");

        fieldCtx = field.getContext("2d");
        hueCtx = hue.getContext("2d");

        bind();
        initialised = true;
        return true;
    }

    function open(currentHex, callback) {
        if (!init()) return;

        onAccept = callback;
        startHex = currentHex || "#808080";

        var rgb = parseHex(startHex) || [128, 128, 128];
        setFromRgb(rgb);

        overlay.classList.add("open");
        renderRecent();
        sync();
    }

    function close() {
        if (overlay) overlay.classList.remove("open");
        onAccept = null;

        // A helper left listening would swallow the user's next click
        if (activeProc) {
            try { activeProc.kill(); } catch (e) {}
            activeProc = null;
        }
        picking = false;

        var eyeBtn = document.getElementById("cpEyedropper");
        if (eyeBtn) {
            eyeBtn.classList.remove("picking");
            eyeBtn.classList.remove("armed");
        }
    }

    return { open: open, close: close };
})();
