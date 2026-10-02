// The tracker's input: a log-magnitude mel spectrogram, bit-for-bit the recipe the
// model was trained with (22050 Hz, 1024-point periodic Hann, hop 441 = 50 frames
// per second, centred frames with reflect padding, magnitude / sqrt(1024), 128
// Slaney-scale triangles 30-11000 Hz without area normalisation, log1p(1000 x)).
#pragma once
#include <vector>

namespace bgbm {

struct LogMel {
    static const int SAMPLE_RATE = 22050;
    static const int N_FFT = 1024;
    static const int HOP = 441;
    static const int N_MELS = 128;
    static const int N_FREQS = N_FFT / 2 + 1;

    LogMel();
    // x at 22050 Hz -> frames x 128, row-major; frames = 1 + x.size() / HOP.
    std::vector<float> compute(const std::vector<float>& x, int& frames) const;

private:
    std::vector<double> window_;   // N_FFT
    std::vector<double> fb_;       // N_FREQS x N_MELS
    std::vector<int> fbLo_, fbHi_; // non-zero frequency range of each mel band
};

}  // namespace bgbm
