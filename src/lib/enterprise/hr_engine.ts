import { StorageEngine } from '../../db/storage';
import { syncWriteWithOfflineFallback } from '../../db/offlineQueue';
import { DocumentNumberEngine } from '../../db/documentNumberEngine';
import { CostCenterEngine } from '../../db/costCenterEngine';
import { OrganizationEngine } from '../../db/organizationEngine';
import { AccountingBusinessEngine } from './accounting_engine';
import { 
  Employee, PayrollItem, PayrollRun, EmployeeDepartment, EmployeeStatus,
  AttendanceRecord, LeaveRequest, MonthlyAttendanceSummary, LeaveType, LeaveStatus, AttendanceStatus
} from '../../types/hr';

export class HRBusinessEngine {
  /**
   * Retrieves all employees filtered by company, supporting organizational subtree filtering
   */
  public static getEmployeesByOrgUnit(companyId: string, org_unit_id?: string): Employee[] {
    const all = StorageEngine.getStored<Employee[]>('employees_payroll_items', []);
    const companyEmployees = all.filter(e => e.company_id === companyId);

    if (!org_unit_id || org_unit_id === 'ALL') {
      return companyEmployees;
    }

    const validSubtreeIds = new Set(OrganizationEngine.getSubtreeUnitIds(org_unit_id, companyId));
    return companyEmployees.filter(e => e.org_unit_id && validSubtreeIds.has(e.org_unit_id));
  }

  /**
   * Retrieves all processed payroll runs filtered by company, supporting organizational subtree filtering
   */
  public static getPayrollRunsByOrgUnit(companyId: string, org_unit_id?: string): PayrollRun[] {
    const all = StorageEngine.getStored<PayrollRun[]>('payroll_processed_runs', []);
    const companyRuns = all.filter(r => r.company_id === companyId);

    if (!org_unit_id || org_unit_id === 'ALL') {
      return companyRuns;
    }

    const validSubtreeIds = new Set(OrganizationEngine.getSubtreeUnitIds(org_unit_id, companyId));
    return companyRuns.filter(r => r.org_unit_id && validSubtreeIds.has(r.org_unit_id));
  }

