/*
 * CurveEditor - a Flow-style easing curve editor.
 *
 * The model matches Flow / CSS cubic-bezier: the start P0=(0,0) and end
 * P3=(1,1) are fixed. The user drags two control points FREELY on both axes:
 *   P1 = (x1, y1)  ... outgoing handle of the first keyframe
 *   P2 = (x2, y2)  ... incoming handle of the second keyframe
 * This supports asymmetric curves, speed and overshoot (y outside 0..1).
 *
 * X axis = time (0 = first keyframe, 1 = second). Y axis = value (0..1),
 * and may go below 0 or above 1 on overshoot. Drawn as a VALUE graph, exactly
 * like Flow: a flat ease at the bottom, a steep middle, a flat finish on top.
 *
 * Conversion to After Effects (temporal ease on a keyframe):
 *   - influence (%) = horizontal distance of the handle from its keyframe * 100
 *       in  -> x1 * 100
 *       out -> (1 - x2) * 100
 *   - speed = handle slope (dValue/dTime) at the keyframe
 *       in  -> y1 / x1
 *       out -> (1 - y2) / (1 - x2)
 *     The real speed in units/s is computed by ExtendScript from the value
 *     range between the keyframes; here we only send the normalized slope.
 */

function CurveEditor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");

    this.pad = 26; // padding, including room for axis labels

    // Default = the Flow "ease" curve, 0.33, 0, 0.67, 1
    this.x1 = 0.33; this.y1 = 0.0;
    this.x2 = 0.67; this.y2 = 1.0;

    // Colors (configurable from the GUI). Defaults follow Flow: white curve, yellow handles.
    this.colors = {
        curve: "#ffffff",     // the curve itself
        handle: "#f2b21e",    // handles and the lines joining them
        endpoint: "#888888",  // the fixed end points P0/P3
        grid: "#2a2a2a",      // main grid lines
        gridFine: "#1c1c1c",  // fine mesh between them
        ref: "#3a3a3a",       // reference lines at 0 and 1
        bg: "#141414",        // canvas background
        axisText: "#5a5a5a",  // numbers along the axes
        axisLabel: "#4a4a4a"  // axis names
    };

    this.dragging = null;   // "p1" | "p2" | null
    this.onChange = null;

    // HiDPI setup - the key to sharp, non-rasterized rendering.
    // CSS stretches the canvas to the panel width; without this the bitmap
    // blurry. The internal resolution is set to displayed size * dpr.
    this._setupHiDPI();

    var self = this;
    // Recalculate the resolution whenever the window is resized
    if (typeof window !== "undefined") {
        window.addEventListener("resize", function () {
            self._setupHiDPI();
            self.draw();
        });
    }

    this._bindEvents();
    this.draw();

    /*
     * The layout may not be settled when the editor is constructed (the canvas
     * has zero width), and while the Curves tab is hidden it has no dimensions
     * at all. A single setTimeout does not cover this - the canvas occasionally
     * ended up 0x0 and rendered as a broken image.
     *
     * So it retries until the dimensions are non-zero, and additionally
     * listens for size changes.
     */
    var self2 = this;
    if (typeof window !== "undefined") {
        var attempts = 0;
        var retry = function () {
            attempts++;
            var r = self2.canvas.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
                self2._setupHiDPI();
                self2.draw();
                return;
            }
            if (attempts < 40) window.setTimeout(retry, 100);
        };
        window.setTimeout(retry, 30);

        // Redraw when the panel is resized or the tab is switched
        if (typeof ResizeObserver !== "undefined") {
            try {
                var ro = new ResizeObserver(function () {
                    var r = self2.canvas.getBoundingClientRect();
                    if (r.width > 0 && r.height > 0) {
                        self2._setupHiDPI();
                        self2.draw();
                    }
                });
                ro.observe(this.canvas);
            } catch (e) {}
        }

        window.addEventListener("resize", function () {
            var r = self2.canvas.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
                self2._setupHiDPI();
                self2.draw();
            }
        });
    }
}

