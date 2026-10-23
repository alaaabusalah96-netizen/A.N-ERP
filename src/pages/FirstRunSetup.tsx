import React, { useState } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../firebase';
import { CustodyDB } from '../db';
import { Language, Theme, AppUser } from '../types';
import kemitLogo from '../assets/images/kemit_logo_1784280480891.jpg';
import { Mail, Lock, Eye, EyeOff, Globe, Loader2, ShieldCheck, KeyRound } from 'lucide-react';

interface FirstRunSetupProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  theme: Theme;
  onLoginSuccess: (user: AppUser) => void;
}

export default function FirstRunSetup({
  language,
  setLanguage,
  onLoginSuccess
}: FirstRunSetupProps) {
  const isRtl = language === 'ar';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password || !confirmPassword) {
      setError(isRtl ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill in all required fields');
      return;
    }

    if (password !== confirmPassword) {
      setError(isRtl ? 'كلمتا السر غير متطابقتين' : 'Passwords do not match');
      return;
    }

    if (password.length < 12 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError(
        isRtl
          ? 'كلمة السر يجب أن تتكون من 12 حرف على الأقل، وتحتوي على حروف وأرقام'
          : 'Password must be at least 12 characters long and contain both letters and numbers'
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/bootstrap-platform-owner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || (isRtl ? 'فشل إعداد الحساب الرئيسي' : 'Failed to set up primary account'));
      }

      if (data.customToken) {
        await signInWithCustomToken(auth, data.customToken);
        try {
          const idToken = await auth.currentUser?.getIdToken();
          if (idToken) {
            await fetch('/api/auth/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idToken }),
            });
          }
        } catch (sessionErr) {
          console.error('Failed to set session cookie:', sessionErr);
        }
      }

      if (data.user) {
        CustodyDB.setActiveUser(data.user);
        onLoginSuccess(data.user);
      } else {
        throw new Error(isRtl ? 'حدث خطأ أثناء حفظ مستند المستخدم' : 'Failed to set active user');
      }
    } catch (err: any) {
      console.error('First-run setup failed:', err);
      setError(err?.message || (isRtl ? 'حدث خطأ أثناء إنشاء الحساب الرئيسي' : 'An error occurred during setup'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 ${isRtl ? 'font-cairo' : ''}`} dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Top Language Selector */}
      <div className="absolute top-4 ltr:right-4 rtl:left-4">
        <button
          type="button"
          onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>{language === 'ar' ? 'English' : 'العربية'}</span>
        </button>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <img
          className="mx-auto h-16 w-auto rounded-xl shadow-md border border-slate-200 dark:border-slate-800"
          src={kemitLogo}
          alt="KEMIT ERP"
        />
        <h2 className="mt-6 text-2xl font-bold text-slate-900 dark:text-white">
          {isRtl ? 'منصة KEMIT ERP' : 'KEMIT ERP Platform'}
        </h2>
        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-full text-xs font-semibold text-amber-800 dark:text-amber-300">
          <KeyRound className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span>
            {isRtl ? 'أول مرة تفتح فيها المنصة — اختار كلمة سر حساب المدير الأساسي' : 'First time opening the platform — Set primary admin password'}
          </span>
        </div>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-slate-800 py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-slate-200/80 dark:border-slate-700/80">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="p-3 text-sm text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-300 rounded-lg border border-red-200 dark:border-red-800 text-center font-medium">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {isRtl ? 'البريد الإلكتروني للمدير الأساسي' : 'Primary Admin Email'}
              </label>
              <div className="relative rounded-md shadow-xs">
                <div className="absolute inset-y-0 ltr:left-0 rtl:right-0 ltr:pl-3 rtl:pr-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-5 w-5" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@your-domain.com"
                  className="block w-full ltr:pl-10 rtl:pr-10 py-2.5 sm:text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 dark:bg-slate-900 dark:text-white"
                  disabled={loading}
                />
              </div>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                {isRtl ? 'اكتب البريد الإلكتروني المعتمد للمدير الأساسي في النظام' : 'Enter the approved primary admin email configured for the system'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {isRtl ? 'كلمة السر جديدة' : 'New Password'}
              </label>
              <div className="relative rounded-md shadow-xs">
                <div className="absolute inset-y-0 ltr:left-0 rtl:right-0 ltr:pl-3 rtl:pr-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-5 w-5" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="block w-full ltr:pl-10 ltr:pr-10 rtl:pr-10 rtl:pl-10 py-2.5 sm:text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 dark:bg-slate-900 dark:text-white"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 ltr:right-0 rtl:left-0 ltr:pr-3 rtl:pl-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {isRtl ? 'تأكيد كلمة السر' : 'Confirm Password'}
              </label>
              <div className="relative rounded-md shadow-xs">
                <div className="absolute inset-y-0 ltr:left-0 rtl:right-0 ltr:pl-3 rtl:pr-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-5 w-5" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="block w-full ltr:pl-10 ltr:pr-10 rtl:pr-10 rtl:pl-10 py-2.5 sm:text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 dark:bg-slate-900 dark:text-white"
                  disabled={loading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-2 rtl:ml-2 rtl:-mr-1 h-5 w-5 text-white" />
                  <span>{isRtl ? 'جاري الإنشاء والإنقاذ...' : 'Creating Account...'}</span>
                </>
              ) : (
                <span>{isRtl ? 'إنشاء وتفعيل حساب المدير الرئيسي' : 'Create & Activate Primary Admin'}</span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
