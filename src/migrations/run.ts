import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { runTenantMigrationUp } from './tenantMigration';

const isStrict = process.env.NODE_ENV === 'production' || process.env.STRICT_PROD_SECURITY === 'true';
const apiKey = process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || '';
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || 'custodyflow';

if (isStrict && (!apiKey || !projectId)) {
  throw new Error('CRITICAL SECURITY ERROR: Required Firebase environment variables (FIREBASE_API_KEY, FIREBASE_PROJECT_ID) are missing in production/strict mode.');
}

const firebaseConfig = {
  projectId: projectId || 'custodyflow',
  appId: process.env.FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID || '',
  apiKey: apiKey || (isStrict ? '' : 'dev-placeholder-key'),
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || 'custodyflow.firebaseapp.com',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || 'custodyflow.firebasestorage.app',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || ''
};

const app = initializeApp(firebaseConfig);
const DATABASE_ID = process.env.FIREBASE_DATABASE_ID || process.env.VITE_FIREBASE_DATABASE_ID || "ai-studio-custodyflow-b2f42bf6-7a6a-43a4-9986-3d46405d5ebe";
const db = getFirestore(app, DATABASE_ID);

async function main() {
  console.log('Running migration from command line...');
  try {
    const result = await runTenantMigrationUp(db);
    console.log('Migration Result:', JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  } catch (err) {
    console.error('Fatal Migration Error:', err);
    process.exit(1);
  }
}

main();
