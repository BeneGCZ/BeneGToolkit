/*
 * Which macOS a Mach-O binary (thin or universal) needs: for every slice, the CPU
 * and the minimum OS version from LC_BUILD_VERSION / LC_VERSION_MIN_MACOSX.
 * Runs anywhere Node runs, so a Mac is not needed to check a Mac build.
 *   node macho_minos.js <file> [<file> ...]
 */
var fs = require("fs");
var CPU = { 7: "i386", 0x01000007: "x86_64", 12: "arm", 0x0100000c: "arm64" };
function ver(v) { return (v >>> 16) + "." + ((v >>> 8) & 0xff) + "." + (v & 0xff); }
function slice(buf, off) {
    var magic = buf.readUInt32LE(off);
    if (magic !== 0xfeedfacf && magic !== 0xfeedface) return { err: "not a Mach-O slice (0x" + magic.toString(16) + ")" };
    var is64 = magic === 0xfeedfacf, cpu = buf.readUInt32LE(off + 4), ncmds = buf.readUInt32LE(off + 16);
    var p = off + (is64 ? 32 : 28), out = { cpu: CPU[cpu] || ("0x" + cpu.toString(16)) };
    for (var i = 0; i < ncmds; i++) {
        var cmd = buf.readUInt32LE(p), size = buf.readUInt32LE(p + 4);
        if (cmd === 0x32) { out.platform = buf.readUInt32LE(p + 8); out.minos = ver(buf.readUInt32LE(p + 12)); out.sdk = ver(buf.readUInt32LE(p + 16)); }
        if (cmd === 0x24) { out.minos = ver(buf.readUInt32LE(p + 8)); out.sdk = ver(buf.readUInt32LE(p + 12)); }
        p += size;
    }
    return out;
}
process.argv.slice(2).forEach(function (f) {
    var buf = fs.readFileSync(f), res = [];
    if (buf.readUInt32BE(0) === 0xcafebabe) {
        var n = buf.readUInt32BE(4);
        for (var i = 0; i < n; i++) res.push(slice(buf, buf.readUInt32BE(8 + i * 20 + 8)));
    } else res.push(slice(buf, 0));
    console.log(f.split(/[\\/]/).pop() + ": " + res.map(function (s) { return s.err || (s.cpu + " macOS " + s.minos + " (SDK " + s.sdk + ")"); }).join(", "));
});
