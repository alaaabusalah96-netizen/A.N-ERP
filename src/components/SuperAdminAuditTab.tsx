import React from 'react';
import { AuditLog, Language } from '../types';
import { ClipboardList, Globe, Laptop } from 'lucide-react';
import { PaginationToolbar, usePaginatedList } from './PaginationToolbar';

interface SuperAdminAuditTabProps {
  impersonationAuditLogs: AuditLog[];
  language: Language;
  isRtl: boolean;
}

export const SuperAdminAuditTab: React.FC<SuperAdminAuditTabProps> = ({
  impersonationAuditLogs,
  language,
  isRtl,
}) => {
  const {
    items: paginatedLogs,
    totalItems,
    totalPages,
    currentPage,
    pageSize,
    setCurrentPage,
    setPageSize,
  } = usePaginatedList(impersonationAuditLogs, 10);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <ClipboardList size={18} className="text-indigo-500" />
            <span>{isRtl ? 'سجل الولوج التقني (Impersonation Audit)' : 'Support Sessions History'}</span>
          </h3>
        </div>
        
        {/* Audit Logs Responsive Container */}
        <div>
          {/* Mobile Cards Layout */}
          <div className="block md:hidden space-y-4 p-4">
            {paginatedLogs.map(log => {
              const dets = log.details || {};
              return (
                <div key={log.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-sm space-y-3 text-xs">
                  <div className="flex justify-between items-start gap-2">
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-slate-400 block">{isRtl ? 'المشرف المسؤول (Super)' : 'Super Admin'}</span>
                      <div className="font-bold text-slate-900 dark:text-white">{dets.impersonator_name || log.user_name}</div>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                      log.action_type === 'IMPERSONATION_START'
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    }`}>
                      {log.action_type === 'IMPERSONATION_START' ? (isRtl ? 'بدء دعم' : 'Support Begun') : (isRtl ? 'إنهاء الدعم' : 'Support Exited')}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 py-2 border-t border-b border-slate-100 dark:border-slate-800/80">
                    <div>
                      <span className="text-[10px] text-slate-400 block">{isRtl ? 'المستخدم المستهدف' : 'Target User'}</span>
                      <div className="font-bold text-slate-900 dark:text-white mt-0.5">{dets.target_user_name || '-'}</div>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">{isRtl ? 'الشركة' : 'Company'}</span>
                      <div className="text-indigo-600 dark:text-indigo-400 font-bold mt-0.5 truncate">{dets.company_name || '-'}</div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-400 block">{isRtl ? 'تفاصيل الرقابة الفنية' : 'Session Details / IP / Agent'}</span>
                    <div className="text-slate-950 dark:text-white font-semibold">{dets.reason || log.description}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-1.5 flex flex-wrap gap-2">
                      <span className="flex items-center gap-0.5"><Globe size={11} /> {log.ip_address}</span>
                      <span className="flex items-center gap-0.5"><Laptop size={11} /> {log.device}</span>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 font-mono text-left">
                    {new Date(log.timestamp).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US')}
                  </div>
                </div>
              );
            })}

            {impersonationAuditLogs.length === 0 && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-2xl text-center text-slate-400">
                <ClipboardList size={24} className="mx-auto mb-2 text-slate-300" />
                <span>{isRtl ? 'سجل العمليات فارغ حتى الآن.' : 'No support session logs found.'}</span>
              </div>
            )}
          </div>

          {/* Desktop Table Layout */}
          <div className="hidden md:block overflow-x-auto w-full">
            <table className="w-full min-w-[1000px] border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-slate-400 text-xs font-bold text-right md:text-left">
                  <th className="p-4">{isRtl ? 'المشرف المسؤول (Super)' : 'Super Admin'}</th>
                  <th className="p-4">{isRtl ? 'العملية' : 'Action Type'}</th>
                  <th className="p-4">{isRtl ? 'المستخدم المستهدف والشركة' : 'Target User & Company'}</th>
                  <th className="p-4 font-mono">{isRtl ? 'التوقيت' : 'Timestamp'}</th>
                  <th className="p-4">{isRtl ? 'تفاصيل الرقابة الفنية' : 'Session Details / IP / Agent'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300 text-xs text-right md:text-left">
                {paginatedLogs.map(log => {
                  const dets = log.details || {};
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-all">
                      <td className="p-4 font-bold text-slate-900 dark:text-white">
                        {dets.impersonator_name || log.user_name}
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          log.action_type === 'IMPERSONATION_START'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        }`}>
                          {log.action_type === 'IMPERSONATION_START' ? (isRtl ? 'بدء دعم فني' : 'Support Begun') : (isRtl ? 'إنهاء الدعم الفني' : 'Support Exited')}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-slate-900 dark:text-white">{dets.target_user_name || '-'}</div>
                        <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">{dets.company_name || '-'}</div>
                      </td>
                      <td className="p-4 font-mono text-[10px] text-slate-500">
                        {new Date(log.timestamp).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US')}
                      </td>
                      <td className="p-4">
                        <div className="text-slate-900 dark:text-white font-semibold">{dets.reason || log.description}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-1 flex flex-wrap gap-x-2.5">
                          <span className="flex items-center gap-0.5"><Globe size={11} /> {log.ip_address}</span>
                          <span className="flex items-center gap-0.5"><Laptop size={11} /> {log.device}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {impersonationAuditLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400">
                      <ClipboardList size={24} className="mx-auto mb-2 text-slate-300" />
                      <span>{isRtl ? 'سجل العمليات فارغ حتى الآن.' : 'No support session logs found.'}</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {impersonationAuditLogs.length > 0 && (
            <div className="p-3 border-t border-slate-100 dark:border-slate-800">
              <PaginationToolbar
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
                language={language}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SuperAdminAuditTab;
