import React, { useState } from 'react';
import { AppUser } from '../types';
import { KeyRound, Lock, LogOut, CheckCircle2, AlertCircle } from 'lucide-react';
import { CustodyDB } from '../db';
import { auth } from '../firebase';
import { signInWithCustomToken } from 'firebase/auth';

interface ChangePasswordRequiredProps {
  activeUser: AppUser;
  language: 'ar' | 'en';
  onPasswordChanged: (updatedUser: AppUser) => void;
  onLogout: () => void;
}

export default function ChangePasswordRequired({
  activeUser,
  language,
  onPasswordChanged,
  onLogout
}: ChangePasswordRequiredProps) {
  const isRtl = language === 'ar';
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedCurrent = currentPassword.trim();
    const trimmedNew = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (!trimmedCurrent) {
      setErrorMsg(isRtl ? 'يرجى إدخال كلمة المرور الحالية' : 'Current password is required.');
      return;
    }

    if (!trimmedNew || trimmedNew.length < 12 || !/[a-zA-Z]/.test(trimmedNew) || !/[0-9]/.test(trimmedNew)) {
      setErrorMsg(
        isRtl
          ? 'كلمة المرور الجديدة يجب أن تتكون من 12 حرف على الأقل وتحتوي على حروف وأرقام'
          : 'New password must be at least 12 characters and contain both letters and numbers.'
      );
      return;
    }

    if (trimmedNew !== trimmedConfirm) {
      setErrorMsg(isRtl ? 'كلمة المرور الجديدة وتأكيدها غير متطابقين' : 'New password and confirmation do not match.');
      return;
    }

    setLoading(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      // Only attach Authorization Bearer if auth.currentUser actually matches activeUser!
      // This prevents sending a stale Super Admin token when a newly created user is changing password!
      if (auth.currentUser && (!activeUser?.email || auth.currentUser.email?.toLowerCase() === activeUser.email.toLowerCase())) {
        const token = await auth.currentUser?.getIdToken().catch(() => null);
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
      }

      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          email: activeUser?.email,
          userId: activeUser?.id,
          currentPassword: trimmedCurrent,
          newPassword: trimmedNew
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.message || (isRtl ? 'فشل تغيير كلمة المرور' : 'Failed to change password.'));
      }

      if (data.customToken) {
        try {
          await signInWithCustomToken(auth, data.customToken);
          const idToken = await auth.currentUser?.getIdToken();
          if (idToken) {
            await fetch('/api/auth/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ idToken })
            }).catch(() => {});
          }
        } catch (authErr) {
          console.warn('Firebase client auth switch notice:', authErr);
        }
      }

      const updatedUser: AppUser = {
        ...activeUser,
        ...(data.user || {}),
        must_change_password: false
      };

      // Sync local storage / DB preserving all existing users
      const allUsers = CustodyDB.getUsers();
      const existingIdx = allUsers.findIndex(u => u.id === updatedUser.id);
      let newUsersList: AppUser[];
      if (existingIdx >= 0) {
        newUsersList = allUsers.map((u, i) => i === existingIdx ? updatedUser : u);
      } else {
        newUsersList = [...allUsers, updatedUser];
      }
      await CustodyDB.saveUsers(newUsersList);

      onPasswordChanged(updatedUser);
    } catch (err: any) {
      setErrorMsg(err.message || (isRtl ? 'حدث خطأ أثناء تغيير كلمة المرور' : 'An error occurred while changing password.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="max-w-md w-full bg-slate-800 rounded-xl shadow-2xl border border-slate-700 p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-500/10 text-amber-500 mb-4 border border-amber-500/20">
            <KeyRound className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            {isRtl ? 'تغيير كلمة المرور مطلوب' : 'Password Change Required'}
          </h2>
          <p className="text-slate-400 text-sm">
            {isRtl
              ? 'لقد تم تسجيل دخولك بكلمة مرور مؤقتة. يجب عليك تعيين كلمة مرور جديدة آمنة للمتابعة.'
              : 'You logged in with a temporary password. Please set a new secure password to proceed.'}
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start space-x-3 rtl:space-x-reverse text-red-400 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              {isRtl ? 'كلمة المرور الحالية (المؤقتة)' : 'Current (Temporary) Password'}
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder={isRtl ? 'أدخل كلمة المرور الحالية' : 'Enter current password'}
                className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
              />
              <Lock className="w-5 h-5 text-slate-500 absolute left-3 rtl:right-3 rtl:left-auto top-3.5" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              {isRtl ? 'كلمة المرور الجديدة' : 'New Password'}
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder={isRtl ? '12 حرفاً على الأقل (حروف وأرقام)' : 'Min 12 characters (letters & digits)'}
                className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
              />
              <Lock className="w-5 h-5 text-slate-500 absolute left-3 rtl:right-3 rtl:left-auto top-3.5" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              {isRtl ? 'تأكيد كلمة المرور الجديدة' : 'Confirm New Password'}
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder={isRtl ? 'أعد إدخال كلمة المرور الجديدة' : 'Re-enter new password'}
                className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
              />
              <Lock className="w-5 h-5 text-slate-500 absolute left-3 rtl:right-3 rtl:left-auto top-3.5" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-950 font-semibold py-3.5 px-4 rounded-lg transition duration-200 flex items-center justify-center space-x-2 rtl:space-x-reverse shadow-lg shadow-amber-500/20 disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                <span>{isRtl ? 'تأكيد وحفظ كلمة المرور' : 'Confirm & Save Password'}</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-700/60 text-center">
          <button
            onClick={onLogout}
            className="text-slate-400 hover:text-white text-sm font-medium transition inline-flex items-center space-x-2 rtl:space-x-reverse"
          >
            <LogOut className="w-4 h-4" />
            <span>{isRtl ? 'تسجيل الخروج' : 'Log Out'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