// Sets the internal canvas resolution from the displayed size and devicePixelRatio
CurveEditor.prototype._setupHiDPI = function () {
    var dpr = (typeof window !== "undefined" && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    // Render sharper - multiply by 2 again for extra smoothness when enlarged
    var quality = dpr * 2;

    var rect = this.canvas.getBoundingClientRect();
    // Displayed size (CSS pixels). Falls back to the attribute before layout exists.
    var cssW = rect.width || this.canvas.width;
    var cssH = rect.height || this.canvas.height;

    /*
     * Safeguard: a zero-sized canvas is rendered as a broken image by the browser.
     * Before layout exists we fall back to a sane minimum - the retry loop
     * the retry loop in the constructor recalculates it to the right size later.
     */
    if (!cssW || cssW < 1) cssW = 240;
    if (!cssH || cssH < 1) cssH = 150;

    // Remember the logical drawing size, in CSS pixels
    this._w = cssW;
    this._h = cssH;

    // The internal bitmap runs at a higher resolution
    this.canvas.width = Math.round(cssW * quality);
    this.canvas.height = Math.round(cssH * quality);

    // Scale the context so drawing stays in CSS pixels but comes out sharp
    this.ctx.setTransform(quality, 0, 0, quality, 0, 0);
    this.ctx.lineJoin = "round";
    this.ctx.lineCap = "round";

    this.canvas.style.background = this.colors.bg;
};

// Sets a single color and redraws
CurveEditor.prototype.setColor = function (key, value) {
    if (this.colors.hasOwnProperty(key)) {
        this.colors[key] = value;
        this.canvas.style.background = this.colors.bg;
        this.draw();
    }
};

// Dynamic Y axis range - adapts to the curve values (like Flow).
// Defaults suit ordinary curves; _updateRange() recalculates them.
CurveEditor.prototype.YMIN = -0.4;
CurveEditor.prototype.YMAX = 1.4;

// Hard limits on typed input (Flow tolerates extreme overshoot)
CurveEditor.prototype.YHARD_MIN = -20;
CurveEditor.prototype.YHARD_MAX = 20;

/*
 * Recalculates the visible Y range so the whole curve fits, including
 * overshoot handles, with reasonable padding. Ordinary curves (0..1)
 * stay at a comfortable zoom, while extreme ones pull back automatically.
 */
CurveEditor.prototype._updateRange = function () {
    // While dragging we use a frozen range so the curve does not breathe
    if (this.dragging && this._dragYMIN !== undefined) {
        this.YMIN = this._dragYMIN;
        this.YMAX = this._dragYMAX;
        return;
    }
    // The end points are always 0 and 1; add the handle y1 and y2 on top
    var lo = Math.min(0, 1, this.y1, this.y2);
    var hi = Math.max(0, 1, this.y1, this.y2);
    var span = hi - lo;
    // 25% padding above and below, with a floor so 0..1 never touches the edge
    var margin = Math.max(span * 0.25, 0.35);
    this.YMIN = lo - margin;
    this.YMAX = hi + margin;
};

// Converts pixel -> normalized Y for a GIVEN range (used while dragging)
CurveEditor.prototype._toNormFixed = function (px, py, ymin, ymax) {
    var w = this._w - this.pad * 2;
    var h = this._h - this.pad * 2;
    var yspan = ymax - ymin;
    return {
        x: (px - this.pad) / w,
        y: ymax - (py - this.pad) / h * yspan
    };
};

CurveEditor.prototype._toPx = function (nx, ny) {
    var w = this._w - this.pad * 2;
    var h = this._h - this.pad * 2;
    var yspan = this.YMAX - this.YMIN;
    return {
        x: this.pad + nx * w,
        y: this.pad + (this.YMAX - ny) / yspan * h
    };
};

CurveEditor.prototype._toNorm = function (px, py) {
    var w = this._w - this.pad * 2;
    var h = this._h - this.pad * 2;
    var yspan = this.YMAX - this.YMIN;
    return {
        x: (px - this.pad) / w,
        y: this.YMAX - (py - this.pad) / h * yspan
    };
};

CurveEditor.prototype._bindEvents = function () {
    var self = this;

    this.canvas.addEventListener("mousedown", function (e) {
        var m = self._mousePos(e);
        var d1 = self._dist(m, self._toPx(self.x1, self.y1));
        var d2 = self._dist(m, self._toPx(self.x2, self.y2));
        if (d1 < 16 && d1 <= d2) self.dragging = "p1";
        else if (d2 < 16) self.dragging = "p2";

        // Freeze the EXACT range currently drawn so the handle stays
        // Do not widen it here - that would cause a jump
        // under the cursor (the same pixel would otherwise mean a different value).
        // Dragging to the extremes still works because mousemove clamps to the hard limits.
        if (self.dragging) {
            self._updateRange();               // align YMIN/YMAX with what is drawn
            self._dragYMIN = self.YMIN;
            self._dragYMAX = self.YMAX;

            // Starting point, needed for Shift axis locking
            self._dragStart = (self.dragging === "p1")
                ? { x: self.x1, y: self.y1 }
                : { x: self.x2, y: self.y2 };
            self._axisLock = null;
        }
    });

    window.addEventListener("mousemove", function (e) {
        if (!self.dragging) return;
        var m = self._mousePos(e);
        // While dragging use the frozen range, not the current YMIN/YMAX
        var n = self._toNormFixed(m.x, m.y, self._dragYMIN, self._dragYMAX);

        // Clamp X (time) to 0..1 - a handle must not pass its own keyframe in time
        n.x = Math.max(0, Math.min(1, n.x));
        // Allow Y (value) outside 0..1 to support overshoot
        n.y = Math.max(self.YHARD_MIN, Math.min(self.YHARD_MAX, n.y));

        /*
         * Modifier keys, matching Flow:
         *
         *   Shift        snap to 0.10 steps on both axes (0.01 together with Ctrl)
         *   Ctrl         keep the handle length fixed - only its angle changes,
         *                so the handle rotates around its keyframe
         *   Shift+Ctrl   fine 0.01 snapping with the opposite handle mirrored;
         *                the length stays free here, unlike plain Ctrl
         */
        var isP1 = (self.dragging === "p1");
        var anchor = isP1 ? { x: 0, y: 0 } : { x: 1, y: 1 };

        /*
         * --- Ctrl: preserve the handle length, change only the angle ---
         * Only when Ctrl is held on its own. Combined with Shift the handle
         * must stay freely draggable, since that pairing is for mirrored
         * fine-tuning where the length still needs to change.
         */
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && self._dragStart) {
            var startLen = Math.sqrt(
                Math.pow(self._dragStart.x - anchor.x, 2) +
                Math.pow(self._dragStart.y - anchor.y, 2)
            );
            var vx = n.x - anchor.x;
            var vy = n.y - anchor.y;
            var curLen = Math.sqrt(vx * vx + vy * vy);
            if (curLen > 0.0001 && startLen > 0.0001) {
                n.x = anchor.x + (vx / curLen) * startLen;
                n.y = anchor.y + (vy / curLen) * startLen;
                // Rotation may swing the handle past its keyframe in time
                n.x = Math.max(0, Math.min(1, n.x));
            }
        }

        /*
         * --- Shift: snap to a grid ---
         * On its own Shift uses coarse 0.10 steps for quick, round values.
         * Combined with Ctrl it drops to 0.01, because that pairing is meant
         * for fine symmetrical tuning rather than rough shaping.
         */
        if (e.shiftKey) {
            var STEP = (e.ctrlKey || e.metaKey) ? 0.01 : 0.1;
            n.x = Math.round(n.x / STEP) * STEP;
            n.y = Math.round(n.y / STEP) * STEP;
        }

        /*
         * Quantise every drag, not just the snapped ones.
         *
         * Free dragging used to store whatever the pixel maths produced, so a
         * handle parked visually on zero could hold -0.0001 - which displayed
         * as -0.00 and never counted as being on a preset. Hundredths match
         * what the fields show, so the graph moves in the same units it reads.
         */
        n.x = self._quantize(n.x);
        n.y = self._quantize(n.y);

        if (isP1) { self.x1 = n.x; self.y1 = n.y; }
        else { self.x2 = n.x; self.y2 = n.y; }

        // --- Shift+Ctrl: mirror the opposite handle around the curve centre ---
        if (e.shiftKey && (e.ctrlKey || e.metaKey)) {
            if (isP1) {
                self.x2 = self._quantize(1 - self.x1);
                self.y2 = self._quantize(1 - self.y1);
            } else {
                self.x1 = self._quantize(1 - self.x2);
                self.y1 = self._quantize(1 - self.y2);
            }
        }


        // When a handle approaches the edge of the frozen range, the range
        // is widened smoothly (like Flow) so dragging can continue without
        // jumping. Only the bound the handle pushes against is extended.
        var pad = (self._dragYMAX - self._dragYMIN) * 0.08;
        if (n.y > self._dragYMAX - pad) {
            self._dragYMAX = n.y + pad;
        }
        if (n.y < self._dragYMIN + pad) {
            self._dragYMIN = n.y - pad;
        }

        self.drawSoon();
        self._emit();
    });

    window.addEventListener("mouseup", function () {
        if (self.dragging) {
            self.dragging = null;
            self._dragYMIN = undefined;
            self._dragYMAX = undefined;
            self._dragStart = undefined;
            self._axisLock = null;
            // After release, redraw with the dynamically fitted range
            self.draw();
        }
    });
};

