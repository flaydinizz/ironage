@echo off
chcp 65001 > nul
echo Testando conexao com o servidor Iron Age...
echo.

curl -s -o nul -w "HTTP Status: %%{http_code}\n" http://localhost:3001/health
if errorlevel 1 (
    echo.
    echo SERVIDOR NAO ESTA RODANDO!
    echo Execute primeiro: npm run dev  dentro de apps/server/
) else (
    echo.
    echo Servidor respondendo OK!
    curl -s http://localhost:3001/health
)
echo.
pause
