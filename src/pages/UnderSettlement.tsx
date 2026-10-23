import React, { useState, useEffect } from 'react';
import { CustodyDB } from '../db';
import { useScreenListeners } from '../firebase';
import { translations, Language, Theme, Transaction } from '../types';
import { 
  FileCheck, 
  Search, 
  CornerUpLeft, 
  CheckCircle, 
  Calendar, 
  Info, 
  Printer, 
  Trash2, 
  AlertTriangle,
  FileText,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  XCircle,
  X,
  Eye
} from 'lucide-react';
import VoucherModal from '../components/VoucherModal';

interface UnderSettlementProps {
  language: Language;
  theme: Theme;
  onNavigate: (tab: string) => void;
}

export default function UnderSettlement({ language, theme, onNavigate }: UnderSettlementProps) {
  useScreenListeners(['transactions', 'Expenses', 'CashVouchers']);

  const t = translations[language];
  const isRtl = language === 'ar';

  const user = CustodyDB.getActiveUser();
  const isAdmin = user && (user.role === 'Admin' || user.role === 'SystemAdmin');
  const isManager = user && (user.role === 'RegionalManager' || user.role === 'Admin' || user.role === 'SystemAdmin');

  // State
  const [transactions, setTransactions] = useState<Transaction[]>(() =>
    CustodyDB.getScopedTransactions()
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [printingTx, setPrintingTx] = useState<Transaction | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [revertingTx, setRevertingTx] = useState<Transaction | null>(null);
  const [rejectingTx, setRejectingTx] = useState<Transaction | null>(null);
  const [approvingTx, setApprovingTx] = useState<Transaction | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [readOnlyMode, setReadOnlyMode] = useState(false);

  // Toggle sections collapse
  const [underSettlementExpanded, setUnderSettlementExpanded] = useState(true);
  const [settledExpanded, setSettledExpanded] = useState(true);

  const refreshList = () => {
    setTransactions(CustodyDB.getScopedTransactions());
  };

  useEffect(() => {
    // Live update when Firebase/Firestore database updates
    window.addEventListener('custody_db_updated', refreshList);
    return () => {
      window.removeEventListener('custody_db_updated', refreshList);
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Delete Voucher/Transaction Handler
  const handleDelete = async (id: string) => {
    if (!deleteReason.trim()) {
      alert(isRtl ? 'يجب إدخال سبب الحذف الإجباري!' : 'Mandatory deletion reason is required!');
      return;
    }
    const success = await CustodyDB.deleteTransaction(id, deleteReason);
    if (success) {
      showToast(isRtl ? 'تم حذف مستند الصرف والحركة بالكامل بنجاح.' : 'Voucher and transaction deleted successfully.');
      refreshList();
      setDeletingId(null);
      setDeleteReason('');
    } else {
      setAuthError(isRtl ? 'عذراً، يحتاج الحذف إلى صلاحيات مدير النظام (Admin)' : 'Unauthorized: Deletion requires Admin permissions.');
      setDeletingId(null);
    }
  };

  // Revert settlement action for typo corrections (Return for modification)
  const handleRevert = async (tx: Transaction) => {
    if (!isManager) {
      setAuthError(isRtl ? 'عذراً، يحتاج هذا الإجراء إلى صلاحيات الإدارة أو مدير المنطقة.' : 'Unauthorized: Reverting requires Manager or Admin permissions.');
      setRevertingTx(null);
      return;
    }

    const res = await CustodyDB.updateTransaction(tx.id, {
      status: 'Pending'
    });
    if (!res.success) {
      alert(res.errors?.join(' \n ') || 'Failed to return transaction');
      return;
    }
    
    CustodyDB.addLog(
      user?.id || 'unknown',
      user?.full_name || 'Anonymous',
      'Return for Modification',
      `Returned transaction ${tx.transaction_no} (formerly voucher ${tx.voucher_no}) back to Pending status for modification.`
    );
    showToast(isRtl ? 'تم إرجاع الحركة للتعديل والمراجعة بنجاح.' : 'Returned to Pending status for modification.');
    refreshList();
    setRevertingTx(null);
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
    refreshList();
    setRejectingTx(null);
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
    refreshList();
    setApprovingTx(null);
  };

  // Un-approve / revert to under settlement
  const handleRevertApproval = async (tx: Transaction) => {
    if (!isAdmin) {
      setAuthError(isRtl ? 'عذراً، يحتاج هذا الإجراء إلى صلاحيات مدير النظام (Admin)' : 'Unauthorized: Reverting requires Admin permissions.');
      return;
    }

    const res = await CustodyDB.updateTransaction(tx.id, {
      status: 'Under Settlement'
    });
    if (!res.success) {
      alert(res.errors?.join(' \n ') || 'Failed to revert transaction approval');
      return;
    }

    CustodyDB.addLog(
      user?.id || 'unknown',
      user?.full_name || 'Anonymous',
      'Cancel Approval',
      `Cancelled approval for transaction ${tx.transaction_no}, returned to Under Settlement.`
    );
    showToast(isRtl ? 'تم إلغاء اعتماد السند وإعادته لمرحلة تحت التسوية.' : 'Approval cancelled. Reverted to under settlement.');
    refreshList();
  };

  // Filtered lists
  const filtered = transactions.filter(tx => {
    return (
      tx.voucher_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.transaction_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const underSettlementTxs = filtered.filter(tx => tx.status === 'Under Settlement');
  const settledTxs = filtered.filter(tx => tx.status === 'Settled');

  const totalUnderSettlementAmount = underSettlementTxs.reduce((sum, tx) => sum + tx.amount, 0);
  const totalSettledAmount = settledTxs.reduce((sum, tx) => sum + tx.amount, 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight md:text-2xl flex items-center gap-2">
            <FileCheck className="text-emerald-500" />
            <span>{isRtl ? 'مستندات الصرف واعتماد العهد' : 'Voucher Verification & Custody Settlement'}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isRtl 
              ? 'مراجعة واعتماد سندات الصرف الدورية. يقوم الإداري بتحميل السندات، ويعتمدها مدير المحطة، وللأدمن السيطرة الكاملة.' 
              : 'Review, approve, and settle periodic expense vouchers. Station Admins upload, Managers approve, Admins control.'
            }
          </p>
        </div>
      </div>

      {/* Success Toast Banner */}
      {toastMessage && (
        <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold animate-fade-in flex items-center gap-2">
          <CheckCircle size={14} className="text-emerald-500 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Stats Summary Block */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Count Under Settlement */}
        <div className={`p-4 rounded-xl border flex items-center justify-between ${
          theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div>
            <span className="text-slate-400 text-[10px] uppercase font-bold block">{isRtl ? 'تحت التسوية (بانتظار الاعتماد)' : 'Under Settlement'}</span>
            <span className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400">{underSettlementTxs.length} {isRtl ? 'سند' : 'Vouchers'}</span>
          </div>
          <FileText className="text-amber-500/20 h-7 w-7" />
        </div>

        {/* Amount Under Settlement */}
        <div className={`p-4 rounded-xl border flex items-center justify-between ${
          theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div>
            <span className="text-slate-400 text-[10px] uppercase font-bold block">{isRtl ? 'إجمالي بانتظار الاعتماد' : 'Total Pending Approval'}</span>
            <span className="text-sm font-bold font-mono text-amber-600 dark:text-amber-400">
              {totalUnderSettlementAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} EGP
            </span>
          </div>
          <AlertTriangle className="text-amber-500/20 h-7 w-7" />
        </div>

        {/* Count Fully Settled */}
        <div className={`p-4 rounded-xl border flex items-center justify-between ${
          theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div>
            <span className="text-slate-400 text-[10px] uppercase font-bold block">{isRtl ? 'معتمدة ومسواة نهائياً' : 'Fully Settled (Approved)'}</span>
            <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">{settledTxs.length} {isRtl ? 'حركة' : 'Approved'}</span>
          </div>
          <ShieldCheck className="text-emerald-500/20 h-7 w-7" />
        </div>

        {/* Amount Fully Settled */}
        <div className={`p-4 rounded-xl border flex items-center justify-between ${
          theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div>
            <span className="text-slate-400 text-[10px] uppercase font-bold block">{isRtl ? 'إجمالي المبالغ المسواة' : 'Total Settled & Deducted'}</span>
            <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {totalSettledAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} EGP
            </span>
          </div>
          <CheckCircle className="text-emerald-500/20 h-7 w-7" />
        </div>
      </div>

      {/* Search & Read-Only Toggle Container */}
      <div className={`p-4 rounded-xl border flex flex-col sm:flex-row gap-4 items-stretch sm:items-center ${
        theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200'
      }`}>
        <div className="flex-1 relative">
          <Search className={`absolute top-2.5 text-slate-400 h-4 w-4 ${isRtl ? 'right-3' : 'left-3'}`} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={isRtl ? 'ابحث برقم السند، رقم الحركة، البيان...' : 'Search by Voucher #, Transaction #, Description...'}
            className={`w-full text-xs py-2.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 ${
              isRtl ? 'pr-10 pl-3' : 'pl-10 pr-3'
            } ${
              theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200'
            }`}
          />
        </div>

        {/* Read Only Toggle Switch */}
        <div className="flex items-center justify-between sm:justify-start gap-4 px-4 py-2.5 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20 select-none">
          <div className="flex items-center gap-2">
            <Eye className={readOnlyMode ? "text-emerald-500 animate-pulse" : "text-slate-400"} size={16} />
            <div className="flex flex-col">
              <span className="text-[11px] font-black text-slate-700 dark:text-slate-200">
                {isRtl ? 'وضع العرض فقط (بدون تعديل)' : 'Read-Only Mode (View Only)'}
              </span>
              <span className="text-[9px] text-slate-400 font-medium">
                {isRtl ? 'إخفاء كافة أزرار الاعتماد والإجراءات' : 'Secure view with all actions hidden'}
              </span>
            </div>
          </div>
          
          <button
            type="button"
            onClick={() => setReadOnlyMode(!readOnlyMode)}
            className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
              readOnlyMode ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
            }`}
          >
            <span
              className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                readOnlyMode 
                  ? isRtl ? 'translate-x-1' : 'translate-x-6' 
                  : isRtl ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Warning/Explanation banner when Read Only is active */}
      {readOnlyMode && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-400 text-xs font-bold flex items-start gap-2.5 animate-fade-in">
          <Eye className="shrink-0 text-emerald-500 mt-0.5 animate-pulse" size={16} />
          <div className="space-y-0.5">
            <p className="font-extrabold text-xs">
              {isRtl ? '👁️ وضع العرض والطباعة نشط حالياً' : '👁️ Read-Only & Print Mode is Active'}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal leading-relaxed">
              {isRtl 
                ? 'تم تأمين الشاشة بالكامل لعرض مستندات وحركات الصرف وطباعتها فقط، وإخفاء كافة الإجراءات التفاعلية (مثل الاعتماد، الإرجاع للتعديل، الرفض، الحذف) لضمان عدم حدوث أي تغييرات عشوائية أو غير مقصودة.'
                : 'The screen is secured for viewing and printing transactions only. All interactive actions (such as approvals, rejections, deletes, or edits) are hidden to safeguard custody records.'}
            </p>
          </div>
        </div>
      )}

      {/* SECTION 1: AWAITING APPROVAL / UNDER SETTLEMENT */}
      <div className={`rounded-2xl border overflow-hidden ${
        theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        <button
          onClick={() => setUnderSettlementExpanded(!underSettlementExpanded)}
          className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800"
        >
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle size={16} />
            <span className="font-bold text-xs md:text-sm uppercase tracking-wider">
              {isRtl ? '1. مستندات صرف بانتظار المراجعة والاعتماد المالي' : '1. Vouchers Awaiting Manager Review & Approval'}
            </span>
            <span className="font-mono bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded text-[10px] font-bold">
              {underSettlementTxs.length}
            </span>
          </div>
          {underSettlementExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </button>

        {underSettlementExpanded && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[750px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-medium bg-slate-50/20">
                  <th className="py-3 px-4 font-semibold text-slate-500">{isRtl ? 'رقم السند' : 'Voucher No'}</th>
                  <th className="py-3 px-4 font-semibold text-slate-500">{isRtl ? 'تاريخ السند' : 'Voucher Date'}</th>
                  <th className="py-3 px-4 font-semibold text-slate-500">{isRtl ? 'رقم القيد' : 'Ref No'}</th>
                  <th className="py-3 px-4 font-semibold text-slate-500">{t.description}</th>
                  <th className="py-3 px-4 font-semibold text-slate-500 text-right">{t.amount}</th>
                  <th className="py-3 px-4 font-semibold text-slate-500 text-center">
                    {readOnlyMode 
                      ? (isRtl ? 'معاينة السند' : 'Voucher Preview') 
                      : (isRtl ? 'الإجراءات والاعتماد' : 'Approval Actions')
                    }
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {underSettlementTxs.map((tx) => (
                  <tr 
                    key={tx.id} 
                    onClick={() => setPrintingTx(tx)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer"
                    title={isRtl ? 'انقر لعرض وتفاصيل مستند الصرف' : 'Click to view voucher details'}
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-amber-600">
                      {tx.voucher_no}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-500">
                      {tx.voucher_date}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-400">
                      {tx.transaction_no || (isRtl ? 'قيد الانتظار' : 'Pending')}
                    </td>
                    <td className="py-3.5 px-4 max-w-xs md:max-w-md">
                      <div className="font-medium text-slate-800 dark:text-slate-200 truncate" title={tx.description}>
                        {tx.description}
                      </div>
                      {tx.notes && (
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5 font-mono">
                          <Info size={10} className="text-amber-500 shrink-0" />
                          <span>{tx.notes}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-amber-600">
                      {tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        {/* 1. Print / View button: always available */}
                        <button
                          onClick={() => setPrintingTx(tx)}
                          className={`p-1.5 rounded transition-all font-bold text-[10px] flex items-center gap-1 ${
                            readOnlyMode 
                              ? 'bg-emerald-500/15 hover:bg-emerald-500 text-emerald-700 dark:text-emerald-400 hover:text-white' 
                              : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                          title={isRtl ? 'معاينة وتفاصيل مستند الصرف' : 'View Voucher Details'}
                        >
                          <Eye size={11} className={readOnlyMode ? 'text-emerald-500 shrink-0' : 'text-slate-500 shrink-0'} />
                          <span>{isRtl ? 'عرض فقط' : 'View Only'}</span>
                        </button>

                        {/* 2. Settle & Approval Controls: Available to RegionalManager and Admins (Only when NOT read-only mode) */}
                        {!readOnlyMode && (
                          isManager ? (
                            <>
                              <button
                                onClick={() => setApprovingTx(tx)}
                                className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-all font-bold text-[10px] flex items-center gap-1"
                                title={isRtl ? 'اعتماد وتسوية الحركة نهائياً' : 'Approve & Settle'}
                              >
                                <ShieldCheck size={11} />
                                <span>{isRtl ? 'اعتماد' : 'Approve'}</span>
                              </button>

                              <button
                                onClick={() => setRevertingTx(tx)}
                                className="p-1 rounded bg-amber-500/10 hover:bg-amber-500 hover:text-white text-amber-600 transition-all font-bold text-[10px] flex items-center gap-1"
                                title={isRtl ? 'إرجاع للتعديل' : 'Return for Revision'}
                              >
                                <CornerUpLeft size={11} />
                                <span>{isRtl ? 'تعديل' : 'Edit'}</span>
                              </button>

                              <button
                                onClick={() => setRejectingTx(tx)}
                                className="p-1 rounded bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-600 transition-all font-bold text-[10px] flex items-center gap-1"
                                title={isRtl ? 'رفض المستند نهائياً' : 'Reject Voucher'}
                              >
                                <XCircle size={11} />
                                <span>{isRtl ? 'رفض' : 'Reject'}</span>
                              </button>
                            </>
                          ) : (
                            <span className="text-[10px] text-amber-500 font-bold px-2 py-1 rounded bg-amber-500/10">
                              {isRtl ? 'بانتظار المدير' : 'Pending Manager'}
                            </span>
                          )
                        )}

                        {/* 3. Delete button: Admins only (Only when NOT read-only mode) */}
                        {!readOnlyMode && isAdmin ? (
                          <button
                            onClick={() => setDeletingId(tx.id)}
                            className="p-1 rounded bg-slate-100 hover:bg-rose-500 hover:text-white text-slate-500 transition-colors"
                            title={isRtl ? 'حذف الحركة نهائياً' : 'Delete'}
                          >
                            <Trash2 size={12} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {underSettlementTxs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 font-medium">
                      {isRtl ? 'لا توجد مستندات صرف بانتظار الاعتماد والتدقيق.' : 'No vouchers awaiting approval.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 2: APPROVED / FULLY SETTLED */}
      <div className={`rounded-2xl border overflow-hidden ${
        theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        <button
          onClick={() => setSettledExpanded(!settledExpanded)}
          className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800"
        >
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <ShieldCheck size={16} />
            <span className="font-bold text-xs md:text-sm uppercase tracking-wider">
              {isRtl ? '2. سندات الصرف المعتمدة والمسواة نهائياً بالعهدة' : '2. Fully Settled & Approved Vouchers (Archived)'}
            </span>
            <span className="font-mono bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded text-[10px] font-bold">
              {settledTxs.length}
            </span>
          </div>
          {settledExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </button>

        {settledExpanded && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[750px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-medium bg-slate-50/20">
                  <th className="py-3 px-4 font-semibold text-slate-500">{isRtl ? 'رقم السند' : 'Voucher No'}</th>
                  <th className="py-3 px-4 font-semibold text-slate-500">{isRtl ? 'رقم القيد' : 'Ref No'}</th>
                  <th className="py-3 px-4 font-semibold text-slate-500">{t.description}</th>
                  <th className="py-3 px-4 font-semibold text-slate-500 text-right">{t.amount}</th>
                  <th className="py-3 px-4 font-semibold text-slate-500 text-center">{isRtl ? 'الحالة والرقابة' : 'Audit Status'}</th>
                  <th className="py-3 px-4 font-semibold text-slate-500 text-center">
                    {readOnlyMode 
                      ? (isRtl ? 'معاينة السند' : 'Voucher Preview') 
                      : (isRtl ? 'الإجراءات' : 'Actions')
                    }
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {settledTxs.map((tx) => (
                  <tr 
                    key={tx.id} 
                    onClick={() => setPrintingTx(tx)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer"
                    title={isRtl ? 'انقر لعرض وتفاصيل مستند الصرف' : 'Click to view voucher details'}
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-600">
                      {tx.voucher_no}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-400">
                      {tx.transaction_no || (isRtl ? 'قيد الانتظار' : 'Pending')}
                    </td>
                    <td className="py-3.5 px-4 max-w-xs md:max-w-md">
                      <div className="font-medium text-slate-800 dark:text-slate-200 truncate" title={tx.description}>
                        {tx.description}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-600">
                      {tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold px-2 py-1 rounded bg-emerald-500/10">
                        <ShieldCheck size={10} />
                        <span>{isRtl ? 'مسوى ومعتمد' : 'Approved'}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        {/* 1. Print / View button */}
                        <button
                          onClick={() => setPrintingTx(tx)}
                          className={`p-1.5 rounded transition-all font-bold text-[10px] flex items-center gap-1 ${
                            readOnlyMode 
                              ? 'bg-emerald-500/15 hover:bg-emerald-500 text-emerald-700 dark:text-emerald-400 hover:text-white' 
                              : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                          title={isRtl ? 'عرض ومعاينة مستند الصرف' : 'View Voucher Details'}
                        >
                          <Eye size={11} className={readOnlyMode ? 'text-emerald-500 shrink-0' : 'text-slate-500 shrink-0'} />
                          <span>{isRtl ? 'عرض فقط' : 'View Only'}</span>
                        </button>

                        {/* 2. Settled transactions are locked and cannot be deleted or un-approved */}
                        <span className="text-[10px] text-slate-400 font-medium">
                          {isRtl ? '🔒 الحركة مغلقة' : '🔒 Transaction Locked'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
                {settledTxs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 font-medium">
                      {isRtl ? 'لا توجد سندات معتمدة ومسواة في الأرشيف حالياً.' : 'No fully settled vouchers found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reusable Cash Payment Voucher Print Modal */}
      <VoucherModal
        transaction={printingTx}
        isOpen={!!printingTx}
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
              <h3 className="font-bold text-base">{isRtl ? 'تأكيد الحذف نهائياً' : 'Confirm Permanent Delete'}</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
              {isRtl 
                ? 'هل أنت متأكد من رغبتك في حذف هذا المستند وهذه الحركة نهائياً من قاعدة البيانات؟ لا يمكن التراجع عن هذا الإجراء.'
                : 'Are you sure you want to permanently delete this voucher and its transaction from the database? This action cannot be undone.'}
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

      {/* REVERT/RETURN FOR MODIFICATION CONFIRMATION DIALOG */}
      {revertingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`w-full max-w-sm p-5 rounded-2xl border shadow-xl ${
            theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center gap-3 text-amber-500 mb-3">
              <CornerUpLeft className="h-6 w-6 shrink-0" />
              <h3 className="font-bold text-base">{isRtl ? 'إرجاع للتعديل والمراجعة' : 'Return for Revision'}</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              {isRtl 
                ? `هل أنت متأكد من رغبتك في إرجاع مستند الصرف رقم (${revertingTx.voucher_no}) للتعديل؟ هذا سيحول حالته لمعلق ويتيح لمسئول المحطة تعديله وإعادة تقديمه.`
                : `Are you sure you want to return voucher (${revertingTx.voucher_no}) for modification? This will set its status to Pending, allowing the station custodian to edit and resubmit it.`}
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
                {isRtl ? 'تأكيد الإرجاع للتعديل' : 'Confirm Return'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FINAL REJECT CONFIRMATION DIALOG */}
      {rejectingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`w-full max-w-sm p-5 rounded-2xl border shadow-xl ${
            theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <XCircle className="h-6 w-6 shrink-0" />
              <h3 className="font-bold text-base">{isRtl ? 'تأكيد الرفض النهائي للمستند' : 'Confirm Voucher Rejection'}</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              {isRtl 
                ? `هل أنت متأكد من رغبتك في رفض مستند الصرف رقم (${rejectingTx.voucher_no}) نهائياً؟ سيتحول حالته إلى مرفوض.`
                : `Are you sure you want to reject voucher (${rejectingTx.voucher_no})? Its status will be updated to Rejected.`}
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
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white"
              >
                {isRtl ? 'تأكيد الرفض نهائياً' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* APPROVE FINAL CONFIRMATION DIALOG */}
      {approvingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`w-full max-w-sm p-5 rounded-2xl border shadow-xl ${
            theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center gap-3 text-emerald-600 mb-3">
              <ShieldCheck className="h-6 w-6 shrink-0" />
              <h3 className="font-bold text-base">{isRtl ? 'تأكيد الاعتماد والتسوية النهائية' : 'Confirm Final Approval'}</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              {isRtl 
                ? `هل أنت متأكد من رغبتك في اعتماد مستند الصرف رقم (${approvingTx.voucher_no}) وتنزيل القيمة البالغة (${approvingTx.amount.toLocaleString()} جنيه) نهائياً من العهدة؟`
                : `Are you sure you want to approve voucher (${approvingTx.voucher_no}) for the amount of (${approvingTx.amount.toLocaleString()} EGP)? This permanently deducts the amount from custody.`}
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
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                {isRtl ? 'اعتماد وتسوية نهائية' : 'Confirm Approve'}
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
