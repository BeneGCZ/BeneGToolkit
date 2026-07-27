/*
 * updater.js - automatic updates from GitHub releases.
 *
 * WHAT IT DOES
 *
 * On startup (throttled to once a day) it asks the GitHub releases API whether
 * a newer version than the one in CSXS/manifest.xml exists. If it does, a modal
 * shows the release notes with three ways out: install now, remind me later, or
 * skip this version entirely. Installing downloads the release zip, unpacks it
 * in memory and writes it over the extension folder, then asks for an After
 * Effects restart - CEP evaluates main.jsxbin when the panel opens, so new
 * ExtendScript only takes effect on a fresh start.
 *
 * WHY NODE AND NOT XMLHttpRequest
 *
 * The panel is served from file://, and CEF blocks cross-origin XHR from there.
 * The manifest already enables --enable-nodejs --mixed-context, so require()
 * works right here in the DOM context and https.get has no CORS to satisfy.
 *
 * WHY THE ZIP IS UNPACKED BY HAND
 *
 * There is no unzip in the CEP runtime and no npm install to lean on, so the
 * reader below parses the central directory and inflates entries with zlib,
 * which ships with Node. It also checks every CRC, so a truncated download is
 * refused instead of half-installed.
 *
 * WHAT IT NEVER TOUCHES
 *
 * Everything the user owns lives in USER_DATA/BeneGToolkit (presets.json,
 * colors.json, settings.json) - outside the extension folder, so replacing the
 * extension cannot reach it. The installer additionally snapshots those three
 * files before it starts and puts anything that went missing back afterwards,
 * and it only ever deletes files it installed itself in a previous run.
 */

