import React, { useState, useEffect } from 'react';
import { CustodyDB } from '../db';
import { useScreenListeners } from '../firebase';
import { CompaniesModule } from '../db/companies';
import { OrganizationEngine } from '../db/organizationEngine';
import { WarehouseHierarchyEngine } from '../db/warehouseHierarchyEngine';
import { CostCenterEngine } from '../db/costCenterEngine';
import WarehouseTreeSelect from '../components/WarehouseTreeSelect';
import OrgUnitTreeSelect from '../components/OrgUnitTreeSelect';
import { EnterpriseReportEngine } from '../lib/enterprise/report_engine';
import { PaginationToolbar, usePaginatedList } from '../components/PaginationToolbar';
import { translations, Language, Theme, Transaction, Station } from '../types';
import { 
  FileText, 
  Download, 
  Printer, 
  Calendar, 
  Briefcase, 
  Filter, 
  RefreshCw,
  TrendingDown,
  Info,
  Building,
  Building2,
  Warehouse as WarehouseIcon,
  PieChart,
  FolderGit2
} from 'lucide-react';

interface ReportsProps {
  language: Language;
  theme: Theme;
}

type ReportType = 'pending' | 'settled' | 'daily' | 'monthly' | 'movement';

export default function Reports({ language, theme }: ReportsProps) {
  useScreenListeners(['transactions', 'Expenses', 'CashVouchers', 'journal_entries']);

  const t = translations[language];
  const isRtl = language === 'ar';

  const activeUser = CustodyDB.getActiveUser();
  const selectedCompanyId = activeUser?.company_id || CompaniesModule.getSelectedCompanyId() || '';
  const allStations = CustodyDB.getScopedStations();
  
  // Organization Engine & Enterprise Dimensions
  const [orgUnits, setOrgUnits] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);

  // Selected Filter Dimensions
  const [selectedOrgUnit, setSelectedOrgUnit] = useState<string>(() => {
    if (activeUser && activeUser.role !== 'Admin' && activeUser.role !== 'SystemAdmin' && activeUser.org_unit_id) {
      return activeUser.org_unit_id;
    }
    return 'ALL';
  });
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('ALL');
  const [selectedCostCenter, setSelectedCostCenter] = useState<string>('ALL');
  const [selectedProject, setSelectedProject] = useState<string>('ALL');

  useEffect(() => {
    setOrgUnits(OrganizationEngine.getUnits(selectedCompanyId));
    setWarehouses(WarehouseHierarchyEngine.getWarehouses(selectedCompanyId));
    setCostCenters(CostCenterEngine.getCostCenters(selectedCompanyId));
  }, [selectedCompanyId]);

  // Scope stations based on user role
  let allowedStations: Station[] = [];
  if (activeUser) {
    if (activeUser.role === 'Admin' || activeUser.role === 'SystemAdmin') {
      allowedStations = allStations;
    } else if (activeUser.role === 'RegionalManager') {
      allowedStations = allStations.filter(s => s.region_id === activeUser.region_id);
    } else {
      allowedStations = allStations.filter(s => s.id === activeUser.station_id);
    }
  }

  // States
  const [reportType, setReportType] = useState<ReportType>('movement');
  const [selectedStation, setSelectedStation] = useState<'all' | string>(() => {
    if (activeUser && activeUser.role !== 'Admin' && activeUser.role !== 'SystemAdmin' && activeUser.role !== 'RegionalManager') {
      return activeUser.station_id || 'all';
    }
    return 'all';
  });
  
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30); // default last 30 days
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Load initial filtered list on mount/load
  const getInitialFilteredList = () => {
    return EnterpriseReportEngine.getCustodyReport({
      companyId: selectedCompanyId,
      org_unit_id: selectedOrgUnit,
      warehouseId: selectedWarehouse,
      costCenterId: selectedCostCenter,
      projectId: selectedProject,
      startDate,
      endDate
    });
  };

  const [reportData, setReportData] = useState<Transaction[]>(() => getInitialFilteredList());
  const [hasGenerated, setHasGenerated] = useState(true);

  const {
    items: paginatedReportData,
    totalItems,
    totalPages,
    currentPage,
    pageSize,
    setCurrentPage,
    setPageSize,
  } = usePaginatedList(reportData, 15);

  // Generate Report Handler with Dynamic 6-Dimensional Filtering
  const handleGenerate = () => {
    let list = EnterpriseReportEngine.getCustodyReport({
      companyId: selectedCompanyId,
      org_unit_id: selectedOrgUnit,
      warehouseId: selectedWarehouse,
      costCenterId: selectedCostCenter,
      projectId: selectedProject,
      startDate,
      endDate
    });

    const allowedIds = allowedStations.map(s => s.id);

    // Filter by allowed stations based on scope
    if (selectedStation !== 'all') {
      list = list.filter(tx => tx.station_id === selectedStation);
    } else if (allowedIds.length > 0) {
      list = list.filter(tx => !tx.station_id || allowedIds.includes(tx.station_id));
    }

    // Filter by status depending on report type
    if (reportType === 'pending') {
      list = list.filter(tx => tx.status === 'Pending');
    } else if (reportType === 'settled') {
      list = list.filter(tx => tx.status === 'Under Settlement' || tx.status === 'Settled');
    }

    setReportData(list);
    setHasGenerated(true);
  };

  // Excel / CSV Export Trigger
  const handleExportExcel = () => {
    const headers = [
      isRtl ? 'المحطة' : 'Station',
      isRtl ? 'رقم الحركة' : 'Transaction No',
      isRtl ? 'التاريخ' : 'Date',
      isRtl ? 'الحالة' : 'Status',
      isRtl ? 'البيان' : 'Description',
      isRtl ? 'المبلغ' : 'Amount (EGP)',
      isRtl ? 'رقم السند' : 'Voucher No',
      isRtl ? 'تاريخ السند' : 'Voucher Date',
      isRtl ? 'ملاحظات' : 'Notes'
    ];

    const rows = reportData.map(tx => {
      const st = allStations.find(s => s.id === tx.station_id);
      return [
        st?.station_name || 'N/A',
        tx.transaction_no,
        tx.date,
        tx.status === 'Pending' 
          ? (isRtl ? 'معلقة' : 'Pending') 
          : tx.status === 'Under Settlement' 
            ? (isRtl ? 'تحت التسوية' : 'Under Settlement') 
            : (isRtl ? 'معتمدة ومسواة نهائياً' : 'Fully Settled'),
        `"${tx.description.replace(/"/g, '""')}"`,
        tx.amount,
        tx.voucher_no || '-',
        tx.voucher_date || '-',
        tx.notes ? `"${tx.notes.replace(/"/g, '""')}"` : '-'
      ];
    });

    // Create CSV content (Excel friendly with BOM for Arabic UTF-8 support!)
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Custody_Report_${reportType}_${selectedStation}_2026.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const getReportTitle = () => {
    switch (reportType) {
      case 'pending': return t.pendingReport;
      case 'settled': return t.settledReport;
      case 'daily': return t.dailyReport;
      case 'monthly': return t.monthlyReport;
      case 'movement': return t.cashMovementReport;
    }
  };

  const totalSum = reportData.reduce((sum, tx) => sum + tx.amount, 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight md:text-2xl flex items-center gap-2">
            <FileText className="text-emerald-500" />
            <span>{t.reports}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isRtl 
              ? 'إنشاء تقارير تصفية العهدة الدورية، اليومية والتحليلية للمحطات وتصديرها لمختلف الصيغ.' 
              : 'Compile custody logs, pending vouchers, and periodic cash movements for export.'
            }
          </p>
        </div>
      </div>

      {/* Filter panel */}
      <div className={`p-5 rounded-2xl border ${
        theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
      }`}>
        <div className="flex items-center gap-2 mb-4 border-b pb-2.5 border-slate-100 dark:border-slate-800">
          <Filter size={16} className="text-emerald-500" />
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {isRtl ? 'تصفية وخيارات التقارير الحركية والمالية' : 'Dynamic Report Filters & Parameters'}
          </h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Organization Unit Tree Filter */}
          <div>
            <OrgUnitTreeSelect
              label={isRtl ? 'الهيكل التنظيمي / الفرع / القطاع' : 'Organization Unit'}
              value={selectedOrgUnit === 'ALL' ? '' : selectedOrgUnit}
              onChange={(unitId) => setSelectedOrgUnit(unitId || 'ALL')}
              placeholder={isRtl ? 'جميع الهياكل التنظيمية (شامل الفروع)' : 'All Organization Units'}
              companyId={selectedCompanyId}
              isRtl={isRtl}
              theme={theme}
              showInheritanceSummary={false}
            />
          </div>

          {/* Warehouse Filter */}
          <div>
            <WarehouseTreeSelect
              label={isRtl ? 'المستودع / المخزن' : 'Warehouse'}
              value={selectedWarehouse === 'ALL' ? '' : selectedWarehouse}
              onChange={(whId) => setSelectedWarehouse(whId || 'ALL')}
              placeholder={isRtl ? 'جميع المستودعات والمخازن' : 'All Warehouses'}
              companyId={selectedCompanyId}
              isRtl={isRtl}
              theme={theme}
            />
          </div>

          {/* Cost Center Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5 flex items-center gap-1">
              <PieChart className="h-3 w-3 text-emerald-500" />
              <span>{isRtl ? 'مركز التكلفة / البند' : 'Cost Center'}</span>
            </label>
            <select
              value={selectedCostCenter}
              onChange={(e) => setSelectedCostCenter(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <option value="ALL">{isRtl ? 'جميع مراكز التكلفة' : 'All Cost Centers'}</option>
              {costCenters.map((c) => (
                <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
              ))}
            </select>
          </div>

          {/* Project Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5 flex items-center gap-1">
              <FolderGit2 className="h-3 w-3 text-amber-500" />
              <span>{isRtl ? 'المشروع / الفعالية' : 'Project'}</span>
            </label>
            <input
              type="text"
              value={selectedProject === 'ALL' ? '' : selectedProject}
              onChange={(e) => setSelectedProject(e.target.value ? e.target.value : 'ALL')}
              placeholder={isRtl ? 'تصفية باسم أو كود المشروع...' : 'Filter by project code or name...'}
              className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200'
              }`}
            />
          </div>

          {/* Station Selection Dropdown (Only shown to Admin and Regional Manager) */}
          {activeUser && (activeUser.role === 'Admin' || activeUser.role === 'SystemAdmin' || activeUser.role === 'RegionalManager') && (
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">{t.station}</label>
              <select
                value={selectedStation}
                onChange={(e) => setSelectedStation(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                  theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <option value="all">
                  {activeUser.role === 'RegionalManager' ? (isRtl ? 'جميع محطات إقليمي' : 'All regional stations') : (isRtl ? 'جميع محطات الشركة' : 'All stations')}
                </option>
                {allowedStations.map(s => (
                  <option key={s.id} value={s.id}>{s.station_name} ({s.station_code})</option>
                ))}
              </select>
            </div>
          )}

          {/* Report Type Dropdown */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">{t.reportType}</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
              className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <option value="movement">{t.cashMovementReport}</option>
              <option value="pending">{t.pendingReport}</option>
              <option value="settled">{t.settledReport}</option>
              <option value="daily">{t.dailyReport}</option>
              <option value="monthly">{t.monthlyReport}</option>
            </select>
          </div>



          {/* Start Date */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">{isRtl ? 'من تاريخ' : 'Start Date'}</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl border text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200'
              }`}
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1.5">{isRtl ? 'إلى تاريخ' : 'End Date'}</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl border text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200'
              }`}
            />
          </div>
        </div>

        {/* Generate Button Row */}
        <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={handleGenerate}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md shadow-emerald-600/10"
          >
            <RefreshCw size={12} />
            <span>{t.generateReport}</span>
          </button>
        </div>
      </div>

      {/* Generated Report Output Content */}
      {hasGenerated && (
        <div className={`p-6 rounded-2xl border print:border-none print:shadow-none ${
          theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          {/* Header row with Print and Excel Export tools */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b pb-4 mb-4 border-slate-100 dark:border-slate-800">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider font-mono">
                {isRtl ? 'قسم الحسابات والتدقيق الإقليمي' : 'Regional Finance & Auditing Division'}
              </span>
              <h3 className="font-extrabold text-base text-slate-800 dark:text-slate-100 mt-0.5">
                {getReportTitle()}
              </h3>
              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                Range: {startDate} ➔ {endDate}
              </div>
            </div>

            {/* Export buttons */}
            <div className="flex gap-1.5 self-end sm:self-auto print:hidden">
              <button
                onClick={handleExportExcel}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                  theme === 'dark' 
                    ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' 
                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                }`}
              >
                <Download size={12} />
                <span>{t.exportExcel}</span>
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md"
              >
                <Printer size={12} />
                <span>{t.print}</span>
              </button>
            </div>
          </div>

          {/* Sum Summary Card */}
          <div className="mb-4 flex flex-wrap gap-4 items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/50">
            <div className="text-xs">
              <span className="text-slate-400 block">{isRtl ? 'عدد الحركات المدرجة بالتقرير' : 'Total Filtered Record Count'}</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">{reportData.length} {isRtl ? 'حركة' : 'items'}</span>
            </div>
            <div className="text-right text-xs">
              <span className="text-slate-400 block">{isRtl ? 'إجمالي قيمة التقرير' : 'Total Compiled Value'}</span>
              <span className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                {totalSum.toLocaleString('en-US', { minimumFractionDigits: 2 })} EGP
              </span>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold bg-slate-50/50 dark:bg-slate-800/10">
                  <th className="py-2.5 px-3 font-semibold text-slate-500">{isRtl ? 'المحطة' : 'Station'}</th>
                  <th className="py-2.5 px-3 font-semibold text-slate-500">{t.transactionNo}</th>
                  <th className="py-2.5 px-3 font-semibold text-slate-500">{t.date}</th>
                  <th className="py-2.5 px-3 font-semibold text-slate-500">{t.status}</th>
                  <th className="py-2.5 px-3 font-semibold text-slate-500">{t.description}</th>
                  <th className="py-2.5 px-3 font-semibold text-slate-500">{isRtl ? 'رقم السند' : 'Voucher No'}</th>
                  <th className="py-2.5 px-3 font-semibold text-slate-500 text-right">{t.amount}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedReportData.map((tx) => {
                  const st = allStations.find(s => s.id === tx.station_id);
                  return (
                    <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20">
                      <td className="py-3 px-3 font-semibold text-emerald-600">{st?.station_name || 'N/A'}</td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-600 dark:text-slate-400">{tx.transaction_no || (isRtl ? 'قيد الانتظار' : 'Pending')}</td>
                      <td className="py-3 px-3 font-mono text-slate-500 dark:text-slate-400">{tx.date}</td>
                      <td className="py-3 px-3 font-medium">
                        {tx.status === 'Pending' ? (
                          <span className="text-amber-500">{t.statusPending}</span>
                        ) : tx.status === 'Under Settlement' ? (
                          <span className="text-blue-500">{t.statusSettled}</span>
                        ) : (
                          <span className="text-emerald-500 font-bold">{(t as any).statusFullySettled || (isRtl ? 'معتمدة ومسواة' : 'Approved')}</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300 max-w-xs truncate" title={tx.description}>
                        {tx.description}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-indigo-500">{tx.voucher_no || '-'}</td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                        {tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
                {reportData.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-400 font-medium">
                      {t.noData}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {reportData.length > 0 && (
            <div className="p-3 border-t border-slate-100 dark:border-slate-800/40 bg-slate-50/50 dark:bg-slate-800/5">
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
      )}
    </div>
  );
}
