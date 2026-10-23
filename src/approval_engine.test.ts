import { describe, it, expect, beforeEach } from 'vitest';
import { ApprovalEngine } from './db/approvalEngine';
import { PurchasingBusinessEngine } from './lib/enterprise/purchasing_engine';
import { StorageEngine } from './db/storage';

describe('Phase 8: Approval Engine Unit & Integration Tests', () => {
  const companyId = 'comp-test-phase8';

  beforeEach(() => {
    ApprovalEngine.resetState();
    StorageEngine.setStored('purchase_requests', []);
  });

  it('should create default workflows for a company', async () => {
    const defaults = await ApprovalEngine.createDefaultWorkflows(companyId);
    expect(defaults.length).toBeGreaterThanOrEqual(3);
    
    const prHighWf = defaults.find(w => w.documentType === 'PURCHASE_REQUEST' && w.steps.length === 3);
    expect(prHighWf).toBeDefined();
    expect(prHighWf?.steps.length).toBe(3); // Dept Manager -> Finance -> CEO
  });

  it('should support creating and saving custom multi-step approval workflows', async () => {
    const workflow = await ApprovalEngine.saveWorkflow({
      company_id: companyId,
      documentType: 'EXPENSE',
      name: 'Custom High Value Expense Approval',
      description: '3-tier expense approval',
      isActive: true,
      minAmount: 50000,
      steps: [
        {
          stepNumber: 1,
          name: 'Supervisor Review',
          approverType: 'ROLE',
          requiredRoles: ['StationAdmin', 'DepartmentManager'],
          labelAr: 'مراجعة المشرف',
          labelEn: 'Supervisor Review'
        },
        {
          stepNumber: 2,
          name: 'Financial Controller Approval',
          approverType: 'ROLE',
          requiredRoles: ['FinanceManager', 'Accountant'],
          labelAr: 'اعتماد المراقب المالي',
          labelEn: 'Financial Controller Approval'
        },
        {
          stepNumber: 3,
          name: 'CFO Final Authorization',
          approverType: 'ROLE',
          requiredRoles: ['CFO', 'Admin', 'SystemAdmin'],
          labelAr: 'اعتماد المدير المالي التنفيذي',
          labelEn: 'CFO Final Authorization'
        }
      ]
    });

    expect(workflow).not.toBeNull();
    expect(workflow!.id).toBeDefined();
    expect(workflow!.steps.length).toBe(3);

    const retrieved = ApprovalEngine.getWorkflows(companyId, 'EXPENSE');
    expect(retrieved.length).toBe(1);
    expect(retrieved[0].name).toBe('Custom High Value Expense Approval');
  });

  it('should evaluate and start an approval workflow instance on document submission', async () => {
    await ApprovalEngine.createDefaultWorkflows(companyId);

    const result = await ApprovalEngine.evaluateAndStartWorkflow({
      companyId,
      documentType: 'PURCHASE_REQUEST',
      documentId: 'pr-doc-101',
      amount: 75000,
      requesterId: 'usr-requester',
      requesterName: 'Employee User'
    });

    expect(result.isAutoApproved).toBe(false);
    expect(result.instance).not.toBeNull();
    expect(result.instance?.status).toBe('PENDING');
    expect(result.instance?.currentStepNumber).toBe(1);
    expect(result.instance?.totalSteps).toBe(3);
  });

  it('should enforce sequential multi-stage approvals (Dept Manager -> Finance -> CEO)', async () => {
    await ApprovalEngine.createDefaultWorkflows(companyId);

    const { instance } = await ApprovalEngine.evaluateAndStartWorkflow({
      companyId,
      documentType: 'PURCHASE_REQUEST',
      documentId: 'pr-doc-102',
      amount: 100000,
      requesterId: 'usr-requester',
      requesterName: 'Employee User'
    });

    expect(instance).not.toBeNull();
    const instId = instance!.id;

    // Unauthorized user attempt
    const unauthorizedUser = { id: 'usr-clerk', role: 'Clerk', userRoles: ['Clerk'] };
    expect(ApprovalEngine.canUserApproveStep(instance!, unauthorizedUser)).toBe(false);
    await expect(
      ApprovalEngine.approveStep({
        instanceId: instId,
        actor: { id: 'usr-clerk', name: 'Clerk User', role: 'Clerk' }
      })
    ).rejects.toThrow();

    // Step 1: Department Manager Approves
    const deptMgr = { id: 'usr-dept-mgr', role: 'DepartmentManager', userRoles: ['DepartmentManager'] };
    expect(ApprovalEngine.canUserApproveStep(instance!, deptMgr)).toBe(true);

    const step1Result = await ApprovalEngine.approveStep({
      instanceId: instId,
      actor: { id: 'usr-dept-mgr', name: 'Department Manager', role: 'DepartmentManager' },
      comments: 'Step 1 Approved'
    });

    expect(step1Result.isFinalApproval).toBe(false);
    expect(step1Result.instance.currentStepNumber).toBe(2);
    expect(step1Result.instance.status).toBe('PENDING');

    // Step 2: Finance Approves
    const finUser = { id: 'usr-fin', role: 'FinanceManager', userRoles: ['FinanceManager'] };
    expect(ApprovalEngine.canUserApproveStep(step1Result.instance, finUser)).toBe(true);

    const step2Result = await ApprovalEngine.approveStep({
      instanceId: instId,
      actor: { id: 'usr-fin', name: 'Finance Lead', role: 'FinanceManager' },
      comments: 'Budget Verified'
    });

    expect(step2Result.isFinalApproval).toBe(false);
    expect(step2Result.instance.currentStepNumber).toBe(3);

    // Step 3: CEO Final Approval
    const ceoUser = { id: 'usr-ceo', role: 'CEO', userRoles: ['CEO'] };
    expect(ApprovalEngine.canUserApproveStep(step2Result.instance, ceoUser)).toBe(true);

    const step3Result = await ApprovalEngine.approveStep({
      instanceId: instId,
      actor: { id: 'usr-ceo', name: 'Chief Executive', role: 'CEO' },
      comments: 'Final CEO Signature'
    });

    expect(step3Result.isFinalApproval).toBe(true);
    expect(step3Result.instance.status).toBe('APPROVED');
    expect(step3Result.instance.history.length).toBe(3);
  });

  it('should handle rejection at any stage of the workflow', async () => {
    await ApprovalEngine.createDefaultWorkflows(companyId);

    const { instance } = await ApprovalEngine.evaluateAndStartWorkflow({
      companyId,
      documentType: 'PURCHASE_REQUEST',
      documentId: 'pr-doc-103',
      amount: 85000,
      requesterId: 'usr-requester'
    });

    // Step 1 Approved
    await ApprovalEngine.approveStep({
      instanceId: instance!.id,
      actor: { id: 'usr-dept-mgr', name: 'Department Manager', role: 'DepartmentManager' }
    });

    // Step 2 Rejected by Finance
    const rejectedInstance = await ApprovalEngine.rejectStep({
      instanceId: instance!.id,
      actor: { id: 'usr-fin', name: 'Finance Auditor', role: 'FinanceManager' },
      comments: 'Over budget limit'
    });

    expect(rejectedInstance.status).toBe('REJECTED');
    expect(rejectedInstance.history[1].action).toBe('REJECTED');
  });

  it('should list pending approvals for authorized users', async () => {
    await ApprovalEngine.createDefaultWorkflows(companyId);

    // Start 2 instances
    await ApprovalEngine.evaluateAndStartWorkflow({
      companyId,
      documentType: 'PURCHASE_REQUEST',
      documentId: 'pr-doc-201',
      amount: 20000,
      requesterId: 'usr-req1'
    });

    await ApprovalEngine.evaluateAndStartWorkflow({
      companyId,
      documentType: 'PURCHASE_REQUEST',
      documentId: 'pr-doc-202',
      amount: 30000,
      requesterId: 'usr-req2'
    });

    const deptMgrUser = { id: 'usr-dept-1', role: 'DepartmentManager', userRoles: ['DepartmentManager'] };
    const pendingForDeptMgr = ApprovalEngine.getPendingApprovalsForUser(companyId, deptMgrUser);
    expect(pendingForDeptMgr.length).toBe(2);

    const clerkUser = { id: 'usr-clerk-1', role: 'Clerk', userRoles: ['Clerk'] };
    const pendingForClerk = ApprovalEngine.getPendingApprovalsForUser(companyId, clerkUser);
    expect(pendingForClerk.length).toBe(0);
  });

  it('should seamlessly integrate with PurchasingBusinessEngine events without breaking logic', async () => {
    await ApprovalEngine.createDefaultWorkflows(companyId);
    const engine = new PurchasingBusinessEngine();

    // Create PR
    const createRes = await engine.processEvent({
      eventId: 'evt-pr-1',
      eventType: 'PR_SUBMITTED',
      tenantId: companyId,
      organizationId: companyId,
      user_id: 'usr-req',
      user_name: 'John Doe',
      user_role: 'Admin',
      metadataVersion: '1.0',
      timestamp: new Date().toISOString(),
      payload: {
        companyId,
        requesterId: 'usr-req',
        requesterName: 'John Doe',
        department: 'Engineering',
        items: [{ itemId: 'item-1', itemName: 'Laptop', qty: 2, estimatedPrice: 50000 }],
        notes: 'Tech upgrade'
      }
    });

    expect(createRes.success).toBe(true);
    const createdPR = createRes.outputData;
    expect(createdPR.status).toBe('PENDING_APPROVAL');

    // Attempt approve by StationAdmin without workflow step role (should fail)
    const unauthorizedRes = await engine.processEvent({
      eventId: 'evt-pr-2',
      eventType: 'PR_APPROVED',
      tenantId: companyId,
      organizationId: companyId,
      user_id: 'usr-clerk',
      user_name: 'Clerk User',
      user_role: 'StationAdmin',
      metadataVersion: '1.0',
      timestamp: new Date().toISOString(),
      payload: { prId: createdPR.id }
    });
    expect(unauthorizedRes.success).toBe(false);

    // Approve Step 1 by RegionalManager (matching requiredRoles)
    const app1Res = await engine.processEvent({
      eventId: 'evt-pr-3',
      eventType: 'PR_APPROVED',
      tenantId: companyId,
      organizationId: companyId,
      user_id: 'usr-dept-mgr',
      user_name: 'Dept Manager',
      user_role: 'RegionalManager',
      metadataVersion: '1.0',
      timestamp: new Date().toISOString(),
      payload: { prId: createdPR.id }
    });

    expect(app1Res.success).toBe(true);
    // Still pending final approval because total steps is 3
    const prsAfterStep1 = StorageEngine.getStored<any[]>('purchase_requests', []);
    expect(prsAfterStep1[0].status).toBe('PENDING_APPROVAL');

    // Approve Step 2 by Admin
    await engine.processEvent({
      eventId: 'evt-pr-4',
      eventType: 'PR_APPROVED',
      tenantId: companyId,
      organizationId: companyId,
      user_id: 'usr-fin',
      user_name: 'Finance Lead',
      user_role: 'Admin',
      metadataVersion: '1.0',
      timestamp: new Date().toISOString(),
      payload: { prId: createdPR.id }
    });

    // Approve Step 3 by SystemAdmin
    await engine.processEvent({
      eventId: 'evt-pr-5',
      eventType: 'PR_APPROVED',
      tenantId: companyId,
      organizationId: companyId,
      user_id: 'usr-ceo',
      user_name: 'Chief Executive',
      user_role: 'SystemAdmin',
      metadataVersion: '1.0',
      timestamp: new Date().toISOString(),
      payload: { prId: createdPR.id }
    });

    // Now PR status should be APPROVED
    const prsAfterStep3 = StorageEngine.getStored<any[]>('purchase_requests', []);
    expect(prsAfterStep3[0].status).toBe('APPROVED');
  });

  describe('Write-ordering & Offline consistency tests (Phase C)', () => {
    beforeEach(() => {
      ApprovalEngine.resetState();
    });

    it('should fail saveWorkflow when offline without modifying StorageEngine', async () => {
      const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      try {
        const res = await ApprovalEngine.saveWorkflow({
          company_id: companyId,
          documentType: 'EXPENSE',
          name: 'Offline Workflow',
          isActive: true,
          steps: []
        });

        expect(res).toBeNull();
        const stored = StorageEngine.getStored<any[]>('approval_workflows', []);
        expect(stored.length).toBe(0);
      } finally {
        if (originalOnLine) {
          Object.defineProperty(navigator, 'onLine', originalOnLine);
        } else {
          Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
        }
      }
    });

    it('should fail deleteWorkflow when offline without modifying StorageEngine', async () => {
      // First save an item online
      const wf = await ApprovalEngine.saveWorkflow({
        company_id: companyId,
        documentType: 'EXPENSE',
        name: 'Online Workflow',
        isActive: true,
        steps: []
      });
      expect(wf).not.toBeNull();
      expect(StorageEngine.getStored<any[]>('approval_workflows', []).length).toBe(1);

      // Now set offline and attempt delete
      const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      try {
        const success = await ApprovalEngine.deleteWorkflow(wf!.id);
        expect(success).toBe(false);

        // Confirm still in StorageEngine
        const stored = StorageEngine.getStored<any[]>('approval_workflows', []);
        expect(stored.length).toBe(1);
        expect(stored[0].id).toBe(wf!.id);
      } finally {
        if (originalOnLine) {
          Object.defineProperty(navigator, 'onLine', originalOnLine);
        } else {
          Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
        }
      }
    });

    it('should fail evaluateAndStartWorkflow when offline without creating instance in StorageEngine', async () => {
      await ApprovalEngine.createDefaultWorkflows(companyId);

      const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      try {
        const result = await ApprovalEngine.evaluateAndStartWorkflow({
          companyId,
          documentType: 'PURCHASE_REQUEST',
          documentId: 'pr-doc-offline',
          amount: 75000,
          requesterId: 'usr-requester',
          requesterName: 'Employee User'
        });

        expect(result.instance).toBeNull();
        expect(result.error).toBeDefined();

        const storedInstances = StorageEngine.getStored<any[]>('approval_instances', []);
        expect(storedInstances.length).toBe(0);
      } finally {
        if (originalOnLine) {
          Object.defineProperty(navigator, 'onLine', originalOnLine);
        } else {
          Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
        }
      }
    });

    it('should fail approveStep when offline without modifying instance state in StorageEngine', async () => {
      await ApprovalEngine.createDefaultWorkflows(companyId);
      const { instance } = await ApprovalEngine.evaluateAndStartWorkflow({
        companyId,
        documentType: 'PURCHASE_REQUEST',
        documentId: 'pr-doc-online',
        amount: 75000,
        requesterId: 'usr-requester'
      });
      expect(instance).not.toBeNull();

      const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      try {
        await expect(
          ApprovalEngine.approveStep({
            instanceId: instance!.id,
            actor: { id: 'usr-dept-mgr', name: 'Dept Mgr', role: 'DepartmentManager' }
          })
        ).rejects.toThrow();

        // Check that StorageEngine still has currentStepNumber: 1, history empty
        const storedInstances = StorageEngine.getStored<any[]>('approval_instances', []);
        expect(storedInstances[0].currentStepNumber).toBe(1);
        expect(storedInstances[0].history.length).toBe(0);
        expect(storedInstances[0].status).toBe('PENDING');
      } finally {
        if (originalOnLine) {
          Object.defineProperty(navigator, 'onLine', originalOnLine);
        } else {
          Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
        }
      }
    });

    it('should fail rejectStep when offline without modifying instance state in StorageEngine', async () => {
      await ApprovalEngine.createDefaultWorkflows(companyId);
      const { instance } = await ApprovalEngine.evaluateAndStartWorkflow({
        companyId,
        documentType: 'PURCHASE_REQUEST',
        documentId: 'pr-doc-online-2',
        amount: 75000,
        requesterId: 'usr-requester'
      });
      expect(instance).not.toBeNull();

      const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      try {
        await expect(
          ApprovalEngine.rejectStep({
            instanceId: instance!.id,
            actor: { id: 'usr-dept-mgr', name: 'Dept Mgr', role: 'DepartmentManager' },
            comments: 'Reject'
          })
        ).rejects.toThrow();

        // Check that StorageEngine still has status: PENDING
        const storedInstances = StorageEngine.getStored<any[]>('approval_instances', []);
        expect(storedInstances[0].status).toBe('PENDING');
        expect(storedInstances[0].history.length).toBe(0);
      } finally {
        if (originalOnLine) {
          Object.defineProperty(navigator, 'onLine', originalOnLine);
        } else {
          Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
        }
      }
    });
  });
});