var Updater = (function () {

    /* ==================================================================
       CONFIGURATION

       Defaults live here; update.json in the extension root overrides any
       of them, so the repository can be pointed somewhere else without
       editing this file.
       ================================================================== */
    var CONFIG = {
        // GitHub repository holding the releases
        owner: "BeneGCZ",
        repo: "BeneGToolkit",

        /*
         * Which asset to download. A substring match against the asset
         * filename, so "BeneGToolkit" matches BeneGToolkit-1.0.0.zip.
         * When nothing matches, the first .zip asset is used; when the
         * release has no assets at all, the source zipball is used instead,
         * which means tagging a release is enough to ship an update.
         */
        assetMatch: "",

        // Pre-releases are ignored unless this is turned on
        allowPrerelease: false,

        // How long between automatic checks, and how long "Later" lasts
        checkIntervalHours: 24,
        postponeHours: 24,

        /*
         * Paths inside the extension folder the installer must not write or
         * delete.
         *
         * .debug is a developer file a release zip has no business removing,
         * and .installed.json is the installer's own bookkeeping. update.json
         * is deliberately NOT here: it ships with the release, so a wrong
         * repository or asset name can be corrected by publishing a fix
         * rather than being frozen on every machine forever.
         */
        keep: [".debug", ".installed.json"]
    };

    var STATE_KEY = "updater";      // key inside settings.json

    var cs = null;                  // CSInterface, handed in by init()
    var state = null;               // cached settings.json["updater"]
    var busy = false;               // an install is running
    var latest = null;              // the release currently on screen


    /* ==================================================================
       NODE MODULES
       ================================================================== */
    function req(name) {
        try { return (typeof require === "function") ? require(name) : null; }
        catch (e) { return null; }
    }
    function fs() { return req("fs"); }
    function pathMod() { return req("path"); }
    function https() { return req("https"); }
    function http() { return req("http"); }
    function urlMod() { return req("url"); }
    function zlib() { return req("zlib"); }

    function nodeReady() {
        return !!(fs() && pathMod() && https() && zlib());
    }


    /* ==================================================================
       PATHS AND VERSIONS
       ================================================================== */

    /* The extension's own folder - what the installer writes into. */
    function extRoot() {
        try { return cs.getSystemPath(SystemPath.EXTENSION); }
        catch (e) { return null; }
    }

    /* USER_DATA/BeneGToolkit - user data and backups. Never overwritten. */
    function dataRoot() {
        try {
            var p = pathMod();
            var dir = p.join(cs.getSystemPath(SystemPath.USER_DATA), "BeneGToolkit");
            ensureDir(dir);
            return dir;
        } catch (e) { return null; }
    }

    /*
     * The installed version, read out of CSXS/manifest.xml.
     *
     * The manifest has to be bumped for a release anyway - After Effects reads
     * it - so taking the number from there keeps one source of truth instead of
     * a second file that can drift out of step.
     */
    function localVersion() {
        try {
            var p = pathMod().join(extRoot(), "CSXS", "manifest.xml");
            var xml = fs().readFileSync(p, "utf8");
            var m = xml.match(/ExtensionBundleVersion\s*=\s*"([^"]+)"/);
            if (m) return m[1];
        } catch (e) {}

        // Fallback: ask CEP itself
        try {
            var list = cs.getExtensions();
            if (list && list.length && list[0].version) return list[0].version;
        } catch (e) {}

        return "0.0.0";
    }

    /* Loads update.json over the defaults, if it is there. */
    function loadConfig() {
        try {
            var p = pathMod().join(extRoot(), "update.json");
            if (!fs().existsSync(p)) return;
            var cfg = JSON.parse(fs().readFileSync(p, "utf8"));
            for (var k in cfg) {
                if (CONFIG.hasOwnProperty(k)) CONFIG[k] = cfg[k];
            }
        } catch (e) { /* a broken config must not stop the panel loading */ }
    }


    /* ==================================================================
       PERSISTED UPDATER STATE

       Kept in settings.json next to the presets rather than in
       localStorage, which CEP panels routinely lose across restarts -
       exactly when "remind me tomorrow" needs to still be true.
       ================================================================== */
    function loadState() {
        if (state) return state;
        state = {};
        try {
            var s = PresetLibrary.loadSettings();
            if (s && s[STATE_KEY] && typeof s[STATE_KEY] === "object") {
                state = s[STATE_KEY];
            }
        } catch (e) {}
        if (typeof state.autoCheck !== "boolean") state.autoCheck = true;
        return state;
    }

    function saveState() {
        try { PresetLibrary.saveSetting(STATE_KEY, loadState()); } catch (e) {}
    }


    /* ==================================================================
       VERSION COMPARISON

       Numeric segments compared left to right; a pre-release suffix
       (1.2.0-beta.1) sorts below the plain release, matching semver.
       ================================================================== */
    function parseVer(v) {
        var s = String(v || "0").replace(/^[vV]/, "");
        var parts = s.split("-");
        var nums = parts[0].split(".");
        var out = { nums: [], pre: parts.length > 1 ? parts.slice(1).join("-") : "" };
        for (var i = 0; i < 3; i++) {
            var n = parseInt(nums[i], 10);
            out.nums.push(isNaN(n) ? 0 : n);
        }
        return out;
    }

    /* Returns >0 when a is newer than b, <0 when older, 0 when equal. */
    function cmpVer(a, b) {
        var x = parseVer(a), y = parseVer(b);
        for (var i = 0; i < 3; i++) {
            if (x.nums[i] !== y.nums[i]) return x.nums[i] - y.nums[i];
        }
        if (x.pre === y.pre) return 0;
        if (!x.pre) return 1;      // 1.2.0 beats 1.2.0-beta
        if (!y.pre) return -1;
        return x.pre < y.pre ? -1 : 1;
    }


    /* ==================================================================
       HTTPS

       GitHub rejects requests without a User-Agent, and asset downloads
       redirect to a storage host, so both are handled here.
       ================================================================== */
    var UA = "BeneGToolkit-Updater";

    function get(url, opts, cb) {
        opts = opts || {};
        var depth = opts._depth || 0;

        /*
         * Every path out of here goes through once().
         *
         * Aborting on timeout also makes the request emit an error, so the
         * old code reported the same download as failed twice - and if the
         * abort raced a finished response, it reported a success and then a
         * failure. The dialog believed whichever arrived last.
         */
        var settled = false;
        function once(err, data) {
            if (settled) return;
            settled = true;
            cb(err, data);
        }

        if (depth > 5) { once(new Error("Too many redirects")); return; }

        var headers = { "User-Agent": UA };
        if (opts.json) headers["Accept"] = "application/vnd.github+json";

        /*
         * https.get(url, options, callback) - the three-argument form - only
         * exists from Node 10.9. CEP 9, which is what After Effects 2019 and
         * 2020 run, ships an older Node: there the second argument is taken
         * as the callback and the real one is dropped, so the response never
         * reaches us and the dialog sits on "Checking for updates" forever.
         * Parsing the URL ourselves and handing over a single options object
         * is the call every Node version has understood since 0.10.
         */
        var parsed;
        try { parsed = urlMod().parse(url); }
        catch (e) { once(e); return; }

        var mod = (parsed.protocol === "http:") ? http() : https();
        if (!mod) { once(new Error("no network module")); return; }

        var reqOpts = {
            protocol: parsed.protocol,
            hostname: parsed.hostname,
            port: parsed.port,
            path: parsed.path,
            headers: headers
        };

        var request;
        try {
            request = mod.get(reqOpts, function (res) {
                var code = res.statusCode;

                // Follow redirects - asset URLs always send one
                if (code >= 300 && code < 400 && res.headers.location) {
                    res.resume();
                    var next = res.headers.location;
                    get(next, {
                        json: opts.json,
                        onProgress: opts.onProgress,
                        _depth: depth + 1
                    }, once);
                    return;
                }

                if (code !== 200) {
                    res.resume();
                    once(httpError(code, res.headers));
                    return;
                }

                var total = parseInt(res.headers["content-length"] || "0", 10);
                var got = 0;
                var chunks = [];

                res.on("data", function (chunk) {
                    chunks.push(chunk);
                    got += chunk.length;
                    if (opts.onProgress) opts.onProgress(got, total);
                });
                res.on("end", function () {
                    once(null, Buffer.concat(chunks));
                });
                res.on("error", function (e) { once(e); });
            });
        } catch (e) {
            once(e);
            return;
        }

        request.on("error", function (e) { once(e); });
        request.setTimeout(30000, function () {
            try { request.abort(); } catch (e) {}
            once(new Error("timeout"));
        });
    }

    /* Turns an HTTP status into something worth showing a user. */
    function httpError(code, headers) {
        var e = new Error("HTTP " + code);
        e.status = code;
        if (code === 403 && headers && headers["x-ratelimit-remaining"] === "0") {
            e.rateLimited = true;
        }
        if (code === 404) e.notFound = true;
        return e;
    }

    function getJson(url, cb) {
        get(url, { json: true }, function (err, buf) {
            if (err) { cb(err); return; }

            /*
             * Only the parse is guarded. Wrapping cb() as well would relabel
             * any exception thrown while handling the release as a malformed
             * response, and then deliver cb a second time - so a bug in the
             * dialog would surface as "GitHub sent nonsense", which is a lie
             * that costs an afternoon to see through.
             */
            var data;
            try { data = JSON.parse(buf.toString("utf8")); }
            catch (e) { cb(e); return; }

            cb(null, data);
        });
    }


    /* ==================================================================
       RELEASE LOOKUP
       ================================================================== */

    /*
     * Picks the release to offer.
     *
     * With pre-releases off, /releases/latest is exactly the right endpoint -
     * GitHub already excludes drafts and pre-releases from it. With them on we
     * have to list releases and take the newest ourselves.
     */
    function fetchLatest(cb) {
        var base = "https://api.github.com/repos/" +
                   encodeURIComponent(CONFIG.owner) + "/" +
                   encodeURIComponent(CONFIG.repo);

        if (!CONFIG.allowPrerelease) {
            getJson(base + "/releases/latest", function (err, rel) {
                if (err) { cb(err); return; }
                cb(null, normalizeRelease(rel));
            });
            return;
        }

        getJson(base + "/releases?per_page=20", function (err, list) {
            if (err) { cb(err); return; }
            if (!list || !list.length) { cb(null, null); return; }

            var best = null;
            for (var i = 0; i < list.length; i++) {
                if (list[i].draft) continue;
                var r = normalizeRelease(list[i]);
                if (!best || cmpVer(r.version, best.version) > 0) best = r;
            }
            cb(null, best);
        });
    }

    function normalizeRelease(rel) {
        if (!rel) return null;

        var tag = rel.tag_name || rel.name || "";
        var out = {
            version: String(tag).replace(/^[vV]/, ""),
            tag: tag,
            name: rel.name || tag,
            notes: rel.body || "",
            date: rel.published_at || rel.created_at || "",
            prerelease: !!rel.prerelease,
            pageUrl: rel.html_url || "",
            zipUrl: null,
            zipSize: 0,
            fromSource: false
        };

        // Prefer an attached zip asset
        var assets = rel.assets || [];
        var pick = null;
        var i;

        if (CONFIG.assetMatch) {
            for (i = 0; i < assets.length; i++) {
                var n = String(assets[i].name || "");
                if (n.toLowerCase().indexOf(String(CONFIG.assetMatch).toLowerCase()) > -1 &&
                    /\.zip$/i.test(n)) { pick = assets[i]; break; }
            }
        }
        if (!pick) {
            for (i = 0; i < assets.length; i++) {
                if (/\.zip$/i.test(String(assets[i].name || ""))) { pick = assets[i]; break; }
            }
        }

        if (pick) {
            out.zipUrl = pick.browser_download_url;
            out.zipSize = pick.size || 0;
        } else if (rel.zipball_url) {
            /*
             * No asset attached, so fall back to the source zipball. It carries
             * a "<repo>-<sha>/" wrapper folder, which the unpacker strips.
             */
            out.zipUrl = rel.zipball_url;
            out.fromSource = true;
        }

        return out;
    }


    /* ==================================================================
       ZIP READER (central directory + zlib inflate + CRC check)
       ================================================================== */

    var CRC_TABLE = null;
    function crcTable() {
        if (CRC_TABLE) return CRC_TABLE;
        CRC_TABLE = [];
        for (var n = 0; n < 256; n++) {
            var c = n;
            for (var k = 0; k < 8; k++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            CRC_TABLE[n] = c >>> 0;
        }
        return CRC_TABLE;
    }

    function crc32(buf) {
        var t = crcTable();
        var c = 0xFFFFFFFF;
        for (var i = 0; i < buf.length; i++) {
            c = t[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
        }
        return (c ^ 0xFFFFFFFF) >>> 0;
    }

    var SIG_EOCD = 0x06054b50;
    var SIG_CD = 0x02014b50;
    var SIG_LOCAL = 0x04034b50;

    function unzip(buf) {
        var Z = zlib();

        // The end-of-central-directory record sits at the tail, after an
        // optional comment of up to 64KB - so scan backwards for it.
        var eocd = -1;
        var floor = Math.max(0, buf.length - 66000);
        for (var i = buf.length - 22; i >= floor; i--) {
            if (buf.readUInt32LE(i) === SIG_EOCD) { eocd = i; break; }
        }
        if (eocd < 0) throw new Error("not a zip file");

        var count = buf.readUInt16LE(eocd + 10);
        var cdOff = buf.readUInt32LE(eocd + 16);
        if (cdOff === 0xFFFFFFFF || count === 0xFFFF) {
            throw new Error("zip64 archives are not supported");
        }

        var entries = [];
        var p = cdOff;

        for (var n = 0; n < count; n++) {
            if (p + 46 > buf.length || buf.readUInt32LE(p) !== SIG_CD) break;

            var method = buf.readUInt16LE(p + 10);
            var crc = buf.readUInt32LE(p + 16);
            var compSize = buf.readUInt32LE(p + 20);
            var rawSize = buf.readUInt32LE(p + 24);
            var nameLen = buf.readUInt16LE(p + 28);
            var extraLen = buf.readUInt16LE(p + 30);
            var cmtLen = buf.readUInt16LE(p + 32);
            var localOff = buf.readUInt32LE(p + 42);
            var name = buf.toString("utf8", p + 46, p + 46 + nameLen);

            p += 46 + nameLen + extraLen + cmtLen;

            // Directory entry - nothing to inflate
            if (name.charAt(name.length - 1) === "/") continue;

            if (compSize === 0xFFFFFFFF || rawSize === 0xFFFFFFFF) {
                throw new Error("zip64 archives are not supported");
            }
            if (buf.readUInt32LE(localOff) !== SIG_LOCAL) {
                throw new Error("damaged archive at " + name);
            }

            /*
             * Sizes come from the central directory, not the local header: with
             * a streamed zip (general purpose bit 3) the local header carries
             * zeros and the real values arrive in a trailing descriptor.
             */
            var lNameLen = buf.readUInt16LE(localOff + 26);
            var lExtraLen = buf.readUInt16LE(localOff + 28);
            var start = localOff + 30 + lNameLen + lExtraLen;
            var raw = buf.slice(start, start + compSize);

            var data;
            if (method === 0) data = raw;
            else if (method === 8) data = Z.inflateRawSync(raw);
            else throw new Error("unsupported compression in " + name);

            if (data.length !== rawSize || crc32(data) !== crc) {
                throw new Error("checksum failed on " + name);
            }

            entries.push({ path: name.replace(/\\/g, "/"), data: data });
        }

        if (!entries.length) throw new Error("archive is empty");
        return entries;
    }

    /*
     * Drops a single wrapper folder if every entry shares one.
     *
     * A zipball from GitHub is wrapped in "<repo>-<sha>/", and a hand-made zip
     * is often wrapped in "BeneGToolkit/". Either way the manifest has to end
     * up at CSXS/manifest.xml, so the shared first segment comes off.
     */
    function stripWrapper(entries) {
        var first = null;
        for (var i = 0; i < entries.length; i++) {
            var seg = entries[i].path.split("/")[0];
            if (entries[i].path.indexOf("/") === -1) return entries;   // file at root
            if (first === null) first = seg;
            else if (seg !== first) return entries;                    // no shared root
        }
        if (!first) return entries;

        var out = [];
        for (var j = 0; j < entries.length; j++) {
            out.push({
                path: entries[j].path.substring(first.length + 1),
                data: entries[j].data
            });
        }
        return out;
    }

    /* A release has to look like this panel before it is allowed to install. */
    function validate(entries) {
        var need = { "CSXS/manifest.xml": false, "index.html": false };
        for (var i = 0; i < entries.length; i++) {
            if (need.hasOwnProperty(entries[i].path)) need[entries[i].path] = true;
        }
        for (var k in need) {
            if (!need[k]) throw new Error("the archive is missing " + k);
        }
    }


    /* ==================================================================
       FILE HELPERS
       ================================================================== */
    /*
     * mkdirSync(dir, {recursive:true}) needs Node 10.12. On CEP 9 the options
     * object is read as a file mode instead, no parent folder is created, and
     * the call throws ENOENT - which is why pressing Install on After Effects
     * 2020 did nothing at all: this returned false and the caller gave up in
     * silence. Walking up the path by hand works on every Node.
     */
    function ensureDir(dir) {
        var f = fs(), p = pathMod();
        if (!f || !p || !dir) return false;
        try {
            if (f.existsSync(dir)) return true;
            var parent = p.dirname(dir);
            if (parent && parent !== dir) ensureDir(parent);
            f.mkdirSync(dir);
            return true;
        } catch (e) {
            // A parallel create is fine - only a still-missing folder is a failure
            try { return f.existsSync(dir); } catch (e2) { return false; }
        }
    }

    function isKept(rel) {
        for (var i = 0; i < CONFIG.keep.length; i++) {
            var k = String(CONFIG.keep[i]).replace(/\\/g, "/");
            if (rel === k || rel.indexOf(k + "/") === 0) return true;
        }
        /*
         * Never let an archive reach outside the extension folder. The drive
         * letter matters as much as the leading slash - "C:/Windows/..." is
         * just as absolute, and charAt(0) alone waved it through.
         */
        if (rel.indexOf("..") > -1) return true;
        if (rel.charAt(0) === "/" || /^[a-zA-Z]:/.test(rel)) return true;
        return false;
    }

    /* Writes with a couple of retries - a file briefly held open is common. */
    function writeRetry(file, data) {
        var last = null;
        for (var attempt = 0; attempt < 3; attempt++) {
            try { fs().writeFileSync(file, data); return; }
            catch (e) { last = e; sleep(120); }
        }
        throw last;
    }

    /* Deliberately synchronous - the install must not interleave. */
    function sleep(ms) {
        var end = Date.now() + ms;
        while (Date.now() < end) { /* spin */ }
    }

    function copyTree(src, dst, skipRel) {
        var f = fs(), p = pathMod();
        ensureDir(dst);
        var names = f.readdirSync(src);
        for (var i = 0; i < names.length; i++) {
            var name = names[i];
            var from = p.join(src, name);
            var to = p.join(dst, name);
            var rel = name;
            if (skipRel && skipRel(rel)) continue;
            var st = f.statSync(from);
            if (st.isDirectory()) copyTree(from, to, null);
            else f.writeFileSync(to, f.readFileSync(from));
        }
    }

    function rmTree(dir) {
        var f = fs(), p = pathMod();
        if (!f.existsSync(dir)) return;
        var names = f.readdirSync(dir);
        for (var i = 0; i < names.length; i++) {
            var full = p.join(dir, names[i]);
            try {
                if (f.statSync(full).isDirectory()) rmTree(full);
                else f.unlinkSync(full);
            } catch (e) {}
        }
        try { f.rmdirSync(dir); } catch (e) {}
    }

    /* True when the extension folder can actually be written to. */
    function canWriteExtension() {
        try {
            var probe = pathMod().join(extRoot(), ".write-test");
            fs().writeFileSync(probe, "ok", "utf8");
            fs().unlinkSync(probe);
            return true;
        } catch (e) { return false; }
    }


    /* ==================================================================
       INSTALL
       ================================================================== */

    /*
     * Copies the three user files aside before anything is written.
     *
     * They live outside the extension folder and are not in the archive, so in
     * principle they cannot be touched. This is belt and braces: if any of them
     * is gone once the install finishes, it is put straight back.
     */
    function snapshotUserData() {
        var f = fs(), p = pathMod();
        var dir = dataRoot();
        var snap = {};
        var names = ["presets.json", "colors.json", "settings.json"];
        for (var i = 0; i < names.length; i++) {
            try {
                var full = p.join(dir, names[i]);
                if (f.existsSync(full)) snap[names[i]] = f.readFileSync(full);
            } catch (e) {}
        }
        return snap;
    }

    function restoreUserData(snap) {
        var f = fs(), p = pathMod();
        var dir = dataRoot();
        for (var name in snap) {
            try {
                var full = p.join(dir, name);
                var missing = !f.existsSync(full);
                if (!missing) {
                    // Present but unreadable counts as missing
                    try { JSON.parse(f.readFileSync(full, "utf8")); }
                    catch (e) { missing = true; }
                }
                if (missing) f.writeFileSync(full, snap[name]);
            } catch (e) {}
        }
    }

    /* Full copy of the current extension folder, kept under USER_DATA. */
    function backupExtension(version) {
        var p = pathMod();
        var stamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
        var dir = p.join(dataRoot(), "backups", version + "_" + stamp);
        copyTree(extRoot(), dir, function (rel) { return rel === ".write-test"; });
        pruneBackups(2);
        return dir;
    }

    /* Keeps only the newest few backups - they are ~1.5MB each. */
    function pruneBackups(keep) {
        try {
            var f = fs(), p = pathMod();
            var root = p.join(dataRoot(), "backups");
            if (!f.existsSync(root)) return;
            /*
             * Sorted on the timestamp, not the whole folder name. A plain
             * sort() is alphabetical, so 1.10.0 landed before 1.9.0 and the
             * pruning could throw away the newer backup of the two. The stamp
             * is ISO, which sorts correctly as text.
             */
            var names = f.readdirSync(root).sort(function (a, b) {
                var x = a.split("_").slice(1).join("_");
                var y = b.split("_").slice(1).join("_");
                return x < y ? -1 : (x > y ? 1 : 0);
            });
            for (var i = 0; i < names.length - keep; i++) {
                rmTree(p.join(root, names[i]));
            }
        } catch (e) {}
    }

    /*
     * The file list from the previous install.
     *
     * Pruning is limited to files this updater put there itself. Anything the
     * user dropped into the folder survives, and the very first update - when
     * no list exists yet - deletes nothing at all.
     */
    function readInstalledList() {
        try {
            var p = pathMod().join(extRoot(), ".installed.json");
            if (!fs().existsSync(p)) return null;
            var d = JSON.parse(fs().readFileSync(p, "utf8"));
            return (d && isArray(d.files)) ? d.files : null;
        } catch (e) { return null; }
    }

    /*
     * "instanceof Array" would do here in the panel, but it answers false for
     * an array that came from another JavaScript realm - and getting that
     * wrong silently turns pruning off rather than throwing, which is the kind
     * of bug that only shows up as files piling up months later.
     */
    function isArray(v) {
        return Object.prototype.toString.call(v) === "[object Array]";
    }

    function writeInstalledList(version, files) {
        try {
            var p = pathMod().join(extRoot(), ".installed.json");
            fs().writeFileSync(p, JSON.stringify({
                version: version,
                installedAt: new Date().toISOString(),
                files: files
            }, null, 2), "utf8");
        } catch (e) {}
    }

    /*
     * Writes the archive over the extension folder.
     *
     * Order matters: back up first, then write, then prune. If a write throws
     * halfway through, the backup goes back and the panel is exactly as it was.
     */
    function installEntries(entries, newVersion, onStep) {
        var f = fs(), p = pathMod();
        var root = extRoot();
        var oldVersion = localVersion();

        onStep("backup");
        var snap = snapshotUserData();
        var backup = backupExtension(oldVersion);

        var written = [];
        try {
            onStep("write");
            for (var i = 0; i < entries.length; i++) {
                var rel = entries[i].path;
                if (isKept(rel)) continue;

                var target = p.join(root, rel);
                ensureDir(p.dirname(target));
                writeRetry(target, entries[i].data);
                written.push(rel);
            }
        } catch (e) {
            /*
             * Put everything back and report the original failure.
             *
             * Copying the backup over the top restores what was there, but it
             * cannot remove what was not: files the half-finished release had
             * added stayed behind, leaving the old version running with a few
             * strangers in its folder. So anything written that the backup has
             * no copy of goes as well.
             */
            onStep("rollback");
            try { copyTree(backup, root, null); } catch (e2) {}
            for (var r = 0; r < written.length; r++) {
                try {
                    if (!f.existsSync(p.join(backup, written[r]))) {
                        f.unlinkSync(p.join(root, written[r]));
                    }
                } catch (e3) {}
            }
            restoreUserData(snap);
            e.rolledBack = true;
            throw e;
        }

        /*
         * Remove files the previous release installed and this one does not
         * ship any more - a renamed script would otherwise linger and keep
         * showing up in the After Effects Scripts menu.
         */
        onStep("prune");
        var previous = readInstalledList();
        if (previous) {
            var shipped = {};
            for (var s = 0; s < written.length; s++) shipped[written[s]] = true;

            for (var q = 0; q < previous.length; q++) {
                var old = previous[q];
                if (shipped[old] || isKept(old)) continue;
                try {
                    var victim = p.join(root, old);
                    if (f.existsSync(victim) && f.statSync(victim).isFile()) f.unlinkSync(victim);
                } catch (e3) {}
            }
        }

        writeInstalledList(newVersion, written);
        restoreUserData(snap);

        onStep("scripts");
        var synced = syncShortcutScripts(entries);

        return { backup: backup, files: written.length, scripts: synced };
    }

    /*
     * Refreshes the shortcut scripts wherever the user installed them.
     *
     * scripts/*.jsx are meant to be copied into the After Effects Scripts
     * folder by hand, so a plain extension update would leave stale copies
     * behind - and a script added in a new release would never appear at all.
     * Any Scripts folder already holding _BeneGToolkit_Panel.jsx is treated as
     * one the user set up, and gets the full current set. Folders that were
     * never set up are left alone: dropping files into After Effects
     * uninvited is not this updater's business.
     */
    function syncShortcutScripts(entries) {
        var f = fs(), p = pathMod();
        var count = 0;

        var targets = findScriptFolders();
        if (!targets.length) return 0;

        // Every scripts/* file from the archive
        var payload = [];
        for (var i = 0; i < entries.length; i++) {
            var rel = entries[i].path;
            if (rel.indexOf("scripts/") !== 0) continue;
            if (rel.split("/").length !== 2) continue;      // no nested folders
            payload.push({ name: rel.substring(8), data: entries[i].data });
        }
        if (!payload.length) return 0;

        for (var t = 0; t < targets.length; t++) {
            for (var j = 0; j < payload.length; j++) {
                try {
                    f.writeFileSync(p.join(targets[t], payload[j].name), payload[j].data);
                    count++;
                } catch (e) { /* a locked or read-only folder is skipped */ }
            }
            // Retire scripts that no longer ship
            try { pruneScriptFolder(targets[t], payload); } catch (e) {}
        }
        return count;
    }

    /* Scripts folders that already contain the toolkit's shared loader. */
    function findScriptFolders() {
        var f = fs(), p = pathMod();
        var found = [];
        var roots = [];

        try {
            // process.platform is Node's answer and does not depend on the
            // user agent string, which CEP builds differ on
            var isWin = (typeof process !== "undefined" && process.platform)
                ? process.platform === "win32"
                : (navigator.platform || "").toLowerCase().indexOf("win") > -1;
            var home = process.env.HOME || process.env.USERPROFILE || "";

            if (isWin) {
                var appdata = process.env.APPDATA || p.join(home, "AppData", "Roaming");
                roots.push(p.join(appdata, "Adobe", "After Effects"));
                roots.push("C:\\Program Files\\Adobe");
            } else {
                roots.push(p.join(home, "Library", "Preferences", "Adobe", "After Effects"));
                roots.push("/Applications");
            }
        } catch (e) {}

        /*
         * The version folder in between is unknown, so each root is walked two
         * levels down looking for a Scripts folder. Two levels covers both
         * ".../After Effects/24.0/Scripts" and
         * ".../Adobe After Effects 2024/Support Files/Scripts".
         */
        function scan(dir, depth) {
            if (depth > 3) return;
            var names;
            try { names = fs().readdirSync(dir); } catch (e) { return; }

            for (var i = 0; i < names.length; i++) {
                var full = p.join(dir, names[i]);
                try {
                    if (!f.statSync(full).isDirectory()) continue;
                } catch (e) { continue; }

                if (names[i] === "Scripts") {
                    if (f.existsSync(p.join(full, "_BeneGToolkit_Panel.jsx"))) {
                        found.push(full);
                    }
                    continue;
                }
                scan(full, depth + 1);
            }
        }

        for (var r = 0; r < roots.length; r++) {
            if (f.existsSync(roots[r])) scan(roots[r], 0);
        }
        return found;
    }

    /* Removes BeneGToolkit scripts from a folder when the release dropped them. */
    function pruneScriptFolder(dir, payload) {
        var f = fs(), p = pathMod();
        var current = {};
        for (var i = 0; i < payload.length; i++) current[payload[i].name] = true;

        var names = f.readdirSync(dir);
        for (var j = 0; j < names.length; j++) {
            var n = names[j];
            if (n.indexOf("BeneGToolkit") !== 0 && n.indexOf("_BeneGToolkit") !== 0) continue;
            if (!/\.jsx$/i.test(n)) continue;
            if (current[n]) continue;
            try { f.unlinkSync(p.join(dir, n)); } catch (e) {}
        }
    }


    /* ==================================================================
       INSTALLING THE SHORTCUT SCRIPTS FOR THE FIRST TIME

       findScriptFolders above deliberately only finds folders the user
       already set up, because an update has no business creating them.
       The Settings button does though - that is the user asking for it -
       so this half locates the folders whether or not they exist yet.
       ================================================================== */

    /*
     * Asks the running After Effects where its preferences live.
     *
     * Guessing %APPDATA% from Node would usually work, but After Effects is
     * the authority on its own preferences folder, and it also knows which
     * version is running - which is the folder the user actually wants the
     * scripts in. Falling back to the guess keeps the button working if
     * evalScript comes back empty.
     */
    function askHostPaths(cb) {
        var script =
            '(function(){try{return Folder.userData.fsName+"||"+app.version;}' +
            'catch(e){return "";}})()';

        /*
         * Guarded against answering twice.
         *
         * The try/catch below cannot tell an evalScript that failed to start
         * from one whose callback threw - both surface as an exception here.
         * Without the latch, an error anywhere downstream of cb would run the
         * whole caller a second time, which for the script installer means
         * copying everything twice and reporting it twice.
         */
        var answered = false;
        function answer(base, version) {
            if (answered) return;
            answered = true;
            cb(base, version);
        }

        try {
            cs.evalScript(script, function (res) {
                var base = null, version = null;
                if (res && String(res).indexOf("||") > -1) {
                    var parts = String(res).split("||");
                    base = parts[0] || null;
                    version = versionFolder(parts[1]);
                }
                answer(base, version);
            });
        } catch (e) { answer(null, null); }
    }

    /*
     * "25.1.0x36" -> "25.1", which is how After Effects names its preferences
     * folder. Only the first two numbers are used; the build suffix never
     * appears in the folder name.
     */
    function versionFolder(appVersion) {
        var m = String(appVersion || "").match(/^(\d+)\.(\d+)/);
        return m ? (m[1] + "." + m[2]) : null;
    }

    /* The After Effects preferences root, per user, for this platform. */
    function prefsRoot(hostBase) {
        var p = pathMod();
        if (hostBase) return p.join(hostBase, "Adobe", "After Effects");

        try {
            var isWin = (typeof process !== "undefined" && process.platform)
                ? process.platform === "win32"
                : (navigator.platform || "").toLowerCase().indexOf("win") > -1;
            var home = process.env.HOME || process.env.USERPROFILE || "";

            if (isWin) {
                var appdata = process.env.APPDATA || p.join(home, "AppData", "Roaming");
                return p.join(appdata, "Adobe", "After Effects");
            }
            return p.join(home, "Library", "Preferences", "Adobe", "After Effects");
        } catch (e) { return null; }
    }

    /*
     * Every per-user Scripts folder the scripts could go into.
     *
     * Only version folders After Effects itself created are considered, so a
     * version the user does not have never gets one invented for it. The
     * system-wide folder under Program Files is left out on purpose - it needs
     * administrator rights, and the per-user folder works identically without
     * asking anyone for a password.
     */
    function scriptTargets(hostBase, runningVersion) {
        var f = fs(), p = pathMod();
        var root = prefsRoot(hostBase);
        var out = [];
        if (!root) return out;

        var names = [];
        try { names = f.readdirSync(root); } catch (e) { return out; }

        for (var i = 0; i < names.length; i++) {
            // Version folders are numeric - "24.0", "25.1". Anything else is
            // not a preferences folder for a release of After Effects.
            if (!/^\d+(\.\d+)*$/.test(names[i])) continue;

            var dir = p.join(root, names[i]);
            try { if (!f.statSync(dir).isDirectory()) continue; } catch (e) { continue; }

            var scripts = p.join(dir, "Scripts");
            out.push({
                dir: scripts,
                version: names[i],
                running: (runningVersion === names[i]),
                installed: f.existsSync(p.join(scripts, "_BeneGToolkit_Panel.jsx"))
            });
        }

        // The running version first, then newest to oldest
        out.sort(function (a, b) {
            if (a.running !== b.running) return a.running ? -1 : 1;
            return cmpVer(b.version, a.version);
        });
        return out;
    }

    /* The scripts as they sit in the extension folder right now. */
    function readOwnScripts() {
        var f = fs(), p = pathMod();
        var dir = p.join(extRoot(), "scripts");
        var out = [];
        var names;
        try { names = f.readdirSync(dir); } catch (e) { return out; }

        for (var i = 0; i < names.length; i++) {
            if (!/\.jsx$/i.test(names[i])) continue;
            try { out.push({ name: names[i], data: f.readFileSync(p.join(dir, names[i])) }); }
            catch (e) {}
        }
        return out;
    }

    /*
     * Copies the scripts into every After Effects version found.
     *
     * All of them rather than only the running one: someone with two versions
     * installed wants the shortcuts in both, and the files are inert - each
     * one only loads the panel when After Effects runs it - so a copy sitting
     * in a version they rarely open costs nothing.
     */
    function installShortcutScripts(cb) {
        var payload = readOwnScripts();
        if (!payload.length) {
            cb({ ok: false, reason: "noScripts" });
            return;
        }

        askHostPaths(function (hostBase, runningVersion) {
            var targets = scriptTargets(hostBase, runningVersion);
            if (!targets.length) {
                cb({ ok: false, reason: "noTarget" });
                return;
            }

            var files = 0, versions = [], failed = null;

            for (var t = 0; t < targets.length; t++) {
                if (!ensureDir(targets[t].dir)) { failed = targets[t].dir; continue; }

                var wrote = 0;
                for (var i = 0; i < payload.length; i++) {
                    try {
                        writeRetry(pathMod().join(targets[t].dir, payload[i].name), payload[i].data);
                        wrote++;
                    } catch (e) { failed = e.message || String(e); }
                }
                if (wrote) {
                    files += wrote;
                    versions.push(targets[t].version);
                    /*
                     * Retire scripts an earlier version put there and this one
                     * no longer ships. Without this, a renamed script sits in
                     * the Scripts menu next to its replacement and both look
                     * equally current.
                     */
                    try { pruneScriptFolder(targets[t].dir, payload); } catch (e) {}
                }
            }

            cb({
                ok: files > 0,
                files: files,
                versions: versions,
                reason: files ? null : "writeFailed",
                detail: failed
            });
        });
    }

    /* One line describing where the scripts currently are, for Settings. */
    function scriptStatus(cb) {
        askHostPaths(function (hostBase, runningVersion) {
            var targets = scriptTargets(hostBase, runningVersion);
            var have = [];
            for (var i = 0; i < targets.length; i++) {
                if (targets[i].installed) have.push(targets[i].version);
            }
            cb(have, targets.length);
        });
    }


    /* ==================================================================
       RELEASE NOTES RENDERING

       A deliberately small subset of Markdown. Everything is escaped
       first, so a release body cannot inject markup into the panel.
       ================================================================== */
    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function renderNotes(md) {
        if (!md || !String(md).replace(/\s/g, "")) {
            return '<p class="upd-empty">' + escapeHtml(I18N.t("upd.noNotes")) + "</p>";
        }

        var lines = String(md).replace(/\r/g, "").split("\n");
        var html = [];
        var inList = false;

        function closeList() {
            if (inList) { html.push("</ul>"); inList = false; }
        }

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var trimmed = line.replace(/^\s+|\s+$/g, "");

            if (!trimmed) { closeList(); continue; }

            var head = trimmed.match(/^(#{1,6})\s+(.*)$/);
            if (head) {
                closeList();
                html.push('<div class="upd-h">' + inline(head[2]) + "</div>");
                continue;
            }

            var item = trimmed.match(/^[-*+]\s+(.*)$/);
            if (item) {
                if (!inList) { html.push('<ul class="upd-ul">'); inList = true; }
                html.push("<li>" + inline(item[1]) + "</li>");
                continue;
            }

            var num = trimmed.match(/^\d+[.)]\s+(.*)$/);
            if (num) {
                if (!inList) { html.push('<ul class="upd-ul">'); inList = true; }
                html.push("<li>" + inline(num[1]) + "</li>");
                continue;
            }

            closeList();
            html.push("<p>" + inline(trimmed) + "</p>");
        }
        closeList();
        return html.join("");
    }

    /* Bold, code and links, applied after escaping. */
    function inline(text) {
        var s = escapeHtml(text);
        s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
        s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
        s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
                      '<a href="#" data-url="$2">$1</a>');
        s = s.replace(/(^|\s)(https?:\/\/[^\s<]+)/g,
                      '$1<a href="#" data-url="$2">$2</a>');
        return s;
    }

    function humanDate(iso) {
        if (!iso) return "";
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return "";
            return d.toLocaleDateString();
        } catch (e) { return ""; }
    }

    function humanSize(bytes) {
        if (!bytes) return "";
        if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " kB";
        return (bytes / 1024 / 1024).toFixed(1) + " MB";
    }


    /* ==================================================================
       MODAL
       ================================================================== */
    var el = {};      // cached nodes, filled by buildModal()

    /*
     * The dialog is built here rather than in index.html.
     *
     * Keeping the markup with the code means a future release only has to ship
     * this one file to change the update dialog, and an older index.html that
     * predates a layout change still works.
     */
    function buildModal() {
        if (el.overlay) return;

        var wrap = document.createElement("div");
        wrap.id = "updOverlay";
        wrap.className = "upd-overlay";
        wrap.innerHTML =
            '<div class="upd-panel" role="dialog" aria-modal="true">' +
              '<div class="upd-top">' +
                '<div class="upd-title" id="updTitle"></div>' +
                '<div class="upd-sub" id="updSub"></div>' +
              '</div>' +
              '<div class="upd-notes" id="updNotes"></div>' +
              '<div class="upd-track" id="updTrack"><div class="upd-bar" id="updBar"></div></div>' +
              '<div class="upd-msg" id="updMsg"></div>' +
              '<div class="upd-actions">' +
                '<button class="btn primary" id="updInstall"></button>' +
                '<button class="btn" id="updLater"></button>' +
                '<button class="btn" id="updSkip"></button>' +
                '<button class="btn" id="updClose"></button>' +
              '</div>' +
              '<div class="upd-foot"><a href="#" id="updPage"></a></div>' +
            '</div>';

        document.body.appendChild(wrap);

        el.overlay = wrap;
        el.title = document.getElementById("updTitle");
        el.sub = document.getElementById("updSub");
        el.notes = document.getElementById("updNotes");
        el.track = document.getElementById("updTrack");
        el.bar = document.getElementById("updBar");
        el.msg = document.getElementById("updMsg");
        el.install = document.getElementById("updInstall");
        el.later = document.getElementById("updLater");
        el.skip = document.getElementById("updSkip");
        el.close = document.getElementById("updClose");
        el.page = document.getElementById("updPage");

        el.install.addEventListener("click", onInstallClick);
        el.later.addEventListener("click", onLaterClick);
        el.skip.addEventListener("click", onSkipClick);
        el.close.addEventListener("click", hide);

        el.page.addEventListener("click", function (e) {
            e.preventDefault();
            if (latest && latest.pageUrl) openUrl(latest.pageUrl);
        });

        // Links inside the notes open in the real browser, not in the panel
        el.notes.addEventListener("click", function (e) {
            var url = e.target && e.target.getAttribute && e.target.getAttribute("data-url");
            if (url) { e.preventDefault(); openUrl(url); }
        });

        // Clicking the backdrop dismisses, unless an install is running
        wrap.addEventListener("click", function (e) {
            if (e.target === wrap && !busy) onLaterClick();
        });
    }

    function openUrl(url) {
        try { cs.openURLInDefaultBrowser(url); } catch (e) {}
    }

    function show() { buildModal(); el.overlay.classList.add("open"); }
    function hide() { if (el.overlay) el.overlay.classList.remove("open"); }

    function setMsg(text, kind) {
        if (!el.msg) return;
        el.msg.textContent = text || "";
        el.msg.className = "upd-msg" + (kind ? " " + kind : "");
    }

    function setProgress(pct) {
        if (!el.track) return;
        if (pct === null) {
            el.track.classList.remove("on");
            return;
        }
        el.track.classList.add("on");
        el.bar.style.width = Math.max(0, Math.min(100, pct)) + "%";
    }

    function buttons(cfg) {
        el.install.style.display = cfg.install ? "" : "none";
        el.later.style.display = cfg.later ? "" : "none";
        el.skip.style.display = cfg.skip ? "" : "none";
        el.close.style.display = cfg.close ? "" : "none";
    }

    /* The "there is a new version" state. */
    function showAvailable(rel) {
        latest = rel;
        buildModal();

        el.title.textContent = I18N.t("upd.available");

        var bits = [localVersion() + "  \u2192  " + rel.version];
        var when = humanDate(rel.date);
        if (when) bits.push(when);
        var size = humanSize(rel.zipSize);
        if (size) bits.push(size);
        if (rel.prerelease) bits.push(I18N.t("upd.prerelease"));
        el.sub.textContent = bits.join("   \u00b7   ");

        el.notes.innerHTML = renderNotes(rel.notes);
        el.notes.scrollTop = 0;

        el.install.textContent = I18N.t("upd.install");
        el.later.textContent = I18N.t("upd.later");
        el.skip.textContent = I18N.t("upd.skip");
        el.close.textContent = I18N.t("upd.close");
        el.page.textContent = I18N.t("upd.openRelease");

        buttons({ install: true, later: true, skip: true, close: false });
        setProgress(null);
        setMsg("");
        show();
    }

    /* The "already installed, here is what changed" state, after a restart. */
    function showWhatsNew(version, notes) {
        buildModal();
        latest = null;

        el.title.textContent = I18N.t("upd.updatedTo", version);
        el.sub.textContent = "";
        el.notes.innerHTML = renderNotes(notes);
        el.notes.scrollTop = 0;
        el.page.textContent = "";
        el.close.textContent = I18N.t("upd.gotIt");

        buttons({ install: false, later: false, skip: false, close: true });
        setProgress(null);
        setMsg("");
        show();
    }


    /* ==================================================================
       BUTTON HANDLERS
       ================================================================== */
    function onLaterClick() {
        if (busy) return;
        var st = loadState();
        st.postponedUntil = Date.now() + CONFIG.postponeHours * 3600 * 1000;
        delete st.skipVersion;
        saveState();
        hide();
        // Deliberately still showing: postponing silences the dialog, it does
        // not hide the fact that an update exists
        paintIndicator();
        status(I18N.t("upd.postponed"));
    }

    function onSkipClick() {
        if (busy) return;
        var st = loadState();
        if (latest) st.skipVersion = latest.version;
        delete st.postponedUntil;
        saveState();
        hide();
        // The record stays, but waitingUpdate() now ignores it, so the dot goes
        // out and Settings says the version was skipped rather than waiting
        paintIndicator();
        status(I18N.t("upd.skipped", latest ? latest.version : ""));
    }

    function onInstallClick() {
        if (busy || !latest || !latest.zipUrl) return;

        if (!canWriteExtension()) {
            setMsg(I18N.t("upd.noWriteAccess"), "err");
            buttons({ install: false, later: false, skip: false, close: true });
            if (latest.pageUrl) el.page.textContent = I18N.t("upd.openRelease");
            return;
        }

        busy = true;
        buttons({ install: false, later: false, skip: false, close: false });
        setMsg(I18N.t("upd.downloading"));
        setProgress(0);

        get(latest.zipUrl, {
            onProgress: function (got, total) {
                if (total) setProgress(got / total * 100);
                else setMsg(I18N.t("upd.downloadedBytes", humanSize(got)));
            }
        }, function (err, buf) {
            if (err) { fail(err); return; }

            // Give the progress bar a frame to paint before the sync work
            setProgress(100);
            setMsg(I18N.t("upd.unpacking"));
            window.setTimeout(function () { finishInstall(buf); }, 30);
        });
    }

    function finishInstall(buf) {
        var res;
        try {
            var entries = stripWrapper(unzip(buf));
            validate(entries);

            /*
             * The zip has to actually be the version the release promised.
             * Comparing the manifest inside the archive catches a wrong file
             * uploaded to the release before anything is overwritten.
             */
            var inZip = manifestVersion(entries);
            if (inZip && cmpVer(inZip, localVersion()) <= 0) {
                throw new Error(I18N.t("upd.notNewer", inZip, localVersion()));
            }

            res = installEntries(entries, latest.version, function (step) {
                setMsg(I18N.t("upd.step_" + step));
            });
        } catch (e) {
            fail(e);
            return;
        }

        // Remember what to show once After Effects comes back up
        var st = loadState();
        st.showNotesFor = latest.version;
        st.pendingNotes = latest.notes || "";
        delete st.postponedUntil;
        delete st.skipVersion;
        delete st.available;
        st.history = (st.history || []).slice(0, 19);
        st.history.unshift({
            version: latest.version,
            installedAt: new Date().toISOString(),
            notes: latest.notes || ""
        });
        saveState();

        busy = false;
        setProgress(null);
        el.title.textContent = I18N.t("upd.doneTitle", latest.version);
        el.sub.textContent = "";
        el.notes.innerHTML =
            '<p class="upd-ok">' + escapeHtml(I18N.t("upd.restartNeeded")) + "</p>" +
            '<p class="upd-dim">' + escapeHtml(I18N.t("upd.dataKept")) + "</p>" +
            (res.scripts
                ? '<p class="upd-dim">' + escapeHtml(I18N.t("upd.scriptsSynced", res.scripts)) + "</p>"
                : "") +
            '<p class="upd-dim">' + escapeHtml(I18N.t("upd.backupAt", res.backup)) + "</p>";
        setMsg("");
        el.close.textContent = I18N.t("upd.close");
        buttons({ install: false, later: false, skip: false, close: true });
        status(I18N.t("upd.doneStatus", latest.version));
    }

    /* Reads the version out of the archive's own manifest. */
    function manifestVersion(entries) {
        for (var i = 0; i < entries.length; i++) {
            if (entries[i].path !== "CSXS/manifest.xml") continue;
            var m = entries[i].data.toString("utf8")
                        .match(/ExtensionBundleVersion\s*=\s*"([^"]+)"/);
            return m ? m[1] : null;
        }
        return null;
    }

    function fail(err) {
        busy = false;
        setProgress(null);

        var text = friendlyError(err);
        if (err && err.rolledBack) text += " " + I18N.t("upd.rolledBack");

        setMsg(text, "err");
        el.close.textContent = I18N.t("upd.close");
        buttons({ install: !!latest, later: !!latest, skip: false, close: true });
        if (el.install) el.install.textContent = I18N.t("upd.retry");
        status(text, true);
    }

    function friendlyError(err) {
        var msg = (err && err.message) ? String(err.message) : String(err);

        if (err && err.rateLimited) return I18N.t("upd.errRateLimit");
        if (err && err.notFound) return I18N.t("upd.errNotFound");
        if (msg === "timeout") return I18N.t("upd.errTimeout");
        if (/ENOTFOUND|EAI_AGAIN|ENETUNREACH|ECONNREFUSED|ECONNRESET/.test(msg)) {
            return I18N.t("upd.errNetwork");
        }
        if (/EACCES|EPERM/.test(msg)) return I18N.t("upd.noWriteAccess");
        if (/ENOSPC/.test(msg)) return I18N.t("upd.errDiskFull");
        return I18N.t("upd.errGeneric", msg);
    }

    /* Writes to the panel's status line when it is available. */
    function status(text, isError) {
        try {
            if (typeof setStatus === "function") setStatus(text, isError);
        } catch (e) {}
    }


    /* ==================================================================
       CHECKING
       ================================================================== */

    /*
     * manual = the user pressed Check for updates, which reports every
     * outcome including "you are up to date" and ignores both the interval
     * and a skipped version. The automatic check stays quiet unless there
     * is something to show.
     */
    function check(manual) {
        if (busy) return;

        if (!nodeReady()) {
            if (manual) status(I18N.t("upd.errNoNode"), true);
            return;
        }

        var st = loadState();

        if (!manual) {
            if (!st.autoCheck) return;
            var wait = CONFIG.checkIntervalHours * 3600 * 1000;
            if (st.lastCheck && Date.now() - st.lastCheck < wait) return;
            if (st.postponedUntil && Date.now() < st.postponedUntil) return;
        }

        if (manual) {
            status(I18N.t("upd.checking"));
            setSettingsLine(I18N.t("upd.checking"));
        }

        fetchLatest(function (err, rel) {
            st.lastCheck = Date.now();
            saveState();

            if (err) {
                var text = friendlyError(err);
                if (manual) { status(text, true); setSettingsLine(text); }
                return;
            }

            if (!rel || !rel.version) {
                if (manual) {
                    status(I18N.t("upd.errNoRelease"), true);
                    setSettingsLine(I18N.t("upd.errNoRelease"));
                }
                return;
            }

            var current = localVersion();

            if (cmpVer(rel.version, current) <= 0) {
                // Clears any record from an earlier check, so the dot goes out
                rememberAvailable(null);
                if (manual) status(I18N.t("upd.upToDate", current));
                return;
            }

            if (!rel.zipUrl) {
                if (manual) {
                    status(I18N.t("upd.errNoAsset"), true);
                    setSettingsLine(I18N.t("upd.errNoAsset"));
                }
                return;
            }

            /*
             * The indicator is written even for a version the user skipped, so
             * that pressing Check for updates still tells them what is out
             * there. waitingUpdate() is what decides whether the dot lights up,
             * and it honours the skip.
             */
            rememberAvailable(rel);
            latest = rel;

            if (!manual && st.skipVersion && st.skipVersion === rel.version) return;

            showAvailable(rel);
        });
    }


    /* ==================================================================
       THE "UPDATE WAITING" INDICATOR

       A modal that has been dismissed leaves no trace, so on its own it
       cannot answer "is there an update?" ten minutes later. The answer
       is therefore kept in settings.json and painted in three places:
       the version in the sidebar, a dot on the Settings tab, and a line
       plus a button in Settings itself. All three read the same state, so
       they cannot disagree.
       ================================================================== */

    /*
     * Records what the last check found, or clears it.
     *
     * Only what is needed to describe the update is stored, not the download
     * URL: reopening the dialog re-checks, which avoids acting on an asset URL
     * saved days ago.
     */
    function rememberAvailable(rel) {
        var st = loadState();
        if (rel) {
            st.available = {
                version: rel.version,
                date: rel.date || "",
                prerelease: !!rel.prerelease
            };
        } else {
            delete st.available;
        }
        saveState();
        paintIndicator();
    }

    /*
     * The waiting update, if there is still one.
     *
     * Checked against the installed version every time rather than trusted:
     * after an install the panel restarts on the new version and a stale
     * record would otherwise keep the dot lit forever. A skipped version is
     * not a waiting one either.
     */
    function waitingUpdate() {
        var st = loadState();
        var a = st.available;
        if (!a || !a.version) return null;
        if (cmpVer(a.version, localVersion()) <= 0) return null;
        if (st.skipVersion === a.version) return null;
        return a;
    }

    function paintIndicator() {
        var a = waitingUpdate();
        var current = localVersion();

        /* --- sidebar --- */
        var side = document.getElementById("sidebarVersion");
        if (side) {
            if (a) {
                side.textContent = "\u25cf " + a.version;
                side.title = I18N.t("upd.foundVersion", a.version);
                side.classList.add("has-update");
                if (!side._wired) {
                    side._wired = true;
                    side.addEventListener("click", openWaiting);
                }
            } else {
                side.textContent = "v" + current;
                side.title = "";
                side.classList.remove("has-update");
            }
        }

        /* --- dot on the Settings tab --- */
        var dot = document.getElementById("navUpdateDot");
        if (dot) dot.classList[a ? "add" : "remove"]("on");

        /* --- Settings --- */
        var btn = document.getElementById("updOpenWaiting");
        if (btn) {
            btn.style.display = a ? "" : "none";
            if (a) {
                btn.textContent = I18N.t("upd.installVersion", a.version);
                if (!btn._wired) {
                    btn._wired = true;
                    btn.addEventListener("click", openWaiting);
                }
            }
        }

        var line = document.getElementById("updStatusLine");
        if (line) {
            var st = loadState();
            if (a) {
                line.textContent = I18N.t("upd.foundVersion", a.version);
                line.classList.add("is-update");
            } else {
                line.classList.remove("is-update");
                if (st.skipVersion) line.textContent = I18N.t("upd.skipped", st.skipVersion);
                else if (st.lastCheck) {
                    line.textContent = I18N.t("upd.upToDateOn", current,
                        humanDate(new Date(st.lastCheck).toISOString()));
                } else line.textContent = I18N.t("upd.neverChecked");
            }
        }
    }

    /*
     * Reopens the dialog for a waiting update.
     *
     * The release is re-fetched when it is not already in memory, since the
     * indicator may have been painted from a record written in an earlier
     * session and the download URL was deliberately not kept.
     */
    function openWaiting() {
        if (busy) return;
        if (latest && cmpVer(latest.version, localVersion()) > 0) {
            showAvailable(latest);
            return;
        }
        check(true);
    }


    /* ==================================================================
       SETTINGS PAGE WIRING
       ================================================================== */
    function setSettingsLine(text) {
        var node = document.getElementById("updStatusLine");
        if (node) node.textContent = text || "";
    }

    function setScriptLine(text) {
        var node = document.getElementById("updScriptsLine");
        if (node) node.textContent = text || "";
    }

    /*
     * The "install the shortcut scripts" button.
     *
     * Kept apart from the update flow: it writes outside the extension folder,
     * into After Effects itself, which is something to do only when asked
     * rather than as a side effect of an update.
     */
    function wireScriptButton() {
        var btn = document.getElementById("updInstallScripts");
        if (!btn) return;

        if (!nodeReady()) {
            btn.disabled = true;
            setScriptLine(I18N.t("upd.errNoNode"));
            return;
        }

        // Show where they already are, without making the user press anything
        refreshScriptLine();

        btn.addEventListener("click", function () {
            btn.disabled = true;
            setScriptLine(I18N.t("upd.scriptsWorking"));

            installShortcutScripts(function (res) {
                btn.disabled = false;

                if (res.ok) {
                    var where = res.versions.join(", ");
                    setScriptLine(I18N.t("upd.scriptsDone", res.files, where));
                    status(I18N.t("upd.scriptsDoneStatus", res.files));
                    return;
                }

                var msg;
                if (res.reason === "noTarget") msg = I18N.t("upd.scriptsNoTarget");
                else if (res.reason === "noScripts") msg = I18N.t("upd.scriptsMissing");
                else msg = I18N.t("upd.scriptsFailed", res.detail || "");

                setScriptLine(msg);
                status(msg, true);
            });
        });
    }

    function refreshScriptLine() {
        try {
            scriptStatus(function (have, total) {
                if (!total) { setScriptLine(I18N.t("upd.scriptsNoTarget")); return; }
                if (have.length) setScriptLine(I18N.t("upd.scriptsPresent", have.join(", ")));
                else setScriptLine(I18N.t("upd.scriptsAbsent"));
            });
        } catch (e) {}
    }

    function wireSettings() {
        var ver = document.getElementById("updCurrentVersion");
        if (ver) ver.textContent = localVersion();

        var btn = document.getElementById("updCheckNow");
        if (btn) btn.addEventListener("click", function () { check(true); });

        wireScriptButton();

        var auto = document.getElementById("updAutoCheck");
        if (auto) {
            auto.checked = !!loadState().autoCheck;
            auto.addEventListener("change", function () {
                var st = loadState();
                st.autoCheck = !!this.checked;
                saveState();
                status(I18N.t("status.done"));
            });
        }

        var pre = document.getElementById("updAllowPrerelease");
        if (pre) {
            pre.checked = !!CONFIG.allowPrerelease || !!loadState().allowPrerelease;
            pre.addEventListener("change", function () {
                var st = loadState();
                st.allowPrerelease = !!this.checked;
                CONFIG.allowPrerelease = !!this.checked;
                saveState();
                status(I18N.t("status.done"));
            });
        }

        var notes = document.getElementById("updShowNotes");
        if (notes) notes.addEventListener("click", function () {
            var st = loadState();
            var entry = (st.history && st.history.length) ? st.history[0] : null;
            if (entry) showWhatsNew(entry.version, entry.notes);
            else status(I18N.t("upd.noHistory"));
        });

        var repo = document.getElementById("updRepoLink");
        if (repo) repo.addEventListener("click", function (e) {
            e.preventDefault();
            openUrl("https://github.com/" + CONFIG.owner + "/" + CONFIG.repo + "/releases");
        });

        /*
         * Paint what is already known before any network call. The panel can
         * then answer "is there an update?" the moment it opens, using what the
         * last session found rather than waiting for a fresh check.
         */
        paintIndicator();

    }


    /* ==================================================================
       INIT
       ================================================================== */
    function init(csInterface) {
        cs = csInterface;
        if (!nodeReady()) {
            // The panel still works; only updating is unavailable
            wireSettings();
            return;
        }

        loadConfig();

        var st = loadState();
        if (typeof st.allowPrerelease === "boolean") {
            CONFIG.allowPrerelease = st.allowPrerelease;
        }

        wireSettings();

        /*
         * If an install ran before the last restart, this is the first launch
         * on the new version - show what changed, once.
         */
        if (st.showNotesFor && cmpVer(localVersion(), st.showNotesFor) >= 0) {
            var notes = st.pendingNotes || "";
            var ver = st.showNotesFor;
            delete st.showNotesFor;
            delete st.pendingNotes;
            saveState();
            window.setTimeout(function () { showWhatsNew(ver, notes); }, 600);
            return;    // one dialog per launch is plenty
        }

        /*
         * The automatic check waits a few seconds. The panel opens while After
         * Effects is still settling, and a modal appearing in the middle of
         * that is worse than one arriving a moment later.
         */
        window.setTimeout(function () { check(false); }, 4000);
    }

    return {
        init: init,
        check: check,
        installScripts: installShortcutScripts,
        scriptsStatus: scriptStatus,
        currentVersion: localVersion,
        // Exposed for the Diagnostics script and for testing
        _cmpVer: cmpVer,
        _unzip: unzip,
        _strip: stripWrapper,
        _validate: validate,
        _install: installEntries,
        _manifestVersion: manifestVersion,
        _scriptFolders: findScriptFolders,
        _scriptTargets: scriptTargets,
        _versionFolder: versionFolder,
        _notes: renderNotes,
        _normalize: normalizeRelease,
        _get: get,
        _config: CONFIG,
        _state: loadState
    };
})();
