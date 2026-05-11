import express from "express";
import path from "path";
import fs from "fs";
import * as admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// --- FIREBASE ADMIN SETUP ---
let db: admin.firestore.Firestore | null = null;
let auth: admin.auth.Auth | null = null;

function getFirebaseAdmin() {
  if (!db) {
    let firebaseConfig;
    // Attempt to load from JSON first (AI Studio style)
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } else {
      // Fallback to Env variables (Vercel style)
      firebaseConfig = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID || "(default)"
      };
    }

    if (!firebaseConfig.projectId) {
      throw new Error("Firebase Project ID not found. Ensure FIREBASE_PROJECT_ID is set in Vercel environment variables.");
    }

    if (admin.apps.length === 0) {
      admin.initializeApp({
        projectId: firebaseConfig.projectId,
      });
    }
    
    db = admin.firestore(firebaseConfig.firestoreDatabaseId || "(default)");
    auth = admin.auth();
  }
  return { db, auth };
}

// --- API ROUTES ---
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", env: process.env.NODE_ENV });
});

app.post("/api/webhook/trade", async (req, res) => {
  const { userId: idOrEmail, secret, accountId } = req.query;
  const tradeData = req.body;
  const webhookSecret = process.env.WEBHOOK_SECRET;

  if (webhookSecret && secret !== webhookSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!idOrEmail) return res.status(400).json({ error: "Missing userId" });

  try {
    const { db, auth } = getFirebaseAdmin();
    let uid: string;
    
    if ((idOrEmail as string).includes("@")) {
      const userRecord = await auth.getUserByEmail(idOrEmail as string);
      uid = userRecord.uid;
    } else {
      const userRecord = await auth.getUser(idOrEmail as string);
      uid = userRecord.uid;
    }

    const dataToProcess = Array.isArray(tradeData) ? tradeData : [tradeData];
    const results = [];
    const accountRefs = new Map();

    for (const item of dataToProcess) {
      const targetAccountId = String(accountId || item.accountId || "DEFAULT");
      const accountDocId = targetAccountId.replace(/[^a-zA-Z0-9]/g, "_");
      
      let accountRef;
      if (accountRefs.has(accountDocId)) {
        accountRef = accountRefs.get(accountDocId);
      } else {
        accountRef = db.collection("users").doc(uid).collection("accounts").doc(accountDocId);
        const accountDoc = await accountRef.get();

        if (!accountDoc.exists) {
          await accountRef.set({
            userId: uid,
            accountNumber: targetAccountId,
            name: `MT Sync ${targetAccountId}`,
            currency: item.currency || "USD",
            balance: item.balance || 0,
            equity: item.equity || 0,
            createdAt: new Date().toISOString(),
            lastUpdate: new Date().toISOString()
          });
        } else {
          const updateData: any = { lastUpdate: new Date().toISOString() };
          if (item.balance !== undefined) updateData.balance = item.balance;
          if (item.equity !== undefined) updateData.equity = item.equity;
          await accountRef.update(updateData);
        }
        accountRefs.set(accountDocId, accountRef);
      }

      const trade = {
        userId: uid,
        accountId: targetAccountId,
        symbol: item.symbol || "UNKNOWN",
        entryPrice: item.entryPrice || item.price || 0,
        exitPrice: item.exitPrice || item.price || 0,
        quantity: item.quantity || 1,
        direction: item.direction || "LONG",
        status: item.status || "CLOSED",
        pnl: item.pnl || 0,
        entryTime: item.entryTime || new Date().toISOString(),
        exitTime: item.exitTime || new Date().toISOString(),
        notes: item.notes || `Synced via Webhook`,
        tags: item.tags || ["broker-sync"],
        isDemo: item.isDemo || false 
      };

      const tradeAdded = await db.collection("users").doc(uid).collection("accounts").doc(accountDocId).collection("trades").add(trade);
      results.push(tradeAdded.id);
    }
    
    res.json({ success: true, message: `${results.length} trades synced`, ids: results });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Sync failed" });
  }
});

// --- STATIC FILES (For Vercel Production) ---
const distPath = path.join(process.cwd(), "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

export default app;
