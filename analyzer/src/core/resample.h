// Sample-rate conversion to the tracker's 22050 Hz.
#pragma once
#include <vector>

namespace bgbm {

// Linear-phase windowed-sinc conversion by the exact rational ratio (48000 ->
// 22050 is 147/320), so no time shift and no drift: output sample n sits exactly
// at input time n * inRate / outRate. Kaiser window (beta 12), cutoff at 95.5 %
// of the lower Nyquist, 64 zero crossings each side.
std::vector<float> resample(const std::vector<float>& x, int inRate, int outRate);

}  // namespace bgbm
