// Reading the WAV that After Effects renders (and any other plain WAV).
#pragma once
#include <string>
#include <vector>

namespace bgbm {

struct Audio {
    std::vector<float> mono;   // channels averaged, as the tracker was trained
    int sampleRate = 0;
    int channels = 0;
    int bitsPerSample = 0;
    bool isFloat = false;
    double duration() const { return sampleRate > 0 ? (double)mono.size() / sampleRate : 0.0; }
};

// PCM 8/16/24/32-bit, IEEE float 32/64, WAVE_FORMAT_EXTENSIBLE, any channel count.
// Returns false with a reason in err ("open", "not-wav", "format", "truncated").
bool readWav(const std::string& path, Audio& out, std::string& err);

// AIFF / AIFF-C (NONE, twos, sowt, fl32, fl64) - what After Effects' built-in
// audio output template writes.
bool readAiff(const std::string& path, Audio& out, std::string& err);

// Either of the two, by the file's header ("not-audio" if neither).
bool readAudio(const std::string& path, Audio& out, std::string& err);

}  // namespace bgbm
