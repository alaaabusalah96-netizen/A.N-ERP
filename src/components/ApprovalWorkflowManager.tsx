import React, { useState, useEffect } from 'react';
import { 
  GitMerge, 
  Plus, 
  Edit, 
  Trash2, 
  Check, 
  X, 
  ShieldCheck, 
  ArrowRight, 
  ArrowLeft,
  DollarSign, 
  Layers, 
  UserCheck, 
  Sparkles, 
  FileText, 
  CheckCircle2, 
  AlertCircle,
  Building2,
  Lock,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { ApprovalEngine } from '../db/approvalEngine';
import { OrganizationEngine } from '../db/organizationEngine';
import { CustodyDB } from '../db';
import { 
  ApprovalWorkflowDefinition, 
  ApprovalStepDefinition, 
  ApproverType, 
  DOCUMENT_TYPE_LABELS 
} from '../types/approval';
import { OrganizationUnit } from '../types/organization';
import { Language, Theme } from '../types';

interface ApprovalWorkflowManagerProps {
  companyId: string;
  isRtl: boolean;
  theme: Theme;
  onWorkflowsChange?: () => void;
}

const SYSTEM_ROLES = [
  { id: 'DepartmentManager', labelAr: 'مدير قسم / إدارة', labelEn: 'Department Manager' },
  { id: 'BranchManager', labelAr: 'مدير فرع / محطة', labelEn: 'Branch / Station Manager' },
  { id: 'RegionalManager', labelAr: 'مدير منطقة / قطاع', labelEn: 'Regional Manager' },
  { id: 'FinanceManager', labelAr: 'مدير الإدارة المالية', labelEn: 'Finance Manager' },
  { id: 'Accountant', labelAr: 'محاسب / مدقق مالي', labelEn: 'Accountant / Auditor' },
  { id: 'GeneralManager', labelAr: 'المدير العام', labelEn: 'General Manager' },
  { id: 'CEO', labelAr: 'الرئيس التنفيذي (CEO)', labelEn: 'Chief Executive Officer' },
  { id: 'Admin', labelAr: 'مدير النظام بالشركة', labelEn: 'Company Admin' },
  { id: 'SystemAdmin', labelAr: 'المدير التنفيذي للساس', labelEn: 'System Admin' },
];

export default function ApprovalWorkflowManager({
  companyId,
  isRtl,
  theme,
  onWorkflowsChange
}: ApprovalWorkflowManagerProps) {
  const [workflows, setWorkflows] = useState<ApprovalWorkflowDefinition[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrganizationUnit[]>([]);
  const [selectedDocTypeFilter, setSelectedDocTypeFilter] = useState<string>('ALL');

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorkflowId, setEditingWorkflowId] = useState<string | null>(null);

  // Form States
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDocType, setFormDocType] = useState<string>('PURCHASE_REQUEST');
  const [formOrgUnitId, setFormOrgUnitId] = useState<string>('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formMinAmount, setFormMinAmount] = useState<string>('');
  const [formMaxAmount, setFormMaxAmount] = useState<string>('');
  const [formSteps, setFormSteps] = useState<ApprovalStepDefinition[]>([]);

  useEffect(() => {
    loadData();
  }, [companyId]);

  const loadData = async () => {
    if (!companyId) return;
    let wfs = ApprovalEngine.getWorkflows(companyId);
    if (wfs.length === 0) {
      wfs = await ApprovalEngine.createDefaultWorkflows(companyId);
    }
    setWorkflows(wfs);

    const units = OrganizationEngine.getUnits(companyId);
    setOrgUnits(units);
  };

  const filteredWorkflows = workflows.filter(w => {
    if (selectedDocTypeFilter === 'ALL') return true;
    return w.documentType === selectedDocTypeFilter;
  });

  const handleOpenCreate = () => {
    setEditingWorkflowId(null);
    setFormName('');
    setFormDescription('');
    setFormDocType('PURCHASE_REQUEST');
    setFormOrgUnitId('');
    setFormIsActive(true);
    setFormMinAmount('');
    setFormMaxAmount('');
    
    // Default 2 steps
    setFormSteps([
      {
        stepNumber: 1,
        name: 'Manager Approval',
        approverType: 'ROLE',
        requiredRoles: ['DepartmentManager', 'BranchManager', 'RegionalManager', 'Admin'],
        labelAr: 'اعتماد الإدارة المباشرة',
        labelEn: 'Direct Manager Approval'
      },
      {
        stepNumber: 2,
        name: 'Finance Approval',
        approverType: 'ROLE',
        requiredRoles: ['FinanceManager', 'Accountant', 'Admin'],
        labelAr: 'اعتماد الإدارة المالية',
        labelEn: 'Finance Approval'
      }
    ]);

    setIsModalOpen(true);
  };

  const handleOpenEdit = (wf: ApprovalWorkflowDefinition) => {
    setEditingWorkflowId(wf.id);
    setFormName(wf.name);
    setFormDescription(wf.description || '');
    setFormDocType(wf.documentType);
    setFormOrgUnitId(wf.organization_unit_id || '');
    setFormIsActive(wf.isActive);
    setFormMinAmount(wf.minAmount !== undefined ? wf.minAmount.toString() : '');
    setFormMaxAmount(wf.maxAmount !== undefined ? wf.maxAmount.toString() : '');
    setFormSteps(wf.steps || []);

    setIsModalOpen(true);
  };

  const handleToggleActive = async (wf: ApprovalWorkflowDefinition) => {
    const res = await ApprovalEngine.saveWorkflow({
      ...wf,
      isActive: !wf.isActive
    });
    if (!res) {
      alert(isRtl ? 'فشل حفظ المسار في الخادم السحابي' : 'Failed to save workflow to cloud server');
      return;
    }
    await loadData();
    if (onWorkflowsChange) onWorkflowsChange();
  };

  const handleDelete = async (id: string, name: string) => {
    const confirmMsg = isRtl 
      ? `هل أنت تأكد من حذف مسار الاعتماد "${name}"؟` 
      : `Are you sure you want to delete workflow "${name}"?`;
    if (!window.confirm(confirmMsg)) return;

    const ok = await ApprovalEngine.deleteWorkflow(id);
    if (!ok) {
      alert(isRtl ? 'فشل حذف المسار من الخادم السحابي' : 'Failed to delete workflow from cloud server');
      return;
    }
    await loadData();
    if (onWorkflowsChange) onWorkflowsChange();
  };

  const handleAddStep = () => {
    const nextStepNum = formSteps.length + 1;
    const newStep: ApprovalStepDefinition = {
      stepNumber: nextStepNum,
      name: `Step ${nextStepNum} Approval`,
      approverType: 'ROLE',
      requiredRoles: ['GeneralManager', 'CEO', 'Admin'],
      labelAr: `اعتماد المستوى ${nextStepNum}`,
      labelEn: `Level ${nextStepNum} Approval`
    };
    setFormSteps([...formSteps, newStep]);
  };

  const handleRemoveStep = (index: number) => {
    if (formSteps.length <= 1) {
      alert(isRtl ? 'يجب أن يحتوي مسار الاعتماد على مرحلة واحدة على الأقل' : 'Workflow must contain at least one step');
      return;
    }
    const updated = formSteps.filter((_, i) => i !== index).map((s, i) => ({
      ...s,
      stepNumber: i + 1
    }));
    setFormSteps(updated);
  };

  const handleUpdateStepField = (index: number, field: keyof ApprovalStepDefinition, value: any) => {
    const updated = [...formSteps];
    updated[index] = {
      ...updated[index],
      [field]: value
    };
    setFormSteps(updated);
  };

  const handleToggleRoleForStep = (stepIndex: number, roleId: string) => {
    const updated = [...formSteps];
    const currentRoles = updated[stepIndex].requiredRoles || [];
    if (currentRoles.includes(roleId)) {
      updated[stepIndex].requiredRoles = currentRoles.filter(r => r !== roleId);
    } else {
      updated[stepIndex].requiredRoles = [...currentRoles, roleId];
    }
    setFormSteps(updated);
  };

  const handleSaveWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      alert(isRtl ? 'يرجى إدخال اسم مسار الاعتماد' : 'Please enter workflow name');
      return;
    }

    if (formSteps.length === 0) {
      alert(isRtl ? 'يرجى إضافة مرحلة اعتماد واحدة على الأقل' : 'Please add at least one approval step');
      return;
    }

    const minAmt = formMinAmount.trim() !== '' ? parseFloat(formMinAmount) : undefined;
    const maxAmt = formMaxAmount.trim() !== '' ? parseFloat(formMaxAmount) : undefined;

    const res = await ApprovalEngine.saveWorkflow({
      id: editingWorkflowId || undefined,
      company_id: companyId,
      documentType: formDocType,
      name: formName.trim(),
      description: formDescription.trim() || undefined,
      organization_unit_id: formOrgUnitId.trim() || undefined,
      isActive: formIsActive,
      minAmount: minAmt,
      maxAmount: maxAmt,
      steps: formSteps
    });

    if (!res) {
      alert(isRtl ? 'فشل حفظ المسار في الخادم السحابي' : 'Failed to save workflow to cloud server');
      return;
    }

    setIsModalOpen(false);
    await loadData();
    if (onWorkflowsChange) onWorkflowsChange();
  };

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <div className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
        theme === 'dark' ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-600 text-white shadow-sm">
            <GitMerge size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {isRtl ? 'مسارات وسياسات الاعتماد المالي والمستندي' : 'Document Approval Chains & Workflows'}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
                {workflows.length} {isRtl ? 'مسار مسجل' : 'Workflows'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {isRtl 
                ? 'تحديد مستويات الاعتماد التلقائية حسب نوع المستند والقيمة المالية والهيكل التنظيمي'
                : 'Configure multi-level approval chains and monetary thresholds per document type.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer self-start md:self-auto"
        >
          <Plus size={14} />
          <span>{isRtl ? 'إنشاء مسار اعتماد جديد' : 'New Approval Workflow'}</span>
        </button>
      </div>

      {/* Document Type Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          type="button"
          onClick={() => setSelectedDocTypeFilter('ALL')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
            selectedDocTypeFilter === 'ALL'
              ? 'bg-purple-600 text-white shadow-sm'
              : (theme === 'dark' ? 'bg-slate-900 text-slate-400 hover:text-white' : 'bg-white text-slate-600 hover:bg-slate-100')
          }`}
        >
          {isRtl ? 'كل المستندات' : 'All Documents'}
        </button>

        {Object.entries(DOCUMENT_TYPE_LABELS).map(([docType, labels]) => (
          <button
            key={docType}
            type="button"
            onClick={() => setSelectedDocTypeFilter(docType)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              selectedDocTypeFilter === docType
                ? 'bg-purple-600 text-white shadow-sm'
                : (theme === 'dark' ? 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100')
            }`}
          >
            {isRtl ? labels.ar : labels.en}
          </button>
        ))}
      </div>

      {/* Workflows List */}
      <div className="space-y-3">
        {filteredWorkflows.length === 0 ? (
          <div className={`p-8 rounded-2xl border text-center ${
            theme === 'dark' ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200'
          }`}>
            <p className="text-xs text-slate-400">
              {isRtl ? 'لا توجد مسارات اعتماد معرفة لهذا الفلتر حالياً.' : 'No approval workflows configured for this filter.'}
            </p>
          </div>
        ) : (
          filteredWorkflows.map(wf => {
            const docLabel = DOCUMENT_TYPE_LABELS[wf.documentType] || { ar: wf.documentType, en: wf.documentType };
            const scopeUnit = orgUnits.find(u => u.id === wf.organization_unit_id);

            return (
              <div
                key={wf.id}
                className={`p-4 rounded-2xl border transition-all ${
                  theme === 'dark' ? 'bg-slate-900/50 border-slate-800 hover:border-purple-900/60' : 'bg-white border-slate-200 hover:border-purple-200'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-200/50">
                        {isRtl ? docLabel.ar : docLabel.en}
                      </span>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                        {wf.name}
                      </h4>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        wf.isActive 
                          ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-200/50' 
                          : 'bg-slate-100 text-slate-400'
                      }`}>
                        {wf.isActive ? (isRtl ? 'نشط' : 'Active') : (isRtl ? 'معطل' : 'Inactive')}
                      </span>
                    </div>

                    {wf.description && (
                      <p className="text-xs text-slate-400">
                        {wf.description}
                      </p>
                    )}

                    <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-1 flex-wrap">
                      {/* Monetary threshold */}
                      <span className="flex items-center gap-1 font-mono">
                        <DollarSign size={12} className="text-amber-500" />
                        {wf.minAmount === undefined && wf.maxAmount === undefined && (isRtl ? 'جميع المبالغ' : 'All amounts')}
                        {wf.minAmount !== undefined && wf.maxAmount === undefined && (isRtl ? `أكبر من ${wf.minAmount.toLocaleString()} ج.م` : `> ${wf.minAmount.toLocaleString()} EGP`)}
                        {wf.minAmount === undefined && wf.maxAmount !== undefined && (isRtl ? `حتى ${wf.maxAmount.toLocaleString()} ج.م` : `Up to ${wf.maxAmount.toLocaleString()} EGP`)}
                        {wf.minAmount !== undefined && wf.maxAmount !== undefined && (isRtl ? `من ${wf.minAmount.toLocaleString()} إلى ${wf.maxAmount.toLocaleString()} ج.م` : `${wf.minAmount.toLocaleString()} - ${wf.maxAmount.toLocaleString()} EGP`)}
                      </span>

                      {/* Scope Unit */}
                      <span className="flex items-center gap-1">
                        <Building2 size={12} className="text-indigo-500" />
                        {scopeUnit ? (isRtl ? scopeUnit.nameAr || scopeUnit.name : scopeUnit.nameEn || scopeUnit.name) : (isRtl ? 'شامل على مستوى الشركة' : 'Company-Wide')}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(wf)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                        wf.isActive 
                          ? 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20' 
                          : 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
                      }`}
                    >
                      {wf.isActive ? (isRtl ? 'تعطيل' : 'Disable') : (isRtl ? 'تفعيل' : 'Enable')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(wf)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-purple-600 dark:text-purple-400 transition-colors cursor-pointer"
                      title={isRtl ? 'تعديل المسار' : 'Edit Workflow'}
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(wf.id, wf.name)}
                      className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-slate-800 text-rose-500 transition-colors cursor-pointer"
                      title={isRtl ? 'حذف المسار' : 'Delete Workflow'}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Steps Chain Visualizer */}
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/60">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    {isRtl ? 'سلسلة المعتمدين والمراحل:' : 'Approval Steps Chain:'}
                  </div>

                  <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {wf.steps.map((st, idx) => (
                      <React.Fragment key={st.stepNumber}>
                        <div className={`p-2.5 rounded-xl border text-xs min-w-[180px] shrink-0 ${
                          theme === 'dark' ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                        }`}>
                          <div className="flex items-center justify-between font-bold text-purple-600 dark:text-purple-400 text-[11px]">
                            <span>المرحلة {st.stepNumber}</span>
                            <span className="text-[9px] font-mono bg-purple-500/10 px-1.5 py-0.2 rounded">
                              {st.requiredRoles?.length || 0} أدوار
                            </span>
                          </div>
                          <div className="font-bold text-slate-800 dark:text-slate-200 mt-1 truncate">
                            {isRtl ? st.labelAr : st.labelEn}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                            {st.requiredRoles?.join(', ')}
                          </div>
                        </div>

                        {idx < wf.steps.length - 1 && (
                          <div className="text-slate-300 dark:text-slate-700 shrink-0">
                            {isRtl ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
                          </div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* CREATE / EDIT WORKFLOW MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-2xl rounded-2xl border shadow-xl overflow-hidden flex flex-col max-h-[90vh] ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-sm">
                {editingWorkflowId 
                  ? (isRtl ? 'تعديل مسار الاعتماد المستندي' : 'Edit Approval Workflow')
                  : (isRtl ? 'إنشاء مسار اعتماد مستندي جديد' : 'Create Approval Workflow')}
              </h3>
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveWorkflow} className="p-4 overflow-y-auto space-y-4 flex-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  {isRtl ? 'اسم مسار الاعتماد' : 'Workflow Name'}
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={isRtl ? 'مثال: اعتماد طلبات الشراء ذات المبالغ الكبيرة' : 'e.g. High Value Purchase Order Workflow'}
                  className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/20 ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    {isRtl ? 'نوع المستند الخاضع للاعتماد' : 'Target Document Type'}
                  </label>
                  <select
                    value={formDocType}
                    onChange={(e) => setFormDocType(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/20 ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  >
                    {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {isRtl ? v.ar : v.en}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    {isRtl ? 'نطاق الوحدة التنظيمية (اختياري)' : 'Organization Unit Scope'}
                  </label>
                  <select
                    value={formOrgUnitId}
                    onChange={(e) => setFormOrgUnitId(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/20 ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  >
                    <option value="">{isRtl ? 'عام على مستوى جميع أفرع الشركة' : 'Company-Wide (All Units)'}</option>
                    {orgUnits.map(u => (
                      <option key={u.id} value={u.id}>
                        {isRtl ? u.nameAr || u.name : u.nameEn || u.name} ({u.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Monetary Limits */}
              <div className="p-3 rounded-xl border space-y-2 bg-slate-50/50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block">
                  {isRtl ? 'الحدود المالية لتطبيق هذا المسار (بالجنيه المصري):' : 'Monetary Amount Thresholds (EGP):'}
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">
                      {isRtl ? 'الحد الأدنى للمبلغ (يبدأ من)' : 'Min Amount (From)'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formMinAmount}
                      onChange={(e) => setFormMinAmount(e.target.value)}
                      placeholder="e.g. 50000"
                      className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/20 ${
                        theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">
                      {isRtl ? 'الحد الأقصى للمبلغ (ينتهي عند)' : 'Max Amount (Up to)'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formMaxAmount}
                      onChange={(e) => setFormMaxAmount(e.target.value)}
                      placeholder={isRtl ? 'أتركه فارغاً بدون حد أقصى' : 'Leave empty for unlimited'}
                      className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/20 ${
                        theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Steps Builder Section */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                    {isRtl ? 'مراحل الاعتماد وسلسلة الموافقة:' : 'Approval Steps & Authorization Chain:'}
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddStep}
                    className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={12} />
                    <span>{isRtl ? 'إضافة مرحلة اعتماد' : 'Add Step'}</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {formSteps.map((st, stepIdx) => (
                    <div
                      key={st.stepNumber}
                      className={`p-3 rounded-xl border space-y-3 ${
                        theme === 'dark' ? 'bg-slate-800/40 border-slate-700' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-purple-600 dark:text-purple-400">
                          {isRtl ? `المرحلة ${st.stepNumber}:` : `Step ${st.stepNumber}:`}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveStep(stepIdx)}
                          className="p-1 text-rose-500 hover:text-rose-600 text-xs cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-0.5">
                            {isRtl ? 'مسمى المرحلة (بالعربية)' : 'Step Label (Arabic)'}
                          </label>
                          <input
                            type="text"
                            value={st.labelAr}
                            onChange={(e) => handleUpdateStepField(stepIdx, 'labelAr', e.target.value)}
                            className={`w-full px-2.5 py-1 rounded-lg border text-xs ${
                              theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-0.5">
                            {isRtl ? 'مسمى المرحلة (بالإنجليزية)' : 'Step Label (English)'}
                          </label>
                          <input
                            type="text"
                            value={st.labelEn}
                            onChange={(e) => handleUpdateStepField(stepIdx, 'labelEn', e.target.value)}
                            className={`w-full px-2.5 py-1 rounded-lg border text-xs ${
                              theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
                            }`}
                          />
                        </div>
                      </div>

                      {/* Required Roles Checkboxes */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">
                          {isRtl ? 'الأدوار الوظيفية المخولة بالاعتماد في هذه المرحلة:' : 'Authorized Roles for this Step:'}
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                          {SYSTEM_ROLES.map(r => {
                            const isChecked = (st.requiredRoles || []).includes(r.id);
                            return (
                              <label
                                key={r.id}
                                className={`px-2 py-1 rounded-lg border text-[10px] font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                                  isChecked 
                                    ? 'bg-purple-500/10 border-purple-500 text-purple-600 dark:text-purple-300' 
                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleRoleForStep(stepIdx, r.id)}
                                  className="rounded text-purple-600 focus:ring-0"
                                />
                                <span className="truncate">{isRtl ? r.labelAr : r.labelEn}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all cursor-pointer"
                >
                  {isRtl ? 'حفظ مسار الاعتماد' : 'Save Workflow'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