CurveEditor.prototype._mousePos = function (e) {
    var r = this.canvas.getBoundingClientRect();
    // Drawing happens in CSS pixels (_w x _h), and the mouse is in CSS pixels too
    var scaleX = this._w / r.width;
    var scaleY = this._h / r.height;
    return {
        x: (e.clientX - r.left) * scaleX,
        y: (e.clientY - r.top) * scaleY
    };
};

CurveEditor.prototype._dist = function (a, b) {
    return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
};

CurveEditor.prototype._emit = function () {
    if (this.onChange) this.onChange(this.getValues());
};

// --- Rendering ---
/*
 * A redraw at most once per frame.
 *
 * Dragging a handle fires mousemove far more often than the screen refreshes,
 * and every one of those used to repaint the whole canvas. Coalescing them
 * onto the frame boundary costs nothing in smoothness - the extra paints were
 * never visible - and takes the drag from ragged to steady on a busy panel.
 */
CurveEditor.prototype.drawSoon = function () {
    var self = this;
    if (this._rafPending) return;

    if (typeof window.requestAnimationFrame !== "function") { this.draw(); return; }

    this._rafPending = true;
    window.requestAnimationFrame(function () {
        self._rafPending = false;
        self.draw();
    });
};

CurveEditor.prototype.draw = function () {
    var ctx = this.ctx;
    var W = this._w, H = this._h;
    // Fit the Y range to the current curve (dynamic zoom, like Flow)
    this._updateRange();
    ctx.clearRect(0, 0, W, H);

    var p0 = this._toPx(0, 0);
    var p3 = this._toPx(1, 1);
    var c1 = this._toPx(this.x1, this.y1);
    var c2 = this._toPx(this.x2, this.y2);

    /*
     * Two-level grid, like Flow: a dense fine mesh for reading values off the
     * graph, plus stronger lines every fourth step for orientation.
     * The vertical spacing follows the value scale, so the fine cells stay
     * square-ish no matter how far the range is stretched by overshoot.
     */
    var gx0 = this.pad;
    var gx1 = W - this.pad;
    var gy0 = this.pad;
    var gy1 = H - this.pad;
    var plotW = gx1 - gx0;
    var plotH = gy1 - gy0;

    var FINE = 20;                       // fine cells across the time axis
    var stepX = plotW / FINE;
    // Match the vertical step to the horizontal one so cells stay square
    var stepY = stepX;
    var rowsUp = Math.ceil(plotH / stepY);

    // --- fine mesh ---
    ctx.strokeStyle = this.colors.gridFine || "#1e1e1e";
    ctx.lineWidth = 1;

    for (var fi = 0; fi <= FINE; fi++) {
        var fx = gx0 + stepX * fi;
        ctx.beginPath(); ctx.moveTo(fx, gy0); ctx.lineTo(fx, gy1); ctx.stroke();
    }
    for (var fr = 0; fr <= rowsUp; fr++) {
        var fy = gy1 - stepY * fr;
        if (fy < gy0) break;
        ctx.beginPath(); ctx.moveTo(gx0, fy); ctx.lineTo(gx1, fy); ctx.stroke();
    }

    // --- stronger lines every 4th cell ---
    ctx.strokeStyle = this.colors.grid;
    for (var ci = 0; ci <= FINE; ci += 4) {
        var cx = gx0 + stepX * ci;
        ctx.beginPath(); ctx.moveTo(cx, gy0); ctx.lineTo(cx, gy1); ctx.stroke();
    }
    for (var cr = 0; cr <= rowsUp; cr += 4) {
        var cy = gy1 - stepY * cr;
        if (cy < gy0) break;
        ctx.beginPath(); ctx.moveTo(gx0, cy); ctx.lineTo(gx1, cy); ctx.stroke();
    }

    // Reference horizontal lines for values 0 and 1
    var y0 = this._toPx(0, 0).y;
    var y1line = this._toPx(0, 1).y;
    ctx.strokeStyle = this.colors.ref;
    ctx.beginPath(); ctx.moveTo(this.pad, y0); ctx.lineTo(W - this.pad, y0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(this.pad, y1line); ctx.lineTo(W - this.pad, y1line); ctx.stroke();

    // Handle lines connecting to their keyframes (yellow, like Flow)
    ctx.strokeStyle = this.colors.handle;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(c1.x, c1.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p3.x, p3.y); ctx.lineTo(c2.x, c2.y); ctx.stroke();

    // The curve itself (white, like Flow)
    ctx.strokeStyle = this.colors.curve;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p3.x, p3.y);
    ctx.stroke();

    // End points
    ctx.fillStyle = this.colors.endpoint;
    this._dot(p0, 3);
    this._dot(p3, 3);

    // Handles (yellow)
    ctx.fillStyle = this.colors.handle;
    this._dot(c1, 6);
    this._dot(c2, 6);

    this._drawAxes(ctx, W, H);
};

