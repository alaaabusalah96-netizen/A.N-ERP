import React, { useState } from 'react';
import { X, Plus, Trash2, CheckCircle, AlertTriangle } from 'lucide-react';
import { OperationalTransaction } from '../types/erp';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tx: OperationalTransaction, lines: LineEntry[]) => void;
  defaultType?: string;
  userName: string;
}

interface LineEntry {
  id: string;
  accountCode: string;
  accountName: string;
  costCenter: string;
  debit: number;
  credit: number;
  note: string;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  defaultType = 'قيد يومية عام',
  userName,
}) => {
  const [docType, setDocType] = useState(defaultType);
  const [docDate, setDocDate] = useState(new Date().toISOString().split('T')[0]);
  const [party, setParty] = useState('حسابات الأستاذ العام');
  const [statement, setStatement] = useState('');
  
  const [lines, setLines] = useState<LineEntry[]>([
    {
      id: '1',
      accountCode: '110101',
      accountName: 'الصندوق الرئيسي - الرياض',
      costCenter: 'الفرع الرئيسي',
      debit: 0,
      credit: 12500,
      note: 'إثبات سداد مستحقات تشغيلية',
    },
    {
      id: '2',
      accountCode: '520101',
      accountName: 'مصروفات تشغيلية وصيانة',
      costCenter: 'إدارة العمليات',
      debit: 12500,
      credit: 0,
      note: 'صيانة دورية للمعدات',
    },
  ]);

  if (!isOpen) return null;

  const totalDebit = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
  const difference = Math.abs(totalDebit - totalCredit);
  const isBalanced = totalDebit > 0 && difference === 0;

  const addLine = () => {
    setLines([
      ...lines,
      {
        id: String(Date.now()),
        accountCode: '',
        accountName: '',
        costCenter: 'الفرع الرئيسي',
        debit: 0,
        credit: 0,
        note: '',
      },
    ]);
  };

  const removeLine = (id: string) => {
    if (lines.length <= 2) return;
    setLines(lines.filter((l) => l.id !== id));
  };

  const updateLine = (id: string, field: keyof LineEntry, val: any) => {
    setLines(
      lines.map((line) => {
        if (line.id === id) {
          return { ...line, [field]: val };
        }
        return line;
      })
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBalanced) {
      return;
    }

    const newTx: OperationalTransaction = {
      id: `TX-${Date.now()}`,
      code: `JV-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      date: docDate,
      type: docType,
      description: statement || 'قيد تسوية واعتراف مالي',
      amount: totalDebit,
      currency: 'ر.س',
      party: party,
      status: 'بانتظار الاعتماد',
      initiator: userName,
    };

    // UI-OPS-1: pass journal lines so server can draft/post (was missing → 404/validation fail)
    onSave(newTx, lines);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800">إصدار مستند مالي تشغيلي</h3>
            <p className="text-xs text-slate-500">نظام A.N ERP - التحقق المالي وتوازن القيود</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">نوع المستند</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full text-xs font-medium border border-slate-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
              >
                <option value="قيد يومية عام">قيد يومية عام</option>
                <option value="سند صرف نقدي">سند صرف نقدي</option>
                <option value="سند قبض نقدي">سند قبض نقدي</option>
                <option value="إشعار تسوية مخزنية">إشعار تسوية مخزنية</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">التاريخ المحاسبي</label>
              <input
                type="date"
                value={docDate}
                onChange={(e) => setDocDate(e.target.value)}
                className="w-full text-xs font-medium border border-slate-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">الطرف المستفيد / الحساب المقابل</label>
              <input
                type="text"
                value={party}
                onChange={(e) => setParty(e.target.value)}
                placeholder="الجهة أو الحساب"
                className="w-full text-xs font-medium border border-slate-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">البيان والشرح العام</label>
            <input
              type="text"
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder="وصف تفصيلي للعملية المالية وسبب التحرير..."
              className="w-full text-xs font-medium border border-slate-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
              required
            />
          </div>

          {/* Line Items Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-700">بنود وأطراف القيد المحاسبي</span>
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1.5 text-xs text-blue-700 font-semibold hover:text-blue-800"
              >
                <Plus className="w-3.5 h-3.5" /> إضافة سطر
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">رمز الحساب</th>
                    <th className="p-2.5">اسم الحساب في الدليل</th>
                    <th className="p-2.5">مركز التكلفة</th>
                    <th className="p-2.5 w-28">مدين (ر.س)</th>
                    <th className="p-2.5 w-28">دائن (ر.س)</th>
                    <th className="p-2.5">البيان التفصيلي</th>
                    <th className="p-2.5 w-10 text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {lines.map((line) => (
                    <tr key={line.id} className="hover:bg-slate-50/70">
                      <td className="p-2">
                        <input
                          type="text"
                          value={line.accountCode}
                          onChange={(e) => updateLine(line.id, 'accountCode', e.target.value)}
                          placeholder="110xxx"
                          className="w-20 border border-slate-200 rounded px-2 py-1 text-xs"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={line.accountName}
                          onChange={(e) => updateLine(line.id, 'accountName', e.target.value)}
                          placeholder="اسم الحساب"
                          className="w-full border border-slate-200 rounded px-2 py-1 text-xs"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={line.costCenter}
                          onChange={(e) => updateLine(line.id, 'costCenter', e.target.value)}
                          placeholder="الفرع أو الإدارة"
                          className="w-28 border border-slate-200 rounded px-2 py-1 text-xs"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.debit || ''}
                          onChange={(e) => updateLine(line.id, 'debit', parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="w-full border border-slate-200 rounded px-2 py-1 text-xs text-left"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.credit || ''}
                          onChange={(e) => updateLine(line.id, 'credit', parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="w-full border border-slate-200 rounded px-2 py-1 text-xs text-left"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={line.note}
                          onChange={(e) => updateLine(line.id, 'note', e.target.value)}
                          placeholder="ملاحظات السطر"
                          className="w-full border border-slate-200 rounded px-2 py-1 text-xs"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          disabled={lines.length <= 2}
                          className="text-slate-400 hover:text-rose-600 disabled:opacity-30"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals & Balance Verification */}
            <div className="bg-slate-50 p-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-6">
                <div className="text-xs">
                  <span className="text-slate-500 ml-1">إجمالي المدين:</span>
                  <span className="font-bold text-slate-800">{totalDebit.toLocaleString()} ر.س</span>
                </div>
                <div className="text-xs">
                  <span className="text-slate-500 ml-1">إجمالي الدائن:</span>
                  <span className="font-bold text-slate-800">{totalCredit.toLocaleString()} ر.س</span>
                </div>
                <div className="text-xs">
                  <span className="text-slate-500 ml-1">الفارق:</span>
                  <span className={`font-bold ${difference === 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {difference.toLocaleString()} ر.س
                  </span>
                </div>
              </div>

              <div>
                {isBalanced ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                    <CheckCircle className="w-3.5 h-3.5" /> القيد متوازن ومستوفٍ للاشتراطات المحاسبية
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-50 px-3 py-1 rounded-full border border-rose-200">
                    <AlertTriangle className="w-3.5 h-3.5" /> القيد غير متوازن، يتعذر الحفظ قبل توازن الطرفين
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={!isBalanced}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              حفظ وإرسال للاعتماد المالي
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
