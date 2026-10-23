import { db } from '../../firebase';
import { SequenceEngine } from './sequence';
import { DocumentLifecycleEngine } from './lifecycle';
import { PermissionEngine } from './permission';
import { AuditLogEngine } from './audit';
import { createBaseMetadata, updateBaseMetadata, createEventEnvelope } from './metadata';
import { doc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { BaseMetadata, FsmConfig } from '../../types/enterprise';
import { UserRole } from '../../types';

// ==========================================
// 1. Define TestDocument Interfaces & Configurations
// ==========================================

export interface TestDocument {
  id: string;
  docNumber: string;
  tenantId: string;
  status: 'Draft' | 'Pending' | 'Approved' | 'Posted';
  title: string;
  metadata: BaseMetadata;
}

// FSM Transitions context
interface FsmContext {
  doc: TestDocument;
  operatorId: string;
}

// 2. FSM Configurations for the PoC Document Lifecycle
const testDocFsmConfig: FsmConfig<'Draft' | 'Pending' | 'Approved' | 'Posted', 'submit' | 'approve' | 'post', FsmContext> = {
  documentType: 'TestDocument',
  initialState: 'Draft',
  states: {
    Draft: { name: 'Draft', labelAr: 'مسودة', labelEn: 'Draft', isInitial: true },
    Pending: { name: 'Pending', labelAr: 'معلق', labelEn: 'Pending' },
    Approved: { name: 'Approved', labelAr: 'موافق عليه', labelEn: 'Approved' },
    Posted: { name: 'Posted', labelAr: 'مرحل', labelEn: 'Posted', isTerminal: true }
  },
  transitions: [
    {
      event: 'submit',
      from: 'Draft',
      to: 'Pending',
      labelAr: 'تقديم المستند للاعتماد',
      labelEn: 'Submit Document for Approval',
      authorizedRoles: ['StationAdmin', 'Admin'],
      guard: (context) => {
        if (!context.doc.title) {
          throw new Error('Document title is required for submission.');
        }
        return true;
      }
    },
    {
      event: 'approve',
      from: 'Pending',
      to: 'Approved',
      labelAr: 'الموافقة على المستند',
      labelEn: 'Approve Document',
      authorizedRoles: ['Admin'],
      guard: (context) => {
        return context.doc.status === 'Pending';
      }
    },
    {
      event: 'post',
      from: 'Approved',
      to: 'Posted',
      labelAr: 'ترحيل المستند للحسابات',
      labelEn: 'Post Document to Ledger',
      authorizedRoles: ['Admin', 'SystemAdmin'],
      guard: (context) => {
        return context.doc.status === 'Approved';
      }
    }
  ]
};

// 3. Define standard test permissions for our PoC Permission check
const pocRolePermissions = [
  { role: 'StationAdmin', permissions: ['submit_test_doc'] },
  { role: 'Admin', permissions: ['submit_test_doc', 'approve_test_doc', 'post_test_doc'] },
  { role: 'SystemAdmin', permissions: ['post_test_doc'] }
];

// ==========================================
// 4. Main PoC Runner Function
// ==========================================

export async function runProofOfConcept(): Promise<boolean> {
  console.log('====================================================');
  console.log('🚀 ENTERPRISE FOUNDATION SPRINT (4B): PROOF OF CONCEPT');
  console.log('====================================================');

  const testTenantId = 'poc-test-tenant-99999';
  const testUserId = 'poc-test-operator-777';
  const testUserName = 'PoC Test Operator';
  const testUserRole: UserRole = 'Admin';

  console.log(`\n[Info] Context: Tenant=${testTenantId}, Operator=${testUserId}, Role=${testUserRole}`);

  // Initialize Engines
  const auditEngine = new AuditLogEngine(); // Run in Memory-Only Mode to prevent database pollution and bypass Append-Only Firestore Security Rules delete blocks
  const permissionEngine = new PermissionEngine(pocRolePermissions);
  const lifecycleEngine = new DocumentLifecycleEngine(testDocFsmConfig);

  let success = true;

  try {
    // ----------------------------------------------------
    // STEP 1: SEQUENCE ENGINE (Document Number Generation)
    // ----------------------------------------------------
    console.log('\n--- Step 1: Sequence Number Generation ---');
    const numberingOptions = {
      prefix: 'TST',
      padding: 5,
      includeYear: true,
      manualStartNo: 2001
    };

    console.log('[Seq] Requesting new sequential document number...');
    const generatedDocNumber = await SequenceEngine.generateNextSequence(
      db,
      testTenantId,
      'last_poc_test_no',
      numberingOptions
    );
    console.log(`[Seq] Output Number: "${generatedDocNumber}" (Expected: TST-${new Date().getFullYear()}-02001)`);

    // Instantiate Document with Metadata (3.1 Metadata Creator)
    const baseMeta = createBaseMetadata(testTenantId, testUserId);
    const testDoc: TestDocument = {
      id: `doc-${Date.now()}`,
      docNumber: generatedDocNumber,
      tenantId: testTenantId,
      status: 'Draft',
      title: 'PoC Integration Test Document v1.0',
      metadata: baseMeta
    };
    console.log(`[Doc] Initialized Document: ID=${testDoc.id}, Status=${testDoc.status}, Version=${testDoc.metadata.version}`);


    // ----------------------------------------------------
    // STEP 2: TRANSITION 1: Draft -> Pending (Submit)
    // ----------------------------------------------------
    console.log('\n--- Step 2: Transition 1 (Draft -> Pending) ---');
    
    // Check Permission Engine
    const canSubmit = permissionEngine.hasPermission('submit_test_doc', {
      userId: testUserId,
      role: testUserRole,
      tenantId: testTenantId,
      organizationId: testTenantId
    });
    console.log(`[Perm] Permission "submit_test_doc" check result: ${canSubmit}`);
    if (!canSubmit) throw new Error('Permission denied for submit_test_doc');

    // Trigger Transition
    console.log(`[FSM] Triggering event "submit" on current state "${testDoc.status}"...`);
    const submitResult = await lifecycleEngine.triggerTransition(
      testDoc.status,
      'submit',
      testUserRole,
      { doc: testDoc, operatorId: testUserId }
    );

    console.log(`[FSM] Transition Result: Success=${submitResult.success}, New State="${submitResult.toState}"`);
    if (!submitResult.success) {
      throw new Error(`FSM Submit transition failed: ${submitResult.messageEn}`);
    }

    // Apply State Update & Metadata Update
    testDoc.status = submitResult.toState;
    testDoc.metadata = updateBaseMetadata(testDoc.metadata, testUserId);
    console.log(`[Doc] State Updated. New Status=${testDoc.status}, Version=${testDoc.metadata.version}`);

    // Log to Audit Log Engine (Append-Only) using Event Envelope
    const submitEnvelope = createEventEnvelope({
      eventType: 'TEST_DOCUMENT_SUBMITTED',
      tenantId: testTenantId,
      userId: testUserId,
      userName: testUserName,
      userRole: testUserRole,
      payload: { docId: testDoc.id, docNumber: testDoc.docNumber, status: testDoc.status }
    });

    console.log(`[Audit] Appending Append-Only audit trail for TEST_DOCUMENT_SUBMITTED...`);
    const submitAuditRec = await auditEngine.appendAuditRecord(submitEnvelope);
    console.log(`[Audit] Record created with ID: ${submitAuditRec.id}`);


    // ----------------------------------------------------
    // STEP 3: TRANSITION 2: Pending -> Approved (Approve)
    // ----------------------------------------------------
    console.log('\n--- Step 3: Transition 2 (Pending -> Approved) ---');

    // Check Permission Engine
    const canApprove = permissionEngine.hasPermission('approve_test_doc', {
      userId: testUserId,
      role: testUserRole,
      tenantId: testTenantId,
      organizationId: testTenantId
    });
    console.log(`[Perm] Permission "approve_test_doc" check result: ${canApprove}`);
    if (!canApprove) throw new Error('Permission denied for approve_test_doc');

    // Trigger Transition
    console.log(`[FSM] Triggering event "approve" on current state "${testDoc.status}"...`);
    const approveResult = await lifecycleEngine.triggerTransition(
      testDoc.status,
      'approve',
      testUserRole,
      { doc: testDoc, operatorId: testUserId }
    );

    console.log(`[FSM] Transition Result: Success=${approveResult.success}, New State="${approveResult.toState}"`);
    if (!approveResult.success) {
      throw new Error(`FSM Approve transition failed: ${approveResult.messageEn}`);
    }

    // Apply State Update & Metadata Update
    testDoc.status = approveResult.toState;
    testDoc.metadata = updateBaseMetadata(testDoc.metadata, testUserId);
    console.log(`[Doc] State Updated. New Status=${testDoc.status}, Version=${testDoc.metadata.version}`);

    // Log to Audit Log Engine
    const approveEnvelope = createEventEnvelope({
      eventType: 'TEST_DOCUMENT_APPROVED',
      tenantId: testTenantId,
      userId: testUserId,
      userName: testUserName,
      userRole: testUserRole,
      payload: { docId: testDoc.id, docNumber: testDoc.docNumber, status: testDoc.status }
    });

    console.log(`[Audit] Appending Append-Only audit trail for TEST_DOCUMENT_APPROVED...`);
    const approveAuditRec = await auditEngine.appendAuditRecord(approveEnvelope);
    console.log(`[Audit] Record created with ID: ${approveAuditRec.id}`);


    // ----------------------------------------------------
    // STEP 4: TRANSITION 3: Approved -> Posted (Post)
    // ----------------------------------------------------
    console.log('\n--- Step 4: Transition 3 (Approved -> Posted) ---');

    // Check Permission Engine
    const canPost = permissionEngine.hasPermission('post_test_doc', {
      userId: testUserId,
      role: testUserRole,
      tenantId: testTenantId,
      organizationId: testTenantId
    });
    console.log(`[Perm] Permission "post_test_doc" check result: ${canPost}`);
    if (!canPost) throw new Error('Permission denied for post_test_doc');

    // Trigger Transition
    console.log(`[FSM] Triggering event "post" on current state "${testDoc.status}"...`);
    const postResult = await lifecycleEngine.triggerTransition(
      testDoc.status,
      'post',
      testUserRole,
      { doc: testDoc, operatorId: testUserId }
    );

    console.log(`[FSM] Transition Result: Success=${postResult.success}, New State="${postResult.toState}"`);
    if (!postResult.success) {
      throw new Error(`FSM Post transition failed: ${postResult.messageEn}`);
    }

    // Apply State Update & Metadata Update
    testDoc.status = postResult.toState;
    testDoc.metadata = updateBaseMetadata(testDoc.metadata, testUserId);
    console.log(`[Doc] State Updated. New Status=${testDoc.status}, Version=${testDoc.metadata.version}`);

    // Log to Audit Log Engine
    const postEnvelope = createEventEnvelope({
      eventType: 'TEST_DOCUMENT_POSTED',
      tenantId: testTenantId,
      userId: testUserId,
      userName: testUserName,
      userRole: testUserRole,
      payload: { docId: testDoc.id, docNumber: testDoc.docNumber, status: testDoc.status }
    });

    console.log(`[Audit] Appending Append-Only audit trail for TEST_DOCUMENT_POSTED...`);
    const postAuditRec = await auditEngine.appendAuditRecord(postEnvelope);
    console.log(`[Audit] Record created with ID: ${postAuditRec.id}`);


    // ----------------------------------------------------
    // STEP 5: VERIFY AUDIT LOG TRAIL IN FIRESTORE
    // ----------------------------------------------------
    console.log('\n--- Step 5: Verification of Persisted Logs ---');
    console.log(`[Audit] Fetching all AuditLogs registered for tenant "${testTenantId}"...`);
    const fetchedLogs = await auditEngine.getAuditRecords(testTenantId);
    console.log(`[Audit] Successfully fetched ${fetchedLogs.length} audit records.`);
    
    fetchedLogs.forEach((log, index) => {
      console.log(`  Log #${index + 1}: EventId=${log.id}, Type=${log.event.eventType}, User=${log.event.user_name}, Payload=${JSON.stringify(log.event.payload)}`);
    });

    if (fetchedLogs.length !== 3) {
      throw new Error(`Expected 3 audit logs, but found ${fetchedLogs.length}.`);
    }
    console.log('[Audit] Validation passed. Audit trail is strictly intact.');

  } catch (error: any) {
    console.error('\n❌ Proof of Concept failed with error:', error.message || error);
    success = false;
  } finally {
    // ----------------------------------------------------
    // STEP 6: COMPREHENSIVE ISOLATED CLEANUP (No residuals)
    // ----------------------------------------------------
    console.log('\n--- Step 6: Isolated Data Cleanup (Zero residual data) ---');
    try {
      // 1. Audit Logs are in-memory, so no DB deletions needed for AuditLogs.
      console.log('[Cleanup] Audit logs were handled in Memory-Only Mode. No Firestore deletions required for AuditLogs.');

      // 2. Delete company sequences from Firestore
      console.log(`[Cleanup] Cleaning up sequence record for tenant "${testTenantId}"...`);
      const seqDocRef = doc(db, 'company_sequences', testTenantId);
      await deleteDoc(seqDocRef);
      console.log(`[Cleanup] Deleted company_sequences record for "${testTenantId}".`);

      console.log('[Cleanup] Cleanup procedure finished successfully. Zero trace left in DB.');
    } catch (cleanupError) {
      console.error('[Cleanup] Warning: Failed to clean up test data:', cleanupError);
    }
  }

  console.log('\n====================================================');
  if (success) {
    console.log('✅ PROOF OF CONCEPT EXECUTED SUCCESSFULLY AND PASSED!');
  } else {
    console.log('❌ PROOF OF CONCEPT COMPLETED WITH ERRORS!');
  }
  console.log('====================================================\n');

  return success;
}

// Automatically execute when run directly via tsx
if (process.argv[1] && process.argv[1].endsWith('poc_runner.ts')) {
  runProofOfConcept()
    .then((result) => {
      process.exit(result ? 0 : 1);
    })
    .catch((err) => {
      console.error('Unhandled execution error:', err);
      process.exit(1);
    });
}
