@echo off
rem Build bgbeatmaker for Windows x64 with the VS 2022 Build Tools.
rem   build_win.cmd [ONNXRUNTIME_DIR] [BUILD_DIR]
setlocal
set "SRC=%~dp0.."
set "ORT=%~1"
if "%ORT%"=="" set "ORT=%USERPROFILE%\Documents\BeneGToolkit-build\analyzer\third_party\onnxruntime-win-x64-1.16.3"
set "OUT=%~2"
if "%OUT%"=="" set "OUT=%USERPROFILE%\Documents\BeneGToolkit-build\analyzer\build-win"
set "VS=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools"
call "%VS%\VC\Auxiliary\Build\vcvars64.bat" >nul || exit /b 1
set "CMAKE=%VS%\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"
"%CMAKE%" -S "%SRC%" -B "%OUT%" -G "Visual Studio 17 2022" -A x64 -DONNXRUNTIME_DIR="%ORT%" || exit /b 1
"%CMAKE%" --build "%OUT%" --config Release || exit /b 1
echo BUILT %OUT%\Release\bgbeatmaker.exe
