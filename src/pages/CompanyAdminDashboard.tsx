import React, { useState, useMemo, useEffect } from 'react';
import { CustodyDB, CustodyEngine } from '../db';
import { useScreenListeners, auth } from '../firebase';
import { Company, AppUser, Language, Theme, Region, Station, UserPermissions, Transaction, TransactionStatus, ActivityLog, DeletedTransaction, SignupRequest } from '../types';
import { 
  Building2, ShieldCheck, KeyRound, UserCheck, RefreshCw, AlertTriangle, 
  Plus, Calendar, Sparkles, User, LogOut, ClipboardList, Info, Check, Search, ShieldAlert,
  Globe, Laptop, FileText, CheckCircle2, XCircle, Network, X, Settings, Trash2, Edit,
  PlusCircle, Building, Layers, Power, Activity, RotateCcw, Lock
} from 'lucide-react';

interface CompanyAdminDashboardProps {
  activeUser: AppUser;
  language: Language;
  theme: Theme;
}

export default function CompanyAdminDashboard({ activeUser, language, theme }: CompanyAdminDashboardProps) {
  useScreenListeners(['transactions', 'logs', 'Expenses', 'CashVouchers', 'TransactionHistory', 'deleted_transactions', 'signup_requests']);

  const isRtl = language === 'ar';
  const myCompanyId = activeUser.company_id || '';

  // Active Tab
  const [activeTab, setActiveTab] = useState<'directory' | 'operations'>('directory');

  // Directory / Structure builder state
  const [regions, setRegions] = useState<Region[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [myCompany, setMyCompany] = useState<Company | null>(null);

  // Operations Ledger State
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [allLogs, setAllLogs] = useState<ActivityLog[]>([]);
  const [allDeletedTransactions, setAllDeletedTransactions] = useState<DeletedTransaction[]>([]);

  // Filtering / Search States
  const [opRegionFilter, setOpRegionFilter] = useState<string>('all');
  const [opStationFilter, setOpStationFilter] = useState<string>('all');
  const [opStatusFilter, setOpStatusFilter] = useState<string>('all');
  const [opSearchQuery, setOpSearchQuery] = useState<string>('');

  // Selected item for edit or delete
  const [editingOp, setEditingOp] = useState<any>(null);
  const [deletingOp, setDeletingOp] = useState<any>(null);
  const [opDeleteReason, setOpDeleteReason] = useState<string>('');

  // Modals visibility
  const [showOpEditModal, setShowOpEditModal] = useState(false);
  const [showOpDeleteModal, setShowOpDeleteModal] = useState(false);
  const [showStructRegionModal, setShowStructRegionModal] = useState(false);
  const [showStructStationModal, setShowStructStationModal] = useState(false);

  // Fields for Editing Transaction
  const [opEditAmount, setOpEditAmount] = useState<string>('');
  const [opEditDate, setOpEditDate] = useState<string>('');
  const [opEditDescription, setOpEditDescription] = useState<string>('');
  const [opEditStatus, setOpEditStatus] = useState<TransactionStatus>('Pending');
  const [opEditNotes, setOpEditNotes] = useState<string>('');

  // Fields for Editing Replenishment
  const [opEditReplenishAmount, setOpEditReplenishAmount] = useState<string>('');
  const [opEditReplenishNotes, setOpEditReplenishNotes] = useState<string>('');

  // Fields for Structure add/edit
  const [structEditingRegion, setStructEditingRegion] = useState<Region | null>(null);
  const [structRegName, setStructRegName] = useState<string>('');

  const [structEditingStation, setStructEditingStation] = useState<Station | null>(null);
  const [structStnName, setStructStnName] = useState<string>('');
  const [structStnCode, setStructStnCode] = useState<string>('');
  const [structStnCustody, setStructStnCustody] = useState<string>('');
  const [structStnRegionId, setStructStnRegionId] = useState<string>('none');

  // Visual cues
  const [structToastMsg, setStructToastMsg] = useState<string>('');
  const [isSubmittingStruct, setIsSubmittingStruct] = useState(false);

  const showStructToast = (msg: string) => {
    setStructToastMsg(msg);
    setTimeout(() => setStructToastMsg(''), 4000);
  };

  const loadData = () => {
    const allCos = CustodyDB.getCompanies();
    setMyCompany(allCos.find(c => c.id === myCompanyId) || null);
    
    // Scoped DB fetch
    const rawRegions = CustodyDB.getRegions();
    setRegions(rawRegions.filter(r => r.company_id === myCompanyId));

    const rawStations = CustodyDB.getStations();
    setStations(CustodyDB.getStationsForUser(activeUser));

    const rawUsers = CustodyDB.getUsers();
    setUsers(rawUsers.filter(u => u.company_id === myCompanyId));

    // Scoped operations ledger
    setAllTransactions(CustodyDB.getTransactions().filter(t => t.company_id === myCompanyId));
    setAllLogs(CustodyDB.getLogs().filter(l => l.company_id === myCompanyId || (l.station_id && rawStations.find(s => s.id === l.station_id && s.company_id === myCompanyId))));
    setAllDeletedTransactions(CustodyDB.getDeletedTransactions().filter(t => t.company_id === myCompanyId));
  };

  useEffect(() => {
    loadData();
    const handleUpdate = () => loadData();
    window.addEventListener('custody_db_updated', handleUpdate);
    return () => {
      window.removeEventListener('custody_db_updated', handleUpdate);
    };
  }, [myCompanyId]);

  // Parser for replenishment details
  const parseReplenishmentLog = (log: ActivityLog) => {
    let amount = log.amount || 0;
    let stationId = log.station_id || '';
    
    if (!amount || !stationId) {
      const matchAmount = log.details.match(/\+(\d+[\d,]*)/);
      if (matchAmount) {
        amount = parseFloat(matchAmount[1].replace(/,/g, ''));
      }
      
      const matchedStation = stations.find(s => log.details.includes(s.station_name));
      if (matchedStation) {
        stationId = matchedStation.id;
      }
    }
    
    return { amount, stationId };
  };

  const getAuthHeaders = async () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    try {
      const token = await auth.currentUser?.getIdToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } catch (err) {
      console.warn('Failed to retrieve ID token:', err);
    }
    return headers;
  };

  // Region Handlers
  const handleStructAddRegion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!structRegName.trim() || isSubmittingStruct) return;

    setIsSubmittingStruct(true);
    try {
      if (structEditingRegion) {
        await CustodyDB.updateRegion(structEditingRegion.id, {
          name: structRegName.trim()
        });
        showStructToast(isRtl ? 'تم تحديث الإقليم بنجاح' : 'Region updated successfully');
        setStructEditingRegion(null);
      } else {
        await CustodyDB.addRegion(structRegName.trim(), '', myCompanyId);
        showStructToast(isRtl ? 'تم إضافة الإقليم بنجاح' : 'Region added successfully');
      }
      setStructRegName('');
      setShowStructRegionModal(false);
      loadData();
    } finally {
      setIsSubmittingStruct(false);
    }
  };

  const handleStructDeleteRegion = (id: string) => {
    const connectedStations = stations.filter(s => s.region_id === id);
    if (connectedStations.length > 0) {
      alert(
        isRtl 
          ? `لا يمكن حذف هذه المنطقة لوجود عدد (${connectedStations.length}) فروع تابعة لها. يرجى نقل أو حذف الفروع أولاً.` 
          : `Cannot delete region. It contains ${connectedStations.length} branches. Please move or delete them first.`
      );
      return;
    }

    if (confirm(isRtl ? 'هل تريد حذف هذه المنطقة بالتأكيد؟' : 'Are you sure you want to delete this region?')) {
      CustodyDB.deleteRegion(id);
      showStructToast(isRtl ? 'تم حذف المنطقة بنجاح' : 'Region deleted successfully');
      loadData();
    }
  };

  // Station Handlers
  const handleStructAddStation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!structStnName.trim() || !structStnCode.trim() || !structStnCustody || isSubmittingStruct) return;
    const val = parseFloat(structStnCustody);
    if (isNaN(val) || val <= 0) return;

    const rId = structStnRegionId === 'none' || !structStnRegionId ? undefined : structStnRegionId;

    setIsSubmittingStruct(true);
    try {
      if (structEditingStation) {
        await CustodyDB.updateStation(structEditingStation.id, {
          station_name: structStnName.trim(),
          station_code: structStnCode.toUpperCase().trim(),
          custody_amount: val,
          region_id: rId
        });
        showStructToast(isRtl ? 'تم تحديث الفرع بنجاح' : 'Branch updated successfully');
        setStructEditingStation(null);
      } else {
        await CustodyDB.addStation(structStnName.trim(), structStnCode.toUpperCase().trim(), val, rId, myCompanyId);
        showStructToast(isRtl ? 'تم إضافة الفرع بنجاح' : 'Branch added successfully');
      }
      setStructStnName('');
      setStructStnCode('');
      setStructStnCustody('');
      setStructStnRegionId('none');
      setShowStructStationModal(false);
      loadData();
    } finally {
      setIsSubmittingStruct(false);
    }
  };

  const handleStructDeleteStation = (id: string) => {
    if (confirm(isRtl ? 'هل تريد حذف هذا الفرع بالتأكيد؟' : 'Are you sure you want to delete this branch?')) {
      CustodyDB.deleteStation(id);
      showStructToast(isRtl ? 'تم حذف الفرع بنجاح' : 'Branch deleted successfully');
      loadData();
    }
  };

  // Compiled Operations Memo
  const compiledOperations = useMemo(() => {
    const txOps = allTransactions
      .filter(tx => tx.status !== 'Deleted')
      .map(tx => ({
        id: tx.id,
        refNo: tx.transaction_no,
        date: tx.date || tx.created_at,
        description: tx.description,
        amount: tx.amount,
        status: tx.status as any,
        type: 'transaction' as const,
        created_by: tx.created_by,
        notes: tx.notes || '',
        station_id: tx.station_id,
        company_id: tx.company_id,
        original: tx
      }));

    const legacyDeletedOps = allDeletedTransactions
      .map(del => ({
        id: del.id,
        refNo: del.transaction_no,
        date: del.deleted_at,
        description: del.description || del.transaction_data?.description || '',
        amount: del.amount,
        status: 'Deleted' as any,
        type: 'transaction' as const,
        created_by: del.created_by_name || del.transaction_data?.created_by || '',
        notes: del.delete_reason ? (language === 'ar' ? `سبب الحذف: ${del.delete_reason}` : `Reason: ${del.delete_reason}`) : '',
        station_id: del.transaction_data?.station_id || '',
        company_id: del.company_id || del.transaction_data?.company_id || myCompanyId,
        original: del.transaction_data || del
      }));

    const replenishmentOps = allLogs
      .filter(l => l.action === 'Custody Replenishment')
      .map(log => {
        const { amount, stationId } = parseReplenishmentLog(log);
        return {
          id: log.id,
          refNo: log.id.slice(0, 10),
          date: log.timestamp,
          description: log.details,
          amount: amount,
          status: 'Replenished' as const,
          type: 'replenishment' as const,
          created_by: log.user_name,
          notes: log.notes || '',
          station_id: stationId,
          company_id: myCompanyId,
          original: log
        };
      });

    return [...txOps, ...legacyDeletedOps, ...replenishmentOps].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allTransactions, allLogs, allDeletedTransactions, stations, language]);

  const filteredOperations = useMemo(() => {
    return compiledOperations.filter(op => {
      // 1. Region Scoping Filter
      if (opRegionFilter !== 'all') {
        const stnObj = stations.find(s => s.id === op.station_id);
        if (!stnObj || stnObj.region_id !== opRegionFilter) return false;
      }

      // 2. Station Filter
      if (opStationFilter !== 'all' && op.station_id !== opStationFilter) return false;

      // 3. Status Filter
      if (opStatusFilter !== 'all') {
        if (opStatusFilter === 'Replenishment') {
          if (op.type !== 'replenishment') return false;
        } else {
          if (op.type === 'replenishment' || op.status !== opStatusFilter) return false;
        }
      }

      // 4. Instant Search Query
      if (opSearchQuery.trim()) {
        const query = opSearchQuery.toLowerCase();
        const desc = (op.description || '').toLowerCase();
        const ref = (op.refNo || '').toLowerCase();
        const notes = (op.notes || '').toLowerCase();
        const cBy = (op.created_by || '').toLowerCase();
        const amountStr = String(op.amount || '');
        return desc.includes(query) || ref.includes(query) || notes.includes(query) || cBy.includes(query) || amountStr.includes(query);
      }

      return true;
    });
  }, [compiledOperations, opRegionFilter, opStationFilter, opStatusFilter, opSearchQuery, stations]);

  // Handle Edit Operation
  const handleEditTransactionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOp) return;
    const amountVal = parseFloat(opEditAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      alert(isRtl ? 'يرجى إدخال مبلغ صحيح وموجب' : 'Please enter a valid positive amount.');
      return;
    }

    const updates: Partial<Transaction> = {
      amount: amountVal,
      date: opEditDate,
      description: opEditDescription,
      status: opEditStatus,
      notes: opEditNotes
    };

    if (amountVal !== editingOp.amount) {
      const vouchers = CustodyDB.getCashVouchers();
      const associatedVoucher = vouchers.find(v => v.expense_ids && v.expense_ids.includes(editingOp.id));
      if (associatedVoucher) {
        const diff = amountVal - editingOp.amount;
        const newVoucherAmount = Math.max(0, associatedVoucher.amount + diff);
        await CustodyDB.saveCashVoucher({
          ...associatedVoucher,
          amount: newVoucherAmount
        });
      }
    }

    const res = await CustodyDB.updateTransaction(editingOp.id, updates);
    if (!res.success) {
      alert(res.errors?.join(' \n ') || 'Failed to update transaction');
      return;
    }
    
    CustodyDB.addLog(
      activeUser.id,
      activeUser.full_name,
      'Transaction Updated By CompanyAdmin',
      `CompanyAdmin updated transaction ${editingOp.refNo}: amount ${editingOp.amount} -> ${amountVal}, status ${editingOp.status} -> ${opEditStatus}.`,
      editingOp.station_id,
      myCompanyId
    );

    showStructToast(isRtl ? 'تم تعديل الحركة بنجاح وتحديث الأثر المالي!' : 'Transaction updated successfully and financial impact applied!');
    setShowOpEditModal(false);
    setEditingOp(null);
    loadData();
  };

  const handleEditReplenishmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOp) return;
    const { amount: oldAmount, stationId } = parseReplenishmentLog(editingOp.original);
    const newAmount = parseFloat(opEditReplenishAmount);
    if (isNaN(newAmount) || newAmount <= 0) {
      alert(isRtl ? 'يرجى إدخال مبلغ صحيح وموجب' : 'Please enter a valid positive amount.');
      return;
    }

    if (!stationId) {
      alert(isRtl ? 'تعذر العثور على المحطة المقترنة بالعملية' : 'Could not locate the station associated with this replenishment.');
      return;
    }

    const station = stations.find(s => s.id === stationId);
    if (!station) {
      alert(isRtl ? 'المحطة غير موجودة' : 'Station not found.');
      return;
    }

    const res = await CustodyEngine.updateReplenishment({
      stationId,
      oldAmount,
      newAmount,
      notes: opEditReplenishNotes,
      actorId: activeUser.id,
      actorName: activeUser.full_name,
      logId: editingOp.id
    });

    if (!res.success) {
      alert(res.error || 'Failed to update replenishment');
      return;
    }

    showStructToast(isRtl ? 'تم تعديل مبلغ الاستعاضة وتحديث قيمة العهدة للمحطة بنجاح!' : 'Replenishment updated successfully and nominal custody adjusted!');
    setShowOpEditModal(false);
    setEditingOp(null);
    loadData();
  };

  const handleDeleteOpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingOp) return;
    if (!opDeleteReason.trim()) {
      alert(isRtl ? 'يرجى كتابة سبب الحذف' : 'Please provide a reason for deletion.');
      return;
    }

    if (deletingOp.type === 'transaction') {
      const success = await CustodyDB.deleteTransaction(deletingOp.id, opDeleteReason.trim());
      if (success) {
        CustodyDB.addLog(
          activeUser.id,
          activeUser.full_name,
          'Transaction Deleted By CompanyAdmin',
          `CompanyAdmin deleted transaction ${deletingOp.refNo} (${deletingOp.amount} EGP). Reason: ${opDeleteReason}`,
          deletingOp.station_id,
          myCompanyId
        );
        showStructToast(isRtl ? 'تم حذف الحركة بنجاح وتحديث الأثر المالي!' : 'Transaction deleted successfully and financial impact applied!');
      } else {
        alert(isRtl ? 'حدث خطأ أثناء الحذف' : 'An error occurred while deleting.');
      }
    } else {
      const { amount, stationId } = parseReplenishmentLog(deletingOp.original);
      if (!stationId) {
        alert(isRtl ? 'تعذر العثور على المحطة المقترنة بالعملية' : 'Could not locate the station associated with this replenishment.');
        return;
      }

      const station = stations.find(s => s.id === stationId);
      if (!station) {
        alert(isRtl ? 'المحطة غير موجودة' : 'Station not found.');
        return;
      }

      const res = await CustodyEngine.reverseReplenishment({
        stationId,
        amount,
        reason: opDeleteReason,
        actorId: activeUser.id,
        actorName: activeUser.full_name,
        logId: deletingOp.id
      });

      if (!res.success) {
        alert(res.error || 'Failed to reverse replenishment');
        return;
      }

      showStructToast(isRtl ? 'تم حذف عملية الاستعاضة وإلغاء أثرها المالي من قيمة العهدة!' : 'Replenishment deleted successfully and nominal custody reverted!');
    }

    setShowOpDeleteModal(false);
    setDeletingOp(null);
    setOpDeleteReason('');
    loadData();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Toast Notification */}
      {structToastMsg && (
        <div className="fixed bottom-5 right-5 z-[110] flex items-center gap-2 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-2xl animate-fade-in text-xs font-bold">
          <Check size={16} />
          <span>{structToastMsg}</span>
        </div>
      )}

      {/* Corporate Dashboard Header Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-[#1e1b4b] via-[#111827] to-[#1e1b4b] border border-indigo-500/20 text-white relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full filter blur-3xl -mr-20 -mt-20 pointer-events-none" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold uppercase tracking-wider">
              <Building2 size={12} />
              <span>{myCompany?.name || (isRtl ? 'شركتي' : 'My Company')}</span>
            </span>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight">
              {isRtl ? 'لوحة تحكم إدارة الشركة والتدقيق' : 'Company Administration Control Hub'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              {isRtl 
                ? 'مرحباً بك في وحدة الإدارة المركزية المخصصة لشركتك فقط. يمكنك التحكم بهيكل القطاعات والفروع التابعة، وتخصيص صلاحيات المدراء، ومراجعة وتعديل كافة الحركات والعهد النقدية لضمان الحوكمة الكاملة.'
                : 'Welcome to your scoped corporate dashboard. Oversee and adjust regional structures, dictate specific user permissions, and audit general expenditures with total fiscal autonomy.'}
            </p>
          </div>
          <button 
            onClick={loadData}
            className="flex items-center justify-center gap-2 px-4.5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold transition-all shadow-lg active:scale-95 cursor-pointer border border-indigo-500/30 w-full lg:w-auto"
          >
            <RefreshCw size={14} />
            <span>{isRtl ? 'تحديث البيانات' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 pb-2.5 gap-2">
        <button
          onClick={() => setActiveTab('directory')}
          className={`px-4 py-2 rounded-xl font-bold text-xs md:text-sm flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'directory'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <Network size={16} />
          <span>{isRtl ? 'دليل وبناء هيكل الشركة' : 'Company Directory & Structure'}</span>
        </button>
        <button
          onClick={() => setActiveTab('operations')}
          className={`px-4 py-2 rounded-xl font-bold text-xs md:text-sm flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'operations'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <Activity size={16} />
          <span>{isRtl ? 'إدارة العمليات الداخلية للشركة' : 'Internal Operations Ledger'}</span>
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'directory' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 gap-3">
            <div>
              <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">
                {isRtl ? 'مخطط وفروع شركة ' : 'Corporate Structure of '} {myCompany?.name}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isRtl 
                  ? 'يمكنك إضافة قطاعات جغرافية ومناطق تابعة، ومحطات العهد التكليفية، والتحكم بحسابات مسؤوليها.' 
                  : 'Manage parent company sectors, active custody branch locations, and their administrative accounts.'}
              </p>
            </div>
            <button
              onClick={() => {
                setStructEditingRegion(null);
                setStructRegName('');
                setShowStructRegionModal(true);
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md cursor-pointer self-start sm:self-auto"
            >
              <PlusCircle size={14} />
              <span>{isRtl ? 'إضافة منطقة جديدة' : 'Add Region'}</span>
            </button>
          </div>

          <div className="space-y-6">
            {regions.map(r => {
              const compStns = stations.filter(s => s.region_id === r.id);
              const rmUser = users.find(u => u.region_id === r.id && u.role === 'RegionalManager');

              return (
                <div 
                  key={r.id}
                  className="border border-indigo-100 dark:border-indigo-900/60 rounded-2xl p-5 bg-indigo-50/5 dark:bg-slate-900/25 shadow-sm"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 pb-4 mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400">
                          <Layers size={16} />
                        </span>
                        <div>
                          <h4 className="font-bold text-slate-800 dark:text-white text-sm md:text-base">
                            {r.name}
                          </h4>
                          <span className="text-[10px] text-slate-450 dark:text-slate-500 font-semibold font-mono">
                            ID: {r.id}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setStructEditingStation(null);
                          setStructStnName('');
                          setStructStnCode('');
                          setStructStnCustody('');
                          setStructStnRegionId(r.id);
                          setShowStructStationModal(true);
                        }}
                        className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 rounded-lg text-[10px] font-bold cursor-pointer flex items-center gap-1"
                      >
                        <Plus size={11} />
                        {isRtl ? 'إضافة محطة للمنطقة' : 'Add Station'}
                      </button>
                      <button
                        onClick={() => {
                          setStructEditingRegion(r);
                          setStructRegName(r.name);
                          setShowStructRegionModal(true);
                        }}
                        className="p-1.5 hover:bg-indigo-50 dark:hover:bg-slate-850 rounded text-indigo-600 dark:text-indigo-400 cursor-pointer"
                        title={isRtl ? 'تعديل اسم المنطقة' : 'Rename Region'}
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        onClick={() => handleStructDeleteRegion(r.id)}
                        className="p-1.5 hover:bg-rose-50 dark:hover:bg-slate-850 rounded text-rose-500 cursor-pointer"
                        title={isRtl ? 'حذف المنطقة' : 'Delete Region'}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    {/* Regional Manager Admin panel */}
                    <div className="lg:col-span-5 bg-white dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200/50 dark:border-slate-800/80 shadow-sm space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[11px] font-black text-indigo-600 dark:text-indigo-400 uppercase">
                          <UserCheck size={12} />
                          <span>{isRtl ? 'حساب مدير المنطقة' : 'Regional Manager Account'}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            window.dispatchEvent(new CustomEvent('navigate_tab', { 
                              detail: { tab: 'settings', settingsTab: 'permissions', selectedCompanyId: myCompanyId } 
                            }));
                          }}
                          className="px-2 py-0.5 rounded bg-indigo-600/10 hover:bg-indigo-600 text-indigo-600 hover:text-white dark:text-indigo-400 dark:hover:text-white text-[9px] font-bold transition-all shrink-0 cursor-pointer"
                        >
                          {isRtl ? 'إدارة الوصول' : 'Manage Access'}
                        </button>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800/60">
                        {rmUser ? (
                          <div className="text-[10px] text-slate-600 dark:text-slate-300 font-mono space-y-1">
                            <div><span className="font-bold text-slate-400 mr-1">{isRtl ? 'البريد:' : 'Email:'}</span>{rmUser.email}</div>
                            {rmUser.full_name && <div><span className="font-bold text-slate-400 mr-1">{isRtl ? 'الاسم:' : 'Name:'}</span>{rmUser.full_name}</div>}
                          </div>
                        ) : (
                          <div className="text-[10px] text-amber-600 dark:text-amber-400 italic">
                            {isRtl ? 'لم يتم تعيين مدير لهذه المنطقة بعد' : 'No Regional Manager assigned yet'}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Stations inside region */}
                    <div className="lg:col-span-7 space-y-3">
                      <span className="block text-[10px] font-black text-slate-400 uppercase">
                        {isRtl ? `الفروع والمحطات العهدية التابعة (${compStns.length})` : `Affiliated Stations/Branches (${compStns.length})`}
                      </span>
                      {compStns.length === 0 ? (
                        <div className="p-8 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
                          {isRtl ? 'لا توجد فروع مضافة لهذه المنطقة حتى الآن.' : 'No stations added inside this regional sector yet.'}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {compStns.map(stn => {
                            const stnUser = users.find(u => u.station_id === stn.id && u.role === 'StationAdmin');
                            return (
                              <div 
                                key={stn.id}
                                className="p-3.5 rounded-xl border border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-900 flex flex-col gap-2.5 shadow-sm"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="font-bold text-xs text-slate-800 dark:text-white flex items-center gap-1.5">
                                      <span className={`h-1.5 w-1.5 rounded-full ${stn.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                      <span>{stn.station_name}</span>
                                    </div>
                                    <div className="text-[9px] text-slate-400 font-mono mt-0.5">
                                      Code: {stn.station_code} | {isRtl ? 'العهدة الكلية:' : 'Nominal Custody:'} <span className="font-bold text-indigo-600 dark:text-indigo-400">{CustodyDB.getStationDeductedCustody(stn.id).toLocaleString()} EGP</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => {
                                        setStructEditingStation(stn);
                                        setStructStnName(stn.station_name);
                                        setStructStnCode(stn.station_code);
                                        setStructStnCustody(String(stn.custody_amount));
                                        setStructStnRegionId(stn.region_id || 'none');
                                        setShowStructStationModal(true);
                                      }}
                                      className="p-1 rounded hover:bg-indigo-50 dark:hover:bg-slate-850 text-indigo-600 dark:text-indigo-400 cursor-pointer"
                                    >
                                      <Edit size={12} />
                                    </button>
                                    <button
                                      onClick={() => handleStructDeleteStation(stn.id)}
                                      className="p-1 rounded hover:bg-rose-50 dark:hover:bg-slate-850 text-rose-500 cursor-pointer"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </div>

                                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-850/60 flex items-center justify-between gap-2">
                                  <div>
                                    <div className="flex items-center gap-1 text-[9px] font-bold text-slate-450 dark:text-slate-550">
                                      <KeyRound size={9} />
                                      <span>{isRtl ? 'حساب مسؤول الفرع' : 'Branch Manager Account'}</span>
                                    </div>
                                    {stnUser ? (
                                      <div className="text-[9px] text-slate-600 dark:text-slate-300 font-mono mt-0.5">
                                        <span className="font-bold text-slate-400 mr-1">{isRtl ? 'البريد:' : 'Email:'}</span>{stnUser.email}
                                      </div>
                                    ) : (
                                      <div className="text-[9px] text-amber-600 dark:text-amber-400 mt-0.5 italic">
                                        {isRtl ? 'لم يتم التعيين' : 'Not assigned'}
                                      </div>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      window.dispatchEvent(new CustomEvent('navigate_tab', { 
                                        detail: { tab: 'settings', settingsTab: 'permissions', selectedCompanyId: myCompanyId } 
                                      }));
                                    }}
                                    className="px-2 py-0.5 rounded bg-indigo-600/10 hover:bg-indigo-600 text-indigo-600 hover:text-white dark:text-indigo-400 dark:hover:text-white text-[9px] font-bold transition-all shrink-0 cursor-pointer"
                                  >
                                    {isRtl ? 'إدارة' : 'Manage'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Direct Branches */}
            {stations.filter(s => !s.region_id).length > 0 && (
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-slate-100/50 dark:bg-slate-900/10 space-y-3">
                <div className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                  {isRtl ? '🔗 فروع ومحطات مباشرة (بدون قطاع جغرافي)' : '🔗 Direct Branches (Unassigned to any Region)'}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {stations.filter(s => !s.region_id).map(stn => {
                    const stnUser = users.find(u => u.station_id === stn.id && u.role === 'StationAdmin');
                    return (
                      <div 
                        key={stn.id}
                        className="p-3.5 rounded-xl border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col gap-2.5 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-xs text-slate-800 dark:text-white flex items-center gap-1.5">
                              <span className={`h-1.5 w-1.5 rounded-full ${stn.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                              <span>{stn.station_name}</span>
                            </div>
                            <div className="text-[9px] text-slate-400 font-mono mt-0.5">
                              Code: {stn.station_code} | {isRtl ? 'العهدة الكلية:' : 'Custody:'} <span className="font-bold text-indigo-600 dark:text-indigo-400">{CustodyDB.getStationDeductedCustody(stn.id).toLocaleString()} EGP</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setStructEditingStation(stn);
                                setStructStnName(stn.station_name);
                                setStructStnCode(stn.station_code);
                                setStructStnCustody(String(stn.custody_amount));
                                setStructStnRegionId('none');
                                setShowStructStationModal(true);
                              }}
                              className="p-1 rounded hover:bg-indigo-50 dark:hover:bg-slate-850 text-indigo-600 dark:text-indigo-400 cursor-pointer"
                            >
                              <Edit size={12} />
                            </button>
                            <button
                              onClick={() => handleStructDeleteStation(stn.id)}
                              className="p-1 rounded hover:bg-rose-50 dark:hover:bg-slate-850 text-rose-500 cursor-pointer"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-850/60 flex items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1 text-[9px] font-bold text-slate-450 dark:text-slate-550">
                              <KeyRound size={9} />
                              <span>{isRtl ? 'حساب مسؤول الفرع' : 'Branch Manager Account'}</span>
                            </div>
                            {stnUser ? (
                              <div className="text-[9px] text-slate-600 dark:text-slate-300 font-mono mt-0.5">
                                <span className="font-bold text-slate-400 mr-1">{isRtl ? 'البريد:' : 'Email:'}</span>{stnUser.email}
                              </div>
                            ) : (
                              <div className="text-[9px] text-amber-600 dark:text-amber-400 mt-0.5 italic">
                                {isRtl ? 'لم يتم التعيين' : 'Not assigned'}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              window.dispatchEvent(new CustomEvent('navigate_tab', { 
                                detail: { tab: 'settings', settingsTab: 'permissions', selectedCompanyId: myCompanyId } 
                              }));
                            }}
                            className="px-2 py-0.5 rounded bg-indigo-600/10 hover:bg-indigo-600 text-indigo-600 hover:text-white dark:text-indigo-400 dark:hover:text-white text-[9px] font-bold transition-all shrink-0 cursor-pointer"
                          >
                            {isRtl ? 'إدارة' : 'Manage'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'operations' && (
        <div className="space-y-6 animate-fade-in">
          {/* Operations Overview banner */}
          <div className="p-4.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-800 dark:text-indigo-300 flex items-start gap-3">
            <Activity size={20} className="text-indigo-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-bold uppercase tracking-wider">{isRtl ? 'مراجعة وتدقيق حركات وعمليات فروع الشركة' : 'Company Scoped Financial Audit Ledger'}</h4>
              <p className="text-[11px] leading-relaxed">
                {isRtl 
                  ? 'شاشة التحكم المركزية لمراجعة كافة الحركات والعمليات المالية والعهدية لفروع شركتك فقط. يمكنك تعديل أو حذف أي حركة (معلقة، تحت التسوية، مسواة، أو شحن واستعاضة عهد) مع تحديث الأثر المالي فوراً وبشكل متكامل.'
                  : 'Central console to audit and modify any cash ledger activity or replenishment within your corporate tenant. Modifying or deleting records will automatically recalculate custody metrics in real-time.'}
              </p>
            </div>
          </div>

          {/* Filtering Console */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Region Filter */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'القطاع / المنطقة' : 'Region'}</label>
                <select
                  value={opRegionFilter}
                  onChange={(e) => {
                    setOpRegionFilter(e.target.value);
                    setOpStationFilter('all');
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 font-semibold"
                >
                  <option value="all">{isRtl ? 'كل القطاعات والمناطق' : 'All Regions'}</option>
                  {regions.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              {/* Station Filter */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'الفرع / المحطة' : 'Station'}</label>
                <select
                  value={opStationFilter}
                  onChange={(e) => setOpStationFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 font-semibold"
                >
                  <option value="all">{isRtl ? 'كل المحطات والفروع' : 'All Stations'}</option>
                  {(opRegionFilter === 'all' ? stations : stations.filter(s => s.region_id === opRegionFilter)).map(s => (
                    <option key={s.id} value={s.id}>{s.station_name} ({s.station_code})</option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'نوع وحالة الحركة' : 'Status'}</label>
                <select
                  value={opStatusFilter}
                  onChange={(e) => setOpStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 font-semibold"
                >
                  <option value="all">{isRtl ? 'كل الحركات' : 'All Operations'}</option>
                  <option value="Pending">{isRtl ? 'معلقة (Pending)' : 'Pending Expenses'}</option>
                  <option value="Under Settlement">{isRtl ? 'تحت التسوية (Under Settlement)' : 'Under Settlement'}</option>
                  <option value="Settled">{isRtl ? 'تمت تسويتها (Settled)' : 'Fully Settled'}</option>
                  <option value="Replenishment">{isRtl ? 'استعاضة عهدة (Replenishment)' : 'Custody Replenishments'}</option>
                  <option value="Deleted">{isRtl ? 'محذوفة (Deleted)' : 'Deleted Operations'}</option>
                </select>
              </div>

              {/* Instant Search */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'البحث السريع' : 'Search'}</label>
                <div className="relative">
                  <span className="absolute inset-y-0 right-3 flex items-center text-slate-400">
                    <Search size={14} />
                  </span>
                  <input
                    type="text"
                    placeholder={isRtl ? 'ابحث بالبيان، رقم القيد...' : 'Search details, amount, ref...'}
                    value={opSearchQuery}
                    onChange={(e) => setOpSearchQuery(e.target.value)}
                    className="w-full pl-3 pr-9 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Master Operations Ledger */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto w-full">
              <table className="w-full min-w-[900px] border-collapse text-xs text-right" dir={isRtl ? 'rtl' : 'ltr'}>
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold p-3">
                    <th className="p-3 text-start">{isRtl ? 'رقم الحركة' : 'Ref No'}</th>
                    <th className="p-3 text-start">{isRtl ? 'التاريخ' : 'Date'}</th>
                    <th className="p-3 text-start">{isRtl ? 'الفرع والقطاع' : 'Region & Branch'}</th>
                    <th className="p-3 text-start">{isRtl ? 'بيان وتفاصيل العملية' : 'Details & Description'}</th>
                    <th className="p-3 text-start">{isRtl ? 'المبلغ' : 'Amount'}</th>
                    <th className="p-3 text-center">{isRtl ? 'حالة الحركة' : 'Status'}</th>
                    <th className="p-3 text-start">{isRtl ? 'بواسطة' : 'Created By'}</th>
                    <th className="p-3 text-center">{isRtl ? 'الإجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                  {filteredOperations.map(op => {
                    const st = stations.find(s => s.id === op.station_id);
                    const reg = regions.find(r => r.id === st?.region_id);
                    
                    return (
                      <tr key={op.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-all">
                        <td className="p-3 font-mono font-bold text-slate-500 text-start">{op.refNo}</td>
                        <td className="p-3 text-slate-500 whitespace-nowrap text-start">
                          {new Date(op.date).toLocaleDateString(isRtl ? 'ar-EG' : 'en-US', {
                            year: 'numeric',
                            month: 'numeric',
                            day: 'numeric'
                          })}
                        </td>
                        <td className="p-3 text-start">
                          <div className="font-bold text-slate-900 dark:text-white">{st ? st.station_name : (isRtl ? 'مباشر - بدون محطة' : 'Direct Link')}</div>
                          <div className="text-[10px] text-slate-400 font-semibold">{reg ? reg.name : (isRtl ? 'غير مصنف تحت إقليم' : 'Unassigned region')}</div>
                        </td>
                        <td className="p-3 text-start max-w-xs truncate">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">{op.description}</div>
                          {op.notes && <div className="text-[10px] text-slate-400 font-mono italic">{op.notes}</div>}
                        </td>
                        <td className="p-3 font-mono font-bold text-start text-sm text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                          {op.amount.toLocaleString()} EGP
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          {op.type === 'replenishment' ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center gap-1 w-max mx-auto border border-cyan-500/20">
                              <RefreshCw size={11} className="animate-spin-slow animate-spin shrink-0" />
                              <span>{isRtl ? 'استعاضة عهدة' : 'Replenished'}</span>
                            </span>
                          ) : op.status === 'Pending' ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1 w-max mx-auto border border-amber-500/20">
                              <span>●</span>
                              <span>{isRtl ? 'معلقة' : 'Pending'}</span>
                            </span>
                          ) : op.status === 'Under Settlement' ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center gap-1 w-max mx-auto border border-indigo-500/20">
                              <span>●</span>
                              <span>{isRtl ? 'تحت التسوية' : 'Under Settlement'}</span>
                            </span>
                          ) : op.status === 'Settled' ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1 w-max mx-auto border border-emerald-500/20">
                              <CheckCircle2 size={11} className="shrink-0" />
                              <span>{isRtl ? 'مسواة نهائياً' : 'Fully Settled'}</span>
                            </span>
                          ) : op.status === 'Deleted' ? (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center gap-1 w-max mx-auto border border-rose-500/20">
                              <span>●</span>
                              <span>{isRtl ? 'محذوفة' : 'Deleted'}</span>
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-500/10 text-slate-500 flex items-center justify-center gap-1 w-max mx-auto border border-slate-500/20">
                              <span>{op.status}</span>
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-slate-500 whitespace-nowrap text-start">
                          <div className="font-semibold">{op.created_by}</div>
                        </td>
                        <td className="p-3 text-center whitespace-nowrap">
                          {op.status === 'Settled' ? (
                            <span className="text-xs text-slate-400 font-medium flex items-center justify-center gap-1 bg-slate-100 dark:bg-slate-800/40 px-2 py-1 rounded-md w-max mx-auto">
                              <Lock size={12} className="text-slate-400 shrink-0" />
                              <span>{isRtl ? 'حركة مغلقة' : 'Locked'}</span>
                            </span>
                          ) : op.status !== 'Deleted' ? (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => {
                                  setEditingOp(op);
                                  if (op.type === 'transaction') {
                                    setOpEditAmount(op.amount.toString());
                                    setOpEditDate(op.date);
                                    setOpEditDescription(op.description);
                                    setOpEditStatus(op.status);
                                    setOpEditNotes(op.notes);
                                  } else {
                                    setOpEditReplenishAmount(op.amount.toString());
                                    setOpEditReplenishNotes(op.notes);
                                  }
                                  setShowOpEditModal(true);
                                }}
                                className="p-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg text-indigo-600 dark:text-indigo-400 transition-colors cursor-pointer"
                                title={isRtl ? 'تعديل الحركة والأثر المالي' : 'Edit transaction details'}
                              >
                                <Edit size={14} />
                              </button>
                              <button
                                onClick={() => {
                                  setDeletingOp(op);
                                  setOpDeleteReason('');
                                  setShowOpDeleteModal(true);
                                }}
                                className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg text-rose-500 transition-colors cursor-pointer"
                                title={isRtl ? 'حذف الحركة والتدقيق المالي' : 'Delete transaction and reverse ledger'}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={async () => {
                                const success = await CustodyDB.restoreTransaction(op.id);
                                if (success) {
                                  showStructToast(isRtl ? 'تم استرجاع العملية بنجاح وإعادة تطبيق أثرها المالي!' : 'Transaction restored successfully and financial impact applied!');
                                  loadData();
                                } else {
                                  showStructToast(isRtl ? 'فشل استرجاع العملية.' : 'Failed to restore transaction.');
                                }
                              }}
                              className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40 rounded-lg text-emerald-600 dark:text-emerald-400 transition-colors cursor-pointer flex items-center gap-1 mx-auto border border-emerald-500/20 text-xs font-bold"
                              title={isRtl ? 'استرجاع الحركة والأثر المالي' : 'Restore transaction and financial impact'}
                            >
                              <RotateCcw size={12} />
                              <span>{isRtl ? 'استرجاع' : 'Restore'}</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredOperations.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-slate-400">
                        <Activity size={32} className="mx-auto mb-3 text-slate-300 dark:text-slate-700 animate-pulse" />
                        <div className="font-bold">{isRtl ? 'لم يتم العثور على أي عمليات مطابقة للفلاتر.' : 'No operations matching active filters.'}</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODALS */}
      {/* 1. Add/Edit Region Modal */}
      {showStructRegionModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl relative animate-scale-up">
            <button
              onClick={() => setShowStructRegionModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X size={16} />
            </button>
            <h3 className="text-sm md:text-base font-bold text-slate-800 dark:text-white mb-4">
              {structEditingRegion 
                ? (isRtl ? 'تعديل اسم الإقليم/المنطقة' : 'Edit Region') 
                : (isRtl ? 'إضافة إقليم/منطقة جغرافية جديدة' : 'Add New Region')}
            </h3>
            <form onSubmit={handleStructAddRegion} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'اسم المنطقة' : 'Region Name'}</label>
                <input
                  type="text"
                  required
                  placeholder={isRtl ? 'مثال: المنطقة الغربية، قطاع القاهرة...' : 'e.g. Western Region, Cairo Sector...'}
                  value={structRegName}
                  onChange={(e) => setStructRegName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-semibold"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowStructRegionModal(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-850 text-slate-600 dark:text-slate-350 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all cursor-pointer"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingStruct}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  {isSubmittingStruct ? (isRtl ? 'جاري الحفظ...' : 'Saving...') : (isRtl ? 'حفظ البيانات' : 'Save Region')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Add/Edit Station Modal */}
      {showStructStationModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl relative animate-scale-up">
            <button
              onClick={() => setShowStructStationModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X size={16} />
            </button>
            <h3 className="text-sm md:text-base font-bold text-slate-800 dark:text-white mb-4">
              {structEditingStation 
                ? (isRtl ? 'تعديل بيانات المحطة/الفرع' : 'Edit Branch') 
                : (isRtl ? 'إضافة فرع أو محطة عهدة جديدة' : 'Add New Branch')}
            </h3>
            <form onSubmit={handleStructAddStation} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'اسم الفرع/المحطة' : 'Branch Name'}</label>
                <input
                  type="text"
                  required
                  placeholder={isRtl ? 'مثال: محطة أكتوبر 1، فرع الدقي...' : 'e.g. October Station 1, Dokki Branch...'}
                  value={structStnName}
                  onChange={(e) => setStructStnName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'كود مركز الكلفة' : 'Cost Center Code'}</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. OCT-01"
                    value={structStnCode}
                    onChange={(e) => setStructStnCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'مبلغ العهدة الكلي' : 'Nominal Custody (EGP)'}</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="e.g. 50000"
                    value={structStnCustody}
                    onChange={(e) => setStructStnCustody(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'القطاع الجغرافي / المنطقة التابع له' : 'Parent Region'}</label>
                <select
                  value={structStnRegionId}
                  onChange={(e) => setStructStnRegionId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-semibold"
                >
                  <option value="none">{isRtl ? 'مباشر - بدون قطاع/منطقة' : 'Direct - No Region'}</option>
                  {regions.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowStructStationModal(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-850 text-slate-600 dark:text-slate-350 rounded-xl text-xs font-bold hover:bg-slate-200 transition-all cursor-pointer"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingStruct}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  {isSubmittingStruct ? (isRtl ? 'جاري الحفظ...' : 'Saving...') : (isRtl ? 'حفظ البيانات' : 'Save Branch')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Operations Edit Modal */}
      {showOpEditModal && editingOp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl relative animate-scale-up">
            <button
              onClick={() => {
                setShowOpEditModal(false);
                setEditingOp(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X size={16} />
            </button>

            <h3 className="text-sm md:text-base font-bold text-slate-800 dark:text-white mb-4">
              {editingOp.type === 'transaction' 
                ? (isRtl ? `تعديل الحركة المالية: ${editingOp.refNo}` : `Edit Operation: ${editingOp.refNo}`)
                : (isRtl ? `تعديل استعاضة العهدة: ${editingOp.refNo}` : `Edit Replenishment: ${editingOp.refNo}`)}
            </h3>

            {editingOp.type === 'transaction' ? (
              <form onSubmit={handleEditTransactionSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'المبلغ' : 'Amount (EGP)'}</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={opEditAmount}
                      onChange={(e) => setOpEditAmount(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'التاريخ' : 'Date'}</label>
                    <input
                      type="date"
                      required
                      value={opEditDate.split('T')[0]}
                      onChange={(e) => setOpEditDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'البيان وتفاصيل العملية' : 'Description'}</label>
                  <input
                    type="text"
                    required
                    value={opEditDescription}
                    onChange={(e) => setOpEditDescription(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 font-semibold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'حالة الحركة' : 'Status'}</label>
                    <select
                      value={opEditStatus}
                      onChange={(e) => setOpEditStatus(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 font-semibold"
                    >
                      <option value="Pending">{isRtl ? 'معلقة (Pending)' : 'Pending'}</option>
                      <option value="Under Settlement">{isRtl ? 'تحت التسوية (Under Settlement)' : 'Under Settlement'}</option>
                      <option value="Settled">{isRtl ? 'مسواة نهائياً (Settled)' : 'Fully Settled'}</option>
                      <option value="Rejected">{isRtl ? 'مرفوضة نهائياً (Rejected)' : 'Permanently Rejected'}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'رقم الكود / ملاحظات' : 'Voucher/Notes'}</label>
                    <input
                      type="text"
                      value={opEditNotes}
                      onChange={(e) => setOpEditNotes(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 font-semibold"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowOpEditModal(false);
                      setEditingOp(null);
                    }}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-850 text-slate-600 dark:text-slate-350 rounded-xl text-xs font-bold hover:bg-slate-200 cursor-pointer"
                  >
                    {isRtl ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                  >
                    {isRtl ? 'حفظ التعديلات' : 'Save Changes'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleEditReplenishmentSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'مبلغ الاستعاضة العهدية الجديد' : 'New Replenishment Amount (EGP)'}</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={opEditReplenishAmount}
                    onChange={(e) => setOpEditReplenishAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'ملاحظات وتفاصيل' : 'Notes/Details'}</label>
                  <input
                    type="text"
                    value={opEditReplenishNotes}
                    onChange={(e) => setOpEditReplenishNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 font-semibold"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowOpEditModal(false);
                      setEditingOp(null);
                    }}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-850 text-slate-600 dark:text-slate-350 rounded-xl text-xs font-bold hover:bg-slate-200 cursor-pointer"
                  >
                    {isRtl ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                  >
                    {isRtl ? 'تحديث مبلغ الاستعاضة' : 'Save Replenishment'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 4. Operations Delete Modal */}
      {showOpDeleteModal && deletingOp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-md w-full border border-rose-500/20 dark:border-rose-950/20 shadow-2xl relative animate-scale-up">
            <button
              onClick={() => {
                setShowOpDeleteModal(false);
                setDeletingOp(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <AlertTriangle size={24} className="shrink-0 animate-bounce-subtle" />
              <h3 className="text-sm md:text-base font-bold">{isRtl ? 'حذف وتراجع مالي عكسي' : 'Destructive Rollback Action'}</h3>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              {isRtl 
                ? `أنت على وشك حذف الحركة المالية المعرفة بالرمز (${deletingOp.refNo}) وقيمتها (${deletingOp.amount.toLocaleString()} EGP). سيقوم النظام بعكس الأثر المالي وتعديل العهد النقدية تلقائياً. هذه العملية نهائية وتتطلب تبريراً رقابياً.` 
                : `You are permanently deleting transaction ${deletingOp.refNo} of amount ${deletingOp.amount.toLocaleString()} EGP. This rollback will automatically reverse corresponding ledger balances. Deletion reason is required for security auditing.`}
            </p>

            <form onSubmit={handleDeleteOpSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'سبب الإلغاء والحذف الرقابي' : 'Audit Deletion Reason'}</label>
                <input
                  type="text"
                  required
                  placeholder={isRtl ? 'مثال: إدخال مكرر، خطأ في الفاتورة المرفقة...' : 'e.g. Duplicate entry, receipt scan failure...'}
                  value={opDeleteReason}
                  onChange={(e) => setOpDeleteReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-rose-300 dark:border-rose-950 text-xs focus:ring-2 focus:ring-rose-500/20 dark:bg-slate-950 font-semibold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowOpDeleteModal(false);
                    setDeletingOp(null);
                  }}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-850 text-slate-600 dark:text-slate-350 rounded-xl text-xs font-bold hover:bg-slate-200 cursor-pointer"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                >
                  {isRtl ? 'تأكيد الحذف النهائي' : 'Confirm Rollback'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
