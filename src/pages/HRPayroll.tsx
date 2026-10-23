import React, { useState, useEffect } from 'react';
import { 
  Briefcase, Plus, Calculator, Check, X, FileText, 
  Search, Users, Landmark, Coins, Heart, AlertCircle, Calendar, Edit2, ShieldAlert, Building2
} from 'lucide-react';
import { StorageEngine } from '../db/storage';
import { UsersModule } from '../db/users';
import { CompaniesModule } from '../db/companies';
import { LogsModule } from '../db/logs';
import { dbSetDoc } from '../firebase';
import { AccountingBusinessEngine } from '../lib/enterprise/accounting_engine';
import { OrganizationEngine } from '../db/organizationEngine';
import OrgUnitTreeSelect from '../components/OrgUnitTreeSelect';
import { HRBusinessEngine } from '../lib/enterprise/hr_engine';
import { Employee, PayrollItem, PayrollRun } from '../types/hr';

export type { Employee, PayrollItem, PayrollRun };

interface HRPayrollProps {
  language: 'ar' | 'en';
  theme: 'light' | 'dark';
}

export default function HRPayroll({ language, theme }: HRPayrollProps) {
  const isRtl = language === 'ar';
  const activeUser = UsersModule.getActiveUser();
  const companyId = activeUser?.company_id || CompaniesModule.getSelectedCompanyId() || '';

  // Core States
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState<'employees' | 'attendance' | 'payroll'>('employees');

  // Attendance & Leave States
  const [attSelectedPeriod, setAttSelectedPeriod] = useState('2026-07');
  const [attForm, setAttForm] = useState({
    employee_id: '',
    date: new Date().toISOString().split('T')[0],
    checkIn: '09:00',
    checkOut: '17:00',
    status: 'PRESENT' as any,
    latenessMinutes: 0,
    notes: ''
  });

  const [leaveForm, setLeaveForm] = useState({
    employee_id: '',
    leaveType: 'ANNUAL' as any,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    reason: ''
  });

  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);

  // Reload Attendance Data
  const loadAttendanceData = () => {
    const recs = HRBusinessEngine.getAttendanceRecords(companyId, attSelectedPeriod);
    const lvs = HRBusinessEngine.getLeaveRequests(companyId);
    setAttendanceRecords(recs);
    setLeaveRequests(lvs);
  };

  useEffect(() => {
    loadAttendanceData();
  }, [attSelectedPeriod, companyId]);

  // Organization Engine State
  const [orgUnits, setOrgUnits] = useState<any[]>([]);
  const [selectedOrgUnitFilter, setSelectedOrgUnitFilter] = useState<string>('ALL');
  const [formOrgUnitId, setFormOrgUnitId] = useState<string>('');

  // Modals
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showProcessPayroll, setShowProcessPayroll] = useState(false);

  // Form States - Employee
  const [empForm, setEmpForm] = useState({
    name: '', department: 'PRODUCTION' as Employee['department'], jobTitle: '', baseSalary: 0,
    hireDate: new Date().toISOString().split('T')[0], status: 'ACTIVE' as Employee['status']
  });

  // Payroll run states
  const [payrollPeriod, setPayrollPeriod] = useState('2026-07');
  const [payrollSheet, setPayrollSheet] = useState<PayrollItem[]>([]);
  const [isPayrollGenerated, setIsPayrollGenerated] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  // Load Employees
  const loadEmployees = () => {
    const units = OrganizationEngine.getUnits(companyId);
    setOrgUnits(units);

    const companyEmployees = HRBusinessEngine.getEmployeesByOrgUnit(companyId, selectedOrgUnitFilter);

    if (companyEmployees.length === 0 && selectedOrgUnitFilter === 'ALL') {
      // Seed default employees
      const defaultEmployees: Employee[] = [
        {
          id: 'emp-1',
          company_id: companyId,
          name: isRtl ? 'أحمد عبد الرحمن (مشرف إنتاج علف)' : 'Ahmed Abdel-Rahman (Feed Production Supervisor)',
          code: 'EMP-PROD-201',
          department: 'PRODUCTION',
          jobTitle: 'Production Supervisor',
          baseSalary: 12500,
          hireDate: '2025-02-15',
          status: 'ACTIVE',
          createdAt: new Date().toISOString()
        },
        {
          id: 'emp-2',
          company_id: companyId,
          name: isRtl ? 'د. مروان عادل (طبيب بيطري)' : 'Dr. Marwan Adel (Veterinary Doctor)',
          code: 'EMP-POUL-202',
          department: 'POULTRY_MANAGEMENT',
          jobTitle: 'Senior Veterinarian',
          baseSalary: 18000,
          hireDate: '2024-11-01',
          status: 'ACTIVE',
          createdAt: new Date().toISOString()
        },
        {
          id: 'emp-3',
          company_id: companyId,
          name: isRtl ? 'سارة محمد (محاسب مالي أول)' : 'Sara Mohamed (Senior Accountant)',
          code: 'EMP-ACCT-203',
          department: 'ACCOUNTING',
          jobTitle: 'Senior Accountant',
          baseSalary: 11000,
          hireDate: '2025-05-10',
          status: 'ACTIVE',
          createdAt: new Date().toISOString()
        }
      ];
      StorageEngine.setStored('employees_payroll_items', defaultEmployees);
      setEmployees(defaultEmployees);
    } else {
      setEmployees(companyEmployees);
    }
  };

  useEffect(() => {
    loadEmployees();
    const onUpdate = () => loadEmployees();
    window.addEventListener('custody_db_updated', onUpdate);
    return () => window.removeEventListener('custody_db_updated', onUpdate);
  }, [companyId, selectedOrgUnitFilter]);

  // Calculations
  const totalBasePay = employees.reduce((sum, e) => sum + e.baseSalary, 0);
  const activeStaffCount = employees.filter(e => e.status === 'ACTIVE').length;
  const averageSalary = employees.length > 0 ? (totalBasePay / employees.length) : 0;

  // Submit Employee
  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) {
      showToast('error', isRtl ? 'يرجى اختيار شركة أولاً' : 'Please select a company first');
      return;
    }
    if (!empForm.name || !empForm.jobTitle) {
      showToast('error', isRtl ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }
    if (empForm.baseSalary <= 0) {
      showToast('error', isRtl ? 'الراتب الأساسي يجب أن يكون أكبر من الصفر' : 'Base salary must be greater than zero');
      return;
    }

    try {
      const newEmp = await HRBusinessEngine.createEmployee(companyId, {
        name: empForm.name,
        department: empForm.department,
        jobTitle: empForm.jobTitle,
        baseSalary: Number(empForm.baseSalary),
        hireDate: empForm.hireDate,
        status: empForm.status,
        org_unit_id: formOrgUnitId || activeUser?.org_unit_id
      });

      // Logs
      LogsModule.addLog(
        activeUser?.id || 'system',
        activeUser?.full_name || 'System',
        isRtl ? 'تعيين موظف جديد' : 'Hired New Employee',
        `Registered employee ${newEmp.name} under department ${newEmp.department} with base salary ${newEmp.baseSalary.toLocaleString()} EGP`
      );

      showToast('success', isRtl ? 'تم تسجيل بيانات الموظف بنجاح' : 'Employee registered successfully');
      setEmpForm({ name: '', department: 'PRODUCTION', jobTitle: '', baseSalary: 0, hireDate: new Date().toISOString().split('T')[0], status: 'ACTIVE' });
      setFormOrgUnitId('');
      setShowAddEmployee(false);
      loadEmployees();
    } catch (err) {
      console.error('Create employee error:', err);
      showToast('error', isRtl ? 'حدث خطأ أثناء تسجيل بيانات الموظف' : 'Error registering employee');
    }
  };

  // Helper to calculate official Egyptian social insurance and tax deductions
  const calculateEgyptianDeductions = (base: number) => {
    // Insurable limit is capped at 12,600 EGP in Egypt for standard monthly base
    const insurableBase = Math.min(base, 12600);
    const socialInsuranceEmployee = Math.round(insurableBase * 0.11);
    const socialInsuranceEmployer = Math.round(insurableBase * 0.1875);
    
    // Taxable monthly base: base - employee insurance portion - standard personal exemption (monthly personal exemption ~3500 EGP)
    const taxableBase = Math.max(0, base - socialInsuranceEmployee - 3500);
    
    // Egyptian Payroll Tax Bracket Simulation (Monthly representation of standard brackets)
    let payrollTax = 0;
    if (taxableBase <= 4000) {
      payrollTax = 0;
    } else if (taxableBase <= 7000) {
      payrollTax = Math.round((taxableBase - 4000) * 0.025);
    } else if (taxableBase <= 10000) {
      payrollTax = Math.round(75 + (taxableBase - 7000) * 0.10);
    } else {
      payrollTax = Math.round(375 + (taxableBase - 10000) * 0.15);
    }
    
    return {
      socialInsuranceEmployee,
      socialInsuranceEmployer,
      payrollTax
    };
  };

  // Generate Payroll Sheet
  const handleGeneratePayrollSheet = () => {
    if (!companyId) {
      showToast('error', isRtl ? 'يرجى اختيار شركة أولاً' : 'Please select a company first');
      return;
    }
    const list = HRBusinessEngine.calculateMonthlyPayrollSheet(companyId, payrollPeriod, selectedOrgUnitFilter);
    setPayrollSheet(list);
    setIsPayrollGenerated(true);
  };

  // Update sheet cell (Allowances / Deductions)
  const updateSheetItem = (empId: string, field: 'allowances' | 'deductions', value: number) => {
    setPayrollSheet(payrollSheet.map(item => {
      if (item.employeeId === empId) {
        const allow = field === 'allowances' ? value : item.allowances;
        const deduct = field === 'deductions' ? value : item.deductions;
        const net = item.baseSalary + allow - deduct - item.socialInsuranceEmployee - item.payrollTax;
        return {
          ...item,
          [field]: value,
          netSalary: net
        };
      }
      return item;
    }));
  };

  // Post Settle Payroll Sheet
  const handlePostPayroll = async () => {
    if (!companyId) {
      showToast('error', isRtl ? 'يرجى اختيار شركة أولاً' : 'Please select a company first');
      return;
    }
    if (payrollSheet.length === 0) return;

    const totalGross = payrollSheet.reduce((sum, item) => sum + item.baseSalary + item.allowances, 0);
    const totalEmployeeIns = payrollSheet.reduce((sum, item) => sum + item.socialInsuranceEmployee, 0);
    const totalEmployerIns = payrollSheet.reduce((sum, item) => sum + item.socialInsuranceEmployer, 0);
    const totalTax = payrollSheet.reduce((sum, item) => sum + item.payrollTax, 0);
    const totalNet = payrollSheet.reduce((sum, item) => sum + item.netSalary, 0);

    try {
      await HRBusinessEngine.processPayrollRun(
        companyId,
        activeUser?.id || 'system',
        activeUser?.full_name || 'HR Manager',
        {
          period: payrollPeriod,
          sheet: payrollSheet,
          totalPayout: totalNet,
          totalGross,
          totalEmployeeIns,
          totalEmployerIns,
          totalTax,
          org_unit_id: formOrgUnitId || activeUser?.org_unit_id
        }
      );

      // Audit Log and log double-entry transaction
      LogsModule.addLog(
        activeUser?.id || 'system',
        activeUser?.full_name || 'System',
        isRtl ? 'اعتماد وصرف مسير رواتب الموظفين' : 'Approve Monthly Payroll',
        `Processed payroll run for period ${payrollPeriod}. Total Payout: ${totalNet.toLocaleString()} EGP`
      );

      showToast('success', isRtl ? 'تم اعتماد وصرف مسير الرواتب الشهري للموظفين بنجاح وتحديث السجلات المالية' : 'Monthly payroll approved and processed successfully');
      setIsPayrollGenerated(false);
      setPayrollSheet([]);
      setFormOrgUnitId('');
      setShowProcessPayroll(false);
      loadEmployees();
    } catch (err) {
      console.error('Post payroll error:', err);
      showToast('error', isRtl ? 'حدث خطأ أثناء اعتماد مسير الرواتب' : 'Error processing payroll run');
    }
  };

  // Filters
  const filteredEmployees = employees.filter(e => {
    const matchesDept = deptFilter === 'ALL' || e.department === deptFilter;
    const matchesSearch = e.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          e.code.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesDept && matchesSearch;
  });

  return (
    <div className="space-y-6">
      
      {/* Toast Feedback */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 p-4 rounded-xl shadow-lg border text-white flex items-center gap-3 transition-all ${
          toast.type === 'success' ? 'bg-emerald-600 border-emerald-500' : 'bg-rose-600 border-rose-500'
        }`}>
          <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
          <span className="text-xs font-bold font-sans">{toast.text}</span>
        </div>
      )}

      {/* Main Module Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Briefcase className="text-emerald-500 h-6 w-6" />
            <span>{isRtl ? 'الموارد البشرية والرواتب' : 'HR & Payroll Ledger'}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isRtl 
              ? 'إدارة شؤون العاملين وسجلات تعيين الموظفين، صياغة بدلات واستقطاعات مسير الرواتب الشهري.' 
              : 'Employee files tracking, role assignments, allowances/deductions model, and monthly payroll processing.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowProcessPayroll(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Calculator className="h-4 w-4" />
            <span>{isRtl ? 'مسير الرواتب الشهري' : 'Process Payroll'}</span>
          </button>
          <button
            onClick={() => setShowAddEmployee(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>{isRtl ? 'تعيين موظف جديد' : 'Hire Employee'}</span>
          </button>
        </div>
      </div>

      {/* KPI Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{isRtl ? 'عدد الكادر والموظفين الفعالين' : 'Active Personnel'}</p>
            <h3 className="text-lg font-black text-slate-800 dark:text-white mt-1">{activeStaffCount} {isRtl ? 'موظفين' : 'Staff'}</h3>
          </div>
          <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-xl">
            <Users className="h-5 w-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{isRtl ? 'إجمالي الرواتب الأساسية المعلقة' : 'Total Base Salary Pool'}</p>
            <h3 className="text-lg font-black text-slate-800 dark:text-white mt-1">{totalBasePay.toLocaleString()} EGP</h3>
          </div>
          <div className="p-2 bg-indigo-500/10 text-indigo-600 rounded-xl">
            <Coins className="h-5 w-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{isRtl ? 'متوسط أجور الشركة' : 'Average Wage'}</p>
            <h3 className="text-lg font-black text-indigo-600 mt-1">{averageSalary.toLocaleString(undefined, {maximumFractionDigits:0})} EGP</h3>
          </div>
          <div className="p-2 bg-pink-500/10 text-pink-600 rounded-xl">
            <Heart className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* HR Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-1">
        {(['employees', 'attendance', 'payroll'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-bold transition-all border-b-2 cursor-pointer ${
              activeTab === tab
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {tab === 'employees' && (isRtl ? 'كتالوج الموظفين' : 'Employee Directory')}
            {tab === 'attendance' && (isRtl ? '📅 الحضور والغياب والإجازات' : '📅 Attendance & Leaves')}
            {tab === 'payroll' && (isRtl ? 'الرواتب المصروفة سابقاً' : 'Salary Runs History')}
          </button>
        ))}
      </div>

      {/* Employee directory view */}
      {activeTab === 'employees' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder={isRtl ? 'ابحث باسم الموظف أو رقم الكود...' : 'Search by employee name or code...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1">
                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                <select
                  value={selectedOrgUnitFilter}
                  onChange={(e) => setSelectedOrgUnitFilter(e.target.value)}
                  className="bg-transparent text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
                >
                  <option value="ALL">{isRtl ? 'جميع الهياكل التنظيمية' : 'All Org Units'}</option>
                  {orgUnits.map((u) => (
                    <option key={u.id} value={u.id}>{u.code} - {u.name}</option>
                  ))}
                </select>
              </div>

              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none"
              >
                <option value="ALL">{isRtl ? 'جميع الأقسام' : 'All Departments'}</option>
                <option value="PRODUCTION">{isRtl ? 'إنتاج وتصنيع الأعلاف' : 'Feed Production'}</option>
                <option value="POULTRY_MANAGEMENT">{isRtl ? 'إدارة القطاع الداجني' : 'Poultry Sector'}</option>
                <option value="SALES">{isRtl ? 'إدارة التسويق والمبيعات' : 'Sales'}</option>
                <option value="ACCOUNTING">{isRtl ? 'الحسابات والمحاسبة المالية' : 'Accounting'}</option>
                <option value="ADMINISTRATION">{isRtl ? 'الإدارة العامة والموارد' : 'Administration'}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEmployees.map((e) => (
              <div key={e.id} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between h-[170px]">
                <div>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[9px] font-mono px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-400 font-bold uppercase">{e.code}</span>
                      <h3 className="text-xs font-black text-slate-800 dark:text-slate-100 mt-1.5">{e.name}</h3>
                    </div>
                    <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-extrabold ${
                      e.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'
                    }`}>
                      {e.status}
                    </span>
                  </div>

                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-2">{e.jobTitle} | {e.department}</p>
                  {e.org_unit_id && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                      <Building2 className="h-3 w-3" />
                      <span>{orgUnits.find(u => u.id === e.org_unit_id)?.name || e.org_unit_id}</span>
                    </div>
                  )}
                </div>

                <div className="pt-3.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-medium">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold">{isRtl ? 'تاريخ التعيين:' : 'Hired Date:'}</span>
                    <span className="font-mono text-slate-500 block">{e.hireDate}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-bold">{isRtl ? 'الراتب الأساسي:' : 'Base Salary:'}</span>
                    <span className="font-mono text-slate-800 dark:text-slate-100 font-black text-xs block">{e.baseSalary.toLocaleString()} EGP</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attendance & Leaves View */}
      {activeTab === 'attendance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Form 1: Daily Check-in / Check-out */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
              <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                <Calendar className="text-emerald-500 h-4 w-4" />
                <span>{isRtl ? 'تسجيل الحضور والانصراف اليومي' : 'Daily Attendance Check-In'}</span>
              </h3>

              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!attForm.employee_id) return showToast('error', isRtl ? 'يرجى اختيار الموظف' : 'Select employee');
                await HRBusinessEngine.recordAttendance(companyId, {
                  employee_id: attForm.employee_id,
                  date: attForm.date,
                  checkIn: attForm.checkIn,
                  checkOut: attForm.checkOut,
                  status: attForm.status,
                  latenessMinutes: Number(attForm.latenessMinutes),
                  notes: attForm.notes
                });
                showToast('success', isRtl ? 'تم تسجيل سجل الحضور اليومي بنجاح' : 'Attendance recorded successfully');
                loadAttendanceData();
              }} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">{isRtl ? 'الموظف' : 'Employee'}</label>
                    <select
                      value={attForm.employee_id}
                      onChange={e => setAttForm({ ...attForm, employee_id: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                      required
                    >
                      <option value="">{isRtl ? '-- اختر الموظف --' : '-- Select Employee --'}</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.name} ({emp.code})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">{isRtl ? 'التاريخ' : 'Date'}</label>
                    <input
                      type="date"
                      value={attForm.date}
                      onChange={e => setAttForm({ ...attForm, date: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">{isRtl ? 'الحالة' : 'Status'}</label>
                    <select
                      value={attForm.status}
                      onChange={e => setAttForm({ ...attForm, status: e.target.value as any })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    >
                      <option value="PRESENT">{isRtl ? 'حاضر (Present)' : 'Present'}</option>
                      <option value="LATE">{isRtl ? 'متأخر (Late)' : 'Late'}</option>
                      <option value="ABSENT">{isRtl ? 'غائب (Absent)' : 'Absent'}</option>
                      <option value="EARLY_LEAVE">{isRtl ? 'انصراف مبكر' : 'Early Leave'}</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">{isRtl ? 'الدخول' : 'Check-In'}</label>
                    <input
                      type="time"
                      value={attForm.checkIn}
                      onChange={e => setAttForm({ ...attForm, checkIn: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">{isRtl ? 'دقائق التأخير' : 'Late Mins'}</label>
                    <input
                      type="number"
                      value={attForm.latenessMinutes}
                      onChange={e => setAttForm({ ...attForm, latenessMinutes: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">{isRtl ? 'ملاحظات' : 'Notes'}</label>
                  <input
                    type="text"
                    placeholder={isRtl ? 'سبب التأخير أو ملاحظة المباشرة...' : 'Reason for delay or notes...'}
                    value={attForm.notes}
                    onChange={e => setAttForm({ ...attForm, notes: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-sm"
                >
                  {isRtl ? 'حفظ سجل الحضور' : 'Save Attendance Record'}
                </button>
              </form>
            </div>

            {/* Form 2: Leave Request Submission */}
            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
              <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                <Heart className="text-indigo-500 h-4 w-4" />
                <span>{isRtl ? 'تقديم طلب إجازة موظف' : 'Submit Leave Request'}</span>
              </h3>

              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!leaveForm.employee_id) return showToast('error', isRtl ? 'اختر الموظف' : 'Select employee');
                await HRBusinessEngine.submitLeaveRequest(companyId, {
                  employee_id: leaveForm.employee_id,
                  leaveType: leaveForm.leaveType,
                  startDate: leaveForm.startDate,
                  endDate: leaveForm.endDate,
                  reason: leaveForm.reason
                });
                showToast('success', isRtl ? 'تم تقديم طلب الإجازة للارسال للاعتماد' : 'Leave request submitted');
                setLeaveForm({ ...leaveForm, reason: '' });
                loadAttendanceData();
              }} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">{isRtl ? 'الموظف' : 'Employee'}</label>
                    <select
                      value={leaveForm.employee_id}
                      onChange={e => setLeaveForm({ ...leaveForm, employee_id: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                      required
                    >
                      <option value="">{isRtl ? '-- اختر الموظف --' : '-- Select Employee --'}</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">{isRtl ? 'نوع الإجازة' : 'Leave Type'}</label>
                    <select
                      value={leaveForm.leaveType}
                      onChange={e => setLeaveForm({ ...leaveForm, leaveType: e.target.value as any })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    >
                      <option value="ANNUAL">{isRtl ? 'إجازة سنوية' : 'Annual Leave'}</option>
                      <option value="SICK">{isRtl ? 'إجازة مرضية' : 'Sick Leave'}</option>
                      <option value="CASUAL">{isRtl ? 'إجازة عارضة' : 'Casual Leave'}</option>
                      <option value="UNPAID">{isRtl ? 'إجازة بدون راتب (خصم)' : 'Unpaid Leave (Deduction)'}</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">{isRtl ? 'تاريخ البداية' : 'Start Date'}</label>
                    <input
                      type="date"
                      value={leaveForm.startDate}
                      onChange={e => setLeaveForm({ ...leaveForm, startDate: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">{isRtl ? 'تاريخ النهاية' : 'End Date'}</label>
                    <input
                      type="date"
                      value={leaveForm.endDate}
                      onChange={e => setLeaveForm({ ...leaveForm, endDate: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">{isRtl ? 'سبب الإجازة' : 'Reason'}</label>
                  <input
                    type="text"
                    placeholder={isRtl ? 'اكتب أسباب أو مبررات طلب الإجازة...' : 'State leave justification...'}
                    value={leaveForm.reason}
                    onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-sm"
                >
                  {isRtl ? 'إرسال طلب الإجازة' : 'Submit Leave Request'}
                </button>
              </form>
            </div>
          </div>

          {/* Leave Requests Approvals Queue */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3">
            <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center justify-between">
              <span>{isRtl ? 'جدول طلبات الإجازات والاعتمادات' : 'Leave Approvals Queue'}</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 font-bold">
                {leaveRequests.length} {isRtl ? 'طلبات' : 'requests'}
              </span>
            </h3>

            {leaveRequests.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">{isRtl ? 'لا توجد طلبات إجازة مسجلة حالياً.' : 'No leave requests recorded.'}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold">
                      <th className="py-2">{isRtl ? 'الموظف' : 'Employee'}</th>
                      <th className="py-2">{isRtl ? 'نوع الإجازة' : 'Type'}</th>
                      <th className="py-2">{isRtl ? 'الفترة' : 'Period'}</th>
                      <th className="py-2">{isRtl ? 'الأيام' : 'Days'}</th>
                      <th className="py-2">{isRtl ? 'السبب' : 'Reason'}</th>
                      <th className="py-2">{isRtl ? 'الحالة' : 'Status'}</th>
                      <th className="py-2 text-center">{isRtl ? 'الإجراء' : 'Action'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaveRequests.map(lv => (
                      <tr key={lv.id} className="border-b border-slate-100 dark:border-slate-800/50">
                        <td className="py-2.5 font-bold text-slate-800 dark:text-slate-200">{lv.employee_name || lv.employee_id}</td>
                        <td className="py-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            lv.leaveType === 'UNPAID' ? 'bg-rose-500/10 text-rose-600' : 'bg-blue-500/10 text-blue-600'
                          }`}>
                            {lv.leaveType}
                          </span>
                        </td>
                        <td className="py-2.5 font-mono text-slate-500">{lv.startDate} ~ {lv.endDate}</td>
                        <td className="py-2.5 font-bold">{lv.daysCount} {isRtl ? 'أيام' : 'days'}</td>
                        <td className="py-2.5 text-slate-500">{lv.reason}</td>
                        <td className="py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            lv.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-600' :
                            lv.status === 'REJECTED' ? 'bg-rose-500/10 text-rose-600' : 'bg-amber-500/10 text-amber-600'
                          }`}>
                            {lv.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-center">
                          {lv.status === 'PENDING' && (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={async () => {
                                  await HRBusinessEngine.updateLeaveStatus(companyId, lv.id, 'APPROVED', activeUser?.full_name || 'HR Manager');
                                  showToast('success', isRtl ? 'تمت الموافقة على الإجازة' : 'Leave request approved');
                                  loadAttendanceData();
                                }}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold cursor-pointer"
                              >
                                {isRtl ? 'موافقة' : 'Approve'}
                              </button>
                              <button
                                onClick={async () => {
                                  await HRBusinessEngine.updateLeaveStatus(companyId, lv.id, 'REJECTED', activeUser?.full_name || 'HR Manager');
                                  showToast('error', isRtl ? 'تم رفض طلب الإجازة' : 'Leave request rejected');
                                  loadAttendanceData();
                                }}
                                className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold cursor-pointer"
                              >
                                {isRtl ? 'رفض' : 'Reject'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Monthly Attendance & Automatic Payroll Deductions Summary */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                <Calculator className="text-emerald-500 h-4 w-4" />
                <span>{isRtl ? 'ملخص الحضور والخصومات الآلية للرواتب' : 'Monthly Attendance & Auto-Deductions Summary'}</span>
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400">{isRtl ? 'الشهر:' : 'Period:'}</span>
                <input
                  type="month"
                  value={attSelectedPeriod}
                  onChange={e => setAttSelectedPeriod(e.target.value)}
                  className="px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold">
                    <th className="py-2">{isRtl ? 'الكود والموظف' : 'Employee'}</th>
                    <th className="py-2 text-center">{isRtl ? 'أيام الحضور' : 'Present Days'}</th>
                    <th className="py-2 text-center">{isRtl ? 'أيام الغياب' : 'Absent Days'}</th>
                    <th className="py-2 text-center">{isRtl ? 'دقائق التأخير' : 'Late Mins'}</th>
                    <th className="py-2 text-center">{isRtl ? 'إجازة بدون راتب' : 'Unpaid Leaves'}</th>
                    <th className="py-2 font-mono text-emerald-600">{isRtl ? 'خصم الحضور التلقائي' : 'Auto Deduction'}</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map(emp => {
                    const summary = HRBusinessEngine.getMonthlyAttendanceSummary(companyId, emp.id, attSelectedPeriod);
                    return (
                      <tr key={emp.id} className="border-b border-slate-100 dark:border-slate-800/50">
                        <td className="py-2.5 font-bold text-slate-800 dark:text-slate-100">
                          {emp.name} <span className="text-[10px] text-slate-400 font-mono">({emp.code})</span>
                        </td>
                        <td className="py-2.5 text-center font-bold text-emerald-600">{summary.presentDays}</td>
                        <td className="py-2.5 text-center font-bold text-rose-600">{summary.absentDays}</td>
                        <td className="py-2.5 text-center font-mono text-amber-600">{summary.totalLatenessMinutes} m</td>
                        <td className="py-2.5 text-center font-bold">{summary.unpaidLeaveDays} d</td>
                        <td className="py-2.5 font-mono font-black text-rose-600">{summary.calculatedDeduction.toLocaleString()} EGP</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Salary runs history */}
      {activeTab === 'payroll' && (
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm text-center text-slate-400 font-medium p-8">
          {isRtl ? 'لم يتم اعتماد أو صرف أي كشوف رواتب بعد في الفترة الحالية.' : 'No salary sheets approved yet for the current period.'}
        </div>
      )}

      {/* MODAL 1: REGISTER NEW EMPLOYEE */}
      {showAddEmployee && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setShowAddEmployee(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <X size={16} />
            </button>
            <h3 className="text-md font-black text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <Users className="text-emerald-500 h-5 w-5" />
              <span>{isRtl ? 'تسجيل وتوظيف موظف جديد' : 'Hire New Employee'}</span>
            </h3>

            <form onSubmit={handleAddEmployee} className="space-y-4">
              <div>
                <OrgUnitTreeSelect
                  label={isRtl ? 'الوحدة التنظيمية / الفرع / القسم' : 'Organization Unit / Branch'}
                  value={formOrgUnitId}
                  onChange={(id) => setFormOrgUnitId(id)}
                  placeholder={isRtl ? '-- افتراضي (حسب صلاحية المستخدم) --' : '-- Default (User Scope) --'}
                  companyId={companyId}
                  isRtl={isRtl}
                  theme={theme}
                  showInheritanceSummary={false}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'الاسم بالكامل للموظف *' : 'Employee Full Name *'}</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Aly, Mona..."
                  value={empForm.name}
                  onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'القسم الوظيفي' : 'Department'}</label>
                  <select
                    value={empForm.department}
                    onChange={(e) => setEmpForm({ ...empForm, department: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="PRODUCTION">{isRtl ? 'إنتاج علف' : 'Feed Production'}</option>
                    <option value="POULTRY_MANAGEMENT">{isRtl ? 'القطاع الداجني' : 'Poultry Sector'}</option>
                    <option value="SALES">{isRtl ? 'المبيعات والتسويق' : 'Sales'}</option>
                    <option value="ACCOUNTING">{isRtl ? 'الحسابات والمحاسبة' : 'Accounting'}</option>
                    <option value="ADMINISTRATION">{isRtl ? 'الإدارة العامة' : 'Administration'}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'المسمى الوظيفي *' : 'Job Title *'}</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Operator, Analyst"
                    value={empForm.jobTitle}
                    onChange={(e) => setEmpForm({ ...empForm, jobTitle: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'الراتب الأساسي (EGP) *' : 'Base Salary (EGP) *'}</label>
                  <input
                    type="number"
                    required
                    value={empForm.baseSalary}
                    onChange={(e) => setEmpForm({ ...empForm, baseSalary: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'تاريخ التعيين' : 'Hiring Date'}</label>
                  <input
                    type="date"
                    value={empForm.hireDate}
                    onChange={(e) => setEmpForm({ ...empForm, hireDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none text-slate-800 dark:text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddEmployee(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl"
                >
                  {isRtl ? 'حفظ وبيان التعيين' : 'Save Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: MONTHLY PAYROLL PROCESS */}
      {showProcessPayroll && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setShowProcessPayroll(false);
                setIsPayrollGenerated(false);
                setPayrollSheet([]);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <X size={16} />
            </button>
            <h3 className="text-md font-black text-slate-800 dark:text-white mb-2 flex items-center gap-2">
              <Calculator className="text-indigo-500 h-5 w-5" />
              <span>{isRtl ? 'محرك احتساب وصرف مسير الرواتب' : 'HR Payroll Run Engine'}</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              {isRtl 
                ? 'توليد مسير الرواتب المالي الشهري، مع إمكانية تعديل البدلات والاستقطاعات بشكل فوري لكل موظف نشط بالشركة.'
                : 'Process wages for active staff. Direct inline adjustments to Allowances (bonuses) and Deductions are computed automatically.'}
            </p>

            <div className="space-y-4 text-xs font-medium">
              <div className="flex items-end gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'الفترة المالية / الشهر:' : 'Payroll Month period:'}</label>
                  <input
                    type="month"
                    value={payrollPeriod}
                    onChange={(e) => setPayrollPeriod(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none text-slate-800 dark:text-slate-100 font-mono"
                  />
                </div>
                <button
                  onClick={handleGeneratePayrollSheet}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all h-[36px]"
                >
                  {isRtl ? 'إنشاء مسير الرواتب' : 'Generate Payroll Sheet'}
                </button>
              </div>

              {isPayrollGenerated && (
                <div className="space-y-4">
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-[250px] overflow-y-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                          <th className="p-2 text-left">{isRtl ? 'الموظف' : 'Staff'}</th>
                          <th className="p-2 text-right">{isRtl ? 'الراتب الأساسي' : 'Base Pay'}</th>
                          <th className="p-2 text-center">{isRtl ? 'البدلات (اضافي)' : 'Allowances (+)'}</th>
                          <th className="p-2 text-center">{isRtl ? 'الاستقطاعات (-)' : 'Deductions (-)'}</th>
                          <th className="p-2 text-right">{isRtl ? 'صافي الراتب' : 'Net Salary'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {payrollSheet.map((item, idx) => (
                          <tr key={idx} className="text-slate-700 dark:text-slate-300 font-sans">
                            <td className="p-2">
                              <p className="font-bold">{item.employeeName}</p>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[9px] text-slate-400">
                                <span className="font-mono">{item.employeeCode}</span>
                                <span>•</span>
                                <span>{isRtl ? `تأمينات (11%):` : `Ins (11%):`} <strong className="font-mono text-rose-500">-{item.socialInsuranceEmployee} EGP</strong></span>
                                <span>•</span>
                                <span>{isRtl ? `كسب عمل:` : `Tax:`} <strong className="font-mono text-rose-500">-{item.payrollTax} EGP</strong></span>
                                <span>•</span>
                                <span className="text-indigo-500">{isRtl ? `حصة الشركة (18.75%):` : `Employer Ins (18.75%):`} <strong className="font-mono">+{item.socialInsuranceEmployer} EGP</strong></span>
                              </div>
                            </td>
                            <td className="p-2 text-right font-mono font-bold">{item.baseSalary.toLocaleString()}</td>
                            <td className="p-2 text-center">
                              <input
                                type="number"
                                value={item.allowances}
                                onChange={(e) => updateSheetItem(item.employeeId, 'allowances', Number(e.target.value))}
                                className="w-20 text-center border rounded px-1.5 py-0.5 font-mono dark:bg-slate-950 text-emerald-600 dark:border-slate-800"
                              />
                            </td>
                            <td className="p-2 text-center">
                              <input
                                type="number"
                                value={item.deductions}
                                onChange={(e) => updateSheetItem(item.employeeId, 'deductions', Number(e.target.value))}
                                className="w-20 text-center border rounded px-1.5 py-0.5 font-mono dark:bg-slate-950 text-rose-500 dark:border-slate-800"
                              />
                            </td>
                            <td className="p-2 text-right font-mono font-black text-emerald-600">{(item.netSalary).toLocaleString()} EGP</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-between items-center bg-slate-100 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="font-bold">{isRtl ? 'إجمالي مستحقات المسير المصروفة:' : 'Total Monthly HR Net Payroll:'}</span>
                    <span className="font-mono font-black text-emerald-600 text-sm">
                      {payrollSheet.reduce((sum, item) => sum + item.netSalary, 0).toLocaleString()} EGP
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowProcessPayroll(false);
                        setIsPayrollGenerated(false);
                        setPayrollSheet([]);
                      }}
                      className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl"
                    >
                      {isRtl ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                      onClick={handlePostPayroll}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl cursor-pointer"
                    >
                      {isRtl ? 'اعتماد وصرف الرواتب للبنك/العهد' : 'Post & Disburse Payroll'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
