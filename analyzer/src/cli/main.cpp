// bgbeatmaker - command-line wrapper around the analyzer core.
//
//   bgbeatmaker --in <wav|aiff> --out <file.bgbm> --model <onnx>
//               [--threads N] [--max-mem-mb N] [--dump-spect <file.f32>]
//
// Talks to the panel through stdout, one line per event:
//   PROGRESS <0..1> <stage>     while working
//   INFO <text>                 what was set up (priority, threads, input)
//   DONE <out path>             success, exit code 0
//   ERROR <code>                failure, exit code 2 (code: open, not-audio, format,
//                               truncated, empty, memory, write, model, runtime...)
// The panel stops it by ending the process; nothing is left half-written, since
// the output goes to <out>.part and is renamed at the end.
//
// Output (.bgbm): "BGBMAN02", a little-endian uint32 header length, a JSON header
// padded with spaces to a multiple of 4 bytes, then the arrays as little-endian
// float32, each described in the header: name, rate (frames per second), frames,
// dims (values per frame), offset (bytes from the start of the data block).
#include "../core/analyze.h"
#include "../core/platform.h"

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <thread>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#endif

namespace {

const char* VERSION = "0.2.0";

void line(const std::string& s) {
    std::fputs(s.c_str(), stdout);
    std::fputc('\n', stdout);
    std::fflush(stdout);
}

struct Block {
    const char* name;
    int rate, frames, dims;
    const std::vector<float>* data;
};

// Header + float32 arrays, as described at the top of this file. Float32 in the
// machine's order: every supported machine (x64, arm64) is little-endian.
bool writeAnalysis(FILE* f, const std::string& info, const std::vector<Block>& blocks) {
    std::string arr;
    size_t off = 0;
    char buf[256];
    for (size_t i = 0; i < blocks.size(); i++) {
        const Block& b = blocks[i];
        std::snprintf(buf, sizeof buf, "%s{\"name\":\"%s\",\"rate\":%d,\"frames\":%d,\"dims\":%d,\"offset\":%zu}",
                      i ? "," : "", b.name, b.rate, b.frames, b.dims, off);
        arr += buf;
        off += b.data->size() * sizeof(float);
    }
    std::string header = "{\"format\":\"bgbm-analysis\",\"version\":2,\"analyzer\":\"" + std::string(VERSION) + "\"," + info + ",\"arrays\":[" + arr + "]}";
    while ((12 + header.size()) % 4) header += ' ';
    uint32_t hl = (uint32_t)header.size();
    unsigned char len[4] = {(unsigned char)(hl & 255), (unsigned char)((hl >> 8) & 255), (unsigned char)((hl >> 16) & 255), (unsigned char)(hl >> 24)};
    bool ok = std::fwrite("BGBMAN02", 1, 8, f) == 8 && std::fwrite(len, 1, 4, f) == 4 &&
              std::fwrite(header.data(), 1, header.size(), f) == header.size();
    for (const Block& b : blocks)
        ok = ok && std::fwrite(b.data->data(), sizeof(float), b.data->size(), f) == b.data->size();
    return ok && !std::ferror(f);
}

bool renameFile(const std::string& from, const std::string& to) {
#ifdef _WIN32
    return MoveFileExW(bgbm::widen(from).c_str(), bgbm::widen(to).c_str(), MOVEFILE_REPLACE_EXISTING) != 0;
#else
    return std::rename(from.c_str(), to.c_str()) == 0;
#endif
}

int run(const std::vector<std::string>& args) {
    std::string in, out, model, dumpSpect;
    unsigned hw = std::thread::hardware_concurrency();
    int threads = hw > 2 ? (int)std::min(4u, hw / 2) : 1;   // leave most cores to After Effects
    int maxMem = 3072;
    for (size_t i = 1; i < args.size(); i++) {
        const std::string& a = args[i];
        auto next = [&]() -> std::string { return i + 1 < args.size() ? args[++i] : std::string(); };
        if (a == "--in") in = next();
        else if (a == "--out") out = next();
        else if (a == "--model") model = next();
        else if (a == "--threads") threads = std::max(1, std::atoi(next().c_str()));
        else if (a == "--max-mem-mb") maxMem = std::atoi(next().c_str());
        else if (a == "--dump-spect") dumpSpect = next();
        else if (a == "--version") { line(std::string("bgbeatmaker ") + VERSION); return 0; }
        else { line("ERROR usage " + a); return 2; }
    }
    if (in.empty() || out.empty() || model.empty()) { line("ERROR usage"); return 2; }

    line("INFO " + bgbm::lowerPriorityAndCapMemory(maxMem) + ", threads " + std::to_string(threads));

    bgbm::AnalyzeOptions opt;
    opt.wavPath = in;
    opt.modelPath = model;
    opt.threads = threads;
    bgbm::AnalyzeResult res;
    std::string err;
    char buf[320];
    if (!bgbm::analyze(opt, res, err, [&](const char* stage, double f) {
            std::snprintf(buf, sizeof buf, "PROGRESS %.3f %s", f, stage);
            line(buf);
            return true;
        })) {
        line("ERROR " + err);
        return 2;
    }
    std::snprintf(buf, sizeof buf, "INFO input %d Hz, %d ch, %d-bit%s, %.3f s; decode %.2f s, resample %.2f s, spectrogram %.2f s, features %.2f s, model %.2f s",
                  res.inputRate, res.inputChannels, res.inputBits, res.inputFloat ? " float" : "", res.duration,
                  res.secDecode, res.secResample, res.secSpect, res.secFeatures, res.secModel);
    line(buf);

    if (!dumpSpect.empty()) {
        FILE* s = bgbm::openFile(dumpSpect, "wb");
        if (s) { std::fwrite(res.spect.data(), sizeof(float), res.spect.size(), s); std::fclose(s); }
    }

    std::snprintf(buf, sizeof buf, "\"input\":{\"sampleRate\":%d,\"channels\":%d,\"bits\":%d,\"float\":%s,\"duration\":%.6f}",
                  res.inputRate, res.inputChannels, res.inputBits, res.inputFloat ? "true" : "false", res.duration);
    const bgbm::Features& ft = res.feat;
    std::vector<Block> blocks = {
        {"beat", res.fps, res.frames, 1, &res.beat},
        {"downbeat", res.fps, res.frames, 1, &res.downbeat},
        {"env", bgbm::Features::ENV_RATE, ft.envFrames, 1, &ft.env},
        {"bands", bgbm::Features::BAND_RATE, ft.bandFrames, bgbm::Features::N_BANDS, &ft.bands},
        {"chroma", bgbm::Features::SLOW_RATE, ft.slowFrames, 12, &ft.chroma},
        {"mfcc", bgbm::Features::SLOW_RATE, ft.slowFrames, 13, &ft.mfcc}};

    std::string part = out + ".part";
    FILE* f = bgbm::openFile(part, "wb");
    if (!f) { line("ERROR write"); return 2; }
    bool ok = writeAnalysis(f, buf, blocks);
    ok = (std::fclose(f) == 0) && ok;
    if (!ok || !renameFile(part, out)) { line("ERROR write"); return 2; }
    line("DONE " + out);
    return 0;
}

}  // namespace

#ifdef _WIN32
int wmain(int argc, wchar_t** argv) {
    std::vector<std::string> args;
    for (int i = 0; i < argc; i++) args.push_back(bgbm::narrow(argv[i]));
    return run(args);
}
#else
int main(int argc, char** argv) {
    std::vector<std::string> args(argv, argv + argc);
    return run(args);
}
#endif
