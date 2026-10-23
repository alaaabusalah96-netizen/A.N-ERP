import React, { useState, useEffect } from 'react';
import { 
  Laptop, Plus, Calculator, Check, X, FileText, 
  Search, ShieldAlert, Calendar, Percent, Landmark, 
  TrendingDown, TrendingUp, HelpCircle, Building2
} from 'lucide-react';
import { StorageEngine } from '../db/storage';
import { UsersModule } from '../db/users';
import { CompaniesModule } from '../db/companies';
import { LogsModule } from '../db/logs';
import { dbSetDoc } from '../firebase';
import { AccountingBusinessEngine } from '../lib/enterprise/accounting_engine';
import { OrganizationEngine } from '../db/organizationEngine';
import OrgUnitTreeSelect from '../components/OrgUnitTreeSelect';
import { AssetBusinessEngine } from '../lib/enterprise/asset_engine';
import { FixedAsset, DepreciationRunLog } from '../types/asset';

export type { FixedAsset, DepreciationRunLog };

interface FixedAssetsProps {
  language: 'ar' | 'en';
  theme: 'light' | 'dark';
}

export default function FixedAssets({ language, theme }: FixedAssetsProps) {
  const isRtl = language === 'ar';
  const activeUser = UsersModule.getActiveUser();
  const companyId = activeUser?.company_id || CompaniesModule.getSelectedCompanyId() || '';

  // Core States
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Organization Engine State
  const [orgUnits, setOrgUnits] = useState<any[]>([]);
  const [selectedOrgUnitFilter, setSelectedOrgUnitFilter] = useState<string>('ALL');
  const [formOrgUnitId, setFormOrgUnitId] = useState<string>('');

  // Modals
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [showDepreciationRun, setShowDepreciationRun] = useState(false);
  const [showDisposeModal, setShowDisposeModal] = useState(false);
  const [selectedAssetForDisposal, setSelectedAssetForDisposal] = useState<FixedAsset | null>(null);
  const [disposalForm, setDisposalForm] = useState({
    disposalPrice: 0,
    disposalDate: new Date().toISOString().split('T')[0]
  });

  // Form States - Asset
  const [assetForm, setAssetForm] = useState({
    name: '', category: 'MACHINERY' as FixedAsset['category'], purchaseDate: new Date().toISOString().split('T')[0],
    originalCost: 0, depreciationRate: 10 // percentage, e.g. 10
  });

  // Depreciation Run Preview
  const [depreciationDate, setDepreciationDate] = useState(new Date().toISOString().split('T')[0]);
  const [isCalculated, setIsCalculated] = useState(false);
  const [runLogs, setRunLogs] = useState<DepreciationRunLog[]>([]);

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  // Load Assets
  const loadAssets = () => {
    const units = OrganizationEngine.getUnits(companyId);
    setOrgUnits(units);

    const companyAssets = AssetBusinessEngine.getAssetsByOrgUnit(companyId, selectedOrgUnitFilter);

    if (companyAssets.length === 0 && selectedOrgUnitFilter === 'ALL') {
      // Seed default assets
      const defaultAssets: FixedAsset[] = [
        {
          id: 'asset-1',
          company_id: companyId,
          name: isRtl ? 'خلاط أعلاف مركزي (ألماني)' : 'Central Feed Mixer Silo (German)',
          code: 'AST-MACH-3001',
          category: 'MACHINERY',
          purchaseDate: '2025-01-10',
          originalCost: 350000,
          depreciationRate: 0.10, // 10%
          accumulatedDepreciation: 52500,
          netBookValue: 297500,
          createdAt: new Date().toISOString()
        },
        {
          id: 'asset-2',
          company_id: companyId,
          name: isRtl ? 'شاحنة توزيع مرسيدس 6 طن' : 'Mercedes Delivery Truck 6-Ton',
          code: 'AST-VEH-3002',
          category: 'VEHICLES',
          purchaseDate: '2024-06-15',
          originalCost: 850000,
          depreciationRate: 0.20, // 20%
          accumulatedDepreciation: 340000,
          netBookValue: 510000,
          createdAt: new Date().toISOString()
        }
      ];
      StorageEngine.setStored('fixed_assets_items', defaultAssets);
      setAssets(defaultAssets);
    } else {
      setAssets(companyAssets);
    }
  };

  useEffect(() => {
    loadAssets();
    const onUpdate = () => loadAssets();
    window.addEventListener('custody_db_updated', onUpdate);
    return () => window.removeEventListener('custody_db_updated', onUpdate);
  }, [companyId, selectedOrgUnitFilter]);

  // Calculations
  const totalCost = assets.reduce((sum, a) => sum + a.originalCost, 0);
  const totalAccumulated = assets.reduce((sum, a) => sum + a.accumulatedDepreciation, 0);
  const totalBookValue = assets.reduce((sum, a) => sum + a.netBookValue, 0);

  // Submit Asset
  const handleAddAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) {
      showToast('error', isRtl ? 'يرجى اختيار شركة أولاً' : 'Please select a company first');
      return;
    }
    if (!assetForm.name) {
      showToast('error', isRtl ? 'يرجى إدخال اسم الأصل الثابت' : 'Please input asset name');
      return;
    }
    if (assetForm.originalCost <= 0) {
      showToast('error', isRtl ? 'قيمة الأصل الأصلية يجب أن تكون أكبر من الصفر' : 'Asset purchase cost must be greater than zero');
      return;
    }

    try {
      const newAsset = await AssetBusinessEngine.createAsset(companyId, {
        name: assetForm.name,
        category: assetForm.category,
        purchaseDate: assetForm.purchaseDate,
        originalCost: Number(assetForm.originalCost),
        depreciationRate: Number(assetForm.depreciationRate),
        org_unit_id: formOrgUnitId || activeUser?.org_unit_id
      });

      // Audit and logs
      LogsModule.addLog(
        activeUser?.id || 'system',
        activeUser?.full_name || 'System',
        isRtl ? 'إدراج أصل ثابت جديد' : 'Register New Fixed Asset',
        `Registered asset ${newAsset.name} under code ${newAsset.code} with cost ${newAsset.originalCost.toLocaleString()} EGP`
      );

      showToast('success', isRtl ? 'تم تسجيل الأصل الثابت بنجاح' : 'Asset registered successfully');
      setAssetForm({ name: '', category: 'MACHINERY', purchaseDate: new Date().toISOString().split('T')[0], originalCost: 0, depreciationRate: 10 });
      setFormOrgUnitId('');
      setShowAddAsset(false);
      loadAssets();
    } catch (err) {
      console.error('Create asset error:', err);
      showToast('error', isRtl ? 'حدث خطأ أثناء تسجيل الأصل الثابت' : 'Error registering asset');
    }
  };

  // Run Depreciation Pre-calculation (Monthly Straight Line)
  const handleCalculateDepreciation = () => {
    if (!companyId) {
      showToast('error', isRtl ? 'يرجى اختيار شركة أولاً' : 'Please select a company first');
      return;
    }
    const logItems = AssetBusinessEngine.calculateMonthlyDepreciation(assets);
    setRunLogs(logItems);
    setIsCalculated(true);
  };

  // Post Depreciation Run to database ledger
  const handlePostDepreciationRun = async () => {
    if (!companyId) {
      showToast('error', isRtl ? 'يرجى اختيار شركة أولاً' : 'Please select a company first');
      return;
    }
    if (runLogs.length === 0) return;

    try {
      const totalExp = runLogs.reduce((sum, rl) => sum + rl.expense, 0);

      await AssetBusinessEngine.postDepreciationRun(
        companyId,
        activeUser?.id || 'system',
        depreciationDate,
        runLogs,
        formOrgUnitId || activeUser?.org_unit_id
      );

      LogsModule.addLog(
        activeUser?.id || 'system',
        activeUser?.full_name || 'System',
        isRtl ? 'احتساب وحفظ استهلاك الأصول الثابتة' : 'Process Asset Depreciation',
        `Depreciated fixed assets for month ending ${depreciationDate}. Period Total: ${totalExp.toLocaleString()} EGP.`
      );

      showToast('success', isRtl ? 'تم احتساب واستهلاك الأصول بنجاح' : 'Depreciation processed successfully');
      setIsCalculated(false);
      setRunLogs([]);
      setFormOrgUnitId('');
      setShowDepreciationRun(false);
      loadAssets();
    } catch (err) {
      console.error('Post depreciation run error:', err);
      showToast('error', isRtl ? 'حدث خطأ أثناء احتساب الاستهلاك' : 'Error processing depreciation');
    }
  };

  const handleDisposeAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) {
      showToast('error', isRtl ? 'يرجى اختيار شركة أولاً' : 'Please select a company first');
      return;
    }
    if (!selectedAssetForDisposal) return;

    try {
      await AssetBusinessEngine.disposeAsset(companyId, activeUser?.id || 'system', {
        assetId: selectedAssetForDisposal.id,
        disposalPrice: Number(disposalForm.disposalPrice) || 0,
        disposalDate: disposalForm.disposalDate,
        org_unit_id: formOrgUnitId || selectedAssetForDisposal.org_unit_id
      });

      LogsModule.addLog(
        activeUser?.id || 'system',
        activeUser?.full_name || 'System',
        isRtl ? 'استبعاد أصل ثابت' : 'Dispose Fixed Asset',
        `Disposed asset ${selectedAssetForDisposal.name} (${selectedAssetForDisposal.code}) at price ${disposalForm.disposalPrice} EGP`
      );

      showToast('success', isRtl ? 'تم استبعاد الأصل الثابت وإثبات القيد المحاسبي بنجاح' : 'Asset disposed and GL entry posted successfully');
      setShowDisposeModal(false);
      setSelectedAssetForDisposal(null);
      loadAssets();
    } catch (err) {
      console.error('Dispose asset error:', err);
      showToast('error', isRtl ? 'حدث خطأ أثناء استبعاد الأصل' : 'Error disposing asset');
    }
  };

  // Filters
  const filteredAssets = assets.filter(a => {
    const matchesCategory = categoryFilter === 'ALL' || a.category === categoryFilter;
    const matchesSearch = a.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          a.code.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      
      {/* Toast popup */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 p-4 rounded-xl shadow-lg border text-white flex items-center gap-3 transition-all ${
          toast.type === 'success' ? 'bg-emerald-600 border-emerald-500' : 'bg-rose-600 border-rose-500'
        }`}>
          <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
          <span className="text-xs font-bold font-sans">{toast.text}</span>
        </div>
      )}

      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Landmark className="text-emerald-500 h-6 w-6" />
            <span>{isRtl ? 'إدارة الأصول الثابتة والاستهلاكات' : 'Fixed Assets & Depreciation'}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isRtl 
              ? 'سجل الأصول الرأسمالية للشركة واحتساب وتتبع معدلات الاستهلاك الدوري تلقائياً.' 
              : 'Fixed capital assets register and straight-line depreciation amortization engine.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDepreciationRun(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Calculator className="h-4 w-4" />
            <span>{isRtl ? 'احتساب الاستهلاك الشهري' : 'Run Monthly Depreciation'}</span>
          </button>
          <button
            onClick={() => setShowAddAsset(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>{isRtl ? 'إدراج أصل جديد' : 'Register Asset'}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{isRtl ? 'التكلفة التاريخية للأصول' : 'Historical Cost Pool'}</p>
            <h3 className="text-lg font-black text-slate-800 dark:text-white mt-1">{totalCost.toLocaleString()} EGP</h3>
          </div>
          <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-xl">
            <TrendingUp className="h-5 w-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{isRtl ? 'مجمع الاستهلاك المتراكم' : 'Accumulated Amortization Pool'}</p>
            <h3 className="text-lg font-black text-rose-600 mt-1">{totalAccumulated.toLocaleString()} EGP</h3>
          </div>
          <div className="p-2 bg-rose-500/10 text-rose-600 rounded-xl">
            <TrendingDown className="h-5 w-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{isRtl ? 'صافي القيمة الدفترية للأصول' : 'Net Capital Book Value'}</p>
            <h3 className="text-lg font-black text-slate-800 dark:text-white mt-1">{totalBookValue.toLocaleString()} EGP</h3>
          </div>
          <div className="p-2 bg-indigo-500/10 text-indigo-600 rounded-xl">
            <Landmark className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder={isRtl ? 'ابحث باسم الأصل أو كود التعريف...' : 'Search by asset name or code...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-2">
            <Building2 className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={selectedOrgUnitFilter}
              onChange={(e) => setSelectedOrgUnitFilter(e.target.value)}
              className="bg-transparent text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
            >
              <option value="ALL">{isRtl ? 'جميع الهياكل التنظيمية' : 'All Org Units'}</option>
              {orgUnits.map((u) => (
                <option key={u.id} value={u.id}>{u.code} - {u.name}</option>
              ))}
            </select>
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none"
          >
            <option value="ALL">{isRtl ? 'جميع تصنيفات الأصول' : 'All Categories'}</option>
            <option value="BUILDINGS">{isRtl ? 'مباني ومنشآت وسيلوهات' : 'Buildings & Silos'}</option>
            <option value="VEHICLES">{isRtl ? 'سيارات ومركبات توزيع' : 'Vehicles'}</option>
            <option value="MACHINERY">{isRtl ? 'آلات ومعدات مصنع' : 'Factory Machinery'}</option>
            <option value="COMPUTERS">{isRtl ? 'أجهزة حاسب آلي وإلكترونيات' : 'IT & Computers'}</option>
            <option value="FURNITURE">{isRtl ? 'أثاث ومكاتب إدارية' : 'Furniture'}</option>
          </select>
        </div>
      </div>

      {/* Asset List Grid */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                <th className="p-3">{isRtl ? 'رمز الأصل' : 'Asset Code'}</th>
                <th className="p-3">{isRtl ? 'اسم ومسمى الأصل' : 'Asset Title'}</th>
                <th className="p-3">{isRtl ? 'تصنيف الأصل' : 'Category'}</th>
                <th className="p-3">{isRtl ? 'الحالة' : 'Status'}</th>
                <th className="p-3">{isRtl ? 'تاريخ الشراء' : 'Purchase Date'}</th>
                <th className="p-3 text-right">{isRtl ? 'التكلفة التاريخية' : 'Acquisition Cost'}</th>
                <th className="p-3 text-right">{isRtl ? 'معدل القسط' : 'Amort. Rate'}</th>
                <th className="p-3 text-right">{isRtl ? 'مجمع الاستهلاك' : 'Accumulated Amort.'}</th>
                <th className="p-3 text-right">{isRtl ? 'صافي القيمة الدفترية' : 'Net Book Value'}</th>
                <th className="p-3 text-center">{isRtl ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs text-slate-700 dark:text-slate-200">
              {filteredAssets.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400 font-medium">
                    {isRtl ? 'لا يوجد أصول ثابتة مدرجة مطابقة للبحث' : 'No fixed assets matching search criteria'}
                  </td>
                </tr>
              ) : (
                filteredAssets.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/30">
                    <td className="p-3 font-mono font-bold text-slate-500">{a.code}</td>
                    <td className="p-3">
                      <div className="font-bold">{a.name}</div>
                      {a.org_unit_id && (
                        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                          <Building2 className="h-3 w-3" />
                          <span>{orgUnits.find(u => u.id === a.org_unit_id)?.name || a.org_unit_id}</span>
                        </div>
                      )}
                    </td>
                    <td className="p-3 font-semibold text-slate-500">{a.category}</td>
                    <td className="p-3">
                      {a.status === 'DISPOSED' ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 rounded-full">
                          {isRtl ? 'مستبعد / مباع' : 'Disposed'}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 rounded-full">
                          {isRtl ? 'نشط بالخدمة' : 'Active'}
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-mono text-slate-400">{a.purchaseDate}</td>
                    <td className="p-3 text-right font-mono font-extrabold">{a.originalCost.toLocaleString()} EGP</td>
                    <td className="p-3 text-right font-mono text-slate-400 font-bold">{(a.depreciationRate * 100)}%</td>
                    <td className="p-3 text-right font-mono text-rose-500 font-bold">{a.accumulatedDepreciation.toLocaleString()} EGP</td>
                    <td className="p-3 text-right font-mono font-black text-emerald-600">{a.netBookValue.toLocaleString()} EGP</td>
                    <td className="p-3 text-center">
                      {a.status !== 'DISPOSED' && (
                        <button
                          onClick={() => {
                            setSelectedAssetForDisposal(a);
                            setDisposalForm({ disposalPrice: a.netBookValue, disposalDate: new Date().toISOString().split('T')[0] });
                            setShowDisposeModal(true);
                          }}
                          className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold text-[11px] rounded-lg transition-all"
                        >
                          {isRtl ? 'استبعاد / بيع' : 'Dispose'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: REGISTER CAPITAL ASSET */}
      {showAddAsset && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setShowAddAsset(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <X size={16} />
            </button>
            <h3 className="text-md font-black text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <Landmark className="text-emerald-500 h-5 w-5" />
              <span>{isRtl ? 'تسجيل أصل رأسمالي جديد' : 'Register New Fixed Asset'}</span>
            </h3>

            <form onSubmit={handleAddAsset} className="space-y-4">
              <div>
                <OrgUnitTreeSelect
                  label={isRtl ? 'الوحدة التنظيمية / الموقع / الفرع' : 'Organization Unit / Site'}
                  value={formOrgUnitId}
                  onChange={(id) => setFormOrgUnitId(id)}
                  placeholder={isRtl ? '-- افتراضي (حسب صلاحية المستخدم) --' : '-- Default (User Scope) --'}
                  companyId={companyId}
                  isRtl={isRtl}
                  theme={theme}
                  showInheritanceSummary={false}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'مسمى الأصل / الوصف *' : 'Asset Title / Description *'}</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mercedes Truck, Silo 4"
                  value={assetForm.name}
                  onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'تصنيف الأصل' : 'Asset Category'}</label>
                  <select
                    value={assetForm.category}
                    onChange={(e) => setAssetForm({ ...assetForm, category: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="MACHINERY">{isRtl ? 'معدات وآلات' : 'Machinery'}</option>
                    <option value="VEHICLES">{isRtl ? 'سيارات ومركبات' : 'Vehicles'}</option>
                    <option value="BUILDINGS">{isRtl ? 'مباني ومنشآت' : 'Buildings'}</option>
                    <option value="COMPUTERS">{isRtl ? 'أجهزة حاسوب' : 'Computers'}</option>
                    <option value="FURNITURE">{isRtl ? 'أثاث مكتبي' : 'Furniture'}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'تاريخ الاقتناء' : 'Acquisition Date'}</label>
                  <input
                    type="date"
                    value={assetForm.purchaseDate}
                    onChange={(e) => setAssetForm({ ...assetForm, purchaseDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'تكلفة الاقتناء (EGP) *' : 'Purchase Cost (EGP) *'}</label>
                  <input
                    type="number"
                    required
                    value={assetForm.originalCost}
                    onChange={(e) => setAssetForm({ ...assetForm, originalCost: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'نسبة الاستهلاك السنوي' : 'Annual Deprec. Rate (%)'}</label>
                  <input
                    type="number"
                    value={assetForm.depreciationRate}
                    onChange={(e) => setAssetForm({ ...assetForm, depreciationRate: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddAsset(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl"
                >
                  {isRtl ? 'حفظ وتسجيل الأصل' : 'Save Fixed Asset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: DEPRECIATION CALCULATION RUN */}
      {showDepreciationRun && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setShowDepreciationRun(false);
                setIsCalculated(false);
                setRunLogs([]);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <X size={16} />
            </button>
            <h3 className="text-md font-black text-slate-800 dark:text-white mb-2 flex items-center gap-2">
              <Calculator className="text-indigo-500 h-5 w-5" />
              <span>{isRtl ? 'احتساب استهلاك الأصول الدوري' : 'Process Period Asset Depreciation'}</span>
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              {isRtl 
                ? 'يقوم النظام بحساب قيمة الاستهلاك الشهري (القسط الثابت) تلقائياً لجميع الأصول المسجلة وتحديث صافي القيمة الدفترية.'
                : 'Runs monthly straight-line calculations for registered assets and updates net asset value.'}
            </p>

            <div className="space-y-4">
              <div className="flex items-end gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'تاريخ احتساب الاستهلاك لشهر:' : 'Amortization Period Date:'}</label>
                  <input
                    type="date"
                    value={depreciationDate}
                    onChange={(e) => setDepreciationDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none text-slate-800 dark:text-slate-100 font-mono"
                  />
                </div>
                <button
                  onClick={handleCalculateDepreciation}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all h-[36px]"
                >
                  {isRtl ? 'احسب الآن' : 'Calculate Amortization'}
                </button>
              </div>

              {isCalculated && (
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">{isRtl ? 'معاينة توزيع استهلاك الأصول' : 'Depreciation Summary Preview'}</h4>
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs max-h-[220px] overflow-y-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-900 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                          <th className="p-2 text-left">{isRtl ? 'الأصل' : 'Asset'}</th>
                          <th className="p-2 text-left">{isRtl ? 'الكود' : 'Code'}</th>
                          <th className="p-2 text-right">{isRtl ? 'قيمة الاستهلاك شهرياً' : 'Monthly Cost'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                        {runLogs.map((rl, idx) => (
                          <tr key={idx}>
                            <td className="p-2 font-bold">{rl.assetName}</td>
                            <td className="p-2 font-mono text-slate-400">{rl.code}</td>
                            <td className="p-2 text-right font-mono font-bold text-rose-500">+{rl.expense.toLocaleString(undefined, {maximumFractionDigits:2})} EGP</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-3 bg-amber-50/50 dark:bg-slate-950/40 border border-amber-200 dark:border-slate-800/80 rounded-xl flex items-start gap-2 text-amber-600 text-xs">
                    <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      {isRtl 
                        ? 'عند تأكيد الاعتماد، سيتم تحديث وتخفيض قيمة الأصول الدفترية فوراً في سجلات النظام.'
                        : 'Confirming this step updates asset net values and records the monthly period activity.'}
                    </p>
                  </div>

                  <div className="flex justify-between items-center bg-slate-100 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                    <span className="text-xs font-bold">{isRtl ? 'إجمالي استهلاك الفترة:' : 'Total Period Depreciation:'}</span>
                    <span className="font-mono font-black text-rose-500 text-sm">
                      {runLogs.reduce((sum, rl) => sum + rl.expense, 0).toLocaleString(undefined, {maximumFractionDigits:2})} EGP
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowDepreciationRun(false);
                        setIsCalculated(false);
                        setRunLogs([]);
                      }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl"
                    >
                      {isRtl ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                      onClick={handlePostDepreciationRun}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl"
                    >
                      {isRtl ? 'تأكيد واعتماد الاستهلاك' : 'Approve Depreciation Run'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* MODAL 3: DISPOSE / SELL FIXED ASSET */}
      {showDisposeModal && selectedAssetForDisposal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setShowDisposeModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <X size={16} />
            </button>
            <h3 className="text-md font-black text-slate-800 dark:text-white mb-2 flex items-center gap-2">
              <TrendingDown className="text-amber-500 h-5 w-5" />
              <span>{isRtl ? 'استبعاد / بيع أصل ثابت' : 'Dispose / Sell Fixed Asset'}</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              {selectedAssetForDisposal.name} ({selectedAssetForDisposal.code})
            </p>

            <form onSubmit={handleDisposeAsset} className="space-y-4">
              <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">{isRtl ? 'التكلفة التاريخية:' : 'Historical Cost:'}</span>
                  <span>{selectedAssetForDisposal.originalCost.toLocaleString()} EGP</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">{isRtl ? 'مجمع الاستهلاك:' : 'Accum. Depreciation:'}</span>
                  <span className="text-rose-500">-{selectedAssetForDisposal.accumulatedDepreciation.toLocaleString()} EGP</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-1 font-bold">
                  <span>{isRtl ? 'القيمة الدفترية المتبقية:' : 'Net Book Value:'}</span>
                  <span className="text-emerald-600">{selectedAssetForDisposal.netBookValue.toLocaleString()} EGP</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'سعر البيع / القيمة المستردة (EGP)' : 'Sale / Disposal Price (EGP)'}</label>
                <input
                  type="number"
                  min={0}
                  value={disposalForm.disposalPrice}
                  onChange={(e) => setDisposalForm({ ...disposalForm, disposalPrice: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-amber-500 text-slate-800 dark:text-slate-100 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'تاريخ الاستبعاد' : 'Disposal Date'}</label>
                <input
                  type="date"
                  value={disposalForm.disposalDate}
                  onChange={(e) => setDisposalForm({ ...disposalForm, disposalDate: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-amber-500 text-slate-800 dark:text-slate-100 font-mono"
                />
              </div>

              {/* Gain / Loss preview */}
              <div className="p-3 rounded-xl border text-xs flex justify-between items-center font-mono font-bold bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40">
                <span>{isRtl ? 'الأرباح / الخسائر الرأسمالية المتوقعة:' : 'Expected Capital Gain/Loss:'}</span>
                <span className={disposalForm.disposalPrice - selectedAssetForDisposal.netBookValue >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                  {(disposalForm.disposalPrice - selectedAssetForDisposal.netBookValue).toLocaleString()} EGP
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => setShowDisposeModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl"
                >
                  {isRtl ? 'تأكيد الاستبعاد والقيد المحاسبي' : 'Confirm Asset Disposal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
