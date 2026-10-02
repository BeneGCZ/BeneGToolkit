// Signal features the panel's fast layer works from, besides the beat curves.
// Every window is centred on its frame time (frame k of a rate r sits at k / r s),
// so nothing is delayed relative to the audio.
#pragma once
#include <vector>

namespace bgbm {

struct Features {
    // Log energy (dB) of a 5 ms Hann window every 1 ms - where a hit's energy rises
    // steepest is where it starts (the fast layer's +-30 ms refinement).
    static const int ENV_RATE = 1000;
    std::vector<float> env;

    // Log energy (dB) in four bands every 10 ms (23 ms window): below 150 Hz,
    // 150-800 Hz, 800-4000 Hz, above 4 kHz. Row-major frames x 4.
    static const int BAND_RATE = 100;
    static const int N_BANDS = 4;
    std::vector<float> bands;

    // Harmony: 12 pitch classes (C = 0) every 100 ms from a 186 ms window,
    // 55 Hz - 5 kHz, scaled so the strongest class of each frame is 1.
    static const int SLOW_RATE = 10;
    std::vector<float> chroma;   // frames x 12

    // Tone colour: 13 cepstral coefficients of the log-mel spectrogram, averaged
    // over 100 ms, every 100 ms.
    std::vector<float> mfcc;     // frames x 13

    int envFrames = 0, bandFrames = 0, slowFrames = 0;
};

// x: mono at 22050 Hz; logmel: the tracker's spectrogram (50 fps x 128).
void computeFeatures(const std::vector<float>& x, const std::vector<float>& logmel, int melFrames, Features& f);

}  // namespace bgbm
