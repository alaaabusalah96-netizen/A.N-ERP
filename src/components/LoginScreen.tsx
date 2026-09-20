import React, { useState } from 'react';
import { Lock, User, ArrowLeft, Building, AlertCircle, ShieldCheck, KeyRound } from 'lucide-react';
import { UserRole } from '../types/erp';

interface LoginScreenProps {
  onLoginSuccess: (userData: any) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [tenantCode, setTenantCode] = useState('tenant-main');
  const [username, setUsername] = useState('accountant');
  const [password, setPassword] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('main_riyadh');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 2FA state
  const [show2FAPrompt, setShow2FAPrompt] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [securityNote, setSecurityNote] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);

  // Concurrent session prompt
  const [showConcurrentPrompt, setShowConcurrentPrompt] = useState(false);
  const [concurrentDetail, setConcurrentDetail] = useState('');

  const executeLogin = async (params: {
    forceTerminateOldest?: boolean;
    twoFactor?: string;
    backup?: string;
  }) => {
    setIsLoading(true);
    setError(null);
    setShowConcurrentPrompt(false);

    const idempotencyKey = `idemp-login-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          tenantCode: tenantCode.trim(),
          username,
          password,
          twoFactorCode: params.twoFactor,
          backupCode: params.backup,
          forceTerminateOldest: params.forceTerminateOldest,
          clientGeo: { city: 'Riyadh', country: 'SA', lat: 24.7136, lon: 46.6753 },
        }),
      });

      const data = await res.json();

      if (res.status === 423) {
        // Progressive Lockout
        setError(data.detail || 'الحساب مقفل مؤقتاً لدواعي أمنية');
        setIsLoading(false);
        return;
      }

      if (res.status === 409 && data.requiresConfirmation) {
        // Concurrent limit
        setShowConcurrentPrompt(true);
        setConcurrentDetail(data.detail);
        setIsLoading(false);
        return;
      }

      if (data.requires2FA) {
        setShow2FAPrompt(true);
        setSecurityNote(data.securityNote || 'التحقق الثنائي إلزامي');
        setQrCodeUrl(data.qrCodeDataUrl || null);
        setSetupSecret(typeof data.secret === 'string' && data.secret ? data.secret : null);
        setIsLoading(false);
        return;
      }

      if (!res.ok) {
        setError(data.detail || data.title || 'فشل تسجيل الدخول');
        setIsLoading(false);
        return;
      }

      // Successful login! Tokens are strictly inside HttpOnly Secure Cookies.
      setIsLoading(false);
      onLoginSuccess(data);
    } catch (err: any) {
      setError('تعذر الاتصال بالخادم، يرجى المحاولة مرة أخرى.');
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('يرجى إدخال اسم المستخدم وكلمة المرور.');
      return;
    }
    executeLogin({});
  };

  const handle2FASubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeLogin({
      twoFactor: useBackupCode ? undefined : twoFactorCode,
      backup: useBackupCode ? backupCode : undefined,
    });
  };

  const handleRolePreset = (user: string) => {
    setUsername(user);
    setPassword('');
    setError(null);
    setShow2FAPrompt(false);
    setShowConcurrentPrompt(false);
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

          {/* Concurrent Session Prompt */}
          {showConcurrentPrompt && (
            <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
              <div className="font-bold mb-1 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-600" />
                <span>تنبيه: الحد الأقصى للجلسات المتزامنة</span>
              </div>
              <p className="text-amber-800 mb-3 leading-relaxed">{concurrentDetail}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    executeLogin({
                      forceTerminateOldest: true,
                      twoFactor: useBackupCode ? undefined : twoFactorCode,
                      backup: useBackupCode ? backupCode : undefined,
                    })
                  }
                  className="flex-1 py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg text-xs transition-colors"
                >
                  إنهاء الجلسة الأقدم والمتابعة
                </button>
                <button
                  type="button"
                  onClick={() => setShowConcurrentPrompt(false)}
                  className="py-2 px-3 bg-white border border-amber-300 text-amber-800 rounded-lg text-xs"
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}

          {/* 2FA Prompt */}
          {show2FAPrompt ? (
            <form className="space-y-4" onSubmit={handle2FASubmit}>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900">
                <div className="font-bold mb-1 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-blue-600" />
                  <span>التحقق الأمني الثنائي الإلزامي</span>
                </div>
                <p className="text-blue-700">{securityNote}</p>
              </div>

              {qrCodeUrl && !useBackupCode && (
                <div className="text-center p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <p className="text-[11px] font-semibold text-slate-700">امسح الرمز بتطبيق Authenticator أو أدخل المفتاح يدوياً:</p>
                  <img src={qrCodeUrl} alt="2FA QR Code" className="w-32 h-32 mx-auto rounded-lg border border-slate-200 bg-white p-1" />
                  {typeof setupSecret === 'string' && setupSecret.length > 0 && (
                    <div className="text-[11px] font-mono text-slate-700 bg-white p-1.5 rounded border border-slate-200 select-all break-all">
                      المفتاح: <span className="font-bold text-blue-700">{setupSecret}</span>
                    </div>
                  )}
                </div>
              )}

              {!useBackupCode ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    رمز التحقق (6 أرقام)
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    required
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value)}
                    className="block w-full text-center tracking-widest text-lg font-bold py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
                    placeholder="000000"
                  />
                  <div className="mt-2 text-left">
                    <button
                      type="button"
                      onClick={() => setUseBackupCode(true)}
                      className="text-blue-600 hover:underline text-[11px] font-medium"
                    >
                      استخدام كود طوارئ لمرة واحدة؟
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    كود الطوارئ (XXXX-XXXX)
                  </label>
                  <input
                    type="text"
                    required
                    value={backupCode}
                    onChange={(e) => setBackupCode(e.target.value)}
                    className="block w-full text-center tracking-widest text-base font-bold py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
                    placeholder="A1B2-C3D4"
                  />
                  <div className="mt-2 text-left">
                    <button
                      type="button"
                      onClick={() => setUseBackupCode(false)}
                      className="text-blue-600 hover:underline text-[11px] font-medium"
                    >
                      العودة للرمز المعتاد (6 أرقام)
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl transition-colors shadow-2xs"
                >
                  {isLoading ? 'جارٍ التحقق...' : 'تأكيد الدخول'}
                </button>
                <button
                  type="button"
                  onClick={() => setShow2FAPrompt(false)}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl"
                >
                  إلغاء
                </button>
              </div>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  رمز المنشأة / كود المستأجر
                </label>
                <div className="relative rounded-lg shadow-2xs">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <Building className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    id="login-tenant-code"
                    type="text"
                    required
                    value={tenantCode}
                    onChange={(e) => setTenantCode(e.target.value)}
                    className="block w-full pr-10 pl-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-blue-600 bg-white font-mono"
                    placeholder="tenant-main أو رمز منشأتك"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  اسم المستخدم
                </label>
                <div className="relative rounded-lg shadow-2xs">
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <User className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    id="login-username"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="block w-full pr-10 pl-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-blue-600 bg-white"
                    placeholder="accountant / approver / warehouse"
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
                    id="login-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pr-10 pl-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-blue-600 bg-white"
                    placeholder="••••••••"
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
                    id="login-branch"
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

              {/* Role Presets */}
              <div className="pt-2">
                <label className="block text-[11px] font-semibold text-slate-500 mb-2">
                  اختر الحساب التشغيلي للدخول السريع:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleRolePreset('accountant')}
                    className={`p-2 rounded-lg border text-right transition-all text-xs ${
                      username === 'accountant'
                        ? 'border-blue-600 bg-blue-50/50 text-blue-900 font-bold'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    <div className="font-semibold text-[11px]">محاسب عام</div>
                    <div className="text-[10px] text-slate-500">أحمد المنصور</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRolePreset('approver')}
                    className={`p-2 rounded-lg border text-right transition-all text-xs ${
                      username === 'approver'
                        ? 'border-blue-600 bg-blue-50/50 text-blue-900 font-bold'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    <div className="font-semibold text-[11px]">معتمد مالي</div>
                    <div className="text-[10px] text-slate-500">سليمان الراشد</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRolePreset('warehouse')}
                    className={`p-2 rounded-lg border text-right transition-all text-xs ${
                      username === 'warehouse'
                        ? 'border-blue-600 bg-blue-50/50 text-blue-900 font-bold'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    <div className="font-semibold text-[11px]">أمين مستودع</div>
                    <div className="text-[10px] text-slate-500">سعد القحطاني</div>
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  id="login-submit-btn"
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-xs text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 transition-colors"
                >
                  {isLoading ? 'جارٍ تسجيل الدخول...' : 'دخول النظام'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
