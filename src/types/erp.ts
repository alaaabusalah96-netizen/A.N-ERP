export type UserRole = 
  | 'accountant' 
  | 'warehouse_keeper' 
  | 'sales_officer' 
  | 'branch_manager' 
  | 'financial_approver' 
  | 'fleet_supervisor'
  | 'admin'
  | 'super_admin';

export interface UserProfile {
  id: string;
  name: string;
  role: UserRole;
  roleTitleAr: string;
  branchName: string;
  avatarInitials: string;
}

export interface OperationalTransaction {
  id: string;
  code: string;
  date: string;
  type: string;
  description: string;
  amount: number;
  currency: string;
  party: string;
  status: 'معتمد' | 'بانتظار الاعتماد' | 'مسودة' | 'مرفوض';
  initiator: string;
}

export interface QuickMetric {
  id: string;
  label: string;
  value: string;
  subValue: string;
  trend: 'up' | 'down' | 'neutral';
  category: string;
}

export interface OperationalAlert {
  id: string;
  title: string;
  description: string;
  time: string;
  priority: 'عاجل' | 'متوسط' | 'اعتيادي';
}
