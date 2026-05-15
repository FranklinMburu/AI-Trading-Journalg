import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import fs from "fs";
import { initializeApp, getApps, cert, applicationDefault, App } from "firebase-admin/app";
import { getFirestore, FieldValue, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";

console.log("Starting server script...");

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logBuffer: any[] = [];

// Lazy Firebase Admin Initialization
let db: Firestore | null = null;
let auth: Auth | null = null;

function getFirebaseAdmin() {
  if (!db) {
    try {
      console.log("--- Firebase Admin Initialization Start ---");
      const configPath = path.join(process.cwd(), "firebase-applet-config.json");
      
      // Supported Service Account Paths
      const rootPath = path.join(process.cwd(), "serviceAccount.json");
      const serverDirPath = path.join(process.cwd(), "server", "serviceAccount.json");
      
      let firebaseConfig: any = {};
      if (fs.existsSync(configPath)) {
        console.log("Loading config from firebase-applet-config.json");
        firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      } else {
        console.log("firebase-applet-config.json not found, using environment variables");
        firebaseConfig = {
          projectId: process.env.FIREBASE_PROJECT_ID,
          firestoreDatabaseId: process.env.FIRESTORE_DATABASE_ID
        };
      }

      const projectId = firebaseConfig.projectId;
      const dbId = firebaseConfig.firestoreDatabaseId;

      console.log("Target Project ID:", projectId || "NOT SPECIFIED");
      console.log("Target Database ID:", dbId || "(default)");

      const apps = getApps();
      let app: App;

      if (apps.length === 0) {
        let cred;
        
        // 1. Check for Environment Variable
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
          console.log("Using service account from FIREBASE_SERVICE_ACCOUNT env var.");
          try {
            cred = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
          } catch (e: any) {
            console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT env var:", e.message);
          }
        }
        
        // 2. Check for root file
        if (!cred && fs.existsSync(rootPath)) {
          console.log("Using serviceAccount.json from root.");
          try {
            cred = cert(JSON.parse(fs.readFileSync(rootPath, "utf-8")));
          } catch (e: any) {
            console.error("Failed to parse /serviceAccount.json:", e.message);
          }
        }

        // 3. Check for /server/ subdirectory file
        if (!cred && fs.existsSync(serverDirPath)) {
          console.log("Using serviceAccount.json from /server/ directory.");
          try {
            cred = cert(JSON.parse(fs.readFileSync(serverDirPath, "utf-8")));
          } catch (e: any) {
            console.error("Failed to parse /server/serviceAccount.json:", e.message);
          }
        }

        if (!cred) {
          console.warn("No service account key found. Falling back to Application Default Credentials (ADC).");
          console.warn("If PERMISSION_DENIED occurs, please upload a serviceAccount.json to the root.");
          cred = applicationDefault();
        }

        app = initializeApp({
          credential: cred,
          projectId: projectId
        });
        console.log("Admin app initialized.");
      } else {
        console.log("Retrieving existing Admin app instance.");
        app = apps[0]!;
      }
      
      try {
        if (dbId && dbId !== "(default)") {
          console.log(`Targeting Firestore Database: ${dbId}`);
          db = getFirestore(app, dbId);
        } else {
          console.log("Targeting (default) Firestore Database.");
          db = getFirestore(app);
        }
        
        auth = getAuth(app);
        console.log("--- Firebase Admin Services Linked ---");
      } catch (serviceErr: any) {
        console.error("Failed to link Firestore or Auth services:", serviceErr.message);
        throw serviceErr;
      }

    } catch (error: any) {
      console.error("--- Firebase Admin SDK Initialization CRITICAL FAILURE ---");
      console.error(`Reason: ${error.message}`);
      if (error.stack) console.error(error.stack);
      throw error;
    }
  }
  return { db: db!, auth: auth! };
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

  app.get("/api/debug-webhooks", (req, res) => {
    res.json(logBuffer || []);
  });

  // Auth Test Endpoint
  app.get("/api/debug/auth-check", async (req, res) => {
    try {
      const { auth } = getFirebaseAdmin();
      // Try to create a custom token to verify if we have full admin permissions
      const token = await auth.createCustomToken("server-diag-user");
      res.json({ 
        success: true, 
        message: "Admin SDK has identity (can sign tokens)",
        identity: "Service Account / ADC active"
      });
    } catch (e: any) {
      console.error("[Auth Check Error]", e);
      res.status(500).json({ 
        success: false, 
        error: e.message,
        details: "This usually means the Admin SDK is initialized without enough permissions or credentials."
      });
    }
  });

  // Test write endpoint
  app.get("/api/debug/test-write", async (req, res) => {
    try {
      const { db } = getFirebaseAdmin();
      const testRef = db.collection("debug_tests").doc("last_test");
      await testRef.set({ 
        timestamp: new Date().toISOString(), 
        message: "Server-side Admin SDK write test" 
      });
      res.json({ success: true, path: testRef.path });
    } catch (e: any) {
      console.error("[Test Write Error]", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Diagnostic endpoint to check data sync
  app.get("/api/debug/sync", async (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "Missing userId" });
    
    try {
      const { db } = getFirebaseAdmin();
      const accounts: any[] = [];
      const accountsRef = db.collection("users").doc(userId as string).collection("accounts");
      const accSnapshot = await accountsRef.get();
      
      for (const accDoc of accSnapshot.docs) {
        const tradesRef = accDoc.ref.collection("trades");
        const tradesSnapshot = await tradesRef.get();
        accounts.push({
          id: accDoc.id,
          data: accDoc.data(),
          tradeCount: tradesSnapshot.size,
          trades: tradesSnapshot.docs.slice(0, 5).map(t => ({ id: t.id, isDemo: t.data().isDemo }))
        });
      }

      res.json({
        userId,
        accountsFound: accSnapshot.size,
        accounts
      });
    } catch (e: any) {
      console.error("[Debug Sync Error]", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Webhook Receiver for MT4/MT5
  app.get("/api/webhook/trade", (req, res) => {
    res.json({ 
      status: "LISTEN_ACTIVE", 
      message: "Sync pipeline is listening for MT5 POST requests (Admin SDK Mode).",
      timestamp: new Date().toISOString()
    });
  });

  app.post("/api/webhook/trade", async (req, res) => {
    const { userId: idOrEmail, secret, accountId } = req.query;
    console.log(`\n[WEBHOOK TRACE] ${new Date().toISOString()}`);
    console.log(`[Webhook] UserParam: ${idOrEmail} | Admin SDK Mode`);
    
    const tradeData = req.body;
    const dataToProcess = Array.isArray(tradeData) ? tradeData : [tradeData];
    
    // Log to buffer for diagnostics
    logBuffer.unshift({
      time: new Date().toISOString(),
      type: "WEBHOOK_EVENT",
      userParam: idOrEmail,
      queryId: accountId,
      bodyPreview: dataToProcess.slice(0, 2).map(item => ({ ticket: item.ticket, symbol: item.symbol, account: item.accountId }))
    });
    if (logBuffer.length > 50) logBuffer.pop();

    if (!idOrEmail || idOrEmail === 'PLEASE_LOGIN' || idOrEmail === 'undefined') {
      return res.status(400).json({ error: "Missing or invalid userId parameter." });
    }

    try {
      const { db, auth } = getFirebaseAdmin();
      
      let uid: string;
      
      // Resolve email to UID if needed
      if ((idOrEmail as string).includes("@")) {
        console.log(`[Webhook] Resolving email: ${idOrEmail}`);
        const userRecord = await auth.getUserByEmail(idOrEmail as string);
        uid = userRecord.uid;
        console.log(`[Webhook] Resolved to UID: ${uid}`);
      } else {
        uid = idOrEmail as string;
      }

      // Log to user-specific diagnostic collection
      try {
        await db.collection("users").doc(uid).collection("webhook_logs").add({
          timestamp: new Date().toISOString(),
          accountIds: dataToProcess.map(item => String(accountId || item.accountId)),
          itemCount: dataToProcess.length,
          status: "SUCCESS",
          clientIp: req.ip || req.headers['x-forwarded-for'] || "Unknown"
        });
      } catch (logErr) {
        console.error("Failed to write webhook log to Firestore:", logErr);
      }

      const results = [];

      for (const item of dataToProcess) {
        // DETAILED LOGGING AS REQUESTED
        console.log("\n--- INCOMING MT5 PAYLOAD ---");
        console.log("Body Item:", JSON.stringify(item, null, 2));
        console.log("Resolved UID:", uid);
        console.log("Query Params:", req.query);
        
        // STRICT ACCOUNT RESOLUTION
        if (!accountId && !item.accountId) {
          console.error("[WEBHOOK REJECTED] Missing accountId in both query and body.");
          continue;
        }

        const targetAccountId = String(accountId || item.accountId);
        console.log("Resolved targetAccountId:", targetAccountId);
        
        // BETTER ACCOUNT RESOLUTION: Try to find an existing account with this account number first
        // This prevents "duplicate" accounts if the user manually added one with an auto-generated ID
        const accountsColRef = db.collection("users").doc(uid).collection("accounts");
        const existingAccountQuery = await accountsColRef.where("accountNumber", "==", targetAccountId).limit(1).get();
        
        let accountRef;
        if (!existingAccountQuery.empty) {
          accountRef = existingAccountQuery.docs[0].ref;
          console.log("[ACCOUNT RESOLUTION] Linked to existing account doc:", accountRef.id);
        } else {
          // Fallback to deterministic ID if not found
          const deterministicId = targetAccountId.replace(/[^a-zA-Z0-9]/g, "_");
          accountRef = accountsColRef.doc(deterministicId);
          console.log("[ACCOUNT RESOLUTION] Creating/Using deterministic account doc:", deterministicId);
        }
        
        const accountDocId = accountRef.id;
        const accountDoc = await accountRef.get();

        if (!accountDoc.exists) {
          console.log(`[Webhook] Creating NEW account record for: ${accountDocId}`);
          await accountRef.set({
            userId: uid,
            accountNumber: targetAccountId,
            name: item.accountName || `MT Sync ${targetAccountId}`,
            currency: item.currency || "USD",
            balance: item.balance || 0,
            equity: item.equity || 0,
            broker: item.broker || "MetaTrader",
            createdAt: new Date().toISOString(),
            lastUpdate: new Date().toISOString(),
            lastSync: new Date().toISOString()
          });
        } else {
          await accountRef.update({
            lastUpdate: new Date().toISOString(),
            lastSync: new Date().toISOString(),
            balance: item.balance ?? accountDoc.data()?.balance,
            equity: item.equity ?? accountDoc.data()?.equity
          });
        }

        // REFINED isDemo LOGIC
        // Logic: payload.isDemo === true || accountType contains "demo"
        const isDemoFlag = 
          item.isDemo === true || 
          String(item.isDemo).toLowerCase() === 'true' ||
          String(item.accountType || "").toLowerCase().includes("demo") ||
          String(item.accountName || "").toLowerCase().includes("demo");

        console.log("Resolved isDemoFlag:", isDemoFlag, "(Raw:", item.isDemo, "Type:", item.accountType, ")");

        const ticketId = item.ticket ? String(item.ticket) : `m_${Date.now()}`;
        if (ticketId === "0") {
          console.warn("[WEBHOOK SKIPPED] Ticket is 0 (likely heartbeat or balance operation)");
          continue;
        }

        const tradeRef = accountRef.collection("trades").doc(ticketId);
        console.log(`[Webhook] Target Write Path: users/${uid}/accounts/${accountDocId}/trades/${ticketId}`);
        
        const existingTrade = await tradeRef.get();
        
        const trade = {
          userId: uid,
          accountId: accountDocId,
          symbol: String(item.symbol || "UNKNOWN").toUpperCase(),
          direction: String(item.direction || "LONG").toUpperCase(),
          status: String(item.status || "CLOSED").toUpperCase(),
          entryPrice: Number(item.entryPrice || 0),
          exitPrice: Number(item.exitPrice || 0),
          pnl: Number(item.pnl || 0),
          quantity: Number(item.quantity || 1),
          entryTime: item.entryTime || new Date().toISOString(),
          exitTime: item.exitTime || new Date().toISOString(),
          isDemo: isDemoFlag,
          updatedAt: FieldValue.serverTimestamp()
        };

        if (!existingTrade.exists) {
          console.log(`[Webhook] WRITING NEW TRADE: ${ticketId}`);
          await tradeRef.set(trade);
          results.push(ticketId);
        } else if (existingTrade.data()?.status === "OPEN" && trade.status === "CLOSED") {
          console.log(`[Webhook] CLOSING EXISTING TRADE: ${ticketId}`);
          await tradeRef.update(trade);
          results.push(ticketId);
        } else {
          console.log(`[Webhook] TRADE EXISTS & UNCHANGED: ${ticketId}`);
        }
      }
      
      res.json({ 
        success: true, 
        message: `${results.length} trade(s) synced.`,
        ids: results
      });
    } catch (error: any) {
      console.error("Webhook error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
