# 📊 TradeFlow - Local & Production Setup Guide

TradeFlow is a professional trading journal designed for high-performance trader synchronization. Setting it up locally on your computer (Windows, macOS, or Ubuntu) is designed to be a "one-click" experience.

---

## 🚀 Quick Setup (All Systems)

### 1. Install
Run the automation script for your operating system:
- **Windows**: Double-click `setup.bat`.
- **Ubuntu/Linux/macOS**: Open Terminal and run `bash setup.sh`.

### 2. Configure Firebase
The scripts created placeholders for your keys. You must fill them in:
1.  **`firebase-applet-config.json`**: Copy your "Web App" config from Firebase Console.
2.  **`serviceAccount.json`**: Download your "Private Key" from Project Settings > Service Accounts.
3.  **`.env`**: Add your `WEBHOOK_SECRET` and `GEMINI_API_KEY` (optional).

### 3. Run
```bash
npm run dev
```

---

## 💻 VS Code Power-User Features
If you use VS Code, we've optimized the workflow for you:
- **One-Click Setup**: Press `Ctrl + Shift + B` (Windows/Linux) or `Cmd + Shift + B` (Mac).
- **Easy Launch**: Go to the **Run & Debug** tab and select "Debug TradeFlow Server".
- **Built-in Tasks**: Use `Terminal > Run Task` to find "Run Diagnostics" or "Install & Setup".

---

## 📂 Project Structure
```text
tradeflow/
├── 📁 scripts/           # Automation & diagnostic tools
├── 📁 src/               # Frontend (React + Vite)
├── .env                  # Private environment variables (Created by setup)
├── firebase-applet-config.json  # Web SDK Configuration (You fill)
├── serviceAccount.json   # Admin SDK Configuration (You download)
├── setup.bat             # Windows One-Click Installer
├── setup.sh              # Ubuntu/Linux One-Click Installer
└── server.ts             # Backend Express Server
```

---

## 📡 MetaTrader Webhook Setup
To sync trades from MT4/MT5, point your EA to:
`https://YOUR_DOMAIN.com/api/webhook/trade?userId=YOUR_EMAIL&secret=YOUR_SECRET`

**Local Testing**: Use [ngrok](https://ngrok.com/) to tunnel your local machine:
1. Run `ngrok http 3000`.
2. Copy the `https://...` URL into your MT5 EA settings.

---

## 🩺 Diagnostics
If something isn't working, run our health check:
```bash
npm run check
```
This tool scans your configuration and tells you exactly which file or key is missing.
