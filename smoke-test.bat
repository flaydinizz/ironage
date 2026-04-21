,0
0,@echo off
chcp 65001 > nul
title Iron Age — Smoke Tests (Etapa 9)
setlocal EnableDelayedExpansion

set BASE=http://localhost:3001
set PASS=0
set FAIL=0
set TOKEN=

echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║         ⚔  IRON AGE — SMOKE TESTS (Etapa 9)            ║
echo ╚══════════════════════════════════════════════════════════╝
echo.

:: ─────────────────────────────────────────────
:: UTILITÁRIOS
:: ─────────────────────────────────────────────
goto :main

:check
  if "%~1"=="ok" (
    echo   [PASS] %~2
    set /a PASS+=1
  ) else (
    echo   [FAIL] %~2
    echo          Resposta: %~3
    set /a FAIL+=1
  )
goto :eof

:: ─────────────────────────────────────────────
:main
:: ══════════════════════════════════════════════
:: 1. HEALTH CHECK
:: ══════════════════════════════════════════════
echo [1] Health Check
for /f "delims=" %%R in ('curl -s -o NUL -w "%%{http_code}" %BASE%/health') do set CODE=%%R
if "%CODE%"=="200" (call :check ok "GET /health → 200") else (call :check fail "GET /health → %CODE%" "esperado 200")

for /f "delims=" %%R in ('curl -s %BASE%/health') do set BODY=%%R
echo       !BODY! | findstr /C:"\"status\":\"ok\"" >nul && (call :check ok "/health contém status:ok") || (call :check fail "/health status:ok não encontrado" "!BODY!")

echo.

:: ══════════════════════════════════════════════
:: 2. AUTH — REGISTRO
:: ══════════════════════════════════════════════
echo [2] Auth — Registro
set TESTUSER=smoke_test_%RANDOM%
set TESTPASS=senha123

for /f "delims=" %%R in ('curl -s -o NUL -w "%%{http_code}" -X POST %BASE%/auth/register -H "Content-Type: application/json" -d "{\"username\":\"%TESTUSER%\",\"password\":\"%TESTPASS%\"}"') do set CODE=%%R
if "%CODE%"=="201" (call :check ok "POST /auth/register → 201") else (call :check fail "POST /auth/register → %CODE%" "esperado 201")

:: Extrai token da resposta
for /f "delims=" %%R in ('curl -s -X POST %BASE%/auth/register -H "Content-Type: application/json" -d "{\"username\":\"%TESTUSER%2\",\"password\":\"%TESTPASS%\"}"') do set REG_BODY=%%R
echo !REG_BODY! | findstr /C:"token" >nul && (call :check ok "Registro retorna token JWT") || (call :check fail "Token ausente no registro" "!REG_BODY!")

echo.

:: ══════════════════════════════════════════════
:: 3. AUTH — LOGIN
:: ══════════════════════════════════════════════
echo [3] Auth — Login
for /f "delims=" %%R in ('curl -s %BASE%/auth/login -X POST -H "Content-Type: application/json" -d "{\"username\":\"%TESTUSER%\",\"password\":\"%TESTPASS%\"}"') do set LOGIN_BODY=%%R

echo !LOGIN_BODY! | findstr /C:"token" >nul
if !errorlevel!==0 (
  call :check ok "POST /auth/login retorna token"
  :: Extrai token (entre aspas após "token":)
  for /f "tokens=2 delims=:," %%T in ('echo !LOGIN_BODY! ^| findstr "token"') do (
    set RAW_TOKEN=%%T
    set RAW_TOKEN=!RAW_TOKEN:"=!
    set RAW_TOKEN=!RAW_TOKEN: =!
    set TOKEN=!RAW_TOKEN!
  )
) else (
  call :check fail "POST /auth/login sem token" "!LOGIN_BODY!"
)

:: Login com senha errada → 401
for /f "delims=" %%R in ('curl -s -o NUL -w "%%{http_code}" -X POST %BASE%/auth/login -H "Content-Type: application/json" -d "{\"username\":\"%TESTUSER%\",\"password\":\"errada\"}"') do set CODE=%%R
if "%CODE%"=="401" (call :check ok "Login senha errada → 401") else (call :check fail "Login senha errada → %CODE%" "esperado 401")

echo.

:: ══════════════════════════════════════════════
:: 4. ROTA PROTEGIDA — /auth/me
:: ══════════════════════════════════════════════
echo [4] Rota Protegida — /auth/me
if not "!TOKEN!"=="" (
  for /f "delims=" %%R in ('curl -s -o NUL -w "%%{http_code}" %BASE%/auth/me -H "Authorization: Bearer !TOKEN!"') do set CODE=%%R
  if "%CODE%"=="200" (call :check ok "GET /auth/me com token → 200") else (call :check fail "GET /auth/me com token → %CODE%" "esperado 200")

  for /f "delims=" %%R in ('curl -s -o NUL -w "%%{http_code}" %BASE%/auth/me') do set CODE=%%R
  if "%CODE%"=="401" (call :check ok "GET /auth/me sem token → 401") else (call :check fail "GET /auth/me sem token → %CODE%" "esperado 401")
) else (
  echo   [SKIP] /auth/me — token indisponível
)

