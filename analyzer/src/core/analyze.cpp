#include "analyze.h"
#include "audio_io.h"
#include "logmel.h"
#include "resample.h"
#include "tracker.h"

#include <chrono>
#include <exception>

namespace bgbm {

namespace {
double now() {
    return std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count();
}
}

bool analyze(const AnalyzeOptions& opt, AnalyzeResult& res, std::string& err, const Progress& progress) {
    auto say = [&](const char* stage, double f) { return !progress || progress(stage, f); };
    try {
        double t0 = now();
        if (!say("decode", 0.0)) { err = "cancelled"; return false; }
        Audio audio;
        if (!readAudio(opt.wavPath, audio, err)) return false;
        if (audio.mono.empty()) { err = "empty"; return false; }
        res.inputRate = audio.sampleRate;
        res.inputChannels = audio.channels;
        res.inputBits = audio.bitsPerSample;
        res.inputFloat = audio.isFloat;
        res.duration = audio.duration();
        double t1 = now();
        res.secDecode = t1 - t0;

        if (!say("resample", 0.05)) { err = "cancelled"; return false; }
        std::vector<float> x = resample(audio.mono, audio.sampleRate, LogMel::SAMPLE_RATE);
        std::vector<float>().swap(audio.mono);
        double t2 = now();
        res.secResample = t2 - t1;

        if (!say("spectrogram", 0.12)) { err = "cancelled"; return false; }
        LogMel mel;
        res.spect = mel.compute(x, res.frames);
        double t25 = now();
        res.secSpect = t25 - t2;

        if (!say("features", 0.16)) { err = "cancelled"; return false; }
        computeFeatures(x, res.spect, res.frames, res.feat);
        std::vector<float>().swap(x);
        double t3 = now();
        res.secFeatures = t3 - t25;

        Tracker tracker(opt.modelPath, opt.threads);
        bool ok = tracker.run(res.spect, res.frames, res.beat, res.downbeat, [&](int done, int total) {
            return say("beats", 0.2 + 0.8 * (total ? (double)done / total : 1.0));
        });
        res.secModel = now() - t3;
        if (!ok) { err = "cancelled"; return false; }
        say("done", 1.0);
        return true;
    } catch (const std::bad_alloc&) {
        err = "memory";
    } catch (const std::exception& e) {
        err = std::string("runtime: ") + e.what();
    }
    return false;
}

}  // namespace bgbm
