@echo off
REM ============================================================
REM  Monitor Cripto - lanzador para Windows
REM  Inicia el servidor local (tablero + actualizacion automatica)
REM  y abre el navegador en http://localhost:8080
REM ============================================================
title Monitor Cripto
cd /d "%~dp0"

py -3 --version >nul 2>nul
if %errorlevel%==0 (
  py -3 serve.py %*
  goto :fin
)

python --version >nul 2>nul
if %errorlevel%==0 (
  python serve.py %*
  goto :fin
)

wsl.exe -e python3 --version >nul 2>nul
if %errorlevel%==0 (
  echo Python de Windows no encontrado: usando Python dentro de WSL.
  start "" cmd /c "ping -n 4 127.0.0.1 >nul & start "" http://localhost:8080/"
  wsl.exe -e python3 serve.py --no-browser %*
  goto :fin
)

echo.
echo  No se encontro Python.
echo  1) Instalalo desde https://www.python.org/downloads/  (marca "Add python.exe to PATH")
echo  2) Volve a abrir este archivo.
echo.
echo  Mientras tanto se abre el tablero en modo archivo local (precios en vivo,
echo  fundamentales y noticias del ultimo snapshot).
start "" "%~dp0index.html"
pause

:fin
