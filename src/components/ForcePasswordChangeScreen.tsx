/**
 * SEC-PASSWORD-UX-1: blocking screen when requiresPasswordChange is true.
 * User cannot reach the rest of the app until password change succeeds.
 */
import React, { useState } from 'react';
import { Lock, KeyRound, AlertCircle } from 'lucide-react';

interface ForcePasswordChangeScreenProps {
  userName?: string;
  onChanged: () => void;
  onLogout: () => void;
}

export const ForcePasswordChangeScreen: React.FC<ForcePasswordChangeScreenProps> = ({
  userName,
  onChanged,
  onLogout,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 12) {
      setError('كلمة المرور الجديدة يجب ألا تقل عن 12 حرفًا.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('تأكيد كلمة المرور غير مطابق.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('يجب أن تختلف كلمة المرور الجديدة عن الحالية.');
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail || data.title || data.message || 'فشل تغيير كلمة المرور');
        setIsLoading(false);
        return;
      }
      setIsLoading(false);
      onChanged();
    } catch {
      setError('تعذر الاتصال بالخادم.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-3 text-amber-700">
          <KeyRound className="w-8 h-8" />
          <div>
            <h1 className="text-lg font-bold text-slate-900">تغيير كلمة المرور مطلوب</h1>
            <p className="text-sm text-slate-600">
              {userName ? `${userName} — ` : ''}
              لا يمكن استخدام النظام قبل تعيين كلمة مرور جديدة.
            </p>
          </div>
        </div>
        {error && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-sm">
            <span className="text-slate-700">كلمة المرور الحالية (المؤقتة)</span>
            <div className="relative mt-1">
              <Lock className="w-4 h-4 absolute right-3 top-2.5 text-slate-400" />
              <input
                type="password"
                className="w-full border rounded-lg pr-9 pl-3 py-2 text-sm"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
          </label>
          <label className="block text-sm">
            <span className="text-slate-700">كلمة المرور الجديدة</span>
            <input
              type="password"
              className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={12}
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-700">تأكيد كلمة المرور الجديدة</span>
            <input
              type="password"
              className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={12}
            />
          </label>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-slate-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-slate-800 disabled:opacity-60"
          >
            {isLoading ? 'جاري الحفظ…' : 'حفظ كلمة المرور والمتابعة'}
          </button>
        </form>
        <button type="button" onClick={onLogout} className="w-full text-sm text-slate-500 hover:text-slate-800">
          تسجيل الخروج
        </button>
      </div>
    </div>
  );
};
