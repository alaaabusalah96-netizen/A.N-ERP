import { http, HttpResponse } from 'msw';

export const mockUsers = [
  {
    id: 'user-admin-1',
    full_name: 'أحمد محمود (مدير النظام)',
    email: 'admin@kemit.com',
    role: 'Admin',
    company_id: 'comp-1',
    station_id: 'st-01',
    is_active: true
  },
  {
    id: 'user-station-1',
    full_name: 'محمود حسن (مدير محطة)',
    email: 'store@kemit.com',
    role: 'StationAdmin',
    company_id: 'comp-1',
    station_id: 'st-01',
    is_active: true
  }
];

export const mockTransactions = [
  {
    id: 'tx-101',
    transaction_no: 'EXP-2026-001',
    amount: 1500,
    category: 'وقود وصيانة',
    status: 'PENDING',
    company_id: 'comp-1',
    station_id: 'st-01',
    notes: 'مصروف شراء وقود لمولدة المحطة الرئيسية',
    created_at: '2026-08-10T10:00:00Z',
    created_by: 'user-station-1'
  },
  {
    id: 'tx-102',
    transaction_no: 'EXP-2026-002',
    amount: 450,
    category: 'مستلزمات مكتبية',
    status: 'APPROVED',
    company_id: 'comp-1',
    station_id: 'st-01',
    notes: 'شراء أوراق وأحبار للطباعة',
    created_at: '2026-08-09T14:30:00Z',
    created_by: 'user-station-1'
  }
];

export const mockWarehouses = [
  {
    id: 'wh-main-01',
    code: 'WH-MAIN',
    name: 'المستودع المركزي - القاهرة',
    type: 'MAIN',
    parent_id: null,
    company_id: 'comp-1',
    capacity: 10000,
    bins_count: 12
  },
  {
    id: 'wh-sub-01',
    code: 'WH-SPARE',
    name: 'مخزن قطع الغيار',
    type: 'SUB',
    parent_id: 'wh-main-01',
    company_id: 'comp-1',
    capacity: 2500,
    bins_count: 5
  }
];

export const mockDocuments = [
  {
    id: 'doc-001',
    document_no: 'GRN-2026-0001',
    doc_type: 'GOODS_RECEIPT',
    warehouse_id: 'wh-main-01',
    status: 'POSTED',
    notes: 'إذن إضافة مخزني بضاعة واردة من المورد الرئيسي',
    created_at: '2026-08-10',
    items: [{ item_id: 'item-101', item_name: 'زيت محرك 4L', qty: 50, unit_price: 250 }]
  }
];

export const mockPurchaseOrders = [
  {
    id: 'po-101',
    poNumber: 'PO-2026-001',
    vendorId: 'vendor-01',
    vendorName: 'شركة التوريدات العامة',
    totalAmount: 12500,
    status: 'ISSUED',
    items: [
      { id: 'item-101', name: 'زيت محرك 4L', qty: 50, unitPrice: 250 }
    ]
  }
];

export const mockEmployees = [
  {
    id: 'emp-001',
    fullName: 'سامي عبد الرحمن',
    jobTitle: 'أخصائي مخازن',
    department: 'المخازن واللوجستيات',
    status: 'ACTIVE',
    basicSalary: 8500
  }
];

export const mockContractClaims = [
  {
    id: 'claim-101',
    claimNo: 'IPC-2026-001',
    projectName: 'مشروع إنشاء مبنى المحطة الجديدة',
    subcontractorName: 'شركة النيل للمقاولات',
    grossAmount: 45000,
    retentionAmount: 4500,
    netAmount: 40500,
    status: 'APPROVED'
  }
];

export const mockRestaurantOrders = [
  {
    id: 'ord-101',
    orderNo: 'POS-8821',
    tableNo: 'Table 4',
    totalAmount: 320,
    status: 'COMPLETED',
    paymentMethod: 'CASH',
    items: [
      { menuItemId: 'menu-1', name: 'وجبة غداء عمل', qty: 2, price: 160 }
    ]
  }
];

