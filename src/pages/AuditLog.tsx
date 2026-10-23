import React, { useState } from 'react';
import { CustodyDB } from '../db';
import { useScreenListeners } from '../firebase';
import { translations, Language, Theme, AuditLog } from '../types';
import { PaginationToolbar, usePaginatedList } from '../components/PaginationToolbar';
import { 
  ShieldAlert, 
  Search, 
  Filter, 
  Calendar, 
  ArrowRight, 
  Clock, 
  User as UserIcon, 
  Laptop, 
  Globe, 
  ChevronDown, 
  ChevronUp, 
  RefreshCw, 
  Download, 
  Printer, 
  Building,
  Tag,
  Layers,
  Fingerprint
} from 'lucide-react';

interface AuditLogProps {
  language: Language;
  theme: Theme;
}

export default function AuditLogView({ language, theme }: AuditLogProps) {
  useScreenListeners(['AuditLogs', 'logs']);

  const isRtl = language === 'ar';
  const t = translations[language];

  // Load lists for user affiliations
  const usersList = React.useMemo(() => CustodyDB.getUsers(), []);
  const companiesList = React.useMemo(() => CustodyDB.getCompanies(), []);
  const regionsList = React.useMemo(() => CustodyDB.getRegions(), []);
  const stationsList = React.useMemo(() => CustodyDB.getStations(), []);

  // Load audit logs
  const [logs, setLogs] = useState<AuditLog[]>(() => CustodyDB.getAuditLogs());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState('all');
  const [selectedRole, setSelectedRole] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [logsLimit, setLogsLimit] = useState(15);

  // Refresh
  const handleRefresh = () => {
    setLogs(CustodyDB.getAuditLogs());
  };

  // Unique list of action types for filtering
  const actionTypes = Array.from(new Set(logs.map(log => log.action_type)));

  // Filter logs
  const filteredLogs = logs.filter(log => {
    // Search
    const matchesSearch = 
      log.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action_type.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Action Type
    const matchesAction = selectedAction === 'all' || log.action_type === selectedAction;
    
    // User Role
    const matchesRole = selectedRole === 'all' || log.user_role === selectedRole;
    
    // Date
    const logDate = log.timestamp.split('T')[0];
    const matchesStartDate = !startDate || logDate >= startDate;
    const matchesEndDate = !endDate || logDate <= endDate;

    return matchesSearch && matchesAction && matchesRole && matchesStartDate && matchesEndDate;
  });

  const {
    items: paginatedLogs,
    totalItems,
    totalPages,
    currentPage,
    pageSize,
    setCurrentPage,
    setPageSize,
  } = usePaginatedList(filteredLogs, 15);

  // Toggle expand
  const toggleExpand = (id: string) => {
    if (expandedLogId === id) {
      setExpandedLogId(null);
    } else {
      setExpandedLogId(id);
    }
  };

  // Render before/after diff details
  const renderStateDiff = (before: any, after: any) => {
    if (!before && !after) return null;

    // Union of keys
    const allKeys = Array.from(new Set([
      ...Object.keys(before || {}),
      ...Object.keys(after || {})
    ])).filter(key => {
      // Exclude standard noise keys
      return !['id', 'created_at', 'updated_at', 'company_id', 'station_id', 'user_id'].includes(key);
    });

    const isDifferent = (key: string) => {
      const bVal = before?.[key];
      const aVal = after?.[key];
      return JSON.stringify(bVal) !== JSON.stringify(aVal);
    };

    return (
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800">
        <div className="bg-slate-50 dark:bg-slate-800/40 px-4 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider flex justify-between items-center">
          <span>{isRtl ? 'مقارنة الحقول المتأثرة (قبل وبعد)' : 'Field Comparison (Before ➔ After)'}</span>
          <span className="text-[9px] text-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-full font-semibold">
            {isRtl ? 'تغييرات تفصيلية' : 'Audit Trail Info'}
          </span>
        </div>
        <table className="w-full text-left text-[11px] border-collapse bg-white dark:bg-slate-900">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800/50 text-slate-400">
              <th className="py-2 px-4 font-semibold text-slate-500">{isRtl ? 'اسم الحقل' : 'Property / Field'}</th>
              <th className="py-2 px-4 font-semibold text-slate-500">{isRtl ? 'الحالة السابقة' : 'Value Before'}</th>
              <th className="py-2 px-4 font-semibold text-slate-500 text-center">➔</th>
              <th className="py-2 px-4 font-semibold text-slate-500">{isRtl ? 'الحالة الجديدة' : 'Value After'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 font-mono">
            {allKeys.map(key => {
              const changed = isDifferent(key);
              const bVal = before?.[key];
              const aVal = after?.[key];

              // Clean display
              const formatValue = (v: any) => {
                if (v === undefined || v === null) return <span className="text-slate-300 dark:text-slate-700 italic">-</span>;
                if (typeof v === 'boolean') return v ? <span className="text-emerald-600 font-bold">True</span> : <span className="text-rose-600 font-bold">False</span>;
                if (typeof v === 'object') return JSON.stringify(v);
                return String(v);
              };

              return (
                <tr 
                  key={key} 
                  className={`transition-colors ${
                    changed 
                      ? 'bg-amber-50/20 dark:bg-amber-500/5 text-amber-900 dark:text-amber-300 font-semibold' 
                      : 'text-slate-500'
                  }`}
                >
                  <td className="py-2.5 px-4 font-bold text-slate-700 dark:text-slate-300 text-[10px] uppercase">
                    {key.replace(/_/g, ' ')}
                  </td>
                  <td className="py-2.5 px-4 max-w-[200px] truncate" title={String(bVal)}>
                    {formatValue(bVal)}
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    {changed ? <span className="text-amber-500 font-extrabold animate-pulse">➔</span> : <span className="text-slate-300 dark:text-slate-700">=</span>}
                  </td>
                  <td className="py-2.5 px-4 max-w-[200px] truncate font-bold text-emerald-600 dark:text-emerald-400" title={String(aVal)}>
                    {formatValue(aVal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      isRtl ? 'رقم السجل' : 'Log ID',
      isRtl ? 'التاريخ والوقت' : 'Timestamp',
      isRtl ? 'المستخدم' : 'User',
      isRtl ? 'الدور الوظيفي' : 'Role',
      isRtl ? 'نوع العملية' : 'Action Type',
      isRtl ? 'عنوان IP' : 'IP Address',
      isRtl ? 'الجهاز والمنصة' : 'Device',
      isRtl ? 'البيان والتفاصيل' : 'Description'
    ];

    const rows = filteredLogs.map(log => [
      log.id,
      log.timestamp,
      log.user_name,
      log.user_role,
      log.action_type,
      log.ip_address || '-',
      log.device || '-',
      `"${log.description.replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `KEMIT_ERP_Audit_Logs_2026.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight md:text-2xl flex items-center gap-2">
            <ShieldAlert className="text-rose-500" />
            <span>{isRtl ? 'سجل الرقابة والأمان العام (Audit Log)' : 'Compliance & System Audit Log'}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isRtl 
              ? 'تتبع شامل لجميع الحركات وتعديلات النظام، مع تسجيل الحالات السابقة واللاحقة للعمليات وعناوين IP.' 
              : 'Full ledger recording all database operations, structural changes, user sessions, and exact state differentials.'
            }
          </p>
        </div>
        
        {/* Actions Button Row */}
        <div className="flex gap-2 self-end md:self-auto mt-2 md:mt-0">
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all"
            title={isRtl ? 'تحديث البيانات' : 'Refresh logs'}
          >
            <RefreshCw size={13} />
            <span>{isRtl ? 'تحديث' : 'Refresh'}</span>
          </button>
          
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md shadow-emerald-500/10"
          >
            <Download size={13} />
            <span>{isRtl ? 'تصدير CSV' : 'Export CSV'}</span>
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-600/10"
          >
            <Printer size={13} />
            <span>{isRtl ? 'طباعة السجل' : 'Print Ledger'}</span>
          </button>
        </div>
      </div>

      {/* Audit Log Filters Panel */}
      <div className={`p-5 rounded-2xl border ${
        theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        <div className="flex items-center gap-2 mb-4 border-b pb-2.5 border-slate-100 dark:border-slate-800">
          <Filter size={16} className="text-rose-500" />
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {isRtl ? 'خيارات تصفية وتدقيق العمليات' : 'Search & Analytical Filters'}
          </h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {/* Text search */}
          <div className="relative">
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'البحث عن كلمة' : 'Keyword Search'}</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 pointer-events-none">
                <Search size={12} />
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={isRtl ? 'ابحث عن مستخدم، إجراء...' : 'User, operation details...'}
                className={`w-full py-1.5 pl-8 pr-3 text-xs rounded-lg border focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                  theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200 placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'
                }`}
              />
            </div>
          </div>

          {/* Action Type filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'نوع العملية' : 'Action Category'}</label>
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <option value="all">{isRtl ? 'جميع العمليات' : 'All Actions'}</option>
              {actionTypes.map(act => (
                <option key={act} value={act}>{act}</option>
              ))}
            </select>
          </div>

          {/* Role Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'الدور والمنصب' : 'User Role'}</label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <option value="all">{isRtl ? 'جميع الصلاحيات' : 'All Roles'}</option>
              <option value="SystemAdmin">System Admin</option>
              <option value="Admin">Company Admin</option>
              <option value="RegionalManager">Regional Manager</option>
              <option value="StationAdmin">Station Administrator</option>
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'من تاريخ' : 'Start Date'}</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200'
              }`}
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{isRtl ? 'إلى تاريخ' : 'End Date'}</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Logs Table / List card */}
      <div className={`p-6 rounded-2xl border overflow-hidden ${
        theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Layers size={14} className="text-indigo-500" />
            <span>{isRtl ? 'قائمة سجلات المراقبة المصنفة' : 'Detailed Audit Ledger Log Stream'}</span>
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
            {filteredLogs.length} {isRtl ? 'سجل مطابق' : 'matching records'}
          </span>
        </div>

        {/* Audit Log Stream */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[850px]">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold bg-slate-50/50 dark:bg-slate-800/10">
                <th className="py-2.5 px-3 font-semibold text-slate-500 text-center w-10"></th>
                <th className="py-2.5 px-3 font-semibold text-slate-500">{isRtl ? 'الوقت والتاريخ' : 'Timestamp'}</th>
                <th className="py-2.5 px-3 font-semibold text-slate-500">{isRtl ? 'المستخدم' : 'User'}</th>
                <th className="py-2.5 px-3 font-semibold text-slate-500">{isRtl ? 'العملية' : 'Action Type'}</th>
                <th className="py-2.5 px-3 font-semibold text-slate-500">{isRtl ? 'التفاصيل والوصف' : 'Description'}</th>
                <th className="py-2.5 px-3 font-semibold text-slate-500">{isRtl ? 'الجهاز' : 'Device'}</th>
                <th className="py-2.5 px-3 font-semibold text-slate-500 text-right">{isRtl ? 'عنوان IP' : 'IP Address'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
              {paginatedLogs.map((log) => {
                const isExpanded = expandedLogId === log.id;
                const hasDetails = log.details && (log.details.before || log.details.after);
                
                // Styling based on action type
                let actionBadgeColor = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
                if (log.action_type.includes('CREATE')) {
                  actionBadgeColor = 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400';
                } else if (log.action_type.includes('UPDATE')) {
                  actionBadgeColor = 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400';
                } else if (log.action_type.includes('DELETE')) {
                  actionBadgeColor = 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400';
                } else if (log.action_type.includes('USER_LOGIN')) {
                  actionBadgeColor = 'bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400 font-bold';
                }

                return (
                  <React.Fragment key={log.id}>
                    <tr 
                      className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/15 cursor-pointer transition-colors ${
                        isExpanded ? 'bg-slate-50/60 dark:bg-slate-800/20' : ''
                      }`}
                      onClick={() => toggleExpand(log.id)}
                    >
                      <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button 
                          onClick={() => toggleExpand(log.id)}
                          className="p-1 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-500 whitespace-nowrap text-[11px]">
                        <div className="font-semibold text-slate-700 dark:text-slate-300">
                          {new Date(log.timestamp).toLocaleDateString(language, { year: 'numeric', month: 'short', day: 'numeric' })}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {new Date(log.timestamp).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        {(() => {
                          const logUser = usersList.find(u => u.id === log.user_id || u.full_name === log.user_name || (u.email && log.user_name && u.email.toLowerCase() === log.user_name.toLowerCase()));
                          let affiliationStr = '';
                          if (logUser) {
                            const comp = companiesList.find(c => c.id === logUser.company_id);
                            const userStation = stationsList.find(s => s.id === logUser.station_id);
                            const userRegionId = logUser.region_id || userStation?.region_id;
                            const userRegion = userRegionId ? regionsList.find(r => r.id === userRegionId) : null;

                            if (logUser.role === 'Admin' && comp) {
                              affiliationStr = `🏢 ${comp.name}`;
                            } else if (logUser.role === 'RegionalManager' && userRegion) {
                              affiliationStr = `🌍 ${userRegion.name} | 🏢 ${comp?.name || ''}`;
                            } else if (logUser.role === 'StationAdmin' && userStation) {
                              affiliationStr = `📍 ${userStation.station_name} | 🏢 ${comp?.name || ''}`;
                            }
                          }
                          return (
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 text-[10px]">
                                <UserIcon size={12} />
                              </div>
                              <div>
                                <div className="font-semibold text-slate-800 dark:text-slate-200 text-[11px]">{log.user_name}</div>
                                <div className="text-[9px] font-mono text-slate-400 uppercase font-bold tracking-tight flex flex-col gap-0.5">
                                  <span>{log.user_role}</span>
                                  {affiliationStr && <span className="text-slate-500 dark:text-slate-400 font-sans font-semibold normal-case">{affiliationStr}</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${actionBadgeColor}`}>
                          {log.action_type}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300 max-w-xs md:max-w-md truncate" title={log.description}>
                        {log.description}
                      </td>
                      <td className="py-3 px-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <Laptop size={11} className="text-slate-400" />
                          <span>{log.device || 'Desktop'}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5 text-[11px]">
                          <Globe size={11} className="text-slate-400" />
                          <span>{log.ip_address || '127.0.0.1'}</span>
                        </div>
                      </td>
                    </tr>
                    
                    {/* Expandable details showing before and after payload diff comparison */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="py-4 px-6 bg-slate-50/30 dark:bg-slate-800/10">
                          <div className="space-y-4">
                            {/* Simple details */}
                            <div className="grid gap-4 md:grid-cols-3">
                              <div className="flex items-start gap-2 text-xs">
                                <Fingerprint className="text-rose-500 h-4 w-4 shrink-0 mt-0.5" />
                                <div>
                                  <span className="text-slate-400 block font-bold uppercase text-[9px] tracking-wider">{isRtl ? 'معرف السجل الفريد' : 'Audit Log Unique ID'}</span>
                                  <span className="font-mono text-slate-600 dark:text-slate-300 text-[11px] font-bold">{log.id}</span>
                                </div>
                              </div>
                              <div className="flex items-start gap-2 text-xs">
                                <Building className="text-indigo-500 h-4 w-4 shrink-0 mt-0.5" />
                                <div>
                                  <span className="text-slate-400 block font-bold uppercase text-[9px] tracking-wider">{isRtl ? 'هوية المستخدم' : 'Subject Account ID'}</span>
                                  <span className="font-mono text-slate-600 dark:text-slate-300 text-[11px] font-bold">{log.user_id}</span>
                                </div>
                              </div>
                              <div className="flex items-start gap-2 text-xs">
                                <Tag className="text-emerald-500 h-4 w-4 shrink-0 mt-0.5" />
                                <div>
                                  <span className="text-slate-400 block font-bold uppercase text-[9px] tracking-wider">{isRtl ? 'مستوى الأمان والسرية' : 'Audit Security Clearance'}</span>
                                  <span className="font-bold text-emerald-600 text-[11px]">
                                    {log.user_role === 'SystemAdmin' ? 'SUPER_USER (SECURE_ROLE_PASS)' : 'STANDARD_LOG_AUDIT'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Detailed comparisons if they exist */}
                            {hasDetails ? (
                              renderStateDiff(log.details?.before, log.details?.after)
                            ) : (
                              <div className="p-3.5 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                                {isRtl 
                                  ? 'لا توجد حقول أو كائنات تم تعديلها في هذه الحركة لتسجيل مقارنة قبل وبعد.' 
                                  : 'No complex database object states were modified in this operation. Diff details are not required.'}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-semibold">
                    {isRtl ? 'لا توجد سجلات مطابقة للبحث وتفضيلات التصفية المحددة.' : 'No audit records match your search query or criteria.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredLogs.length > 0 && (
          <div className="p-3 border-t border-slate-100 dark:border-slate-800/40">
            <PaginationToolbar
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              language={language}
              theme={theme}
            />
          </div>
        )}
      </div>
    </div>
  );
}
