import { initializeApp as initializeAdminApp, getApps as getAdminApps, cert as adminCert, App as AdminApp } from "firebase-admin/app";
import { getFirestore as getFirestoreAdmin } from "firebase-admin/firestore";

const firebaseConfig = {
  projectId: "custodyflow"
};

const DATABASE_ID = "ai-studio-custodyflow-b2f42bf6-7a6a-43a4-9986-3d46405d5ebe";

function getAdminApp(): AdminApp {
  const existingApps = getAdminApps();
  if (existingApps.length > 0 && existingApps[0]) {
    return existingApps[0];
  }

  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (rawServiceAccount) {
    try {
      let cleaned = rawServiceAccount.trim();
      if ((cleaned.startsWith("'") && cleaned.endsWith("'")) || (cleaned.startsWith('"') && cleaned.endsWith('"'))) {
        cleaned = cleaned.slice(1, -1).trim();
      }
      if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
        try {
          const decoded = Buffer.from(cleaned, 'base64').toString('utf-8').trim();
          if (decoded.startsWith('{')) {
            cleaned = decoded;
          }
        } catch (_) {}
      }
      const serviceAccount = JSON.parse(cleaned);
      if (serviceAccount && typeof serviceAccount === 'object') {
        if (typeof serviceAccount.private_key === 'string') {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        return initializeAdminApp({
          credential: adminCert(serviceAccount)
        });
      }
    } catch (err) {
      console.error("Error initializing Firebase Admin with FIREBASE_SERVICE_ACCOUNT:", err);
    }
  }

  return initializeAdminApp({
    projectId: firebaseConfig.projectId
  });
}

const adminApp = getAdminApp();
const adminDb = getFirestoreAdmin(adminApp, DATABASE_ID);

const TARGET_COLLECTIONS = [
  'companies',
  'regions',
  'stations',
  'organization_units',
  'categories',
  'users',
  'user_credentials',
  'logs',
  'transactions',
  'config',
  'Permissions',
  'Roles'
];

async function deleteCollectionDocs(colName: string): Promise<number> {
  console.log(`Scanning collection: [${colName}]...`);
  try {
    const snap = await adminDb.collection(colName).get();
    if (snap.empty) {
      console.log(`  Collection [${colName}] is already empty (0 docs).`);
      return 0;
    }

    console.log(`  Found ${snap.size} docs in [${colName}]. Deleting...`);
    let deletedCount = 0;
    const docs = snap.docs;
    const CHUNK_SIZE = 100;

    for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
      const batch = adminDb.batch();
      const chunk = docs.slice(i, i + CHUNK_SIZE);
      chunk.forEach(d => {
        batch.delete(d.ref);
      });
      await batch.commit();
      deletedCount += chunk.length;
    }

    console.log(`  Successfully deleted ${deletedCount} docs from [${colName}].`);
    return deletedCount;
  } catch (err) {
    console.error(`  Error deleting collection [${colName}]:`, err);
    throw err;
  }
}

async function main() {
  console.log('====================================================');
  console.log('Starting full Firestore clean & reset operation (Admin SDK)...');
  console.log(`Target Project: ${firebaseConfig.projectId}`);
  console.log(`Target Database: ${DATABASE_ID}`);
  console.log('====================================================');

  if (firebaseConfig.projectId !== 'custodyflow') {
    throw new Error(`CRITICAL: Refusing to touch database outside 'custodyflow' scope! Found: ${firebaseConfig.projectId}`);
  }

  const results: Record<string, number> = {};

  // Step 1: Delete all targeted collections
  for (const col of TARGET_COLLECTIONS) {
    results[col] = await deleteCollectionDocs(col);
  }

  // Step 2: Delete system_meta/seed_status_v7 and any other seed status documents
  console.log('Deleting system_meta seed status documents...');
  try {
    const systemMetaSnap = await adminDb.collection('system_meta').get();
    let metaDeleted = 0;
    for (const d of systemMetaSnap.docs) {
      if (d.id.startsWith('seed_status')) {
        console.log(`  Deleting seed marker doc: system_meta/${d.id}`);
        await adminDb.collection('system_meta').doc(d.id).delete();
        metaDeleted++;
      }
    }
    console.log(`  Deleted ${metaDeleted} seed marker doc(s) from system_meta.`);
  } catch (err) {
    console.error('  Error clearing seed status from system_meta:', err);
    throw err;
  }

  // Step 3: Verification
  console.log('====================================================');
  console.log('Verifying all collections and seed status...');
  let allClean = true;

  for (const col of TARGET_COLLECTIONS) {
    const snap = await adminDb.collection(col).get();
    if (!snap.empty) {
      console.error(`  FAILURE: Collection [${col}] still has ${snap.size} documents!`);
      allClean = false;
    } else {
      console.log(`  OK: Collection [${col}] is completely empty (0 docs).`);
    }
  }

  const metaSnap = await adminDb.collection('system_meta').get();
  const hasV7 = metaSnap.docs.some(d => d.id === 'seed_status_v7');
  if (hasV7) {
    console.error('  FAILURE: system_meta/seed_status_v7 still exists!');
    allClean = false;
  } else {
    console.log('  OK: system_meta/seed_status_v7 successfully removed.');
  }

  console.log('====================================================');
  console.log('SUMMARY OF DELETIONS:');
  console.table(results);
  if (allClean) {
    console.log('ALL TARGET COLLECTIONS AND SEED STATUS CLEARED SUCCESSFULLY.');
    console.log('The next app startup will automatically trigger clean seedDatabaseIfEmpty.');
  } else {
    console.error('SOME COLLECTIONS COULD NOT BE FULLY CLEARED.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal cleanup error:', err);
  process.exit(1);
});
