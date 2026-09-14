import React, { useState, useEffect } from 'react';
import { Users, UserPlus, ShieldAlert, Link as LinkIcon, Check, AlertCircle, Copy } from 'lucide-react';

interface ErpUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
  roleTitleAr: string;
  branchName: string;
  is2faEnabled: boolean;
  email: string;
  phone: string;
  nationalId: string;
}

interface UsersAndSodViewProps {
  onNotification: (msg: string) => void;
}

export const UsersAndSodView: React.FC<UsersAndSodViewProps> = ({ onNotification }) => {
  const [users, setUsers] = useState<ErpUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Invite modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('accountant');
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  // Add User modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUserData, setNewUserData] = useState({
    username: '',
    fullName: '',
    role: 'accountant',
    branchName: 'الفرع الرئيسي - الرياض',
    email: '',
    phone: '',
    nationalId: '',
  });
  const [sodConflictError, setSodConflictError] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (data.success) {
        setUsers(data.data);
      }
    } catch {
      onNotification('تعذر تحميل قائمة المستخدمين');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (res.ok) {
        setGeneratedInviteLink(data.data.inviteUrl);
        onNotification('تم توليد رابط دعوة موقّع ومؤمن زمنياً (48 ساعة) بنجاح.');
      } else {
        onNotification(data.detail || data.error || 'فشل إنشاء رابط الدعوة');
      }
    } catch {
      onNotification('حدث خطأ أثناء إنشاء الدعوة');
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSodConflictError(null);

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUserData),
      });
      const data = await res.json();

      if (res.status === 409) {
        // SoD Conflict RFC 7807
        setSodConflictError(data.detail || 'تعارض في مبدأ فصل المهام');
        return;
      }

      if (!res.ok) {
        setSodConflictError(data.detail || 'تعذر إضافة المستخدم');
        return;
      }

      onNotification('تم إضافة المستخدم بنجاح بعد التحقق من قواعد فصل المهام.');
      setShowAddModal(false);
      setNewUserData({
        username: '',
        fullName: '',
        role: 'accountant',
        branchName: 'الفرع الرئيسي - الرياض',
        email: '',
        phone: '',
        nationalId: '',
      });
      fetchUsers();
    } catch {
      setSodConflictError('حدث خطأ بالاتصال');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Title & Action Buttons */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-700" />
            إدارة المستخدمين وحوكمة فصل المهام
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            دليل الكادر التشغيلي مع تطبيق قواعد الرقابة المالية ومنع تضارب المصالح
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors border border-slate-200"
          >
            <LinkIcon className="w-3.5 h-3.5" />
            رابط دعوة موقّع
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-xl transition-colors shadow-2xs"
          >
            <UserPlus className="w-3.5 h-3.5" />
            إضافة مستخدم جديد
          </button>
        </div>
      </div>

      {/* SoD Policy Reminder Banner */}
      <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <div className="font-bold text-amber-900 mb-1">
            قواعد فصل المهام والرقابة المالية الصارمة
          </div>
          <p className="text-amber-800 leading-relaxed">
            يمنع النظام آلياً الجمع بين صلاحيات إعداد القيود والاعتماد المالي، أو الجمع بين العهدة
            المخزنية وسلطة الشراء أو قيود التسوية. أي تعارض يتم رفضه فوراً وفق المعايير المؤسسية.
          </p>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-900">قائمة المستخدمين الحاليين</h3>
          <span className="text-[11px] text-slate-500">{users.length} مستخدمين مسجلين</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">الموظف</th>
                <th className="py-3 px-4">الدور الوظيفي</th>
                <th className="py-3 px-4">الفرع</th>
                <th className="py-3 px-4">البريد والهاتف (مشفر)</th>
                <th className="py-3 px-4">الهوية الوطنية</th>
                <th className="py-3 px-4">التحقق الثنائي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-900">{u.fullName}</div>
                    <div className="font-mono text-[11px] text-slate-400">@{u.username} • {u.id}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="inline-block px-2.5 py-1 bg-blue-50 text-blue-700 font-semibold rounded-lg text-[11px]">
                      {u.roleTitleAr}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600">{u.branchName}</td>
                  <td className="py-3.5 px-4">
                    <div className="font-mono text-[11px] text-slate-700">{u.email}</div>
                    <div className="font-mono text-[10px] text-slate-400 mt-0.5">{u.phone}</div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[11px] text-slate-700">
                    {u.nationalId}
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        u.is2faEnabled
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {u.is2faEnabled ? 'مفعّل' : 'غير مفعل'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Modal (Section 1L) */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 text-right space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              توليد رابط دعوة موقّع لمستخدم جديد
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              رابط موقّع رقمياً بصلاحية محددة بـ 48 ساعة فقط. يتيح للموظف تعيين بياناته الشخصية
              وكلمة المرور دون إرسال كلمات مرور صريحة عبر البريد.
            </p>

            {!generatedInviteLink ? (
              <form onSubmit={handleCreateInvite} className="space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    البريد الإلكتروني المؤسسي
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
                    placeholder="user@company.sa"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">الدور المخصص</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
                  >
                    <option value="accountant">محاسب عام</option>
                    <option value="financial_approver">معتمد مالي</option>
                    <option value="warehouse_keeper">أمين مستودع</option>
                    <option value="sales_officer">مسؤول مبيعات</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl shadow-2xs"
                  >
                    توليد الرابط الموقّع
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800">
                  تم توليد رابط الدعوة بنجاح! الصلاحية تنتهي بعد 48 ساعة.
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[11px] break-all text-slate-700 select-all">
                  {generatedInviteLink}
                </div>
                <div className="flex justify-between items-center pt-2">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(generatedInviteLink)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-bold"
                  >
                    {isCopied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
                    <span>{isCopied ? 'تم النسخ!' : 'نسخ الرابط'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setGeneratedInviteLink(null);
                      setShowInviteModal(false);
                    }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl"
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 text-right space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              إضافة مستخدم جديد مع فحص فصل المهام
            </h3>

            {sodConflictError && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold mb-0.5">تعارض فصل المهام</div>
                  <div>{sodConflictError}</div>
                </div>
              </div>
            )}

            <form onSubmit={handleAddUser} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">اسم المستخدم</label>
                  <input
                    type="text"
                    required
                    value={newUserData.username}
                    onChange={(e) => setNewUserData({ ...newUserData, username: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">الاسم الكامل</label>
                  <input
                    type="text"
                    required
                    value={newUserData.fullName}
                    onChange={(e) => setNewUserData({ ...newUserData, fullName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">الدور الوظيفي</label>
                  <select
                    value={newUserData.role}
                    onChange={(e) => setNewUserData({ ...newUserData, role: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
                  >
                    <option value="accountant">محاسب عام</option>
                    <option value="financial_approver">معتمد مالي</option>
                    <option value="warehouse_keeper">أمين مستودع</option>
                    <option value="sales_officer">مسؤول مبيعات</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">الفرع</label>
                  <input
                    type="text"
                    required
                    value={newUserData.branchName}
                    onChange={(e) => setNewUserData({ ...newUserData, branchName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">البريد الإلكتروني</label>
                  <input
                    type="email"
                    required
                    value={newUserData.email}
                    onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">رقم الهاتف</label>
                  <input
                    type="text"
                    required
                    value={newUserData.phone}
                    onChange={(e) => setNewUserData({ ...newUserData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">رقم الهوية الوطنية (بيانات محمية مشفرة)</label>
                <input
                  type="text"
                  required
                  value={newUserData.nationalId}
                  onChange={(e) => setNewUserData({ ...newUserData, nationalId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-600 bg-white font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl shadow-2xs"
                >
                  حفظ وتأكيد الدور
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
