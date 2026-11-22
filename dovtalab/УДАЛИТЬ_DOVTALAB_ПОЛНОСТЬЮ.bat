@echo off
set "TARGET=%~dp0app\dovtalab"
if exist "%TARGET%" (
  rmdir /s /q "%TARGET%"
  echo Dovtalab section removed completely.
) else (
  echo Dovtalab folder is already absent.
)
pause
