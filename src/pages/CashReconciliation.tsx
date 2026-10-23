import React, { useState, useEffect } from 'react';
import { CustodyDB, CustodyEngine } from '../db';
import { useScreenListeners } from '../firebase';
import { translations, Language, Theme, Transaction, ExpenseCategory } from '../types';
import { 
  TrendingUp, 
  Coins, 
  Minus, 
  Equal, 
  Scale, 
  CheckSquare, 
  Printer, 
  Clock,
  FileCheck,
  Search,
  Trash2,
  CornerUpLeft,
  AlertTriangle,
  Info,
  Calendar,
  Filter,
  Plus,
  Check,
  ShieldCheck,
  XCircle,
  X,
  FileText,
  FileImage,
  Eye,
  Download
} from 'lucide-react';
import VoucherModal from '../components/VoucherModal';
import ReconciliationPrintSheet from '../components/ReconciliationPrintSheet';
import ReconciliationReviewModal from '../components/ReconciliationReviewModal';

interface CashReconciliationProps {
  language: Language;
  theme: Theme;
  onNavigate?: (tab: string) => void;
  onSelectTransactionForSettle?: (tx: Transaction) => void;
}

export default function CashReconciliation({ 
  language, 
  theme,
  onNavigate,
  onSelectTransactionForSettle 
}: CashReconciliationProps) {
  useScreenListeners(['CashVouchers', 'Expenses', 'transactions']);

  const t = translations[language];
  const isRtl = language === 'ar';
  const user = CustodyDB.getActiveUser();
  const stations = CustodyDB.getStationsForUser(user);
  const activeStation = stations.find(s => s.id === user?.station_id);
  const isAdmin = user && (user.role === 'Admin' || user.role === 'SystemAdmin');
  const isManager = user && (user.role === 'RegionalManager' || user.role === 'Admin' || user.role === 'SystemAdmin');
  const isRegionalManager = user?.role === 'RegionalManager';

  // Allowed stations for selection (governed by getStationsForUser visibility API)
  const allowedStations = stations;

  const [selectedStationId, setSelectedStationId] = useState<string>(() => {
    if (user?.station_id) return user.station_id;
    const saved = localStorage.getItem('reconciliation_selected_station_id');
    if (saved && (saved === 'all' || allowedStations.some(s => s.id === saved))) return saved;
    return (isRegionalManager || isAdmin) ? 'all' : (allowedStations[0]?.id || 'all');
  });

  const currentStation = React.useMemo(() => {
    if (selectedStationId === 'all') return null;
    return stations.find(s => s.id === selectedStationId) || null;
  }, [stations, selectedStationId]);

  const displayStation = currentStation || activeStation;
  
  const companyName = React.useMemo(() => {
    const compId = displayStation?.company_id || user?.company_id;
    if (!compId) return undefined;
    return CustodyDB.getCompanies().find(c => c.id === compId)?.name;
  }, [displayStation, user]);

  const regionName = React.useMemo(() => {
    const regId = displayStation?.region_id || user?.region_id;
    if (!regId) return undefined;
    return CustodyDB.getRegions().find(r => r.id === regId)?.name;
  }, [displayStation, user]);

  const stationName = displayStation?.station_name;
  const stationCode = displayStation?.station_code;

  // Editable inventory/sheet title
  const [sheetTitle, setSheetTitle] = useState(() => {
    const saved = localStorage.getItem('reconciliation_sheet_title');
    if (saved) return saved;
    if (currentStation) return `جرد عهدة ${currentStation.station_name}`;
    if (activeStation) return `جرد عهدة ${activeStation.station_name}`;
    return 'جرد عهدة كافة المحطات';
  });

  // Automatically update sheet title based on station selection unless custom modified
  useEffect(() => {
    if (currentStation) {
      setSheetTitle(isRtl ? `جرد عهدة ${currentStation.station_name}` : `Custody of ${currentStation.station_name}`);
    } else if (selectedStationId === 'all') {
      setSheetTitle(isRtl ? 'جرد عهدة كافة المحطات التابعة' : 'Consolidated Custody Sheet');
    }
  }, [currentStation, selectedStationId, isRtl]);

  const [isEditingTitle, setIsEditingTitle] = useState(false);

  // Manual physical inventory/reconciliation details
  const [isCustodyMatched, setIsCustodyMatched] = useState<boolean>(false);
  const [cashDeficit, setCashDeficit] = useState<string>('');
  const [cashSurplus, setCashSurplus] = useState<string>('');
  const [auditNotes, setAuditNotes] = useState<string>('');

  // Metrics & transactions
  const [metrics, setMetrics] = useState(() => {
    const targetStation = selectedStationId === 'all' ? undefined : selectedStationId;
    const targetRegion = selectedStationId === 'all' && isRegionalManager ? user?.region_id : undefined;
    return CustodyDB.getReconciliation(targetStation, targetRegion);
  });
  const [categories] = useState<ExpenseCategory[]>(() => CustodyDB.getCategories());
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Interactive dialog/modal state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [revertingTx, setRevertingTx] = useState<Transaction | null>(null);
  const [printingTx, setPrintingTx] = useState<Transaction | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [approvingTx, setApprovingTx] = useState<Transaction | null>(null);
  const [rejectingTx, setRejectingTx] = useState<Transaction | null>(null);
  const [reviewingTx, setReviewingTx] = useState<Transaction | null>(null);
  const [reviewComments, setReviewComments] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [revertReason, setRevertReason] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Custody Replenishment state inside reconciliation page for Regional Manager / Admin
  const [replenishStationId, setReplenishStationId] = useState<string>('');
  const [replenishAmount, setReplenishAmount] = useState<string>('');
  const [replenishNotes, setReplenishNotes] = useState<string>('');

  const refreshData = () => {
    const targetStation = selectedStationId === 'all' ? undefined : selectedStationId;
    const targetRegion = selectedStationId === 'all' && isRegionalManager ? user?.region_id : undefined;
    setMetrics(CustodyDB.getReconciliation(targetStation, targetRegion));
    setAllTransactions(CustodyDB.getScopedTransactions());
  };

  useEffect(() => {
    refreshData();
    if (selectedStationId) {
      localStorage.setItem('reconciliation_selected_station_id', selectedStationId);
    }

    // Reset manual verification inputs on station change
    setIsCustodyMatched(false);
    setCashDeficit('');
    setCashSurplus('');
    setAuditNotes('');

    // Update replenish target default
    if (selectedStationId && selectedStationId !== 'all') {
      setReplenishStationId(selectedStationId);
    } else {
      setReplenishStationId('');
    }

    // Live update when Firebase/Firestore database updates
    window.addEventListener('custody_db_updated', refreshData);
    return () => {
      window.removeEventListener('custody_db_updated', refreshData);
    };
  }, [selectedStationId]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const formatVal = (val: number) => {
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EGP';
  };

  const handlePrint = () => {
    window.print();
  };

  // Save Title
  const handleSaveTitle = () => {
    localStorage.setItem('reconciliation_sheet_title', sheetTitle);
    setIsEditingTitle(false);
    showToast(isRtl ? 'تم حفظ عنوان صحيفة الجرد بنجاح.' : 'Sheet title saved successfully.');
  };

  // Revert settlement status (for Regional Manager or Admins) with comments support
  const handleRevert = async (tx: Transaction, comments?: string) => {
    if (!isManager) {
      setAuthError(isRtl ? 'عذراً، يتطلب إلغاء تسوية الحركات صلاحية مدير المنطقة أو الأدمن.' : 'Unauthorized: Requires Regional Manager or Admin credentials.');
      return;
    }

    const finalComments = revertReason.trim() || comments?.trim() || (isRtl ? 'تم إلغاء تسوية مستند الصرف وإعادته مع الحركات المعلقة.' : 'Settlement cancelled. Voucher reverted to Pending.');

    const vNo = tx.voucher_no;
    // Find all transactions with this voucher_no
    const relatedTxs = vNo 
      ? allTransactions.filter(t => t.voucher_no === vNo)
      : [tx];

    for (const t of relatedTxs) {
      const res = await CustodyDB.updateTransaction(t.id, {
        status: 'Pending'
      });
      if (!res.success) {
        alert(res.errors?.join(' \n ') || 'Failed to revert transaction');
        return;
      }
      
      // Save specific workflow history for each transaction
      CustodyDB.addTransactionHistory({
        id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        transaction_id: t.id,
        action: 'Reverted',
        performed_by: user?.id || 'unknown',
        performed_by_name: user?.full_name || 'Anonymous',
        timestamp: new Date().toISOString(),
        previous_status: 'Under Settlement',
        new_status: 'Pending',
        notes: finalComments
      });
    }

    if (vNo) {
      const vouchers = CustodyDB.getCashVouchers();
      const voucher = vouchers.find(v => v.voucher_no === vNo);
      if (voucher) {
        await CustodyDB.saveCashVoucher({
          ...voucher,
          status: 'Draft',
          updated_at: new Date().toISOString()
        });
      }
    }

    CustodyDB.addLog(
      user?.id || 'unknown',
      user?.full_name || 'Anonymous',
      'Revert Voucher',
      `Reverted settlement of voucher ${vNo || tx.transaction_no} bundling ${relatedTxs.length} expenses worth ${relatedTxs.reduce((sum, r) => sum + r.amount, 0).toLocaleString()} EGP.`
    );

    showToast(isRtl ? 'تم إلغاء تسوية مستند الصرف وإعادته كحركات معلقة للتعديل.' : 'Settlement cancelled. Voucher and linked expenses reverted to Pending.');
    refreshData();
    setRevertingTx(null);
    setReviewingTx(null);
    setReviewComments('');
    setRejectReason('');
    setRevertReason('');
  };

  // Permanent Delete
  const handleDelete = async (id: string) => {
    if (!deleteReason.trim()) {
      alert(isRtl ? 'يجب إدخال سبب الحذف الإجباري!' : 'Mandatory deletion reason is required!');
      return;
    }
    const success = await CustodyDB.deleteTransaction(id, deleteReason);
    if (success) {
      showToast(isRtl ? 'تم حذف الحركة والعملية بالكامل من قاعدة البيانات.' : 'Transaction successfully deleted.');
      refreshData();
      setDeletingId(null);
      setDeleteReason('');
    } else {
      setAuthError(isRtl ? 'عذراً، لا تمتلك الصلاحية الكافية لحذف هذه الحركة من هذه الخزينة.' : 'Unauthorized: You do not have sufficient privileges to delete this transaction.');
      setDeletingId(null);
    }
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

    const vNo = tx.voucher_no;
    if (vNo) {
      const vouchers = CustodyDB.getCashVouchers();
      const voucher = vouchers.find(v => v.voucher_no === vNo);
      if (voucher) {
        // Find other transactions for this voucher number
        const otherTxs = allTransactions.filter(t => t.voucher_no === vNo && t.id !== tx.id);
        const allOtherSettled = otherTxs.every(t => t.status === 'Settled');
        if (allOtherSettled) {
          await CustodyDB.saveCashVoucher({
            ...voucher,
            status: 'Approved',
            updated_at: new Date().toISOString()
          });
        }
      }
    }

    CustodyDB.addLog(
      user?.id || 'unknown',
      user?.full_name || 'Anonymous',
      'Final Approve & Settle',
      `Approved and settled voucher ${tx.voucher_no} (transaction ${tx.transaction_no}) worth ${tx.amount.toLocaleString()} EGP.`
    );
    showToast(isRtl ? 'تم اعتماد وتسوية مستند الصرف نهائياً.' : 'Voucher successfully approved and settled.');
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

    const finalComments = rejectReason.trim() || (isRtl ? 'تم رفض مستند الصرف وتحديث الحالة إلى مرفوض.' : 'Voucher successfully rejected.');

    const res = await CustodyDB.updateTransaction(tx.id, {
      status: 'Rejected'
    });
    if (!res.success) {
      alert(res.errors?.join(' \n ') || 'Failed to reject transaction');
      return;
    }

    const vNo = tx.voucher_no;
    if (vNo) {
      const vouchers = CustodyDB.getCashVouchers();
      const voucher = vouchers.find(v => v.voucher_no === vNo);
      if (voucher) {
        await CustodyDB.saveCashVoucher({
          ...voucher,
          status: 'Draft',
          updated_at: new Date().toISOString()
        });
      }
    }

    CustodyDB.addTransactionHistory({
      id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      transaction_id: tx.id,
      action: 'Rejected',
      performed_by: user?.id || 'unknown',
      performed_by_name: user?.full_name || 'Anonymous',
      timestamp: new Date().toISOString(),
      previous_status: 'Under Settlement',
      new_status: 'Rejected',
      notes: finalComments
    });

    CustodyDB.addLog(
      user?.id || 'unknown',
      user?.full_name || 'Anonymous',
      'Reject Voucher',
      `Rejected voucher ${tx.voucher_no} (transaction ${tx.transaction_no}) worth ${tx.amount.toLocaleString()} EGP.`
    );
    showToast(isRtl ? 'تم رفض مستند الصرف وتحديث الحالة إلى مرفوض.' : 'Voucher successfully rejected.');
    refreshData();
    setRejectingTx(null);
    setRejectReason('');
    setRevertReason('');
  };

  // Approve / Settle Final Handler (For RegionalManager or Admin) with comments support
  const handleApproveVoucher = async (tx: Transaction, comments: string) => {
    if (!isManager) {
      setAuthError(isRtl ? 'عذراً، يتطلب اعتماد وتسوية الحركات صلاحية مدير المنطقة أو الأدمن.' : 'Unauthorized: Requires Regional Manager or Admin credentials.');
      return;
    }

    const vNo = tx.voucher_no;
    // Find all transactions with this voucher_no
    const relatedTxs = vNo 
      ? allTransactions.filter(t => t.voucher_no === vNo)
      : [tx];

    for (const t of relatedTxs) {
      const res = await CustodyDB.updateTransaction(t.id, {
        status: 'Settled'
      });
      if (!res.success) {
        alert(res.errors?.join(' \n ') || 'Failed to approve transaction');
        return;
      }
      
      // Save specific workflow history for each transaction
      CustodyDB.addTransactionHistory({
        id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        transaction_id: t.id,
        action: 'Approved & Settled',
        performed_by: user?.id || 'unknown',
        performed_by_name: user?.full_name || 'Anonymous',
        timestamp: new Date().toISOString(),
        previous_status: 'Under Settlement',
        new_status: 'Settled',
        notes: comments || (isRtl ? 'تم الاعتماد والتسوية النهائية من مدير المنطقة' : 'Approved and settled by Regional Manager')
      });
    }

    if (vNo) {
      const vouchers = CustodyDB.getCashVouchers();
      const voucher = vouchers.find(v => v.voucher_no === vNo);
      if (voucher) {
        await CustodyDB.saveCashVoucher({
          ...voucher,
          status: 'Approved',
          updated_at: new Date().toISOString()
        });
      }
    }

    CustodyDB.addLog(
      user?.id || 'unknown',
      user?.full_name || 'Anonymous',
      'Final Approve & Settle',
      `Approved and settled voucher ${vNo || tx.transaction_no} bundling ${relatedTxs.length} expenses worth ${relatedTxs.reduce((sum, r) => sum + r.amount, 0).toLocaleString()} EGP.`
    );
    
    showToast(isRtl ? 'تم اعتماد وتسوية مستند الصرف والمصروفات التابعة له نهائياً.' : 'Voucher and all linked expenses successfully approved and settled.');
    refreshData();
    setReviewingTx(null);
    setReviewComments('');
  };

  // Reject transaction handler (Sets status to 'Rejected') with comments support
  const handleRejectVoucher = async (tx: Transaction, comments: string) => {
    if (!isManager) {
      setAuthError(isRtl ? 'عذراً، يحتاج هذا الإجراء إلى صلاحيات الإدارة أو مدير المنطقة.' : 'Unauthorized: Rejecting requires Manager or Admin permissions.');
      return;
    }

    const finalComments = rejectReason.trim() || comments.trim() || (isRtl ? 'تم رفض مستند الصرف وإعادته للتصحيح.' : 'Voucher rejected and returned for correction.');

    const vNo = tx.voucher_no;
    const relatedTxs = vNo 
      ? allTransactions.filter(t => t.voucher_no === vNo)
      : [tx];

    for (const t of relatedTxs) {
      const res = await CustodyDB.updateTransaction(t.id, {
        status: 'Rejected'
      });
      if (!res.success) {
        alert(res.errors?.join(' \n ') || 'Failed to reject transaction');
        return;
      }
      
      CustodyDB.addTransactionHistory({
        id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        transaction_id: t.id,
        action: 'Rejected',
        performed_by: user?.id || 'unknown',
        performed_by_name: user?.full_name || 'Anonymous',
        timestamp: new Date().toISOString(),
        previous_status: 'Under Settlement',
        new_status: 'Rejected',
        notes: finalComments
      });
    }

    if (vNo) {
      const vouchers = CustodyDB.getCashVouchers();
      const voucher = vouchers.find(v => v.voucher_no === vNo);
      if (voucher) {
        await CustodyDB.saveCashVoucher({
          ...voucher,
          status: 'Draft',
          updated_at: new Date().toISOString()
        });
      }
    }

    CustodyDB.addLog(
      user?.id || 'unknown',
      user?.full_name || 'Anonymous',
      'Reject Voucher',
      `Rejected voucher ${vNo || tx.transaction_no} bundling ${relatedTxs.length} expenses worth ${relatedTxs.reduce((sum, r) => sum + r.amount, 0).toLocaleString()} EGP.`
    );

    showToast(isRtl ? 'تم رفض مستند الصرف وتحديث الحالة إلى مرفوض.' : 'Voucher successfully rejected.');
    refreshData();
    setReviewingTx(null);
    setReviewComments('');
    setRejectReason('');
    setRevertReason('');
  };

  // Settle action triggers routing to voucher page with preselected transaction
  const handleStartSettle = async (tx: Transaction) => {
    if (onSelectTransactionForSettle && onNavigate) {
      onSelectTransactionForSettle(tx);
      onNavigate('voucher');
    } else {
      // Inline update to "Under Settlement" with quick temporary voucher info
      const tempVoucherNo = 'TEMP-' + Math.floor(1000 + Math.random() * 9000);
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

  // Filter lists based on search
  const pendingTxs = allTransactions.filter(tx => {
    if (tx.status !== 'Pending') return false;
    if (selectedStationId !== 'all' && tx.station_id !== selectedStationId) return false;
    const matchesSearch = 
      tx.transaction_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const underSettlementTxs = allTransactions.filter(tx => {
    if (tx.status !== 'Under Settlement') return false;
    if (selectedStationId !== 'all' && tx.station_id !== selectedStationId) return false;
    const matchesSearch = 
      tx.transaction_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tx.voucher_no && tx.voucher_no.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch;
  });

  const totalUnderSettlement = underSettlementTxs.reduce((sum, tx) => sum + tx.amount, 0);
  const totalPending = pendingTxs.reduce((sum, tx) => sum + tx.amount, 0);
  const custodyBase = metrics.custodyValue;
  const originalCustodyBase = metrics.originalCustodyValue ?? custodyBase;
  const settledTotal = metrics.settledTotal || 0;
  const netCashAvailable = metrics.cashAvailable;

  const handlePageReplenishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetId = selectedStationId === 'all' ? replenishStationId : selectedStationId;
    if (!targetId || targetId === 'all') {
      alert(isRtl ? 'يرجى تحديد المحطة المراد استعاضة عهدتها أولاً' : 'Please select a station to replenish first.');
      return;
    }

    const stationToReplenish = stations.find(s => s.id === targetId);
    if (!stationToReplenish) {
      alert(isRtl ? 'المحطة المحددة غير موجودة' : 'Selected station not found.');
      return;
    }

    const amountVal = parseFloat(replenishAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      alert(isRtl ? 'يرجى إدخال مبلغ صحيح وموجب' : 'Please enter a valid positive amount.');
      return;
    }

    // Call CustodyEngine to replenish custody and write custody_movement
    const res = await CustodyEngine.replenish({
      stationId: stationToReplenish.id,
      amount: amountVal,
      notes: replenishNotes || undefined,
      actorId: user?.id || 'unknown',
      actorName: user?.full_name || 'Anonymous'
    });

    if (!res.success) {
      alert(res.error || (isRtl ? 'فشلت عملية التغذية' : 'Failed to replenish custody'));
      return;
    }

    // Reset form and show success toast
    setReplenishAmount('');
    setReplenishNotes('');
    refreshData();
    showToast(isRtl ? 'تم شحن واستعاضة العهدة وتحديث القيمة الاسمية بنجاح!' : 'Custody replenished and nominal limit updated successfully!');
  };

  return (
    <div className="space-y-6 print:space-y-0 font-sans text-slate-800 dark:text-slate-100 relative">
      
      {/* High-fidelity CSS overrides for premium ledger look-and-feel */}
      <style>{`
        .ledger-row-hover:hover {
          background-color: rgba(99, 102, 241, 0.02);
        }
        .dark .ledger-row-hover:hover {
          background-color: rgba(99, 102, 241, 0.04);
        }
        .premium-shadow {
          box-shadow: 0 4px 30px -4px rgba(15, 23, 42, 0.04);
        }
        .dark .premium-shadow {
          box-shadow: 0 4px 30px -4px rgba(0, 0, 0, 0.25);
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 9999px;
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
        }
      `}</style>

      {/* TOAST SYSTEM */}
      {toastMessage && (
        <div className="fixed bottom-6 left-6 right-6 md:left-auto md:w-96 z-50 p-4 bg-emerald-600 text-white text-xs font-bold rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce">
          <span className="p-1 rounded-lg bg-white/20 text-white">
            <CheckSquare size={16} />
          </span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* EXECUTIVE TOP HEADER */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between print:hidden bg-white dark:bg-[#0f172a] p-5 rounded-2xl border border-slate-150 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
              <Scale size={22} className="animate-pulse" />
            </span>
            <h2 className="text-xl font-black tracking-tight md:text-2xl font-sans">
              {isRtl ? 'مطابقة وجرد العهدة النقدية' : 'Cash Reconciliation & Inventory Audit'}
            </h2>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed max-w-2xl">
            {isRtl 
              ? 'شاشة الرقابة والتدقيق المالي الشامل للعهد النقدية، تجميع للمصروفات والسيولة والمسويات في قالب محاسبي واحد.' 
              : 'Comprehensive cash audit panel aggregating operational expenses, pending safe transactions, and liquid assets.'
            }
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto justify-end shrink-0">
          {user && user.role !== 'Admin' && user.role !== 'SystemAdmin' && user.role !== 'RegionalManager' && (
            <button
              onClick={() => onNavigate && onNavigate('new-expense')}
              className="flex items-center justify-center gap-1.5 px-4.5 py-2.5 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md shadow-emerald-600/10 cursor-pointer hover:scale-[1.01] w-full sm:w-auto text-center"
            >
              <Plus size={15} />
              <span>{isRtl ? 'تسجيل مصروف جديد' : 'Record Expense'}</span>
            </button>
          )}
          <button
            onClick={handlePrint}
            className="flex items-center justify-center gap-1.5 px-4.5 py-2.5 rounded-xl text-xs font-extrabold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-600/10 cursor-pointer hover:scale-[1.01] w-full sm:w-auto text-center"
          >
            <Printer size={15} />
            <span>{isRtl ? 'طباعة كشف الجرد' : 'Print Audit Sheet'}</span>
          </button>
        </div>
      </div>

      {/* VIEW & CONTROL TOOLBAR */}
      <div className={`p-4 rounded-2xl border flex flex-col md:flex-row gap-4 items-center justify-between print:hidden premium-shadow ${
        theme === 'dark' ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200/80 shadow-sm'
      }`}>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="p-1.5 rounded-lg bg-indigo-500/5 text-indigo-500">
            <Filter size={15} />
          </span>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
            {isRtl ? 'خيارات العرض والتصفية السريعة' : 'Toolbar & Filtering Panel'}
          </span>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto md:max-w-2xl items-center">
          {/* Station Selector dropdown */}
          {isManager && allowedStations.length > 1 && (
            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 shrink-0">
                {isRtl ? 'المحطة/الفرع:' : 'Branch:'}
              </span>
              <select
                value={selectedStationId}
                onChange={(e) => setSelectedStationId(e.target.value)}
                className={`py-2 px-3 rounded-xl border text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer w-full sm:w-auto flex-1 sm:flex-initial ${
                  theme === 'dark' 
                    ? 'bg-[#1e293b] border-slate-800 text-slate-100' 
                    : 'bg-slate-50 border-slate-200 text-slate-800 shadow-sm hover:bg-slate-100'
                }`}
              >
                {isRegionalManager && (
                  <option value="all">
                    {isRtl ? 'جميع محطات الإقليم (مجمعة)' : 'All Scoped Stations (Consolidated)'}
                  </option>
                )}
                {isAdmin && (
                  <option value="all">
                    {isRtl ? 'جميع محطات الشركة (مجمعة)' : 'All Stations (Consolidated)'}
                  </option>
                )}
                {allowedStations.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.station_name} {s.station_code ? `(${s.station_code})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          <div className="relative w-full sm:w-64">
            <span className="absolute inset-y-0 right-3.5 flex items-center text-slate-400 pointer-events-none">
              <Search size={14} />
            </span>
            <input
              type="text"
              placeholder={isRtl ? 'ابحث برقم الحركة، البيان...' : 'Search transaction...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`py-2 pl-3.5 pr-9 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all w-full ${
                theme === 'dark' 
                  ? 'bg-[#1e293b] border-slate-800 text-slate-100 placeholder-slate-500' 
                  : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400 shadow-sm'
              }`}
            />
          </div>
        </div>
      </div>

      {/* DUAL WORKSPACE SPREADSHEETS */}
      <div className="grid gap-6 lg:grid-cols-2 print:hidden">
        
        {/* PANEL 1: PENDING OPERATIONS */}
        <div className={`p-4 sm:p-5 rounded-2xl border flex flex-col justify-between premium-shadow border-t-4 border-t-amber-500 w-full min-w-0 overflow-hidden ${
          theme === 'dark' ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200/80 shadow-sm'
        }`}>
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 border-b border-slate-100 dark:border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-4 rounded bg-amber-500 block animate-pulse" />
                <h3 className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
                  {isRtl ? 'القسم الأول: المعاملات المعلقة بالخزينة (المعلق)' : 'Part I: Pending Cash Operations'}
                </h3>
              </div>
              <span className="font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2.5 py-0.5 rounded-full text-[10px] font-black w-fit self-start sm:self-auto">
                {pendingTxs.length} {isRtl ? 'معاملات' : 'entries'}
              </span>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-xs text-right border-collapse min-w-[360px]">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-200/50 dark:border-slate-800 text-slate-400 font-bold">
                    <th className="p-2.5 text-center w-10">#</th>
                    <th className="p-2.5 text-right">{isRtl ? 'البيان وتفاصيل المصروف' : 'Description'}</th>
                    <th className="p-2.5 text-left w-28 font-mono">{isRtl ? 'المبلغ المالي' : 'Amount'}</th>
                    <th className="p-2.5 text-center w-24">{isRtl ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {pendingTxs.map((tx, idx) => (
                    <tr key={tx.id} className="ledger-row-hover transition-colors">
                      <td className="p-2.5 text-center font-mono text-slate-400 dark:text-slate-600">
                        {idx + 1}
                      </td>
                      <td className="p-2.5">
                        <div className="text-xs text-slate-700 dark:text-slate-300 font-bold leading-normal">{tx.description}</div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-1 flex items-center gap-1.5">
                          <span>{tx.date}</span>
                          <span className="text-slate-300 dark:text-slate-700">•</span>
                          <span className="font-bold">{tx.transaction_no}</span>
                        </div>
                      </td>
                      <td className="p-2.5 text-left font-mono font-bold text-amber-600 dark:text-amber-500">
                        {tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {!isRegionalManager && (
                            <button
                              onClick={() => handleStartSettle(tx)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-600 text-indigo-600 dark:text-indigo-400 hover:text-white transition-all text-[10px] font-bold cursor-pointer"
                            >
                              {isRtl ? 'تسوية' : 'Settle'}
                            </button>
                          )}
                          <button
                            onClick={() => setDeletingId(tx.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all cursor-pointer"
                            title={isRtl ? 'حذف' : 'Delete'}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {pendingTxs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-10 text-center text-slate-400 dark:text-slate-600 font-medium">
                        {isRtl ? 'لا توجد حركات معلقة بالخزينة حالياً.' : 'No pending transactions in this station.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-5 pt-3.5 border-t border-dashed border-slate-200 dark:border-slate-800 flex justify-between items-center px-1">
            <span className="font-extrabold text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">{isRtl ? 'إجمالي معلق الخزينة' : 'Pending Total'}</span>
            <span className="font-mono font-black text-sm text-amber-600 dark:text-amber-500">
              {totalPending.toLocaleString('en-US', { minimumFractionDigits: 2 })} EGP
            </span>
          </div>
        </div>

        {/* PANEL 2: UNDER SETTLEMENT VOUCHERS */}
        <div className={`p-4 sm:p-5 rounded-2xl border flex flex-col justify-between premium-shadow border-t-4 border-t-indigo-500 w-full min-w-0 overflow-hidden ${
          theme === 'dark' ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200/80 shadow-sm'
        }`}>
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 border-b border-slate-100 dark:border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-4 rounded bg-indigo-500 block animate-pulse" />
                <h3 className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
                  {isRtl ? 'القسم الثاني: مستندات الصرف تحت التسوية (الحوافظ)' : 'Part II: Vouchers Under Settlement'}
                </h3>
              </div>
              <span className="font-mono bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2.5 py-0.5 rounded-full text-[10px] font-black w-fit self-start sm:self-auto">
                {underSettlementTxs.length} {isRtl ? 'حوافظ' : 'vouchers'}
              </span>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-xs text-right border-collapse min-w-[420px]">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-200/50 dark:border-slate-800 text-slate-400 font-bold">
                    <th className="p-2.5 text-center w-10">#</th>
                    <th className="p-2.5 text-right w-24">{isRtl ? 'رقم الحافظة' : 'Voucher No'}</th>
                    <th className="p-2.5 text-right">{isRtl ? 'البيان والوصف' : 'Description'}</th>
                    <th className="p-2.5 text-left w-28 font-mono">{isRtl ? 'المبلغ المالي' : 'Amount'}</th>
                    <th className="p-2.5 text-center w-32">{isRtl ? 'إجراءات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {underSettlementTxs.map((tx, idx) => (
                    <tr key={tx.id} className="ledger-row-hover transition-colors">
                      <td className="p-2.5 text-center font-mono text-slate-400 dark:text-slate-600">
                        {idx + 1}
                      </td>
                      <td className="p-2.5 font-mono">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          {tx.voucher_no || 'N/A'}
                        </span>
                      </td>
                      <td className="p-2.5">
                        <div className="text-xs text-slate-700 dark:text-slate-300 font-bold leading-normal">{tx.description}</div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-1">
                          {tx.voucher_date || tx.date}
                        </div>
                      </td>
                      <td className="p-2.5 text-left font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-2 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          <button
                            onClick={() => setPrintingTx(tx)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
                            title={isRtl ? 'طباعة' : 'Print'}
                          >
                            <Printer size={13} />
                          </button>

                          {isManager && (
                            <button
                              onClick={() => {
                                setReviewingTx(tx);
                                setReviewComments('');
                                setRejectReason('');
                                setRevertReason('');
                              }}
                              className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[9px] flex items-center gap-0.5 transition-all shadow-sm cursor-pointer hover:scale-[1.02]"
                            >
                              <ShieldCheck size={10} />
                              <span>{isRtl ? 'مراجعة' : 'Audit'}</span>
                            </button>
                          )}

                          {isManager && (
                            <button
                              onClick={() => setRevertingTx(tx)}
                              className="px-2 py-0.5 rounded-lg bg-amber-500/10 hover:bg-amber-600 text-amber-600 dark:text-amber-400 hover:text-white text-[9px] font-bold transition-all cursor-pointer"
                            >
                              {isRtl ? 'إرجاع' : 'Revert'}
                            </button>
                          )}

                          {(isAdmin || isRegionalManager || user?.role === 'StationAdmin') && (
                            <button
                              onClick={() => setDeletingId(tx.id)}
                              className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                              title={isRtl ? 'حذف' : 'Delete'}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {underSettlementTxs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-slate-400 dark:text-slate-600 font-medium">
                        {isRtl ? 'لا توجد مستندات صرف تحت التسوية حالياً.' : 'No vouchers currently awaiting settlement.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-5 pt-3.5 border-t border-dashed border-slate-200 dark:border-slate-800 flex justify-between items-center px-1">
            <span className="font-extrabold text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">{isRtl ? 'إجمالي تحت التسوية' : 'Settlement Total'}</span>
            <span className="font-mono font-black text-sm text-indigo-600 dark:text-indigo-400">
              {totalUnderSettlement.toLocaleString('en-US', { minimumFractionDigits: 2 })} EGP
            </span>
          </div>
        </div>

      </div>



      {/* BOTTOM LOCAL RECONCILIATION CALCULATION REPORT */}
      <div className="pt-6 print:hidden max-w-5xl mx-auto grid gap-6 md:grid-cols-2">
        {/* Calculation Summary Card */}
        <div className="w-full bg-white rounded-2xl border border-slate-300 overflow-hidden shadow-sm premium-shadow">
          <div className="bg-slate-100 px-4 py-3 border-b border-slate-300 flex items-center gap-2">
            <Scale size={15} className="text-emerald-700" />
            <span className="font-extrabold text-[11px] text-slate-800 uppercase tracking-wider">
              {isRtl ? 'خلاصة تسوية ومطابقة الخزينة النقدية' : 'Summary & Cash Reconciliation'}
            </span>
          </div>

          <div className="p-4.5 space-y-3 font-medium text-xs text-slate-800">
            <div className="flex justify-between items-center pb-2 border-b border-slate-200 font-bold text-slate-800">
              <span>{isRtl ? 'قيمة العهدة الإسمية' : 'Nominal Custody Value'}</span>
              <span className="font-mono text-sm text-slate-900">
                {custodyBase.toLocaleString('en-US', { minimumFractionDigits: 2 })} EGP
              </span>
            </div>

            <div className="flex justify-between items-center pb-2 border-b border-slate-200 text-blue-700">
              <span className="font-bold">{isRtl ? 'إجمالي تحت التسوية بانتظار الاعتماد (-)' : 'Total Under Settlement (Pending Approval) (-)'}</span>
              <span className="font-mono font-extrabold text-sm">
                ({totalUnderSettlement.toLocaleString('en-US', { minimumFractionDigits: 2 })}) EGP
              </span>
            </div>

            <div className="flex justify-between items-center pb-2 border-b border-slate-200 text-amber-700 font-bold">
              <span>{isRtl ? 'إجمالي المعلق بالخزينة (-)' : 'Total Pending (-)'}</span>
              <span className="font-mono font-extrabold text-sm">
                ({totalPending.toLocaleString('en-US', { minimumFractionDigits: 2 })}) EGP
              </span>
            </div>

            <div className="flex justify-between items-center pt-3 px-3 py-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800">
              <span className="font-extrabold">{isRtl ? 'السيولة المتبقية (متبقي الخزينة الفعلي)' : 'Liquid Cash Available (Net)'}</span>
              <span className="font-mono font-black text-base">
                {netCashAvailable.toLocaleString('en-US', { minimumFractionDigits: 2 })} EGP
              </span>
            </div>
          </div>
        </div>

        {/* Manual Physical Audit Entry Card */}
        <div className="w-full bg-white rounded-2xl border border-slate-300 overflow-hidden shadow-sm premium-shadow flex flex-col justify-between">
          <div className="bg-slate-100 px-4 py-3 border-b border-slate-300 flex items-center gap-2">
            <CheckSquare size={15} className="text-indigo-700" />
            <span className="font-extrabold text-[11px] text-slate-800 uppercase tracking-wider">
              {isRtl ? 'مطابقة وجرد الخزينة يدوياً (للطباعة والتدقيق)' : 'Manual Cash Verification & Audit (For Print)'}
            </span>
          </div>

          <div className="p-4.5 space-y-4 text-xs text-slate-800">
            <div className="grid grid-cols-3 gap-3">
              {/* Box 1: Reconciled */}
              <div className="flex flex-col items-center justify-between p-3 rounded-xl border border-slate-300 bg-slate-50 text-center min-h-[90px]">
                <span className="font-extrabold text-[10px] text-slate-700 leading-tight">
                  {isRtl ? 'العهدة متطابقة' : 'Custody Matches'}
                </span>
                <label className="flex items-center justify-center cursor-pointer mt-2 p-1">
                  <input
                    type="checkbox"
                    checked={isCustodyMatched}
                    onChange={(e) => {
                      setIsCustodyMatched(e.target.checked);
                      if (e.target.checked) {
                        setCashDeficit('');
                        setCashSurplus('');
                      }
                    }}
                    className="w-5 h-5 text-indigo-600 border-slate-300 rounded-lg focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                  />
                </label>
              </div>

              {/* Box 2: Deficit */}
              <div className="flex flex-col items-center justify-between p-3 rounded-xl border border-slate-300 bg-slate-50 text-center min-h-[90px]">
                <span className="font-extrabold text-[10px] text-rose-700 leading-tight">
                  {isRtl ? 'عجز نقدية الخزينة بمبلغ' : 'Cash Deficit'}
                </span>
                <input
                  type="number"
                  placeholder="0.00"
                  value={cashDeficit}
                  onChange={(e) => {
                    setCashDeficit(e.target.value);
                    if (e.target.value) {
                      setIsCustodyMatched(false);
                      setCashSurplus('');
                    }
                  }}
                  className="w-full mt-2 py-1 px-2 text-center text-xs font-mono font-bold rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Box 3: Surplus */}
              <div className="flex flex-col items-center justify-between p-3 rounded-xl border border-slate-300 bg-slate-50 text-center min-h-[90px]">
                <span className="font-extrabold text-[10px] text-emerald-700 leading-tight">
                  {isRtl ? 'زيادة النقدية بالخزينة بمبلغ' : 'Cash Surplus'}
                </span>
                <input
                  type="number"
                  placeholder="0.00"
                  value={cashSurplus}
                  onChange={(e) => {
                    setCashSurplus(e.target.value);
                    if (e.target.value) {
                      setIsCustodyMatched(false);
                      setCashDeficit('');
                    }
                  }}
                  className="w-full mt-2 py-1 px-2 text-center text-xs font-mono font-bold rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Notes Section: full width */}
            <div className="flex flex-col gap-1.5">
              <label className="font-extrabold text-[10px] text-slate-700">
                {isRtl ? 'ملاحظات وتوصيات الجرد' : 'Inventory Notes & Recommendations'}
              </label>
              <textarea
                rows={3}
                placeholder={isRtl ? 'اكتب ملاحظات وتوصيات جرد ومطابقة الخزينة يدوياً هنا...' : 'Write inventory remarks and verification notes here...'}
                value={auditNotes}
                onChange={(e) => setAuditNotes(e.target.value)}
                className="w-full p-2.5 text-xs rounded-xl border border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* CUSTODY REPLENISHMENT SECTION (ONLY FOR REGIONAL MANAGERS & ADMINS) */}
      {isManager && (
        <div className="mt-6 print:hidden max-w-5xl mx-auto w-full">
          <div className={`p-5 rounded-2xl border premium-shadow ${
            theme === 'dark' ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200/80 shadow-sm'
          }`}>
            <div className="flex items-center gap-2 mb-3 border-b pb-2 border-slate-100 dark:border-slate-800">
              <Coins className="text-amber-500 shrink-0 animate-pulse" size={18} />
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                {isRtl ? 'شحن واستعاضة العهدة النقدية للفرع' : 'Custody Replenishment & Balance Recharge'}
              </h3>
            </div>
            
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              {isRtl 
                ? 'تتيح هذه البوابة للمسؤولين شحن رصيد العهدة النقدية للمحطة أو الفرع المختار. سيؤدي تأكيد العملية إلى زيادة القيمة الاسمية للعيشة بمقدار مبلغ الشحن وتغذية الخزينة فوراً وتحديث الأرصدة والسيولة المتاحة.'
                : 'This portal allows administrators to recharge custody funds for the selected branch. Confirming this action instantly increases the nominal custody limit and updates cash availability.'
              }
            </p>

            <form onSubmit={handlePageReplenishSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              {selectedStationId === 'all' ? (
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    {isRtl ? 'اختر المحطة المستهدفة *' : 'Target Branch *'}
                  </label>
                  <select
                    required
                    value={replenishStationId}
                    onChange={(e) => setReplenishStationId(e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                      theme === 'dark' ? 'bg-[#1e293b] border-[#334155] text-white' : 'bg-white border-slate-200'
                    }`}
                  >
                    <option value="">{isRtl ? '-- اختر المحطة --' : '-- Select Branch --'}</option>
                    {allowedStations.map(st => (
                      <option key={st.id} value={st.id}>
                        {st.station_name} ({isRtl ? 'العهدة: ' : 'Custody: '}{st.custody_amount.toLocaleString()} EGP)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    {isRtl ? 'المحطة المستهدفة' : 'Target Branch'}
                  </label>
                  <div className={`px-3.5 py-2.5 rounded-xl border text-xs font-bold ${
                    theme === 'dark' ? 'bg-[#1e293b] border-[#334155] text-white' : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}>
                    {currentStation?.station_name || activeStation?.station_name}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  {isRtl ? 'مبلغ الاستعاضة والشحن (EGP) *' : 'Replenishment Amount (EGP) *'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={replenishAmount}
                  onChange={(e) => setReplenishAmount(e.target.value)}
                  placeholder={isRtl ? 'مثال: 50000' : 'e.g., 50000'}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                    theme === 'dark' ? 'bg-[#1e293b] border-[#334155] text-white' : 'bg-white border-slate-200'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  {isRtl ? 'ملاحظات / مستندات الشحن' : 'Recharge Notes / Docs'}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={replenishNotes}
                    onChange={(e) => setReplenishNotes(e.target.value)}
                    placeholder={isRtl ? 'رقم التحويل، الشيك البنكي...' : 'Cheque no., transfer ID...'}
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-xs focus:outline-none ${
                      theme === 'dark' ? 'bg-[#1e293b] border-[#334155] text-white' : 'bg-white border-slate-200'
                    }`}
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shrink-0 hover:scale-[1.01] cursor-pointer"
                  >
                    <Coins size={14} />
                    <span>{isRtl ? 'تغذية العهدة' : 'Recharge'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 100% INDEPENDENT PRINT LAYOUT */}
      <ReconciliationPrintSheet
        language={language}
        sheetTitle={sheetTitle}
        custodyBase={custodyBase}
        settledTotal={settledTotal}
        totalUnderSettlement={totalUnderSettlement}
        totalPending={totalPending}
        netCashAvailable={netCashAvailable}
        pendingTxs={pendingTxs}
        underSettlementTxs={underSettlementTxs}
        isCustodyMatched={isCustodyMatched}
        cashDeficit={cashDeficit}
        cashSurplus={cashSurplus}
        auditNotes={auditNotes}
        companyName={companyName}
        regionName={regionName}
        stationName={stationName}
        stationCode={stationCode}
      />

      {/* PORTAL FOR AUDITING AND REAL-TIME REVIEW DECISIONS */}
      <ReconciliationReviewModal
        language={language}
        theme={theme}
        reviewingTx={reviewingTx}
        onClose={() => setReviewingTx(null)}
        stations={stations}
        allTransactions={allTransactions}
        categories={categories}
        reviewComments={reviewComments}
        setReviewComments={setReviewComments}
        rejectReason={rejectReason}
        setRejectReason={setRejectReason}
        revertReason={revertReason}
        setRevertReason={setRevertReason}
        handleRevert={handleRevert}
        handleRejectVoucher={handleRejectVoucher}
        handleApproveVoucher={handleApproveVoucher}
        setPreviewImage={setPreviewImage}
      />

      {/* SINGLE VOUCHER PRINTER VIEW */}
      <VoucherModal
        transaction={printingTx}
        isOpen={printingTx !== null}
        onClose={() => setPrintingTx(null)}
        theme={theme}
      />

      {/* LIGHTBOX POPUP PREVIEW */}
      {previewImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-12 right-0 bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-full transition-all cursor-pointer"
            >
              <X size={20} />
            </button>
            <img 
              src={previewImage} 
              alt="Attachment Preview" 
              className="max-w-full max-h-[80vh] rounded-2xl object-contain border border-white/10 shadow-2xl"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      )}

      {/* DIALOG FOR SYSTEM AUTHORIZATION EXCEPTIONS */}
      {authError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`w-full max-w-sm p-5 rounded-2xl border shadow-2xl ${
            theme === 'dark' ? 'bg-[#0f172a] border-slate-800 text-slate-100' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center gap-3 text-rose-500 mb-3.5">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <h3 className="font-extrabold text-base">{isRtl ? 'عذراً: خطأ في الصلاحيات' : 'Authorization Required'}</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              {authError}
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setAuthError(null)}
                className="px-4.5 py-2 rounded-xl text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white shadow-md shadow-rose-500/10 cursor-pointer"
              >
                {isRtl ? 'فهمت ذلك' : 'Okay'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PERMANENT DELETION MODAL WITH MANDATORY JUSTIFICATION */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`w-full max-w-md p-5 rounded-2xl border shadow-2xl ${
            theme === 'dark' ? 'bg-[#0f172a] border-slate-800 text-slate-100' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center gap-3 text-rose-500 mb-3">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <h3 className="font-extrabold text-base">{isRtl ? 'تأكيد الحذف الإجباري والحتمي' : 'Confirm Permanent Deletion'}</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              {isRtl 
                ? 'هل أنت متأكد من رغبتك في حذف هذه الحركة بشكل نهائي ومسحها تماماً من قاعدة البيانات؟ لا يمكن الرجوع أو استعادة البيانات بعد ذلك.'
                : 'Are you sure you want to permanently delete this transaction? This action will write a deletion mark and is irreversible.'}
            </p>
            <div className="mb-4 space-y-1.5">
              <label className="block text-[10px] font-black uppercase text-slate-400">
                {isRtl ? 'سبب الحذف المحاسبي (إلزامي) *' : 'Reason for Deletion (Mandatory) *'}
              </label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder={isRtl ? 'اكتب تبرير الحذف للتوثيق المالي والمراجعة...' : 'Enter deletion justification...'}
                className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-rose-500 resize-none h-16 shadow-inner font-medium"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setDeletingId(null);
                  setDeleteReason('');
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={() => handleDelete(deletingId)}
                disabled={!deleteReason.trim()}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isRtl ? 'حذف نهائي' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION FOR REVERT ACTION */}
      {revertingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`w-full max-w-md p-5 rounded-2xl border shadow-2xl ${
            theme === 'dark' ? 'bg-[#0f172a] border-slate-800 text-slate-100' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center gap-3 text-amber-500 mb-3">
              <CornerUpLeft className="h-6 w-6 shrink-0" />
              <h3 className="font-extrabold text-base">{isRtl ? 'إلغاء تسوية المستند وإرجاعه' : 'Confirm Voucher Reversion'}</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              {isRtl 
                ? `هل أنت متأكد من رغبتك في إلغاء تسوية المستند رقم (${revertingTx.voucher_no || revertingTx.transaction_no}) وإرجاع جميع البند الملحقة به كحركات معلقة في الخزينة لتمكين التعديل؟`
                : `Are you sure you want to cancel the settlement of voucher (${revertingTx.voucher_no || revertingTx.transaction_no}) and return its constituent lines to pending?`}
            </p>
            <div className="space-y-1.5 mb-4">
              <label className="block text-[10px] font-black uppercase text-slate-400">
                {isRtl ? 'سبب الإرجاع للمعلق (اختياري)' : 'Revert Reason (Optional)'}
              </label>
              <textarea
                rows={2}
                value={revertReason}
                onChange={(e) => setRevertReason(e.target.value)}
                placeholder={isRtl ? 'اكتب ملاحظات الإرجاع هنا للتوضيح...' : 'Enter revert comments...'}
                className={`w-full p-2.5 text-xs rounded-xl border focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all font-medium ${
                  theme === 'dark' 
                    ? 'bg-[#1e293b] border-slate-800 text-slate-100 placeholder-slate-500' 
                    : 'bg-white border-slate-200 text-slate-800 placeholder-slate-400'
                }`}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setRevertingTx(null);
                  setRevertReason('');
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={() => handleRevert(revertingTx)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-all shadow-md shadow-amber-500/10"
              >
                {isRtl ? 'تأكيد الإرجاع' : 'Confirm Revert'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
