import React, { useState, useEffect } from 'react';
import { Sliders, Plus, CheckCircle2, FileText, Database } from 'lucide-react';

interface CustomFieldItem {
  id: string;
  targetEntity: string;
  fieldName: string;
  fieldLabelAr: string;
  fieldType: string;
  isRequired: boolean;
  options?: string[];
}

interface CustomFieldsViewProps {
  onNotification: (msg: string) => void;
}

export const CustomFieldsView: React.FC<CustomFieldsViewProps> = ({ onNotification }) => {
  const [fields, setFields] = useState<CustomFieldItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const [newField, setNewField] = useState({
    targetEntity: 'JOURNAL_ENTRY',
    fieldName: '',
    fieldLabelAr: '',
    fieldType: 'TEXT',
    isRequired: false,
    optionsRaw: '',
  });

  useEffect(() => {
    fetchFields();
  }, []);

  const fetchFields = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/custom-fields');
      const data = await res.json();
      if (data.success) {
        setFields(data.data);
      }
    } catch {
      onNotification('تعذر تحميل الحقول المخصصة');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddField = async (e: React.FormEvent) => {
    e.preventDefault();
    const options = newField.optionsRaw
      ? newField.optionsRaw.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    try {
      const res = await fetch('/api/custom-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetEntity: newField.targetEntity,
          fieldName: newField.fieldName,
          fieldLabelAr: newField.fieldLabelAr,
          fieldType: newField.fieldType,
          isRequired: newField.isRequired,
          options,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onNotification('تم إضافة الحقل المخصص بنجاح.');
        setShowAddModal(false);
        setNewField({
          targetEntity: 'JOURNAL_ENTRY',
          fieldName: '',
          fieldLabelAr: '',
          fieldType: 'TEXT',
          isRequired: false,
          optionsRaw: '',
        });
        fetchFields();
      } else {
        onNotification(data.error || 'فشل إضافة الحقل');
      }
    } catch {
      onNotification('حدث خطأ بالاتصال');
    }
  };

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Sliders className="w-5 h-5 text-blue-700" />
            التخصيص بدون كود (الحقول المخصصة)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            إضافة حقول تشغيلية إضافية وتوسيع جداول السندات والوثائق تلقائياً
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-xl transition-colors shadow-2xs"
        >
          <Plus className="w-3.5 h-3.5" />
          إضافة حقل جديد
        </button>
      </div>

      {/* Fields List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-900">الحقول النشطة في المنظومة</h3>
          <span className="text-[11px] text-slate-500">{fields.length} حقول معرفة</span>
        </div>

        <div className="divide-y divide-slate-100">
          {fields.map((f) => (
            <div key={f.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 text-blue-700 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    <span>{f.fieldLabelAr}</span>
                    <span className="font-mono text-[11px] text-slate-400 font-normal">
                      ({f.fieldName})
                    </span>
                    {f.isRequired && (
                      <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[10px]">
                        إلزامي
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-3">
                    <span>الكيان: {f.targetEntity === 'JOURNAL_ENTRY' ? 'القيود والسندات' : f.targetEntity}</span>
                    <span>•</span>
                    <span>النوع: {f.fieldType}</span>
                    {f.options && f.options.length > 0 && (
                      <>
                        <span>•</span>
                        <span>الخيارات: {f.options.join('، ')}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[11px] font-semibold border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  مفعّل تشغيلياً
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Field Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 text-right space-y-4">
            <h3 className="text-base font-bold text-slate-900">تعريف حقل مخصص جديد</h3>

            <form onSubmit={handleAddField} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">الكيان المستهدف</label>
                <select
                  value={newField.targetEntity}
                  onChange={(e) => setNewField({ ...newField, targetEntity: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
                >
                  <option value="JOURNAL_ENTRY">القيود والسندات المحاسبية</option>
                  <option value="USER">بيانات المستخدمين</option>
                  <option value="COMPANY">بيانات المنشأة</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">التسمية بالعربية</label>
                <input
                  type="text"
                  required
                  value={newField.fieldLabelAr}
                  onChange={(e) => setNewField({ ...newField, fieldLabelAr: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
                  placeholder="مثال: رقم العقد المرجعي"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">الاسم البرمجي (Technical Key)</label>
                <input
                  type="text"
                  required
                  value={newField.fieldName}
                  onChange={(e) => setNewField({ ...newField, fieldName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white font-mono"
                  placeholder="contractRefNumber"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">نوع البيانات</label>
                <select
                  value={newField.fieldType}
                  onChange={(e) => setNewField({ ...newField, fieldType: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
                >
                  <option value="TEXT">نصي (Text)</option>
                  <option value="NUMBER">رقمي (Number)</option>
                  <option value="DATE">تاريخ (Date)</option>
                  <option value="SELECT">قائمة اختيارات (Dropdown)</option>
                </select>
              </div>

              {newField.fieldType === 'SELECT' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    الخيارات المتاحة (مفصولة بفواصل)
                  </label>
                  <input
                    type="text"
                    value={newField.optionsRaw}
                    onChange={(e) => setNewField({ ...newField, optionsRaw: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
                    placeholder="مرحلة 1, مرحلة 2, نهائي"
                  />
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isRequired"
                  checked={newField.isRequired}
                  onChange={(e) => setNewField({ ...newField, isRequired: e.target.checked })}
                  className="rounded text-blue-700 focus:ring-blue-600"
                />
                <label htmlFor="isRequired" className="font-semibold text-slate-700 cursor-pointer">
                  هذا الحقل إلزامي عند إنشاء السند
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl shadow-2xs"
                >
                  حفظ الحقل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
