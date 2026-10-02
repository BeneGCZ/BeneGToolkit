# bgbeatmaker - the Beat Maker analyzer (native, runs outside After Effects).
#
# Windows (x64, from a VS 2022 developer prompt or with vcvars64):
#   cmake -S . -B <build> -G "Visual Studio 17 2022" -A x64 -DONNXRUNTIME_DIR=<onnxruntime-win-x64-1.16.3>
#   cmake --build <build> --config Release
# macOS (universal: Intel + Apple Silicon, from 10.14 - the runtime's own floor):
#   cmake -S . -B <build> -DONNXRUNTIME_DIR=<onnxruntime-osx-universal2-1.16.3> -DCMAKE_BUILD_TYPE=Release
#   cmake --build <build>
#
# The compiler's baseline instruction set only: no /arch:AVX, no -mavx. The
# inference runtime picks faster kernels itself at run time.
cmake_minimum_required(VERSION 3.16)

if(APPLE)
    set(CMAKE_OSX_ARCHITECTURES "x86_64;arm64" CACHE STRING "")
    set(CMAKE_OSX_DEPLOYMENT_TARGET "10.14" CACHE STRING "")
endif()

project(bgbeatmaker CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(ONNXRUNTIME_DIR "" CACHE PATH "Unpacked ONNX Runtime package (include/, lib/)")
if(NOT ONNXRUNTIME_DIR)
    message(FATAL_ERROR "Set ONNXRUNTIME_DIR to an unpacked ONNX Runtime 1.16.3 package")
endif()

if(MSVC)
    # static C runtime: nothing to install on the user's machine for our own code
    set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
    add_compile_options(/utf-8 /W3 /EHsc)
    add_compile_definitions(_CRT_SECURE_NO_WARNINGS NOMINMAX)
endif()

add_library(bgbm_core STATIC
    src/core/platform.cpp
    src/core/audio_io.cpp
    src/core/resample.cpp
    src/core/logmel.cpp
    src/core/features.cpp
    src/core/tracker.cpp
    src/core/analyze.cpp)
target_include_directories(bgbm_core PUBLIC src/core ${ONNXRUNTIME_DIR}/include)

if(WIN32)
    target_link_libraries(bgbm_core PUBLIC ${ONNXRUNTIME_DIR}/lib/onnxruntime.lib)
elseif(APPLE)
    target_link_libraries(bgbm_core PUBLIC ${ONNXRUNTIME_DIR}/lib/libonnxruntime.dylib)
else()
    target_link_libraries(bgbm_core PUBLIC ${ONNXRUNTIME_DIR}/lib/libonnxruntime.so)
endif()

add_executable(bgbeatmaker src/cli/main.cpp)
target_link_libraries(bgbeatmaker PRIVATE bgbm_core)

if(APPLE)
    # the runtime library ships next to the executable
    set_target_properties(bgbeatmaker PROPERTIES BUILD_RPATH "@executable_path" INSTALL_RPATH "@executable_path")
endif()

# the runtime next to the executable, so the build folder runs as it is
if(WIN32)
    add_custom_command(TARGET bgbeatmaker POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different ${ONNXRUNTIME_DIR}/lib/onnxruntime.dll $<TARGET_FILE_DIR:bgbeatmaker>)
elseif(APPLE)
    add_custom_command(TARGET bgbeatmaker POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different ${ONNXRUNTIME_DIR}/lib/libonnxruntime.1.16.3.dylib $<TARGET_FILE_DIR:bgbeatmaker>)
endif()