  /**
   * Registers a new employee with auto-sequence numbering and cost-center resolution
   */
  public static async createEmployee(
    companyId: string,
    data: {
      name: string;
      department: EmployeeDepartment;
      jobTitle: string;
      baseSalary: number;
      hireDate?: string;
      status?: EmployeeStatus;
      org_unit_id?: string;
      cost_center_id?: string;
    }
  ): Promise<Employee> {
    const allEmployees = StorageEngine.getStored<Employee[]>('employees_payroll_items', []);
    const targetOrgUnit = data.org_unit_id || undefined;

    let targetCostCenter = data.cost_center_id;
    if (!targetCostCenter && targetOrgUnit) {
      const cc = await CostCenterEngine.resolveCostCenterForOrgUnit(targetOrgUnit, companyId);
      if (cc) targetCostCenter = cc.id;
    }

    // Code generation
    let code = '';
    try {
      const genResult = await DocumentNumberEngine.generateNextNumberAsync({
        companyId,
        documentType: 'HR',
        org_unit_id: targetOrgUnit
      });
      code = genResult.documentNumber;
    } catch {
      const count = 201 + allEmployees.filter(emp => emp.company_id === companyId).length;
      code = `EMP-${data.department}-${count}`;
    }

    const newEmployee: Employee = {
      id: `emp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      company_id: companyId,
      org_unit_id: targetOrgUnit,
      cost_center_id: targetCostCenter,
      name: data.name,
      code,
      department: data.department,
      jobTitle: data.jobTitle,
      baseSalary: Number(data.baseSalary),
      hireDate: data.hireDate || new Date().toISOString().split('T')[0],
      status: data.status || 'ACTIVE',
      createdAt: new Date().toISOString()
    };

    const updated = [...allEmployees, newEmployee];
    const syncRes = await syncWriteWithOfflineFallback('employees_payroll_items', newEmployee.id, newEmployee);
    if (!syncRes.success) {
      throw new Error(syncRes.error || `فشل تسجيل الموظف ${newEmployee.name} في قاعدة البيانات.`);
    }
    StorageEngine.setStored('employees_payroll_items', updated);

    return newEmployee;
  }

  /**
   * Settle and post monthly HR payroll run with automatic double-entry posting and org metadata stamping
   */
  public static async processPayrollRun(
    companyId: string,
    operatorId: string,
    operatorName: string,
    data: {
      period: string;
      sheet: PayrollItem[];
      totalPayout: number;
      totalGross: number;
      totalEmployeeIns: number;
      totalEmployerIns: number;
      totalTax: number;
      org_unit_id?: string;
      cost_center_id?: string;
    }
  ): Promise<PayrollRun> {
    const allRuns = StorageEngine.getStored<PayrollRun[]>('payroll_processed_runs', []);
    const targetOrgUnit = data.org_unit_id || undefined;

    let targetCostCenter = data.cost_center_id;
    if (!targetCostCenter && targetOrgUnit) {
      const cc = await CostCenterEngine.resolveCostCenterForOrgUnit(targetOrgUnit, companyId);
      if (cc) targetCostCenter = cc.id;
    }

    const runRecord: PayrollRun = {
      id: `payrun-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      company_id: companyId,
      org_unit_id: targetOrgUnit,
      cost_center_id: targetCostCenter,
      period: data.period,
      items: data.sheet,
      totalPayout: data.totalPayout,
      totalGross: data.totalGross,
      totalEmployeeIns: data.totalEmployeeIns,
      totalEmployerIns: data.totalEmployerIns,
      totalTax: data.totalTax,
      processedBy: operatorName,
      timestamp: new Date().toISOString()
    };

    const syncRes = await syncWriteWithOfflineFallback('payroll_processed_runs', runRecord.id, runRecord);
    if (!syncRes.success) {
      throw new Error(syncRes.error || `فشل حفظ مسير الرواتب للشهر ${data.period} في قاعدة البيانات.`);
    }
    StorageEngine.setStored('payroll_processed_runs', [...allRuns, runRecord]);

    // Post Accounting Double-Entry (General Ledger Integration with Org Dimensions)
    try {
      const statementAr = `قيد استحقاق رواتب الموظفين لشهر ${data.period} - متضمن التأمينات والضرائب`;
      const statementEn = `Payroll accrual for period ${data.period} - including social security and taxes`;

      await AccountingBusinessEngine.postOperationalDoubleEntry(
        companyId,
        operatorId,
        `PAY-${data.period}`,
        statementAr,
        statementEn,
        [
          // Debit: Salaries Expense (510601) - Gross amount
          { accountCode: '510601', debit: data.totalGross, credit: 0, notes: `رواتب أساسية وبدلات` },
          // Debit: Employer Insurance Expense (510701)
          { accountCode: '510701', debit: data.totalEmployerIns, credit: 0, notes: `حصة الشركة في التأمينات` },
          // Credit: Social Insurance Payable (210401)
          { accountCode: '210401', debit: 0, credit: data.totalEmployeeIns + data.totalEmployerIns, notes: `مستحقات هيئة التأمينات الاجتماعية` },
          // Credit: Payroll Taxes Payable (210501)
          { accountCode: '210501', debit: 0, credit: data.totalTax, notes: `مستحقات مصلحة الضرائب (ضريبة كسب العمل)` },
          // Credit: Bank account (110201)
          { accountCode: '110201', debit: 0, credit: data.totalPayout, notes: `صافي الرواتب المنصرفة للبنوك` }
        ],
        {
          org_unit_id: targetOrgUnit,
          cost_center_id: targetCostCenter
        }
      );
    } catch (e) {
      console.error('HR Payroll GL double entry posting error:', e);
    }

    return runRecord;
  }

