import React, { useState, useEffect } from 'react';
import { History, ShieldCheck, RefreshCw, FileText } from 'lucide-react';

interface AuditTrailItem {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  details: any;
  ipAddress: string;
}

interface AuditTrailViewProps {
  onNotification: (msg: string) => void;
}

export const AuditTrailView: React.FC<AuditTrailViewProps> = ({ onNotification }) => {
  const [logs, setLogs] = useState<AuditTrailItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/audit-trail');
      const data = await res.json();
      if (data.success) {
        setLogs(data.data);
      }
    } catch {
      onNotification('تعذر تحميل سجل التدقيق');
    } finally {
      setIsLoading(false);
    }
  };

  const getActionBadge = (action: string) => {
    if (action.includes('POST') || action.includes('CREATE')) {
      return 'bg-blue-50 text-blue-700 border-blue-200';
    }
    if (action.includes('APPROVE')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (action.includes('IMPOSSIBLE_TRAVEL') || action.includes('FAILED')) {
      return 'bg-rose-50 text-rose-700 border-rose-200';
    }
    return 'bg-slate-50 text-slate-700 border-slate-200';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <History className="w-5 h-5 text-blue-700" />
            سجل التدقيق التشغيلي (Audit Trail)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            تسجيل زمني غير قابل للتعديل لكافة الإجراءات المالية والعمليات الأمنية
          </p>
        </div>

        <button
          onClick={fetchLogs}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors border border-slate-200"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          تحديث السجل
        </button>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">الوقت والتاريخ</th>
                <th className="py-3 px-4">المستخدم الفاعل</th>
                <th className="py-3 px-4">الإجراء التشغيلي</th>
                <th className="py-3 px-4">الكيان المتأثر</th>
                <th className="py-3 px-4">عنوان IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500" dir="ltr">
                    {new Date(log.timestamp).toLocaleString('ar-SA')}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-900">{log.actorName}</div>
                    <div className="font-mono text-[10px] text-slate-400">{log.actorId}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${getActionBadge(
                        log.action
                      )}`}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-700">
                    {log.entityType}: {log.entityId}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500" dir="ltr">
                    {log.ipAddress}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
