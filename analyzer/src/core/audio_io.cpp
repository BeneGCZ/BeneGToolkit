#include "audio_io.h"
#include "platform.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>

namespace bgbm {

namespace {

uint32_t u32(const unsigned char* p) { return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24); }
uint16_t u16(const unsigned char* p) { return (uint16_t)(p[0] | (p[1] << 8)); }

struct FileCloser {
    FILE* f;
    ~FileCloser() { if (f) std::fclose(f); }
};

}  // namespace

bool readWav(const std::string& path, Audio& out, std::string& err) {
    FILE* f = openFile(path, "rb");
    if (!f) { err = "open"; return false; }
    FileCloser fc{f};

    unsigned char hdr[12];
    if (std::fread(hdr, 1, 12, f) != 12 || std::memcmp(hdr, "RIFF", 4) != 0 || std::memcmp(hdr + 8, "WAVE", 4) != 0) {
        err = "not-wav";
        return false;
    }

    int format = 0, channels = 0, bits = 0, blockAlign = 0;
    uint32_t rate = 0, dataSize = 0;
    bool haveFmt = false;
    for (;;) {
        unsigned char ch[8];
        if (std::fread(ch, 1, 8, f) != 8) { err = haveFmt ? "truncated" : "format"; return false; }
        uint32_t size = u32(ch + 4);
        if (std::memcmp(ch, "fmt ", 4) == 0) {
            if (size < 16 || size > 4096) { err = "format"; return false; }
            std::vector<unsigned char> b(size + (size & 1));
            if (std::fread(b.data(), 1, b.size(), f) != b.size()) { err = "truncated"; return false; }
            format = u16(&b[0]);
            channels = u16(&b[2]);
            rate = u32(&b[4]);
            blockAlign = u16(&b[12]);
            bits = u16(&b[14]);
            // WAVE_FORMAT_EXTENSIBLE: the real format is the first two bytes of the sub-format GUID
            if (format == 0xFFFE && size >= 40) format = u16(&b[24]);
            haveFmt = true;
        } else if (std::memcmp(ch, "data", 4) == 0) {
            if (!haveFmt) { err = "format"; return false; }
            dataSize = size;
            break;
        } else {
            // skip any other chunk (LIST, bext, iXML...); chunks are word aligned
            if (std::fseek(f, (long)(size + (size & 1)), SEEK_CUR) != 0) { err = "truncated"; return false; }
        }
    }

    bool isFloat = (format == 3);
    bool okFormat = (format == 1 && (bits == 8 || bits == 16 || bits == 24 || bits == 32)) ||
                    (format == 3 && (bits == 32 || bits == 64));
    if (!okFormat || channels <= 0 || rate == 0 || blockAlign != channels * (bits / 8)) { err = "format"; return false; }

    // Read the data chunk and nothing after it (a LIST or other chunk may follow).
    // A size of 0 or 0xFFFFFFFF is what a streaming writer leaves behind: then read
    // to the end of the file. A render that was cut short still yields every
    // complete frame.
    uint64_t remaining = (dataSize == 0 || dataSize == 0xFFFFFFFFu) ? UINT64_MAX : dataSize;
    std::vector<unsigned char> buf(1 << 20);
    const int bps = bits / 8;
    out.mono.clear();
    size_t leftover = 0;
    for (;;) {
        size_t want = buf.size() - leftover;
        if ((uint64_t)want > remaining) want = (size_t)remaining;
        size_t got = want ? std::fread(buf.data() + leftover, 1, want, f) : 0;
        remaining -= got;
        size_t have = leftover + got;
        size_t frames = have / blockAlign;
        for (size_t i = 0; i < frames; i++) {
            const unsigned char* p = buf.data() + i * blockAlign;
            double acc = 0.0;
            for (int c = 0; c < channels; c++, p += bps) {
                double v;
                if (isFloat) {
                    if (bits == 32) { float x; std::memcpy(&x, p, 4); v = x; }
                    else { double x; std::memcpy(&x, p, 8); v = x; }
                } else if (bits == 8) v = ((int)p[0] - 128) / 128.0;
                else if (bits == 16) v = (int16_t)u16(p) / 32768.0;
                else if (bits == 24) v = (double)((int32_t)(((uint32_t)p[0] << 8) | ((uint32_t)p[1] << 16) | ((uint32_t)p[2] << 24)) >> 8) / 8388608.0;
                else v = (int32_t)u32(p) / 2147483648.0;
                acc += v;
            }
            out.mono.push_back((float)(acc / channels));
        }
        leftover = have - frames * blockAlign;
        if (leftover) std::memmove(buf.data(), buf.data() + frames * blockAlign, leftover);
        if (got == 0) break;
    }
    out.sampleRate = (int)rate;
    out.channels = channels;
    out.bitsPerSample = bits;
    out.isFloat = isFloat;
    return true;
}

namespace {

uint32_t be32(const unsigned char* p) { return ((uint32_t)p[0] << 24) | ((uint32_t)p[1] << 16) | ((uint32_t)p[2] << 8) | (uint32_t)p[3]; }
uint16_t be16(const unsigned char* p) { return (uint16_t)((p[0] << 8) | p[1]); }

// IEEE 754 80-bit extended (big endian), the AIFF sample rate field
double ext80(const unsigned char* p) {
    int exp = ((p[0] & 0x7f) << 8) | p[1];
    uint64_t mant = 0;
    for (int i = 0; i < 8; i++) mant = (mant << 8) | p[2 + i];
    if (exp == 0 && mant == 0) return 0.0;
    double v = std::ldexp((double)mant, exp - 16383 - 63);
    return (p[0] & 0x80) ? -v : v;
}

}  // namespace

