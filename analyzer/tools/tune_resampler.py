# Pick the resampler's filter so the spectrogram matches the reference resampler.
#   python tune_resampler.py <wav 44.1 kHz> [<wav> ...]
# Mirrors src/core/resample.cpp for the 2:1 case (44100 -> 22050): windowed sinc,
# Kaiser window, cutoff = rolloff x output Nyquist, zc zero crossings each side.
# Scores the log-mel difference against soxr + the model's own front end.
import sys
import numpy as np
import soxr
import torch
from beat_this.preprocessing import LogMelSpect, load_audio
from scipy.special import i0

mel = LogMelSpect()


def ours(x, rolloff, zc, beta):
    fc = 0.5 * 0.5 * rolloff                    # cycles per input sample, L/M = 1/2
    hw = zc / (2 * fc)
    K = int(np.ceil(hw))
    d = np.arange(-K, K + 1, dtype=np.float64)  # input offset
    h = 2 * fc * np.sinc(2 * fc * d) * i0(beta * np.sqrt(np.clip(1 - (d / hw) ** 2, 0, None))) / i0(beta)
    h[np.abs(d) >= hw] = 0
    h /= h.sum()
    y = np.convolve(x, h[::-1], mode="full")[K:K + len(x)]   # y[k] = sum_j x[k+j] h[j]
    return y[::2]


def spect(y):
    return mel(torch.tensor(y, dtype=torch.float32)).numpy()


def main():
    sigs = []
    for w in sys.argv[1:]:
        s, sr = load_audio(w)
        assert sr == 44100
        sigs.append(s if s.ndim == 1 else s.mean(1))
    refs = [spect(soxr.resample(s, in_rate=44100, out_rate=22050)) for s in sigs]
    res = []
    for rolloff in (0.93, 0.94, 0.945, 0.95, 0.955, 0.96):
        for zc in (64, 128, 256):
            for beta in (12.0, 14.0, 16.0):
                mx, top, allm = 0.0, 0.0, 0.0
                for s, r in zip(sigs, refs):
                    a = spect(ours(s, rolloff, zc, beta))
                    n = min(len(a), len(r))
                    d = np.abs(a[:n] - r[:n])
                    mx = max(mx, float(d.max()))
                    top = max(top, float(d[:, 120:].mean()))
                    allm = max(allm, float(d.mean()))
                res.append((mx, top, allm, rolloff, zc, beta))
    res.sort()
    for mx, top, allm, rolloff, zc, beta in res[:12]:
        print("rolloff %.3f zc %3d beta %4.1f   max %.4f   mean top bands %.5f   mean all %.5f" % (rolloff, zc, beta, mx, top, allm))


if __name__ == "__main__":
    main()
