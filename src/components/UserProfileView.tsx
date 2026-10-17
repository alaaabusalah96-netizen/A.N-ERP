import React, { useState, useEffect } from 'react';
import { User, Shield, Smartphone, Globe, Calendar, LogOut, CheckCircle2, AlertCircle, KeyRound } from 'lucide-react';

interface ActiveSessionItem {
  sessionId: string;
  userId?: string;
  username?: string;
  fullName?: string;
  role?: string;
  deviceType?: string;
  ipAddress?: string;
  location?: { city?: string; country?: string };
  createdAt?: string;
}

interface UserProfileViewProps {
  user: any;
  calendar: any;
  onNotification: (msg: string) => void;
  onLogout: () => void;
}

export const UserProfileView: React.FC<UserProfileViewProps> = ({
  user,
  calendar,
  onNotification,
  onLogout,
}) => {
  const [sessions, setSessions] = useState<ActiveSessionItem[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  // UI-2FA-SETUP-1
  const [twoFactorEnabled, setTwoFactorEnabled] = useState<boolean>(
    !!(user?.twoFactorEnabled || user?.is2faEnabled),
  );
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [setupToken, setSetupToken] = useState('');
  const [setupError, setSetupError] = useState<string | null>(null);

  useEffect(() => {
    setTwoFactorEnabled(!!(user?.twoFactorEnabled || user?.is2faEnabled));
  }, [user?.twoFactorEnabled, user?.is2faEnabled]);

  const fetchSessions = async () => {
    setIsLoadingSessions(true);
    try {
      // Self sessions (SEC-SESSION): not tenant-wide /api/sessions (USER_MANAGE)
      const res = await fetch('/api/auth/sessions', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || Array.isArray(data.data))) {
        setSessions(Array.isArray(data.data) ? data.data : []);
      }
    } catch {
      // silently handle
    } finally {
      setIsLoadingSessions(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleTerminateSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onNotification('تم إنهاء الجلسة عن بُعد وإبطال سلسلة التوكن فوراً.');
        fetchSessions();
      } else {
        onNotification(data.detail || data.error || 'فشل إنهاء الجلسة');
      }
    } catch {
      onNotification('تعذر إنهاء الجلسة');
    }
  };

  const handleRevokeOtherSessions = async () => {
    if (!window.confirm('إنهاء كل الجلسات الأخرى والإبقاء على الجلسة الحالية؟')) return;
    try {
      const res = await fetch('/api/auth/sessions/revoke-others', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onNotification(`تم إنهاء ${data.revoked ?? data.data?.revoked ?? 0} جلسة أخرى.`);
        fetchSessions();
      } else {
        onNotification(data.detail || data.title || 'فشل إنهاء الجلسات');
      }
    } catch {
      onNotification('تعذر إنهاء الجلسات الأخرى');
    }
  };

  const startTwoFactorSetup = async () => {
    setSetupLoading(true);
    setSetupError(null);
    setQrCodeDataUrl(null);
    setSetupSecret(null);
    setSetupToken('');
    try {
      const res = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSetupError(data.detail || data.title || 'تعذر بدء إعداد التحقق الثنائي');
        setSetupOpen(true);
        return;
      }
      setQrCodeDataUrl(data.qrCodeDataUrl || null);
      setSetupSecret(typeof data.secret === 'string' ? data.secret : null);
      setSetupOpen(true);
      onNotification('امسح رمز QR بتطبيق المصادقة ثم أدخل الرمز للتأكيد.');
    } catch {
      setSetupError('فشل الاتصال أثناء بدء إعداد 2FA');
      setSetupOpen(true);
    } finally {
      setSetupLoading(false);
    }
  };

  const confirmTwoFactorSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError(null);
    if (!setupToken.trim()) {
      setSetupError('أدخل رمز التحقق من التطبيق.');
      return;
    }
    setSetupLoading(true);
    try {
      const res = await fetch('/api/auth/2fa/verify-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: setupToken.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSetupError(data.detail || data.title || 'رمز التحقق غير صحيح');
        return;
      }
      setTwoFactorEnabled(true);
      setSetupOpen(false);
      setQrCodeDataUrl(null);
      setSetupSecret(null);
      setSetupToken('');
      onNotification(data.message || 'تم تفعيل التحقق الثنائي بنجاح.');
    } catch {
      setSetupError('فشل الاتصال أثناء تأكيد 2FA');
    } finally {
      setSetupLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <User className="w-5 h-5 text-blue-700" />
            الملف الشخصي والجلسات النشطة
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            إدارة بيانات الحساب والتحقق الثنائي ومراقبة الأجهزة المتصلة
          </p>
        </div>

        {calendar && (
          <div className="flex items-center gap-2 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700">
            <Calendar className="w-4 h-4 text-blue-700 shrink-0" />
            <span>{calendar.combinedFormatted || calendar.gregorianFormatted}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">بيانات الحساب</h3>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">الاسم</span>
              <span className="font-bold text-slate-800">{user?.fullName || user?.name || '—'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">اسم المستخدم</span>
              <span className="font-mono text-slate-800">{user?.username || '—'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">الدور</span>
              <span className="font-semibold text-slate-800">{user?.roleTitleAr || user?.role || '—'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">الفرع</span>
              <span className="text-slate-800">{user?.branchName || '—'}</span>
            </div>
          </div>
        </div>

        {/* Security & 2FA Card — UI-2FA-SETUP-1 */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-600" />
            الأمان والتحقق الثنائي (2FA)
          </h3>

          {twoFactorEnabled ? (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <div className="text-xs font-bold text-emerald-900">التحقق الثنائي مفعّل</div>
                <div className="text-[11px] text-emerald-700 mt-0.5">
                  حسابك محمي برمز لمرة واحدة من تطبيق المصادقة
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-xs font-bold text-amber-900">التحقق الثنائي غير مفعّل</div>
                <div className="text-[11px] text-amber-800 mt-0.5 mb-2">
                  يُفضّل تفعيله لحماية الحساب من الدخول غير المصرح
                </div>
                <button
                  type="button"
                  disabled={setupLoading}
                  onClick={startTwoFactorSetup}
                  className="px-3 py-1.5 bg-slate-900 text-white text-[11px] font-bold rounded-lg disabled:opacity-50"
                >
                  {setupLoading ? 'جارٍ التحضير…' : 'تفعيل التحقق الثنائي'}
                </button>
              </div>
            </div>
          )}

          {setupOpen && !twoFactorEnabled && (
            <form onSubmit={confirmTwoFactorSetup} className="p-3.5 border border-slate-200 rounded-xl space-y-3 bg-slate-50">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <KeyRound className="w-4 h-4" />
                إكمال الإعداد
              </div>
              {setupError && (
                <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
                  {setupError}
                </div>
              )}
              {qrCodeDataUrl && (
                <div className="flex justify-center">
                  <img src={qrCodeDataUrl} alt="2FA QR" className="w-40 h-40 rounded-lg border border-slate-200 bg-white" />
                </div>
              )}
              {setupSecret && (
                <p className="text-[10px] text-slate-500 font-mono break-all text-center">
                  المفتاح اليدوي: {setupSecret}
                </p>
              )}
              <label className="block text-xs">
                <span className="text-slate-600">رمز التحقق من التطبيق</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
                  value={setupToken}
                  onChange={(e) => setSetupToken(e.target.value)}
                  placeholder="000000"
                  required
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={setupLoading}
                  className="flex-1 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg disabled:opacity-50"
                >
                  تأكيد التفعيل
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSetupOpen(false);
                    setSetupError(null);
                  }}
                  className="px-3 py-2 border border-slate-200 text-xs rounded-lg"
                >
                  إلغاء
                </button>
              </div>
            </form>
          )}

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-600 font-medium">أكواد الطوارئ (Backup):</span>
              <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full font-bold text-[11px]">
                {user?.emergencyBackupCodesCount ?? user?.backupCodesRemaining ?? '—'} أكواد متبقية
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              تُستخدم للدخول عند تعذر استلام رمز التحقق من التطبيق.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={onLogout}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl transition-colors border border-rose-200"
            >
              <LogOut className="w-4 h-4" />
              تسجيل الخروج من هذا الجهاز
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 gap-2 flex-wrap">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-blue-700" />
              الجلسات والأجهزة النشطة
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              يمكنك إنهاء أي جلسة متصلة فوراً وإبطال صلاحية الوصول عن بُعد
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRevokeOtherSessions}
              className="text-xs text-rose-700 hover:text-rose-900 font-semibold"
            >
              إنهاء الجلسات الأخرى
            </button>
            <button
              type="button"
              onClick={fetchSessions}
              className="text-xs text-blue-700 hover:text-blue-900 font-semibold"
            >
              تحديث القائمة
            </button>
          </div>
        </div>

        {isLoadingSessions ? (
          <div className="text-center py-8 text-slate-400 text-xs">جارٍ تحميل الجلسات…</div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs">لا توجد جلسات أخرى مسجلة</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sessions.map((ses) => (
              <div
                key={ses.sessionId}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                    <Globe className="w-5 h-5 text-slate-500" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                      <span>{ses.deviceType || 'متصفح مكتبي'}</span>
                      <span className="font-mono text-[11px] text-slate-400 font-normal">
                        ({ses.ipAddress || '—'})
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {ses.location?.city || ses.location?.country
                        ? `الموقع: ${ses.location?.city || '—'}، ${ses.location?.country || '—'}`
                        : 'جلسة نشطة'}
                      {ses.createdAt ? ` • بدأت في: ${new Date(ses.createdAt).toLocaleString('ar-SA')}` : ''}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleTerminateSession(ses.sessionId)}
                  className="self-end sm:self-center px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-medium rounded-lg transition-colors"
                >
                  إنهاء الجلسة فوراً
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
