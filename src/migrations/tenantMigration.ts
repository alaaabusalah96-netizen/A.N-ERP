import { 
  getFirestore, 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteField,
  Firestore
} from 'firebase/firestore';

const collectionsToMigrate = [
  'companies',
  'regions',
  'stations',
  'users',
  'transactions',
  'logs',
  'Expenses',
  'CashVouchers',
  'TransactionHistory',
  'Notifications',
  'AuditLogs',
  'Permissions',
  'Roles',
  'deleted_transactions',
  'company_sequences'
];

export interface MigrationResult {
  success: boolean;
  message: string;
  details: {
    [collectionName: string]: {
      processed: number;
      updated: number;
      failed: number;
    };
  };
}

/**
 * Runs the migration to add tenantId and organizationId to all documents
 */
export async function runTenantMigrationUp(db: Firestore): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: true,
    message: 'Migration completed successfully.',
    details: {}
  };

  console.log('Starting Tenant Migration [UP]...');

  for (const colName of collectionsToMigrate) {
    result.details[colName] = { processed: 0, updated: 0, failed: 0 };
    try {
      const colRef = collection(db, colName);
      const snapshot = await getDocs(colRef);
      
      console.log(`Processing collection: ${colName} (${snapshot.size} documents)`);
      
      for (const d of snapshot.docs) {
        result.details[colName].processed++;
        try {
          const data = d.data();
          // Skip if already migrated
          if (data.tenantId && data.organizationId) {
            continue;
          }

          // Determine tenant ID: use company_id if available, fallback to 'comp-1'
          const targetTenant = data.company_id || 'comp-1';

          const docRef = doc(db, colName, d.id);
          await updateDoc(docRef, {
            tenantId: targetTenant,
            organizationId: targetTenant
          });

          result.details[colName].updated++;
        } catch (docErr: any) {
          console.error(`Error migrating doc ${d.id} in ${colName}:`, docErr);
          result.details[colName].failed++;
          result.success = false;
        }
      }
    } catch (colErr: any) {
      console.error(`Failed to process collection ${colName}:`, colErr);
      result.success = false;
      result.message = `Migration failed on collection ${colName}: ${colErr.message}`;
    }
  }

  return result;
}

/**
 * Runs the rollback (down) migration to remove tenantId and organizationId from all documents
 */
export async function runTenantMigrationDown(db: Firestore): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: true,
    message: 'Rollback completed successfully.',
    details: {}
  };

  console.log('Starting Tenant Migration [DOWN]...');

  for (const colName of collectionsToMigrate) {
    result.details[colName] = { processed: 0, updated: 0, failed: 0 };
    try {
      const colRef = collection(db, colName);
      const snapshot = await getDocs(colRef);
      
      console.log(`Rolling back collection: ${colName} (${snapshot.size} documents)`);
      
      for (const d of snapshot.docs) {
        result.details[colName].processed++;
        try {
          const data = d.data();
          // Skip if already clean
          if (!data.tenantId && !data.organizationId) {
            continue;
          }

          const docRef = doc(db, colName, d.id);
          await updateDoc(docRef, {
            tenantId: deleteField(),
            organizationId: deleteField()
          });

          result.details[colName].updated++;
        } catch (docErr: any) {
          console.error(`Error rolling back doc ${d.id} in ${colName}:`, docErr);
          result.details[colName].failed++;
          result.success = false;
        }
      }
    } catch (colErr: any) {
      console.error(`Failed to roll back collection ${colName}:`, colErr);
      result.success = false;
      result.message = `Rollback failed on collection ${colName}: ${colErr.message}`;
    }
  }

  return result;
}