echo.

:: ══════════════════════════════════════════════
:: 5. STASH
:: ══════════════════════════════════════════════
echo [5] Stash
if not "!TOKEN!"=="" (
  for /f "delims=" %%R in ('curl -s -o NUL -w "%%{http_code}" %BASE%/stash -H "Authorization: Bearer !TOKEN!"') do set CODE=%%R
  if "%CODE%"=="200" (call :check ok "GET /stash → 200") else (call :check fail "GET /stash → %CODE%" "esperado 200")

  for /f "delims=" %%R in ('curl -s %BASE%/stash -H "Authorization: Bearer !TOKEN!"') do set STASH_BODY=%%R
  echo !STASH_BODY! | findstr /C:"items" >nul && (call :check ok "Stash contém campo 'items'") || (call :check fail "Campo 'items' ausente" "!STASH_BODY!")
  echo !STASH_BODY! | findstr /C:"weightLimit" >nul && (call :check ok "Stash contém 'weightLimit'") || (call :check fail "Campo 'weightLimit' ausente" "!STASH_BODY!")
) else (
  echo   [SKIP] Stash — token indisponível
)

echo.

:: ══════════════════════════════════════════════
:: 6. TRADER
:: ══════════════════════════════════════════════
echo [6] Trader / Mercado
if not "!TOKEN!"=="" (
  for /f "delims=" %%R in ('curl -s -o NUL -w "%%{http_code}" %BASE%/trader/prices -H "Authorization: Bearer !TOKEN!"') do set CODE=%%R
  if "%CODE%"=="200" (call :check ok "GET /trader/prices → 200") else (call :check fail "GET /trader/prices → %CODE%" "esperado 200")
) else (
  echo   [SKIP] Trader — token indisponível
)

echo.

:: ══════════════════════════════════════════════
:: 7. CRAFTING
:: ══════════════════════════════════════════════
echo [7] Crafting
if not "!TOKEN!"=="" (
  for /f "delims=" %%R in ('curl -s -o NUL -w "%%{http_code}" %BASE%/crafting/recipes -H "Authorization: Bearer !TOKEN!"') do set CODE=%%R
  if "%CODE%"=="200" (call :check ok "GET /crafting/recipes → 200") else (call :check fail "GET /crafting/recipes → %CODE%" "esperado 200")
) else (
  echo   [SKIP] Crafting — token indisponível
)

echo.

:: ══════════════════════════════════════════════
:: 8. CHECKLIST SOCKET.IO (manual)
:: ══════════════════════════════════════════════
echo [8] Checklist Socket.io (verificação manual)
echo.
echo   Para completar o smoke test do loop de jogo, abra o cliente
echo   e execute cada item abaixo. Marque [OK] se funcionar:
echo.
echo   [ ] 1. Login com usuário registrado → tela de jogo carrega
echo   [ ] 2. Mapa renderiza com biomas coloridos (terreno visível)
echo   [ ] 3. Cone de visão aparece centrado no player
echo   [ ] 4. WASD move o player; cone segue a direção
echo   [ ] 5. Player desacelera em água rasa/montanha (badge aparece)
echo   [ ] 6. Player é bloqueado em água profunda
echo   [ ] 7. Clicar em recurso próximo → "+X× tipo" no log
echo   [ ] 8. Painel Mochila (I) exibe itens coletados
echo   [ ] 9. Painel Skills (K) exibe 7 habilidades com barra XP
echo   [ ] 10. Habilidades atualizam após coletar recurso
echo   [ ] 11. Fauna visível no mapa; fauna hostil pisca vermelho
echo   [ ] 12. F atacar fauna → log "Acertou!" + XP de Caça
echo   [ ] 13. E em zona de extração → barra de progresso aparece
echo   [ ] 14. Extração completa → mochila esvazia, log confirma
echo   [ ] 15. ESC ou "✕ Sair" → volta à tela de login
echo.

:: ══════════════════════════════════════════════
:: RESULTADO
:: ══════════════════════════════════════════════
echo ══════════════════════════════════════════════════════════
echo  Testes automatizados: !PASS! passaram, !FAIL! falharam
echo ══════════════════════════════════════════════════════════
echo.
if !FAIL!==0 (
  echo  Todos os endpoints REST estão respondendo corretamente.
) else (
  echo  ATENÇÃO: !FAIL! endpoint(s) com falha. Verifique o servidor.
)
echo.
pause
