@echo off
TITLE Network Monitor - Kurulum

set ROOT_DIR=%~dp0
cd /d "%ROOT_DIR%"

echo [1/4] Dizin: %ROOT_DIR%

if not exist "%ROOT_DIR%.venv\Scripts\activate.bat" (
    echo [2/4] Sanal ortam olusturuluyor...
    python -m venv "%ROOT_DIR%.venv"
    if errorlevel 1 (
        echo HATA: python bulunamadi. Python 3.10+ yuklü oldugundan emin olun.
        pause
        exit /b 1
    )
)

echo [2/4] Sanal ortam aktif ediliyor...
call "%ROOT_DIR%.venv\Scripts\activate.bat"

echo [3/4] Bagimliliklar yukleniyor...
pip install -r "%ROOT_DIR%backend\requirements.txt" --quiet
if errorlevel 1 (
    echo HATA: Paket kurulumu basarisiz.
    pause
    exit /b 1
)

echo [4/4] Uygulama baslatiliyor...

set PYTHONW="%ROOT_DIR%.venv\Scripts\pythonw.exe"
set PYTHON="%ROOT_DIR%.venv\Scripts\python.exe"

if exist %PYTHONW% (
    start "" %PYTHONW% "%ROOT_DIR%tray_app.py"
) else (
    start "" %PYTHON% "%ROOT_DIR%tray_app.py"
)

exit
