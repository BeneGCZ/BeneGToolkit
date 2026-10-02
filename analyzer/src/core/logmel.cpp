#include "logmel.h"
#include "fft.h"

#include <cmath>
#include <cstdint>

namespace bgbm {

namespace {

const double PI = 3.14159265358979323846;

// Slaney mel scale (linear below 1 kHz, logarithmic above), as the model's
// training front end defines it.
double hzToMel(double f) {
    const double f_sp = 200.0 / 3.0, min_log_hz = 1000.0, min_log_mel = min_log_hz / f_sp;
    const double logstep = std::log(6.4) / 27.0;
    return f >= min_log_hz ? min_log_mel + std::log(f / min_log_hz) / logstep : f / f_sp;
}

double melToHz(double m) {
    const double f_sp = 200.0 / 3.0, min_log_hz = 1000.0, min_log_mel = min_log_hz / f_sp;
    const double logstep = std::log(6.4) / 27.0;
    return m >= min_log_mel ? min_log_hz * std::exp(logstep * (m - min_log_mel)) : f_sp * m;
}

}  // namespace

LogMel::LogMel() : window_(N_FFT), fb_((size_t)N_FREQS * N_MELS, 0.0), fbLo_(N_MELS, N_FREQS), fbHi_(N_MELS, -1) {
    for (int i = 0; i < N_FFT; i++) window_[i] = 0.5 - 0.5 * std::cos(2 * PI * i / N_FFT);   // periodic Hann

    const double fMin = 30.0, fMax = 11000.0;
    std::vector<double> allFreqs(N_FREQS), fPts(N_MELS + 2);
    for (int k = 0; k < N_FREQS; k++) allFreqs[k] = (SAMPLE_RATE / 2) * (double)k / (N_FREQS - 1);
    const double mMin = hzToMel(fMin), mMax = hzToMel(fMax);
    for (int i = 0; i < N_MELS + 2; i++) fPts[i] = melToHz(mMin + (mMax - mMin) * i / (N_MELS + 1));
    for (int k = 0; k < N_FREQS; k++) {
        for (int m = 0; m < N_MELS; m++) {
            double down = (allFreqs[k] - fPts[m]) / (fPts[m + 1] - fPts[m]);     // rising edge
            double up = (fPts[m + 2] - allFreqs[k]) / (fPts[m + 2] - fPts[m + 1]); // falling edge
            double v = std::fmax(0.0, std::fmin(down, up));
            fb_[(size_t)k * N_MELS + m] = v;
            if (v > 0) { if (k < fbLo_[m]) fbLo_[m] = k; if (k > fbHi_[m]) fbHi_[m] = k; }
        }
    }
}

std::vector<float> LogMel::compute(const std::vector<float>& x, int& frames) const {
    const int64_t n = (int64_t)x.size();
    const int pad = N_FFT / 2;
    frames = (int)(1 + n / HOP);
    std::vector<float> out((size_t)frames * N_MELS);
    if (n == 0) return out;

    // reflect padding (the edge sample itself is not repeated)
    auto at = [&](int64_t i) -> double {
        while (i < 0 || i >= n) {
            if (i < 0) i = -i;
            if (i >= n) i = 2 * (n - 1) - i;
            if (n == 1) { i = 0; break; }
        }
        return x[(size_t)i];
    };

    Fft fft(N_FFT);
    std::vector<double> re(N_FFT), im(N_FFT), mag(N_FREQS);
    const double norm = 1.0 / std::sqrt((double)N_FFT);    // normalized="frame_length"
    for (int t = 0; t < frames; t++) {
        int64_t start = (int64_t)t * HOP - pad;
        if (start >= 0 && start + N_FFT <= n) {
            const float* xs = &x[(size_t)start];
            for (int i = 0; i < N_FFT; i++) { re[i] = xs[i] * window_[i]; im[i] = 0.0; }
        } else {
            for (int i = 0; i < N_FFT; i++) { re[i] = at(start + i) * window_[i]; im[i] = 0.0; }
        }
        fft.run(re.data(), im.data());
        for (int k = 0; k < N_FREQS; k++) mag[k] = std::sqrt(re[k] * re[k] + im[k] * im[k]) * norm;
        float* row = &out[(size_t)t * N_MELS];
        for (int m = 0; m < N_MELS; m++) {
            double acc = 0.0;
            for (int k = fbLo_[m]; k <= fbHi_[m]; k++) acc += mag[k] * fb_[(size_t)k * N_MELS + m];
            row[m] = (float)std::log1p(1000.0 * acc);
        }
    }
    return out;
}

}  // namespace bgbm
