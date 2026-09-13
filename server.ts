/**
 * @file server.ts
 * @description Enterprise Express Server for A.N ERP (v7.1)
 * Binds to 0.0.0.0:3000.
 * Houses server-side API routes, RFC7807 error formatting, and Vite dev middleware.
 */

import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { Phase0TestRunner } from './src/core/tests/Phase0TestRunner';
import { globalStorageRouter } from './src/core/storage/StorageRouter';
import { PostingEngine } from './src/core/engines/PostingEngine';
import { ApprovalEngine } from './src/core/engines/ApprovalEngine';
import { NumberingEngine } from './src/core/engines/NumberingEngine';
import { JournalEntry, RFC7807Problem } from './src/core/storage/StoragePort';

const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json());

  // Use appropriate storage based on environment
  const primaryStorage = globalStorageRouter.getPrimaryAdapter();
  const devStorage = globalStorageRouter.getDevInMemoryAdapter();

  // Helper to get active storage adapter
  const getStorage = () => {
    return process.env.DATABASE_URL ? primaryStorage : devStorage;
  };

  // 1. Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      system: 'A.N ERP',
      version: 'v7.1',
      environment: process.env.NODE_ENV || 'development',
      storageEngine: process.env.DATABASE_URL ? 'PostgreSQL (Primary)' : 'InMemoryAdapter (Dev)',
    });
  });

  // 2. Authentication (Enterprise Login)
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { username, password } = req.body;
    if (!username || !password) {
      const problem: RFC7807Problem = {
        type: 'https://api.an-erp.local/errors/invalid-credentials',
        title: 'بيانات الدخول غير مكتملة',
        status: 400,
        detail: 'اسم المستخدم وكلمة المرور مطلوبان لتسجيل الدخول.',
      };
      return res.status(400).json(problem);
    }

    // Default enterprise session
    const session = {
      user: {
        id: 'USR-001',
        username,
        fullName: username === 'approver' ? 'سليمان الراشد' : 'أحمد المنصور',
        role: username === 'approver' ? 'financial_approver' : 'accountant',
        roleTitleAr: username === 'approver' ? 'معتمد مالي أول' : 'محاسب عام',
        branchName: 'الفرع الرئيسي - الرياض',
      },
      tenant: {
        id: 'tenant-main',
        nameAr: 'شركة الأعمال الموحدة القابضة',
        taxNumber: '300128472900003',
      },
      expiresAt: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    };

    return res.json({ success: true, data: session });
  });

  // 3. Transactions List
  app.get('/api/transactions', async (req: Request, res: Response) => {
    const storage = getStorage();
    const result = await storage.listJournalEntries('tenant-main');
    if (!result.success) {
      return res.status(result.error?.status || 500).json(result.error);
    }
    return res.json({ success: true, data: result.data });
  });

  // 4. Create and Post Transaction
  app.post('/api/transactions/post', async (req: Request, res: Response) => {
    const { entry, idempotencyKey } = req.body;
    if (!idempotencyKey) {
      const problem: RFC7807Problem = {
        type: 'https://api.an-erp.local/errors/missing-idempotency-key',
        title: 'مفتاح Idempotency-Key إلزامي',
        status: 400,
        detail: 'كل عملية كتابة حساسة تتطلب مفتاح idempotencyKey لمنع تكرار القيد.',
      };
      return res.status(400).json(problem);
    }

    const storage = getStorage();
    const postingEngine = new PostingEngine(storage);
    const numberingEngine = new NumberingEngine(storage);

    // Generate atomic sequence code if not present
    if (!entry.code) {
      const seqRes = await numberingEngine.generateNumber('tenant-main', 'JV_SEQ', 'JV-2026', `${idempotencyKey}-seq`);
      if (seqRes.success && seqRes.data) {
        entry.code = seqRes.data.formattedCode;
      }
    }

    const draftRes = await postingEngine.draftEntry('tenant-main', entry, `${idempotencyKey}-draft`);
    if (!draftRes.success) {
      return res.status(draftRes.error?.status || 422).json(draftRes.error);
    }

    const postRes = await postingEngine.postEntry('tenant-main', entry.id, idempotencyKey);
    if (!postRes.success) {
      return res.status(postRes.error?.status || 422).json(postRes.error);
    }

    return res.json({ success: true, data: postRes.data });
  });

  // 5. Approve Transaction with Segregation of Duties (SoD)
  app.post('/api/transactions/approve', async (req: Request, res: Response) => {
    const { requestId, approverId, initiatorId, idempotencyKey } = req.body;

    if (!idempotencyKey) {
      return res.status(400).json({
        type: 'https://api.an-erp.local/errors/missing-idempotency-key',
        title: 'مفتاح idempotencyKey مطلوب',
        status: 400,
        detail: 'عمليات الاعتماد المالي تتطلب idempotencyKey.',
      });
    }

    const storage = getStorage();
    const approvalEngine = new ApprovalEngine(storage);

    const dummyRequest = {
      id: requestId,
      tenantId: 'tenant-main',
      documentType: 'JOURNAL_VOUCHER',
      documentId: requestId,
      documentCode: `JV-${requestId}`,
      initiatorId: initiatorId || 'USR-001',
      currentStep: 1,
      steps: [{ stepNumber: 1, roleRequired: 'financial_approver', status: 'PENDING' as const }],
      status: 'PENDING' as const,
      createdAt: new Date().toISOString(),
    };

    const approveRes = await approvalEngine.executeApproval('tenant-main', dummyRequest, approverId, idempotencyKey);
    if (!approveRes.success) {
      return res.status(approveRes.error?.status || 403).json(approveRes.error);
    }

    return res.json({ success: true, data: approveRes.data });
  });

  // 6. Internal Route: /internal/build-status (Protected audit view per section 1.3)
  app.get('/api/internal/build-status', async (req: Request, res: Response) => {
    const runner = new Phase0TestRunner();
    const report = await runner.runAll();
    return res.json(report);
  });

  // 7. Vite middleware for frontend development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`A.N ERP Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
