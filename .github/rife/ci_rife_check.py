# Proves a rife-ncnn-vulkan build runs the panel's RIFE models, with nothing but
# the standard library (the macOS runners have no ffmpeg or Pillow).
#
#   python ci_rife_check.py make  <dir>
#   python ci_rife_check.py check <exe> <model dir> <dir> [--gpu N] [--arch x86_64]
#
# make: three frames 330x250 (not a multiple of 64 - the 4.25/4.26 models need
# padding to 64 and an engine that does not pad crashes or garbles), a textured
# background panning right and a bright square moving faster, so frame 1 is the
# exact middle of frames 0 and 2.
# check: interpolates the middle from frames 0 and 2 and compares it with frame 1.
# A working model beats the plain average of the two frames by a clear margin;
# a crash, a black or a garbled frame does not. Exit code 1 on failure, with a
# GitHub annotation.
import math, os, struct, subprocess, sys, zlib

W, H = 330, 250


def frame(t):
    px = bytearray()
    for y in range(H):
        px.append(0)                                   # filter: none
        for x in range(W):
            u = x - 12 * t                             # background pans 12 px per frame
            v = 128 + 60 * math.sin(u * 0.15) * math.cos(y * 0.11) + 30 * math.sin((u + y) * 0.05)
            r = g = b = int(max(0, min(255, v)))
            sx, sy = 60 + 30 * t, 90                   # square moves 30 px per frame
            if sx <= x < sx + 50 and sy <= y < sy + 50:
                r, g, b = 240, 60, 40
            px += bytes((r, g, (b + 40) % 256))
    return bytes(px)


def write_png(path, raw):
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0)) +
                chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def read_png(path):
    data = open(path, "rb").read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"
    p, idat = 8, b""
    w = h = ch = 0
    while p < len(data):
        n = struct.unpack(">I", data[p:p + 4])[0]; t = data[p + 4:p + 8]; d = data[p + 8:p + 8 + n]
        if t == b"IHDR":
            w, h, depth, ctype = struct.unpack(">IIBB", d[:10])
            assert depth == 8 and ctype in (2, 6), "unexpected PNG format %d/%d" % (depth, ctype)
            ch = 3 if ctype == 2 else 4
        elif t == b"IDAT":
            idat += d
        p += 12 + n
    raw, stride, out, prev = zlib.decompress(idat), w * ch, bytearray(), bytearray(w * ch)
    for y in range(h):
        ft = raw[y * (stride + 1)]; line = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for i in range(stride):
            a = line[i - ch] if i >= ch else 0; b = prev[i]; c = prev[i - ch] if i >= ch else 0
            if ft == 1: line[i] = (line[i] + a) & 255
            elif ft == 2: line[i] = (line[i] + b) & 255
            elif ft == 3: line[i] = (line[i] + (a + b) // 2) & 255
            elif ft == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else (b if pb <= pc else c))) & 255
        out += line if ch == 3 else bytes(v for k, v in enumerate(line) if k % 4 != 3)
        prev = line
    return w, h, bytes(out)


def psnr(a, b):
    se = sum((x - y) * (x - y) for x, y in zip(a, b)) / float(len(a))
    return 99.0 if se == 0 else 10 * math.log10(255 * 255 / se)


def make(d):
    os.makedirs(d, exist_ok=True)
    for t in range(3):
        raw = frame(t); write_png(os.path.join(d, "f%d.png" % t), raw)
    print("wrote 3 frames %dx%d to %s" % (W, H, d))


def check(exe, model, d, gpu, arch):
    out = os.path.join(d, "mid_%s.png" % os.path.basename(model.rstrip("/\\")))
    if os.path.exists(out): os.remove(out)
    cmd = (["arch", "-" + arch] if arch else []) + [exe, "-0", os.path.join(d, "f0.png"), "-1", os.path.join(d, "f2.png"), "-o", out, "-m", model, "-g", str(gpu)]
    p = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
    name = os.path.basename(model.rstrip("/\\")) + (" [" + arch + "]" if arch else "") + " gpu " + str(gpu)
    if p.returncode != 0 or not os.path.exists(out):
        print("::error::%s: exit %s, %s" % (name, p.returncode, ((p.stderr or "") + (p.stdout or "")).strip().splitlines()[-1:] or ""))
        return False
    _, _, f0 = read_png(os.path.join(d, "f0.png")); _, _, f1 = read_png(os.path.join(d, "f1.png")); _, _, f2 = read_png(os.path.join(d, "f2.png"))
    w, h, mid = read_png(out)
    if (w, h) != (W, H):
        print("::error::%s: output is %dx%d, not %dx%d" % (name, w, h, W, H)); return False
    blend = bytes((x + y + 1) // 2 for x, y in zip(f0, f2))
    pm, pb = psnr(mid, f1), psnr(blend, f1)
    ok = pm >= pb + 1.5 and pm >= 22
    print("::%s::%s: interpolated %.2f dB vs plain average %.2f dB" % ("notice" if ok else "error", name, pm, pb))
    return ok


if __name__ == "__main__":
    a = sys.argv[1:]
    if a and a[0] == "make":
        make(a[1]); sys.exit(0)
    if a and a[0] == "check":
        gpu = a[a.index("--gpu") + 1] if "--gpu" in a else "-1"
        arch = a[a.index("--arch") + 1] if "--arch" in a else ""
        sys.exit(0 if check(a[1], a[2], a[3], gpu, arch) else 1)
    print(__doc__); sys.exit(2)
