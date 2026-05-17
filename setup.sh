#!/bin/bash

# --- 🚀 TRADEFLOW UBUNTU/LINUX SETUP ---
echo "==================================================="
echo "    📊 TRADEFLOW - ONE-CLICK LINUX SETUP"
echo "==================================================="

# 1. Permission Check
chmod +x setup.sh 2>/dev/null

# 2. Dependency Check (Node & NPM)
if ! command -v node &> /dev/null; then
    echo "❌ ERROR: Node.js is not installed."
    echo "Fix: sudo apt update && sudo apt install nodejs npm"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ ERROR: NPM is missing."
    echo "Fix: sudo apt install npm"
    exit 1
fi

echo "✅ Environment: Node $(node -v), NPM $(npm -v)"

# 3. Installation
echo "[*] Installing project dependencies..."
npm install --no-fund --no-audit

# 4. Environment File 
if [ ! -f .env ]; then
    echo "[*] Bootstrapping .env from example..."
    cp .env.example .env
fi

# 5. Config Templates (If missing)
TEMPLATE_FILES=("firebase-applet-config.json" "serviceAccount.json")

for file in "${TEMPLATE_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo "[*] Creating template: $file"
        echo '{ "comment": "PASTE YOUR FIREBASE VALUES HERE" }' > "$file"
    fi
done

echo ""
echo "==================================================="
echo "   🎉 SETUP FINISHED SUCCESSFULLY"
echo "==================================================="
echo "Next Steps for Ubuntu Users:"
echo "1. Paste your Firebase keys into .env and the .json files."
echo "2. Start the engine: npm run dev"
echo "3. Run diagnostics any time: npm run check"
echo ""
