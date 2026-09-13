import React, { useState } from 'react';
import { Header } from './components/Header';
import { Sidebar, ActiveSection } from './components/Sidebar';
import { OperationalWorkspace } from './components/OperationalWorkspace';
import { TransactionModal } from './components/TransactionModal';
import { PrintVoucherModal } from './components/PrintVoucherModal';
import { LoginScreen } from './components/LoginScreen';
import { OperationalTransaction, UserProfile, UserRole } from './types/erp';

// Initial operational transactions for realistic enterprise workflow
const initialTransactions: OperationalTransaction[] = [
  {
    id: 'TX-101',
    code: 'JV-2026-0842',
    date: '2026-09-12',
    type: 'قيد يومية عام',
    description: 'إثبات استحقاق مبيعات توريدات نقدية للمشروعات',
    amount: 84500,
    currency: 'ر.س',
    party: 'مؤسسة الرياض الهندسية',
    status: 'معتمد',
    initiator: 'أحمد المنصور',
  },
  {
    id: 'TX-102',
    code: 'PV-2026-0318',
    date: '2026-09-13',
    type: 'سند صرف نقدي',
    description: 'سداد دفعة إيجار المستودع المركزي للربع الرابع',
    amount: 45000,
    currency: 'ر.س',
    party: 'شركة العقارات المتطورة',
    status: 'بانتظار الاعتماد',
    initiator: 'أحمد المنصور',
  },
  {
    id: 'TX-103',
    code: 'RV-2026-0955',
    date: '2026-09-13',
    type: 'سند قبض نقدي',
    description: 'تحصيل دفعة عقد توريد كابلات كهربائية ومعدات',
    amount: 62000,
    currency: 'ر.س',
    party: 'شركة الإنشاءات الحديثة',
    status: 'معتمد',
    initiator: 'طارق العمري',
  },
  {
    id: 'TX-104',
    code: 'GR-2026-0120',
    date: '2026-09-13',
    type: 'إذن استلام مخزني',
    description: 'استلام دفعة بضاعة جديدة بالمستودع الرئيسي',
    amount: 29800,
    currency: 'ر.س',
    party: 'مجموعة الموردين المتحدين',
    status: 'بانتظار الاعتماد',
    initiator: 'سعد القحطاني',
  },
  {
    id: 'TX-105',
    code: 'JV-2026-0843',
    date: '2026-09-11',
    type: 'قيد يومية عام',
    description: 'تسوية مخصص استهلاك أصول شهر سبتمبر',
    amount: 14200,
    currency: 'ر.س',
    party: 'حساب مجمع الإهلاك',
    status: 'معتمد',
    initiator: 'أحمد المنصور',
  },
];

const roleProfiles: Record<UserRole, UserProfile> = {
  accountant: {
    id: 'USR-1',
    name: 'أحمد المنصور',
    role: 'accountant',
    roleTitleAr: 'محاسب عام',
    branchName: 'الفرع الرئيسي - الرياض',
    avatarInitials: 'أم',
  },
  financial_approver: {
    id: 'USR-2',
    name: 'سليمان الراشد',
    role: 'financial_approver',
    roleTitleAr: 'معتمد مالي أول',
    branchName: 'الفرع الرئيسي - الرياض',
    avatarInitials: 'سر',
  },
  warehouse_keeper: {
    id: 'USR-3',
    name: 'سعد القحطاني',
    role: 'warehouse_keeper',
    roleTitleAr: 'أمين المستودع المركزي',
    branchName: 'مستودع السلي - الرياض',
    avatarInitials: 'سق',
  },
  sales_officer: {
    id: 'USR-4',
    name: 'طارق العمري',
    role: 'sales_officer',
    roleTitleAr: 'مسؤول مبيعات كبار العملاء',
    branchName: 'الفرع الرئيسي - الرياض',
    avatarInitials: 'طع',
  },
  branch_manager: {
    id: 'USR-5',
    name: 'م. فهد التميمي',
    role: 'branch_manager',
    roleTitleAr: 'مدير الفرع الإقليمي',
    branchName: 'الفرع الرئيسي - الرياض',
    avatarInitials: 'فت',
  },
  fleet_supervisor: {
    id: 'USR-6',
    name: 'عمر الدوسري',
    role: 'fleet_supervisor',
    roleTitleAr: 'مشرف حركة الأسطول',
    branchName: 'مركز الخدمات اللوجستية',
    avatarInitials: 'عد',
  },
};

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentRole, setCurrentRole] = useState<UserRole>('accountant');
  const [activeSection, setActiveSection] = useState<ActiveSection>('overview');
  const [transactions, setTransactions] = useState<OperationalTransaction[]>(initialTransactions);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTxForPrint, setSelectedTxForPrint] = useState<OperationalTransaction | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const currentUser = roleProfiles[currentRole];
  const pendingApprovalsCount = transactions.filter((t) => t.status === 'بانتظار الاعتماد').length;

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const handleLogin = (user: string, role: UserRole) => {
    setCurrentRole(role);
    setIsLoggedIn(true);
    showNotification(`مرحباً بك ${user}، تم تسجيل الدخول بنجاح بصلاحية: ${roleProfiles[role].roleTitleAr}`);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
  };

  if (!isLoggedIn) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  const handleSaveTransaction = (newTx: OperationalTransaction) => {
    setTransactions([newTx, ...transactions]);
    showNotification(`تم حفظ المستند (${newTx.code}) بنجاح وإرساله للاعتماد المالي.`);
  };

  const handleApproveTransaction = (id: string) => {
    setTransactions(
      transactions.map((tx) => {
        if (tx.id === id) {
          return { ...tx, status: 'معتمد' };
        }
        return tx;
      })
    );
    showNotification('تم اعتماد المستند رسمياً بنجاح وتجهيزه للترحيل.');
  };

  const handlePostTransaction = (id: string) => {
    showNotification('تم ترحيل السند إلى دفاتر الأستاذ العام وتحديث الأرصدة بدقة.');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col selection:bg-blue-600 selection:text-white" dir="rtl">
      {/* Main Enterprise Navigation Header */}
      <Header
        currentUser={currentUser}
        onRoleChange={(role) => {
          setCurrentRole(role);
          showNotification(`تم تبديل مساحة العمل إلى دور: ${roleProfiles[role].roleTitleAr}`);
        }}
        pendingApprovalsCount={pendingApprovalsCount}
        onLogout={handleLogout}
      />

      {/* Main Workspace Layout */}
      <div className="flex-1 max-w-7xl w-full mx-auto flex flex-col md:flex-row">
        {/* Modular Sidebar */}
        <Sidebar
          activeSection={activeSection}
          onSelectSection={setActiveSection}
          pendingApprovalsCount={pendingApprovalsCount}
        />

        {/* Dynamic Operational Content View */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0">
          {notification && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-800 text-xs font-bold rounded-xl flex items-center justify-between shadow-2xs">
              <span>{notification}</span>
              <button
                onClick={() => setNotification(null)}
                className="text-blue-500 hover:text-blue-700 text-xs font-bold mr-2"
              >
                إغلاق
              </button>
            </div>
          )}

          <OperationalWorkspace
            currentUser={currentUser}
            activeSection={activeSection}
            transactions={transactions}
            onOpenCreateModal={() => setIsCreateModalOpen(true)}
            onOpenPrintModal={(tx) => setSelectedTxForPrint(tx)}
            onApproveTransaction={handleApproveTransaction}
            onPostTransaction={handlePostTransaction}
          />
        </main>
      </div>

      {/* Create Transaction Modal */}
      <TransactionModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSave={handleSaveTransaction}
        userName={currentUser.name}
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
