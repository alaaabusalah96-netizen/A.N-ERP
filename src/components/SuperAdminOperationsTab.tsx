import React, { useState, useMemo, useEffect } from 'react';
import {
  Activity,
  Search,
  RefreshCw,
  CheckCircle2,
  Lock,
  Edit,
  Trash2,
  RotateCcw,
  AlertTriangle
} from 'lucide-react';
import {
  Company,
  Region,
  Station,
  Transaction,
  ActivityLog,
  DeletedTransaction,
  TransactionStatus,
  Language
} from '../types';
import { CustodyDB } from '../db';

interface SuperAdminOperationsTabProps {
  isRtl: boolean;
  language: Language;
  companies: Company[];
  regions: Region[];
  stations: Station[];
  showStructToast: (msg: string) => void;
  onDataRefresh?: () => void;
}

export const SuperAdminOperationsTab: React.FC<SuperAdminOperationsTabProps> = ({
  isRtl,
  language,
  companies,
  regions,
  stations,
  showStructToast,
  onDataRefresh
}) => {
  // Operations Management Tab State
  const [allTransactions, setAllTransactions] = useState<Transaction[]>(() => CustodyDB.getTransactions());
  const [allLogs, setAllLogs] = useState<ActivityLog[]>(() => CustodyDB.getLogs());
  const [allDeletedTransactions, setAllDeletedTransactions] = useState<DeletedTransaction[]>(() => CustodyDB.getDeletedTransactions());

  const [opCompanyFilter, setOpCompanyFilter] = useState<string>('all');
  const [opRegionFilter, setOpRegionFilter] = useState<string>('all');
  const [opStationFilter, setOpStationFilter] = useState<string>('all');
  const [opStatusFilter, setOpStatusFilter] = useState<string>('all');
  const [opSearchQuery, setOpSearchQuery] = useState<string>('');

  // Selected item for edit or delete
  const [editingOp, setEditingOp] = useState<any>(null);
  const [deletingOp, setDeletingOp] = useState<any>(null);
  const [opDeleteReason, setOpDeleteReason] = useState<string>('');

  // Modal visibility
  const [showOpEditModal, setShowOpEditModal] = useState(false);
  const [showOpDeleteModal, setShowOpDeleteModal] = useState(false);

  // Fields for Editing Transaction
  const [opEditAmount, setOpEditAmount] = useState<string>('');
  const [opEditDate, setOpEditDate] = useState<string>('');
  const [opEditDescription, setOpEditDescription] = useState<string>('');
  const [opEditStatus, setOpEditStatus] = useState<TransactionStatus>('Pending');
  const [opEditNotes, setOpEditNotes] = useState<string>('');

  // Fields for Editing Replenishment
  const [opEditReplenishAmount, setOpEditReplenishAmount] = useState<string>('');
  const [opEditReplenishNotes, setOpEditReplenishNotes] = useState<string>('');

  const refreshOperationsData = () => {
    setAllTransactions(CustodyDB.getTransactions());
    setAllLogs(CustodyDB.getLogs());
    setAllDeletedTransactions(CustodyDB.getDeletedTransactions());
    if (onDataRefresh) {
      onDataRefresh();
    }
  };

  useEffect(() => {
    const handleUpdate = () => refreshOperationsData();
    window.addEventListener('custody_db_updated', handleUpdate);
    return () => {
      window.removeEventListener('custody_db_updated', handleUpdate);
    };
  }, []);

  // Parser for old text logs or structured replenishment logs
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
        company_id: del.company_id || del.transaction_data?.company_id || '',
        original: del.transaction_data || del
      }));

    const replenishmentOps = allLogs
      .filter(l => l.action === 'Custody Replenishment')
      .map(log => {
        const { amount, stationId } = parseReplenishmentLog(log);
        const st = stations.find(s => s.id === stationId);
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
          company_id: st?.company_id || log.company_id,
          original: log
        };
      });

    return [...txOps, ...legacyDeletedOps, ...replenishmentOps].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allTransactions, allLogs, allDeletedTransactions, stations, language]);

  const opFilteredRegions = useMemo(() => {
    if (opCompanyFilter === 'all') return regions;
    return regions.filter(r => r.company_id === opCompanyFilter);
  }, [regions, opCompanyFilter]);

  const opFilteredStations = useMemo(() => {
    let list = stations;
    if (opCompanyFilter !== 'all') {
      list = list.filter(s => s.company_id === opCompanyFilter);
    }
    if (opRegionFilter !== 'all') {
      list = list.filter(s => s.region_id === opRegionFilter);
    }
    return list;
  }, [stations, opCompanyFilter, opRegionFilter]);

  const filteredOperations = useMemo(() => {
    return compiledOperations.filter(op => {
      if (opCompanyFilter !== 'all' && op.company_id !== opCompanyFilter) return false;
      if (opRegionFilter !== 'all') {
        const st = stations.find(s => s.id === op.station_id);
        if (!st || st.region_id !== opRegionFilter) return false;
      }
      if (opStationFilter !== 'all' && op.station_id !== opStationFilter) return false;
      
      if (opStatusFilter !== 'all') {
        if (opStatusFilter === 'Replenishment' && op.type !== 'replenishment') return false;
        if (opStatusFilter !== 'Replenishment') {
          if (op.type !== 'transaction' || op.status !== opStatusFilter) return false;
        }
      }

      if (opSearchQuery.trim()) {
        const q = opSearchQuery.toLowerCase();
        const desc = (op.description || '').toLowerCase();
        const ref = (op.refNo || '').toLowerCase();
        const createdBy = (op.created_by || '').toLowerCase();
        const notes = (op.notes || '').toLowerCase();
        const amountStr = op.amount.toString();
        
        if (!desc.includes(q) && !ref.includes(q) && !createdBy.includes(q) && !notes.includes(q) && !amountStr.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [compiledOperations, opCompanyFilter, opRegionFilter, opStationFilter, opStatusFilter, opSearchQuery, stations]);

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
      'super-admin',
      'System Admin',
      'Transaction Updated By SuperAdmin',
      `SuperAdmin updated transaction ${editingOp.refNo}: amount ${editingOp.amount} -> ${amountVal}, status ${editingOp.status} -> ${opEditStatus}.`
    );

    showStructToast(isRtl ? 'تم تعديل الحركة بنجاح وتحديث الأثر المالي!' : 'Transaction updated successfully and financial impact applied!');
    setShowOpEditModal(false);
    setEditingOp(null);
    refreshOperationsData();
  };

  const handleEditReplenishmentSubmit = (e: React.FormEvent) => {
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

    const diff = newAmount - oldAmount;
    const nextCustody = station.custody_amount + diff;

    CustodyDB.updateStation(stationId, {
      custody_amount: nextCustody
    });

    const detailsMsg = `Replenished custody balance of ${station.station_name} with +${newAmount.toLocaleString()} EGP (Total custody updated). Notes: ${opEditReplenishNotes || '-'}`;
    CustodyDB.updateReplenishmentLog(editingOp.id, newAmount, opEditReplenishNotes, detailsMsg);

    CustodyDB.addLog(
      'super-admin',
      'System Admin',
      'Replenishment Updated By SuperAdmin',
      `SuperAdmin updated replenishment for ${station.station_name}: amount ${oldAmount} -> ${newAmount}. Notes: ${opEditReplenishNotes || '-'}`
    );

    showStructToast(isRtl ? 'تم تعديل مبلغ الاستعاضة وتحديث قيمة العهدة للمحطة بنجاح!' : 'Replenishment updated successfully and nominal custody adjusted!');
    setShowOpEditModal(false);
    setEditingOp(null);
    refreshOperationsData();
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
          'super-admin',
          'System Admin',
          'Transaction Deleted By SuperAdmin',
          `SuperAdmin deleted transaction ${deletingOp.refNo} (${deletingOp.amount} EGP). Reason: ${opDeleteReason}`
        );
        showStructToast(isRtl ? 'تم حذف الحركة بنجاح وتحديث الأثر المالي!' : 'Transaction deleted successfully and financial impact applied!');
      } else {
        alert(isRtl ? 'حدث خطأ أثناء الحذف' : 'An error occurred while deleting.');
      }
    } else {
      // Replenishment deletion
      const { amount, stationId } = parseReplenishmentLog(deletingOp.original);
      if (!stationId) {
        alert(isRtl ? 'تعذر العثور على المحطة المقترنة بالعملية' : 'Could not locate the station associated with this replenishment.');
        return;
      }

      const station = stations.find(s => s.id === stationId);
      if (!station) {
        alert(isRtl ? 'المحطة غير موجودة' : 'Station not found.');
      } else {
        const nextCustody = Math.max(0, station.custody_amount - amount);
        CustodyDB.updateStation(stationId, {
          custody_amount: nextCustody
        });
      }

      CustodyDB.deleteLog(deletingOp.id);
      CustodyDB.addLog(
        'super-admin',
        'System Admin',
        'Replenishment Deleted By SuperAdmin',
        `SuperAdmin deleted replenishment (${amount} EGP). Reason: ${opDeleteReason}`
      );

      showStructToast(isRtl ? 'تم حذف استعاضة العهدة وخصم القيمة من العهدة الاسمية بنجاح!' : 'Replenishment deleted and nominal custody adjusted!');
    }

    setShowOpDeleteModal(false);
    setDeletingOp(null);
    refreshOperationsData();
  };

  return (
    <div className="space-y-6">
      {/* Operations Overview banner */}
      <div className="p-4.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-800 dark:text-indigo-300 flex items-start gap-3">
        <Activity size={20} className="text-indigo-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="text-xs font-bold uppercase tracking-wider">{isRtl ? 'إدارة العمليات والتدقيق المالي الشامل' : 'Internal Operations & Financial Audit Ledger'}</h4>
          <p className="text-[11px] leading-relaxed">
            {isRtl 
              ? 'شاشة التحكم المركزية لمراجعة كافة الحركات والعمليات المالية والعهدية على مستوى كافة الشركات. يمكنك تعديل أو حذف أي حركة (معلقة، تحت التسوية، مسواة، أو شحن واستعاضة عهد) مع إعادة تفعيل واحتساب الأثر المالي فوراً وبشكل متكامل.'
              : 'Central console to audit and modify any cash ledger activity or replenishment across all corporate tenants. Modifying or deleting records will automatically recalculate cash disponible, nominal custody, and corresponding vouchers in real-time.'}
          </p>
        </div>
      </div>

      {/* Filtering Console */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Company Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'الشركة' : 'Company'}</label>
            <select
              value={opCompanyFilter}
              onChange={(e) => {
                setOpCompanyFilter(e.target.value);
                setOpRegionFilter('all');
                setOpStationFilter('all');
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 font-semibold"
            >
              <option value="all">{isRtl ? 'كل الشركات' : 'All Companies'}</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Region Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'القطاع / المنطقة' : 'Region / Sector'}</label>
            <select
              value={opRegionFilter}
              onChange={(e) => {
                setOpRegionFilter(e.target.value);
                setOpStationFilter('all');
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 font-semibold"
            >
              <option value="all">{isRtl ? 'كل المناطق' : 'All Regions'}</option>
              {opFilteredRegions.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          {/* Station Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'الفرع / المحطة' : 'Branch / Station'}</label>
            <select
              value={opStationFilter}
              onChange={(e) => setOpStationFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 font-semibold"
            >
              <option value="all">{isRtl ? 'كل الفروع والمحطات' : 'All Branches/Stations'}</option>
              {opFilteredStations.map(s => (
                <option key={s.id} value={s.id}>{s.station_name} ({s.station_code})</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'نوع وحالة الحركة' : 'Operation Status'}</label>
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
                <th className="p-3 text-start">{isRtl ? 'المنشأة والفرع' : 'Entity & Branch'}</th>
                <th className="p-3 text-start">{isRtl ? 'بيان وتفاصيل العملية' : 'Details & Description'}</th>
                <th className="p-3 text-start">{isRtl ? 'المبلغ' : 'Amount'}</th>
                <th className="p-3 text-center">{isRtl ? 'حالة الحركة' : 'Status'}</th>
                <th className="p-3 text-start">{isRtl ? 'بواسطة' : 'Created By'}</th>
                <th className="p-3 text-center">{isRtl ? 'الإجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
              {filteredOperations.map(op => {
                const comp = companies.find(c => c.id === op.company_id);
                const st = stations.find(s => s.id === op.station_id);
                
                return (
                  <tr key={op.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-all">
                    {/* Ref No */}
                    <td className="p-3 font-mono font-bold text-slate-500 text-start">{op.refNo}</td>
                    
                    {/* Date */}
                    <td className="p-3 text-slate-500 whitespace-nowrap text-start">
                      {new Date(op.date).toLocaleDateString(isRtl ? 'ar-EG' : 'en-US', {
                        year: 'numeric',
                        month: 'numeric',
                        day: 'numeric'
                      })}
                    </td>

                    {/* Entity & Branch */}
                    <td className="p-3 text-start">
                      <div className="font-bold text-slate-900 dark:text-white">{comp?.name || isRtl ? 'منصة عامة' : 'Global Platform'}</div>
                      <div className="text-[10px] text-slate-400 font-semibold">{st ? `${st.station_name} (${st.station_code})` : (isRtl ? 'مباشر - بدون محطة' : 'Direct Link')}</div>
                    </td>

                    {/* Description */}
                    <td className="p-3 text-start max-w-xs truncate">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{op.description}</div>
                      {op.notes && <div className="text-[10px] text-slate-400 font-mono italic">{op.notes}</div>}
                    </td>

                    {/* Amount */}
                    <td className="p-3 font-mono font-bold text-start text-sm text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                      {op.amount.toLocaleString()} EGP
                    </td>

                    {/* Status */}
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

                    {/* Created By */}
                    <td className="p-3 text-slate-500 whitespace-nowrap text-start">
                      <div className="font-semibold">{op.created_by}</div>
                    </td>

                    {/* Actions */}
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
                              refreshOperationsData();
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
                    <div className="text-[11px] text-slate-400 mt-1">{isRtl ? 'جرب تغيير خيارات الفلترة أو كتابة كلمة بحث مختلفة.' : 'Try adjusting the search criteria or filters above.'}</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 7: Edit Operation (Expense or Replenishment) */}
      {showOpEditModal && editingOp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => { setShowOpEditModal(false); setEditingOp(null); }} />
          <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl space-y-4 text-xs">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 text-indigo-600 dark:text-indigo-400">
              <Activity size={20} />
              <h3 className="text-sm font-bold">
                {isRtl 
                  ? `تعديل الحركة المالية: ${editingOp.refNo}`
                  : `Edit Operation: ${editingOp.refNo}`}
              </h3>
            </div>

            {editingOp.type === 'transaction' ? (
              <form onSubmit={handleEditTransactionSubmit} className="space-y-4 text-right" dir={isRtl ? 'rtl' : 'ltr'}>
                <div>
                  <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">{isRtl ? 'تاريخ الحركة' : 'Operation Date'}</label>
                  <input
                    type="date"
                    required
                    value={opEditDate}
                    onChange={(e) => setOpEditDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 focus:border-indigo-500 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">{isRtl ? 'المبلغ بالجنيه المصري (EGP)' : 'Amount (EGP)'}</label>
                  <input
                    type="number"
                    required
                    min={0.01}
                    step="any"
                    value={opEditAmount}
                    onChange={(e) => setOpEditAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 focus:border-indigo-500 font-mono text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">{isRtl ? 'البيان والوصف' : 'Description/Details'}</label>
                  <input
                    type="text"
                    required
                    value={opEditDescription}
                    onChange={(e) => setOpEditDescription(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 focus:border-indigo-500 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">{isRtl ? 'حالة الحركة' : 'Operation Status'}</label>
                  <select
                    value={opEditStatus}
                    onChange={(e) => setOpEditStatus(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 focus:border-indigo-500"
                  >
                    <option value="Pending">{isRtl ? 'معلقة (Pending)' : 'Pending'}</option>
                    <option value="Under Settlement">{isRtl ? 'تحت التسوية (Under Settlement)' : 'Under Settlement'}</option>
                    <option value="Settled">{isRtl ? 'تمت تسويتها (Settled)' : 'Fully Settled'}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">{isRtl ? 'ملاحظات إضافية' : 'Additional Notes / Check Reference'}</label>
                  <textarea
                    rows={3}
                    value={opEditNotes}
                    onChange={(e) => setOpEditNotes(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 focus:border-indigo-500 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => { setShowOpEditModal(false); setEditingOp(null); }}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all cursor-pointer"
                  >
                    {isRtl ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-md cursor-pointer"
                  >
                    {isRtl ? 'حفظ الأثر المالي والتعديل' : 'Save & Recalculate'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleEditReplenishmentSubmit} className="space-y-4 text-right" dir={isRtl ? 'rtl' : 'ltr'}>
                <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-800 dark:text-cyan-300">
                  <p className="text-[10px] leading-relaxed text-right">
                    {isRtl 
                      ? '⚠️ تنبيه: تعديل مبلغ الاستعاضة سيقوم تلقائياً بتعديل قيمة العهدة الاسمية للمحطة في النظام بمقدار الفارق.'
                      : '⚠️ Warning: Changing the replenishment amount will automatically adjust the nominal custody limit of the branch.'}
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">{isRtl ? 'مبلغ الاستعاضة والشحن (EGP)' : 'Replenishment Amount (EGP)'}</label>
                  <input
                    type="number"
                    required
                    min={0.01}
                    step="any"
                    value={opEditReplenishAmount}
                    onChange={(e) => setOpEditReplenishAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 focus:border-indigo-500 font-mono text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">{isRtl ? 'ملاحظات الاستعاضة والتحويل' : 'Transfer/Cheque Notes'}</label>
                  <textarea
                    rows={3}
                    value={opEditReplenishNotes}
                    onChange={(e) => setOpEditReplenishNotes(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 focus:border-indigo-500 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => { setShowOpEditModal(false); setEditingOp(null); }}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all cursor-pointer"
                  >
                    {isRtl ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-md cursor-pointer"
                  >
                    {isRtl ? 'حفظ وتعديل قيمة العهدة' : 'Save & Adjust Custody'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL 8: Delete Operation Confirm */}
      {showOpDeleteModal && deletingOp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => { setShowOpDeleteModal(false); setDeletingOp(null); }} />
          <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl space-y-4 text-xs">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 text-rose-500">
              <AlertTriangle size={20} className="animate-bounce" />
              <h3 className="text-sm font-bold">
                {isRtl 
                  ? `حذف نهائي وتراجع مالي: ${deletingOp.refNo}`
                  : `Irreversible Deletion: ${deletingOp.refNo}`}
              </h3>
            </div>

            <form onSubmit={handleDeleteOpSubmit} className="space-y-4 text-right" dir={isRtl ? 'rtl' : 'ltr'}>
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-300 space-y-1.5">
                <h4 className="font-bold text-[11px] uppercase tracking-wider">{isRtl ? 'تأثير مالي خطير وحرج' : 'Critical Financial Action'}</h4>
                <p className="text-[10px] leading-relaxed text-right">
                  {deletingOp.type === 'transaction'
                    ? (isRtl 
                        ? 'سيؤدي هذا الإجراء إلى حذف الحركة كلياً وإلغاء أثرها المالي وإرجاع قيمة المبلغ للخزينة الحالية للفرع والعهدة المستهلكة فوراً.'
                        : 'Deletes this transaction entirely, restoring the spent funds back to the station balance in real-time.')
                    : (isRtl 
                        ? 'سيؤدي حذف عملية الاستعاضة إلى إلغاء شحن رصيد العهدة للمحطة وخصم قيمة المبلغ من قيمة العهدة الاسمية الحالية فوراً في النظام.'
                        : 'Deletes this custody replenishment, instantly subtracting the amount from the branch custody limit.')}
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">{isRtl ? 'سبب الحذف والتدقيق (مطلوب)' : 'Auditable Reason for Deletion (Required)'}</label>
                <textarea
                  required
                  rows={3}
                  placeholder={isRtl ? 'مثال: إدخال مكرر للمصروف / إلغاء طلب الشحن من الإدارة المالية...' : 'e.g., Duplicate record entry / Reversed bank transfer...'}
                  value={opDeleteReason}
                  onChange={(e) => setOpDeleteReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 focus:border-indigo-500 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => { setShowOpDeleteModal(false); setDeletingOp(null); }}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all cursor-pointer"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition-all shadow-md cursor-pointer"
                >
                  {isRtl ? 'حذف وتحديث كافة الحسابات فوراً' : 'Confirm Deletion'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminOperationsTab;
