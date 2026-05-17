import fs from 'fs';
import path from 'path';

console.log("\n--- 🕵️‍♂️ TRADEFLOW DIAGNOSTIC CHECK ---");

const checks = [
  { name: '.env', type: 'file' },
  { name: 'firebase-applet-config.json', type: 'file' },
  { name: 'serviceAccount.json', type: 'file' },
  { name: 'node_modules', type: 'dir' }
];

let allOk = true;

checks.forEach(check => {
  const fullPath = path.join(process.cwd(), check.name);
  if (fs.existsSync(fullPath)) {
    console.log(`✅ ${check.name} found.`);
  } else {
    console.warn(`❌ MISSING: ${check.name}`);
    allOk = false;
  }
});

// Check file content for placeholders
if (fs.existsSync('firebase-applet-config.json')) {
  try {
    const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
    if (config.apiKey === 'PASTE_HERE' || config.comment) {
      console.warn("⚠️  WARNING: 'firebase-applet-config.json' still contains placeholder data.");
      allOk = false;
    }
  } catch (e) {
    console.error("❌ ERROR: 'firebase-applet-config.json' is not valid JSON.");
    allOk = false;
  }
}

// Check .env variables
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  if (envContent.includes('WEBHOOK_SECRET="MY_WEBHOOK_SECRET"') || envContent.includes('WEBHOOK_SECRET=""')) {
    console.warn("⚠️  WARNING: You haven't changed the default WEBHOOK_SECRET in .env");
  }
}

console.log("----------------------------------\n");

if (allOk) {
  console.log("🚀 SYSTEM READY TO RUN!");
  console.log("Run 'npm run dev' to start.");
} else {
  console.log("💡 TIPS:");
  console.log("- Run 'setup.bat' (Windows) or 'sh setup.sh' (Mac/Linux) to fix missing files.");
  console.log("- Make sure you filled in your Firebase details in the JSON files.");
}
