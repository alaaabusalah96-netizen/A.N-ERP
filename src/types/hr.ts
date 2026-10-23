export type EmployeeDepartment = 'PRODUCTION' | 'POULTRY_MANAGEMENT' | 'SALES' | 'ACCOUNTING' | 'ADMINISTRATION';
export type EmployeeStatus = 'ACTIVE' | 'LEAVE' | 'SUSPENDED';

export interface Employee {
  id: string;
  company_id: string;
  org_unit_id?: string;
  cost_center_id?: string;
  name: string;
  code: string;
  department: EmployeeDepartment;
  jobTitle: string;
  baseSalary: number;
  hireDate: string;
  status: EmployeeStatus;
  createdAt: string;
}

export type LeaveType = 'ANNUAL' | 'SICK' | 'CASUAL' | 'UNPAID';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EARLY_LEAVE' | 'LEAVE';

export interface AttendanceRecord {
  id: string;
  company_id: string;
  employee_id: string;
  employee_name?: string;
  date: string; // YYYY-MM-DD
  checkIn?: string; // HH:MM
  checkOut?: string; // HH:MM
  status: AttendanceStatus;
  workHours?: number;
  latenessMinutes?: number;
  notes?: string;
  org_unit_id?: string;
}

export interface LeaveRequest {
  id: string;
  company_id: string;
  employee_id: string;
  employee_name?: string;
  leaveType: LeaveType;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  daysCount: number;
  reason: string;
  status: LeaveStatus;
  approvedBy?: string;
  createdAt: string;
  org_unit_id?: string;
}

export interface MonthlyAttendanceSummary {
  employeeId: string;
  employeeName: string;
  period: string; // YYYY-MM
  totalDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  totalLatenessMinutes: number;
  unpaidLeaveDays: number;
  calculatedDeduction: number;
}

export interface PayrollItem {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  baseSalary: number;
  allowances: number;
  deductions: number; // General manual deductions
  attendanceDeductions?: number; // Auto calculated from attendance & unpaid leaves
  socialInsuranceEmployee: number; // 11% deduction
  socialInsuranceEmployer: number; // 18.75% paid by employer
  payrollTax: number; // Progressive tax
  netSalary: number;
  org_unit_id?: string;
  cost_center_id?: string;
}

export interface PayrollRun {
  id: string;
  company_id: string;
  org_unit_id?: string;
  cost_center_id?: string;
  period: string; // e.g., "2026-07"
  items: PayrollItem[];
  totalPayout: number;
  totalGross: number;
  totalEmployeeIns: number;
  totalEmployerIns: number;
  totalTax: number;
  processedBy: string;
  timestamp: string;
}
