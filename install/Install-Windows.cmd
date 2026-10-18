@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Windows.ps1"
if errorlevel 1 (echo Installation failed. Read the message above.) else (echo Installation complete. Restart After Effects.)
pause
