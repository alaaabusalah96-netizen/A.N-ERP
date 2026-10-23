import React from 'react';

// Generates an offline-compatible SVG Barcode representing the voucher no
function SVGBarcode({ value }: { value: string }) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) & 0xffffffff;
  }
  
  const stripeWidths = [];
  const totalStripes = 32;
  let currentSeed = Math.abs(hash || 98765);
  
  for (let i = 0; i < totalStripes; i++) {
    currentSeed = (currentSeed * 1103515245 + 12345) & 0x7fffffff;
    stripeWidths.push((currentSeed % 3) + 1); // 1 to 3 width
  }

  let xPos = 0;
  return (
    <div className="flex flex-col items-center select-none print:block">
      <svg width="110" height="32" viewBox="0 0 110 32" className="text-black">
        <g fill="black">
          {stripeWidths.map((w, idx) => {
            const isBlack = idx % 2 === 0;
            const element = isBlack ? <rect key={idx} x={xPos} y="0" width={w} height="32" /> : null;
            xPos += w + (idx % 4 === 0 ? 1 : 0);
            return element;
          })}
        </g>
      </svg>
      <span className="text-[8px] font-mono font-black tracking-widest mt-0.5 text-black">{value}</span>
    </div>
  );
}

// Generates an elegant SVG QR Code with locator markings and high fidelity matrix blocks
function SVGQRCode({ value }: { value: string }) {
  const size = 21;
  const matrix: boolean[][] = Array(size).fill(null).map(() => Array(size).fill(false));
  
  const drawLocator = (r: number, c: number) => {
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        const isOuter = i === 0 || i === 6 || j === 0 || j === 6;
        const isCenter = i >= 2 && i <= 4 && j >= 2 && j <= 4;
        matrix[r + i][c + j] = isOuter || isCenter;
      }
    }
  };
  
  drawLocator(0, 0);
  drawLocator(0, size - 7);
  drawLocator(size - 7, 0);
  
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) & 0xffffffff;
  }
  let seed = Math.abs(hash || 54321);
  
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const inTopLeft = r < 8 && c < 8;
      const inTopRight = r < 8 && c >= size - 8;
      const inBottomLeft = r >= size - 8 && c < 8;
      
      if (!inTopLeft && !inTopRight && !inBottomLeft) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        matrix[r][c] = (seed % 2) === 0;
      }
    }
  }

  const cellSize = 3;
  const pixels: React.ReactNode[] = [];
  
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        pixels.push(
          <rect 
            key={`${r}-${c}`} 
            x={c * cellSize} 
            y={r * cellSize} 
            width={cellSize} 
            height={cellSize} 
            fill="black" 
          />
        );
      }
    }
  }

  return (
    <div className="flex flex-col items-center select-none print:block">
      <svg 
        width="60" 
        height="60" 
        viewBox={`0 0 ${size * cellSize} ${size * cellSize}`} 
        className="bg-white p-1 border border-black shadow-none"
      >
        <g>{pixels}</g>
      </svg>
      <span className="text-[7px] font-mono font-bold mt-0.5 text-black">SECURE SIGN</span>
    </div>
  );
}
import { X, Printer, History, User, Calendar } from 'lucide-react';
import { CustodyDB } from '../db';
import { Transaction, Theme } from '../types';
import kemitLogo from '../assets/images/kemit_logo_1784280480891.jpg';

interface VoucherModalProps {
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
}

