#include "features.h"
#include "fft.h"
#include "logmel.h"

#include <algorithm>
#include <cmath>
#include <cstdint>

namespace bgbm {

namespace {

const double PI = 3.14159265358979323846;
const double SR = LogMel::SAMPLE_RATE;

std::vector<double> hann(int n) {
    std::vector<double> w(n);
    for (int i = 0; i < n; i++) w[i] = 0.5 - 0.5 * std::cos(2 * PI * (i + 0.5) / n);   // symmetric about its centre
    return w;
}

// Sample i of x, zero outside - windows near the ends see silence, not a mirror,
// so an attack at the very start is not duplicated.
inline double at(const std::vector<float>& x, int64_t i) {
    return (i >= 0 && i < (int64_t)x.size()) ? x[(size_t)i] : 0.0;
}

float db(double e) { return (float)(10.0 * std::log10(e + 1e-12)); }

}  // namespace

void computeFeatures(const std::vector<float>& x, const std::vector<float>& logmel, int melFrames, Features& f) {
    const double dur = x.size() / SR;

    // --- envelope: 5 ms Hann every 1 ms, centred ---
    {
        const int W = 110;                       // 4.99 ms at 22050 Hz
        std::vector<double> w = hann(W);
        double wsum = 0; for (double v : w) wsum += v * v;
        f.envFrames = (int)std::floor(dur * Features::ENV_RATE) + 1;
        f.env.resize((size_t)f.envFrames);
        for (int k = 0; k < f.envFrames; k++) {
            int64_t c = (int64_t)std::llround(k * SR / Features::ENV_RATE);
            int64_t s = c - W / 2;
            double e = 0;
            for (int i = 0; i < W; i++) { double v = at(x, s + i) * w[i]; e += v * v; }
            f.env[(size_t)k] = db(e / wsum);
        }
    }

    // --- four bands: 512-point (23 ms) Hann every 10 ms, centred ---
    {
        const int N = 512;
        Fft fft(N);
        std::vector<double> w = hann(N), re(N), im(N);
        double wsum = 0; for (double v : w) wsum += v * v;
        const double edges[5] = {20.0, 150.0, 800.0, 4000.0, SR / 2};
        int lo[4], hi[4];
        for (int b = 0; b < 4; b++) {
            lo[b] = (int)std::ceil(edges[b] * N / SR);
            hi[b] = std::min(N / 2, (int)std::floor(edges[b + 1] * N / SR - 1e-9));
        }
        f.bandFrames = (int)std::floor(dur * Features::BAND_RATE) + 1;
        f.bands.resize((size_t)f.bandFrames * 4);
        for (int k = 0; k < f.bandFrames; k++) {
            int64_t c = (int64_t)std::llround(k * SR / Features::BAND_RATE);
            for (int i = 0; i < N; i++) { re[i] = at(x, c - N / 2 + i) * w[i]; im[i] = 0; }
            fft.run(re.data(), im.data());
            for (int b = 0; b < 4; b++) {
                double e = 0;
                for (int j = lo[b]; j <= hi[b]; j++) e += re[j] * re[j] + im[j] * im[j];
                f.bands[(size_t)k * 4 + b] = db(2.0 * e / (N * wsum));
            }
        }
    }

    // --- chroma: 4096-point (186 ms) Hann every 100 ms, centred ---
    {
        const int N = 4096;
        Fft fft(N);
        std::vector<double> w = hann(N), re(N), im(N);
        std::vector<int> pc(N / 2 + 1, -1);
        for (int j = 1; j <= N / 2; j++) {
            double hz = j * SR / N;
            if (hz < 55.0 || hz > 5000.0) continue;
            int midi = (int)std::lround(69.0 + 12.0 * std::log2(hz / 440.0));
            pc[j] = ((midi % 12) + 12) % 12;
        }
        f.slowFrames = (int)std::floor(dur * Features::SLOW_RATE) + 1;
        f.chroma.assign((size_t)f.slowFrames * 12, 0.0f);
        for (int k = 0; k < f.slowFrames; k++) {
            int64_t c = (int64_t)std::llround(k * SR / Features::SLOW_RATE);
            for (int i = 0; i < N; i++) { re[i] = at(x, c - N / 2 + i) * w[i]; im[i] = 0; }
            fft.run(re.data(), im.data());
            double acc[12] = {0};
            for (int j = 1; j <= N / 2; j++) {
                if (pc[j] < 0) continue;
                double mag = std::sqrt(re[j] * re[j] + im[j] * im[j]) / N;
                acc[pc[j]] += std::log1p(1000.0 * mag);
            }
            double mx = 0; for (double v : acc) mx = std::max(mx, v);
            if (mx > 1e-6) for (int p = 0; p < 12; p++) f.chroma[(size_t)k * 12 + p] = (float)(acc[p] / mx);
        }
    }

    // --- tone colour: DCT-II of the log-mel spectrogram, 5 frames (100 ms) averaged ---
    {
        const int M = LogMel::N_MELS, C = 13;
        std::vector<double> dct((size_t)C * M);
        for (int c = 0; c < C; c++)
            for (int m = 0; m < M; m++) dct[(size_t)c * M + m] = std::cos(PI * c * (m + 0.5) / M) * std::sqrt((c == 0 ? 1.0 : 2.0) / M);
        f.mfcc.assign((size_t)f.slowFrames * C, 0.0f);
        std::vector<double> avg(M);
        for (int k = 0; k < f.slowFrames; k++) {
            int mid = k * 5, n = 0;                    // 50 fps -> 10 fps
            std::fill(avg.begin(), avg.end(), 0.0);
            for (int t = mid - 2; t <= mid + 2; t++) {
                if (t < 0 || t >= melFrames) continue;
                for (int m = 0; m < M; m++) avg[m] += logmel[(size_t)t * M + m];
                n++;
            }
            if (!n) continue;
            for (int c = 0; c < C; c++) {
                double s = 0;
                for (int m = 0; m < M; m++) s += avg[m] / n * dct[(size_t)c * M + m];
                f.mfcc[(size_t)k * C + c] = (float)s;
            }
        }
    }
}

}  // namespace bgbm