bool readAiff(const std::string& path, Audio& out, std::string& err) {
    FILE* f = openFile(path, "rb");
    if (!f) { err = "open"; return false; }
    FileCloser fc{f};
    unsigned char hdr[12];
    if (std::fread(hdr, 1, 12, f) != 12 || std::memcmp(hdr, "FORM", 4) != 0 ||
        (std::memcmp(hdr + 8, "AIFF", 4) != 0 && std::memcmp(hdr + 8, "AIFC", 4) != 0)) {
        err = "not-aiff";
        return false;
    }
    const bool aifc = std::memcmp(hdr + 8, "AIFC", 4) == 0;
    int channels = 0, bits = 0;
    uint32_t frames = 0;
    double rate = 0.0;
    bool little = false, isFloat = false, haveComm = false;
    for (;;) {
        unsigned char ch[8];
        if (std::fread(ch, 1, 8, f) != 8) { err = haveComm ? "truncated" : "format"; return false; }
        uint32_t size = be32(ch + 4);
        if (std::memcmp(ch, "COMM", 4) == 0) {
            if (size < 18 || size > 4096) { err = "format"; return false; }
            std::vector<unsigned char> b(size + (size & 1));
            if (std::fread(b.data(), 1, b.size(), f) != b.size()) { err = "truncated"; return false; }
            channels = be16(&b[0]);
            frames = be32(&b[2]);
            bits = be16(&b[6]);
            rate = ext80(&b[8]);
            if (aifc && size >= 22) {
                if (std::memcmp(&b[18], "sowt", 4) == 0) little = true;
                else if (std::memcmp(&b[18], "fl32", 4) == 0 || std::memcmp(&b[18], "FL32", 4) == 0) { isFloat = true; bits = 32; }
                else if (std::memcmp(&b[18], "fl64", 4) == 0 || std::memcmp(&b[18], "FL64", 4) == 0) { isFloat = true; bits = 64; }
                else if (std::memcmp(&b[18], "NONE", 4) != 0 && std::memcmp(&b[18], "twos", 4) != 0) { err = "format"; return false; }
            }
            haveComm = true;
        } else if (std::memcmp(ch, "SSND", 4) == 0) {
            if (!haveComm) { err = "format"; return false; }
            unsigned char ob[8];
            if (std::fread(ob, 1, 8, f) != 8) { err = "truncated"; return false; }
            if (be32(ob) && std::fseek(f, (long)be32(ob), SEEK_CUR) != 0) { err = "truncated"; return false; }
            break;
        } else if (std::fseek(f, (long)(size + (size & 1)), SEEK_CUR) != 0) {
            err = "truncated";
            return false;
        }
    }
    const int bps = (bits + 7) / 8;
    if (channels <= 0 || rate <= 0 || (!isFloat && (bps < 1 || bps > 4))) { err = "format"; return false; }
    const size_t block = (size_t)channels * bps;
    std::vector<unsigned char> buf(block * 8192);
    out.mono.clear();
    out.mono.reserve(frames);
    uint32_t left = frames;
    while (left > 0) {
        size_t want = std::min<size_t>(left, 8192);
        size_t got = std::fread(buf.data(), block, want, f);
        for (size_t i = 0; i < got; i++) {
            const unsigned char* p = buf.data() + i * block;
            double acc = 0.0;
            for (int c = 0; c < channels; c++, p += bps) {
                double v;
                if (isFloat) {
                    if (bits == 32) { uint32_t u = little ? u32(p) : be32(p); float x; std::memcpy(&x, &u, 4); v = x; }
                    else { uint64_t u = 0; for (int k = 0; k < 8; k++) u = (u << 8) | p[little ? 7 - k : k]; double x; std::memcpy(&x, &u, 8); v = x; }
                } else {
                    uint32_t u = 0;
                    for (int k = 0; k < bps; k++) u = (u << 8) | p[little ? bps - 1 - k : k];
                    u <<= (32 - 8 * bps);           // to the top, so the sign bit is bit 31
                    v = (double)(int32_t)u / 2147483648.0;
                }
                acc += v;
            }
            out.mono.push_back((float)(acc / channels));
        }
        if (got < want) break;   // cut short: keep what is there
        left -= (uint32_t)got;
    }
    out.sampleRate = (int)std::lround(rate);
    out.channels = channels;
    out.bitsPerSample = bits;
    out.isFloat = isFloat;
    return true;
}

bool readAudio(const std::string& path, Audio& out, std::string& err) {
    FILE* f = openFile(path, "rb");
    if (!f) { err = "open"; return false; }
    unsigned char h[12] = {0};
    size_t n = std::fread(h, 1, 12, f);
    std::fclose(f);
    if (n == 12 && std::memcmp(h, "RIFF", 4) == 0) return readWav(path, out, err);
    if (n == 12 && std::memcmp(h, "FORM", 4) == 0) return readAiff(path, out, err);
    err = "not-audio";
    return false;
}

}  // namespace bgbm
