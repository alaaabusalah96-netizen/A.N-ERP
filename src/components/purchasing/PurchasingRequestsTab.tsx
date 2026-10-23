import React from 'react';
import { Plus, FileText, Building2, Printer, X, Check, Scale, ShoppingCart } from 'lucide-react';
import { PurchaseRequest } from '../../types/purchasing';
import { OrganizationUnit } from '../../types/organization';

export interface PurchasingRequestsTabProps {
  isRtl: boolean;
  requests: PurchaseRequest[];
  orgUnits: OrganizationUnit[];
  setShowCreatePR: React.Dispatch<React.SetStateAction<boolean>>;
  setPrintPR: React.Dispatch<React.SetStateAction<PurchaseRequest | null>>;
  handleRejectPR: (prId: string) => void;
  handleApprovePR: (prId: string) => void;
  setRfqSourcePrId: React.Dispatch<React.SetStateAction<string>>;
  setShowCreateRFQ: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveTab: React.Dispatch<React.SetStateAction<'requests' | 'rfq' | 'orders' | 'vendors' | 'config'>>;
  handleConvertPRToPO: (pr: PurchaseRequest) => void;
}

export default function PurchasingRequestsTab({
  isRtl,
  requests,
  orgUnits,
  setShowCreatePR,
  setPrintPR,
  handleRejectPR,
  handleApprovePR,
  setRfqSourcePrId,
  setShowCreateRFQ,
  setActiveTab,
  handleConvertPRToPO
}: PurchasingRequestsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">
            {isRtl ? 'طلبات الشراء والاحتياجات الداخلية' : 'Internal Purchase Requests (PR)'}
          </h2>
          <p className="text-xs text-slate-500">
            {isRtl ? 'تفريغ وتوثيق الاحتياجات واعتمادها وفق الصلاحيات المعرفة' : 'Manage internal requisition requests and approval chain'}
          </p>
        </div>
        <button
          onClick={() => setShowCreatePR(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all"
        >
          <Plus className="h-4 w-4" />
          {isRtl ? 'إنشاء طلب شراء جديد (PR)' : 'New Purchase Request'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {requests.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
            <FileText className="h-12 w-12 text-slate-400 mx-auto mb-3 opacity-50" />
            <p className="text-sm font-bold text-slate-600 dark:text-slate-400">
              {isRtl ? 'لا توجد طلبات شراء مسجلة حالياً' : 'No purchase requests recorded yet'}
            </p>
          </div>
        ) : (
          requests.map(pr => (
            <div key={pr.id} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100">{pr.prNumber}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        pr.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' :
                        pr.status === 'REJECTED' ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20' :
                        'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                      }`}>
                        {pr.status === 'APPROVED' ? (isRtl ? 'معتمد' : 'Approved') :
                         pr.status === 'REJECTED' ? (isRtl ? 'مرفوض' : 'Rejected') :
                         (isRtl ? 'قيد الاعتماد' : 'Pending Approval')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap mt-0.5">
                      <span>{isRtl ? `طالب الطلب: ${pr.requesterName}` : `Requested by: ${pr.requesterName}`}</span>
                      {pr.department && <span>| {pr.department}</span>}
                      {pr.org_unit_id && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                          <Building2 className="h-3 w-3" />
                          {orgUnits.find(u => u.id === pr.org_unit_id)?.nameAr || orgUnits.find(u => u.id === pr.org_unit_id)?.name}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">{pr.date}</span>
                  <span className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400">
                    {pr.totalAmount.toLocaleString()} {isRtl ? 'ج.م' : 'EGP'}
                  </span>
                </div>
              </div>

              {/* Items Summary Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500">
                      <th className="p-2 rounded-r-lg">{isRtl ? 'الكود' : 'Code'}</th>
                      <th className="p-2">{isRtl ? 'اسم المنتج' : 'Product'}</th>
                      <th className="p-2">{isRtl ? 'الكمية المطلوب الشراء لها' : 'Qty'}</th>
                      <th className="p-2">{isRtl ? 'السعر التقديري' : 'Est. Price'}</th>
                      <th className="p-2 rounded-l-lg">{isRtl ? 'الإجمالي' : 'Total'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {pr.items.map((it, idx) => (
                      <tr key={idx} className="text-slate-700 dark:text-slate-300">
                        <td className="p-2 font-mono font-bold text-slate-500">{it.productCode}</td>
                        <td className="p-2 font-bold">{it.productName}</td>
                        <td className="p-2">{it.qty} {it.unit}</td>
                        <td className="p-2">{it.estimatedPrice.toLocaleString()}</td>
                        <td className="p-2 font-bold">{ (it.qty * it.estimatedPrice).toLocaleString() }</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => setPrintPR(pr)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold"
                >
                  <Printer className="h-3.5 w-3.5" />
                  {isRtl ? 'طباعة إذن الطلب' : 'Print PR'}
                </button>

                <div className="flex items-center gap-2">
                  {pr.status === 'PENDING_APPROVAL' && (
                    <>
                      <button
                        onClick={() => handleRejectPR(pr.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-bold transition-all"
                      >
                        <X className="h-3.5 w-3.5" />
                        {isRtl ? 'رفض الطلب' : 'Reject'}
                      </button>
                      <button
                        onClick={() => handleApprovePR(pr.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {isRtl ? 'اعتماد الطلب' : 'Approve'}
                      </button>
                    </>
                  )}

                  {pr.status === 'APPROVED' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setRfqSourcePrId(pr.id);
                          setShowCreateRFQ(true);
                          setActiveTab('rfq');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100"
                      >
                        <Scale className="h-3.5 w-3.5" />
                        {isRtl ? 'طلب عروض أسعار (RFQ)' : 'Request RFQ'}
                      </button>
                      <button
                        onClick={() => handleConvertPRToPO(pr)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm"
                      >
                        <ShoppingCart className="h-3.5 w-3.5" />
                        {isRtl ? 'تحويل لأمر شراء توريد (PO)' : 'Issue PO'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
