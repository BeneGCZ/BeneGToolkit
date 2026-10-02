#include "platform.h"

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#else
#include <sys/resource.h>
#include <unistd.h>
#endif

namespace bgbm {

#ifdef _WIN32
std::wstring widen(const std::string& s) {
    if (s.empty()) return std::wstring();
    int n = MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), nullptr, 0);
    std::wstring w(n, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.data(), (int)s.size(), &w[0], n);
    return w;
}

std::string narrow(const std::wstring& w) {
    if (w.empty()) return std::string();
    int n = WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), nullptr, 0, nullptr, nullptr);
    std::string s(n, '\0');
    WideCharToMultiByte(CP_UTF8, 0, w.data(), (int)w.size(), &s[0], n, nullptr, nullptr);
    return s;
}
#endif

FILE* openFile(const std::string& path, const char* mode) {
#ifdef _WIN32
    return _wfopen(widen(path).c_str(), widen(mode).c_str());
#else
    return std::fopen(path.c_str(), mode);
#endif
}

std::string lowerPriorityAndCapMemory(int maxMemMb) {
    std::string done;
#ifdef _WIN32
    if (SetPriorityClass(GetCurrentProcess(), BELOW_NORMAL_PRIORITY_CLASS)) done += "priority below normal";
    if (maxMemMb > 0) {
        // A job object caps the committed memory of this process: past the cap an
        // allocation fails (the analyzer reports it) instead of the machine paging
        // After Effects out. Nested jobs work from Windows 8 on.
        HANDLE job = CreateJobObjectW(nullptr, nullptr);
        if (job) {
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION li;
            ZeroMemory(&li, sizeof(li));
            li.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_PROCESS_MEMORY;
            li.ProcessMemoryLimit = (SIZE_T)maxMemMb * 1024 * 1024;
            if (SetInformationJobObject(job, JobObjectExtendedLimitInformation, &li, sizeof(li)) &&
                AssignProcessToJobObject(job, GetCurrentProcess())) {
                if (!done.empty()) done += ", ";
                done += "memory cap " + std::to_string(maxMemMb) + " MB";
            }
        }
    }
#else
    // nice 10: below normal. macOS has no dependable per-process memory cap
    // (RLIMIT_AS is not enforced), so only the priority is lowered there.
    if (setpriority(PRIO_PROCESS, 0, 10) == 0) done += "nice 10";
    (void)maxMemMb;
#endif
    return done.empty() ? "unchanged" : done;
}

}  // namespace bgbm
