import React, { useState } from 'react';
import { Lock, User, ArrowLeft, Building, AlertCircle } from 'lucide-react';
import { UserRole } from '../types/erp';

interface LoginScreenProps {
  onLogin: (username: string, role: UserRole) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('ahmed.almansoor');
  const [password, setPassword] = useState('••••••••••');
  const [selectedRole, setSelectedRole] = useState<UserRole>('accountant');
  const [selectedBranch, setSelectedBranch] = useState('main_riyadh');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('يرجى إدخال اسم المستخدم.');
      return;
    }
    setError(null);
    onLogin(username, selectedRole);
  };

  const handleRoleSelect = (role: UserRole, userDefault: string) => {
    setSelectedRole(role);
    setUsername(userDefault);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8 selection:bg-blue-600 selection:text-white" dir="rtl">
      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-700 text-white flex items-center justify-center font-bold text-2xl shadow-md">
          A.N
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">
          A.N ERP
        </h1>
        <p className="mt-2 text-xs font-medium text-slate-500">
          نظام تخطيط وإدارة الموارد المؤسسية الموحد
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 sm:rounded-2xl sm:px-10">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                اسم المستخدم
              </label>
              <div className="relative rounded-lg shadow-2xs">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <User className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pr-10 pl-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-blue-600 bg-white"
                  placeholder="اسم المستخدم المؤسسي"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                كلمة المرور
              </label>
              <div className="relative rounded-lg shadow-2xs">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pr-10 pl-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-blue-600 bg-white"
                  placeholder="••••••••••"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                الفرع ومقر العمل
              </label>
              <div className="relative rounded-lg shadow-2xs">
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <Building className="h-4 w-4 text-slate-400" />
                </div>
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="block w-full pr-10 pl-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-blue-600 bg-white"
                >
                  <option value="main_riyadh">الفرع الرئيسي - الرياض</option>
                  <option value="jeddah_branch">فرع المنطقة الغربية - جدة</option>
                  <option value="eastern_branch">فرع المنطقة الشرقية - الدمام</option>
                </select>
              </div>
            </div>

            {/* Role Quick Profile Picker for daily testing */}
            <div className="pt-2">
              <label className="block text-[11px] font-semibold text-slate-500 mb-2">
                اختر الحساب التشغيلي للدخول:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleRoleSelect('accountant', 'ahmed.almansoor')}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg border text-right transition-colors ${
                    selectedRole === 'accountant'
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="font-bold">محاسب عام</div>
                  <div className="text-[10px] text-slate-500">أحمد المنصور</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleRoleSelect('financial_approver', 'sulaiman.alrashed')}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg border text-right transition-colors ${
                    selectedRole === 'financial_approver'
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="font-bold">معتمد مالي</div>
                  <div className="text-[10px] text-slate-500">سليمان الراشد</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleRoleSelect('warehouse_keeper', 'saad.alqahtani')}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg border text-right transition-colors ${
                    selectedRole === 'warehouse_keeper'
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="font-bold">أمين مستودع</div>
                  <div className="text-[10px] text-slate-500">سعد القحطاني</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleRoleSelect('branch_manager', 'fahad.altamimi')}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg border text-right transition-colors ${
                    selectedRole === 'branch_manager'
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="font-bold">مدير الفرع</div>
                  <div className="text-[10px] text-slate-500">م. فهد التميمي</div>
                </button>
              </div>
            </div>

            <div className="pt-3">
              <button
                type="submit"
                className="w-full flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 transition-colors"
              >
                <span>تسجيل الدخول إلى النظام</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-4 text-center">
            <p className="text-[11px] text-slate-400">
              A.N ERP — جميع الحقوق محفوظة لشركة الأعمال الموحدة
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
