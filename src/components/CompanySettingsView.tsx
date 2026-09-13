import React, { useState, useEffect } from 'react';
import { Building2, ShieldCheck, Database, Save, AlertCircle, CheckCircle2 } from 'lucide-react';

interface CompanySettingsViewProps {
  onNotification: (msg: string) => void;
}

export const CompanySettingsView: React.FC<CompanySettingsViewProps> = ({ onNotification }) => {
  const [formData, setFormData] = useState({
    nameAr: '',
    nameEn: '',
    crNumber: '',
    taxNumber: '',
    baseCurrency: 'ر.س',
    auditRetentionPolicyYears: 10,
    backendConfig: {
      adapterType: 'postgresql',
      connectionRef: 'DATABASE_URL',
      isolationLevel: 'Shared',
    },
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [taxError, setTaxError] = useState<string | null>(null);

  useEffect(() => {
    fetchCompanyData();
  }, []);

  const fetchCompanyData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/company');
      const data = await res.json();
      if (data.success && data.data) {
        setFormData(data.data);
      }
    } catch {
      onNotification('تعذر استرجاع بيانات المنشأة');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setTaxError(null);

    // Validate 15-digit ZATCA Tax ID
    if (!/^\d{15}$/.test(formData.taxNumber.trim())) {
      setTaxError('الرقم الضريبي يجب أن يتكون من 15 رقماً ويبدأ وينتهي بالرقم 3.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok) {
        onNotification('تم تحديث إعدادات وبيانات المنشأة بنجاح.');
      } else {
        setTaxError(data.detail || 'فشل حفظ التعديلات');
      }
    } catch {
      onNotification('حدث خطأ أثناء الاتصال بالخادم');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-xs text-slate-500">
        جارٍ تحميل بيانات المنشأة...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-700" />
          إعدادات المنشأة والنظام
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          إدارة البيانات القانونية والضريبية وسياسات الاحتفاظ بسجلات التدقيق
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Basic & Legal Info Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center justify-between">
            <span>البيانات الرسمية والقانونية</span>
            <span className="text-[11px] text-slate-400 font-normal">المملكة العربية السعودية</span>
          </h3>

          {taxError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{taxError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                اسم المنشأة (بالعربية) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.nameAr}
                onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                اسم المنشأة (بالإنجليزية)
              </label>
              <input
                type="text"
                value={formData.nameEn}
                onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white font-sans"
                dir="ltr"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                رقم السجل التجاري (CR) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.crNumber}
                onChange={(e) => setFormData({ ...formData, crNumber: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                الرقم الضريبي الموحد (15 خانة) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                maxLength={15}
                required
                value={formData.taxNumber}
                onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white font-mono"
                placeholder="300128472900003"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                معتمد ومطابق لاشتراطات الفوترة الإلكترونية (ZATCA)
              </span>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">العملة الأساسية للنظام</label>
              <select
                value={formData.baseCurrency}
                onChange={(e) => setFormData({ ...formData, baseCurrency: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
              >
                <option value="ر.س">ريال سعودي (SAR - ر.س)</option>
                <option value="د.إ">درهم إماراتي (AED)</option>
                <option value="د.ك">دينار كويتي (KWD)</option>
                <option value="USD">دولار أمريكي (USD)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                سياسة الاحتفاظ بسجلات التدقيق (بالسنوات)
              </label>
              <input
                type="number"
                min={5}
                max={25}
                value={formData.auditRetentionPolicyYears}
                onChange={(e) =>
                  setFormData({ ...formData, auditRetentionPolicyYears: Number(e.target.value) })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                الحد الأدنى النظامي 10 سنوات للسجلات المحاسبية والضريبية
              </span>
            </div>
          </div>
        </div>

        {/* Read-Only backendConfig Card (Section 1B) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-slate-600" />
              تكوين التخزين السحابي للمنشأة (للقراءة فقط)
            </h3>
            <span className="px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[11px] font-semibold">
              مقفل أمنياً (Read-Only)
            </span>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            وفق البند 1B والتعليمات المعمارية، إعدادات الربط المرجعي للتخزين{' '}
            <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">backendConfig</code>{' '}
            تُعرض للاطلاع فقط ولا يمكن تعديلها من شاشات إدارة الأعمال لمنع العبث بعزل البيانات.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-[11px] text-slate-500">نوع التخزين السحابي</div>
              <div className="font-bold text-slate-800 mt-1">
                {formData.backendConfig?.adapterType === 'postgresql' ? 'قاعدة بيانات علائقية (PostgreSQL)' : formData.backendConfig?.adapterType}
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-[11px] text-slate-500">المرجع السري للاتصال</div>
              <div className="font-bold text-slate-800 font-mono mt-1">
                {formData.backendConfig?.connectionRef || 'DATABASE_URL'}
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-[11px] text-slate-500">مستوى عزل المستأجر</div>
              <div className="font-bold text-emerald-700 mt-1">
                {formData.backendConfig?.isolationLevel || 'Shared (مستأجر آمن)'}
              </div>
            </div>
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl transition-colors shadow-2xs"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'جارٍ الحفظ...' : 'حفظ التعديلات الرسمية'}
          </button>
        </div>
      </form>
    </div>
  );
};
