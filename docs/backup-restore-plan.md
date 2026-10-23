# Backup, Restore, & Verification Plan (v1.0)
# خطة النسخ الاحتياطي والاستعادة والتحقق التجريبي

This document is part of **Phase 0: Baseline Freeze** for **KEMIT ERP**. It outlines the precise steps for exporting the active Firestore database, setting up automated backups, and conducting a trial restoration to ensure data integrity before proceeding with any code refactoring or feature additions.

---

## 1. Database Identification / تحديد قاعدة البيانات المستهدفة

Before running any script, identify and verify the target Firestore details:
- **Project ID**: `refined-garage-5nzsc`
- **Database ID**: `ai-studio-custodyflow-b2f42bf6-7a6a-43a4-9986-3d46405d5ebe`
- **Storage Bucket for Backups**: `gs://refined-garage-5nzsc.appspot.com/backups/` (or dedicated backup bucket)

---

## 2. Step-by-Step Export/Backup Guide / خطوات النسخ الاحتياطي لقاعدة البيانات

Using the Google Cloud CLI (`gcloud`), backups can be exported directly to a Cloud Storage bucket.

### Prerequisites:
1. Ensure the Google Cloud SDK is installed and authorized.
2. Grant the **Cloud Datastore Import Export Admin** role to the user or service account performing the task.
3. Configure the bucket access rules to allow the Firestore service agent to write files.

### Step 1: Run the Export Command
Run the following command in your terminal to export all collections:
```bash
gcloud firestore export gs://refined-garage-5nzsc.appspot.com/backups/baseline-freeze-v1.0 \
    --database="ai-studio-custodyflow-b2f42bf6-7a6a-43a4-9986-3d46405d5ebe" \
    --project="refined-garage-5nzsc"
```

### Step 2: Verify the Backup Files in Cloud Storage
List the bucket contents to verify that the export metadata and collection folders are created successfully:
```bash
gsutil ls gs://refined-garage-5nzsc.appspot.com/backups/baseline-freeze-v1.0/
```
Ensure files like `baseline-freeze-v1.0.overall_export_metadata` and folders representing the individual collections exist.

---

## 3. Restore Verification Protocol / دليل التحقق والاسترجاع التجريبي

To ensure that the backup files are fully functional and not corrupted, perform a **trial restoration** in an isolated test environment or staging database.

### Step 1: Provision a Test/Temporary Database
In your Firebase Console, provision a temporary Firestore database instance or use a sandbox project (e.g., `refined-garage-5nzsc-staging` or a temporary DB ID like `custodyflow-backup-test`).

### Step 2: Run the Import Command
Run the import command directing it to the temporary database:
```bash
gcloud firestore import gs://refined-garage-5nzsc.appspot.com/backups/baseline-freeze-v1.0 \
    --database="custodyflow-backup-test" \
    --project="refined-garage-5nzsc"
```

### Step 3: Verify Data Integrity
Connect to the `custodyflow-backup-test` database and verify:
1. **Documents Count Match**: Count of documents in `companies`, `users`, and `transactions` collections must exactly match the count from the live database before export.
2. **Schema Verification**: Check that nested maps, array attachments, and date strings maintain proper types and keys.
3. **Audit Event Verification**: Confirm that the last entry in `AuditLogs` and `logs` is preserved perfectly.

---

## 4. Rollback and Disaster Recovery / خطة التراجع السريع عند الطوارئ

If any issue arises during subsequent development sprints (e.g., data corruption, accidental deletion, or logic failures):

1. **Immediate Lockdown**: Put the application into maintenance mode if possible, or revoke write permissions temporarily in `firestore.rules` to prevent further writes.
2. **Execute Full Restore**: Run the import command targeting the active database using the baseline snapshot:
   ```bash
   gcloud firestore import gs://refined-garage-5nzsc.appspot.com/backups/baseline-freeze-v1.0 \
       --database="ai-studio-custodyflow-b2f42bf6-7a6a-43a4-9986-3d46405d5ebe" \
       --project="refined-garage-5nzsc"
   ```
3. **Clear Local Caches**: Instruct active clients to clear local storage (`localStorage.clear()`) to force sync the freshly restored data from Firestore.
4. **Post-Mortem Log**: Record the timestamp and details of the event in `/logs` to maintain absolute financial audit trail transparency.
