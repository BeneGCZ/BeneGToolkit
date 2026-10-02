#include "tracker.h"
#include "logmel.h"
#include "platform.h"

#include <onnxruntime_cxx_api.h>

#include <algorithm>
#include <cstring>

namespace bgbm {

namespace {
const int CHUNK = 1500;
const int BORDER = 6;
}

struct Tracker::Impl {
    Ort::Env env{ORT_LOGGING_LEVEL_WARNING, "bgbeatmaker"};
    Ort::SessionOptions opts;
    std::unique_ptr<Ort::Session> session;
};

Tracker::Tracker(const std::string& modelPath, int threads) : impl_(new Impl) {
    impl_->opts.SetIntraOpNumThreads(std::max(1, threads));
    impl_->opts.SetInterOpNumThreads(1);
    impl_->opts.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_ENABLE_ALL);
#ifdef _WIN32
    std::wstring wpath = widen(modelPath);
    impl_->session.reset(new Ort::Session(impl_->env, wpath.c_str(), impl_->opts));
#else
    impl_->session.reset(new Ort::Session(impl_->env, modelPath.c_str(), impl_->opts));
#endif
}

Tracker::~Tracker() = default;

bool Tracker::run(const std::vector<float>& spect, int frames,
                  std::vector<float>& beat, std::vector<float>& downbeat,
                  const std::function<bool(int, int)>& progress) {
    const int F = LogMel::N_MELS;
    beat.assign((size_t)frames, -1000.0f);
    downbeat.assign((size_t)frames, -1000.0f);
    if (frames <= 0) return true;

    // chunk starts, as split_piece(avoid_short_end=True)
    std::vector<int> starts;
    for (int s = -BORDER; s < frames - BORDER; s += CHUNK - 2 * BORDER) starts.push_back(s);
    if (frames > CHUNK - 2 * BORDER) starts.back() = frames - (CHUNK - BORDER);

    Ort::MemoryInfo mem = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
    const char* inNames[] = {"spect"};
    const char* outNames[] = {"beat", "downbeat"};
    std::vector<float> chunk;

    // Reverse order, so an earlier chunk overwrites a later one where they
    // overlap ("keep_first").
    for (int ci = (int)starts.size() - 1, done = 0; ci >= 0; ci--, done++) {
        if (progress && !progress(done, (int)starts.size())) return false;
        const int s = starts[ci];
        const int left = std::max(0, -s);
        const int from = std::max(s, 0), to = std::min(s + CHUNK, frames);
        const int right = std::max(0, std::min(BORDER, s + CHUNK - frames));
        const int len = left + (to - from) + right;
        chunk.assign((size_t)len * F, 0.0f);
        std::memcpy(&chunk[(size_t)left * F], &spect[(size_t)from * F], sizeof(float) * (size_t)(to - from) * F);

        int64_t shape[3] = {1, len, F};
        Ort::Value in = Ort::Value::CreateTensor<float>(mem, chunk.data(), chunk.size(), shape, 3);
        std::vector<Ort::Value> out = impl_->session->Run(Ort::RunOptions{nullptr}, inNames, &in, 1, outNames, 2);
        const float* b = out[0].GetTensorData<float>();
        const float* d = out[1].GetTensorData<float>();

        // drop the border on both sides, write at start + border
        for (int k = BORDER; k < len - BORDER; k++) {
            int dst = s + k;
            if (dst < 0 || dst >= frames) continue;
            if (dst >= s + CHUNK - BORDER) break;
            beat[(size_t)dst] = b[k];
            downbeat[(size_t)dst] = d[k];
        }
    }
    if (progress) progress((int)starts.size(), (int)starts.size());
    return true;
}

}  // namespace bgbm
