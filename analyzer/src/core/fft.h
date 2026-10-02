// In-place iterative radix-2 complex FFT, sizes that are powers of two.
#pragma once
#include <cmath>
#include <utility>
#include <vector>

namespace bgbm {

struct Fft {
    int n;
    std::vector<int> rev;
    std::vector<double> cs, sn;

    explicit Fft(int n_) : n(n_), rev(n_), cs(n_ / 2), sn(n_ / 2) {
        const double PI = 3.14159265358979323846;
        int bits = 0;
        while ((1 << bits) < n) bits++;
        for (int i = 0; i < n; i++) {
            int r = 0;
            for (int b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
            rev[i] = r;
        }
        for (int i = 0; i < n / 2; i++) { cs[i] = std::cos(2 * PI * i / n); sn[i] = -std::sin(2 * PI * i / n); }
    }

    void run(double* re, double* im) const {
        for (int i = 0; i < n; i++) {
            int r = rev[i];
            if (r > i) { std::swap(re[i], re[r]); std::swap(im[i], im[r]); }
        }
        for (int len = 2; len <= n; len <<= 1) {
            int half = len >> 1, step = n / len;
            for (int i = 0; i < n; i += len) {
                for (int k = 0; k < half; k++) {
                    double wr = cs[k * step], wi = sn[k * step];
                    double xr = re[i + k + half], xi = im[i + k + half];
                    double tr = xr * wr - xi * wi, ti = xr * wi + xi * wr;
                    re[i + k + half] = re[i + k] - tr;
                    im[i + k + half] = im[i + k] - ti;
                    re[i + k] += tr;
                    im[i + k] += ti;
                }
            }
        }
    }
};

}  // namespace bgbm
