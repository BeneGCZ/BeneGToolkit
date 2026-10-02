# Reads the analyzer's .bgbm output: header dict + {name: numpy array (frames x dims)}.
import json
import numpy as np


def read(path):
    with open(path, "rb") as f:
        b = f.read()
    if b[:8] != b"BGBMAN02":
        raise ValueError("not a bgbm analysis: %r" % b[:8])
    hl = int.from_bytes(b[8:12], "little")
    head = json.loads(b[12:12 + hl].decode("utf-8"))
    base = 12 + hl
    arrays = {}
    for a in head["arrays"]:
        n = a["frames"] * a["dims"]
        v = np.frombuffer(b, dtype="<f4", count=n, offset=base + a["offset"])
        arrays[a["name"]] = v.reshape(a["frames"], a["dims"]) if a["dims"] > 1 else v
    return head, arrays
