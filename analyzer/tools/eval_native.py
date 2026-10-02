# Beat accuracy of the native analyzer against the reference pipeline, per group.
#
#   python eval_native.py <exe> <model dir> <sets.tsv> <stages dir> <out.json> [threads]
#
# For every real / situation row of the evaluation set: the native analyzer with
# the full (final0) and the small (small0) model, beats by the tracker's own peak
# picking, F-measure at +-70 ms against the hand annotations - next to the same
# score of the reference run stored by the evaluation (stages/<id>.json, _st.raw).
# Same matching as the evaluation's eval_beats.js.
import json, os, subprocess, sys, tempfile, time
from collections import defaultdict
import numpy as np
import torch
from beat_this.model.postprocessor import Postprocessor


def match(est, ann, tol=0.07):
    used = [False] * len(est)
    h, j0 = 0, 0
    for t in ann:
        while j0 < len(est) and est[j0] < t - tol:
            j0 += 1
        best, bd = -1, tol + 1e-9
        j = j0
        while j < len(est) and est[j] <= t + tol:
            if not used[j] and abs(est[j] - t) < bd:
                bd, best = abs(est[j] - t), j
            j += 1
        if best >= 0:
            used[best] = True
            h += 1
    return h


def fmeasure(est, ann):
    if not len(est) or not len(ann):
        return 0.0
    h = match(list(est), list(ann))
    p, r = h / len(est), h / len(ann)
    return 2 * p * r / (p + r) if p + r else 0.0


def read_ann(path):
    out = []
    for line in open(path, encoding="utf-8"):
        s = line.strip().split()
        if s:
            try:
                out.append(float(s[0]))
            except ValueError:
                pass
    return out


def main():
    exe, mdir, sets, stages, out = sys.argv[1:6]
    threads = sys.argv[6] if len(sys.argv) > 6 else "4"
    post = Postprocessor(type="minimal")
    rows = [l.rstrip("\n").split("\t") for l in open(sets, encoding="utf-8") if l.strip() and not l.startswith("#")]
    rows = [r for r in rows if r[4] in ("real", "situation")]
    tmp = tempfile.mkdtemp(prefix="bgbm_eval_")
    per, t_model = [], defaultdict(float)
    t0 = time.time()
    for i, (tid, wav, annp, group, kind) in enumerate(rows):
        st = os.path.join(stages, tid + ".json")
        if not os.path.exists(st):
            continue
        ref = json.load(open(st, encoding="utf-8")).get("_st", {}).get("raw") or []
        ann = read_ann(annp)
        rec = {"id": tid, "group": group, "kind": kind, "F": {"reference": fmeasure(ref, ann)}}
        for name in ("final0", "small0"):
            js = os.path.join(tmp, name + ".json")
            t1 = time.time()
            r = subprocess.run([exe, "--in", wav, "--out", js, "--model", os.path.join(mdir, "beat_this-%s.onnx" % name), "--threads", threads],
                               capture_output=True, text=True)
            t_model[name] += time.time() - t1
            if r.returncode != 0:
                rec["F"][name] = None
                rec.setdefault("errors", []).append(r.stdout.strip().splitlines()[-1:])
                continue
            c = json.load(open(js))["curves"]
            b, _d = post(torch.tensor(c["beat"]), torch.tensor(c["downbeat"]))
            rec["F"][name] = fmeasure(b, ann)
        per.append(rec)
        if (i + 1) % 50 == 0:
            print("%d/%d  %.0f s" % (i + 1, len(rows), time.time() - t0), flush=True)
    groups = defaultdict(list)
    for r in per:
        groups[r["group"]].append(r)
        groups["ALL " + r["kind"]].append(r)
    table = []
    for g in sorted(groups):
        rs = groups[g]
        def mean(k):
            v = [x["F"][k] for x in rs if x["F"].get(k) is not None]
            return sum(v) / len(v) if v else float("nan")
        diff = sum(1 for x in rs if x["F"].get("final0") is not None and abs(x["F"]["final0"] - x["F"]["reference"]) > 1e-9)
        table.append({"group": g, "n": len(rs), "reference": mean("reference"), "final0": mean("final0"), "small0": mean("small0"), "final0_differs": diff})
        print("%-16s n %3d  reference %.4f  native full %.4f  native small %.4f  (full differs on %d)" % (
            g, len(rs), table[-1]["reference"], table[-1]["final0"], table[-1]["small0"], diff))
    print("time: full %.0f s, small %.0f s for %d files (%s threads, incl. process start)" % (t_model["final0"], t_model["small0"], len(per), threads))
    json.dump({"table": table, "perTrack": per, "seconds": t_model}, open(out, "w"), indent=0)


if __name__ == "__main__":
    main()
