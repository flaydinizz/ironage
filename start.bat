@echo off
chcp 65001 > nul
title Iron Age — Inicialização

echo.
echo ╔══════════════════════════════════════════════╗
echo ║           ⚔  IRON AGE  — SETUP              ║
echo ╚══════════════════════════════════════════════╝
echo.

:: ── Diretório do servidor ────────────────────────────────────
set SERVER_DIR=%~dp0public\js\apps\server
set CLIENT_DIR=%~dp0public\js\apps\client

echo [1/5] Verificando Node.js...
node -v > nul 2>&1
if errorlevel 1 (
    echo  ERRO: Node.js nao encontrado. Instale em https://nodejs.org
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo  OK: Node.js %%v

echo.
echo [2/5] Verificando dependencias do servidor...
if not exist "%SERVER_DIR%\node_modules" (
    echo  Instalando dependencias ^(primeira vez^)...
    cd /d "%SERVER_DIR%"
    call npm install
    if errorlevel 1 ( echo  ERRO no npm install. & pause & exit /b 1 )
    echo  Dependencias instaladas.
) else (
    echo  OK: node_modules ja existe.
)

echo.
echo [3/5] Verificando banco de dados...
cd /d "%SERVER_DIR%"
if not exist "data" mkdir data
if not exist "data\survival.db" (
    echo  Banco nao encontrado — gerando migrations e seed...
    call npm run db:gen
    call npm run db:push
    call npm run seed
    if errorlevel 1 ( echo  ERRO no setup do banco. & pause & exit /b 1 )
    echo  Banco inicializado com sucesso.
) else (
    echo  OK: banco survival.db ja existe.
)

echo.
echo [4/5] Verificando arquivo .env...
if not exist "%SERVER_DIR%\.env" (
    echo  AVISO: .env nao encontrado — criando com valores padrao...
    (
        echo PORT=3001
        echo HOST=0.0.0.0
        echo NODE_ENV=development
        echo LOG_LEVEL=info
        echo JWT_SECRET=ironage_dev_secret_mude_em_producao
        echo JWT_EXPIRES_IN=7d
        echo DB_DIR=./data
        echo DB_FILE=survival.db
        echo CLIENT_ORIGIN=http://localhost:3000
    ) > "%SERVER_DIR%\.env"
    echo  .env criado.
) else (
    echo  OK: .env encontrado.
)

echo.
echo [5/5] Iniciando servidor...
echo.
echo  Servidor:  http://localhost:3001
echo  Health:    http://localhost:3001/health
echo  Cliente:   Abra %CLIENT_DIR%\index.html no browser
echo             ou rode: npx serve "%CLIENT_DIR%" -p 3000
echo.
echo  Pressione Ctrl+C para parar o servidor.
echo ─────────────────────────────────────────────
echo.

cd /d "%SERVER_DIR%"
npm run dev & cmd /k
