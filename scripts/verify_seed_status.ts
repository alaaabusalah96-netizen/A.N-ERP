import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectId = "custodyflow";
const DATABASE_ID = "ai-studio-custodyflow-b2f42bf6-7a6a-43a4-9986-3d46405d5ebe";

function getAdminApp() {
  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) return existingApps[0];

  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (rawServiceAccount) {
    let cleaned = rawServiceAccount.trim();
    if ((cleaned.startsWith("'") && cleaned.endsWith("'")) || (cleaned.startsWith('"') && cleaned.endsWith('"'))) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    const serviceAccount = JSON.parse(cleaned);
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id || projectId
    });
  }
  return initializeApp({ projectId });
}

const adminApp = getAdminApp();
const adminDb = getFirestore(adminApp, DATABASE_ID);

async function verifyState() {
  console.log("=== FIRESTORE STATUS VERIFICATION ===");
  const metaDoc = await adminDb.collection("system_meta").doc("seed_status_v7").get();
  console.log("system_meta/seed_status_v7 exists:", metaDoc.exists, "data:", metaDoc.data());

  const collections = ["companies", "regions", "stations", "organization_units", "categories", "users", "user_credentials", "logs", "transactions", "config", "Permissions", "Roles"];
  
  for (const col of collections) {
    const snap = await adminDb.collection(col).get();
    console.log(`Collection [${col}]: ${snap.size} documents`);
    if (col === "companies") {
      snap.docs.forEach(d => console.log(`  - Company: [${d.id}] ${d.data()?.name}`));
    }
    if (col === "users") {
      snap.docs.forEach(d => console.log(`  - User: [${d.id}] ${d.data()?.full_name} (${d.data()?.email}) - Company: ${d.data()?.company_id}`));
    }
  }
}

verifyState().catch(console.error);
