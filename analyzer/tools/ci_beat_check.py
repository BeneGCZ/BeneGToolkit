# Proves a built analyzer works on this machine, with nothing but the standard library
# (so it runs as-is on the Windows, macOS and Linux build machines).
#
#   python ci_beat_check.py make  <dir>                       write the test audio + truth
#   python ci_beat_check.py check <exe> <model> <dir> [--arch x86_64]
#
# make: a drum pattern (kick on every beat, snare on 2 and 4, hi-hat on eighths, a bass
# note per beat) at two tempos and two sample rates, as WAV and as AIFF - the format
# After Effects exports for the panel. Beat times are known exactly and written to
# truth.json.
#
# check: copies each file into a folder whose name is not ASCII (the panel meets user
# folders like that), runs the analyzer the way the panel does, reads the .bgbm it
# writes, picks the beats from the logits the way the tracker's minimal postprocessor
# does (local maximum over +-3 frames, above 0) and requires 90 % of the true beats
# found within 70 ms and 90 % of the found ones true. Exit code 1 on any failure, with
# a GitHub annotation saying which file and why.
import json
import math
import os
import random
import shutil
import struct
import subprocess
import sys
import time
import wave

TOL = 0.070
NEED = 0.90
CASES = [
    {"name": "drums120_44k", "bpm": 120.0, "sr": 44100, "aiff": False},
    {"name": "drums120_44k", "bpm": 120.0, "sr": 44100, "aiff": True},
    {"name": "drums97_48k", "bpm": 97.0, "sr": 48000, "aiff": False},
]
DUR = 30.0
START = 0.5


def synth(bpm, sr):
    rnd = random.Random(1)
    n = int(DUR * sr)
    out = [0.0] * n
    period = 60.0 / bpm
    beats = []
    k = 0
    while START + k * period < DUR - 0.3:
        beats.append(START + k * period)
        k += 1

    def add(t0, length, fn):
        a = int(t0 * sr)
        for i in range(int(length * sr)):
            j = a + i
            if j >= n:
                break
            out[j] += fn(i / sr)

    for idx, t in enumerate(beats):
        # kick: falling pitch, fast decay
        ph = [0.0]

        def kick(x, ph=ph):
            f = 45.0 + 75.0 * math.exp(-x / 0.03)
            ph[0] += 2 * math.pi * f / sr
            return 0.9 * math.sin(ph[0]) * math.exp(-x / 0.09)
        add(t, 0.35, kick)
        # bass note under it
        add(t, period * 0.8, lambda x: 0.25 * math.sin(2 * math.pi * 55.0 * x) * math.exp(-x / 0.25))
        if idx % 2 == 1:   # snare on 2 and 4
            add(t, 0.2, lambda x: (0.5 * (rnd.random() * 2 - 1) + 0.3 * math.sin(2 * math.pi * 190 * x)) * math.exp(-x / 0.05))
        for half in (0.0, 0.5):   # hi-hat on eighths
            prev = [0.0]

            def hat(x, prev=prev):
                w = rnd.random() * 2 - 1
                y = w - prev[0]
                prev[0] = w
                return 0.12 * y * math.exp(-x / 0.015)
            add(t + half * period, 0.06, hat)
    peak = max(1e-9, max(abs(v) for v in out))
    return [v / peak * 0.8 for v in out], beats


def pcm16(samples):
    return [max(-32767, min(32767, int(round(v * 32767)))) for v in samples]


def write_wav(path, samples, sr):
    s = pcm16(samples)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(b"".join(struct.pack("<hh", v, v) for v in s))


def ext80(x):
    # IEEE 754 80-bit extended, big endian - the AIFF sample rate field
    e = int(math.floor(math.log2(x)))
    m = int(x / (2 ** e) * (1 << 63))
    return struct.pack(">HQ", e + 16383, m)


def write_aiff(path, samples, sr):
    s = pcm16(samples)
    data = b"".join(struct.pack(">hh", v, v) for v in s)
    comm = struct.pack(">hIh", 2, len(s), 16) + ext80(float(sr))
    ssnd = struct.pack(">II", 0, 0) + data
    body = b"AIFF" + b"COMM" + struct.pack(">I", len(comm)) + comm + b"SSND" + struct.pack(">I", len(ssnd)) + ssnd
    with open(path, "wb") as f:
        f.write(b"FORM" + struct.pack(">I", len(body)) + body)


