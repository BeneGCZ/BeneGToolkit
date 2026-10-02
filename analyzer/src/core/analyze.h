// The analyzer as a library: one call from a WAV to the curves the panel's fast
// layer works from. The CLI (src/cli) is a thin wrapper, so the same core can later
// sit behind a different host.
#pragma once
#include "features.h"

#include <functional>
#include <string>
#include <vector>

namespace bgbm {

struct AnalyzeOptions {
    std::string wavPath;
    std::string modelPath;     // beat tracker, ONNX
    int threads = 1;
};

struct AnalyzeResult {
    int inputRate = 0, inputChannels = 0, inputBits = 0;
    bool inputFloat = false;
    double duration = 0.0;     // seconds of audio read
    int fps = 50;              // curve frame rate
    std::vector<float> beat;       // logits per frame
    std::vector<float> downbeat;   // logits per frame
    std::vector<float> spect;      // log-mel, frames x 128 (kept for checks)
    int frames = 0;
    Features feat;                 // envelope, bands, chroma, tone colour
    double secDecode = 0, secResample = 0, secSpect = 0, secFeatures = 0, secModel = 0;
};

// stage: "decode", "resample", "spectrogram", "beats"; fraction 0..1 of the whole.
// Returning false from progress stops the analysis (the call then returns false
// with err = "cancelled").
typedef std::function<bool(const char* stage, double fraction)> Progress;

bool analyze(const AnalyzeOptions& opt, AnalyzeResult& res, std::string& err, const Progress& progress);

}  // namespace bgbm