/*
 * Axis labels and value markers.
 *
 * Drawn last so nothing overlaps them, and kept dim so they read as reference
 * rather than competing with the curve. The vertical scale follows the current
 * range, which stretches with overshoot, so the numbers stay meaningful.
 */
CurveEditor.prototype._drawAxes = function (ctx, W, H) {
    var x0 = this.pad;
    var x1 = W - this.pad;
    var y0 = this.pad;
    var y1 = H - this.pad;

    ctx.save();
    ctx.font = "9px sans-serif";
    ctx.fillStyle = this.colors.axisText || "#5a5a5a";

    // --- horizontal axis: time 0 to 1 ---
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    var tSteps = [0, 0.5, 1];
    for (var i = 0; i < tSteps.length; i++) {
        var px = x0 + (x1 - x0) * tSteps[i];
        ctx.fillText(tSteps[i].toFixed(tSteps[i] === 0.5 ? 1 : 0), px, y1 + 4);
    }

    // --- vertical axis: value, following the current range ---
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    var vSteps = [0, 1];
    // With overshoot the range grows well past 0..1, so mark the extremes too
    if (this.YMAX > 1.2) vSteps.push(Math.round(this.YMAX * 10) / 10);
    if (this.YMIN < -0.2) vSteps.push(Math.round(this.YMIN * 10) / 10);

    for (var v = 0; v < vSteps.length; v++) {
        var val = vSteps[v];
        var py = this._toPx(0, val).y;
        if (py < y0 - 2 || py > y1 + 2) continue;
        ctx.fillText(val.toFixed(val % 1 === 0 ? 0 : 1), x0 - 4, py);
    }

    // --- axis names ---
    ctx.fillStyle = this.colors.axisLabel || "#4a4a4a";
    ctx.font = "9px sans-serif";

    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText("X \u2192 time", x1, y1 + 4);

    // Rotated so it runs along the axis it describes
    ctx.save();
    ctx.translate(x0 - 4, y0);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText("Y \u2192 value", 0, 0);
    ctx.restore();

    ctx.restore();
};

