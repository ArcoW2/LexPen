@echo off
rem Builds LexPenShell.dll (docs/plans/40-PLAN-explorer-compare-two.md 3.4) into %1 with Visual Studio's C++ tools,
rem its intermediate files in %2. Called by LexPen.csproj after each build. Without the C++ tools: a warning, no DLL.
rem Explorer keeps a DLL it loaded open: then the old one is renamed (that is allowed), the new one takes its name.
setlocal
set "OUT=%~1"
set "OBJ=%~2"
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
set "VS="
if exist "%VSWHERE%" for /f "usebackq delims=" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VS=%%i"
if not defined VS (
  echo warning: LexPenShell.dll not built: Visual Studio's C++ tools ^(Desktop development with C++^) are not installed.
  exit /b 0
)
if not exist "%OBJ%" mkdir "%OBJ%"
call "%VS%\VC\Auxiliary\Build\vcvars64.bat" >nul 2>nul || exit /b 1
cl /nologo /O2 /EHsc /std:c++17 /W4 /WX /MT /LD /Fo"%OBJ%\\" "%~dp0LexPenShell.cpp" ^
  /link /DEF:"%~dp0LexPenShell.def" /OUT:"%OBJ%\LexPenShell.dll" /IMPLIB:"%OBJ%\LexPenShell.lib" shlwapi.lib ole32.lib shell32.lib runtimeobject.lib advapi32.lib user32.lib || exit /b 1
rem Old ones Explorer no longer holds: gone.
del /q "%OUT%\LexPenShell.*.old" 2>nul
copy /y "%OBJ%\LexPenShell.dll" "%OUT%\LexPenShell.dll" >nul 2>nul && exit /b 0
ren "%OUT%\LexPenShell.dll" "LexPenShell.%RANDOM%%RANDOM%.old" || exit /b 1
copy /y "%OBJ%\LexPenShell.dll" "%OUT%\LexPenShell.dll" >nul || exit /b 1
