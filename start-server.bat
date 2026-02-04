@echo off
"%SystemRoot%\System32\chcp.exe" 65001 >nul 2>&1
set PORT=8000
set PYCMD=python
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    where py >nul 2>&1
    if %ERRORLEVEL% EQU 0 (set PYCMD=py) else (
        echo [오류] Python이 설치되어 있지 않거나 PATH에 없습니다.
        echo python 또는 py 로 실행 가능해야 합니다.
        pause
        exit /b 1
    )
)
if not exist "server.py" (
    echo [오류] server.py 를 찾을 수 없습니다. 이 bat 파일을 프로젝트 폴더에서 실행하세요.
    pause
    exit /b 1
)
echo ========================================
echo   로또 서버 (Flask) - server.py 실행
echo   ※ python -m http.server 쓰면 /api/lotto-latest 404
echo ========================================
echo.
%PYCMD% server.py
pause
