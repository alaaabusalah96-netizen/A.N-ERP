import React from 'react';
import { Language, Transaction } from '../types';

interface ReconciliationPrintSheetProps {
  language: Language;
  sheetTitle: string;
  custodyBase: number;
  settledTotal: number;
  totalUnderSettlement: number;
  totalPending: number;
  netCashAvailable: number;
  pendingTxs: Transaction[];
  underSettlementTxs: Transaction[];
  isCustodyMatched?: boolean;
  cashDeficit?: string;
  cashSurplus?: string;
  auditNotes?: string;
  companyName?: string;
  regionName?: string;
  stationName?: string;
  stationCode?: string;
}

export default function ReconciliationPrintSheet({
  language,
  sheetTitle,
  custodyBase,
  settledTotal,
  totalUnderSettlement,
  totalPending,
  netCashAvailable,
  pendingTxs,
  underSettlementTxs,
  isCustodyMatched,
  cashDeficit,
  cashSurplus,
  auditNotes,
  companyName,
  regionName,
  stationName,
  stationCode
}: ReconciliationPrintSheetProps) {
  const isRtl = language === 'ar';

  const formatVal = (val: number) => {
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EGP';
  };

  return (
    <>
      <style>{`
        @media print {
          /* Force page margins */
          @page {
            size: A4 portrait;
            margin: 20mm 15mm 20mm 15mm;
          }
          body {
            background: white !important;
            color: black !important;
            font-size: 11px !important;
          }
          /* Ensure other elements are hidden */
          .print-hidden, #sidebar, header, nav, button, select, input, .print-hide {
            display: none !important;
          }
          #reconciliation-sheet-printable {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            color: black !important;
          }
          table {
            border-collapse: collapse !important;
            width: 100% !important;
          }
          th, td {
            border: 1px solid #000000 !important;
            padding: 6px 8px !important;
            font-size: 10px !important;
            color: black !important;
          }
          th {
            background-color: #f1f5f9 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-badge {
            border: 1px solid #cbd5e1 !important;
            padding: 2px 6px !important;
            border-radius: 4px !important;
            font-weight: bold !important;
          }
          .print-page-break-avoid {
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      <div 
        id="reconciliation-sheet-printable" 
        className="hidden print:block p-8 bg-white text-slate-950 font-sans text-xs leading-relaxed" 
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        {/* Document Corporate Header */}
        <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900 mb-1">{sheetTitle}</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">
              {isRtl ? 'محضر مطابقة وجرد العهدة النقدية الرسمي' : 'Official Cash Reconciliation & Inventory Record'}
            </p>
            <div className="text-[10px] text-slate-800 font-semibold space-y-0.5 border-r-2 border-indigo-600 pr-2 mt-2">
              {companyName && <div>🏢 {isRtl ? `الشركة: ${companyName}` : `Company: ${companyName}`}</div>}
              {regionName && <div>🌍 {isRtl ? `المنطقة: ${regionName}` : `Region: ${regionName}`}</div>}
              {stationName && <div>📍 {isRtl ? `المحطة/الفرع: ${stationName}` : `Station/Branch: ${stationName}`} {stationCode ? `(${stationCode})` : ''}</div>}
            </div>
            <p className="text-[8px] text-slate-400 mt-2">
              {isRtl ? 'نظام KEMIT ERP المالي وإدارة العهد' : 'KEMIT ERP Enterprise Financial Engine'}
            </p>
          </div>
          <div className="text-left font-mono text-[9px] text-slate-600 space-y-1">
            <div className="font-bold text-slate-900">{isRtl ? 'كود السند: KM-RC-LEDGER' : 'Doc Ref: KM-RC-LEDGER'}</div>
            <div>
              {isRtl ? 'تاريخ الطباعة:' : 'Print Date:'} {new Date().toLocaleDateString(language)}
            </div>
            <div>
              {isRtl ? 'توقيت الطباعة:' : 'Print Time:'} {new Date().toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>

        {/* Financial Recap Table */}
        <div className="mb-6">
          <h3 className="text-[11px] font-bold text-slate-800 uppercase tracking-wider mb-2.5 border-r-2 border-slate-800 pr-2">
            {isRtl ? 'أولاً: ملخص المطابقة المالية والسيولة' : 'I. Financial Reconciliation & Cash Summary'}
          </h3>
          <table className="w-full text-right border-collapse border border-slate-400">
            <thead>
              <tr className="bg-slate-100 font-semibold text-slate-800">
                <th className="p-2 border border-slate-400 w-1/2">{isRtl ? 'البند المحاسبي' : 'Accounting Item'}</th>
                <th className="p-2 border border-slate-400 text-left font-mono w-1/2">{isRtl ? 'المبلغ المالي' : 'Amount'}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-2 border border-slate-400 font-bold">
                  {isRtl ? '١. قيمة العهدة الإسمية' : '1. Nominal Custody Value'}
                </td>
                <td className="p-2 border border-slate-400 text-left font-mono font-bold text-slate-900">{formatVal(custodyBase)}</td>
              </tr>
              <tr className="text-blue-800">
                <td className="p-2 border border-slate-400 font-medium pl-6">
                  {isRtl ? '٢. إجمالي مستندات الصرف تحت التسوية (-)' : '2. Total Expenses Under Settlement (-)'}
                </td>
                <td className="p-2 border border-slate-400 text-left font-mono font-bold">({formatVal(totalUnderSettlement)})</td>
              </tr>
              <tr className="text-amber-800">
                <td className="p-2 border border-slate-400 font-medium pl-6">
                  {isRtl ? '٣. إجمالي المعاملات النقدية المعلقة بالخزينة (-)' : '3. Total Pending Cash Transactions (-)'}
                </td>
                <td className="p-2 border border-slate-400 text-left font-mono font-bold">({formatVal(totalPending)})</td>
              </tr>
              <tr className="bg-slate-100 font-black text-emerald-800 text-sm">
                <td className="p-2.5 border-2 border-slate-900">
                  {isRtl ? '٤. السيولة النقدية المتبقية والواجب تواجدها بالخزينة (١ - ٢ - ٣)' : '4. Net Available Liquid Cash (Should Be Physically Present)'}
                </td>
                <td className="p-2.5 border-2 border-slate-900 text-left font-mono">{formatVal(netCashAvailable)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Breakdown of Operations */}
        <div className="space-y-6">
          
          {/* Section: Pending (معلق) */}
          <div className="print-page-break-avoid">
            <h3 className="text-[11px] font-bold text-slate-800 uppercase tracking-wider mb-2 border-r-2 border-slate-800 pr-2">
              {isRtl ? 'ثانياً: المعاملات المعلقة بالخزينة' : 'II. Pending Cash Transactions'}
            </h3>
            <table className="w-full text-right border-collapse border border-slate-400">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold">
                  <th className="p-2 border border-slate-400 text-center w-10">#</th>
                  <th className="p-2 border border-slate-400 w-28">{isRtl ? 'رقم الحركة' : 'Tx ID'}</th>
                  <th className="p-2 border border-slate-400 w-24">{isRtl ? 'التاريخ' : 'Date'}</th>
                  <th className="p-2 border border-slate-400">{isRtl ? 'البيان والوصف' : 'Description'}</th>
                  <th className="p-2 border border-slate-400 text-left w-32 font-mono">{isRtl ? 'المبلغ' : 'Amount'}</th>
                </tr>
              </thead>
              <tbody>
                {pendingTxs.map((tx, idx) => (
                  <tr key={tx.id} className="even:bg-slate-50/50">
                    <td className="p-1.5 border border-slate-400 text-center font-mono">{idx + 1}</td>
                    <td className="p-1.5 border border-slate-400 font-mono font-bold">{tx.transaction_no}</td>
                    <td className="p-1.5 border border-slate-400 font-mono">{tx.date}</td>
                    <td className="p-1.5 border border-slate-400 font-medium">{tx.description}</td>
                    <td className="p-1.5 border border-slate-400 text-left font-mono font-bold">{formatVal(tx.amount)}</td>
                  </tr>
                ))}
                {pendingTxs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-slate-500 italic">
                      {isRtl ? 'لا توجد حركات معلقة بالخزينة.' : 'No pending transactions.'}
                    </td>
                  </tr>
                )}
                <tr className="bg-slate-50 font-bold">
                  <td colSpan={4} className="p-2 border border-slate-400 text-right">{isRtl ? 'إجمالي المعاملات المعلقة:' : 'Total Pending:'}</td>
                  <td className="p-2 border border-slate-400 text-left font-mono text-slate-900">{formatVal(totalPending)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Section: Under Settlement (تحت التسوية) */}
          <div className="print-page-break-avoid">
            <h3 className="text-[11px] font-bold text-slate-800 uppercase tracking-wider mb-2 border-r-2 border-slate-800 pr-2">
              {isRtl ? 'ثالثاً: مستندات الصرف تحت التسوية (الحوافظ)' : 'III. Under Settlement Vouchers (CPVs)'}
            </h3>
            <table className="w-full text-right border-collapse border border-slate-400">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold">
                  <th className="p-2 border border-slate-400 text-center w-10">#</th>
                  <th className="p-2 border border-slate-400 w-28">{isRtl ? 'رقم الحافظة' : 'Voucher No'}</th>
                  <th className="p-2 border border-slate-400 w-24">{isRtl ? 'التاريخ' : 'Date'}</th>
                  <th className="p-2 border border-slate-400">{isRtl ? 'البيان والوصف' : 'Description'}</th>
                  <th className="p-2 border border-slate-400 text-left w-32 font-mono">{isRtl ? 'المبلغ' : 'Amount'}</th>
                </tr>
              </thead>
              <tbody>
                {underSettlementTxs.map((tx, idx) => (
                  <tr key={tx.id} className="even:bg-slate-50/50">
                    <td className="p-1.5 border border-slate-400 text-center font-mono">{idx + 1}</td>
                    <td className="p-1.5 border border-slate-400 font-mono font-bold">{tx.voucher_no || 'N/A'}</td>
                    <td className="p-1.5 border border-slate-400 font-mono">{tx.voucher_date || tx.date}</td>
                    <td className="p-1.5 border border-slate-400 font-medium">{tx.description}</td>
                    <td className="p-1.5 border border-slate-400 text-left font-mono font-bold">{formatVal(tx.amount)}</td>
                  </tr>
                ))}
                {underSettlementTxs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-slate-500 italic">
                      {isRtl ? 'لا توجد مستندات صرف تحت التسوية.' : 'No vouchers under settlement.'}
                    </td>
                  </tr>
                )}
                <tr className="bg-slate-50 font-bold">
                  <td colSpan={4} className="p-2 border border-slate-400 text-right">{isRtl ? 'إجمالي تحت التسوية:' : 'Total Under Settlement:'}</td>
                  <td className="p-2 border border-slate-400 text-left font-mono text-slate-900">{formatVal(totalUnderSettlement)}</td>
                </tr>
              </tbody>
            </table>
          </div>

        </div>

        {/* Section IV: Physical Verification findings */}
        <div className="mt-8 print-page-break-avoid border-t border-slate-400 pt-6">
          <h3 className="text-[11px] font-bold text-slate-800 uppercase tracking-wider mb-3 border-r-2 border-slate-800 pr-2">
            {isRtl ? 'رابعاً: نتائج الجرد الفعلي والمطابقة الميدانية' : 'IV. Physical Count Findings & Verification'}
          </h3>
          
          <div className="grid grid-cols-3 gap-4 mb-4">
            {/* Box 1: Reconciled */}
            <div className="border border-slate-400 p-3 rounded text-center min-h-[75px] flex flex-col justify-between bg-white">
              <span className="font-bold text-[10px] text-slate-900 block leading-tight">
                {isRtl ? 'العهدة متطابقة' : 'Custody matches'}
              </span>
              <div className="mt-2 text-base font-bold text-slate-900 min-h-[24px] flex items-center justify-center">
                {isCustodyMatched ? (
                  <span className="border border-slate-900 px-3 py-0.5 rounded font-bold text-xs bg-slate-100">✓ {isRtl ? 'نعم / متطابقة' : 'Yes / Matches'}</span>
                ) : (
                  <span className="border border-slate-400 border-dashed w-7 h-7 rounded inline-block" />
                )}
              </div>
            </div>

            {/* Box 2: Deficit */}
            <div className="border border-slate-400 p-3 rounded text-center min-h-[75px] flex flex-col justify-between bg-white">
              <span className="font-bold text-[10px] text-slate-900 block leading-tight">
                {isRtl ? 'عجز نقدية الخزينة بمبلغ' : 'Cash Deficit Amount'}
              </span>
              <div className="mt-2 text-xs font-mono font-bold text-slate-900 min-h-[24px] flex items-center justify-center">
                {cashDeficit ? (
                  <span className="border border-slate-900 px-2 py-0.5 rounded font-mono font-bold bg-slate-100">{cashDeficit} EGP</span>
                ) : (
                  <span className="border-b border-slate-400 border-dashed w-2/3 h-5 inline-block mt-2" />
                )}
              </div>
            </div>

            {/* Box 3: Surplus */}
            <div className="border border-slate-400 p-3 rounded text-center min-h-[75px] flex flex-col justify-between bg-white">
              <span className="font-bold text-[10px] text-slate-900 block leading-tight">
                {isRtl ? 'زيادة النقدية بالخزينة بمبلغ' : 'Cash Surplus Amount'}
              </span>
              <div className="mt-2 text-xs font-mono font-bold text-slate-900 min-h-[24px] flex items-center justify-center">
                {cashSurplus ? (
                  <span className="border border-slate-900 px-2 py-0.5 rounded font-mono font-bold bg-slate-100">{cashSurplus} EGP</span>
                ) : (
                  <span className="border-b border-slate-400 border-dashed w-2/3 h-5 inline-block mt-2" />
                )}
              </div>
            </div>
          </div>

          {/* Large Notes box */}
          <div className="border border-slate-400 p-3 rounded min-h-[90px] flex flex-col justify-start bg-white">
            <span className="font-bold text-[10px] text-slate-900 block mb-2">
              {isRtl ? 'ملاحظات وتوصيات الجرد الميداني:' : 'Field Inventory Notes & Remarks:'}
            </span>
            {auditNotes ? (
              <p className="text-[10px] text-slate-800 leading-normal whitespace-pre-wrap">{auditNotes}</p>
            ) : (
              <div className="space-y-4 mt-2 w-full">
                <div className="border-b border-slate-300 border-dashed h-4 w-full" />
                <div className="border-b border-slate-300 border-dashed h-4 w-full" />
              </div>
            )}
          </div>
        </div>

        {/* Verification and Signatures */}
        <div className="mt-12 pt-6 border-t border-slate-400 print-page-break-avoid">
          <div className="text-[10px] italic text-slate-600 mb-6 text-center">
            {isRtl 
              ? 'نشهد نحن الموقعين أدناه بصفتنا المسؤولين عن الخزينة والتدقيق والمطابقة، بأن الأرقام المذكورة أعلاه صحيحة ومطابقة ومثبتة بالمستندات المرفقة.'
              : 'We, the undersigned, in our capacities as cash custodians, auditors, and authorized approvers, certify that the figures listed above are accurate, fully reconciled, and backed by attached supporting documentation.'}
          </div>
          <div className="grid grid-cols-3 gap-8 text-center text-[10px] font-bold mt-12">
            <div>
              <div className="mb-10 text-slate-800">{isRtl ? 'أمين العهدة (المطابق)' : 'Cashier / Recipient'}</div>
              <div className="border-b border-slate-400 w-32 mx-auto mb-2" />
              <div className="text-slate-400 font-normal">{isRtl ? 'الاسم والتوقيع والاسم' : 'Name, Signature & Date'}</div>
            </div>
            <div>
              <div className="mb-10 text-slate-800">{isRtl ? 'القسم المالي والتدقيق' : 'Finance / Auditor'}</div>
              <div className="border-b border-slate-400 w-32 mx-auto mb-2" />
              <div className="text-slate-400 font-normal">{isRtl ? 'الاسم والتوقيع والاسم' : 'Name, Signature & Date'}</div>
            </div>
            <div>
              <div className="mb-10 text-slate-800">{isRtl ? 'الاعتماد والموافقة النهائية' : 'Authorized Approver'}</div>
              <div className="border-b border-slate-400 w-32 mx-auto mb-2" />
              <div className="text-slate-400 font-normal">{isRtl ? 'الاسم والتوقيع والاسم' : 'Name, Signature & Date'}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
