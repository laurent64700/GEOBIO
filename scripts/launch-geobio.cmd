@echo off
setlocal
set "PATH=C:\Program Files\nodejs;%PATH%"
set "REPO=D:\LAURENT PC\GEOBIO"
set "PORT=4173"

cd /d "%REPO%"

rem Only rebuild if dist/ is missing - avoids a slow rebuild on every launch;
rem Laurent (or whoever ships a code change) is expected to run `npm run build`
rem manually after pulling new code, this script is for RUNNING what's already
rem built, not for redeploying. Echo a reminder so an old build is never
rem silently reused without Laurent knowing - a stale build during the actual
rem field test week would be confusing and hard to diagnose from the field.
if not exist "%REPO%\dist" (
  echo Premier lancement : construction du build de production...
  call npm run build
) else (
  echo Build existant reutilise ^(lancez "npm run build" pour reconstruire^).
)

rem Check if something is already listening on PORT before starting a second
rem preview server - avoids "address already in use" on a second click.
rem CRITICAL: the /C: switch is required. Without it, findstr splits its
rem search string on whitespace into separate OR'd terms, so the trailing
rem space after %PORT% is treated as a token delimiter, not a literal
rem character - ":4173 " would then also match ":41730", ":417300", etc. from
rem an unrelated process, wrongly skipping this launcher's own server start.
netstat -ano | findstr /C:":%PORT% " | findstr "LISTENING" >nul
if errorlevel 1 (
  rem Use `start`'s own /d switch to set the child's working directory -
  rem NOT a nested `cd /d ""%REPO%"" && ...` inside the cmd /c string,
  rem which silently collapses to a no-op `cd /d` (prints/keeps the current
  rem dir) rather than actually changing it. It would appear to work here
  rem only by accident, via inheriting this script's own already-correct
  rem `cd /d "%REPO%"` above - fragile the moment this snippet is reordered
  rem or copied elsewhere.
  start "" /min /d "%REPO%" cmd /c "npm run preview -- --port %PORT% --strictPort"
  rem Give the server a moment to bind before opening the browser.
  timeout /t 2 /nobreak >nul
)

start "" "http://localhost:%PORT%"
endlocal
