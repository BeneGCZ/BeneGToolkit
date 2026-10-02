// Beat and downbeat activation curves from the log-mel spectrogram, through the
// exported tracker network in ONNX Runtime.
#pragma once
#include <functional>
#include <memory>
#include <string>
#include <vector>

namespace bgbm {

class Tracker {
public:
    // threads: intra-op threads for the runtime (1 = gentlest on the host app).
    Tracker(const std::string& modelPath, int threads);
    ~Tracker();

    // spect: frames x 128. Fills beat / downbeat logits (one per frame, 50 fps).
    // The piece is cut exactly like the reference: chunks of 1500 frames that
    // overlap by a 6-frame border, the last one shifted to end at the end, borders
    // discarded, an earlier chunk winning where two overlap.
    // progress(done, total) may return false to stop; returns false if stopped.
    bool run(const std::vector<float>& spect, int frames,
             std::vector<float>& beat, std::vector<float>& downbeat,
             const std::function<bool(int, int)>& progress);

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

}  // namespace bgbm
