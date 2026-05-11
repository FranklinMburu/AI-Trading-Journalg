import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import * as admin from "firebase-admin";
import fs from "fs";

console.log("Starting server script...");

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("__dirname:", __dirname);

// Lazy Firebase Admin Initialization
let db: admin.firestore.Firestore | null = null;
let auth: admin.auth.Auth | null = null;

function getFirebaseAdmin() {
  console.log("Getting Firebase Admin instance...");
  if (!db) {
    try {
      const configPath = path.join(process.cwd(), "firebase-applet-config.json");
      console.log("Config path:", configPath);
      if (!fs.existsSync(configPath)) {
        throw new Error("firebase-applet-config.json not found");
      }
      const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      console.log("Firebase config loaded for project:", firebaseConfig.projectId);

      if (admin.apps.length === 0) {
        console.log("Initializing Firebase Admin app...");
        admin.initializeApp({
          projectId: firebaseConfig.projectId,
        });
      }
      
      const dbId = firebaseConfig.firestoreDatabaseId || "(default)";
      console.log("Using Firestore Database ID:", dbId);
      db = admin.firestore(dbId);
      auth = admin.auth();
      console.log("Firebase Admin initialized successfully");
    } catch (error) {
      console.error("Failed to initialize Firebase Admin:", error);
      throw error;
    }
  }
  return { db, auth };
}

async function startServer() {
  console.log("Initializing Express app...");
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Broker Sync Endpoint (Placeholder for MetaApi or other integrations)
  app.post("/api/broker/sync", async (req, res) => {
    const { userId, metaApiToken, accountId } = req.body;
    console.log(`Broker sync requested for user ${userId} on account ${accountId}`);

    if (!userId || !metaApiToken || !accountId) {
      return res.status(400).json({ error: "Missing required parameters for sync" });
    }

    try {
      // In a real implementation, this would call MetaApi or another broker API
      // For now, we'll simulate a successful sync
      res.json({ 
        success: true, 
        message: "Broker sync initiated. Trades will appear in your journal shortly.",
        syncedCount: 0 
      });
    } catch (error) {
      console.error("Broker sync error:", error);
      res.status(500).json({ error: "Failed to connect to broker. Please check your credentials." });
    }
  });

  // Webhook Receiver for MT4/MT5
  app.post("/api/webhook/trade", async (req, res) => {
    console.log("Received webhook request:", req.query);
    const { userId: idOrEmail, secret, accountId } = req.query;
    const tradeData = req.body;

    // --- WEBHOOK SECURITY CONFIGURATION ---
    // The WEBHOOK_SECRET is a user-defined key used to authorize incoming trade data.
    // To set this up:
    // 1. Define a random string (e.g., 'my-secure-key-123').
    // 2. Add it to your environment variables/secrets as WEBHOOK_SECRET.
    // 3. Include it in your webhook URL as a query parameter: &secret=my-secure-key-123
    // If the environment variable is NOT set, the webhook will remain open (not recommended for production).
    const webhookSecret = process.env.WEBHOOK_SECRET;
    if (webhookSecret && secret !== webhookSecret) {
      console.warn("Unauthorized webhook attempt with invalid secret");
      return res.status(401).json({ error: "Unauthorized: Invalid webhook secret" });
    }

    if (!idOrEmail) {
      return res.status(400).json({ error: "Missing userId parameter" });
    }

    try {
      const { db, auth } = getFirebaseAdmin();
      if (!db || !auth) throw new Error("Firebase Admin not ready");

      let uid: string;
      
      // Check if it's an email or a UID
      if ((idOrEmail as string).includes("@")) {
        console.log("Looking up user by email:", idOrEmail);
        const userRecord = await auth.getUserByEmail(idOrEmail as string);
        uid = userRecord.uid;
      } else {
        console.log("Looking up user by UID:", idOrEmail);
        const userRecord = await auth.getUser(idOrEmail as string);
        uid = userRecord.uid;
      }

      // Determine if we are processing a single trade or an array
      const dataToProcess = Array.isArray(tradeData) ? tradeData : [tradeData];
      console.log(`Processing ${dataToProcess.length} trade(s) for user ${uid}`);

      const results = [];
      
      // Cache account refs to avoid redundant fetches in a batch
      const accountRefs = new Map();

      for (const item of dataToProcess) {
        // Ensure Account exists
        const targetAccountId = String(accountId || item.accountId || "DEFAULT");
        const accountDocId = targetAccountId.replace(/[^a-zA-Z0-9]/g, "_");
        
        let accountRef;
        if (accountRefs.has(accountDocId)) {
          accountRef = accountRefs.get(accountDocId);
        } else {
          accountRef = db.collection("users").doc(uid).collection("accounts").doc(accountDocId);
          const accountDoc = await accountRef.get();

          if (!accountDoc.exists) {
            console.log(`Creating new account record for ${targetAccountId} under user ${uid}`);
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
            // Update balance/equity if provided
            const updateData: any = { lastUpdate: new Date().toISOString() };
            if (item.balance !== undefined) updateData.balance = item.balance;
            if (item.equity !== undefined) updateData.equity = item.equity;
            await accountRef.update(updateData);
          }
          accountRefs.set(accountDocId, accountRef);
        }

        // Map incoming data to Trade schema
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
          notes: item.notes || `Synced via Webhook (Account: ${targetAccountId})`,
          tags: item.tags || ["broker-sync"],
          isDemo: item.isDemo || false 
        };

        // Add to Firestore using nested structure
        const tradeAdded = await db.collection("users").doc(uid).collection("accounts").doc(accountDocId).collection("trades").add(trade);
        results.push(tradeAdded.id);
      }
      
      console.log(`Batch process complete. Total trades synced: ${results.length}`);
      
      res.json({ 
        success: true, 
        message: `${results.length} trade(s) processed and synced to journal.`,
        ids: results
      });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(500).json({ error: "Failed to process webhook. Ensure user ID/email is correct and script is configured." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("Setting up Vite middleware...");
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("Vite middleware loaded");
    } catch (error) {
      console.error("Failed to load Vite middleware:", error);
    }
  } else {
    console.log("Running in production mode");
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    } else {
      console.warn("Production mode but dist/ directory not found. Serving health check only.");
    }
  }

  console.log(`Attempting to listen on port ${PORT}...`);
  if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
  return app;
}

export const appPromise = startServer();

appPromise.catch(err => {
  console.error("Server failed to initialize:", err);
});