CurveEditor.prototype._dot = function (p, r) {
    this.ctx.beginPath();
    this.ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    this.ctx.fill();
};

/*
 * Conversion to AE values. Returns influence (0-100) and the normalized speed slope
 * for both keyframes, plus the raw x1,y1,x2,y2 for a Flow-compatible readout.
 */
CurveEditor.prototype.getValues = function () {
    var inInfluence = this.x1 * 100;
    var outInfluence = (1 - this.x2) * 100;

    var inSpeed = this.x1 > 0.0001 ? (this.y1 / this.x1) : 0;
    var outSpeed = (1 - this.x2) > 0.0001 ? ((1 - this.y2) / (1 - this.x2)) : 0;

    return {
        inInfluence: Math.max(0.1, Math.min(100, inInfluence)),
        outInfluence: Math.max(0.1, Math.min(100, outInfluence)),
        inSpeed: inSpeed,
        outSpeed: outSpeed,
        x1: this.x1, y1: this.y1, x2: this.x2, y2: this.y2,
        shape: this.describeShape()
    };
};

/*
 * A verbal description of the curve shape. Instead of just the ends we sample
 * SPEED (the derivative of value over time) at several points along the curve
 * sampling speed also reveals three-phase shapes like "Fast -> Slow -> Fast".
 *
 * The curve is parametric: point(t) = cubic bezier of (x1,y1),(x2,y2).
 * Speed over time = dValue/dTime = (dy/dt) / (dx/dt) at a given parameter.
 */
