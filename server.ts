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
  
  // SANITY CHECK: Verify required config files
  const fs = await import('fs');
  const path = await import('path');
  const requiredFiles = ['firebase-applet-config.json', 'serviceAccount.json'];
  
  console.log("--- Local Config Check ---");
  requiredFiles.forEach(file => {
    if (!fs.existsSync(path.join(process.cwd(), file))) {
      console.warn(`⚠️  WARNING: Missing ${file}. Use README.md to help set this up.`);
    } else {
      console.log(`✅ Found ${file}`);
    }
  });
  console.log("--------------------------");

  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/debug-webhooks", (req, res) => {
    console.log("[DEBUG] /api/debug-webhooks called. Current buffer size:", logBuffer?.length || 0);
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

  // IDENTITY MIGRATION ENDPOINT
  // Deep copies legacy account docs to deterministic IDs to fix identity fragmentation
  app.post("/api/admin/migrate-identity", async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    try {
      const { db } = getFirebaseAdmin();
      const accountsRef = db.collection("users").doc(userId).collection("accounts");
      const accountsSnapshot = await accountsRef.get();
      
      const migrationResults: any[] = [];

      for (const legacyDoc of accountsSnapshot.docs) {
        const data = legacyDoc.data();
        const accountNumber = data.accountNumber || data.id;
        
        // Skip internal demos or already deterministic IDs
        if (legacyDoc.id.startsWith("DEMO_")) continue;
        const deterministicId = String(accountNumber).replace(/[^a-zA-Z0-9]/g, "_");
        if (legacyDoc.id === deterministicId) continue;

        console.log(`[MIGRATE] Migrating legacy doc ${legacyDoc.id} -> ${deterministicId}`);
        const newDocRef = accountsRef.doc(deterministicId);
        
        // 1. Copy root account data
        await newDocRef.set({
          ...data,
          updatedAt: FieldValue.serverTimestamp(),
          migrationSource: legacyDoc.id
        }, { merge: true });

        // 2. Deep Copy Subcollections (Trades, Strategies, etc.)
        const subCollections = ["trades", "strategies", "settings", "journal_entries"];
        for (const collName of subCollections) {
          const legacySubCol = legacyDoc.ref.collection(collName);
          const subSnapshot = await legacySubCol.get();
          
          if (!subSnapshot.empty) {
            console.log(`[MIGRATE] Copying ${subSnapshot.size} docs from ${collName}`);
            const batch = db.batch();
            subSnapshot.docs.forEach(subDoc => {
              const targetRef = newDocRef.collection(collName).doc(subDoc.id);
              batch.set(targetRef, subDoc.data(), { merge: true });
            });
            await batch.commit();
          }
        }

        // 3. Delete Legacy Doc (and its subcollections effectively by removing root ref in UI)
        // Note: Real deep deletion in Firestore requires recursive calls, but for this UI, 
        // removing the root doc is enough to "un-orphan" the identity.
        await legacyDoc.ref.delete();
        migrationResults.push({ from: legacyDoc.id, to: deterministicId });
      }

      res.json({
        success: true,
        message: `Migrated ${migrationResults.length} accounts.`,
        details: migrationResults
      });
    } catch (error: any) {
      console.error("[Migration Error]", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/webhook/trade", async (req, res) => {
    // 1. ENTRY CONFIRMATION (Forensic Step 1)
    const timestamp = new Date().toISOString();
    const queryUserId = req.query.userId;
    const queryAccountId = req.query.accountId;

    console.log(`\n--- 🔥 WEBHOOK RECEIVED [${timestamp}] ---`);
    console.log("[TRACE] Remote IP:", req.ip || req.headers['x-forwarded-for']);
    console.log("[TRACE] Query Params:", JSON.stringify(req.query));
    console.log("[TRACE] Payload Name:", req.body?.accountName || "unknown");

    // Add to global memory buffer for `/api/debug-webhooks`
    logBuffer.unshift({
      time: timestamp,
      type: "WEBHOOK_ENTRY",
      query: req.query,
      bodyType: Array.isArray(req.body) ? "ARRAY" : typeof req.body,
      bodyPreview: JSON.stringify(req.body).slice(0, 500)
    });
    if (logBuffer.length > 50) logBuffer.pop();

    const { userId: idOrEmail, secret } = req.query;

    try {
      // 2. BACKEND PROCESSING (Forensic Step 3)
      if (!idOrEmail || idOrEmail === "PLEASE_LOGIN" || idOrEmail === "undefined" || idOrEmail === "") {
        console.error("❌ WEBHOOK ERROR: Incoming request is missing 'userId' in query string.");
        return res.status(400).json({ 
          success: false, 
          stage: "received", 
          error: "Missing userId query parameter. EA URL might be misconfigured.",
          receivedQuery: req.query
        });
      }

      const { db, auth } = getFirebaseAdmin();
      let uid: string;

      // Identity Resolution
      try {
        if ((idOrEmail as string).includes("@")) {
          console.log(`[TRACE] Resolving email: ${idOrEmail}`);
          const userRecord = await auth.getUserByEmail(idOrEmail as string);
          uid = userRecord.uid;
        } else {
          uid = idOrEmail as string;
        }
        console.log(`[TRACE] Resolved Target UID: ${uid}`);
      } catch (authErr: any) {
        console.error("❌ WEBHOOK ERROR: Failed to resolve user identity:", authErr.message);
        return res.status(404).json({
          success: false,
          stage: "parsed",
          error: `User identity '${idOrEmail}' not found in Firebase Auth.`,
        });
      }

      const data = req.body;
      const items = Array.isArray(data) ? data : [data];
      const syncResults = [];
      const diagnosticInfo: any = {
         receivedCount: items.length,
         targetUid: uid,
         userEmail: (idOrEmail as string).includes("@") ? idOrEmail : "via-uid"
      };
      
      if (items.length === 0 || !items[0] || (typeof items[0] === 'object' && Object.keys(items[0]).length === 0)) {
         console.warn("[TRACE] Webhook received empty or invalid payload.");
         return res.json({ success: true, message: "No data items to process", ...diagnosticInfo });
      }

      for (const item of items) {
        // Fallback Strategy: Check JSON body first, then Query String (for legacy EAs)
        const rawAccountId = item.accountId || queryAccountId;
        const ticketId = item.ticket ? String(item.ticket) : (req.query.ticket ? String(req.query.ticket) : null);
        
        console.log(`[TRACE] Item Extraction -> Acc: ${rawAccountId}, Ticket: ${ticketId}`);

        if (!rawAccountId) {
          console.error("❌ WEBHOOK ERROR: Item missing 'accountId' in both JSON payload and query string.");
          logBuffer.unshift({ time: new Date().toISOString(), type: "ERROR", msg: "Missing accountId", item });
          continue;
        }
        if (!ticketId || ticketId === "0" || ticketId === "undefined") {
          console.log("[TRACE] Skipping heartbeat/invalid ticket.");
          continue;
        }

        // 3. FIRESTORE WRITE VERIFICATION (Forensic Step 4)
        const mt5Login = String(rawAccountId).trim();
        const accountDocId = mt5Login.replace(/[^a-zA-Z0-9]/g, "_");
        const fullPath = `users/${uid}/accounts/${accountDocId}/trades/${ticketId}`;
        
        console.log(`[TRACE] Target Path: ${fullPath}`);

        const accountRef = db.collection("users").doc(uid).collection("accounts").doc(accountDocId);
        const tradeRef = accountRef.collection("trades").doc(ticketId);

        const isDemoFlag = 
          item.isDemo === true || 
          String(item.isDemo).toLowerCase() === 'true' ||
          String(item.accountType || "").toLowerCase().includes("demo");

        const tradeData = {
          ...item,
          accountId: mt5Login,
          userId: uid,
          updatedAt: FieldValue.serverTimestamp(),
          entryTime: item.entryTime || new Date().toISOString(),
          status: item.status || (item.pnl !== undefined ? "CLOSED" : "OPEN"),
          isDemo: isDemoFlag,
          trace_at: timestamp
        };

        // Create Account Parent (with logging for Settings UI)
        await accountRef.set({
          accountNumber: mt5Login,
          userId: uid,
          lastSync: timestamp,
          lastUpdate: timestamp,
          name: item.accountName || `MT Sync ${mt5Login}`,
          currency: item.currency || "USD",
          balance: item.balance || 0,
          equity: item.equity || 0,
          broker: item.broker || "MetaTrader",
          isDemo: isDemoFlag
        }, { merge: true });

        // User activity log for Settings.tsx
        await db.collection("users").doc(uid).collection("webhook_logs").add({
          timestamp,
          accountIds: [mt5Login],
          itemCount: 1,
          status: "SUCCESS",
          clientIp: req.ip || req.headers['x-forwarded-for'] || "MT5"
        });

        // Write Trade
        await tradeRef.set(tradeData, { merge: true });
        console.log(`✅ FIRESTORE WRITE SUCCESS: ${fullPath}`);
        syncResults.push({ ticket: ticketId, path: fullPath });
      }

      // 4. RESPONSE CONTRACT
      return res.json({
        success: true,
        stage: "written",
        uid: uid,
        accountDocId: items[0] ? String(items[0].accountId).replace(/[^a-zA-Z0-9]/g, "_") : "none",
        count: syncResults.length,
        results: syncResults
      });

    } catch (error: any) {
      console.error("❌ WEBHOOK CRITICAL ERROR:", error);
      return res.status(500).json({
        success: false,
        stage: "failed",
        error: error.message,
        stack: error.stack?.split('\n').slice(0, 3)
      });
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
