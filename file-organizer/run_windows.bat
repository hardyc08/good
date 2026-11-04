@echo off
rem File Organizer - double-click to start (needs Python 3.8+ from python.org)
cd /d "%~dp0"
where pyw >nul 2>nul && (start "" pyw -3 -m file_organizer & exit /b 0)
where pythonw >nul 2>nul && (start "" pythonw -m file_organizer & exit /b 0)
where py >nul 2>nul && (py -3 -m file_organizer & exit /b 0)
where python >nul 2>nul && (python -m file_organizer & exit /b 0)
echo.
echo  Python 3 was not found on this computer.
echo  Please install it from https://www.python.org/downloads/
echo  (tick "Add python.exe to PATH" during setup), then run this file again.
echo.
start "" https://www.python.org/downloads/
pause