CurveEditor.prototype.describeShape = function () {
    var x1 = this.x1, y1 = this.y1, x2 = this.x2, y2 = this.y2;

    // Overshoot detekce (y mimo 0..1)
    var hasOvershoot = y1 < -0.02 || y2 > 1.02 || y1 > 1.02 || y2 < -0.02;

    // Skoro rovna cara -> Linear
    if (Math.abs(y1 - x1) < 0.06 && Math.abs(y2 - x2) < 0.06) return "Linear";

    // Derivace kubickeho bezieru (P0=0, P3=1) v parametru t.
    // B'(t) for a coordinate: 3(1-t)^2(P1-P0) + 6(1-t)t(P2-P1) + 3t^2(P3-P2)
    function deriv(t, p1, p2) {
        var mt = 1 - t;
        return 3 * mt * mt * (p1 - 0) + 6 * mt * t * (p2 - p1) + 3 * t * t * (1 - p2);
    }

    // Speed = dy/dx (how fast the value grows against time) at parameter t
    function speedAt(t) {
        var dx = deriv(t, x1, x2);
        var dy = deriv(t, y1, y2);
        if (Math.abs(dx) < 0.0001) return 999; // svisly = extremne rychle
        return dy / dx;
    }

    // Navzorkujeme rychlost v 5 bodech
    var samples = [];
    for (var i = 0; i <= 4; i++) {
        samples.push(speedAt(i / 4));
    }

    // Klasifikace kazdeho vzorku: pomalu / stredne / rychle
    var SLOW = 0.6, FAST = 1.6;
    function cls(s) { return s < SLOW ? "S" : (s > FAST ? "F" : "M"); }

    var start = cls(samples[0]);
    var mid = cls(samples[2]);
    var end = cls(samples[4]);

    // Build the description from the start-middle-end phases, merging equal neighbours
    var phases = [];
    var seq = [start, mid, end];
    var names = { S: "Slow", M: "Med", F: "Fast" };
    for (var j = 0; j < seq.length; j++) {
        if (j === 0 || seq[j] !== seq[j - 1]) phases.push(names[seq[j]]);
    }

    var label;
    if (phases.length === 1) {
        // Uniform speed - tell an ease (slow at the edges) apart from linear
        if (phases[0] === "Slow") label = "Ease (Slow)";
        else if (phases[0] === "Fast") label = "Fast";
        else label = (typeof I18N !== "undefined") ? I18N.t("curve.custom") : "Custom";
    } else if (phases.length === 3 && phases[0] === "Slow" && phases[1] === "Med" && phases[2] === "Slow") {
        // Symmetric slow-medium-slow is the classic Ease
        label = "Ease";
    } else if (phases.length === 2 && phases[0] === "Slow" && phases[1] === "Fast") {
        label = "Ease In";
    } else if (phases.length === 2 && phases[0] === "Fast" && phases[1] === "Slow") {
        label = "Ease Out";
    } else {
        label = phases.join(" → ");
    }

    if (hasOvershoot) label += " + overshoot";
    return label;
};

