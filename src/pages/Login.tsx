import React, { useState } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../firebase';
import { CustodyDB } from '../db';
import { Language, Theme, AppUser } from '../types';
import kemitLogo from '../assets/images/kemit_logo_1784280480891.jpg';
import { Mail, Lock, Eye, EyeOff, Globe, Loader2, ShieldCheck } from 'lucide-react';

interface LoginProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  theme: Theme;
  onLoginSuccess: (user: AppUser) => void;
}

export default function Login({
  language,
  setLanguage,
  onLoginSuccess
}: LoginProps) {
  const isRtl = language === 'ar';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    const cleanPassword = password.trim();
    if (!cleanEmail || !cleanPassword) {
      setError(isRtl ? 'يرجى إدخال البريد الإلكتروني وكلمة السر' : 'Please enter both email and password');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password: cleanPassword }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        if (res.status === 429) {
          throw new Error(data.message || (isRtl ? 'تم تجاوز الحد الأقصى للمحاولات من هذا الجهاز. يرجى الانتظار بضع دقائق قبل إعادة المحاولة.' : 'Too many attempts. Please wait a few minutes before trying again.'));
        }
        // Honest server message - do not mask specific error codes or explanations
        const fallbackMsg = isRtl ? 'فشل تسجيل الدخول. يرجى مراجعة البيانات المدخلة والمحاولة مجدداً.' : 'Login failed. Please verify your credentials and try again.';
        throw new Error(data.message || data.error || fallbackMsg);
      }

      // 1. Instantly register active local user
      if (data.user) {
        CustodyDB.setActiveUser(data.user);
      }

      // 2. Resilient Firebase client auth & session establishment with bounded timeout
      if (data.customToken) {
        try {
          const authSignInPromise = (async () => {
            await signInWithCustomToken(auth, data.customToken);
            const idToken = await auth.currentUser?.getIdToken();
            if (idToken) {
              await fetch('/api/auth/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ idToken }),
              }).catch((sessionErr) => {
                console.warn('[Login] Firebase session cookie creation notice:', sessionErr);
              });
            }
          })();

          const authTimeoutPromise = new Promise((resolve) =>
            setTimeout(resolve, 3000)
          );

          // Wait at most 3 seconds so the user is never stuck spinning indefinitely
          await Promise.race([authSignInPromise, authTimeoutPromise]);
        } catch (authErr: any) {
          console.warn('[Login] Firebase client auth notice (continuing with server-verified user):', authErr?.message || authErr);
        }
      }

      if (data.user) {
        onLoginSuccess(data.user);
      } else {
        throw new Error(isRtl ? 'تعذر استرجاع بيانات المستخدم من الخادم' : 'Failed to retrieve user profile from server');
      }
    } catch (err: any) {
      console.error('Login failed:', err?.message || 'Unknown error');
      setError(err?.message || (isRtl ? 'حدث خطأ أثناء تسجيل الدخول' : 'An error occurred during login'));
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
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          {isRtl ? 'تسجيل الدخول الآمن للمؤسسات' : 'Secure Enterprise Sign In'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-slate-800 py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-slate-200/80 dark:border-slate-700/80">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="p-3 text-sm text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-300 rounded-lg border border-red-200 dark:border-red-800 text-center font-medium">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {isRtl ? 'البريد الإلكتروني' : 'Email Address'}
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
                  placeholder="user@company.com"
                  className="block w-full ltr:pl-10 rtl:pr-10 py-2.5 sm:text-sm border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 dark:bg-slate-900 dark:text-white"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {isRtl ? 'كلمة السر' : 'Password'}
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
                  placeholder="••••••••"
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

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-2 rtl:ml-2 rtl:-mr-1 h-5 w-5 text-white" />
                  <span>{isRtl ? 'جاري التحقق...' : 'Verifying...'}</span>
                </>
              ) : (
                <span>{isRtl ? 'تسجيل الدخول' : 'Sign In'}</span>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
