import React from 'react';
import { Sliders } from 'lucide-react';
import { PurchasingWorkflowConfig } from '../../types/purchasing';

interface PurchasingConfigTabProps {
  isRtl: boolean;
  workflowConfig: PurchasingWorkflowConfig;
  setWorkflowConfig: React.Dispatch<React.SetStateAction<PurchasingWorkflowConfig>>;
  handleSaveWorkflowConfig: (e: React.FormEvent) => void;
}

export default function PurchasingConfigTab({
  isRtl,
  workflowConfig,
  setWorkflowConfig,
  handleSaveWorkflowConfig,
}: PurchasingConfigTabProps) {
  return (
    <div className="space-y-8">
      <form onSubmit={handleSaveWorkflowConfig} className="space-y-6 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Sliders className="h-5 w-5 text-indigo-600" />
            {isRtl ? 'سياسات واعتمادات دورة المشتريات (No-Code Configuration)' : 'Purchasing Workflow & Approval Matrix'}
          </h2>
          <p className="text-xs text-slate-500">
            {isRtl ? 'تحديد مصفوفات الاعتماد حسب قيمة الشراء والبوادئ المستندية بدون الحاجة لأي تعديل برمجي مستقبلي' : 'Define approval limits and prefixes with zero future code updates needed'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              {isRtl ? 'بادئة طلبات الشراء (PR Prefix)' : 'PR Prefix'}
            </label>
            <input
              type="text"
              value={workflowConfig.prPrefix}
              onChange={e => setWorkflowConfig({ ...workflowConfig, prPrefix: e.target.value })}
              className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs font-mono font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              {isRtl ? 'بادئة أوامر الشراء (PO Prefix)' : 'PO Prefix'}
            </label>
            <input
              type="text"
              value={workflowConfig.poPrefix}
              onChange={e => setWorkflowConfig({ ...workflowConfig, poPrefix: e.target.value })}
              className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs font-mono font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              {isRtl ? 'بادئة عروض الأسعار (RFQ Prefix)' : 'RFQ Prefix'}
            </label>
            <input
              type="text"
              value={workflowConfig.rfqPrefix}
              onChange={e => setWorkflowConfig({ ...workflowConfig, rfqPrefix: e.target.value })}
              className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs font-mono font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              {isRtl ? 'بادئة كود الموردين (Vendor Prefix)' : 'Vendor Prefix'}
            </label>
            <input
              type="text"
              value={workflowConfig.vendorPrefix}
              onChange={e => setWorkflowConfig({ ...workflowConfig, vendorPrefix: e.target.value })}
              className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs font-mono font-bold"
            />
          </div>
        </div>

        <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            {isRtl ? 'خيارات التشغيل الآلي للسياسات' : 'Policy Automation Options'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <input
                type="checkbox"
                checked={workflowConfig.requirePrApproval}
                onChange={e => setWorkflowConfig({ ...workflowConfig, requirePrApproval: e.target.checked })}
                className="rounded text-indigo-600 h-4 w-4"
              />
              <div>
                <span className="text-xs font-bold block text-slate-800 dark:text-slate-200">
                  {isRtl ? 'اشتراط موافقة الإدارة على طلب الشراء (PR)' : 'Mandatory PR Approval'}
                </span>
                <span className="text-[10px] text-slate-400">
                  {isRtl ? 'منع تحويل طلب الشراء إلى أمر توريد إلا بعد اعتماده من المسؤول' : 'Prevent PO conversion until PR is approved by manager'}
                </span>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <input
                type="checkbox"
                checked={workflowConfig.allowDirectPoWithoutPr}
                onChange={e => setWorkflowConfig({ ...workflowConfig, allowDirectPoWithoutPr: e.target.checked })}
                className="rounded text-indigo-600 h-4 w-4"
              />
              <div>
                <span className="text-xs font-bold block text-slate-800 dark:text-slate-200">
                  {isRtl ? 'السماح بإصدار أمر شراء مباشر (Direct PO)' : 'Allow Direct PO Creation'}
                </span>
                <span className="text-[10px] text-slate-400">
                  {isRtl ? 'تمكين الشراء الفوري بدون المرور بطلب شراء مسجل مسبقاً' : 'Enable issuing POs without prior Purchase Request'}
                </span>
              </div>
            </label>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
          <button
            type="submit"
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md transition-all"
          >
            {isRtl ? 'حفظ السياسات والبوادئ' : 'Save Workflow Matrix'}
          </button>
        </div>
      </form>
    </div>
  );
}