  /**
   * Records or updates a daily attendance record for an employee
   */
  public static async recordAttendance(
    companyId: string,
    data: {
      employee_id: string;
      date: string; // YYYY-MM-DD
      checkIn?: string;
      checkOut?: string;
      status: AttendanceStatus;
      workHours?: number;
      latenessMinutes?: number;
      notes?: string;
      org_unit_id?: string;
    }
  ): Promise<AttendanceRecord> {
    const allRecords = StorageEngine.getStored<AttendanceRecord[]>('hr_attendance_records', []);
    const existingIndex = allRecords.findIndex(r => r.company_id === companyId && r.employee_id === data.employee_id && r.date === data.date);

    const employees = StorageEngine.getStored<Employee[]>('employees_payroll_items', []);
    const emp = employees.find(e => e.id === data.employee_id);

    const record: AttendanceRecord = {
      id: existingIndex >= 0 ? allRecords[existingIndex].id : `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      company_id: companyId,
      employee_id: data.employee_id,
      employee_name: emp?.name || '',
      date: data.date,
      checkIn: data.checkIn || '09:00',
      checkOut: data.checkOut || '17:00',
      status: data.status,
      workHours: data.workHours !== undefined ? data.workHours : (data.status === 'PRESENT' || data.status === 'LATE' ? 8 : 0),
      latenessMinutes: data.latenessMinutes || (data.status === 'LATE' ? 30 : 0),
      notes: data.notes || '',
      org_unit_id: data.org_unit_id || emp?.org_unit_id
    };

    let updated: AttendanceRecord[];
    if (existingIndex >= 0) {
      updated = [...allRecords];
      updated[existingIndex] = record;
    } else {
      updated = [...allRecords, record];
    }

    const syncRes = await syncWriteWithOfflineFallback('hr_attendance_records', record.id, record);
    if (!syncRes.success) {
      throw new Error(syncRes.error || `فشل تسجيل الحضور للموظف ${record.employee_name} في قاعدة البيانات.`);
    }
    StorageEngine.setStored('hr_attendance_records', updated);
    return record;
  }

  /**
   * Get attendance records for a company, optionally filtered by month period (YYYY-MM) or employee
   */
  public static getAttendanceRecords(companyId: string, period?: string, employeeId?: string): AttendanceRecord[] {
    const all = StorageEngine.getStored<AttendanceRecord[]>('hr_attendance_records', []);
    return all.filter(r => {
      if (r.company_id !== companyId) return false;
      if (period && !r.date.startsWith(period)) return false;
      if (employeeId && r.employee_id !== employeeId) return false;
      return true;
    });
  }

  /**
   * Submits a leave request for an employee
   */
  public static async submitLeaveRequest(
    companyId: string,
    data: {
      employee_id: string;
      leaveType: LeaveType;
      startDate: string;
      endDate: string;
      reason: string;
      org_unit_id?: string;
    }
  ): Promise<LeaveRequest> {
    const allLeaves = StorageEngine.getStored<LeaveRequest[]>('hr_leave_requests', []);
    const employees = StorageEngine.getStored<Employee[]>('employees_payroll_items', []);
    const emp = employees.find(e => e.id === data.employee_id);

    // Calculate days count
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    const diffTime = Math.max(0, end.getTime() - start.getTime());
    const daysCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const leave: LeaveRequest = {
      id: `leave-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      company_id: companyId,
      employee_id: data.employee_id,
      employee_name: emp?.name || '',
      leaveType: data.leaveType,
      startDate: data.startDate,
      endDate: data.endDate,
      daysCount,
      reason: data.reason,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      org_unit_id: data.org_unit_id || emp?.org_unit_id
    };

    const updated = [...allLeaves, leave];
    const syncRes = await syncWriteWithOfflineFallback('hr_leave_requests', leave.id, leave);
    if (!syncRes.success) {
      throw new Error(syncRes.error || `فشل تقديم طلب الإجازة للموظف ${leave.employee_name} في قاعدة البيانات.`);
    }
    StorageEngine.setStored('hr_leave_requests', updated);
    return leave;
  }

  /**
   * Approves or rejects a leave request
   */
  public static async updateLeaveStatus(
    companyId: string,
    leaveId: string,
    status: LeaveStatus,
    approverName: string
  ): Promise<LeaveRequest | null> {
    const allLeaves = StorageEngine.getStored<LeaveRequest[]>('hr_leave_requests', []);
    const index = allLeaves.findIndex(l => l.id === leaveId && l.company_id === companyId);
    if (index === -1) return null;

    const updated = [...allLeaves];
    updated[index] = {
      ...updated[index],
      status,
      approvedBy: approverName
    };

    const syncRes = await syncWriteWithOfflineFallback('hr_leave_requests', leaveId, updated[index]);
    if (!syncRes.success) {
      throw new Error(syncRes.error || `فشل تحديث حالة طلب الإجازة في قاعدة البيانات.`);
    }
    StorageEngine.setStored('hr_leave_requests', updated);

    // If approved, create/update attendance records for the leave period
    if (status === 'APPROVED') {
      const leave = updated[index];
      const curr = new Date(leave.startDate);
      const end = new Date(leave.endDate);

      while (curr <= end) {
        const dateStr = curr.toISOString().split('T')[0];
        await this.recordAttendance(companyId, {
          employee_id: leave.employee_id,
          date: dateStr,
          status: 'LEAVE',
          notes: `إجازة ${leave.leaveType}: ${leave.reason}`,
          org_unit_id: leave.org_unit_id
        });
        curr.setDate(curr.getDate() + 1);
      }
    }

    return updated[index];
  }

