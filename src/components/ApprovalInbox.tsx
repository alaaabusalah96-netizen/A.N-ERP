import React, { useState, useEffect } from 'react';
import { 
  Inbox, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  FileText, 
  Check, 
  X, 
  Search, 
  Filter, 
  User, 
  Building2, 
  DollarSign, 
  ArrowRight, 
  ArrowLeft,
  ShoppingCart,
  Receipt,
  Briefcase,
  Laptop as AssetIcon,
  Layers,
  MessageSquare,
  ShieldCheck,
  AlertTriangle,
  ChevronDown
} from 'lucide-react';
import { ApprovalEngine } from '../db/approvalEngine';
import { StorageEngine } from '../db/storage';
import { PurchasingBusinessEngine } from '../lib/enterprise/purchasing_engine';
import { TransactionsUpdateModule } from '../db/transactions.update';
import { TransactionsVoucherModule } from '../db/transactions.voucher';
import { 
  ApprovalInstance, 
  ApprovalWorkflowDefinition, 
  DOCUMENT_TYPE_LABELS 
} from '../types/approval';
import { AppUser, Language, Theme } from '../types';

interface ApprovalInboxProps {
  activeUser: AppUser;
  isRtl: boolean;
  theme: Theme;
  onActionComplete?: () => void;
}