export const handlers = [
  // Authentication
  http.post('/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as any;
    if (body.email === 'admin@kemit.com' && body.password === 'Password123!') {
      return HttpResponse.json({
        success: true,
        user: mockUsers[0],
        token: 'mock-jwt-token'
      });
    }
    return HttpResponse.json(
      { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' },
      { status: 401 }
    );
  }),

  http.post('/api/auth/logout', () => {
    return HttpResponse.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
  }),

  http.get('/api/auth/me', () => {
    return HttpResponse.json({
      authenticated: true,
      user: mockUsers[0]
    });
  }),

  // User Management
  http.get('/api/admin/users', () => {
    return HttpResponse.json({
      success: true,
      users: mockUsers
    });
  }),

  http.patch('/api/admin/users/:id/status', async ({ params, request }) => {
    const body = (await request.json()) as any;
    const user = mockUsers.find(u => u.id === params.id);
    if (user) {
      user.is_active = body.is_active;
      return HttpResponse.json({ success: true, user });
    }
    return HttpResponse.json({ success: false, error: 'المستخدم غير موجود' }, { status: 404 });
  }),

  // Transactions & Expense Approvals
  http.get('/api/transactions', ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    let txs = mockTransactions;
    if (status) {
      txs = txs.filter((t) => t.status === status.toUpperCase());
    }
    return HttpResponse.json({
      success: true,
      transactions: txs
    });
  }),

  http.get('/api/transactions/pending', () => {
    return HttpResponse.json({
      success: true,
      transactions: mockTransactions.filter((t) => t.status === 'PENDING')
    });
  }),

  http.post('/api/transactions', async ({ request }) => {
    const newTx = (await request.json()) as any;
    const created = {
      id: `tx-${Date.now()}`,
      transaction_no: `EXP-2026-${Math.floor(100 + Math.random() * 900)}`,
      status: 'PENDING',
      created_at: new Date().toISOString(),
      company_id: 'comp-1',
      ...newTx
    };
    mockTransactions.unshift(created);
    return HttpResponse.json(
      {
        success: true,
        transaction: created
      },
      { status: 201 }
    );
  }),

  http.post('/api/transactions/:id/approve', ({ params }) => {
    const target = mockTransactions.find((t) => t.id === params.id);
    if (target) {
      target.status = 'APPROVED';
      return HttpResponse.json({ success: true, id: params.id, status: 'APPROVED', transaction: target });
    }
    return HttpResponse.json({ success: false, error: 'المعاملة غير موجودة' }, { status: 404 });
  }),

  http.post('/api/transactions/:id/reject', async ({ params, request }) => {
    const body = (await request.json()) as any;
    const target = mockTransactions.find((t) => t.id === params.id);
    if (target) {
      target.status = 'REJECTED';
      return HttpResponse.json({
        success: true,
        id: params.id,
        status: 'REJECTED',
        reason: body?.reason || 'تم الرفض بواسطة الإدارة'
      });
    }
    return HttpResponse.json({ success: false, error: 'المعاملة غير موجودة' }, { status: 404 });
  }),

  // Inventory & Warehouse Management
  http.get('/api/inventory/warehouses', () => {
    return HttpResponse.json({
      success: true,
      warehouses: mockWarehouses
    });
  }),

  http.post('/api/inventory/warehouses', async ({ request }) => {
    const body = (await request.json()) as any;
    const newWh = {
      id: `wh-${Date.now()}`,
      code: body.code || 'WH-NEW',
      name: body.name,
      type: body.type || 'SUB',
      parent_id: body.parent_id || null,
      company_id: 'comp-1',
      capacity: body.capacity || 1000,
      bins_count: 0
    };
    mockWarehouses.push(newWh);
    return HttpResponse.json({ success: true, warehouse: newWh }, { status: 201 });
  }),

  http.get('/api/inventory/documents', () => {
    return HttpResponse.json({
      success: true,
      documents: mockDocuments
    });
  }),

  http.post('/api/inventory/documents', async ({ request }) => {
    const body = (await request.json()) as any;
    const newDoc = {
      id: `doc-${Date.now()}`,
      document_no: `DOC-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      doc_type: body.doc_type || 'GOODS_RECEIPT',
      warehouse_id: body.warehouse_id || 'wh-main-01',
      status: 'POSTED',
      notes: body.notes || '',
      created_at: new Date().toISOString(),
      items: body.items || []
    };
    mockDocuments.unshift(newDoc);
    return HttpResponse.json({ success: true, document: newDoc }, { status: 201 });
  }),

  http.get('/api/inventory/stock-balances', () => {
    return HttpResponse.json({
      success: true,
      balances: [
        { item_id: 'item-101', item_name: 'زيت محرك 4L', sku: 'OIL-4L-01', qty: 120, unit: 'علبة', warehouse_id: 'wh-main-01' },
        { item_id: 'item-102', item_name: 'فلتر زيت هيدروليكي', sku: 'FLT-HYD-02', qty: 35, unit: 'قطعة', warehouse_id: 'wh-main-01' }
      ]
    });
  }),

  // Purchasing Module
  http.get('/api/purchasing/orders', () => {
    return HttpResponse.json({ success: true, orders: mockPurchaseOrders });
  }),

  http.post('/api/purchasing/orders/:id/receive', ({ params }) => {
    const target = mockPurchaseOrders.find(p => p.id === params.id);
    if (target) {
      target.status = 'RECEIVED';
      return HttpResponse.json({ success: true, order: target });
    }
    return HttpResponse.json({ success: false, error: 'أمر الشراء غير موجود' }, { status: 404 });
  }),

  // HR & Attendance
  http.get('/api/hr/employees', () => {
    return HttpResponse.json({ success: true, employees: mockEmployees });
  }),

  http.post('/api/hr/attendance', async ({ request }) => {
    const body = (await request.json()) as any;
    return HttpResponse.json({
      success: true,
      record: {
        id: `att-${Date.now()}`,
        employeeId: body.employeeId || 'emp-001',
        timestamp: new Date().toISOString(),
        type: body.type || 'CHECK_IN'
      }
    });
  }),

  // Contracting Module
  http.get('/api/contracting/claims', () => {
    return HttpResponse.json({ success: true, claims: mockContractClaims });
  }),

  // Restaurant & POS
  http.get('/api/restaurant/orders', () => {
    return HttpResponse.json({ success: true, orders: mockRestaurantOrders });
  }),

  http.post('/api/restaurant/orders', async ({ request }) => {
    const body = (await request.json()) as any;
    const newOrd = {
      id: `ord-${Date.now()}`,
      orderNo: `POS-${Math.floor(1000 + Math.random() * 9000)}`,
      tableNo: body.tableNo || 'Takeaway',
      totalAmount: body.totalAmount || 0,
      status: 'PENDING',
      paymentMethod: body.paymentMethod || 'CASH',
      items: body.items || []
    };
    mockRestaurantOrders.unshift(newOrd);
    return HttpResponse.json({ success: true, order: newOrd }, { status: 201 });
  }),

  // Accounting & Financial Reports
  http.get('/api/accounting/entries', () => {
    return HttpResponse.json({
      success: true,
      entries: [
        { id: 'je-001', entry_no: 'JE-2026-001', date: '2026-08-10', total_debit: 1500, total_credit: 1500, status: 'POSTED' }
      ]
    });
  }),

  http.get('/api/reports/dashboard-kpis', () => {
    return HttpResponse.json({
      success: true,
      kpis: {
        total_expenses_month: 24500,
        pending_approvals_count: mockTransactions.filter((t) => t.status === 'PENDING').length,
        total_warehouses_count: mockWarehouses.length,
        total_inventory_valuation: 185000
      }
    });
  })
];