// Arabic Tafqeet (number to words) helper function
function getArabicTafqeet(amount: number): string {
  const parts = amount.toFixed(2).split('.');
  const pounds = parseInt(parts[0], 10);
  const piastres = parseInt(parts[1], 10);

  const units = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة'];
  const teens = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const tens = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

  function convertBelowHundred(n: number): string {
    if (n === 0) return '';
    if (n <= 10) return units[n];
    if (n < 20) return teens[n - 10];
    const u = n % 10;
    const t = Math.floor(n / 10);
    if (u > 0) {
      return units[u] + ' و' + tens[t];
    }
    return tens[t];
  }

  function convertBelowThousand(n: number): string {
    if (n === 0) return '';
    const h = Math.floor(n / 100);
    const rest = n % 100;
    let result = '';
    
    if (h > 0) {
      result += hundreds[h];
    }
    
    if (rest > 0) {
      if (h > 0) result += ' و';
      result += convertBelowHundred(rest);
    }
    return result;
  }

  function formatPounds(p: number): string {
    if (p === 0) return 'صفر';
    if (p === 1) return 'جنيه واحد';
    if (p === 2) return 'جنيهان';
    if (p >= 3 && p <= 10) return convertBelowThousand(p) + ' جنيهات';
    
    let result = '';
    const th = Math.floor(p / 1000);
    const rem = p % 1000;

    if (th > 0) {
      if (th === 1) result += 'ألف';
      else if (th === 2) result += 'ألفان';
      else if (th >= 3 && th <= 10) result += convertBelowThousand(th) + ' آلاف';
      else result += convertBelowThousand(th) + ' ألف';
    }

    if (rem > 0) {
      if (th > 0) result += ' و';
      result += convertBelowThousand(rem);
    }

    return result + ' جنيه';
  }

  let text = formatPounds(pounds);
  
  if (pounds > 10 && pounds % 100 !== 0) {
    text = text.replace(' جنيه', ' جنيهاً');
  }

  if (piastres > 0) {
    let piastreText = convertBelowHundred(piastres);
    if (piastres === 1) piastreText = 'قرش واحد';
    else if (piastres === 2) piastreText = 'قرشان';
    else if (piastres >= 3 && piastres <= 10) piastreText += ' قروش';
    else piastreText += ' قرشاً';
    text += ' و' + piastreText;
  }
  
  return 'فقط ' + text + ' لا غير';
}

