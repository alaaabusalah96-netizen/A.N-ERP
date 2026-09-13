import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar, ActiveSection } from './components/Sidebar';
import { OperationalWorkspace } from './components/OperationalWorkspace';
import { TransactionModal } from './components/TransactionModal';
import { PrintVoucherModal } from './components/PrintVoucherModal';
import { LoginScreen } from './components/LoginScreen';
import { UserProfileView } from './components/UserProfileView';
import { CompanySettingsView } from './components/CompanySettingsView';
import { UsersAndSodView } from './components/UsersAndSodView';
import { CustomFieldsView } from './components/CustomFieldsView';
import { AuditTrailView } from './components/AuditTrailView';
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

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // Check auth session via HttpOnly cookie on initial mount
  useEffect(() => {
    checkCurrentAuth();
    fetchDualCalendar();
  }, []);

  const checkCurrentAuth = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          setCurrentUser(data.user);
          setIsLoggedIn(true);
          fetchTransactions();
        }
      }
    } catch {
      // not authenticated yet
    }
  };

  const fetchDualCalendar = async () => {
    try {
      const res = await fetch('/api/calendar');
      const data = await res.json();
      if (data.success) {
        setCalendar(data.data);
      }
    } catch {
      // fallback
    }
  };

  const fetchTransactions = async () => {
    setIsLoadingTransactions(true);
    try {
      const res = await fetch('/api/transactions');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setTransactions(data.data);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingTransactions(false);
    }
  };

  const handleLoginSuccess = (loginData: any) => {
    setCurrentUser(loginData.user);
    setIsLoggedIn(true);
    showNotification(`مرحباً بك ${loginData.user.fullName}، تم تسجيل الدخول بنجاح.`);
    fetchTransactions();
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setIsLoggedIn(false);
    setCurrentUser(null);
    setActiveSection('overview');
  };

  const handleSaveTransaction = async (newTx: OperationalTransaction) => {
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTx),
      });
      const data = await res.json();
      if (res.ok) {
        setTransactions([data.data, ...transactions]);
        showNotification(`تم حفظ المستند (${data.data.code}) بنجاح وإرساله للاعتماد المالي.`);
      } else {
        showNotification(data.detail || 'تعذر حفظ المستند');
      }
    } catch {
      showNotification('فشل الاتصال بالخادم أثناء حفظ المستند');
    }
  };

  const handleApproveTransaction = async (id: string) => {
    try {
      const res = await fetch(`/api/transactions/${id}/approve`, { method: 'POST' });
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
      const res = await fetch(`/api/transactions/${id}/post`, { method: 'POST' });
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

  const pendingApprovalsCount = transactions.filter((t) => t.status === 'بانتظار الاعتماد').length;

  const userProfile: UserProfile = {
    id: currentUser?.id || 'USR-1',
    name: currentUser?.fullName || 'أحمد المنصور',
    role: (currentUser?.role as UserRole) || 'accountant',
    roleTitleAr: currentUser?.roleTitleAr || 'محاسب عام',
    branchName: currentUser?.branchName || 'الفرع الرئيسي - الرياض',
    avatarInitials: currentUser?.fullName ? currentUser.fullName.slice(0, 2) : 'أم',
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
      />

      {/* Main Workspace Layout */}
      <div className="flex-1 max-w-7xl w-full mx-auto flex flex-col md:flex-row">
        {/* Sidebar Navigation */}
        <Sidebar
          activeSection={activeSection}
          onSelectSection={setActiveSection}
          pendingApprovalsCount={pendingApprovalsCount}
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

          {activeSection === 'users_sod' && (
            <UsersAndSodView onNotification={showNotification} />
          )}

          {activeSection === 'custom_fields' && (
            <CustomFieldsView onNotification={showNotification} />
          )}

          {activeSection === 'audit_trail' && (
            <AuditTrailView onNotification={showNotification} />
          )}

          {(activeSection === 'overview' ||
            activeSection === 'accounting' ||
            activeSection === 'approvals' ||
            activeSection === 'reports') && (
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
