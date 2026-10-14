@echo off
chcp 65001 >nul
rem easy3D 미리보기(윈도우) — 더블클릭. 서버를 켜고 브라우저로 http://localhost:8099/ 를 연다.
rem 이 창을 닫으면 서버가 꺼진다. 맥에서는 serve.command 를 쓴다.
cd /d "%~dp0"
set "URL=http://localhost:8099/"
set "PY=python3"
where python3 >nul 2>nul || set "PY=py -3"
start "" cmd /c "timeout /t 2 /nobreak >nul & start "" %URL%"
%PY% serve.py
echo.
echo 서버가 끝났습니다. 이미 켜져 있었다면 브라우저만 열린 것입니다.
pause
