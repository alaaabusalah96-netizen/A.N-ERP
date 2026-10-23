import React, { useState, useEffect } from 'react';
import { 
  HardHat, 
  Building2, 
  FileText, 
  Users, 
  Clock, 
  BarChart3, 
  Plus, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  DollarSign, 
  Printer, 
  Calendar, 
  ChevronRight, 
  Layers, 
  X,
  UserCheck,
  Briefcase,
  FileCheck2,
  Wallet
} from 'lucide-react';
import { AppUser, Language, Theme } from '../types';
import { 
  ContractingProject, 
  BOQItem, 
  Subcontractor, 
  SubcontractorContract, 
  ContractingPaymentVoucher, 
  PaymentVoucherLine, 
  DailyWorker, 
  DailyAttendanceLog, 
  PaymentVoucherType 
} from '../types/contracting';
import { ContractingEngine } from '../db/contracting';
import { ContractingProjectsTab } from '../components/contracting/ContractingProjectsTab';
import { ContractingVouchersTab } from '../components/contracting/ContractingVouchersTab';
import { ContractingSubcontractorsTab } from '../components/contracting/ContractingSubcontractorsTab';
import { ContractingDailyLaborTab } from '../components/contracting/ContractingDailyLaborTab';
import { ContractingReportsTab } from '../components/contracting/ContractingReportsTab';

interface ContractingProps {
  activeUser: AppUser;
  language: Language;
  theme: Theme;
}

