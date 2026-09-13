import React, { useState, useEffect } from 'react';
import { User, Shield, Smartphone, Globe, Calendar, LogOut, CheckCircle2, AlertCircle } from 'lucide-react';

interface ActiveSessionItem {
  sessionId: string;
  userId: string;
  username: string;
  fullName: string;
  role: string;
  deviceType: string;
  ipAddress: string;
  location: { city: string; country: string };
  createdAt: string;
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

  const fetchSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      if (data.success) {
        setSessions(data.data);
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
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        onNotification('تم إنهاء الجلسة عن بُعد وإبطال سلسلة التوكن فوراً.');
        fetchSessions();
      } else {
        onNotification(data.error || 'فشل إنهاء الجلسة');
      }
    } catch {
      onNotification('تعذر إنهاء الجلسة');
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Dual Calendar Bar */}
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

      {/* User Information & Security Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
            البيانات الوظيفية والمؤسسية
          </h3>

          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-700 text-white flex items-center justify-center font-bold text-xl shadow-xs">
              {user?.fullName?.slice(0, 2) || 'من'}
            </div>
            <div>
              <div className="font-bold text-sm text-slate-900">{user?.fullName || 'أحمد المنصور'}</div>
              <div className="text-xs text-blue-700 font-medium">{user?.roleTitleAr || 'محاسب عام'}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">{user?.branchName || 'الفرع الرئيسي - الرياض'}</div>
            </div>
          </div>

          <div className="pt-2 space-y-2.5 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="text-slate-500">اسم المستخدم:</span>
              <span className="font-semibold text-slate-800">{user?.username}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="text-slate-500">المعرف الوظيفي:</span>
              <span className="font-mono text-slate-800">{user?.id || 'USR-001'}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-500">مقر العمل:</span>
              <span className="font-semibold text-slate-800">{user?.branchName}</span>
            </div>
          </div>
        </div>

        {/* Security & 2FA Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-600" />
            الأمان والتحقق الثنائي (2FA)
          </h3>

          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <div className="text-xs font-bold text-emerald-900">التحقق الثنائي مفعّل</div>
              <div className="text-[11px] text-emerald-700 mt-0.5">
                حسابك محمي برمز التحقق والتنبيه الجغرافي الحتمي
              </div>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-600 font-medium">أكواد الطوارئ (One-Time Backup):</span>
              <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full font-bold text-[11px]">
                {user?.emergencyBackupCodesCount || 8} أكواد متبقية
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              تُستخدم للدخول في الحالات الاضطرارية عند تعذر استلام رمز التحقق أو القفز الجغرافي.
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={onLogout}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl transition-colors border border-rose-200"
            >
              <LogOut className="w-4 h-4" />
              تسجيل الخروج من هذا الجهاز
            </button>
          </div>
        </div>
      </div>

      {/* Active Sessions Management (Section 1I) */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-blue-700" />
              الجلسات والأجهزة النشطة
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              يمكنك إنهاء أي جلسة متصلة فوراً وإبطال صلاحية الوصول عن بُعد
            </p>
          </div>
          <button
            onClick={fetchSessions}
            className="text-xs text-blue-700 hover:text-blue-900 font-semibold"
          >
            تحديث القائمة
          </button>
        </div>

        {sessions.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs">
            لا توجد جلسات أخرى مسجلة
          </div>
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
                        ({ses.ipAddress})
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      الموقع: {ses.location?.city || 'الرياض'}، {ses.location?.country || 'SA'} • بدأت في:{' '}
                      {new Date(ses.createdAt).toLocaleTimeString('ar-SA')}
                    </div>
                  </div>
                </div>

                <button
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
