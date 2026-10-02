# Does the native analyzer give what the reference (PyTorch) pipeline gives?
#
#   python compare_cpp.py <bgbeatmaker exe> <model dir> <threads> <wav> [<wav> ...]
#
# Per WAV and model (small0, final0): the log-mel spectrogram (C++ vs soxr +
# torchaudio), the beat / downbeat logits (C++ + ONNX Runtime vs PyTorch), and the
# beat times after the tracker's own peak picking - identical, or how many differ
# and by how much. Plus wall time of both.
import json, os, subprocess, sys, tempfile, time
import numpy as np
import torch
import soxr
from beat_this.inference import load_model, split_predict_aggregate
from beat_this.preprocessing import LogMelSpect, load_audio
from beat_this.model.postprocessor import Postprocessor


def ref_spect(wav):
    sig, sr = load_audio(wav)
    if sig.ndim == 2:
        sig = sig.mean(1)
    if sr != 22050:
        sig = soxr.resample(sig, in_rate=sr, out_rate=22050)
    return LogMelSpect()(torch.tensor(sig, dtype=torch.float32))


def match(a, b, tol=0.0105):
    """beats of a with a partner in b within tol (half a frame)"""
    j, n = 0, 0
    for t in a:
        while j < len(b) and b[j] < t - tol:
            j += 1
        if j < len(b) and abs(b[j] - t) <= tol:
            n += 1
    return n


def main():
    exe, mdir, threads, wavs = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
    post = Postprocessor(type="minimal")
    tmp = tempfile.mkdtemp(prefix="bgbm_cmp_")
    for name in ("small0", "final0"):
        model = load_model(name, "cpu")
        onnx = os.path.join(mdir, "beat_this-%s.onnx" % name)
        agg = {"spect": 0.0, "logit": 0.0, "same": 0, "n": 0, "beats": 0, "moved": 0, "t_cpp": 0.0, "t_ref": 0.0}
        for wav in wavs:
            out, dump = os.path.join(tmp, "a.json"), os.path.join(tmp, "s.f32")
            t0 = time.time()
            r = subprocess.run([exe, "--in", wav, "--out", out, "--model", onnx, "--threads", threads, "--dump-spect", dump],
                               capture_output=True, text=True)
            agg["t_cpp"] += time.time() - t0
            if r.returncode != 0:
                print("  FAILED %s: %s" % (os.path.basename(wav), r.stdout.strip().splitlines()[-1:]))
                continue
            res = json.load(open(out))
            cs = np.fromfile(dump, dtype=np.float32).reshape(-1, 128)
            t0 = time.time()
            rs = ref_spect(wav)
            with torch.no_grad():
                p = split_predict_aggregate(rs, 1500, 6, "keep_first", model)
            agg["t_ref"] += time.time() - t0
            n = min(len(cs), len(rs))
            agg["spect"] = max(agg["spect"], float(np.abs(cs[:n] - rs[:n].numpy()).max()))
            cb = np.array(res["curves"]["beat"], dtype=np.float32)
            cd = np.array(res["curves"]["downbeat"], dtype=np.float32)
            m = min(len(cb), len(p["beat"]))
            agg["logit"] = max(agg["logit"], float(np.abs(cb[:m] - p["beat"][:m].numpy()).max()),
                               float(np.abs(cd[:m] - p["downbeat"][:m].numpy()).max()))
            bt, dt = post(p["beat"], p["downbeat"])
            bc, dc = post(torch.from_numpy(cb), torch.from_numpy(cd))
            agg["n"] += 1
            agg["beats"] += len(bt)
            same = len(bt) == len(bc) and len(dt) == len(dc) and np.allclose(bt, bc) and np.allclose(dt, dc)
            if same:
                agg["same"] += 1
            else:
                agg["moved"] += len(bt) - match(bt, bc)
                print("  %s: beats %d vs %d (%d without a partner within half a frame), downbeats %d vs %d" % (
                    os.path.basename(wav), len(bt), len(bc), len(bt) - match(bt, bc), len(dt), len(dc)))
        print("%s: %d files, spectrogram max |diff| %.4f, logits max |diff| %.4f, identical beat times %d/%d, beats without a partner %d of %d; C++ %.1f s (%s threads, incl. process start), reference %.1f s" % (
            name, agg["n"], agg["spect"], agg["logit"], agg["same"], agg["n"], agg["moved"], agg["beats"], agg["t_cpp"], threads, agg["t_ref"]))


if __name__ == "__main__":
    main()
