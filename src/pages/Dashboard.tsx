import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  Clock, 
  FileCheck, 
  Activity, 
  TrendingDown,
  TrendingUp, 
  Coins, 
  AlertTriangle,
  History,
  Trash2,
  Printer,
  CornerUpLeft,
  Search,
  Filter,
  CheckCircle,
  Calendar,
  ShieldCheck,
  XCircle,
  Folder,
  ChevronRight,
  ChevronDown,
  Globe,
  Building2,
  MapPin,
  Layers
} from 'lucide-react';
import { CustodyDB } from '../db';
import { useScreenListeners } from '../firebase';
import { OrganizationEngine } from '../db/organizationEngine';
import { translations, Language, Theme, Transaction, Station } from '../types';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import VoucherModal from '../components/VoucherModal';

interface DashboardProps {
  language: Language;
  theme: Theme;
  onNavigate: (tab: string) => void;
  onSelectTransactionForSettle?: (tx: Transaction) => void;
}

export default function Dashboard({ 
  language, 
  theme, 
  onNavigate,
  onSelectTransactionForSettle 
}: DashboardProps) {
  useScreenListeners(['transactions', 'logs', 'Expenses', 'CashVouchers']);

  const t = translations[language];
  const isRtl = language === 'ar';
  const user = CustodyDB.getActiveUser();
  const allStations = CustodyDB.getScopedStations();
  const isAdmin = user && (user.role === 'Admin' || user.role === 'SystemAdmin');
  const isManager = user && (user.role === 'RegionalManager' || user.role === 'Admin' || user.role === 'SystemAdmin');
  const isSystemAdmin = user && user.role === 'SystemAdmin';

  // Multi-Company and Hierarchy Selection State
  const [companies, setCompanies] = useState(() => CustodyDB.getCompanies());
  const [selectedCompanyId, setSelectedCompanyId] = useState(() => CustodyDB.getSelectedCompanyId());
  const [orgUnits, setOrgUnits] = useState<any[]>([]);
  const [selectedSection, setSelectedSection] = useState<{
    type: 'all' | 'org_unit' | 'region' | 'station';
    id: string;
    name: string;
  }>({
    type: 'all',
    id: 'all',
    name: isRtl ? 'جميع أقسام وفروع الشركة' : 'All Company Sections'
  });

  useEffect(() => {
    const units = OrganizationEngine.getUnits(selectedCompanyId);
    setOrgUnits(units);

    // If user belongs to a specific org unit and no section is manually chosen yet, default to user's org unit
    if (user && user.org_unit_id && selectedSection.type === 'all') {
      const u = units.find(unit => unit.id === user.org_unit_id);
      if (u) {
        setSelectedSection({
          type: 'org_unit',
          id: u.id,
          name: isRtl ? `وحدة تنظيمية: ${u.nameAr || u.name}` : `Org Unit: ${u.nameEn || u.name}`
        });
      }
    }
  }, [selectedCompanyId]);

  // Local state for instant reactivity
  const [metrics, setMetrics] = useState(() => CustodyDB.getReconciliation());
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [logs, setLogs] = useState(() => CustodyDB.getLogs().slice(0, 5));
  const [notifications, setNotifications] = useState(() => CustodyDB.getNotifications());
  const [dashboardTab, setDashboardTab] = useState<'activity' | 'notifications'>('activity');
  const [chartTab, setChartTab] = useState<'station' | 'category'>('station');
  const [pendingLimit, setPendingLimit] = useState(10);
  const [settledLimit, setSettledLimit] = useState(10);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');

  // Modal / Feedback state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [revertingTx, setRevertingTx] = useState<Transaction | null>(null);
  const [printingTx, setPrintingTx] = useState<Transaction | null>(null);
  const [approvingTx, setApprovingTx] = useState<Transaction | null>(null);
  const [rejectingTx, setRejectingTx] = useState<Transaction | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const refreshData = () => {
    // Dynamically retrieve metrics according to selected section
    const stId = selectedSection.type === 'station' ? selectedSection.id : undefined;
    const regId = selectedSection.type === 'region' ? selectedSection.id : undefined;
    const org_unit_id = selectedSection.type === 'org_unit' ? selectedSection.id : undefined;
    setMetrics(CustodyDB.getReconciliation(stId, regId, org_unit_id));

    // Retrieve scoped transactions of the active company
    const scopedTxs = CustodyDB.getScopedTransactions();
    
    // Filter transactions by selected section
    if (selectedSection.type === 'org_unit') {
      const validOrgUnitIds = new Set(OrganizationEngine.getSubtreeUnitIds(selectedSection.id, selectedCompanyId));
      setAllTransactions(scopedTxs.filter(t => t.org_unit_id && validOrgUnitIds.has(t.org_unit_id)));
    } else if (selectedSection.type === 'station') {
      setAllTransactions(scopedTxs.filter(t => t.station_id === selectedSection.id));
    } else if (selectedSection.type === 'region') {
      // Find stations belonging to selected region or empty/none in company context
      const stations = CustodyDB.getScopedStations();
      const regionStations = stations.filter(s => s.region_id === selectedSection.id || !s.region_id || s.region_id === '' || s.region_id === 'none');
      const targetStationIds = regionStations.map(s => s.id);
      setAllTransactions(scopedTxs.filter(t => t.station_id && targetStationIds.includes(t.station_id)));
    } else {
      setAllTransactions(scopedTxs);
    }

    setLogs(CustodyDB.getLogs().slice(0, 5));
    setNotifications(CustodyDB.getNotifications());
  };

  const handleCompanyChange = (id: string) => {
    CustodyDB.setSelectedCompanyId(id);
    setSelectedCompanyId(id);
    // Reset selection to view all of the newly chosen company
    setSelectedSection({
      type: 'all',
      id: 'all',
      name: isRtl ? 'جميع أقسام وفروع الشركة' : 'All Company Sections'
    });
    // Trigger global update across the app
    window.dispatchEvent(new Event('custody_db_updated'));
  };

  const handleStructureChange = (val: string) => {
    if (val === 'all') {
      setSelectedSection({
        type: 'all',
        id: 'all',
        name: isRtl ? 'جميع أقسام وفروع الشركة' : 'All Company Sections'
      });
    } else {
      const parts = val.split(':');
      const type = parts[0] as 'org_unit' | 'region' | 'station';
      const id = parts[1];
      if (type === 'org_unit') {
        const u = OrganizationEngine.getUnitById(id);
        if (u) {
          setSelectedSection({
            type: 'org_unit',
            id: u.id,
            name: isRtl ? `وحدة تنظيمية: ${u.nameAr || u.name}` : `Org Unit: ${u.nameEn || u.name}`
          });
        }
      } else if (type === 'region') {
        const r = CustodyDB.getScopedRegions().find(reg => reg.id === id);
        if (r) {
          setSelectedSection({
            type: 'region',
            id: r.id,
            name: isRtl ? `قطاع: ${r.name}` : `Sector: ${r.name}`
          });
        }
      } else if (type === 'station') {
        const s = CustodyDB.getScopedStations().find(stn => stn.id === id);
        if (s) {
          setSelectedSection({
            type: 'station',
            id: s.id,
            name: isRtl ? `فرع: ${s.station_name}` : `Branch: ${s.station_name}`
          });
        }
      }
    }
  };

  const handleMarkAsRead = (id: string) => {
    CustodyDB.markNotificationAsRead(id);
    setNotifications(CustodyDB.getNotifications());
    showToast(isRtl ? 'تم تحديد التنبيه كمقروء.' : 'Notification marked as read.');
  };

  const handleNotificationClick = (notif: any) => {
    if (!notif.is_read) {
      CustodyDB.markNotificationAsRead(notif.id);
      setNotifications(CustodyDB.getNotifications());
    }
    if (notif.related_id && notif.related_id.startsWith('del-')) {
      const activeUser = CustodyDB.getActiveUser();
      if (activeUser) {
        if (activeUser.role === 'SystemAdmin') {
          onNavigate('super-admin');
        } else if (activeUser.role === 'Admin') {
          onNavigate('company-admin');
        } else if (activeUser.role === 'RegionalManager') {
          onNavigate('region-admin');
        }
      }
    }
  };

  const handleMarkAllAsRead = () => {
    notifications.forEach(n => {
      if (!n.is_read) {
        CustodyDB.markNotificationAsRead(n.id);
      }
    });
    setNotifications(CustodyDB.getNotifications());
    showToast(isRtl ? 'تم تمييز جميع التنبيهات كمقروءة.' : 'All notifications marked as read.');
  };

  useEffect(() => {
    refreshData();
    
    // Live update when Firebase/Firestore database updates
    window.addEventListener('custody_db_updated', refreshData);
    return () => {
      window.removeEventListener('custody_db_updated', refreshData);
    };
  }, [selectedSection, selectedCompanyId]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Delete handler
  const handleDelete = async (id: string) => {
    if (!deleteReason.trim()) {
      alert(isRtl ? 'الرجاء إدخال سبب الحذف الإجباري!' : 'Please enter the mandatory deletion reason!');
      return;
    }
    const success = await CustodyDB.deleteTransaction(id, deleteReason);
    if (success) {
      showToast(isRtl ? 'تم حذف الحركة والعملية بالكامل بنجاح.' : 'Transaction successfully deleted.');
      refreshData();
      setDeletingId(null);
      setDeleteReason('');
    } else {
      setAuthError(isRtl ? 'عذراً، يحتاج الحذف إلى صلاحيات مدير النظام (Admin)' : 'Unauthorized: Deletion requires Admin permissions.');
      setDeletingId(null);
    }
  };

  // Revert settlement status
  const handleRevert = async (tx: Transaction) => {
    const res = await CustodyDB.updateTransaction(tx.id, {
      status: 'Pending'
    });
    if (!res.success) {
      alert(res.errors?.join(' \n ') || 'Failed to revert transaction');
      return;
    }
    // Additional log for revert
    CustodyDB.addLog(
      user?.id || 'unknown',
      user?.full_name || 'Anonymous',
      'Revert Settlement',
      `Reverted transaction ${tx.transaction_no} (formerly voucher ${tx.voucher_no}) back to Pending status.`
    );
    showToast(isRtl ? 'تم إلغاء تسوية الحركة بنجاح وإعادتها كمعلقة.' : 'Settlement cancelled. Transaction reverted to Pending.');
    refreshData();
    setRevertingTx(null);
  };

  // Approve / Settle Final Handler (For RegionalManager or Admin)
  const handleApprove = async (tx: Transaction) => {
    if (!isManager) {
      setAuthError(isRtl ? 'عذراً، يتطلب اعتماد وتسوية الحركات صلاحية مدير المنطقة أو الأدمن.' : 'Unauthorized: Requires Regional Manager or Admin credentials.');
      setApprovingTx(null);
      return;
    }

    const res = await CustodyDB.updateTransaction(tx.id, {
      status: 'Settled'
    });
    if (!res.success) {
      alert(res.errors?.join(' \n ') || 'Failed to approve transaction');
      return;
    }

    CustodyDB.addLog(
      user?.id || 'unknown',
      user?.full_name || 'Anonymous',
      'Final Approve & Settle',
      `Approved and settled transaction ${tx.transaction_no} (voucher ${tx.voucher_no}) worth ${tx.amount.toLocaleString()} EGP.`
    );
    showToast(isRtl ? 'تم اعتماد ومطابقة مستند الصرف بنجاح وتنزيله من العهدة.' : 'Voucher successfully approved and settled against custody.');
    refreshData();
    setApprovingTx(null);
  };

  // Reject transaction handler (Sets status to 'Rejected')
  const handleReject = async (tx: Transaction) => {
    if (!isManager) {
      setAuthError(isRtl ? 'عذراً، يحتاج هذا الإجراء إلى صلاحيات الإدارة أو مدير المنطقة.' : 'Unauthorized: Rejecting requires Manager or Admin permissions.');
      setRejectingTx(null);
      return;
    }

    const res = await CustodyDB.updateTransaction(tx.id, {
      status: 'Rejected'
    });
    if (!res.success) {
      alert(res.errors?.join(' \n ') || 'Failed to reject transaction');
      return;
    }

    CustodyDB.addLog(
      user?.id || 'unknown',
      user?.full_name || 'Anonymous',
      'Reject Voucher',
      `Rejected voucher ${tx.voucher_no} (transaction ${tx.transaction_no}) worth ${tx.amount.toLocaleString()} EGP.`
    );
    showToast(isRtl ? 'تم رفض مستند الصرف وتحديث الحالة إلى مرفوض.' : 'Voucher successfully rejected.');
    refreshData();
    setRejectingTx(null);
  };

  // Start settlement
  const handleStartSettle = async (tx: Transaction) => {
    if (onSelectTransactionForSettle) {
      onSelectTransactionForSettle(tx);
      onNavigate('voucher');
    } else {
      // Fallback: quick settle
      const tempVoucherNo = tx.transaction_no;
      const tempDate = new Date().toISOString().split('T')[0];
      const res = await CustodyDB.updateTransaction(tx.id, {
        status: 'Under Settlement',
        voucher_no: tempVoucherNo,
        voucher_date: tempDate
      });
      if (!res.success) {
        alert(res.errors?.join(' \n ') || 'Failed to settle transaction');
        return;
      }
      showToast(isRtl ? 'تم عمل تسوية سريعة للمستند بنجاح.' : 'Quick voucher generated successfully.');
      refreshData();
    }
  };

  // Station Spend Chart calculation
  const stationSpendMap = new Map<string, number>();
  allTransactions.forEach(tx => {
    stationSpendMap.set(tx.station_id, (stationSpendMap.get(tx.station_id) || 0) + tx.amount);
  });

  const chartData = allStations.map((st, idx) => {
    const amount = stationSpendMap.get(st.id) || 0;
    return {
      name: st.station_name,
      amount,
      color: [
        '#10b981', // emerald
        '#3b82f6', // blue
        '#f59e0b', // amber
        '#ef4444', // red
        '#8b5cf6', // violet
        '#ec4899'  // pink
      ][idx % 6]
    };
  }).filter(item => item.amount > 0);

  // Category Spend Chart calculation
  const allCategories = CustodyDB.getCategories();
  const categorySpendMap = new Map<string, number>();
  allTransactions.forEach(tx => {
    const catId = tx.category_id || 'other';
    categorySpendMap.set(catId, (categorySpendMap.get(catId) || 0) + tx.amount);
  });

  const categoryChartData = allCategories.map((cat, idx) => {
    const amount = categorySpendMap.get(cat.id) || 0;
    return {
      name: isRtl ? cat.name_ar : cat.name_en,
      amount,
      color: [
        '#8b5cf6', // violet
        '#ec4899', // pink
        '#f59e0b', // amber
        '#3b82f6', // blue
        '#10b981', // emerald
        '#ef4444'  // red
      ][idx % 6]
    };
  }).filter(item => item.amount > 0);

  const finalChartData = chartTab === 'station'
    ? (chartData.length > 0 ? chartData : [{ name: isRtl ? 'لا توجد حركات بعد' : 'No movements yet', amount: 0, color: '#94a3b8' }])
    : (categoryChartData.length > 0 ? categoryChartData : [{ name: isRtl ? 'لا توجد حركات بعد' : 'No movements yet', amount: 0, color: '#94a3b8' }]);

  const formatCurrency = (val: number) => {
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EGP';
  };

  // Filter transaction lists for unified view
  const pendingTxs = allTransactions.filter(tx => {
    if (tx.status !== 'Pending') return false;
    const matchesSearch = 
      tx.transaction_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const underSettlementTxs = allTransactions.filter(tx => {
    if (tx.status !== 'Under Settlement') return false;
    const matchesSearch = 
      tx.transaction_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tx.voucher_no && tx.voucher_no.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Upper Welcome Header */}
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight md:text-2xl">
            {t.dashboard}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isRtl 
              ? 'مراجعة الموقف المالي الفوري وصحة تسوية عهدة النقدية للشركة.' 
              : 'Review live financial standing and settlement status of the corporate cash custody.'
            }
          </p>
        </div>
        <div className="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 self-start md:self-auto mt-2 md:mt-0">
          {isRtl ? 'تاريخ النظام:' : 'System Date:'} 2026-06-26 11:32 UTC
        </div>
      </div>

      {/* Dynamic Toast Feedback */}
      {toastMessage && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:w-96 z-50 p-4 bg-emerald-600 text-white text-xs font-bold rounded-xl shadow-2xl flex items-center gap-2 animate-bounce">
          <CheckCircle size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Administrative Structure Control Portal */}
      {(isSystemAdmin || isAdmin || isManager) && (
        <div className={`p-5 rounded-2xl border ${
          theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Globe size={14} className="text-indigo-500" />
                <span>{isRtl ? 'بوابة إدارة المنصة والتحكم المركزي:' : 'Platform Central Administration Portal:'}</span>
              </h3>
              <p className="text-[11px] text-slate-400 leading-normal">
                {isRtl 
                  ? 'اختر الشركة وسياق الهيكل الإداري المطلوب لمتابعة الحركات وتدقيق العمليات.' 
                  : 'Select active company and administrative structure context to review active ledger transactions.'}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              {/* Dropdown 1: الشركات */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  {isRtl ? 'الشركات' : 'Companies'}
                </label>
                <select
                  value={selectedCompanyId}
                  onChange={(e) => handleCompanyChange(e.target.value)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 dark:text-slate-200 min-w-[200px] cursor-pointer"
                >
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Dropdown 2: الهيكل الإداري */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  {isRtl ? 'الهيكل الإداري' : 'Administrative Structure'}
                </label>
                <select
                  value={selectedSection.type === 'all' ? 'all' : `${selectedSection.type}:${selectedSection.id}`}
                  onChange={(e) => handleStructureChange(e.target.value)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 dark:text-slate-200 min-w-[200px] cursor-pointer"
                >
                  <option value="all">{isRtl ? 'جميع أقسام وفروع الشركة' : 'All Company Sections'}</option>
                  {orgUnits.length > 0 && (
                    <optgroup label={isRtl ? 'وحدات الهيكل التنظيمي (القطاعات / الفروع / المحطات / المزارع)' : 'Organization Units'}>
                      {orgUnits.map(u => (
                        <option key={u.id} value={`org_unit:${u.id}`}>
                          {u.code} - {isRtl ? u.nameAr || u.name : u.nameEn || u.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label={isRtl ? 'القطاعات والمناطق الإقليمية' : 'Regional Sectors'}>
                    {CustodyDB.getScopedRegions().map(r => (
                      <option key={r.id} value={`region:${r.id}`}>
                        {isRtl ? `قطاع: ${r.name}` : `Sector: ${r.name}`}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={isRtl ? 'الفروع والمحطات' : 'Branches & Stations'}>
                    {CustodyDB.getScopedStations().map(s => (
                      <option key={s.id} value={`station:${s.id}`}>
                        {isRtl ? `فرع: ${s.station_name}` : `Branch: ${s.station_name}`}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Filter Division/Branch Indicator Badge */}
      <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row gap-3 sm:items-center justify-between ${
        theme === 'dark' ? 'bg-[#1e293b]/60 border-[#334155]' : 'bg-indigo-50/20 border-indigo-100'
      }`}>
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
            <Layers size={14} />
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              {isRtl ? 'القسم أو الفرع المصفى حالياً باللوحة:' : 'Currently Filtered Division / Branch:'}
            </div>
            <div className="font-extrabold text-xs text-slate-800 dark:text-slate-200 mt-0.5">
              {selectedSection.name}
            </div>
          </div>
        </div>
        
        {selectedSection.type !== 'all' && (
          <button
            onClick={() => setSelectedSection({
              type: 'all',
              id: 'all',
              name: isRtl ? 'جميع أقسام وفروع الشركة' : 'All Company Sections'
            })}
            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold transition-all shrink-0 self-start sm:self-auto"
          >
            {isRtl ? 'عرض الهيكل بالكامل (عرض الكل)' : 'Show Full Hierarchy (View All)'}
          </button>
        )}
      </div>

      {/* Two-Column Layout split */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* RIGHT COLUMN (RTL): COMPANY STRUCTURE TREE HIERARCHY */}
        {!isSystemAdmin && (
          <div className="lg:col-span-1 space-y-4">
          <div className={`p-4 rounded-2xl border ${
            theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5 border-b pb-2 mb-3">
              <Layers size={14} className="text-indigo-500" />
              <span>{isRtl ? 'شجرة عهد وأقسام الشركة' : 'Company Hierarchy Tree'}</span>
            </h3>

            {/* Tree Root - All Company Sections */}
            <button
              onClick={() => setSelectedSection({
                type: 'all',
                id: 'all',
                name: isRtl ? 'جميع أقسام وفروع الشركة' : 'All Company Sections'
              })}
              className={`w-full text-right p-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${
                selectedSection.type === 'all'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center gap-2">
                <Building2 size={14} />
                <span>{isRtl ? 'كل الهيكل الإداري' : 'All Divisions & Branches'}</span>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                selectedSection.type === 'all' ? 'bg-indigo-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}>
                {CustodyDB.getScopedStations().length}
              </span>
            </button>

            {/* Regional Sectors Section */}
            <div className="mt-4 space-y-2">
              <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1">
                {isRtl ? 'القطاعات والمناطق الإقليمية' : 'Regional Sectors'}
              </div>

              {CustodyDB.getScopedRegions().map(r => {
                const regionStations = CustodyDB.getScopedStations().filter(s => s.region_id === r.id);
                const isSelected = selectedSection.type === 'region' && selectedSection.id === r.id;
                return (
                  <div key={r.id} className="space-y-1">
                    {/* Region Row */}
                    <button
                      onClick={() => setSelectedSection({
                        type: 'region',
                        id: r.id,
                        name: isRtl ? `قطاع: ${r.name}` : `Sector: ${r.name}`
                      })}
                      className={`w-full text-right p-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-indigo-500/10 border-r-4 border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-500'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Folder size={14} className={isSelected ? 'text-indigo-500' : 'text-amber-500'} />
                        <span className="truncate max-w-[120px]">{r.name}</span>
                      </div>
                      <span className="text-[9px] px-1 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded">
                        {regionStations.length} {isRtl ? 'موقع' : 'hubs'}
                      </span>
                    </button>

                    {/* Region Stations Sub-items */}
                    <div className={`pr-4 border-r border-slate-100 dark:border-slate-800 ${isRtl ? 'mr-2' : 'ml-2'} space-y-1`}>
                      {regionStations.map(s => {
                        const isStnSelected = selectedSection.type === 'station' && selectedSection.id === s.id;
                        return (
                          <button
                            key={s.id}
                            onClick={() => setSelectedSection({
                              type: 'station',
                              id: s.id,
                              name: isRtl ? `فرع: ${s.station_name}` : `Branch: ${s.station_name}`
                            })}
                            className={`w-full text-right p-1.5 rounded text-[11px] font-medium transition-all flex items-center justify-between ${
                              isStnSelected
                                ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-1">
                              <MapPin size={11} className={isStnSelected ? 'text-indigo-500 animate-pulse' : 'text-slate-400'} />
                              <span className="truncate max-w-[100px]">{s.station_name}</span>
                            </div>
                            <span className="font-mono text-[9px] text-slate-400">
                              {CustodyDB.getStationDeductedCustody(s.id).toLocaleString()} EGP
                            </span>
                          </button>
                        );
                      })}
                      {regionStations.length === 0 && (
                        <div className="text-[10px] text-slate-400 px-2 py-0.5 italic">
                          {isRtl ? 'لا توجد فروع تابعة' : 'No child branches'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Direct Branches Section */}
            {(() => {
              const compRegions = CustodyDB.getScopedRegions();
              const compStations = CustodyDB.getScopedStations();
              const directBranches = compStations.filter(s => !s.region_id || s.region_id === 'none' || s.region_id === '' || !compRegions.some(r => r.id === s.region_id));
              if (directBranches.length > 0) {
                return (
                  <div className="mt-4 space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-1">
                      {isRtl ? 'الفروع المستقلة / المباشرة' : 'Direct Independent Branches'}
                    </div>
                    {directBranches.map(s => {
                      const isSelected = selectedSection.type === 'station' && selectedSection.id === s.id;
                      return (
                        <button
                          key={s.id}
                          onClick={() => setSelectedSection({
                            type: 'station',
                            id: s.id,
                            name: isRtl ? `فرع مباشر: ${s.station_name}` : `Direct Branch: ${s.station_name}`
                          })}
                          className={`w-full text-right p-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-between ${
                            isSelected
                              ? 'bg-indigo-500/10 border-r-4 border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-500'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <MapPin size={13} className={isSelected ? 'text-indigo-500' : 'text-slate-400'} />
                            <span className="truncate max-w-[120px]">{s.station_name}</span>
                          </div>
                          <span className="font-mono text-[10px] text-slate-400">
                            {CustodyDB.getStationDeductedCustody(s.id).toLocaleString()} EGP
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>
        )}

        {/* LEFT COLUMN (RTL): METRICS, CHARTS AND OPERATION LISTS */}
        <div className={`${isSystemAdmin ? 'lg:col-span-4' : 'lg:col-span-3'} space-y-6`}>
          {/* Dynamic KPI Cards Grid */}
          {!isSystemAdmin && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Custody Value */}
        <div className={`p-5 rounded-2xl border transition-all ${
          theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t.custodyValue}</span>
            <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
              <Coins size={18} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-xl font-bold font-mono tracking-tight md:text-2xl text-indigo-600 dark:text-indigo-400">
              {formatCurrency(metrics.custodyValue)}
            </span>
          </div>
          <div className="mt-2 text-[10px] text-slate-400">
            {isRtl ? 'القيمة الإسمية المعتمدة للعهدة' : 'Approved nominal custody value'}
          </div>
        </div>

        {/* Cash Available */}
        <div className={`p-5 rounded-2xl border transition-all ${
          theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t.cashAvailable}</span>
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-xl font-bold font-mono tracking-tight md:text-2xl text-emerald-600 dark:text-emerald-400">
              {formatCurrency(metrics.cashAvailable)}
            </span>
          </div>
          <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-1">
            <div className={`h-1.5 w-1.5 rounded-full ${metrics.cashAvailable < 5000 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            <span>
              {isRtl 
                ? `النقدية المتوفرة حالياً بالخزينة` 
                : `Actual cash inside safety deposit box`
              }
            </span>
          </div>
        </div>

        {/* Pending Total */}
        <div 
          className={`p-5 rounded-2xl border transition-all ${
            theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t.pendingTotal}</span>
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Clock size={18} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-xl font-bold font-mono tracking-tight md:text-2xl text-amber-600 dark:text-amber-400">
              {formatCurrency(metrics.pendingTotal)}
            </span>
          </div>
          <div className="mt-2 text-[10px] text-slate-400">
            <span>{t.pendingCount}: {metrics.pendingCount}</span>
          </div>
        </div>

        {/* Under Settlement Total */}
        <div 
          className={`p-5 rounded-2xl border transition-all ${
            theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t.underSettlementTotal}</span>
            <div className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <FileCheck size={18} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-xl font-bold font-mono tracking-tight md:text-2xl text-blue-600 dark:text-blue-400">
              {formatCurrency(metrics.underSettlementTotal)}
            </span>
          </div>
          <div className="mt-2 text-[10px] text-slate-400">
            <span>{t.underSettlementCount}: {metrics.underSettlementCount}</span>
          </div>
        </div>
      </div>
      )}

      {/* QUICK FILTER BAR ON DASHBOARD */}
      <div className={`p-4 rounded-2xl border flex flex-col md:flex-row gap-3 items-center justify-between ${
        theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter size={16} className="text-indigo-500" />
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {isRtl ? 'البحث والتصفية السريعة للعمليات' : 'Quick Search & Operation Filtering'}
          </h3>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto md:max-w-xl">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 pointer-events-none">
              <Search size={14} />
            </span>
            <input
              type="text"
              placeholder={isRtl ? 'ابحث برقم الحركة، البيان...' : 'Search by ID, description...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full py-1.5 pl-9 pr-3 text-xs rounded-lg border focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all ${
                theme === 'dark' 
                  ? 'bg-[#0f172a] border-slate-700 text-slate-100 placeholder-slate-500' 
                  : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'
              }`}
            />
          </div>
        </div>
      </div>

      {/* UNIFIED TABLES SIDE-BY-SIDE OR STACKED ON ONE PAGE */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 1. PENDING TRANSACTIONS TABLE */}
        <div className={`p-5 rounded-2xl border flex flex-col justify-between min-w-0 overflow-hidden ${
          theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
                  <Clock size={14} />
                </div>
                <h3 className="font-bold text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  {isRtl ? 'المعاملات المعلقة بالخزينة' : 'Pending Custody Operations'}
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600">
                {pendingTxs.length} {isRtl ? 'معلقة' : 'Pending'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[550px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-medium">
                    <th className="py-2.5 font-semibold text-slate-500">{isRtl ? 'رقم الحركة' : 'ID'}</th>
                    <th className="py-2.5 font-semibold text-slate-500">{isRtl ? 'البيان' : 'Description'}</th>
                    <th className="py-2.5 font-semibold text-slate-500 text-right">{isRtl ? 'المبلغ' : 'Amount'}</th>
                    <th className="py-2.5 font-semibold text-slate-500 text-center">{isRtl ? 'الإجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pendingTxs.slice(0, pendingLimit).map((tx) => {
                    const st = allStations.find(s => s.id === tx.station_id);
                    const stationLabel = st ? st.station_name : 'N/A';
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                          <div>{tx.transaction_no || (isRtl ? 'قيد الانتظار' : 'Pending')}</div>
                          <div className="text-[9px] text-slate-400 font-normal">{tx.date}</div>
                        </td>
                        <td className="py-3 text-slate-600 dark:text-slate-400 max-w-[120px] truncate" title={tx.description}>
                          <div className="font-semibold text-[11px] text-slate-700 dark:text-slate-300">{stationLabel}</div>
                          <div className="text-[10px] text-slate-500 truncate">{tx.description}</div>
                        </td>
                        <td className="py-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                          {tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleStartSettle(tx)}
                              className="px-1.5 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-600 text-indigo-600 hover:text-white transition-all flex items-center gap-0.5 font-bold text-[9px]"
                            >
                              <FileCheck size={10} />
                              <span>{isRtl ? 'تسوية' : 'Settle'}</span>
                            </button>
                            <button
                              onClick={() => setDeletingId(tx.id)}
                              className="p-1 rounded bg-rose-500/10 hover:bg-rose-600 text-rose-600 hover:text-white transition-all"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {pendingTxs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-400 text-[11px]">
                        {isRtl ? 'لا توجد معاملات معلقة.' : 'No pending transactions.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {pendingTxs.length > pendingLimit && (
              <div className="flex justify-center p-2.5 border-t border-slate-100 dark:border-slate-800/30">
                <button
                  onClick={() => setPendingLimit(prev => prev + 10)}
                  className="px-3 py-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 rounded transition-all flex items-center gap-1"
                >
                  <span>{isRtl ? 'عرض المزيد من المعاملات المعلقة' : 'Load More Pending Operations'}</span>
                  <span className="text-[9px] text-slate-400 font-normal">({pendingTxs.length - pendingLimit} {isRtl ? 'متبقي' : 'remaining'})</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 2. TRANSACTIONS UNDER SETTLEMENT TABLE */}
        <div className={`p-5 rounded-2xl border flex flex-col justify-between min-w-0 overflow-hidden ${
          theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                  <FileCheck size={14} />
                </div>
                <h3 className="font-bold text-xs uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  {isRtl ? 'مستندات الصرف تحت التسوية' : 'Vouchers Under Settlement'}
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600">
                {underSettlementTxs.length} {isRtl ? 'مستند' : 'Vouchers'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[550px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-medium">
                    <th className="py-2.5 font-semibold text-slate-500">{isRtl ? 'رقم السند' : 'Voucher No'}</th>
                    <th className="py-2.5 font-semibold text-slate-500">{isRtl ? 'البيان' : 'Description'}</th>
                    <th className="py-2.5 font-semibold text-slate-500 text-right">{isRtl ? 'المبلغ' : 'Amount'}</th>
                    <th className="py-2.5 font-semibold text-slate-500 text-center">{isRtl ? 'الإجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {underSettlementTxs.slice(0, settledLimit).map((tx) => {
                    const st = allStations.find(s => s.id === tx.station_id);
                    const stationLabel = st ? st.station_name : 'N/A';
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          <div>{tx.voucher_no || 'N/A'}</div>
                          <div className="text-[9px] text-slate-400 font-normal">{tx.voucher_date || tx.date}</div>
                        </td>
                        <td className="py-3 text-slate-600 dark:text-slate-400 max-w-[120px] truncate" title={tx.description}>
                          <div className="font-semibold text-[11px] text-slate-700 dark:text-slate-300">{stationLabel}</div>
                          <div className="text-[10px] text-slate-500 truncate">{tx.description}</div>
                        </td>
                        <td className="py-3 text-right font-mono font-bold text-blue-600 dark:text-blue-400">
                          {tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 text-center">
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            <button
                              onClick={() => setPrintingTx(tx)}
                              className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 transition-all flex items-center gap-0.5 font-bold text-[9px]"
                            >
                              <Printer size={10} />
                              <span>{isRtl ? 'سند' : 'Voucher'}</span>
                            </button>
                            {isManager && (
                              <>
                                <button
                                  onClick={() => setApprovingTx(tx)}
                                  className="px-1.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-all font-bold text-[9px] flex items-center gap-0.5"
                                  title={isRtl ? 'اعتماد وتسوية الحركة نهائياً' : 'Approve & Settle'}
                                >
                                  <ShieldCheck size={10} />
                                  <span>{isRtl ? 'اعتماد' : 'Approve'}</span>
                                </button>
                                <button
                                  onClick={() => setRejectingTx(tx)}
                                  className="px-1.5 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-600 transition-all font-bold text-[9px] flex items-center gap-0.5"
                                  title={isRtl ? 'رفض المستند نهائياً' : 'Reject Voucher'}
                                >
                                  <XCircle size={10} />
                                  <span>{isRtl ? 'رفض' : 'Reject'}</span>
                                </button>
                                <button
                                  onClick={() => setRevertingTx(tx)}
                                  className="px-1.5 py-0.5 rounded bg-amber-500/10 hover:bg-amber-600 text-amber-600 hover:text-white transition-all flex items-center gap-0.5 font-bold text-[9px]"
                                >
                                  <CornerUpLeft size={10} />
                                  <span>{isRtl ? 'إرجاع' : 'Revert'}</span>
                                </button>
                              </>
                            )}
                            {isAdmin && (
                              <button
                                onClick={() => setDeletingId(tx.id)}
                                className="p-1 rounded bg-rose-500/10 hover:bg-rose-600 hover:text-white text-rose-600 transition-all"
                              >
                                <Trash2 size={10} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {underSettlementTxs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-400 text-[11px]">
                        {isRtl ? 'لا توجد معاملات تحت التسوية.' : 'No vouchers under settlement.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {underSettlementTxs.length > settledLimit && (
              <div className="flex justify-center p-2.5 border-t border-slate-100 dark:border-slate-800/30">
                <button
                  onClick={() => setSettledLimit(prev => prev + 10)}
                  className="px-3 py-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20 rounded transition-all flex items-center gap-1"
                >
                  <span>{isRtl ? 'عرض المزيد من المستندات' : 'Load More Vouchers'}</span>
                  <span className="text-[9px] text-slate-400 font-normal">({underSettlementTxs.length - settledLimit} {isRtl ? 'متبقي' : 'remaining'})</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CHART & RECENT LOGS SECTION */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* spend station pie/bar distribution */}
        {!isSystemAdmin && (
          <div className={`lg:col-span-2 p-5 rounded-2xl border flex flex-col justify-between min-w-0 overflow-hidden ${
          theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800 mb-4">
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp size={14} className="text-indigo-500" />
              <span>
                {chartTab === 'station'
                  ? (isRtl ? 'تحليل المصروفات حسب المحطة' : 'Expense Distribution by Station')
                  : (isRtl ? 'تحليل المصروفات حسب التصنيف' : 'Expense Distribution by Category')
                }
              </span>
            </h3>
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 animate-fade-in">
              <button
                onClick={() => setChartTab('station')}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${
                  chartTab === 'station'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {isRtl ? 'المحطات' : 'Stations'}
              </button>
              <button
                onClick={() => setChartTab('category')}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${
                  chartTab === 'category'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {isRtl ? 'التصنيفات' : 'Categories'}
              </button>
            </div>
          </div>
          
          <div className="h-64 w-full">
            {finalChartData.length === 1 && finalChartData[0].amount === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <AlertTriangle size={32} className="mb-2 text-slate-300" />
                <p className="text-xs">{isRtl ? 'لا توجد حركات مصروفة حتى الآن لعرضها بيانيا.' : 'No active expenses logged yet to display on chart.'}</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={finalChartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
                      borderColor: theme === 'dark' ? '#334155' : '#e2e8f0',
                      color: theme === 'dark' ? '#f8fafc' : '#0f172a',
                      fontSize: '12px',
                      fontFamily: 'monospace'
                    }}
                    formatter={(value) => [`${value.toLocaleString()} EGP`, isRtl ? 'القيمة' : 'Amount']}
                  />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                    {finalChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 justify-center border-t pt-3 border-slate-100 dark:border-slate-800">
            {finalChartData.map((item, idx) => (
              <div key={idx} className="flex items-center gap-1.5 text-xs">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-slate-500 dark:text-slate-400 font-medium">{item.name}:</span>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                  {item.amount.toLocaleString()} EGP
                </span>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* Audit Log / Activity Tracking Column */}
        <div className={`${isSystemAdmin ? 'lg:col-span-3' : 'lg:col-span-1'} p-5 rounded-2xl border flex flex-col justify-between ${
          theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div>
            <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800 mb-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setDashboardTab('activity')}
                  className={`text-xs font-bold uppercase tracking-wider pb-1 transition-all border-b-2 ${
                    dashboardTab === 'activity'
                      ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {t.recentLogs}
                </button>
                <button
                  onClick={() => setDashboardTab('notifications')}
                  className={`text-xs font-bold uppercase tracking-wider pb-1 transition-all border-b-2 flex items-center gap-1 ${
                    dashboardTab === 'notifications'
                      ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <span>{isRtl ? 'التنبيهات' : 'Notifications'}</span>
                  {notifications.filter(n => !n.is_read).length > 0 && (
                    <span className="bg-rose-500 text-white text-[9px] font-extrabold h-4 w-4 rounded-full flex items-center justify-center animate-pulse">
                      {notifications.filter(n => !n.is_read).length}
                    </span>
                  )}
                </button>
              </div>

              {dashboardTab === 'notifications' && notifications.filter(n => !n.is_read).length > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-[10px] font-bold text-indigo-500 hover:text-indigo-600"
                >
                  {isRtl ? 'تحديد الكل' : 'Dismiss All'}
                </button>
              )}
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {dashboardTab === 'activity' ? (
                logs.map((log) => (
                  <div key={log.id} className="text-xs flex flex-col gap-1 border-b pb-2.5 last:border-0 border-slate-100 dark:border-slate-800 animate-fade-in">
                    <div className="flex justify-between items-start">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {log.action}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {new Date(log.timestamp).toLocaleTimeString(language, {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
                      {log.details}
                    </p>
                    <div className="text-[10px] font-mono font-medium text-emerald-500/80">
                      By: {log.user_name}
                    </div>
                  </div>
                ))
              ) : (
                notifications.map((notif) => (
                  <div 
                    key={notif.id} 
                    onClick={() => handleNotificationClick(notif)}
                    className={`text-xs p-2.5 rounded-xl border flex flex-col gap-1 transition-all animate-fade-in cursor-pointer hover:scale-[1.01] ${
                      notif.is_read 
                        ? 'bg-slate-50/50 dark:bg-slate-800/10 border-slate-100 dark:border-slate-800 text-slate-400' 
                        : 'bg-indigo-50/25 dark:bg-indigo-950/10 border-indigo-100 dark:border-indigo-900/40 text-slate-800 dark:text-slate-200 hover:border-indigo-200 dark:hover:border-indigo-800'
                    }`}
                  >
                    <div className="flex justify-between items-start" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5 font-bold">
                        <span className={`h-2 w-2 rounded-full ${
                          notif.type === 'warning' ? 'bg-amber-500' : notif.type === 'error' ? 'bg-rose-500' : 'bg-sky-500'
                        }`} />
                        <span className={notif.is_read ? 'text-slate-400' : 'text-indigo-950 dark:text-indigo-300'}>
                          {isRtl ? notif.title_ar : notif.title_en}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono text-slate-400">
                        {new Date(notif.created_at).toLocaleTimeString(language, {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 font-medium whitespace-pre-line">
                      {isRtl ? notif.message_ar : notif.message_en}
                    </p>
                    {!notif.is_read && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkAsRead(notif.id);
                        }}
                        className="self-end text-[9px] font-extrabold text-indigo-500 hover:text-indigo-600 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-950 shadow-xs"
                      >
                        {isRtl ? 'تحديد كمقروء' : 'Dismiss'}
                      </button>
                    )}
                  </div>
                ))
              )}
              {dashboardTab === 'notifications' && notifications.length === 0 && (
                <div className="py-12 text-center text-slate-400 text-xs">
                  {isRtl ? 'لا توجد تنبيهات نشطة حاليا.' : 'No active notifications.'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      </div> {/* closes lg:col-span-3 Content Area */}
    </div> {/* closes grid-cols-1 lg:grid-cols-4 Split Layout */}

      {/* PRINT VOUCHER MODAL */}
      <VoucherModal
        transaction={printingTx}
        isOpen={printingTx !== null}
        onClose={() => setPrintingTx(null)}
        theme={theme}
      />

      {/* DELETE CONFIRMATION DIALOG */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`w-full max-w-sm p-5 rounded-2xl border shadow-xl ${
            theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center gap-3 text-rose-500 mb-3">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <h3 className="font-bold text-base">{isRtl ? 'تأكيد الحذف النهائي' : 'Confirm Permanent Delete'}</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
              {isRtl 
                ? 'هل أنت متأكد من رغبتك في حذف هذه الحركة نهائياً من قاعدة البيانات؟ لا يمكن التراجع عن هذا الإجراء.'
                : 'Are you sure you want to permanently delete this transaction from the database? This action cannot be undone.'}
              {user?.role !== 'Admin' && user?.role !== 'SystemAdmin' && (
                <span className="block text-rose-500 font-bold mt-2">
                  * {isRtl ? 'تنبيه: يتطلب صلاحية أدمن عام أو أدمن الشركة لإتمام الحذف.' : 'Note: Requires System Admin or Company Admin credentials.'}
                </span>
              )}
            </p>
            <div className="mb-4">
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                {isRtl ? 'سبب الحذف (إجباري) *' : 'Reason for Deletion (Mandatory) *'}
              </label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder={isRtl ? 'أدخل سبب مقنع للحذف...' : 'Enter a valid reason for deletion...'}
                className="w-full p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-rose-500 resize-none h-16"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setDeletingId(null);
                  setDeleteReason('');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-100 ${theme === 'dark' ? 'hover:bg-slate-800' : ''}`}
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={() => handleDelete(deletingId)}
                disabled={!deleteReason.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500 hover:bg-rose-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isRtl ? 'حذف نهائي' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REVERT CONFIRMATION DIALOG */}
      {revertingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`w-full max-w-sm p-5 rounded-2xl border shadow-xl ${
            theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center gap-3 text-amber-500 mb-3">
              <CornerUpLeft className="h-6 w-6 shrink-0" />
              <h3 className="font-bold text-base">{isRtl ? 'إلغاء تسوية المستند' : 'Revert Settlement'}</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              {isRtl 
                ? `هل أنت متأكد من رغبتك في إلغاء تسوية المستند رقم (${revertingTx.voucher_no || revertingTx.transaction_no}) وإعادته كحركة معلقة بالخزينة؟`
                : `Are you sure you want to cancel the settlement for voucher (${revertingTx.voucher_no || revertingTx.transaction_no}) and revert it to a pending cash operation?`}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRevertingTx(null)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-100 ${theme === 'dark' ? 'hover:bg-slate-800' : ''}`}
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={() => handleRevert(revertingTx)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white"
              >
                {isRtl ? 'تأكيد الإرجاع' : 'Confirm Revert'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* APPROVE CONFIRMATION DIALOG */}
      {approvingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`w-full max-w-sm p-5 rounded-2xl border shadow-xl ${
            theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center gap-3 text-emerald-500 mb-3">
              <ShieldCheck className="h-6 w-6 shrink-0" />
              <h3 className="font-bold text-base">{isRtl ? 'اعتماد ومطابقة السند نهائياً' : 'Approve & Settle'}</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              {isRtl 
                ? `هل أنت متأكد من اعتماد مستند الصرف رقم (${approvingTx.voucher_no || approvingTx.transaction_no}) وتنزيله نهائياً من رصيد العهدة النقدية؟`
                : `Are you sure you want to approve voucher (${approvingTx.voucher_no || approvingTx.transaction_no}) and finalize its settlement from custody?`}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setApprovingTx(null)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-100 ${theme === 'dark' ? 'hover:bg-slate-800' : ''}`}
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={() => handleApprove(approvingTx)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                {isRtl ? 'تأكيد الاعتماد' : 'Confirm Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT CONFIRMATION DIALOG */}
      {rejectingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`w-full max-w-sm p-5 rounded-2xl border shadow-xl ${
            theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center gap-3 text-rose-500 mb-3">
              <XCircle className="h-6 w-6 shrink-0" />
              <h3 className="font-bold text-base">{isRtl ? 'رفض مستند الصرف' : 'Reject Voucher'}</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              {isRtl 
                ? `هل أنت متأكد من رفض مستند الصرف رقم (${rejectingTx.voucher_no || rejectingTx.transaction_no})؟ سيتم تغيير الحالة إلى "مرفوض" وإتاحته مجدداً للتصحيح.`
                : `Are you sure you want to reject voucher (${rejectingTx.voucher_no || rejectingTx.transaction_no})? This changes its status to "Rejected" allowing correction.`}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRejectingTx(null)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-100 ${theme === 'dark' ? 'hover:bg-slate-800' : ''}`}
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={() => handleReject(rejectingTx)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white"
              >
                {isRtl ? 'تأكيد الرفض' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AUTH ERROR DIALOG */}
      {authError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`w-full max-w-sm p-5 rounded-2xl border shadow-xl ${
            theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center gap-3 text-rose-500 mb-3">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <h3 className="font-bold text-base">{isRtl ? 'خطأ في الصلاحيات' : 'Authorization Denied'}</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              {authError}
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setAuthError(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-rose-500 hover:bg-rose-600 text-white"
              >
                {isRtl ? 'حسناً' : 'Okay'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