// Sets the curve from four bezier values (Flow style)
/*
 * Puts a value on the editor's working grid.
 *
 * The grid is hundredths, which is exactly what the bezier fields show. That
 * makes the panel honest: the number in the field IS the number being stored,
 * so a handle parked on zero holds 0 rather than -0.0001, and a curve that
 * reads as a preset really is that preset.
 *
 * Everything goes through here - dragging, presets, curves read back from
 * keyframes, restored sessions - so no path can smuggle in precision the
 * panel cannot display or edit.
 *
 * The zero check exists because Math.round can hand back -0, and a stored
 * negative zero serves no purpose.
 */
CurveEditor.prototype._quantize = function (n) {
    var r = Math.round(Number(n) * 100) / 100;
    return (r === 0) ? 0 : r;
};

CurveEditor.prototype.setBezier = function (x1, y1, x2, y2) {
    this.x1 = this._quantize(Math.max(0, Math.min(1, x1)));
    this.y1 = this._quantize(Math.max(this.YHARD_MIN, Math.min(this.YHARD_MAX, y1)));
    this.x2 = this._quantize(Math.max(0, Math.min(1, x2)));
    this.y2 = this._quantize(Math.max(this.YHARD_MIN, Math.min(this.YHARD_MAX, y2)));
    this.draw();
    this._emit();
};

// Backwards compatibility: set from influence only (flat start/end)
CurveEditor.prototype.setValues = function (inInf, outInf) {
    this.x1 = this._quantize(Math.max(0, Math.min(1, inInf / 100)));
    this.y1 = 0;
    this.x2 = this._quantize(1 - Math.max(0, Math.min(1, outInf / 100)));
    this.y2 = 1;
    this.draw();
    this._emit();
};

/*
 * Reverse - flips the easing. The curve is mirrored around its center, so
 * ease-in becomes ease-out and vice versa. (x1,y1,x2,y2) becomes
 * (1-x2, 1-y2, 1-x1, 1-y1). Overshoot is preserved, just mirrored.
 */
CurveEditor.prototype.reverse = function () {
    // 1 - x reintroduces float dust (1 - 0.7 is not 0.3), so requantise
    var nx1 = this._quantize(1 - this.x2);
    var ny1 = this._quantize(1 - this.y2);
    var nx2 = this._quantize(1 - this.x1);
    var ny2 = this._quantize(1 - this.y1);
    this.x1 = nx1; this.y1 = ny1;
    this.x2 = nx2; this.y2 = ny2;
    this.draw();
    this._emit();
};

// Presets - full four bezier values so they match Flow
CurveEditor.prototype.applyPreset = function (name) {
    switch (name) {
        case "ease":    this.setBezier(0.33, 0.0, 0.67, 1.0); break;
        case "easeIn":  this.setBezier(0.42, 0.0, 1.0,  1.0); break;
        case "easeOut": this.setBezier(0.0,  0.0, 0.58, 1.0); break;
        case "linear":  this.setBezier(0.0,  0.0, 1.0,  1.0); break;
    }
};
