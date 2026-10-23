import React from 'react';
import { Scale, Plus, Award, Check } from 'lucide-react';
import { RFQ, VendorQuotation } from '../../types/purchasing';

interface PurchasingRfqsTabProps {
  isRtl: boolean;
  rfqs: RFQ[];
  quotations: VendorQuotation[];
  setShowCreateRFQ: (show: boolean) => void;
  handleOpenSubmitQuote: (rfq: RFQ) => void;
  handleAcceptQuotation: (quoteId: string) => void;
}

export default function PurchasingRfqsTab({
  isRtl,
  rfqs,
  quotations,
  setShowCreateRFQ,
  handleOpenSubmitQuote,
  handleAcceptQuotation,
}: PurchasingRfqsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">
            {isRtl ? 'طلبات عروض الأسعار والتثمين (RFQ & Quotations)' : 'Requests for Quotations (RFQ) & Evaluation'}
          </h2>
          <p className="text-xs text-slate-500">
            {isRtl ? 'استدراج عروض الأسعار والمقارنة المباشرة واختيار أفضل عرض لإصدار أمر الشراء تلقائياً' : 'Request quotes from vendors, compare offers, and award winning quotation'}
          </p>
        </div>
        <button
          onClick={() => setShowCreateRFQ(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all"
        >
          <Plus className="h-4 w-4" />
          {isRtl ? 'إصدار طلب عرض أسعار جديد (RFQ)' : 'New RFQ'}
        </button>
      </div>

      <div className="space-y-4">
        {rfqs.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
            <Scale className="h-12 w-12 text-slate-400 mx-auto mb-3 opacity-50" />
            <p className="text-sm font-bold text-slate-600 dark:text-slate-400">
              {isRtl ? 'لا توجد طلبات عروض أسعار مسجلة حالياً' : 'No RFQs recorded yet'}
            </p>
          </div>
        ) : (
          rfqs.map(rfq => {
            const rfqQuotes = quotations.filter(q => q.rfqId === rfq.id);

            return (
              <div key={rfq.id} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600">
                      <Scale className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100">{rfq.rfqNumber}</span>
                        {rfq.prNumber && (
                          <span className="text-xs text-slate-500 font-mono">({rfq.prNumber})</span>
                        )}
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          rfq.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-blue-500/10 text-blue-600'
                        }`}>
                          {rfq.status === 'COMPLETED' ? (isRtl ? 'مكتمل / تم الترسية' : 'Completed') : (isRtl ? 'نشط / قيد استلام العروض' : 'Active')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {isRtl ? `تاريخ الإصدار: ${rfq.date} | الموعد النهائي: ${rfq.deadline || '-'}` : `Issued: ${rfq.date} | Deadline: ${rfq.deadline || '-'}`}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleOpenSubmitQuote(rfq)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold hover:bg-indigo-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {isRtl ? 'تسجيل عرض سعر مورد' : 'Record Quote'}
                  </button>
                </div>

                {/* Quotations comparison grid */}
                <div>
                  <h4 className="text-xs font-bold text-slate-500 mb-2">
                    {isRtl ? `العروض المقدمة من الموردين (${rfqQuotes.length}):` : `Received Quotes (${rfqQuotes.length}):`}
                  </h4>

                  {rfqQuotes.length === 0 ? (
                    <p className="text-xs italic text-slate-400 bg-slate-50 dark:bg-slate-800/30 p-3 rounded-xl text-center">
                      {isRtl ? 'لم يتم تقديم عروض أسعار من الموردين بعد لهذا الطلب' : 'No quotes submitted for this RFQ yet'}
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {rfqQuotes.map(quote => {
                        const isWinning = quote.status === 'ACCEPTED';

                        return (
                          <div key={quote.id} className={`p-4 rounded-xl border transition-all ${
                            isWinning 
                              ? 'bg-emerald-500/5 border-emerald-500/30 ring-2 ring-emerald-500/20' 
                              : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                          }`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-extrabold text-xs text-slate-800 dark:text-slate-100">{quote.vendorName}</span>
                              {isWinning ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-600 bg-emerald-100 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full">
                                  <Award className="h-3 w-3" />
                                  {isRtl ? 'العرض الفائز' : 'Awarded'}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-mono">#{quote.quoteNumber}</span>
                              )}
                            </div>

                            <div className="space-y-1 mb-3">
                              <div className="text-lg font-black text-indigo-600 dark:text-indigo-400">
                                {quote.totalAmount.toLocaleString()} {isRtl ? 'ج.م' : 'EGP'}
                              </div>
                              <p className="text-[11px] text-slate-500">
                                {isRtl ? `مدة التوريد: ${quote.deliveryDays || 7} أيام` : `Lead time: ${quote.deliveryDays || 7} days`}
                                {quote.paymentTerms && ` | ${quote.paymentTerms}`}
                              </p>
                            </div>

                            {!isWinning && rfq.status !== 'COMPLETED' && (
                              <button
                                onClick={() => handleAcceptQuotation(quote.id)}
                                className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-1"
                              >
                                <Check className="h-3.5 w-3.5" />
                                {isRtl ? 'قبول العرض وترسية الأمر' : 'Award & Issue PO'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
