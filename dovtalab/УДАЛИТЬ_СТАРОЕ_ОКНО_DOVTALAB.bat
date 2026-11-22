@echo off
set "TARGET=%~dp0app\dovtalab\index.html"
if exist "%TARGET%" (
  del /f /q "%TARGET%"
  echo Old Dovtalab fallback removed.
) else (
  echo Old fallback was not found.
)
pause
