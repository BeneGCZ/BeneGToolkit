# Export the beat tracker checkpoints to ONNX and prove the export is faithful.
#
#   python export_onnx.py <out_dir> <wav> [<wav> ...]
#
# For each checkpoint (final0 = the full model, small0 = the small one) it writes
# beat_this-<name>.onnx with a dynamic frame axis, then compares ONNX Runtime with
# PyTorch on real log-mel spectrograms of the given WAVs:
#   - raw logits on chunks of several lengths (the tail chunk of a piece is shorter
#     than 1500 frames, so the frame axis must really be dynamic);
#   - the whole piece through the tracker's own split / aggregate / peak picking,
#     so the beat times themselves are compared, not only the numbers.
# Runs in the evaluation venv (torch, beat_this, onnx, onnxruntime); TORCH_HOME
# decides where the checkpoints are cached.
import os, sys, time, json
import numpy as np
import torch
import soxr
import onnxruntime as ort
from beat_this.inference import load_model, split_predict_aggregate
from beat_this.preprocessing import LogMelSpect, load_audio
from beat_this.model.postprocessor import Postprocessor


class Wrap(torch.nn.Module):
    """The tracker returns a dict; ONNX wants a tuple."""
    def __init__(self, m):
        super().__init__()
        self.m = m

    def forward(self, spect):
        o = self.m(spect)
        return o["beat"], o["downbeat"]


def export(name, path):
    model = load_model(name, "cpu")
    w = Wrap(model).eval()
    x = torch.randn(1, 1500, 128)
    t0 = time.time()
    with torch.no_grad():
        torch.onnx.export(w, (x,), path, input_names=["spect"], output_names=["beat", "downbeat"],
                          dynamic_axes={"spect": {1: "frames"}, "beat": {1: "frames"}, "downbeat": {1: "frames"}},
                          opset_version=17, dynamo=False)
    print("%s: exported in %.1f s, %.1f MB, %d parameters" % (
        name, time.time() - t0, os.path.getsize(path) / 1e6, sum(p.numel() for p in model.parameters())))
    return model


def spect_of(wav):
    sig, sr = load_audio(wav)
    if sig.ndim == 2:
        sig = sig.mean(1)
    if sr != 22050:
        sig = soxr.resample(sig, in_rate=sr, out_rate=22050)
    return LogMelSpect()(torch.tensor(sig, dtype=torch.float32))


class OrtModel:
    """Stands in for the torch model inside split_predict_aggregate."""
    def __init__(self, sess):
        self.sess = sess

    def __call__(self, chunk):
        b, d = self.sess.run(None, {"spect": chunk.numpy().astype(np.float32)})
        return {"beat": torch.from_numpy(b), "downbeat": torch.from_numpy(d)}


def main():
    out, wavs = sys.argv[1], sys.argv[2:]
    os.makedirs(out, exist_ok=True)
    post = Postprocessor(type="minimal")
    report = {}
    for name in ("final0", "small0"):
        path = os.path.join(out, "beat_this-%s.onnx" % name)
        model = export(name, path)
        so = ort.SessionOptions()
        so.intra_op_num_threads = 1
        sess = ort.InferenceSession(path, so, providers=["CPUExecutionProvider"])
        worst, same, total, t_torch, t_ort = 0.0, 0, 0, 0.0, 0.0
        for wav in wavs:
            spect = spect_of(wav)
            for L in (1500, 1000, 437, 150):
                if L > spect.shape[0]:
                    continue
                x = spect[:L].unsqueeze(0)
                with torch.no_grad():
                    o = model(x)
                b, d = sess.run(None, {"spect": x.numpy()})
                worst = max(worst, float(np.abs(o["beat"].numpy() - b).max()), float(np.abs(o["downbeat"].numpy() - d).max()))
            t0 = time.time()
            with torch.no_grad():
                pt = split_predict_aggregate(spect, 1500, 6, "keep_first", model)
            t_torch += time.time() - t0
            t0 = time.time()
            po = split_predict_aggregate(spect, 1500, 6, "keep_first", OrtModel(sess))
            t_ort += time.time() - t0
            bt, dt = post(pt["beat"], pt["downbeat"])
            bo, do = post(po["beat"], po["downbeat"])
            total += 1
            if len(bt) == len(bo) and len(dt) == len(do) and np.allclose(bt, bo) and np.allclose(dt, do):
                same += 1
            else:
                print("  differs: %s  beats %d vs %d, downbeats %d vs %d" % (os.path.basename(wav), len(bt), len(bo), len(dt), len(do)))
        report[name] = {"max_abs_logit_diff": worst, "identical_beats": "%d/%d" % (same, total),
                        "torch_s": round(t_torch, 2), "onnxruntime_1thread_s": round(t_ort, 2)}
        print("%s: max |logit diff| %.2e, identical beat times %d/%d, torch %.1f s, onnxruntime (1 thread) %.1f s" % (
            name, worst, same, total, t_torch, t_ort))
    with open(os.path.join(out, "export_report.json"), "w") as f:
        json.dump(report, f, indent=1)


if __name__ == "__main__":
    main()
