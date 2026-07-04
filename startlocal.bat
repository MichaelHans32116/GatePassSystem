@echo off
setlocal
call "%~dp0start-local.bat" %*
exit /b %errorlevel%