export default function ApprovalInbox({
  activeUser,
  isRtl,
  theme,
  onActionComplete
}: ApprovalInboxProps) {
  const [tabMode, setTabMode] = useState<'PENDING' | 'HISTORY'>('PENDING');
  const [pendingInstances, setPendingInstances] = useState<ApprovalInstance[]>([]);
  const [historyInstances, setHistoryInstances] = useState<ApprovalInstance[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('ALL');

  // Selected Instance Modal
  const [selectedInstance, setSelectedInstance] = useState<ApprovalInstance | null>(null);
  const [commentText, setCommentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadInboxData();
  }, [activeUser]);

  const loadInboxData = () => {
    if (!activeUser || !activeUser.company_id) return;

    const companyId = activeUser.company_id;

    // Get pending items for active user
    const pending = ApprovalEngine.getPendingApprovalsForUser(companyId, {
      id: activeUser.id,
      role: activeUser.role,
      userRoles: activeUser.userRoles,
      org_unit_id: activeUser.org_unit_id || activeUser.station_id
    });
    setPendingInstances(pending);

    // Get historical items where active user participated
    const allInstances = StorageEngine.getStored<ApprovalInstance[]>('approval_instances', []);
    const history = allInstances.filter(i => 
      i.company_id === companyId && 
      (i.status === 'APPROVED' || i.status === 'REJECTED' || i.history.some(h => h.actorId === activeUser.id))
    );
    setHistoryInstances(history);
  };

  const getDocTypeIcon = (type: string) => {
    switch (type) {
      case 'PURCHASE_REQUEST':
      case 'PURCHASE_ORDER':
        return <ShoppingCart size={18} className="text-purple-500" />;
      case 'CASH_VOUCHER':
      case 'EXPENSE':
        return <Receipt size={18} className="text-amber-500" />;
      case 'SALES_INVOICE':
        return <DollarSign size={18} className="text-emerald-500" />;
      case 'PAYROLL_RUN':
        return <Briefcase size={18} className="text-blue-500" />;
      case 'FIXED_ASSET_DISPOSAL':
        return <AssetIcon size={18} className="text-rose-500" />;
      default:
        return <Layers size={18} className="text-indigo-500" />;
    }
  };

  const syncDownstreamDocumentStatus = async (instance: ApprovalInstance, isApproved: boolean) => {
    const statusStr = isApproved ? 'APPROVED' : 'REJECTED';
    const statusCamel = isApproved ? 'Approved' : 'Rejected';

    switch (instance.documentType) {
      case 'PURCHASE_REQUEST': {
        const prs = StorageEngine.getStored<any[]>('purchase_requests', []);
        const idx = prs.findIndex(p => p.id === instance.documentId);
        if (idx !== -1) {
          prs[idx].status = isApproved ? 'APPROVED' : 'REJECTED';
          await PurchasingBusinessEngine.savePurchaseRequests(prs);
        }
        break;
      }
      case 'PURCHASE_ORDER': {
        const pos = StorageEngine.getStored<any[]>('purchase_orders', []);
        const idx = pos.findIndex(p => p.id === instance.documentId);
        if (idx !== -1) {
          pos[idx].status = isApproved ? 'APPROVED' : 'REJECTED';
          await PurchasingBusinessEngine.savePurchaseOrders(pos);
        }
        break;
      }
      case 'CASH_VOUCHER': {
        const vouchers = TransactionsVoucherModule.getCashVouchers();
        const v = vouchers.find(item => item.id === instance.documentId);
        if (v) {
          v.status = statusCamel;
          await TransactionsVoucherModule.saveCashVoucher(v);
        }
        break;
      }
      case 'EXPENSE': {
        TransactionsUpdateModule.updateTransaction(instance.documentId, {
          status: isApproved ? 'Under Settlement' : 'Rejected'
        });
        const expList = StorageEngine.getStored<any[]>('Expenses', []);
        const expIdx = expList.findIndex(e => e.id === instance.documentId);
        if (expIdx !== -1) {
          expList[expIdx].status = statusCamel;
          StorageEngine.setStored('Expenses', expList);
        }
        break;
      }
      case 'SALES_INVOICE': {
        const sales = StorageEngine.getStored<any[]>('sales_invoices', []);
        const idx = sales.findIndex(s => s.id === instance.documentId);
        if (idx !== -1) {
          sales[idx].status = isApproved ? 'APPROVED' : 'REJECTED';
          StorageEngine.setStored('sales_invoices', sales);
        }
        break;
      }
      case 'INVENTORY_VOUCHER': {
        const invDocs = StorageEngine.getStored<any[]>('inventory_documents', []);
        const idx = invDocs.findIndex(d => d.id === instance.documentId);
        if (idx !== -1) {
          invDocs[idx].status = statusCamel;
          StorageEngine.setStored('inventory_documents', invDocs);
        }
        break;
      }
      case 'PAYROLL_RUN': {
        const payrolls = StorageEngine.getStored<any[]>('payroll_runs', []);
        const idx = payrolls.findIndex(p => p.id === instance.documentId);
        if (idx !== -1) {
          payrolls[idx].status = isApproved ? 'APPROVED' : 'REJECTED';
          StorageEngine.setStored('payroll_runs', payrolls);
        }
        break;
      }
      case 'FIXED_ASSET_DISPOSAL': {
        const disposals = StorageEngine.getStored<any[]>('asset_disposals', []);
        const idx = disposals.findIndex(d => d.id === instance.documentId);
        if (idx !== -1) {
          disposals[idx].status = isApproved ? 'APPROVED' : 'REJECTED';
          StorageEngine.setStored('asset_disposals', disposals);
        }
        break;
      }
    }
  };

  const handleApprove = async (instance: ApprovalInstance) => {
    try {
      setIsSubmitting(true);
      const res = await ApprovalEngine.approveStep({
        instanceId: instance.id,
        actor: {
          id: activeUser.id,
          name: activeUser.name,
          role: activeUser.role,
          userRoles: activeUser.userRoles
        },
        comments: commentText.trim() || undefined
      });

      if (res.isFinalApproval) {
        await syncDownstreamDocumentStatus(instance, true);
        alert(isRtl ? 'تم الاعتماد والتصديق النهائي بنجاح!' : 'Final approval granted successfully!');
      } else {
        alert(isRtl ? 'تم الشكير والاعتماد المبدئي. تم تمرير المستند للمرحلة التالية.' : 'Initial step approved. Passed to next approval level.');
      }

      setSelectedInstance(null);
      setCommentText('');
      loadInboxData();
      if (onActionComplete) onActionComplete();
    } catch (err: any) {
      alert(err.message || 'Failed to approve step');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async (instance: ApprovalInstance) => {
    if (!commentText.trim()) {
      alert(isRtl ? 'يرجى كتابة سبب الرفض في خانة الملاحظات' : 'Please provide a rejection reason in comments');
      return;
    }

    try {
      setIsSubmitting(true);
      const updated = await ApprovalEngine.rejectStep({
        instanceId: instance.id,
        actor: {
          id: activeUser.id,
          name: activeUser.name,
          role: activeUser.role
        },
        comments: commentText.trim()
      });

      await syncDownstreamDocumentStatus(instance, false);
      alert(isRtl ? 'تم رفض المستند وإشعار الجهة الطالبة.' : 'Document rejected and requester notified.');

      setSelectedInstance(null);
      setCommentText('');
      loadInboxData();
      if (onActionComplete) onActionComplete();
    } catch (err: any) {
      alert(err.message || 'Failed to reject step');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeList = tabMode === 'PENDING' ? pendingInstances : historyInstances;

  const filteredInstances = activeList.filter(inst => {
    if (docTypeFilter !== 'ALL' && inst.documentType !== docTypeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchDoc = (inst.documentId || '').toLowerCase().includes(q) ||
                       (inst.workflowName || '').toLowerCase().includes(q) ||
                       (inst.requesterName || '').toLowerCase().includes(q);
      if (!matchDoc) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
        theme === 'dark' ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-sm">
            <Inbox size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {isRtl ? 'صندوق اعتماداتي والتصديقات المستندية' : 'My Approvals & Verification Inbox'}
              </h3>
              {pendingInstances.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500 text-white animate-pulse">
                  {pendingInstances.length} {isRtl ? 'طلب بانتظارك' : 'Pending'}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {isRtl 
                ? 'متابعة واعتماد طلبات الشراء، سندات الصرف، الفواتير، والأذون المرفوعة وفقاً لصلاحياتك'
                : 'Review and decide on purchase requests, cash vouchers, invoices, & payroll runs.'}
            </p>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => setTabMode('PENDING')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              tabMode === 'PENDING'
                ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {isRtl ? 'بانتظار موافقتي' : 'Pending My Action'} ({pendingInstances.length})
          </button>
          <button
            type="button"
            onClick={() => setTabMode('HISTORY')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              tabMode === 'HISTORY'
                ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {isRtl ? 'سجل الاعتمادات السابقة' : 'Approval History'}
          </button>
        </div>
      </div>

      {/* Filter and Search controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isRtl ? 'بحث في الطلبات المستندية...' : 'Search pending items...'}
            className={`w-full pl-9 rtl:pl-3 rtl:pr-9 pr-3 py-1.5 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/20 ${
              theme === 'dark' ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
          />
        </div>

        <select
          value={docTypeFilter}
          onChange={(e) => setDocTypeFilter(e.target.value)}
          className={`w-full sm:w-auto px-3 py-1.5 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/20 ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}
        >
          <option value="ALL">{isRtl ? 'جميع أنواع المستندات' : 'All Document Types'}</option>
          {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {isRtl ? v.ar : v.en}
            </option>
          ))}
        </select>
      </div>

      {/* List View */}
      <div className="space-y-3">
        {filteredInstances.length === 0 ? (
          <div className={`p-12 text-center max-w-md mx-auto space-y-3 rounded-2xl border ${
            theme === 'dark' ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 size={24} />
            </div>
            <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
              {tabMode === 'PENDING'
                ? (isRtl ? 'لا توجد مستندات بانتظار اعتمادك حالياً' : 'All caught up! No pending approvals.')
                : (isRtl ? 'لا توجد سجلات اعتمادات سابقة مطابقة للبحث' : 'No approval history found.')
              }
            </h4>
            <p className="text-xs text-slate-400">
              {isRtl ? 'سيتم تنبيهك فور ورود أي طلب جديد يتطلب تصديقك المالي أو الإداري' : 'You will be notified when new requests require your review.'}
            </p>
          </div>
        ) : (
          filteredInstances.map(inst => {
            const docLabel = DOCUMENT_TYPE_LABELS[inst.documentType] || { ar: inst.documentType, en: inst.documentType };
            const isPending = inst.status === 'PENDING';

            return (
              <div
                key={inst.id}
                className={`p-4 rounded-2xl border transition-all ${
                  theme === 'dark' ? 'bg-slate-900/50 border-slate-800 hover:border-purple-900/60' : 'bg-white border-slate-200 hover:border-purple-200'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0">
                      {getDocTypeIcon(inst.documentType)}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-200/50">
                          {isRtl ? docLabel.ar : docLabel.en}
                        </span>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white font-mono">
                          {inst.documentId}
                        </h4>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          inst.status === 'PENDING' ? 'bg-amber-500/10 text-amber-600 border border-amber-200/50' :
                          inst.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-200/50' :
                          'bg-rose-500/10 text-rose-600 border border-rose-200/50'
                        }`}>
                          {inst.status === 'PENDING' ? (isRtl ? `المرحلة ${inst.currentStepNumber} من ${inst.totalSteps}` : `Step ${inst.currentStepNumber} of ${inst.totalSteps}`) :
                           inst.status === 'APPROVED' ? (isRtl ? 'معتمد كلياً' : 'Fully Approved') :
                           (isRtl ? 'مرفوض' : 'Rejected')}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                        <span>{isRtl ? 'المسار:' : 'Workflow:'} <strong className="text-slate-800 dark:text-slate-200">{inst.workflowName}</strong></span>
                        {inst.requesterName && <span>• {isRtl ? 'طالب الأمر:' : 'Requester:'} {inst.requesterName}</span>}
                        <span>• {new Date(inst.createdAt).toLocaleDateString()}</span>
                      </p>

                      {inst.amount !== undefined && (
                        <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono pt-0.5">
                          {isRtl ? 'القيمة المالية:' : 'Amount:'} {inst.amount.toLocaleString()} ج.م
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => { setSelectedInstance(inst); setCommentText(''); }}
                      className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>{isPending ? (isRtl ? 'اتخاذ القرار والاعتماد' : 'Review & Decide') : (isRtl ? 'معاينة التفاصيل' : 'View Details')}</span>
                    </button>
                  </div>
                </div>

                {/* Progress bar across steps */}
                <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center gap-1">
                  {Array.from({ length: inst.totalSteps }).map((_, idx) => {
                    const stepNum = idx + 1;
                    const isDone = stepNum < inst.currentStepNumber || inst.status === 'APPROVED';
                    const isCurrent = stepNum === inst.currentStepNumber && inst.status === 'PENDING';

                    return (
                      <div
                        key={stepNum}
                        className={`h-1.5 flex-1 rounded-full transition-all ${
                          isDone ? 'bg-emerald-500' :
                          isCurrent ? 'bg-amber-500 animate-pulse' :
                          'bg-slate-200 dark:bg-slate-800'
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* DETAIL & ACTION MODAL */}
      {selectedInstance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-xl rounded-2xl border shadow-xl overflow-hidden flex flex-col max-h-[90vh] ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getDocTypeIcon(selectedInstance.documentType)}
                <h3 className="font-bold text-sm">
                  {isRtl ? 'تفاصيل طلب الاعتماد والتدقيق' : 'Approval Request Details'}
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setSelectedInstance(null)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {/* Document Overview Card */}
              <div className="p-3.5 rounded-xl border bg-slate-50/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">{isRtl ? 'كود/رقم المستند:' : 'Document ID:'}</span>
                  <span className="font-bold font-mono text-purple-600 dark:text-purple-400">{selectedInstance.documentId}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">{isRtl ? 'نوع المستند:' : 'Document Type:'}</span>
                  <span className="font-bold">{DOCUMENT_TYPE_LABELS[selectedInstance.documentType]?.ar || selectedInstance.documentType}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">{isRtl ? 'اسم مسار الاعتماد:' : 'Workflow:'}</span>
                  <span className="font-bold">{selectedInstance.workflowName}</span>
                </div>
                {selectedInstance.requesterName && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">{isRtl ? 'طالب المستند:' : 'Requester:'}</span>
                    <span className="font-bold">{selectedInstance.requesterName}</span>
                  </div>
                )}
                {selectedInstance.amount !== undefined && (
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-700">
                    <span className="text-slate-400">{isRtl ? 'المبلغ الإجمالي الخاضع للاعتماد:' : 'Total Amount:'}</span>
                    <span className="font-extrabold font-mono text-emerald-600 dark:text-emerald-400 text-sm">
                      {selectedInstance.amount.toLocaleString()} ج.م
                    </span>
                  </div>
                )}
              </div>

              {/* Approval Steps History Timeline */}
              <div className="space-y-2">
                <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                  {isRtl ? 'سجل الموافقات السابقة والسلسلة:' : 'Approval History Chain:'}
                </h4>

                {selectedInstance.history.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">
                    {isRtl ? 'هذا هو المعتمد الأول في السلسلة (المرحلة الأولى)' : 'First step in the approval chain.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedInstance.history.map((rec, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl border text-xs bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-800 flex items-start gap-2"
                      >
                        <div className={`p-1 rounded-full shrink-0 mt-0.5 ${
                          rec.action === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-600' : 'bg-rose-500/20 text-rose-600'
                        }`}>
                          {rec.action === 'APPROVED' ? <Check size={12} /> : <X size={12} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200">
                            <span>{rec.stepName} ({rec.actorName})</span>
                            <span className="text-[10px] text-slate-400 font-normal">{new Date(rec.timestamp).toLocaleString()}</span>
                          </div>
                          {rec.comments && (
                            <p className="text-[11px] text-slate-500 mt-1 italic bg-white dark:bg-slate-900 p-1.5 rounded border border-slate-100 dark:border-slate-800">
                              "{rec.comments}"
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Comment / Decision Input for Pending Status */}
              {selectedInstance.status === 'PENDING' && (
                <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                    {isRtl ? 'الملاحظات الإدارية / سبب القرار:' : 'Approval Comments / Notes:'}
                  </label>
                  <textarea
                    rows={3}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={isRtl ? 'اكتب ملاحظاتك أو توجيهاتك هنا (مطلوبة عند الرفض)...' : 'Add your notes or approval reference (required for rejection)...'}
                    className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/20 ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50/50 dark:bg-slate-900/50">
              <button
                type="button"
                onClick={() => setSelectedInstance(null)}
                className="px-4 py-2 rounded-xl border text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                {isRtl ? 'إغلاق' : 'Close'}
              </button>

              {selectedInstance.status === 'PENDING' && (
                <>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleReject(selectedInstance)}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                  >
                    <X size={14} />
                    <span>{isRtl ? 'رفض المستند' : 'Reject Request'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleApprove(selectedInstance)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                  >
                    <Check size={14} />
                    <span>{isRtl ? 'اعتماد وتصديق' : 'Approve Request'}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