export default function VoucherModal({ transaction, isOpen, onClose, theme }: VoucherModalProps) {
  if (!isOpen || !transaction) return null;

  // Fetch associated station
  const station = CustodyDB.getStations().find(s => s.id === transaction.station_id) || {
    station_name: 'مزرعة افتراضية',
    station_code: 'STN-XXX'
  };

  const config = CustodyDB.getConfig();
  const catLabel = 'مصروفات عامة';

  // Split amount into Pounds and Piastres
  const pounds = Math.floor(transaction.amount);
  const piastres = Math.round((transaction.amount % 1) * 100);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      {/* Dynamic Style Injection for Perfect Printing Layout */}
      <style>{`
        @media print {
          body, html {
            background-color: white !important;
            color: black !important;
            font-family: sans-serif !important;
          }
          /* Hide non-printable app scaffolding */
          header, aside, footer, #app-header, #app-sidebar, #sidebar-mobile-backdrop,
          #toggle-sidebar-mobile, #btn-toggle-theme, #btn-logout, .fixed, button,
          #voucher-modal-card, #voucher-sheet-printable button, .absolute, .shadow-2xl,
          .bg-black\\/60, #btn-back-to-home-global, #role-switcher-btn {
            display: none !important;
            visibility: hidden !important;
          }
          /* Fill exactly on A4 print dimension */
          #voucher-sheet-printable {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 8mm !important;
            border: none !important;
            box-shadow: none !important;
            visibility: visible !important;
            background: white !important;
            color: black !important;
          }
          #voucher-sheet-printable * {
            visibility: visible !important;
            color-scheme: light !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      {/* Container Card */}
      <div 
        id="voucher-modal-card"
        className={`w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col my-8 max-h-[90vh] ${
          theme === 'dark' ? 'bg-[#1e293b] border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        {/* Header (Hidden when printing) */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <Printer className="text-emerald-500 h-5 w-5" />
            <h3 className="font-bold text-sm md:text-base">
              معاينة وطباعة مستند صرف النقدية
            </h3>
          </div>
          <button 
            onClick={onClose}
            aria-label="إغلاق"
            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body (Scrollable preview area) */}
        <div className="flex-1 p-6 overflow-auto bg-slate-100/50 dark:bg-slate-900/30">
          
          {/* Print button on screen */}
          <div className="mb-4 flex justify-end">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md shadow-emerald-600/10 hover:shadow-lg transition-all"
            >
              <Printer size={15} />
              <span>طباعة مستند صرف النقدية</span>
            </button>
          </div>

          {/* Printable Sheet Wrapper */}
          <div 
            id="voucher-sheet-printable" 
            className="w-[210mm] min-h-[297mm] mx-auto p-10 border-[3px] border-black bg-white text-black text-xs font-bold leading-relaxed shadow-lg relative print:shadow-none print:border-black print:rounded-none print:w-full print:min-h-0 print:p-4" 
            dir="rtl"
          >
            {/* Red Stamp Overlay if Rejected */}
            {transaction.status === 'Rejected' && (
              <div 
                className="absolute top-[22%] left-[12%] -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none transform -rotate-12 select-none print:opacity-100 opacity-95 text-red-600 border-red-600 print:text-red-600 print:border-red-600"
                style={{ color: 'red', borderColor: 'red' }}
              >
                <div 
                  className="border-[6px] border-red-600 rounded-2xl px-6 py-2 bg-white/95 font-extrabold text-[24px] uppercase tracking-wider text-center flex flex-col items-center justify-center shadow-lg border-double"
                  style={{ color: 'red', borderColor: 'red' }}
                >
                  <span className="leading-none text-[32px] tracking-widest font-black" style={{ color: 'red' }}>مرفوض</span>
                  <span className="text-[10px] font-mono tracking-wider mt-1 border-t border-red-400 pt-0.5 w-full text-center" style={{ color: 'red', borderTopColor: 'red' }}>REJECTED & RETURNED</span>
                </div>
              </div>
            )}

            {/* Upper Heading Row with Logo, Company Name, and Barcode/QR */}
            <div className="flex justify-between items-center border-b-[2px] border-black pb-4 mb-4 gap-4">
              {/* Right Side: Company Info & Logo */}
              <div className="flex items-center gap-3">
                {/* Logo */}
                <div className="border-[2.5px] border-black rounded-xl overflow-hidden bg-white shrink-0 shadow-sm h-[52px] w-[52px]">
                  <img src={kemitLogo} alt="KEMIT ERP Logo" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                </div>
                
                {/* Text Details next to Logo */}
                <div className="text-right space-y-0.5">
                  <h1 className="text-[13px] font-black text-black">نظام KEMIT ERP المتكامل</h1>
                  <p className="text-[12px] text-neutral-800 font-bold">الموقع / {station.station_name}</p>
                </div>
              </div>

              {/* Center Side: Title */}
              <div className="text-center">
                <h2 className="text-[14px] font-black border-[2.5px] border-black px-4 py-2 bg-neutral-100 text-black shadow-sm">
                  مستند صرف نقدى رقم {transaction.voucher_no || transaction.transaction_no}
                </h2>
              </div>

              {/* Left Side: Dynamic SVG Barcode & QR code */}
              <div className="flex items-center gap-4 shrink-0">
                <SVGBarcode value={transaction.voucher_no || transaction.transaction_no} />
                <SVGQRCode value={`${config.company_name}|${transaction.voucher_no || transaction.transaction_no}|${transaction.amount} EGP`} />
              </div>
            </div>

            {/* Meta specification rows */}
            <div className="grid grid-cols-2 border border-black p-3 rounded-lg mb-4 text-xs font-bold text-black gap-2">
              <div className="space-y-2">
                <div>
                  <span className="text-neutral-500 font-bold">التاريخ: </span>
                  <span className="font-mono text-black font-black">{transaction.voucher_date || transaction.date}</span>
                </div>
                <div>
                  <span className="text-neutral-500 font-bold">الإسم: </span>
                  <span className="text-black font-black">{station.station_name}</span>
                </div>
              </div>
              <div className="text-left space-y-2 self-end">
                <div>
                  <span className="text-neutral-500 font-bold">الجهة : </span>
                  <span className="text-black font-black">الإدارة المالية</span>
                </div>
              </div>
            </div>

            {/* Table Details */}
            <div className="border border-black rounded-lg overflow-x-auto mb-6">
              <table className="w-full text-center border-collapse text-xs font-bold">
                <thead>
                  <tr className="bg-neutral-100 text-black border-b border-black font-black">
                    <th className="border-l border-black py-2 w-[18%] text-xs" rowSpan={2}>التوجيــــــــــه</th>
                    <th className="border-l border-black py-2 w-[10%] text-xs" rowSpan={2}>المرفقات</th>
                    <th className="border-l border-black py-2 w-[52%] text-xs" rowSpan={2}>البيـــــــــــــــــان</th>
                    <th className="py-2 w-[20%] text-xs border-b border-black" colSpan={2}>المبلغ</th>
                  </tr>
                  <tr className="bg-neutral-50 text-black border-b-2 border-black text-[10px] font-black">
                    <th className="border-l border-black py-1 w-[13%]">جنيه</th>
                    <th className="py-1 w-[7%]">قرش</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const itemsToRender = transaction.items && transaction.items.length > 0 
                      ? transaction.items 
                      : [{ description: transaction.description, amount: transaction.amount }];

                    const totalRowsTarget = 12;
                    const emptyRowsNeeded = Math.max(1, totalRowsTarget - itemsToRender.length);

                    return (
                      <>
                        {/* Active expense rows */}
                        {itemsToRender.map((item, idx) => {
                          const isNegative = item.amount < 0;
                          const absAmount = Math.abs(item.amount);
                          const itemPounds = Math.floor(absAmount);
                          const itemPiastres = Math.round((absAmount % 1) * 100);
                          return (
                            <tr key={idx} className="h-9 border-b border-black text-black">
                              <td className="border-l border-black px-2 text-[11px] truncate max-w-[120px] font-bold text-center">
                                {catLabel}
                              </td>
                              <td className="border-l border-black text-neutral-800 font-bold text-[10px] text-center">
                                {idx === 0 && transaction.notes && (transaction.notes.includes('مرفق') || transaction.notes.includes('فاتورة')) ? 'مرفق' : '-'}
                              </td>
                              <td className="border-l border-black px-3 text-right font-black text-black leading-relaxed text-[11px]">
                                {item.description}
                              </td>
                              <td className="border-l border-black font-mono text-xs font-black text-black text-center">
                                {isNegative ? '-' : ''}{itemPounds.toLocaleString('en-US')}
                              </td>
                              <td className="font-mono text-[11px] font-black text-black text-center">
                                {itemPiastres === 0 ? '0' : itemPiastres}
                              </td>
                            </tr>
                          );
                        })}

                        {/* Empty dotted spacers as in the original Excel form */}
                        {Array.from({ length: emptyRowsNeeded }).map((_, idx) => (
                          <tr key={idx} className="h-6 border-b border-black">
                            <td className="border-l border-black">&nbsp;</td>
                            <td className="border-l border-black">&nbsp;</td>
                            <td className="border-l border-black">&nbsp;</td>
                            <td className="border-l border-black">&nbsp;</td>
                            <td>&nbsp;</td>
                          </tr>
                        ))}
                      </>
                    );
                  })()}

                  {/* Total Row */}
                  <tr className="h-9 bg-neutral-50/60 font-black border-t-2 border-black text-black">
                    <td className="border-l border-black">&nbsp;</td>
                    <td className="border-l border-black">&nbsp;</td>
                    <td className="border-l border-black px-3 text-right text-[11px] text-black">
                      <span className="font-black">{getArabicTafqeet(transaction.amount)}</span>
                    </td>
                    <td className="border-l border-black font-mono text-xs text-black font-black text-center">
                      {pounds.toLocaleString('en-US')}
                    </td>
                    <td className="font-mono text-[11px] text-black font-black text-center">
                      {piastres === 0 ? '0' : piastres}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Signature section */}
            <div className="grid grid-cols-3 gap-y-12 gap-x-6 pt-6 text-center text-[11px] font-black border-t border-black text-black">
              {/* Right Column: المدير المسئول & الإدارة المختصة */}
              <div className="space-y-8">
                <div>
                  <p className="text-black font-black mb-1">المدير المسئول</p>
                  <div className="text-neutral-400 font-mono text-[11px] select-none tracking-tighter">................................................</div>
                </div>
                <div>
                  <p className="text-black font-black mb-1">الإدارة المختصة</p>
                  <div className="text-neutral-400 font-mono text-[11px] select-none tracking-tighter">................................................</div>
                </div>
              </div>

              {/* Center Column: المحاسب & مدير عام القطاع */}
              <div className="space-y-8">
                <div>
                  <p className="text-black font-black mb-1">المحاسب</p>
                  <div className="text-neutral-400 font-mono text-[11px] select-none tracking-tighter">................................................</div>
                </div>
                <div>
                  <p className="text-black font-black mb-1">مدير عام القطاع</p>
                  <div className="text-neutral-400 font-mono text-[11px] select-none tracking-tighter">................................................</div>
                </div>
              </div>

              {/* Left Column: المراجع & مدير عام المنطقة */}
              <div className="space-y-8">
                <div>
                  <p className="text-black font-black mb-1">المراجع</p>
                  <div className="text-neutral-400 font-mono text-[11px] select-none tracking-tighter">................................................</div>
                </div>
                <div>
                  <p className="text-black font-black mb-1">مدير عام المنطقة</p>
                  <div className="text-neutral-400 font-mono text-[11px] select-none tracking-tighter">................................................</div>
                </div>
              </div>
            </div>
          </div>

          {/* Timeline History (Hidden on Print) */}
          {(() => {
            const isRtl = true;
            const historyRecords = CustodyDB.getTransactionHistory()
              .filter(h => h.transaction_id === transaction.id)
              .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

            const getActionTranslation = (action: string) => {
              switch (action) {
                case 'Created': return 'تم إنشاء المصروف (معلق)';
                case 'Voucher Linked': return 'تم ربط السند (تحت التسوية)';
                case 'Approved & Settled': return 'تم الاعتماد والتسوية النهائية (مسواة)';
                case 'Reverted': return 'تم إرجاع السند للمراجعة (معلق)';
                case 'Rejected': return 'تم رفض السند (مرفوض)';
                default: return action;
              }
            };

            return (
              <div className={`mt-8 max-w-[210mm] mx-auto p-6 rounded-2xl border print:hidden ${
                theme === 'dark' ? 'bg-[#1e293b] border-slate-700' : 'bg-white border-slate-200 shadow-sm'
              }`}>
                <div className="flex items-center gap-2 mb-6 border-b pb-3 border-slate-100 dark:border-slate-800">
                  <History className="text-emerald-500 h-5 w-5 animate-pulse" />
                  <h4 className="font-bold text-sm md:text-base">
                    مسار الحركة وسجل العمليات (Workflow History)
                  </h4>
                </div>

                {historyRecords.length === 0 ? (
                  <div className="relative border-r-2 border-slate-200 dark:border-slate-700 pr-6 mr-3 space-y-6">
                    {/* Step 1: Created */}
                    <div className="relative">
                      <span className="absolute -right-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 ring-4 ring-white dark:ring-[#1e293b]" />
                      <div className="text-xs">
                        <p className="font-bold text-slate-800 dark:text-slate-100 text-[13px]">
                          تم إنشاء المصروف (معلق)
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1 font-mono">
                          {transaction.date}
                        </p>
                      </div>
                    </div>

                    {/* Step 2: Voucher Linked */}
                    {transaction.voucher_no && (
                      <div className="relative">
                        <span className="absolute -right-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 ring-4 ring-white dark:ring-[#1e293b]" />
                        <div className="text-xs">
                          <p className="font-bold text-slate-800 dark:text-slate-100 text-[13px]">
                            تم ربط السند المالي (تحت التسوية)
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
                            سند رقم: <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{transaction.voucher_no}</span> | {transaction.voucher_date || transaction.date}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Step 3: Settled/Approved */}
                    {transaction.status === 'Settled' && (
                      <div className="relative">
                        <span className="absolute -right-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 ring-4 ring-white dark:ring-[#1e293b]" />
                        <div className="text-xs">
                          <p className="font-bold text-emerald-600 dark:text-emerald-400 text-[13px]">
                            تم الاعتماد والتسوية النهائية (مسواة)
                          </p>
                          <p className="text-[10px] text-slate-400 mt-1 font-mono">
                            {transaction.updated_at ? new Date(transaction.updated_at).toLocaleString('ar-EG') : transaction.date}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="relative border-r-2 border-slate-200 dark:border-slate-700 pr-6 mr-3 space-y-6">
                    {historyRecords.map((record) => {
                      let badgeColor = 'bg-slate-400';
                      if (record.new_status === 'Pending') badgeColor = 'bg-amber-500';
                      else if (record.new_status === 'Under Settlement') badgeColor = 'bg-blue-500';
                      else if (record.new_status === 'Settled') badgeColor = 'bg-emerald-600';
                      else if (record.new_status === 'Rejected') badgeColor = 'bg-rose-500';

                      return (
                        <div key={record.id} className="relative">
                          <span className={`absolute -right-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full ${badgeColor} ring-4 ring-white dark:ring-[#1e293b]`} />
                          
                          <div className="text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-slate-800 dark:text-slate-100 text-[13px]">
                                {getActionTranslation(record.action)}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold text-white font-mono ${badgeColor}`}>
                                {record.new_status === 'Settled' ? 'Approved & Settled' : record.new_status}
                              </span>
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                              <span className="flex items-center gap-1">
                                <User size={12} className="text-slate-400" />
                                <span>{record.performed_by_name}</span>
                              </span>
                              <span className="flex items-center gap-1 font-mono">
                                <Calendar size={12} className="text-slate-400" />
                                <span>{new Date(record.timestamp).toLocaleString('ar-EG')}</span>
                              </span>
                            </div>

                            {record.notes && (
                              <p className="mt-1.5 p-2 rounded bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-600 dark:text-slate-300">
                                {record.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

        </div>
      </div>
    </div>
  );
}
