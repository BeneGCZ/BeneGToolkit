# Where do the native and reference spectrograms differ?
#   python diag_frontend.py <exe> <onnx> <wav>
# 1) the WAV resampled by soxr to 22050 Hz and written out, so the native analyzer
#    skips its own resampler -> differences are the spectrogram code alone;
# 2) the original WAV -> differences include the resampler.
# Prints the largest difference, where it is (frame, band), and the share of
# frames that differ by more than 0.01.
import os, subprocess, sys, tempfile
import numpy as np
import soundfile as sf
import soxr
import torch
from beat_this.preprocessing import LogMelSpect, load_audio


def native(exe, onnx, wav, tmp):
    out, dump = os.path.join(tmp, "a.json"), os.path.join(tmp, "s.f32")
    subprocess.run([exe, "--in", wav, "--out", out, "--model", onnx, "--threads", "2", "--dump-spect", dump], check=True, capture_output=True)
    return np.fromfile(dump, dtype=np.float32).reshape(-1, 128)


def report(tag, a, b):
    n = min(len(a), len(b))
    d = np.abs(a[:n] - b[:n])
    f, m = np.unravel_index(np.argmax(d), d.shape)
    per = d.max(1)
    print("%-28s frames %d vs %d, max |diff| %.4f at frame %d band %d (values %.3f vs %.3f), frames > 0.01: %.1f %%, median frame max %.5f" % (
        tag, len(a), len(b), d.max(), f, m, a[f, m], b[f, m], 100.0 * (per > 0.01).mean(), np.median(per)))
    worst = np.argsort(per)[-5:][::-1]
    print("    worst frames:", ", ".join("%d (%.3f)" % (i, per[i]) for i in worst))


def main():
    exe, onnx, wav = sys.argv[1:4]
    tmp = tempfile.mkdtemp(prefix="bgbm_diag_")
    sig, sr = load_audio(wav)
    if sig.ndim == 2:
        sig = sig.mean(1)
    y = soxr.resample(sig, in_rate=sr, out_rate=22050) if sr != 22050 else sig
    ref = LogMelSpect()(torch.tensor(y, dtype=torch.float32)).numpy()
    w22 = os.path.join(tmp, "x22050.wav")
    sf.write(w22, y.astype(np.float32), 22050, subtype="FLOAT")
    report("spectrogram only (22050 in)", native(exe, onnx, w22, tmp), ref)
    report("with resampler (%d in)" % sr, native(exe, onnx, wav, tmp), ref)


if __name__ == "__main__":
    main()
