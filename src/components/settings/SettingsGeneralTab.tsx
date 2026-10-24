import React from 'react';
import { 
  Building, RefreshCw, AlertTriangle, Download, Upload, Lock, CheckCircle, Inbox
} from 'lucide-react';
import { Language, Theme, AppUser, Region, Station } from '../../types';
import { CustodyDB } from '../../db';
import CompanyBackendPanel from './CompanyBackendPanel';

interface SettingsGeneralTabProps {
  language: Language;
  theme: Theme;
  currentUser: AppUser;
  companyName: string;
  setCompanyName: (v: string) => void;
  custodyValue: string;
  setCustodyValue: (v: string) => void;
  useCustomTemplate: boolean;
  setUseCustomTemplate: (v: boolean) => void;
  customTemplateImage: string;
  setCustomTemplateImage: (v: string) => void;
  regions: Region[];
  stations: Station[];
  handleSaveConfig: (e: React.FormEvent) => void;
  handleBackupData: () => void;
  handleRestoreData: (e: React.ChangeEvent<HTMLInputElement>) => void;
  // Admin Security
  currentAdminPassword: string;
  setCurrentAdminPassword: (v: string) => void;
  newAdminPassword: string;
  setNewAdminPassword: (v: string) => void;
  confirmAdminPassword: string;
  setConfirmAdminPassword: (v: string) => void;
  adminSecurityError: string;
  adminSecuritySuccess: string;
  adminEmailResetStep: number;
  setAdminEmailResetStep: (v: number) => void;
  adminGeneratedCode: string;
  adminResetCodeInput: string;
  setAdminResetCodeInput: (v: string) => void;
  handleUpdateAdminPasswordDirectly: (e: React.FormEvent) => void;
  handleTriggerAdminEmailReset: () => void;
  handleVerifyAdminEmailCode: (e: React.FormEvent) => void;
  setAdminSecurityError: (v: string) => void;
  setAdminSecuritySuccess: (v: string) => void;
}

