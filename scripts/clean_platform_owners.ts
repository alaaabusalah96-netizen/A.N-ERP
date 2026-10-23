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

async function cleanPlatformOwners() {
  console.log("=== CLEANING PLATFORM OWNERS & SYSTEM ADMINS FROM FIRESTORE ===");
  
  const usersSnap = await adminDb.collection("users").get();
  console.log(`Found total ${usersSnap.size} user documents in 'users' collection.`);
  
  const toDelete: { id: string; email: string; role: string; is_platform_owner: boolean }[] = [];

  usersSnap.docs.forEach(docSnap => {
    const data = docSnap.data() || {};
    const role = data.role;
    const isPlatformOwner = data.is_platform_owner === true;
    
    if (role === "SystemAdmin" || role === "super_admin" || isPlatformOwner) {
      toDelete.push({
        id: docSnap.id,
        email: data.email || "",
        role: role || "",
        is_platform_owner: isPlatformOwner
      });
    }
  });

  console.log(`Found ${toDelete.length} user(s) matching deletion criteria:`, toDelete);

  for (const user of toDelete) {
    console.log(`Deleting user [${user.id}] (${user.email}, role=${user.role}, is_platform_owner=${user.is_platform_owner})...`);
    await adminDb.collection("users").doc(user.id).delete();
    
    // Delete corresponding document in user_credentials
    const credRef = adminDb.collection("user_credentials").doc(user.id);
    const credSnap = await credRef.get();
    if (credSnap.exists) {
      console.log(`Deleting corresponding user_credentials document [${user.id}]...`);
      await credRef.delete();
    } else {
      console.log(`No user_credentials document found for id [${user.id}].`);
    }
  }

  // Also check if any user_credentials exist for dev@local or platform emails that might be orphaned
  const credsSnap = await adminDb.collection("user_credentials").get();
  for (const cDoc of credsSnap.docs) {
    const data = cDoc.data() || {};
    if (data.email === "dev@local" || data.id === "dev-bypass-user") {
      console.log(`Deleting orphan credential document [${cDoc.id}] for ${data.email}...`);
      await cDoc.ref.delete();
    }
  }

  // Verification step
  console.log("\n=== VERIFYING PLATFORM STATUS ===");
  const sysAdminSnap = await adminDb.collection("users").where("role", "==", "SystemAdmin").limit(1).get();
  const superAdminSnap = await adminDb.collection("users").where("role", "==", "super_admin").limit(1).get();
  const ownerSnap = await adminDb.collection("users").where("is_platform_owner", "==", true).limit(1).get();

  const hasPlatformOwner = !sysAdminSnap.empty || !superAdminSnap.empty || !ownerSnap.empty;
  console.log("hasPlatformOwner calculation:", {
    sysAdminCount: sysAdminSnap.size,
    superAdminCount: superAdminSnap.size,
    ownerCount: ownerSnap.size,
    hasPlatformOwner: hasPlatformOwner
  });

  const remainingUsers = await adminDb.collection("users").get();
  console.log(`\nRemaining users in Firestore (${remainingUsers.size}):`);
  remainingUsers.docs.forEach(d => {
    console.log(`  - [${d.id}] ${d.data().full_name} (${d.data().email}) - Role: ${d.data().role} - Company: ${d.data().company_id}`);
  });

  const remainingCompanies = await adminDb.collection("companies").get();
  console.log(`\nRemaining companies in Firestore (${remainingCompanies.size}):`);
  remainingCompanies.docs.forEach(d => {
    console.log(`  - [${d.id}] ${d.data().name}`);
  });
}

cleanPlatformOwners().catch(console.error);
