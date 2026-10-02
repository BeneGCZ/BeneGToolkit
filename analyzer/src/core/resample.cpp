#include "resample.h"

#include <algorithm>
#include <cmath>
#include <cstdint>

namespace bgbm {

namespace {

const double PI = 3.14159265358979323846;

int gcd(int a, int b) { while (b) { int t = a % b; a = b; b = t; } return a; }

// Modified Bessel function of the first kind, order 0 (series; converges fast for
// the arguments a Kaiser window needs).
double besselI0(double x) {
    double sum = 1.0, term = 1.0, q = x * x / 4.0;
    for (int k = 1; k < 200; k++) {
        term *= q / ((double)k * k);
        sum += term;
        if (term < sum * 1e-17) break;
    }
    return sum;
}

}  // namespace

std::vector<float> resample(const std::vector<float>& x, int inRate, int outRate) {
    if (inRate == outRate || x.empty()) return x;
    const int g = gcd(inRate, outRate);
    const int L = outRate / g, M = inRate / g;          // up by L, down by M
    // Chosen against the resampler the model's reference pipeline uses, by the
    // log-mel difference (tools/tune_resampler.py): 0.955 / 64 / 12 gave a mean
    // difference of 0.0017 (0.95 / 32 / 10 left 0.0065, all of it in the top bands).
    const double ROLLOFF = 0.955, BETA = 12.0;
    const int ZC = 64;
    // cutoff in cycles per INPUT sample
    const double fc = 0.5 * std::min(1.0, (double)L / M) * ROLLOFF;
    const double hw = ZC / (2.0 * fc);                   // half width, input samples
    const int K = (int)std::ceil(hw);
    const int taps = 2 * K + 1;
    const double i0b = besselI0(BETA);

    // Polyphase table: output n reads input around t = n*M/L; with k0 = floor(t)
    // and phase p = (n*M) mod L the kernel is h(p/L - j) for j = -K..K.
    std::vector<double> table((size_t)L * taps);
    for (int p = 0; p < L; p++) {
        double sum = 0.0;
        for (int j = -K; j <= K; j++) {
            double d = (double)p / L - j;
            double h = 0.0;
            if (std::fabs(d) < hw) {
                double arg = 2.0 * fc * d;
                double sinc = (std::fabs(arg) < 1e-12) ? 1.0 : std::sin(PI * arg) / (PI * arg);
                double u = d / hw;
                double w = besselI0(BETA * std::sqrt(std::max(0.0, 1.0 - u * u))) / i0b;
                h = 2.0 * fc * sinc * w;
            }
            table[(size_t)p * taps + (j + K)] = h;
            sum += h;
        }
        // unity gain at DC for every phase
        for (int j = 0; j < taps; j++) table[(size_t)p * taps + j] /= sum;
    }

    const int64_t n_in = (int64_t)x.size();
    const int64_t n_out = (n_in * L + M - 1) / M;
    std::vector<float> y((size_t)n_out);
    for (int64_t n = 0; n < n_out; n++) {
        int64_t num = n * M;
        int64_t k0 = num / L;
        int p = (int)(num % L);
        const double* h = &table[(size_t)p * taps];
        double acc = 0.0;
        int64_t lo = k0 - K, hi = k0 + K;
        if (lo >= 0 && hi < n_in) {
            const float* xs = &x[(size_t)lo];
            for (int j = 0; j < taps; j++) acc += xs[j] * h[j];
        } else {
            for (int j = 0; j < taps; j++) {
                int64_t k = lo + j;
                if (k >= 0 && k < n_in) acc += x[(size_t)k] * h[j];
            }
        }
        y[(size_t)n] = (float)acc;
    }
    return y;
}

}  // namespace bgbm