export default function SettingsGeneralTab({
  language,
  theme,
  currentUser,
  companyName,
  setCompanyName,
  useCustomTemplate,
  setUseCustomTemplate,
  customTemplateImage,
  setCustomTemplateImage,
  handleSaveConfig,
  handleBackupData,
  handleRestoreData,
  currentAdminPassword,
  setCurrentAdminPassword,
  newAdminPassword,
  setNewAdminPassword,
  confirmAdminPassword,
  setConfirmAdminPassword,
  adminSecurityError,
  adminSecuritySuccess,
  adminEmailResetStep,
  setAdminEmailResetStep,
  adminGeneratedCode,
  adminResetCodeInput,
  setAdminResetCodeInput,
  handleUpdateAdminPasswordDirectly,
  handleTriggerAdminEmailReset,
  handleVerifyAdminEmailCode,
  setAdminSecurityError,
  setAdminSecuritySuccess
}: SettingsGeneralTabProps) {
  const isRtl = language === 'ar';

  return (
    <div className="grid gap-6 md:grid-cols-2 animate-fade-in">
      <CompanyBackendPanel language={language} />
      {/* Card 1: General configuration */}
      <div className={`p-5 rounded-2xl border ${
        theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        <div className="flex items-center gap-2 mb-4 border-b pb-2.5 border-slate-100 dark:border-slate-800">
          <Building size={16} className="text-emerald-500" />
          <h3 className="font-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {isRtl ? 'إعدادات الشركة' : 'Company Settings'}
          </h3>
        </div>

        <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-400 font-bold mb-1">{isRtl ? 'اسم الشركة *' : 'Company Name *'}</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-200'
              }`}
              required
            />
          </div>

          {/* Custom Print Template Upload */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-4 mt-4 space-y-3">
            <h4 className="font-bold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-wider">
              {isRtl ? 'إعدادات قوالب الطباعة والهوية' : 'Print Layout & Branding Templates'}
            </h4>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="useCustomTemplate"
                checked={useCustomTemplate}
                onChange={(e) => setUseCustomTemplate(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="useCustomTemplate" className="text-slate-600 dark:text-slate-400 font-medium">
                {isRtl ? 'استخدام قالب تصميم خاص بالشركة (خلفية مخصصة)' : 'Use custom company backdrop template'}
              </label>
            </div>

            {useCustomTemplate && (
              <div className="p-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 space-y-2">
                <label className="block text-slate-500 font-semibold mb-1">
                  {isRtl ? 'تحميل نموذج التصميم (PDF أو صورة عالية الجودة)' : 'Upload backdrop template (PDF or High-quality image)'}
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setCustomTemplateImage(reader.result as string);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="block w-full text-xs text-slate-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-500/10 file:text-emerald-600 hover:file:bg-emerald-500/20"
                />
                {customTemplateImage && (
                  <div className="mt-2 space-y-1">
                    <span className="text-[10px] text-slate-400 block">
                      {isRtl ? '✓ تم تحميل الملف ومعالجته تلقائياً' : '✓ Template uploaded and processed successfully'}
                    </span>
                    <div className="h-16 w-24 border rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
                      <img src={customTemplateImage} alt="Template Preview" className="h-full object-contain" />
                    </div>
                    <button
                      type="button"
                      onClick={() => setCustomTemplateImage('')}
                      className="text-[10px] text-rose-500 hover:underline"
                    >
                      {isRtl ? 'حذف القالب' : 'Remove template'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black transition-all text-xs cursor-pointer"
          >
            {isRtl ? 'حفظ التغييرات' : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* Card 2: JSON Backup & Data Restore */}
      <div className={`p-5 rounded-2xl border ${
        theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        <div className="flex items-center gap-2 mb-4 border-b pb-2.5 border-slate-100 dark:border-slate-800">
          <RefreshCw size={16} className="text-indigo-500" />
          <h3 className="font-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {isRtl ? 'النسخ الاحتياطي واستعادة البيانات المرفقة' : 'Data Backup & Restore Panel'}
          </h3>
        </div>

        <div className="space-y-4 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          <p>
            {isRtl 
              ? 'يمكنك تصدير قاعدة البيانات بالكامل بما يشمل المحطات، الصلاحيات، الفواتير، والمسجل التاريخي، في ملف مشفر واحد لحماية بياناتك من الفقدان.' 
              : 'You can export all configurations, transaction histories, audit journals, and employee metadata locally as an offline JSON snapshot.'}
          </p>

          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-700 dark:text-amber-400 text-[11px] flex gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>
              {isRtl 
                ? 'تحذير: استعادة ملف احتياطي قديم سيقوم بدمج أو استبدال البيانات الحالية على هذا المتصفح ومزامنتها للجميع.' 
                : 'Warning: Uploading a database restore file will overwrite or combine matching records across your cloud storage.'}
            </span>
          </div>

          <div className="grid gap-3 pt-2">
            {/* Export Action */}
            <button
              onClick={handleBackupData}
              className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black transition-all text-xs cursor-pointer"
            >
              <Download size={15} />
              <span>{isRtl ? 'تصدير نسخة احتياطية فورية (JSON)' : 'Download Complete Backup (JSON)'}</span>
            </button>

            {/* Import Action */}
            <div className="relative">
              <input
                type="file"
                accept=".json"
                id="db-restore-upload"
                onChange={handleRestoreData}
                className="hidden"
              />
              <label
                htmlFor="db-restore-upload"
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold transition-all text-xs cursor-pointer"
              >
                <Upload size={15} />
                <span>{isRtl ? 'استيراد واستعادة قاعدة البيانات' : 'Restore database from JSON'}</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Card 3: Platform Admin Account Security (Exclusive to SystemAdmin) */}
      {currentUser && currentUser.role === 'SystemAdmin' && (
        <div className={`p-5 rounded-2xl border ${
          theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center gap-2 mb-4 border-b pb-2.5 border-slate-100 dark:border-slate-800">
            <Lock size={16} className="text-rose-500 animate-pulse" />
            <h3 className="font-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {isRtl ? 'أمان حساب أدمن المنصة والتحقق الثنائي' : 'Platform Admin Account Security & 2FA'}
            </h3>
          </div>

          {adminSecuritySuccess && (
            <div className="p-3 mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
              {adminSecuritySuccess}
            </div>
          )}

          {adminSecurityError && (
            <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-semibold">
              {adminSecurityError}
            </div>
          )}

          {adminEmailResetStep === 0 ? (
            <form onSubmit={handleUpdateAdminPasswordDirectly} className="space-y-4 text-xs">
              <p className="text-slate-500 text-[11px] leading-relaxed">
                {isRtl 
                  ? 'بصفتك مدير المنصة العام، يمكنك تحديث كلمة المرور الخاصة بك مباشرة باستخدام الرقم السري الحالي، أو اختبار كود التحقق الآمن عبر البريد الإلكتروني.' 
                  : 'As the Platform Admin, you can update your master credentials directly, or experience the secure email OTP simulation.'
                }
              </p>

              <div>
                <label className="block text-slate-400 font-bold mb-1">{isRtl ? 'كلمة المرور الحالية *' : 'Current Password *'}</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={currentAdminPassword}
                  onChange={(e) => setCurrentAdminPassword(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-1 focus:ring-rose-500 ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-200'
                  }`}
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">{isRtl ? 'كلمة المرور الجديدة *' : 'New Password *'}</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-1 focus:ring-rose-500 ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-200'
                  }`}
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">{isRtl ? 'تأكيد كلمة المرور الجديدة *' : 'Confirm New Password *'}</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={confirmAdminPassword}
                  onChange={(e) => setConfirmAdminPassword(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-1 focus:ring-rose-500 ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-200'
                  }`}
                  required
                />
              </div>

              <div className="grid gap-2 pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black transition-all text-xs cursor-pointer"
                >
                  {isRtl ? 'حفظ التحديث مباشرة 💾' : 'Save Changes Directly 💾'}
                </button>

                <button
                  type="button"
                  onClick={handleTriggerAdminEmailReset}
                  className="w-full py-2.5 rounded-xl border border-indigo-500 text-indigo-500 hover:bg-indigo-500/10 font-bold transition-all text-xs cursor-pointer flex items-center justify-center gap-1"
                >
                  <span>{isRtl ? 'إرسال كود تعيين للإيميل 📧' : 'Send Reset Code to Email 📧'}</span>
                </button>
              </div>
            </form>
          ) : adminEmailResetStep === 1 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-xs">
              <RefreshCw size={24} className="animate-spin text-indigo-500 mb-2" />
              <p className="text-slate-400">{isRtl ? 'جاري توليد كود التحقق المشفر وإرساله...' : 'Generating security verification code...'}</p>
            </div>
          ) : adminEmailResetStep === 2 ? (
            <form onSubmit={handleVerifyAdminEmailCode} className="space-y-4 text-xs">
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-xl text-[11px] leading-relaxed">
                {isRtl 
                  ? `تم توليد كود تحقق سري ومحاكاة إرساله إلى بريدك ${currentUser.email || 'user@domain.com'} بنجاح! يرجى نسخ الرمز المعروض بالأسفل وإدخاله هنا.` 
                  : `Security verification code has been dispatched to ${currentUser.email || 'user@domain.com'}. Please copy the code below.`
                }
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">{isRtl ? 'أدخل كود التحقق السري (6 أرقام) *' : 'Verification OTP (6 digits) *'}</label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="123456"
                  value={adminResetCodeInput}
                  onChange={(e) => setAdminResetCodeInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border text-center font-mono text-base tracking-widest focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:bg-slate-800 dark:border-slate-700 text-slate-200"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">{isRtl ? 'كلمة المرور الجديدة *' : 'New Password *'}</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-white border-slate-200'
                  }`}
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black transition-all text-xs cursor-pointer"
                >
                  {isRtl ? 'تأكيد وحفظ كلمة المرور' : 'Confirm & Save Password'}
                </button>
                <button
                  type="button"
                  onClick={() => setAdminEmailResetStep(0)}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-400 hover:text-slate-300 transition-all text-xs cursor-pointer"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center text-xs">
              <div className="h-10 w-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-2 animate-bounce">
                <CheckCircle size={20} />
              </div>
              <p className="font-bold text-slate-800 dark:text-slate-200">{isRtl ? 'تم تحديث كلمة المرور بالكامل!' : 'Password updated successfully!'}</p>
              <p className="text-[10px] text-slate-500 mt-1">{isRtl ? 'تم مزامنة الرقم السري الجديد مع الخادم السحابي بنجاح.' : 'New master key synced to Firestore.'}</p>
              <button
                onClick={() => {
                  setAdminEmailResetStep(0);
                  setAdminSecuritySuccess('');
                  setAdminSecurityError('');
                }}
                className="mt-4 px-4 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all text-[11px] font-bold cursor-pointer"
              >
                {isRtl ? 'العودة' : 'Go Back'}
              </button>
            </div>
          )}

          {/* Settings Internal Mailbox Simulator View */}
          {adminEmailResetStep === 2 && (
            <div className="mt-4 p-3 rounded-xl border border-indigo-500/20 bg-slate-900/90 text-slate-300 text-[11px] leading-relaxed">
              <div className="flex items-center gap-1.5 text-indigo-400 font-bold border-b border-slate-800 pb-1.5 mb-1.5 uppercase tracking-wider text-[9px]">
                <Inbox size={12} />
                <span>{isRtl ? 'علبة الوارد الافتراضية للمنصة' : `Virtual Mail Inbox (${currentUser.email || 'user@domain.com'})`}</span>
              </div>
              <p className="text-slate-200 font-bold">{isRtl ? '🔐 رمز الأمان السري لإعادة تعيين كلمة مرور KEMIT ERP' : '🔐 KEMIT ERP Security OTP'}</p>
              <p className="mt-1 text-slate-400">{isRtl ? 'الرمز المؤقت لتحديث حسابك بالكامل هو:' : 'Your master account OTP token is:'}</p>
              <div className="my-2 p-2 rounded bg-indigo-950/40 text-center font-mono text-base font-extrabold tracking-widest text-indigo-400">
                {adminGeneratedCode}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
