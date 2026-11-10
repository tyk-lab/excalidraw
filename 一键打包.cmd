@echo off
setlocal
title Excalidraw - Build Windows EXE
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-windows.ps1" %*
exit /b %errorlevel%