export default function Contracting({ activeUser, language, theme }: ContractingProps) {
  const isRtl = language === 'ar';
  const [activeSubTab, setActiveSubTab] = useState<'projects' | 'vouchers' | 'subcontractors' | 'daily_labor' | 'reports'>('projects');
  
  // Data State
  const [projects, setProjects] = useState<ContractingProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [boqItems, setBoqItems] = useState<BOQItem[]>([]);
  const [vouchers, setVouchers] = useState<ContractingPaymentVoucher[]>([]);
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [subcontracts, setSubcontracts] = useState<SubcontractorContract[]>([]);
  const [workers, setWorkers] = useState<DailyWorker[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<DailyAttendanceLog[]>([]);
  
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Modal States
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [showSubcontractorModal, setShowSubcontractorModal] = useState(false);
  const [showWorkerModal, setShowWorkerModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [activePrintVoucher, setActivePrintVoucher] = useState<ContractingPaymentVoucher | null>(null);

  // Form States
  const [newProject, setNewProject] = useState<Partial<ContractingProject>>({
    code: `PRJ-${new Date().getFullYear()}-00${projects.length + 1}`,
    name: '',
    client_name: '',
    location: '',
    contract_value: 0,
    advance_payment_rate: 10,
    retention_rate: 5,
    status: 'IN_PROGRESS',
    start_date: new Date().toISOString().split('T')[0],
    end_date: ''
  });

  const [newVoucherType, setNewVoucherType] = useState<PaymentVoucherType>('CLIENT');
  const [newVoucherLines, setNewVoucherLines] = useState<Partial<PaymentVoucherLine>[]>([]);
  const [advanceRate, setAdvanceRate] = useState<number>(10);
  const [retentionRate, setRetentionRate] = useState<number>(5);
  const [taxRate, setTaxRate] = useState<number>(0.1);

  const [newWorker, setNewWorker] = useState<Partial<DailyWorker>>({
    worker_code: `WRK-00${workers.length + 1}`,
    name: '',
    trade: 'عامل عادي',
    phone: '',
    daily_rate: 250,
    status: 'ACTIVE'
  });

  const [newSubcontractor, setNewSubcontractor] = useState<Partial<Subcontractor>>({
    code: `SUB-${subcontractors.length + 101}`,
    name: '',
    specialty: 'أعمال التشطيبات',
    phone: '',
    status: 'ACTIVE'
  });

  // Reload All Data
  const loadData = () => {
    const pList = ContractingEngine.getProjects(activeUser.company_id);
    setProjects(pList);
    if (pList.length > 0 && !selectedProjectId) {
      setSelectedProjectId(pList[0].id);
    }

    if (selectedProjectId) {
      setBoqItems(ContractingEngine.getBOQItems(selectedProjectId));
      setVouchers(ContractingEngine.getPaymentVouchers(selectedProjectId));
      setAttendanceLogs(ContractingEngine.getAttendanceLogs(selectedProjectId));
    } else {
      setVouchers(ContractingEngine.getPaymentVouchers());
      setAttendanceLogs(ContractingEngine.getAttendanceLogs());
    }

    setSubcontractors(ContractingEngine.getSubcontractors(activeUser.company_id));
    setSubcontracts(ContractingEngine.getSubcontracts());
    setWorkers(ContractingEngine.getDailyWorkers(activeUser.company_id));
  };

  useEffect(() => {
    loadData();
  }, [selectedProjectId, activeUser.company_id]);

  // Handle Project Selection & Line Loading for New Voucher
  const handleOpenNewVoucherModal = (type: PaymentVoucherType) => {
    setNewVoucherType(type);
    const p = projects.find(prj => prj.id === selectedProjectId);
    if (p) {
      setAdvanceRate(p.advance_payment_rate || 10);
      setRetentionRate(p.retention_rate || 5);
    }

    const currentBoq = ContractingEngine.getBOQItems(selectedProjectId);
    const initialLines = currentBoq.map((b, idx) => ({
      id: `LINE-NEW-${idx}`,
      boq_item_id: b.id,
      item_number: b.item_number,
      description: b.description,
      unit: b.unit,
      unit_price: b.unit_price,
      previous_qty: 0,
      current_qty: 0,
      total_qty: 0,
      current_amount: 0,
      total_amount: 0,
      completion_percentage: 0
    }));

    setNewVoucherLines(initialLines.length ? initialLines : [{
      id: 'LINE-NEW-1',
      item_number: '1.1',
      description: 'أعمال تنفيذية',
      unit: 'م2',
      unit_price: 100,
      previous_qty: 0,
      current_qty: 0,
      total_qty: 0,
      current_amount: 0,
      total_amount: 0,
      completion_percentage: 0
    }]);

    setShowVoucherModal(true);
  };

  // Create Project Submit
  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProject.name || !newProject.contract_value) return;

    const prj: ContractingProject = {
      id: `PRJ-${Date.now()}`,
      company_id: activeUser.company_id,
      code: newProject.code || `PRJ-${Date.now()}`,
      name: newProject.name,
      client_name: newProject.client_name || 'عميل رئيسي',
      location: newProject.location || 'الموقع',
      contract_value: Number(newProject.contract_value),
      advance_payment_rate: Number(newProject.advance_payment_rate || 10),
      retention_rate: Number(newProject.retention_rate || 5),
      status: 'IN_PROGRESS',
      start_date: newProject.start_date || new Date().toISOString().split('T')[0],
      end_date: newProject.end_date || '',
      created_at: new Date().toISOString()
    };

    const res = await ContractingEngine.saveProject(prj);
    if (!res.success) {
      alert(res.error || (isRtl ? 'فشل حفظ المشروع في السحابة' : 'Failed to save project'));
      return;
    }
    setSelectedProjectId(prj.id);
    setShowProjectModal(false);
    loadData();
  };

  // Create Voucher Submit
  const handleSaveVoucher = async () => {
    const currentPrj = projects.find(p => p.id === selectedProjectId);
    if (!currentPrj) return;

    const breakdown = ContractingEngine.calculateVoucherBreakdown(
      newVoucherLines as PaymentVoucherLine[],
      0,
      advanceRate,
      retentionRate,
      taxRate
    );

    const vCount = vouchers.filter(v => v.project_id === selectedProjectId).length + 1;
    const voucher: ContractingPaymentVoucher = {
      id: `VOUCH-${Date.now()}`,
      company_id: activeUser.company_id,
      project_id: selectedProjectId,
      voucher_number: newVoucherType === 'CLIENT' ? `مستخلص مالك جاري رقم ${vCount}` : `مستخلص مقاول باطن رقم ${vCount}`,
      type: newVoucherType,
      period_from: selectedDate,
      period_to: selectedDate,
      date: new Date().toISOString().split('T')[0],
      status: 'APPROVED',
      total_work_completed: breakdown.total_work_completed,
      previous_work_completed: breakdown.previous_work_completed,
      current_work_completed: breakdown.current_work_completed,
      advance_deduction: breakdown.advance_deduction,
      retention_deduction: breakdown.retention_deduction,
      tax_deduction: breakdown.tax_deduction,
      other_deductions: 0,
      net_amount: breakdown.net_amount,
      notes: 'تم الاعتماد المباشر وإضافته للسجل الفني',
      created_at: new Date().toISOString(),
      lines: breakdown.lines
    };

    const res = await ContractingEngine.savePaymentVoucher(voucher);
    if (!res.success) {
      alert(res.error || (isRtl ? 'فشل حفظ المستخلص في السحابة' : 'Failed to save voucher'));
      return;
    }
    setShowVoucherModal(false);
    loadData();
  };

  // Save Worker
  const handleSaveWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorker.name) return;

    const wrk: DailyWorker = {
      id: `WRK-${Date.now()}`,
      company_id: activeUser.company_id,
      worker_code: newWorker.worker_code || `WRK-${Date.now()}`,
      name: newWorker.name,
      trade: newWorker.trade || 'عامل عادي',
      phone: newWorker.phone || '',
      daily_rate: Number(newWorker.daily_rate || 200),
      status: 'ACTIVE',
      created_at: new Date().toISOString()
    };

    const res = await ContractingEngine.saveDailyWorker(wrk);
    if (!res.success) {
      alert(res.error || (isRtl ? 'فشل حفظ بيانات العامل في السحابة' : 'Failed to save worker'));
      return;
    }
    setShowWorkerModal(false);
    loadData();
  };

  // Attendance Log Row Save
  const handleLogAttendance = async (worker: DailyWorker, daysWorked: number, otHours: number) => {
    if (!selectedProjectId) return;
    const log: DailyAttendanceLog = {
      id: `ATT-${selectedProjectId}-${worker.id}-${selectedDate}`,
      company_id: activeUser.company_id,
      project_id: selectedProjectId,
      date: selectedDate,
      worker_id: worker.id,
      worker_name: worker.name,
      trade: worker.trade,
      daily_rate: worker.daily_rate,
      days_worked: daysWorked,
      overtime_hours: otHours,
      overtime_rate_per_hour: 40,
      bonus_amount: 0,
      deduction_amount: 0,
      total_wage: ContractingEngine.calculateWorkerWage(worker.daily_rate, daysWorked, otHours, 40, 0, 0),
      payment_status: 'UNPAID',
      created_at: new Date().toISOString()
    };

    const res = await ContractingEngine.saveAttendanceLog(log);
    if (!res.success) {
      alert(res.error || (isRtl ? 'فشل حفظ اليومية في السحابة' : 'Failed to log attendance'));
      return;
    }
    loadData();
  };

  // Process Payout Batch
  const handleProcessBatchPayout = async () => {
    if (!selectedProjectId) return;
    const res = await ContractingEngine.processDailyLaborPayoutBatch(
      activeUser.company_id,
      selectedProjectId,
      selectedDate,
      selectedDate,
      `صرف يوميات الموقع بتاريخ ${selectedDate}`
    );
    if (!res.success || !res.batch) {
      alert(res.error || (isRtl ? 'فشل إصدار سند صرف يوميات الموقع' : 'Failed to process labor payout'));
      return;
    }
    alert(`تم إصدار سند صرف يوميات الموقع بنجاح برقم ${res.batch.id} بمبلغ إجمالي ${res.batch.total_amount.toLocaleString()} ج.م لعدد ${res.batch.worker_count} عمال.`);
    loadData();
  };

  // KPIs
  const totalContractValue = projects.reduce((sum, p) => sum + p.contract_value, 0);
  const totalVouchersApproved = vouchers.reduce((sum, v) => sum + (v.status === 'APPROVED' ? v.net_amount : 0), 0);
  const unpaidLaborWage = attendanceLogs.reduce((sum, a) => sum + (a.payment_status === 'UNPAID' ? a.total_wage : 0), 0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 p-4 md:p-6" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl border border-amber-500/20">
            <HardHat size={28} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {isRtl ? 'إدارة المقاولات والمستخلصات والمواقع' : 'Construction & Project Engineering'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isRtl ? 'متابعة المشاريع، كميات المقايسة، مستخلصات المالك ومقاولي الباطن، ويوميات العمالة' : 'Manage site projects, BOQ, payment certificates, and daily site labor'}
            </p>
          </div>
        </div>

        {/* Project Selector */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            {isRtl ? 'الموقع / المشروع النشط:' : 'Active Site:'}
          </label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-3 py-2 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 min-w-[220px]"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowProjectModal(true)}
            className="px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
          >
            <Plus size={14} />
            <span>{isRtl ? 'مشروع جديد' : 'New Project'}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Building2 size={24} />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{isRtl ? 'عدد المشاريع القائمة' : 'Active Projects'}</span>
            <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{projects.length} {isRtl ? 'مشاريع' : 'Sites'}</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <DollarSign size={24} />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{isRtl ? 'إجمالي قيمة العقود' : 'Total Contracted Value'}</span>
            <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{totalContractValue.toLocaleString()} <span className="text-xs font-semibold text-slate-500">ج.م</span></div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <FileCheck2 size={24} />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{isRtl ? 'المستخلصات المعتمدة' : 'Certified Payments'}</span>
            <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{totalVouchersApproved.toLocaleString()} <span className="text-xs font-semibold text-slate-500">ج.م</span></div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <Wallet size={24} />
          </div>
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{isRtl ? 'أجور يوميات غير مصروفة' : 'Unpaid Daily Wages'}</span>
            <div className="text-lg font-black text-rose-600 dark:text-rose-400 mt-0.5">{unpaidLaborWage.toLocaleString()} <span className="text-xs font-semibold text-slate-500">ج.م</span></div>
          </div>
        </div>
      </div>

      {/* Main Sub-Tabs Navigation */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6 space-x-2 space-x-reverse overflow-x-auto pb-1">
        {[
          { id: 'projects', label: isRtl ? 'المشاريع وبنود المقايسة' : 'Projects & BOQ', icon: Building2 },
          { id: 'vouchers', label: isRtl ? 'المستخلصات والشهادات' : 'Payment Certificates', icon: FileText },
          { id: 'subcontractors', label: isRtl ? 'مقاوِلو الباطن والعقود' : 'Subcontractors', icon: Users },
          { id: 'daily_labor', label: isRtl ? 'العمالة باليومية وحضور الموقع' : 'Daily Site Labor', icon: Clock },
          { id: 'reports', label: isRtl ? 'تقارير أداء الربحية والمواصفات' : 'Project Financials', icon: BarChart3 },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 font-bold text-xs rounded-t-xl transition-all whitespace-nowrap cursor-pointer border-b-2 ${
                isActive
                  ? 'border-amber-500 text-amber-600 dark:text-amber-400 bg-white dark:bg-slate-800 shadow-sm'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* SUB-TAB 1: PROJECTS & BOQ */}
      {activeSubTab === 'projects' && (
        <ContractingProjectsTab
          isRtl={isRtl}
          projects={projects}
          selectedProjectId={selectedProjectId}
          setSelectedProjectId={setSelectedProjectId}
          boqItems={boqItems}
        />
      )}

      {/* SUB-TAB 2: PAYMENT CERTIFICATES & INVOICES */}
      {activeSubTab === 'vouchers' && (
        <ContractingVouchersTab
          isRtl={isRtl}
          vouchers={vouchers}
          handleOpenNewVoucherModal={handleOpenNewVoucherModal}
          setActivePrintVoucher={setActivePrintVoucher}
          setShowPrintModal={setShowPrintModal}
        />
      )}

      {/* SUB-TAB 3: SUBCONTRACTORS & CONTRACTS */}
      {activeSubTab === 'subcontractors' && (
        <ContractingSubcontractorsTab
          isRtl={isRtl}
          subcontractors={subcontractors}
          setShowSubcontractorModal={setShowSubcontractorModal}
        />
      )}

      {/* SUB-TAB 4: DAILY LABOR & SITE ATTENDANCE GRID */}
      {activeSubTab === 'daily_labor' && (
        <ContractingDailyLaborTab
          isRtl={isRtl}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          workers={workers}
          attendanceLogs={attendanceLogs}
          setShowWorkerModal={setShowWorkerModal}
          handleProcessBatchPayout={handleProcessBatchPayout}
          handleLogAttendance={handleLogAttendance}
        />
      )}

      {/* SUB-TAB 5: FINANCIAL REPORTS */}
      {activeSubTab === 'reports' && (
        <ContractingReportsTab
          isRtl={isRtl}
          vouchers={vouchers}
          attendanceLogs={attendanceLogs}
        />
      )}

      {/* MODAL: NEW PROJECT */}
      {showProjectModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-4 border-b pb-3 border-slate-200 dark:border-slate-700">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{isRtl ? 'إضافة مشروع / موقع جديد' : 'Create New Site Project'}</h3>
              <button onClick={() => setShowProjectModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveProject} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">{isRtl ? 'اسم المشروع / الموقع:' : 'Project Name:'}</label>
                <input
                  required
                  type="text"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  placeholder="مثال: مشروع برج الجوهرة السكني"
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-xl border border-slate-300 dark:border-slate-600"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">{isRtl ? 'العميل / المالك:' : 'Client:'}</label>
                <input
                  type="text"
                  value={newProject.client_name}
                  onChange={(e) => setNewProject({ ...newProject, client_name: e.target.value })}
                  placeholder="مثال: شركة التطوير العقاري"
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-xl border border-slate-300 dark:border-slate-600"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">{isRtl ? 'إجمالي قيمة التعاقد (ج.م):' : 'Contract Value:'}</label>
                <input
                  required
                  type="number"
                  value={newProject.contract_value}
                  onChange={(e) => setNewProject({ ...newProject, contract_value: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-xl border border-slate-300 dark:border-slate-600 font-bold"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">{isRtl ? '% الدفعة المقدمة:' : '% Advance:'}</label>
                  <input
                    type="number"
                    value={newProject.advance_payment_rate}
                    onChange={(e) => setNewProject({ ...newProject, advance_payment_rate: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-xl border border-slate-300 dark:border-slate-600"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">{isRtl ? '% ضمان الأعمال:' : '% Retention:'}</label>
                  <input
                    type="number"
                    value={newProject.retention_rate}
                    onChange={(e) => setNewProject({ ...newProject, retention_rate: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-xl border border-slate-300 dark:border-slate-600"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setShowProjectModal(false)}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-300"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold shadow-md"
                >
                  {isRtl ? 'حفظ المشروع' : 'Save Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NEW VOUCHER */}
      {showVoucherModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-xl border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 border-b pb-3 border-slate-200 dark:border-slate-700">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {newVoucherType === 'CLIENT' ? (isRtl ? 'إصدار مستخلص مالك جاري' : 'New Client Payment Certificate') : (isRtl ? 'إصدار مستخلص مقاول باطن' : 'New Subcontractor Certificate')}
              </h3>
              <button onClick={() => setShowVoucherModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={20} /></button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-700/30 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <div>
                  <label className="block font-semibold mb-1 text-slate-500">{isRtl ? '% خصم دفعة مقدمة:' : '% Advance Deduct:'}</label>
                  <input
                    type="number"
                    value={advanceRate}
                    onChange={(e) => setAdvanceRate(Number(e.target.value))}
                    className="w-full px-2 py-1 bg-white dark:bg-slate-700 rounded-lg border font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-500">{isRtl ? '% ضمان أعمال (محتجز):' : '% Retention Deduct:'}</label>
                  <input
                    type="number"
                    value={retentionRate}
                    onChange={(e) => setRetentionRate(Number(e.target.value))}
                    className="w-full px-2 py-1 bg-white dark:bg-slate-700 rounded-lg border font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-500">{isRtl ? '% الضرائب والتأمينات:' : '% Tax Deduct:'}</label>
                  <input
                    type="number"
                    value={taxRate}
                    onChange={(e) => setTaxRate(Number(e.target.value))}
                    className="w-full px-2 py-1 bg-white dark:bg-slate-700 rounded-lg border font-bold"
                  />
                </div>
              </div>

              {/* Line Items Table */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 dark:text-white">{isRtl ? 'بنود مستخلص الأعمال:' : 'Certificate Work Items:'}</h4>
                {newVoucherLines.map((line, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-700/20 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-1 font-mono font-bold text-amber-600">{line.item_number}</div>
                    <div className="col-span-5 font-bold text-slate-900 dark:text-white">{line.description}</div>
                    <div className="col-span-2">
                      <span className="text-[10px] text-slate-400 block">{isRtl ? 'فئة الوحدة' : 'Rate'}</span>
                      <span className="font-bold">{line.unit_price} ج.م</span>
                    </div>
                    <div className="col-span-4">
                      <label className="text-[10px] font-bold text-amber-600 block">{isRtl ? 'الكمية المنفذة حالياً:' : 'Current Qty:'}</label>
                      <input
                        type="number"
                        value={line.current_qty}
                        onChange={(e) => {
                          const updated = [...newVoucherLines];
                          const qty = Number(e.target.value);
                          updated[idx].current_qty = qty;
                          updated[idx].current_amount = qty * (line.unit_price || 0);
                          setNewVoucherLines(updated);
                        }}
                        className="w-full px-2 py-1 bg-white dark:bg-slate-800 rounded-lg border border-amber-500 font-black text-amber-600"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setShowVoucherModal(false)}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-300"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  onClick={handleSaveVoucher}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-md"
                >
                  {isRtl ? 'اعتماد المستخلص وحفظه' : 'Approve & Save Certificate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRINTABLE INVOICE CERTIFICATE MODAL */}
      {showPrintModal && activePrintVoucher && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-8 text-slate-900 shadow-2xl overflow-y-auto max-h-[90vh]" dir="rtl">
            <div className="flex items-center justify-between border-b pb-4 mb-6">
              <div>
                <h2 className="text-lg font-black text-slate-900">شهادة مستخلص أعمال تنفيذية</h2>
                <p className="text-xs text-slate-500">{activePrintVoucher.voucher_number}</p>
              </div>
              <button onClick={() => setShowPrintModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={20} /></button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="flex justify-between border-b pb-2">
                <span><strong>تاريخ المستخلص:</strong> {activePrintVoucher.date}</span>
                <span><strong>النوع:</strong> {activePrintVoucher.type === 'CLIENT' ? 'مستخلص مالك' : 'مستخلص مقاول باطن'}</span>
              </div>

              <table className="w-full border-collapse border border-slate-300 text-right">
                <thead>
                  <tr className="bg-slate-100 font-bold">
                    <th className="border p-2">البند</th>
                    <th className="border p-2">الوصف</th>
                    <th className="border p-2 text-center">الفئة</th>
                    <th className="border p-2 text-center">الكمية</th>
                    <th className="border p-2 text-left">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {activePrintVoucher.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="border p-2 font-mono font-bold">{l.item_number}</td>
                      <td className="border p-2">{l.description}</td>
                      <td className="border p-2 text-center">{l.unit_price} ج.م</td>
                      <td className="border p-2 text-center">{l.current_qty}</td>
                      <td className="border p-2 text-left font-bold">{l.current_amount.toLocaleString()} ج.م</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5 font-medium">
                <div className="flex justify-between">
                  <span>إجمالي الأعمال الحالية:</span>
                  <span className="font-bold">{activePrintVoucher.current_work_completed.toLocaleString()} ج.م</span>
                </div>
                <div className="flex justify-between text-amber-600">
                  <span>خصم الدفعة المقدمة:</span>
                  <span>-{activePrintVoucher.advance_deduction.toLocaleString()} ج.م</span>
                </div>
                <div className="flex justify-between text-indigo-600">
                  <span>خصم ضمان الأعمال (محتجز):</span>
                  <span>-{activePrintVoucher.retention_deduction.toLocaleString()} ج.م</span>
                </div>
                <div className="flex justify-between border-t pt-2 text-sm font-black text-emerald-700">
                  <span>صافي المبلغ المستحق للصرف:</span>
                  <span>{activePrintVoucher.net_amount.toLocaleString()} ج.م</span>
                </div>
              </div>

              <div className="pt-8 grid grid-cols-2 text-center text-xs text-slate-500">
                <div>
                  <p className="font-bold mb-8">اعتماد استشاري المشروع</p>
                  <p>.......................................</p>
                </div>
                <div>
                  <p className="font-bold mb-8">خاتم واعتِماد إدارة المقاولات</p>
                  <p>.......................................</p>
                </div>
              </div>

              <div className="pt-6 flex justify-end gap-2 border-t">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold flex items-center gap-2 cursor-pointer"
                >
                  <Printer size={16} />
                  <span>طباعة الشهادة الرسمية</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NEW WORKER */}
      {showWorkerModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-4 border-b pb-3 border-slate-200 dark:border-slate-700">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{isRtl ? 'تعريف عامل يومية جديد' : 'Register Daily Worker'}</h3>
              <button onClick={() => setShowWorkerModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveWorker} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">{isRtl ? 'اسم العامل بالكامل:' : 'Full Name:'}</label>
                <input
                  required
                  type="text"
                  value={newWorker.name}
                  onChange={(e) => setNewWorker({ ...newWorker, name: e.target.value })}
                  placeholder="مثال: المعلم حسن صابر"
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-xl border border-slate-300 dark:border-slate-600"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">{isRtl ? 'المهنة / الصنعة:' : 'Trade / Craft:'}</label>
                <select
                  value={newWorker.trade}
                  onChange={(e) => setNewWorker({ ...newWorker, trade: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-xl border border-slate-300 dark:border-slate-600 font-bold"
                >
                  <option value="نجار مسلح">نجار مسلح</option>
                  <option value="حداد مسلح">حداد مسلح</option>
                  <option value="بناء">بناء</option>
                  <option value="مبيض محارة">مبيض محارة</option>
                  <option value="سباك">سباك</option>
                  <option value="كهربائي">كهربائي</option>
                  <option value="عامل عادي">عامل عادي</option>
                  <option value="سائق معدات">سائق معدات</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">{isRtl ? 'فئة اليومية بالجنيه:' : 'Daily Rate (EGP):'}</label>
                <input
                  required
                  type="number"
                  value={newWorker.daily_rate}
                  onChange={(e) => setNewWorker({ ...newWorker, daily_rate: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-xl border border-slate-300 dark:border-slate-600 font-bold"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setShowWorkerModal(false)}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-300"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold shadow-md"
                >
                  {isRtl ? 'حفظ العامل' : 'Save Worker'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NEW SUBCONTRACTOR */}
      {showSubcontractorModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-4 border-b pb-3 border-slate-200 dark:border-slate-700">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{isRtl ? 'إضافة مقاول باطن جديد' : 'Register Subcontractor'}</h3>
              <button onClick={() => setShowSubcontractorModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={20} /></button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!newSubcontractor.name) return;
              const sub: Subcontractor = {
                id: `SUB-${Date.now()}`,
                company_id: activeUser.company_id,
                code: newSubcontractor.code || `SUB-${Date.now()}`,
                name: newSubcontractor.name,
                specialty: newSubcontractor.specialty || 'أعمال تشطيبات',
                phone: newSubcontractor.phone || '',
                status: 'ACTIVE',
                created_at: new Date().toISOString()
              };
              const res = await ContractingEngine.saveSubcontractor(sub);
              if (!res.success) {
                alert(res.error || (isRtl ? 'فشل حفظ مقاول الباطن في السحابة' : 'Failed to save subcontractor'));
                return;
              }
              setShowSubcontractorModal(false);
              loadData();
            }} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">{isRtl ? 'اسم الشركة / مقاول الباطن:' : 'Company / Subcontractor Name:'}</label>
                <input
                  required
                  type="text"
                  value={newSubcontractor.name}
                  onChange={(e) => setNewSubcontractor({ ...newSubcontractor, name: e.target.value })}
                  placeholder="مثال: شركة الفرسان للمحارة والديكور"
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-xl border border-slate-300 dark:border-slate-600"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">{isRtl ? 'التخصص الأعمال:' : 'Specialty:'}</label>
                <input
                  type="text"
                  value={newSubcontractor.specialty}
                  onChange={(e) => setNewSubcontractor({ ...newSubcontractor, specialty: e.target.value })}
                  placeholder="مثال: أسباب التشطيبات والهياكل الخرسانية"
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-xl border border-slate-300 dark:border-slate-600"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">{isRtl ? 'رقم الهاتف / التواصل:' : 'Phone:'}</label>
                <input
                  type="text"
                  value={newSubcontractor.phone}
                  onChange={(e) => setNewSubcontractor({ ...newSubcontractor, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-xl border border-slate-300 dark:border-slate-600"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setShowSubcontractorModal(false)}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-300"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold shadow-md"
                >
                  {isRtl ? 'حفظ مقاول الباطن' : 'Save Subcontractor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
