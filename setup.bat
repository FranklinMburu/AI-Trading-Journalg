@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo     🚀 TRADEFLOW - ONE-CLICK SETUP (Windows)
echo ===================================================

:: 1. Node Check
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is NOT installed.
    echo Please download it from: https://nodejs.org/
    pause
    exit /b 1
)

:: 2. Install Dependencies
echo [*] Installing dependencies (this may take a minute)...
call npm install --no-fund --no-audit
if %errorlevel% neq 0 (
    echo [ERROR] Dependency installation failed.
    pause
    exit /b 1
)

:: 3. Create Environment File
if not exist .env (
    echo [*] Creating .env file...
    copy .env.example .env >nul
) else (
    echo [!] .env already exists.
)

:: 4. Create Config Templates
if not exist firebase-applet-config.json (
    echo [*] Creating firebase-applet-config.json template...
    echo { "apiKey": "PASTE_HERE", "authDomain": "...", "projectId": "...", "storageBucket": "...", "messagingSenderId": "...", "appId": "...", "firestoreDatabaseId": "(default)" } > firebase-applet-config.json
)

if not exist serviceAccount.json (
    echo [*] Creating serviceAccount.json template...
    echo { "type": "service_account", "project_id": "PASTE_HERE", "private_key_id": "...", "private_key": "...", "client_email": "...", "client_id": "...", "auth_uri": "...", "token_uri": "...", "auth_provider_x509_cert_url": "...", "client_x509_cert_url": "..." } > serviceAccount.json
)

echo.
echo ===================================================
echo    ✅ SETUP COMPLETE!
echo ===================================================
echo.
echo 1. Open 'firebase-applet-config.json' and paste your Firebase Web keys.
echo 2. Open 'serviceAccount.json' and paste your Private Key content.
echo 3. Run: npm run dev
echo.
pause
