import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import fs from 'fs';

async function cleanup() {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (!fs.existsSync(configPath)) {
    console.error('firebase-applet-config.json not found');
    return;
  }
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  if (getApps().length === 0) {
    initializeApp({
      projectId: firebaseConfig.projectId,
    });
  }

  const db = getFirestore(firebaseConfig.firestoreDatabaseId || '(default)');
  
  console.log('Starting cleanup of random account IDs...');
  
  const usersSnapshot = await db.collection('users').get();
  
  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const accountsSnapshot = await db.collection('users').doc(userId).collection('accounts').get();
    
    for (const accountDoc of accountsSnapshot.docs) {
      const accountId = accountDoc.id;
      const data = accountDoc.data();
      const accountNumber = data.accountNumber;
      
      if (!accountNumber) continue;
      
      const deterministicId = String(accountNumber).replace(/[^a-zA-Z0-9]/g, '_');
      
      if (accountId !== deterministicId && accountId !== 'DEMO_001') {
        console.log(`Found non-deterministic ID: ${accountId} for account ${accountNumber}. Migrating to ${deterministicId}...`);
        
        // Migrate data to new ID
        await db.collection('users').doc(userId).collection('accounts').doc(deterministicId).set(data);
        
        // Migrate subcollections (trades, strategies, settings, journal_entries)
        const collections = ['trades', 'strategies', 'settings', 'journal_entries'];
        for (const collName of collections) {
          const subColl = await accountDoc.ref.collection(collName).get();
          for (const subDoc of subColl.docs) {
            await db.collection('users').doc(userId).collection('accounts').doc(deterministicId).collection(collName).doc(subDoc.id).set(subDoc.data());
            await subDoc.ref.delete();
          }
        }
        
        // Delete old account doc
        await accountDoc.ref.delete();
        console.log(`Successfully migrated ${accountId} -> ${deterministicId}`);
      }
    }
  }
  
  console.log('Cleanup complete.');
}

cleanup().catch(console.error);
