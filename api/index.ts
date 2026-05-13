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

    // --- WEBHOOK SECURITY CHECK ---
    const globalWebhookSecret = process.env.WEBHOOK_SECRET;
    let userTargetSecret = globalWebhookSecret;

    try {
      const targetAccountId = String(accountId || tradeData.accountId || (Array.isArray(tradeData) && tradeData[0]?.accountId) || "DEFAULT");
      const accountDocId = targetAccountId.replace(/[^a-zA-Z0-9]/g, "_");
      const settingsSnapshot = await db.collection("users").doc(uid)
        .collection("accounts").doc(accountDocId)
        .collection("settings").limit(1).get();
      
      if (!settingsSnapshot.empty) {
        const settings = settingsSnapshot.docs[0].data();
        if (settings.webhookSecret) {
          userTargetSecret = settings.webhookSecret;
        }
      }
    } catch (err) {
      console.warn("Could not fetch user settings for secret check.");
    }

    if (userTargetSecret && secret !== userTargetSecret) {
      return res.status(401).json({ error: "Unauthorized: Invalid webhook secret" });
    }

    const dataToProcess = Array.isArray(tradeData) ? tradeData : [tradeData];
    console.log(`Sync Request: User=${idOrEmail}, AccountsFound=${dataToProcess.length}, QueryId=${uid}`);

    // Helper to sanitize date strings from MT5/MT4 (yyyy.mm.dd -> yyyy-mm-dd)
    const sanitizeDate = (dateStr: any) => {
      if (!dateStr || typeof dateStr !== "string") return new Date().toISOString();
      try {
        // Replace dots with hyphens for better JS parsing
        const cleaned = dateStr.replace(/\./g, "-").replace(" ", "T");
        const date = new Date(cleaned);
        return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
      } catch (e) {
        return new Date().toISOString();
      }
    };

    const results = [];
    const accountRefs = new Map();

    for (const item of dataToProcess) {
      const targetAccountId = String(accountId || item.accountId || "DEFAULT");
      const accountDocId = targetAccountId.replace(/[^a-zA-Z0-9]/g, "_");
      
      let accountRef;
      if (accountRefs.has(accountDocId)) {
        accountRef = accountRefs.get(accountDocId);
      } else {
        console.log(`Accessing account: ${accountDocId} for user ${uid}`);
        accountRef = db.collection("users").doc(uid).collection("accounts").doc(accountDocId);
        const accountDoc = await accountRef.get();

        if (!accountDoc.exists) {
          console.log(`Auto-creating missing account: ${targetAccountId}`);
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
        // Mark last sync time
        await accountRef.update({ lastSync: new Date().toISOString() });
        accountRefs.set(accountDocId, accountRef);
      }

      const trade: any = {
        userId: uid,
        accountId: targetAccountId,
        symbol: item.symbol || "UNKNOWN",
        entryPrice: parseFloat(item.entryPrice || item.price || 0),
        exitPrice: parseFloat(item.exitPrice || item.price || 0),
        quantity: parseFloat(item.quantity || 1),
        direction: String(item.direction || "LONG").toUpperCase(),
        status: String(item.status || "CLOSED").toUpperCase(),
        pnl: parseFloat(item.pnl || 0),
        entryTime: sanitizeDate(item.entryTime),
        exitTime: sanitizeDate(item.exitTime),
        notes: item.notes || `Synced via Webhook`,
        tags: item.tags || ["broker-sync"],
        isDemo: item.isDemo === true || item.isDemo === "true" || false 
      };

      if (item.ticket) trade.ticket = String(item.ticket);

      if (item.ticket) {
        const ticketId = `ticket_${String(item.ticket)}`;
        const tradeRef = accountRef.collection("trades").doc(ticketId);
        const existingTrade = await tradeRef.get();
        
        if (!existingTrade.exists) {
          await tradeRef.set(trade);
          results.push(ticketId);
        } else {
          if (existingTrade.data()?.status === "OPEN" && trade.status === "CLOSED") {
            await tradeRef.update(trade);
          }
        }
      } else {
        const tradeAdded = await accountRef.collection("trades").add(trade);
        results.push(tradeAdded.id);
      }
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
