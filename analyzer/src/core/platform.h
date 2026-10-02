// Small platform layer: UTF-8 paths on every OS, process priority and memory cap.
// Kept free of std::filesystem - it only exists from macOS 10.15, and the analyzer
// has to run on 10.14 (the oldest the inference runtime supports).
#pragma once
#include <cstdio>
#include <string>

namespace bgbm {

// fopen with a UTF-8 path (on Windows through the wide API, so "Hudba – ěščř"
// opens like any other folder).
FILE* openFile(const std::string& utf8Path, const char* mode);

#ifdef _WIN32
std::wstring widen(const std::string& utf8);
std::string narrow(const std::wstring& wide);
#endif

// Run below normal priority so After Effects stays responsive, and (Windows)
// put the process in a job object that refuses allocations past maxMemMb.
// Returns a short description of what was applied, for the log.
std::string lowerPriorityAndCapMemory(int maxMemMb);

}  // namespace bgbm
