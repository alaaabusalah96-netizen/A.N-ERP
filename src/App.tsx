import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar, ActiveSection } from './components/Sidebar';
import { OperationalWorkspace } from './components/OperationalWorkspace';
import { TransactionModal } from './components/TransactionModal';
import { PrintVoucherModal } from './components/PrintVoucherModal';
import { LoginScreen } from './components/LoginScreen';
import { ForcePasswordChangeScreen } from './components/ForcePasswordChangeScreen';
import { UserProfileView } from './components/UserProfileView';
import { CompanySettingsView } from './components/CompanySettingsView';
import { CompanyWizardView } from './components/CompanyWizardView';
import { GovernanceView } from './components/GovernanceView';
import { UsersAndSodView } from './components/UsersAndSodView';
import { CustomFieldsView } from './components/CustomFieldsView';
import { AuditTrailView } from './components/AuditTrailView';
import { AccountingWorkspaceView } from './components/AccountingWorkspaceView';
import { CashCustodyWorkspaceView } from './components/CashCustodyWorkspaceView';
import { ExpensesWorkspaceView } from './components/ExpensesWorkspaceView';
import { InventoryWorkspaceView } from './components/InventoryWorkspaceView';
import { PurchasingWorkspaceView } from './components/PurchasingWorkspaceView';
import { OperationalTransaction, UserProfile, UserRole } from './types/erp';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [calendar, setCalendar] = useState<any>(null);
  const [activeSection, setActiveSection] = useState<ActiveSection>('overview');
  const [transactions, setTransactions] = useState<OperationalTransaction[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTxForPrint, setSelectedTxForPrint] = useState<OperationalTransaction | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // Session is carried by HttpOnly cookies (credentials: 'include'); no token is held in JS state or storage.
  // tokenOverride is accepted for call-site compatibility and ignored.
  const getAuthHeaders = (extraHeaders?: Record<string, string>, _tokenOverride?: string) => {
    return { ...(extraHeaders || {}) } as Record<string, string>;
  };

  // Check auth session via HttpOnly cookie on initial mount
  useEffect(() => {
    checkCurrentAuth();
    fetchDualCalendar();
  }, []);

  const checkCurrentAuth = async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if ((data.authenticated || data.success) && data.user) {
          const mustChange =
            !!data.requiresPasswordChange ||
            !!data.user?.requiresPasswordChange;
          setCurrentUser({ ...data.user, requiresPasswordChange: mustChange });
          setIsLoggedIn(true);
          if (!mustChange) {
            fetchTransactions();
          }
        }
      }
    } catch {
      // not authenticated yet
    }
  };

  const fetchDualCalendar = async () => {
    try {
      const res = await fetch('/api/calendar', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          setCalendar(data.data);
        } else if (data.calendar) {
          setCalendar(data.calendar);
        }
      }
    } catch {
      // fallback
    }
  };

  function mapJournalStatusToArabic(status: string): OperationalTransaction['status'] {
    switch (status) {
      case 'PENDING_APPROVAL':
        return 'بانتظار الاعتماد';
      case 'APPROVED':
      case 'POSTED':
        return 'معتمد';
      case 'REVERSED':
        return 'مرفوض';
      case 'DRAFT':
      default:
        return 'مسودة'; // قيمة افتراضية آمنة لأي حالة غير متوقعة مستقبلًا
    }
  }

  const fetchTransactions = async (overrideToken?: string) => {
    setIsLoadingTransactions(true);
    try {
      const res = await fetch('/api/transactions', {
        headers: getAuthHeaders(undefined, overrideToken),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          const mapped: OperationalTransaction[] = data.data.map((entry: any) => ({
            id: entry.id,
            code: entry.code ?? '—',
            date: entry.date ?? '',
            type: entry.type ?? 'قيد',
            description: entry.description ?? '',
            amount: typeof entry.totalAmount === 'number' ? entry.totalAmount : 0,
            currency: entry.currency ?? 'ر.س',
            party: entry.party ?? '—',
            initiator: entry.createdBy ?? '—',
            status: mapJournalStatusToArabic(entry.status),
          }));
          setTransactions(mapped);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingTransactions(false);
    }
  };

  const handleLoginSuccess = (loginData: any) => {
    const user = loginData?.user ?? null;
    const mustChange =
      !!loginData?.requiresPasswordChange ||
      !!user?.requiresPasswordChange;
    const nextUser = user
      ? { ...user, requiresPasswordChange: mustChange }
      : user;
    setCurrentUser(nextUser);
    setIsLoggedIn(true);
    if (loginData?.calendar) {
      setCalendar(loginData.calendar);
    }
    if (mustChange) {
      showNotification('يجب تغيير كلمة المرور قبل استخدام النظام.');
    } else {
      showNotification(`مرحباً بك ${user?.fullName ?? ''}، تم تسجيل الدخول بنجاح.`);
      fetchTransactions();
    }
  };

  const handlePasswordForceChanged = () => {
    setCurrentUser((prev: any) =>
      prev ? { ...prev, requiresPasswordChange: false } : prev
    );
    showNotification('تم تغيير كلمة المرور بنجاح. يمكنك استخدام النظام الآن.');
    fetchTransactions();
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
    } catch {
      // ignore
    }
    setIsLoggedIn(false);
    setCurrentUser(null);
    setActiveSection('overview');
  };

  const handleSaveTransaction = async (
    newTx: OperationalTransaction,
    lines: Array<{
      id: string;
      accountCode: string;
      accountName?: string;
      costCenter?: string;
      debit: number;
      credit: number;
      note?: string;
    }> = [],
  ) => {
    try {
      // UI-OPS-1: real endpoint is POST /api/transactions/post (not POST /api/transactions)
      const idempotencyKey = `tx-${newTx.id}-${Date.now()}`;
      const entry = {
        id: newTx.id,
        code: newTx.code,
        date: newTx.date,
        type: newTx.type || 'JOURNAL',
        description: newTx.description,
        party: newTx.party,
        totalAmount: newTx.amount,
        status: 'PENDING_APPROVAL',
        createdBy: currentUser?.id || currentUser?.username || 'USR',
        lines: (lines || []).map((l) => ({
          id: l.id,
          accountCode: l.accountCode,
          costCenter: l.costCenter,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          description: l.note || newTx.description || '',
        })),
      };
      const res = await fetch('/api/transactions/post', {
        method: 'POST',
        headers: getAuthHeaders({
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        }),
        credentials: 'include',
        body: JSON.stringify({ entry, idempotencyKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const saved = data.data || entry;
        const mapped: OperationalTransaction = {
          id: saved.id || newTx.id,
          code: saved.code || newTx.code,
          date: saved.date || newTx.date,
          type: saved.type || newTx.type,
          description: saved.description || newTx.description,
          amount: typeof saved.totalAmount === 'number' ? saved.totalAmount : newTx.amount,
          currency: newTx.currency || 'ر.س',
          party: newTx.party,
          status: mapJournalStatusToArabic(saved.status || 'POSTED'),
          initiator: newTx.initiator,
        };
        setTransactions((prev) => [mapped, ...prev]);
        showNotification(`تم حفظ وترحيل المستند (${mapped.code}) بنجاح.`);
        fetchTransactions();
      } else {
        showNotification(data.detail || data.title || 'تعذر حفظ المستند');
      }
    } catch {
      showNotification('فشل الاتصال بالخادم أثناء حفظ المستند');
    }
  };

  const handleApproveTransaction = async (id: string) => {
    try {
      const idemKey = `appr-${id}-${Date.now()}`;
      const res = await fetch(`/api/transactions/${id}/approve`, {
        method: 'POST',
        headers: getAuthHeaders({
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey,
        }),
        credentials: 'include',
        body: JSON.stringify({ idempotencyKey: idemKey }),
      });
      const data = await res.json();
      if (res.ok) {
        setTransactions(transactions.map((tx) => (tx.id === id ? { ...tx, status: 'معتمد' } : tx)));
        showNotification('تم اعتماد المستند رسمياً بنجاح وتجهيزه للترحيل.');
      } else {
        // SoD rejection or other RFC7807 error
        showNotification(data.detail || data.title || 'فشل اعتماد المستند بسبب تعارض الصلاحيات');
      }
    } catch {
      showNotification('تعذر استكمال الاعتماد');
    }
  };

  const handlePostTransaction = async (id: string) => {
    try {
      const idemKey = `post-${id}-${Date.now()}`;
      const res = await fetch(`/api/transactions/${id}/post`, {
        method: 'POST',
        headers: getAuthHeaders({
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey,
        }),
        credentials: 'include',
        body: JSON.stringify({ idempotencyKey: idemKey }),
      });
      const data = await res.json();
      if (res.ok) {
        showNotification('تم ترحيل السند إلى دفاتر الأستاذ العام وتحديث الأرصدة بدقة.');
      } else {
        showNotification(data.detail || 'تعذر ترحيل السند');
      }
    } catch {
      showNotification('فشل الاتصال أثناء الترحيل');
    }
  };

  if (!isLoggedIn) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  if (currentUser?.requiresPasswordChange) {
    return (
      <ForcePasswordChangeScreen
        userName={currentUser?.fullName || currentUser?.username}
        onChanged={handlePasswordForceChanged}
        onLogout={handleLogout}
      />
    );
  }

  const pendingApprovalsCount = transactions.filter((t) => t.status === 'بانتظار الاعتماد').length;

  const userProfile: UserProfile = {
    id: currentUser?.id || 'USR-1',
    name: currentUser?.fullName || 'أحمد المنصور',
    role: (currentUser?.role as UserRole) || 'accountant',
    roleTitleAr: currentUser?.roleTitleAr || 'محاسب عام',
    branchName: currentUser?.branchName || 'الفرع الرئيسي - الرياض',
    avatarInitials: currentUser?.fullName ? currentUser.fullName.slice(0, 2) : 'أم',
  };

  const handleSelectSection = (section: ActiveSection) => {
    setActiveSection(section);
    setIsMobileNavOpen(false); // إغلاق فوري = استبدال كامل، لا تراكم
    window.scrollTo({ top: 0, behavior: 'smooth' }); // بعد القفل، رجّع لأعلى منطقة العرض حتى لا تفضل وسط شاشة فاضية
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col selection:bg-blue-600 selection:text-white" dir="rtl">
      {/* Enterprise Header */}
      <Header
        currentUser={userProfile}
        onRoleChange={(role) => {
          // Handled via user management in Phase 1
          showNotification(`تم التوجيه، الدور الحالي: ${userProfile.roleTitleAr}`);
        }}
        pendingApprovalsCount={pendingApprovalsCount}
        onLogout={handleLogout}
        onToggleMobileNav={() => setIsMobileNavOpen((v) => !v)}
      />

      {/* Main Workspace Layout */}
      <div className="flex-1 max-w-7xl w-full mx-auto flex flex-col md:flex-row">
        {/* Sidebar Navigation */}
        <Sidebar
          activeSection={activeSection}
          onSelectSection={handleSelectSection}
          pendingApprovalsCount={pendingApprovalsCount}
          isOpenOnMobile={isMobileNavOpen}
          onCloseMobile={() => setIsMobileNavOpen(false)}
        />

        {/* Dynamic Section View */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0">
          {notification && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-900 text-xs font-bold rounded-xl flex items-center justify-between shadow-2xs">
              <span>{notification}</span>
              <button
                onClick={() => setNotification(null)}
                className="text-blue-500 hover:text-blue-700 text-xs font-bold mr-2"
              >
                إغلاق
              </button>
            </div>
          )}

          {/* Section Router */}
          {activeSection === 'profile' && (
            <UserProfileView
              user={currentUser}
              calendar={calendar}
              onNotification={showNotification}
              onLogout={handleLogout}
            />
          )}

          {activeSection === 'company' && (
            <CompanySettingsView onNotification={showNotification} />
          )}

          {activeSection === 'company_wizard' && (
            <CompanyWizardView onNotification={showNotification} />
          )}

          {activeSection === 'governance' && (
            <GovernanceView onNotification={showNotification} />
          )}

          {activeSection === 'users_sod' && (
            <UsersAndSodView onNotification={showNotification} />
          )}

          {activeSection === 'custom_fields' && (
            <CustomFieldsView onNotification={showNotification} />
          )}

          {activeSection === 'audit_trail' && (
            <AuditTrailView onNotification={showNotification} />
          )}

          {activeSection === 'accounting' && (
            <AccountingWorkspaceView
              currentUser={userProfile}
              initialTab="coa"
              onNotification={showNotification}
            />
          )}

          {activeSection === 'custody' && (
            <CashCustodyWorkspaceView
              currentUser={userProfile}
              onNotification={showNotification}
            />
          )}

          {activeSection === 'expenses' && (
            <ExpensesWorkspaceView
              currentUser={userProfile}
              onNotification={showNotification}
            />
          )}

          {activeSection === 'inventory' && (
            <InventoryWorkspaceView
              currentUser={userProfile}
              onNotification={showNotification}
            />
          )}

          {activeSection === 'purchasing' && (
            <PurchasingWorkspaceView
              currentUser={currentUser}
              onNotification={showNotification}
            />
          )}
          {activeSection === 'reports' && (
            <AccountingWorkspaceView
              currentUser={userProfile}
              initialTab="statements"
              onNotification={showNotification}
            />
          )}

          {(activeSection === 'overview' || activeSection === 'approvals') && (
            <OperationalWorkspace
              currentUser={userProfile}
              activeSection={activeSection}
              transactions={transactions}
              isLoadingTransactions={isLoadingTransactions}
              onOpenCreateModal={() => setIsCreateModalOpen(true)}
              onOpenPrintModal={(tx) => setSelectedTxForPrint(tx)}
              onApproveTransaction={handleApproveTransaction}
              onPostTransaction={handlePostTransaction}
            />
          )}
        </main>
      </div>

      {/* Create Transaction Modal */}
      <TransactionModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSave={handleSaveTransaction}
        userName={userProfile.name}
      />

      {/* Official Voucher Print Modal */}
      <PrintVoucherModal
        isOpen={!!selectedTxForPrint}
        onClose={() => setSelectedTxForPrint(null)}
        transaction={selectedTxForPrint}
      />
    </div>
  );
}