  /**
   * Get leave requests for a company
   */
  public static getLeaveRequests(companyId: string, status?: LeaveStatus): LeaveRequest[] {
    const all = StorageEngine.getStored<LeaveRequest[]>('hr_leave_requests', []);
    return all.filter(l => {
      if (l.company_id !== companyId) return false;
      if (status && l.status !== status) return false;
      return true;
    });
  }

  /**
   * Calculates monthly attendance summary and payroll deductions for an employee
   */
  public static getMonthlyAttendanceSummary(companyId: string, employeeId: string, period: string): MonthlyAttendanceSummary {
    const employees = StorageEngine.getStored<Employee[]>('employees_payroll_items', []);
    const emp = employees.find(e => e.id === employeeId);
    const baseSalary = emp?.baseSalary || 0;
    const dailyRate = baseSalary > 0 ? baseSalary / 30 : 0;
    const hourlyRate = dailyRate / 8;

    const records = this.getAttendanceRecords(companyId, period, employeeId);
    const leaves = this.getLeaveRequests(companyId, 'APPROVED').filter(l => l.employee_id === employeeId && l.startDate.startsWith(period));

    let presentDays = 0;
    let absentDays = 0;
    let lateDays = 0;
    let totalLatenessMinutes = 0;
    let unpaidLeaveDays = 0;

    records.forEach(r => {
      if (r.status === 'PRESENT') presentDays++;
      else if (r.status === 'ABSENT') absentDays++;
      else if (r.status === 'LATE') {
        lateDays++;
        presentDays++;
        totalLatenessMinutes += (r.latenessMinutes || 30);
      }
    });

    leaves.forEach(l => {
      if (l.leaveType === 'UNPAID') {
        unpaidLeaveDays += l.daysCount;
      }
    });

    // Deduction formula:
    // 1. Absent days without leave = 1.0 x daily rate per absent day
    // 2. Unpaid leave days = 1.0 x daily rate per unpaid leave day
    // 3. Lateness = total lateness minutes * (hourly rate / 60)
    const absenceDeduction = absentDays * dailyRate;
    const unpaidLeaveDeduction = unpaidLeaveDays * dailyRate;
    const latenessDeduction = (totalLatenessMinutes / 60) * hourlyRate;

    const calculatedDeduction = Math.round((absenceDeduction + unpaidLeaveDeduction + latenessDeduction) * 100) / 100;

    return {
      employeeId,
      employeeName: emp?.name || '',
      period,
      totalDays: 30,
      presentDays,
      absentDays,
      lateDays,
      totalLatenessMinutes,
      unpaidLeaveDays,
      calculatedDeduction
    };
  }

  /**
   * Calculates complete payroll items sheet for a company and period including attendance deductions
   */
  public static calculateMonthlyPayrollSheet(companyId: string, period: string, org_unit_id?: string): PayrollItem[] {
    const employees = this.getEmployeesByOrgUnit(companyId, org_unit_id).filter(e => e.status === 'ACTIVE');

    return employees.map(emp => {
      const summary = this.getMonthlyAttendanceSummary(companyId, emp.id, period);
      const baseSalary = emp.baseSalary;
      const allowances = Math.round(baseSalary * 0.1); // 10% standard allowance
      const manualDeductions = 0;
      const attendanceDeductions = summary.calculatedDeduction;

      const grossSalary = baseSalary + allowances;
      
      // Social insurance (Egyptian / Regional standard: 11% employee, 18.75% employer on gross up to cap)
      const insCap = Math.min(grossSalary, 12600);
      const socialInsuranceEmployee = Math.round(insCap * 0.11 * 100) / 100;
      const socialInsuranceEmployer = Math.round(insCap * 0.1875 * 100) / 100;

      // Taxable income
      const taxableGross = Math.max(0, grossSalary - socialInsuranceEmployee - 1250); // 15,000 EGP annual exempt ~ 1250/mo
      // Progressive monthly tax approximation (10-15%)
      let payrollTax = 0;
      if (taxableGross > 0) {
        payrollTax = Math.round(taxableGross * 0.10 * 100) / 100;
      }

      const totalDeductions = manualDeductions + attendanceDeductions + socialInsuranceEmployee + payrollTax;
      const netSalary = Math.round(Math.max(0, grossSalary - totalDeductions) * 100) / 100;

      return {
        employeeId: emp.id,
        employeeName: emp.name,
        employeeCode: emp.code,
        baseSalary,
        allowances,
        deductions: manualDeductions,
        attendanceDeductions,
        socialInsuranceEmployee,
        socialInsuranceEmployer,
        payrollTax,
        netSalary,
        org_unit_id: emp.org_unit_id,
        cost_center_id: emp.cost_center_id
      };
    });
  }
}
