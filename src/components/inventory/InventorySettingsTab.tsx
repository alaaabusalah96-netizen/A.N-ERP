import React from 'react';
import {
  Workflow,
  Check,
  ShieldCheck,
  SlidersHorizontal,
  AlertTriangle,
  Layers,
  FileSpreadsheet
} from 'lucide-react';
import { InventoryWorkflowConfig } from '../../types/inventory';
import { InventoryModule } from '../../db/inventory';

export interface InventorySettingsTabProps {
  isRtl: boolean;
  theme: 'light' | 'dark';
  invConfig: InventoryWorkflowConfig;
  setInvConfig: React.Dispatch<React.SetStateAction<InventoryWorkflowConfig>>;
  configSavedToast: boolean;
  setConfigSavedToast: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function InventorySettingsTab({
  isRtl,
  theme,
  invConfig,
  setInvConfig,
  configSavedToast,
  setConfigSavedToast
}: InventorySettingsTabProps) {
  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className={`p-5 rounded-2xl border ${theme === 'dark' ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'} shadow-sm`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
              <Workflow size={24} />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-800 dark:text-slate-100">
                {isRtl ? 'قواعد ودورة عمل المخازن والتخصيص الذاتي' : 'Warehouse Workflow & Business Rules'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                {isRtl 
                  ? 'تخصيص سياسات الصرف، الربط المالي التلقائي، الرصيد السالب، الأرفف والباتشات حسب دورة عمل الشركة دون الحاجة لتعديل برمجي'
                  : 'Configure valuation, financial account mapping, negative stock policy, bin & batch enforcement dynamically'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              InventoryModule.saveInventoryConfig(invConfig);
              setConfigSavedToast(true);
              setTimeout(() => setConfigSavedToast(false), 3000);
            }}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <Check size={16} />
            <span>{isRtl ? 'حفظ قواعد العمل والتغييرات' : 'Save Workflow Rules'}</span>
          </button>
        </div>

        {configSavedToast && (
          <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-xl flex items-center gap-2">
            <ShieldCheck size={16} />
            <span>{isRtl ? 'تم حفظ وتطبيق قواعد وإعدادات دورة العمل المخزنية بنجاح!' : 'Warehouse workflow settings updated and applied successfully!'}</span>
          </div>
        )}
      </div>

      {/* Grid of Rule Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. Valuation & Dispatch Strategy */}
        <div className={`p-5 rounded-2xl border ${theme === 'dark' ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'} space-y-4`}>
          <div className="flex items-center gap-2 border-b pb-3 border-slate-200 dark:border-slate-800">
            <SlidersHorizontal size={18} className="text-emerald-500" />
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">
              {isRtl ? '1. سياسة تقييم وترتيب صرف المخزون' : '1. Dispatch Valuation Strategy'}
            </h3>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">
              {isRtl ? 'طريقة تحديد أولوية الصرف التلقائي للتشغيلات:' : 'Auto Dispatch Priority Strategy:'}
            </label>
            <select
              value={invConfig.valuation_method}
              onChange={(e) => setInvConfig({ ...invConfig, valuation_method: e.target.value as any })}
              className={`w-full px-3.5 py-2.5 text-xs font-bold rounded-xl border focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              <option value="FEFO">{isRtl ? '⭐ FEFO - الأقدم صلاحية أولاً (First Expired, First Out)' : '⭐ FEFO - First Expired, First Out'}</option>
              <option value="FIFO">{isRtl ? '📦 FIFO - الوارد أولاً يصرف أولاً (First In, First Out)' : '📦 FIFO - First In, First Out'}</option>
              <option value="LIFO">{isRtl ? '🔄 LIFO - الوارد أخيراً يصرف أولاً (Last In, First Out)' : '🔄 LIFO - Last In, First Out'}</option>
              <option value="MANUAL">{isRtl ? '✏️ MANUAL - اختيار يدوي مجرد بدون إجبار ترتيب' : '✏️ MANUAL - Manual Selection'}</option>
            </select>
            <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
              {isRtl 
                ? 'تؤثر هذه السياسة على الترتيب التلقائي للباتشات المتاحة عند إنشاء أذون الصرف والتحويل.' 
                : 'Controls automatic batch ordering during issue and transfer vouchers.'}
            </p>
          </div>
        </div>

        {/* 2. Negative Stock Policy */}
        <div className={`p-5 rounded-2xl border ${theme === 'dark' ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'} space-y-4`}>
          <div className="flex items-center gap-2 border-b pb-3 border-slate-200 dark:border-slate-800">
            <AlertTriangle size={18} className="text-amber-500" />
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">
              {isRtl ? '2. سياسة تجاوز الرصيد المتاح (السالب)' : '2. Negative Stock Policy'}
            </h3>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">
              {isRtl ? 'الإجراء المتخذ عند عدم كفاية الرصيد المخزني:' : 'Action upon insufficient warehouse balance:'}
            </label>
            <select
              value={invConfig.allow_overdraft}
              onChange={(e) => setInvConfig({ ...invConfig, allow_overdraft: e.target.value as any })}
              className={`w-full px-3.5 py-2.5 text-xs font-bold rounded-xl border focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              <option value="STRICT">{isRtl ? '⛔ STRICT - منع الصرف نهائياً عند عدم كفاية الرصيد (صارم)' : '⛔ STRICT - Strictly block insufficient balance'}</option>
              <option value="WARNING">{isRtl ? '⚠️ WARNING - إظهار تحذير لمسؤول الإدخال مع السماح بالمرور' : '⚠️ WARNING - Warn user but allow dispatch'}</option>
              <option value="ALLOWED">{isRtl ? '✅ ALLOWED - سماح تام ومطلق بالصرف بالسالب' : '✅ ALLOWED - Allow negative balance without restriction'}</option>
            </select>
            <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
              {isRtl 
                ? 'تتيح هذه السياسة للشركات ذات الأنشطة السريعة مرونة الصرف قبل تسجيل فواتير الوارد.' 
                : 'Provides flexibility for high-volume operational workflows.'}
            </p>
          </div>
        </div>

        {/* 3. Bin & Batch Tracking Policy */}
        <div className={`p-5 rounded-2xl border ${theme === 'dark' ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'} space-y-4`}>
          <div className="flex items-center gap-2 border-b pb-3 border-slate-200 dark:border-slate-800">
            <Layers size={18} className="text-blue-500" />
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">
              {isRtl ? '3. سياسات تتبع الأرفف والباتشات' : '3. Bin & Batch Tracking Policies'}
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">
                {isRtl ? 'تتبع الأرفف (Bins):' : 'Bin Locations:'}
              </label>
              <select
                value={invConfig.bin_tracking_policy}
                onChange={(e) => setInvConfig({ ...invConfig, bin_tracking_policy: e.target.value as any })}
                className={`w-full px-3 py-2 text-xs font-bold rounded-xl border ${
                  theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <option value="MANDATORY">{isRtl ? 'إلزامي لكل حركة' : 'Mandatory'}</option>
                <option value="OPTIONAL">{isRtl ? 'اختياري' : 'Optional'}</option>
                <option value="DISABLED">{isRtl ? 'معطل' : 'Disabled'}</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">
                {isRtl ? 'التشغيلات والصلاحيات:' : 'Batch & Expiry:'}
              </label>
              <select
                value={invConfig.batch_expiry_policy}
                onChange={(e) => setInvConfig({ ...invConfig, batch_expiry_policy: e.target.value as any })}
                className={`w-full px-3 py-2 text-xs font-bold rounded-xl border ${
                  theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <option value="MANDATORY">{isRtl ? 'إلزامي' : 'Mandatory'}</option>
                <option value="WARNING">{isRtl ? 'تحذير عند المنتهي' : 'Warn Expired'}</option>
                <option value="OPTIONAL">{isRtl ? 'اختياري' : 'Optional'}</option>
              </select>
            </div>
          </div>
        </div>

        {/* 4. Workflow Approval & Transfer Mode */}
        <div className={`p-5 rounded-2xl border ${theme === 'dark' ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'} space-y-4`}>
          <div className="flex items-center gap-2 border-b pb-3 border-slate-200 dark:border-slate-800">
            <ShieldCheck size={18} className="text-indigo-500" />
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">
              {isRtl ? '4. دورة التحويلات والاعتمادات' : '4. Transfer & Approval Workflow'}
            </h3>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">
              {isRtl ? 'دورة أذون التحويل بين الفروع والمخازن:' : 'Inter-Warehouse Transfer Cycle:'}
            </label>
            <select
              value={invConfig.transfer_approval_mode}
              onChange={(e) => setInvConfig({ ...invConfig, transfer_approval_mode: e.target.value as any })}
              className={`w-full px-3.5 py-2.5 text-xs font-bold rounded-xl border ${
                theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              <option value="TWO_STEP">{isRtl ? '🔄 دورة تحويل مرحلتين (صرف تحويل + استلام ومصادقة في المستلم)' : '🔄 Two-Step (Dispatch + Receive Audit)'}</option>
              <option value="DIRECT">{isRtl ? '⚡ تحويل فوري مباشر بدون خطوة استلام' : '⚡ Direct Immediate Transfer'}</option>
            </select>

            <div className="pt-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="require_app_chk"
                checked={invConfig.require_approval_for_posting}
                onChange={(e) => setInvConfig({ ...invConfig, require_approval_for_posting: e.target.checked })}
                className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
              />
              <label htmlFor="require_app_chk" className="text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                {isRtl ? 'اشتراط موافقة مدير المخازن قبل الاعتماد النهائي لسندات الحركة' : 'Require manager approval prior to finalizing documents'}
              </label>
            </div>
          </div>
        </div>

        {/* 5. Automated Accounting GL Settings */}
        <div className={`p-5 rounded-2xl border ${theme === 'dark' ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'} md:col-span-2 space-y-4`}>
          <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-purple-500" />
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">
                {isRtl ? '5. الربط المالي التلقائي للحسابات (Financial Mapping)' : '5. Automated Financial Mapping'}
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="auto_gl_chk"
                checked={invConfig.auto_post_accounting}
                onChange={(e) => setInvConfig({ ...invConfig, auto_post_accounting: e.target.checked })}
                className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
              />
              <label htmlFor="auto_gl_chk" className="text-xs font-bold text-emerald-600 dark:text-emerald-400 cursor-pointer">
                {isRtl ? 'تفعيل الربط المالي التلقائي' : 'Enable Automated Financial Sync'}
              </label>
            </div>
          </div>

          {invConfig.auto_post_accounting && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  {isRtl ? 'حساب أصول المخزون الرئيسي:' : 'Inventory Asset Account:'}
                </label>
                <input
                  type="text"
                  value={invConfig.default_inventory_account_code}
                  onChange={(e) => setInvConfig({ ...invConfig, default_inventory_account_code: e.target.value })}
                  placeholder="120101"
                  className={`w-full px-3 py-2 text-xs font-mono rounded-xl border ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  {isRtl ? 'حساب الموردين والذمم الدائنة:' : 'Accounts Payable (AP):'}
                </label>
                <input
                  type="text"
                  value={invConfig.default_ap_account_code}
                  onChange={(e) => setInvConfig({ ...invConfig, default_ap_account_code: e.target.value })}
                  placeholder="210101"
                  className={`w-full px-3 py-2 text-xs font-mono rounded-xl border ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  {isRtl ? 'حساب التكلفة والمصروفات:' : 'COGS / Operational Expense:'}
                </label>
                <input
                  type="text"
                  value={invConfig.default_cogs_account_code}
                  onChange={(e) => setInvConfig({ ...invConfig, default_cogs_account_code: e.target.value })}
                  placeholder="510101"
                  className={`w-full px-3 py-2 text-xs font-mono rounded-xl border ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  {isRtl ? 'حساب تسويات وعجز المخزون:' : 'Inventory Variance Account:'}
                </label>
                <input
                  type="text"
                  value={invConfig.default_variance_account_code}
                  onChange={(e) => setInvConfig({ ...invConfig, default_variance_account_code: e.target.value })}
                  placeholder="510401"
                  className={`w-full px-3 py-2 text-xs font-mono rounded-xl border ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  {isRtl ? 'حساب أرباح ومبيعات الخردة:' : 'Scrap / Wastage Account:'}
                </label>
                <input
                  type="text"
                  value={invConfig.default_scrap_account_code}
                  onChange={(e) => setInvConfig({ ...invConfig, default_scrap_account_code: e.target.value })}
                  placeholder="410101"
                  className={`w-full px-3 py-2 text-xs font-mono rounded-xl border ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  {isRtl ? 'نسبة تنبيه حد الأمان المخزني (%):' : 'Safety Reorder Level (%):'}
                </label>
                <input
                  type="number"
                  value={invConfig.reorder_alert_threshold_percent}
                  onChange={(e) => setInvConfig({ ...invConfig, reorder_alert_threshold_percent: parseInt(e.target.value) || 0 })}
                  placeholder="20"
                  className={`w-full px-3 py-2 text-xs font-mono rounded-xl border ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
