@echo off
title Tirotir Ultimate Board v2.2.0
cd /d %~dp0\..
set HOST=0.0.0.0
set PORT=7001
set ADMIN_KEY=secret123
rem Optional CSP controls:
rem set USE_CSP=1
rem set ALLOW_UNSAFE_EVAL=1
rem Allow student paste:
rem set ALLOW_VIEWER_PASTE=1
npm start
