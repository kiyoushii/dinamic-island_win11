@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo Устанавливаю зависимости, это один раз...
  call npm install
)
start "" /b npx electron .
