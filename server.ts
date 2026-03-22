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

  // Webhook Receiver for MT4/MT5
  app.post("/api/webhook/trade", async (req, res) => {
    console.log("Received webhook request:", req.query);
    const { userId: idOrEmail } = req.query;
    const tradeData = req.body;

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

      // Map incoming data to Trade schema
      const trade = {
        userId: uid,
        symbol: tradeData.symbol || "UNKNOWN",
        entryPrice: tradeData.entryPrice || tradeData.price || 0,
        exitPrice: tradeData.price || 0,
        quantity: tradeData.quantity || 1,
        direction: tradeData.direction || "LONG",
        status: "CLOSED",
        pnl: tradeData.pnl || 0,
        entryTime: tradeData.entryTime || new Date().toISOString(),
        exitTime: new Date().toISOString(),
        notes: "Synced via Webhook",
        tags: ["broker-sync"],
      };

      // Add to Firestore
      console.log("Saving trade to Firestore...");
      await db.collection("trades").add(trade);
      
      console.log(`Synced trade for user ${idOrEmail} (${uid}):`, trade);
      
      res.json({ 
        success: true, 
        message: "Trade received and synced to journal." 
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
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Server failed to start:", err);
});
