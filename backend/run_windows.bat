@echo off
echo ========================================================
echo   PlatoonCommand - Central Command Center Launcher
echo ========================================================
echo.

IF NOT EXIST "venv" (
    echo Creating Python virtual environment...
    python -m venv venv
)

echo Activating virtual environment...
call venv\Scripts\activate.bat

echo Checking and installing dependencies...
pip install -r requirements.txt

echo.
echo Starting PlatoonCommand Server on http://localhost:8000 ...
python main.py

pause