def make(d):
    os.makedirs(d, exist_ok=True)
    truth = {}
    done = {}
    for c in CASES:
        key = (c["bpm"], c["sr"])
        if key not in done:
            done[key] = synth(c["bpm"], c["sr"])
        samples, beats = done[key]
        fname = c["name"] + (".aif" if c["aiff"] else ".wav")
        (write_aiff if c["aiff"] else write_wav)(os.path.join(d, fname), samples, c["sr"])
        truth[fname] = beats
        print("wrote %s: %d beats at %g BPM, %d Hz" % (fname, len(beats), c["bpm"], c["sr"]))
    with open(os.path.join(d, "truth.json"), "w") as f:
        json.dump(truth, f)


def read_bgbm(path):
    with open(path, "rb") as f:
        b = f.read()
    if b[:8] != b"BGBMAN02":
        raise ValueError("not a bgbm file")
    hl = struct.unpack("<I", b[8:12])[0]
    head = json.loads(b[12:12 + hl].decode("utf-8"))
    base = 12 + hl
    for a in head["arrays"]:
        if a["name"] == "beat":
            n = a["frames"] * a["dims"]
            vals = struct.unpack("<%df" % n, b[base + a["offset"]: base + a["offset"] + 4 * n])
            return head, a["rate"], vals
    raise ValueError("no beat array")


def pick(vals, rate):
    out = []
    for i, v in enumerate(vals):
        if v <= 0:
            continue
        lo, hi = max(0, i - 3), min(len(vals), i + 4)
        if v >= max(vals[lo:hi]) and (not out or i - out[-1] > 3):
            out.append(i)
    return [i / float(rate) for i in out]


def score(found, truth):
    lo, hi = 1.0, DUR - 1.0
    t = [x for x in truth if lo <= x <= hi]
    f = [x for x in found if lo <= x <= hi]
    hit_t = sum(1 for x in t if any(abs(x - y) <= TOL for y in f))
    hit_f = sum(1 for y in f if any(abs(x - y) <= TOL for x in t))
    return hit_t / max(1, len(t)), hit_f / max(1, len(f)), len(t), len(f)


def annotate(kind, msg):
    print("::%s::%s" % (kind, msg))


def check(exe, model, d, arch):
    with open(os.path.join(d, "truth.json")) as f:
        truth = json.load(f)
    odd = os.path.join(d, u"Hudba – ěščř é")   # "Hudba - escr e" with diacritics
    os.makedirs(odd, exist_ok=True)
    ok = True
    ver = subprocess.run(([ "arch", "-" + arch] if arch else []) + [exe, "--version"], capture_output=True, text=True)
    print("version: %r (exit %d)" % (ver.stdout.strip() or ver.stderr.strip(), ver.returncode))
    if ver.returncode != 0 or not ver.stdout.startswith("bgbeatmaker "):
        annotate("error", "%s --version failed: %s %s" % (os.path.basename(exe), ver.stdout.strip(), ver.stderr.strip()))
        return False
    for fname, beats in sorted(truth.items()):
        src = os.path.join(odd, fname)
        shutil.copyfile(os.path.join(d, fname), src)
        out = os.path.join(odd, fname + ".bgbm")
        cmd = ([ "arch", "-" + arch] if arch else []) + [exe, "--in", src, "--out", out, "--model", model, "--threads", "2"]
        t0 = time.time()
        p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        secs = time.time() - t0
        lines = (p.stdout + p.stderr).strip().splitlines()
        if p.returncode != 0 or not any(l.startswith("DONE ") for l in lines) or not os.path.exists(out):
            annotate("error", "%s on %s: exit %d, last lines: %s" % (os.path.basename(model), fname, p.returncode, " | ".join(lines[-4:])))
            ok = False
            continue
        head, rate, vals = read_bgbm(out)
        rec, prec, nt, nf = score(pick(vals, rate), beats)
        line = "%s %s%s: %d true / %d found beats, recall %.3f, precision %.3f, %.1f s (analyzer %s)" % (
            os.path.basename(model), fname, (" [" + arch + "]") if arch else "", nt, nf, rec, prec, secs, head.get("analyzer"))
        print(line)
        if rec < NEED or prec < NEED:
            annotate("error", line)
            ok = False
        else:
            annotate("notice", line)
    return ok


def main():
    a = sys.argv[1:]
    if not a:
        print(__doc__)
        return 2
    if a[0] == "make" and len(a) == 2:
        make(a[1])
        return 0
    if a[0] == "check" and len(a) >= 4:
        arch = a[a.index("--arch") + 1] if "--arch" in a else ""
        return 0 if check(a[1], a[2], a[3], arch) else 1
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main())
