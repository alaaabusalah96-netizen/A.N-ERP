import React, { useEffect, useState } from 'react';
import { Building2, Save, AlertCircle } from 'lucide-react';

interface CompanyWizardViewProps {
  onNotification: (msg: string) => void;
}

type TemplateRow = { id: string; nameAr?: string; categoryAr?: string };

export const CompanyWizardView: React.FC<CompanyWizardViewProps> = ({ onNotification }) => {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loadingTpl, setLoadingTpl] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    countryCode: 'SA',
    companyNameAr: '',
    companyNameEn: '',
    taxNumber: '',
    activityTemplateId: 'tmpl-01',
    adminUsername: '',
    adminFullName: '',
    adminEmail: '',
    adminPassword: '',
  });

  useEffect(() => {
    (async () => {
      setLoadingTpl(true);
      try {
        const res = await fetch('/api/wizard/activity-templates', { credentials: 'include' });
        const data = await res.json().catch(() => null);
        const list = (data?.data || data || []) as TemplateRow[];
        if (Array.isArray(list) && list.length) {
          setTemplates(list);
          if (!list.some((t) => t.id === form.activityTemplateId)) {
            setForm((p) => ({ ...p, activityTemplateId: list[0].id }));
          }
        }
      } catch {
        onNotification('تعذر تحميل قوالب النشاط');
      } finally {
        setLoadingTpl(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.companyNameAr.trim()) {
      setError('اسم المنشأة بالعربية مطلوب');
      return;
    }
    if (!form.adminUsername.trim() || !form.adminPassword.trim()) {
      setError('بيانات مدير الشركة الأول مطلوبة');
      return;
    }
    setSaving(true);
    try {
      const idem =
        (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
        `wizard-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const body = {
        countryCode: form.countryCode,
        companyNameAr: form.companyNameAr.trim(),
        companyNameEn: form.companyNameEn.trim() || undefined,
        taxNumber: form.taxNumber.trim() || undefined,
        activityTemplateId: form.activityTemplateId,
        backendConfig: {
          adapterType: 'inmemory',
          connectionRef: 'DATABASE_URL',
          isolationLevel: 'Shared',
        },
        firstAdmin: {
          username: form.adminUsername.trim(),
          fullName: form.adminFullName.trim() || form.adminUsername.trim(),
          email: form.adminEmail.trim() || `${form.adminUsername.trim()}@example.local`,
          password: form.adminPassword,
        },
        idempotencyKey: idem,
      };
      const res = await fetch('/api/wizard/create-company', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idem,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.detail || data?.title || 'فشل إنشاء المنشأة');
        return;
      }
      onNotification('تم إنشاء المنشأة بنجاح (معالج المنصة).');
      setForm((p) => ({
        ...p,
        companyNameAr: '',
        companyNameEn: '',
        taxNumber: '',
        adminUsername: '',
        adminFullName: '',
        adminEmail: '',
        adminPassword: '',
      }));
    } catch {
      setError('تعذر الاتصال بالخادم أثناء إنشاء المنشأة');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-700" />
          إنشاء منشأة جديدة (المنصة)
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          مسار مدير المنصة فقط — يستدعي معالج الإنشاء الخلفي الجاهز. يتطلب صلاحية platform_admin أو super_admin.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        {error && (
          <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs space-y-1">
            <span className="font-bold text-slate-700">الدولة</span>
            <select
              className="w-full border border-slate-200 rounded-xl px-3 py-2"
              value={form.countryCode}
              onChange={(e) => onChange('countryCode', e.target.value)}
            >
              <option value="SA">السعودية (SA)</option>
              <option value="EG">مصر (EG)</option>
              <option value="AE">الإمارات (AE)</option>
              <option value="OM">عُمان (OM)</option>
              <option value="BH">البحرين (BH)</option>
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span className="font-bold text-slate-700">قالب النشاط</span>
            <select
              className="w-full border border-slate-200 rounded-xl px-3 py-2"
              value={form.activityTemplateId}
              onChange={(e) => onChange('activityTemplateId', e.target.value)}
              disabled={loadingTpl}
            >
              {(templates.length ? templates : [{ id: 'tmpl-01', nameAr: 'قالب افتراضي' }]).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nameAr || t.id}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs space-y-1 sm:col-span-2">
            <span className="font-bold text-slate-700">اسم المنشأة (عربي) *</span>
            <input
              className="w-full border border-slate-200 rounded-xl px-3 py-2"
              value={form.companyNameAr}
              onChange={(e) => onChange('companyNameAr', e.target.value)}
              required
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="font-bold text-slate-700">الاسم الإنجليزي</span>
            <input
              className="w-full border border-slate-200 rounded-xl px-3 py-2"
              value={form.companyNameEn}
              onChange={(e) => onChange('companyNameEn', e.target.value)}
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="font-bold text-slate-700">الرقم الضريبي</span>
            <input
              className="w-full border border-slate-200 rounded-xl px-3 py-2"
              value={form.taxNumber}
              onChange={(e) => onChange('taxNumber', e.target.value)}
            />
          </label>
        </div>

        <div className="border-t border-slate-100 pt-4 space-y-3">
          <p className="text-xs font-bold text-slate-800">مدير الشركة الأول</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs space-y-1">
              <span className="font-bold text-slate-700">اسم المستخدم *</span>
              <input
                className="w-full border border-slate-200 rounded-xl px-3 py-2"
                value={form.adminUsername}
                onChange={(e) => onChange('adminUsername', e.target.value)}
                required
              />
            </label>
            <label className="text-xs space-y-1">
              <span className="font-bold text-slate-700">الاسم الكامل</span>
              <input
                className="w-full border border-slate-200 rounded-xl px-3 py-2"
                value={form.adminFullName}
                onChange={(e) => onChange('adminFullName', e.target.value)}
              />
            </label>
            <label className="text-xs space-y-1">
              <span className="font-bold text-slate-700">البريد</span>
              <input
                type="email"
                className="w-full border border-slate-200 rounded-xl px-3 py-2"
                value={form.adminEmail}
                onChange={(e) => onChange('adminEmail', e.target.value)}
              />
            </label>
            <label className="text-xs space-y-1">
              <span className="font-bold text-slate-700">كلمة المرور *</span>
              <input
                type="password"
                className="w-full border border-slate-200 rounded-xl px-3 py-2"
                value={form.adminPassword}
                onChange={(e) => onChange('adminPassword', e.target.value)}
                required
              />
            </label>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl"
          >
            <Save className="w-4 h-4" />
            {saving ? 'جارٍ الإنشاء...' : 'إنشاء المنشأة'}
          </button>
        </div>
      </form>
    </div>
  );
};
