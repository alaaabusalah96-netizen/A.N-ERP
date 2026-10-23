import React, { useState, useEffect } from 'react';
import { 
  Building, 
  Search, 
  Wallet, 
  Clock, 
  FileCheck, 
  TrendingUp, 
  ArrowRight,
  ArrowLeft,
  Calendar,
  Layers,
  Sparkles,
  Plus,
  Trash2,
  Edit,
  Check,
  X,
  Coins,
  ShieldCheck,
  Building2,
  Globe,
  CornerDownLeft,
  Settings,
  UserCheck,
  PlusCircle,
  Network,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  MapPin,
  Edit3,
  KeyRound
} from 'lucide-react';
import { CustodyDB } from '../db';
import { auth } from '../firebase';
import { translations, Language, Theme, Station, Region, Company, AppUser } from '../types';
import { createManagedUser, updateManagedUser } from '../lib/userProvisioning';
import OrganizationTreeManager from '../components/OrganizationTreeManager';

interface StationsProps {
  language: Language;
  theme: Theme;
  setCurrentTab: (tab: string) => void;
  setSelectedStationId: (id: string | null) => void;
}

export default function Stations({
  language,
  theme,
  setCurrentTab,
  setSelectedStationId
}: StationsProps) {
  const t = translations[language];
  const isRtl = language === 'ar';
  const activeUser = CustodyDB.getActiveUser();
  
  // Both SystemAdmin and Admin have full management capabilities
  const isAdmin = activeUser && (activeUser.role === 'SystemAdmin' || activeUser.role === 'Admin');
  const isSystemAdmin = activeUser && activeUser.role === 'SystemAdmin';
  const canRecharge = activeUser && (activeUser.role === 'SystemAdmin' || activeUser.role === 'Admin' || activeUser.permissions?.replace_custody || activeUser.role === 'RegionalManager');

  const [searchQuery, setSearchQuery] = useState('');
  
  // Scopes and data
  const [companies, setCompanies] = useState<Company[]>(() => CustodyDB.getCompanies());
  const [regions, setRegions] = useState<Region[]>(() => CustodyDB.getRegions());
  const [stations, setStations] = useState<Station[]>(() => CustodyDB.getStationsForUser(activeUser));
  const [users, setUsers] = useState<AppUser[]>(() => CustodyDB.getUsers());
  const allTransactions = CustodyDB.getScopedTransactions();

  const visibleCompanies = React.useMemo(() => {
    if (isSystemAdmin) return companies;
    if (activeUser?.company_id) {
      return companies.filter(c => c.id === activeUser.company_id);
    }
    return companies;
  }, [companies, isSystemAdmin, activeUser]);

  // Selected company id and active region filtering
  const [selectedCompanyId, setSelectedCompanyId] = useState(() => CustodyDB.getSelectedCompanyId());
  const [selectedRegionId, setSelectedRegionId] = useState<string>(() => {
    const compRegions = regions.filter(r => r.company_id === selectedCompanyId);
    return activeUser?.region_id || compRegions[0]?.id || 'all';
  });

  // UI state
  const [isStructureOpen, setIsStructureOpen] = useState(false);
  const [structureView, setStructureView] = useState<'tree' | 'tables'>('tree');
  const [structureTab, setStructureTab] = useState<'companies' | 'regions' | 'stations'>('companies');
  
  // Recharge Custody Modal State
  const [rechargingStation, setRechargingStation] = useState<Station | null>(null);
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [rechargeNotes, setRechargeNotes] = useState('');

  // Toast Notification
  const [toastMsg, setToastMsg] = useState('');

  // Popup Modals Visibility State
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [showRegionModal, setShowRegionModal] = useState(false);
  const [showStationModal, setShowStationModal] = useState(false);

  // Form states for creating/editing entities
  const [compName, setCompName] = useState('');
  const [compCustody, setCompCustody] = useState('');
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

  const [regName, setRegName] = useState('');
  const [regCode, setRegCode] = useState('');
  const [regCompanyId, setRegCompanyId] = useState(selectedCompanyId);
  const [editingRegion, setEditingRegion] = useState<Region | null>(null);

  const [stnName, setStnName] = useState('');
  const [stnCode, setStnCode] = useState('');
  const [stnCustody, setStnCustody] = useState('');
  const [stnRegionId, setStnRegionId] = useState('');
  const [editingStation, setEditingStation] = useState<Station | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const refreshData = () => {
    setCompanies(CustodyDB.getCompanies());
    setRegions(CustodyDB.getRegions());
    setStations(CustodyDB.getStationsForUser(activeUser));
    setUsers(CustodyDB.getUsers());
  };

  const handleSaveRegionManager = async (regionId: string, companyId: string, email: string, pass: string) => {
    if (!email) return;
    const cleanEmail = email.trim().toLowerCase();
    const usersList = CustodyDB.getUsers();
    const existingManager = usersList.find(u => u.region_id === regionId && u.role === 'RegionalManager');

    try {
      if (existingManager) {
        const payload: any = {
          email: cleanEmail,
          company_id: companyId,
          region_id: regionId,
          role: 'RegionalManager',
          is_active: true
        };
        if (pass && pass.trim()) {
          payload.password = pass.trim();
        }
        const data = await updateManagedUser(existingManager.id, payload);
        if (!data.success) {
          alert(`⚠️ ${data.message || (isRtl ? 'فشل تحديث حساب مدير القطاع' : 'Failed to update Regional Manager account')}`);
          return;
        }
        if (data.user) {
          const updatedUsers = usersList.map(u => u.id === data.user!.id ? data.user! : u);
          await CustodyDB.saveUsers(updatedUsers);
        }
        showToast(isRtl ? 'تم تحديث بيانات مدير القطاع بنجاح!' : 'Regional Manager credentials updated successfully!');
      } else {
        const payload: any = {
          email: cleanEmail,
          full_name: isRtl ? `مدير قطاع` : `Regional Manager`,
          role: 'RegionalManager',
          company_id: companyId,
          region_id: regionId,
          station_id: null,
          permissions: CustodyDB.enrichUserPermissions('RegionalManager'),
          must_change_password: true
        };
        if (pass && pass.trim()) {
          payload.password = pass.trim();
        }
        const data = await createManagedUser(payload);
        if (!data.success) {
          alert(`⚠️ ${data.message || (isRtl ? 'فشل إنشاء حساب مدير القطاع' : 'Failed to create Regional Manager account')}`);
          return;
        }
        if (data.user) {
          await CustodyDB.saveUsers([...usersList, data.user]);
        }
        const effectivePass = data.temporaryPassword || (pass && pass.trim()) || '';
        const tempMsg = effectivePass ? (isRtl ? ` (كلمة المرور: ${effectivePass})` : ` (Password: ${effectivePass})`) : '';
        showToast((isRtl ? 'تم حفظ بيانات مدير القطاع بنجاح!' : 'Regional Manager created successfully!') + tempMsg);
      }
      refreshData();
    } catch (err: any) {
      alert(isRtl ? `⚠️ خطأ في الاتصال بالخادم: ${err.message}` : `⚠️ Server connection error: ${err.message}`);
    }
  };

  const handleSaveStationAdmin = async (stationId: string, regionId: string | undefined, companyId: string, email: string, pass: string) => {
    if (!email) return;
    const cleanEmail = email.trim().toLowerCase();
    const usersList = CustodyDB.getUsers();
    const existingAdmin = usersList.find(u => u.station_id === stationId && u.role === 'StationAdmin');

    try {
      if (existingAdmin) {
        const payload: any = {
          email: cleanEmail,
          company_id: companyId,
          region_id: regionId || null,
          station_id: stationId,
          role: 'StationAdmin',
          is_active: true
        };
        if (pass && pass.trim()) {
          payload.password = pass.trim();
        }
        const data = await updateManagedUser(existingAdmin.id, payload);
        if (!data.success) {
          alert(`⚠️ ${data.message || (isRtl ? 'فشل تحديث حساب مسؤول الفرع' : 'Failed to update Branch Admin account')}`);
          return;
        }
        if (data.user) {
          const updatedUsers = usersList.map(u => u.id === data.user!.id ? data.user! : u);
          await CustodyDB.saveUsers(updatedUsers);
        }
        showToast(isRtl ? 'تم تحديث بيانات مسؤول الفرع بنجاح!' : 'Branch Admin credentials updated successfully!');
      } else {
        const payload: any = {
          email: cleanEmail,
          full_name: isRtl ? `مسؤول فرع` : `Branch Administrator`,
          role: 'StationAdmin',
          company_id: companyId,
          region_id: regionId || null,
          station_id: stationId,
          permissions: CustodyDB.enrichUserPermissions('StationAdmin'),
          must_change_password: true
        };
        if (pass && pass.trim()) {
          payload.password = pass.trim();
        }
        const data = await createManagedUser(payload);
        if (!data.success) {
          alert(`⚠️ ${data.message || (isRtl ? 'فشل إنشاء حساب مسؤول الفرع' : 'Failed to create Branch Admin account')}`);
          return;
        }
        if (data.user) {
          await CustodyDB.saveUsers([...usersList, data.user]);
        }
        const effectivePass = data.temporaryPassword || (pass && pass.trim()) || '';
        const tempMsg = effectivePass ? (isRtl ? ` (كلمة المرور: ${effectivePass})` : ` (Password: ${effectivePass})`) : '';
        showToast((isRtl ? 'تم حفظ بيانات مسؤول الفرع بنجاح!' : 'Branch Admin created successfully!') + tempMsg);
      }
      refreshData();
    } catch (err: any) {
      alert(isRtl ? `⚠️ خطأ في الاتصال بالخادم: ${err.message}` : `⚠️ Server connection error: ${err.message}`);
    }
  };

  useEffect(() => {
    // Live update when Firebase/Firestore database updates
    window.addEventListener('custody_db_updated', refreshData);
    return () => {
      window.removeEventListener('custody_db_updated', refreshData);
    };
  }, []);

  const handleViewStation = (stationId: string) => {
    setSelectedStationId(stationId);
    setCurrentTab('station-details');
  };

  // Company CRUD handlers
  const handleAddCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (!compName.trim()) return;

    if (editingCompany) {
      CustodyDB.updateCompany(editingCompany.id, {
        name: compName.trim()
      });
      showToast(isRtl ? 'تم تحديث الشركة بنجاح' : 'Company updated successfully');
      setEditingCompany(null);
    } else {
      CustodyDB.addCompany(compName.trim(), 0);
      showToast(isRtl ? 'تم إضافة الشركة بنجاح' : 'Company added successfully');
    }
    setCompName('');
    setCompCustody('');
    setShowCompanyModal(false);
    refreshData();
  };

  const startAddCompany = () => {
    setEditingCompany(null);
    setCompName('');
    setCompCustody('');
    setShowCompanyModal(true);
  };

  const startEditCompany = (c: Company) => {
    setEditingCompany(c);
    setCompName(c.name);
    setCompCustody('');
    setShowCompanyModal(true);
  };

  const handleDeleteCompany = (id: string) => {
    const connectedRegions = regions.filter(r => r.company_id === id);
    const connectedStations = stations.filter(s => s.company_id === id);

    if (connectedRegions.length > 0 || connectedStations.length > 0) {
      alert(
        isRtl 
          ? `لا يمكن حذف هذه الشركة لوجود قطاعات (${connectedRegions.length}) أو فروع (${connectedStations.length}) تابعة لها. يرجى حذف الفروع أولاً.` 
          : `Cannot delete company. It contains ${connectedRegions.length} regions and ${connectedStations.length} stations. Please delete them first.`
      );
      return;
    }

    if (confirm(isRtl ? 'هل تريد حذف هذه الشركة وجميع بياناتها بالتأكيد؟' : 'Are you sure you want to delete this company?')) {
      CustodyDB.deleteCompany(id).then(res => {
        if (!res.success) {
          showToast(isRtl ? `فشل حذف الشركة: ${res.error || 'خطأ في الخادم'}` : `Failed to delete company: ${res.error || 'Server error'}`);
        } else {
          showToast(isRtl ? 'تم حذف الشركة بنجاح' : 'Company deleted successfully');
          refreshData();
        }
      });
    }
  };

  // Region CRUD handlers
  const handleAddRegion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim()) return;

    if (editingRegion) {
      CustodyDB.updateRegion(editingRegion.id, {
        name: regName.trim(),
        company_id: regCompanyId
      });
      showToast(isRtl ? 'تم تحديث الإقليم بنجاح' : 'Region updated successfully');
      setEditingRegion(null);
    } else {
      CustodyDB.addRegion(regName.trim(), '', regCompanyId);
      showToast(isRtl ? 'تم إضافة الإقليم بنجاح' : 'Region added successfully');
    }
    setRegName('');
    setRegCode('');
    setShowRegionModal(false);
    refreshData();
  };

  const startAddRegionForCompany = (companyId: string) => {
    setEditingRegion(null);
    setRegName('');
    setRegCode('');
    setRegCompanyId(companyId);
    setShowRegionModal(true);
  };

  const startEditRegion = (r: Region) => {
    setEditingRegion(r);
    setRegName(r.name);
    setRegCode('');
    setRegCompanyId(r.company_id || selectedCompanyId);
    setShowRegionModal(true);
  };

  const handleDeleteRegion = (id: string) => {
    const connectedStations = stations.filter(s => s.region_id === id);
    if (connectedStations.length > 0) {
      alert(
        isRtl 
          ? `لا يمكن حذف هذا القطاع لوجود عدد (${connectedStations.length}) فروع تابعة له. يرجى نقل أو حذف الفروع أولاً.` 
          : `Cannot delete region. It contains ${connectedStations.length} branches. Please move or delete them first.`
      );
      return;
    }

    if (confirm(isRtl ? 'هل تريد حذف هذا الإقليم بالتأكيد؟' : 'Are you sure you want to delete this region?')) {
      CustodyDB.deleteRegion(id);
      showToast(isRtl ? 'تم حذف الإقليم بنجاح' : 'Region deleted successfully');
      refreshData();
    }
  };

  // Station CRUD handlers
  const handleAddStation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stnName.trim() || !stnCode.trim() || !stnCustody) return;
    const val = parseFloat(stnCustody);
    if (isNaN(val) || val <= 0) return;

    const rId = stnRegionId === 'none' || !stnRegionId ? undefined : stnRegionId;

    if (editingStation) {
      CustodyDB.updateStation(editingStation.id, {
        station_name: stnName.trim(),
        station_code: stnCode.toUpperCase().trim(),
        custody_amount: val,
        region_id: rId
      });
      showToast(isRtl ? 'تم تحديث المحطة بنجاح' : 'Station/Branch updated successfully');
      setEditingStation(null);
    } else {
      // Find company id of the region or default to selectedCompanyId
      let targetCompanyId = selectedCompanyId;
      if (rId) {
        const reg = regions.find(r => r.id === rId);
        if (reg && reg.company_id) {
          targetCompanyId = reg.company_id;
        }
      }
      CustodyDB.addStation(stnName.trim(), stnCode.toUpperCase().trim(), val, rId, targetCompanyId);
      showToast(isRtl ? 'تم إضافة المحطة بنجاح' : 'Station/Branch added successfully');
    }
    setStnName('');
    setStnCode('');
    setStnCustody('');
    setStnRegionId('');
    setShowStationModal(false);
    refreshData();
  };

  const startAddStationForRegion = (regionId: string, companyId?: string) => {
    setEditingStation(null);
    setStnName('');
    setStnCode('');
    setStnCustody('');
    setStnRegionId(regionId);
    if (companyId) {
      setSelectedCompanyId(companyId);
    }
    setShowStationModal(true);
  };

  const startAddStationDirectForCompany = (companyId: string) => {
    setEditingStation(null);
    setStnName('');
    setStnCode('');
    setStnCustody('');
    setStnRegionId('none');
    setSelectedCompanyId(companyId);
    setShowStationModal(true);
  };

  const startEditStation = (s: Station) => {
    setEditingStation(s);
    setStnName(s.station_name);
    setStnCode(s.station_code);
    setStnCustody(String(s.custody_amount));
    setStnRegionId(s.region_id || 'none');
    setShowStationModal(true);
  };

  const handleDeleteStation = (id: string) => {
    if (confirm(isRtl ? 'هل تريد حذف هذه المحطة بالتأكيد؟' : 'Are you sure you want to delete this station/branch?')) {
      CustodyDB.deleteStation(id);
      showToast(isRtl ? 'تم حذف المحطة بنجاح' : 'Station deleted successfully');
      refreshData();
    }
  };

  // Replenish Custody handler
  const handleRechargeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rechargingStation || !rechargeAmount) return;
    const amountVal = parseFloat(rechargeAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      alert(isRtl ? 'يرجى إدخال مبلغ صحيح وموجب' : 'Please enter a valid positive amount.');
      return;
    }

    const currentCustody = rechargingStation.custody_amount;
    const nextCustody = currentCustody + amountVal;

    CustodyDB.updateStation(rechargingStation.id, {
      custody_amount: nextCustody
    });

    CustodyDB.addLog(
      activeUser?.id || 'unknown',
      activeUser?.full_name || 'Anonymous',
      'Custody Replenishment',
      `Replenished custody balance of ${rechargingStation.station_name} with +${amountVal.toLocaleString()} EGP (Total custody updated from ${currentCustody.toLocaleString()} to ${nextCustody.toLocaleString()} EGP). Notes: ${rechargeNotes || '-'}`,
      rechargingStation.id,
      rechargingStation.company_id,
      amountVal,
      rechargeNotes
    );

    showToast(isRtl ? 'تم استعاضة وشحن رصيد العهدة للمحطة بنجاح!' : 'Custody replenished successfully!');
    setRechargingStation(null);
    setRechargeAmount('');
    setRechargeNotes('');
    refreshData();
  };

  // Filtering scoped entities
  const companyRegions = regions.filter(r => r.company_id === selectedCompanyId);
  const companyStations = isSystemAdmin ? stations.filter(s => s.company_id === selectedCompanyId) : stations;

  // Active stations shown in main grid
  const stationsToDisplay = companyStations.filter(s => {
    if (selectedRegionId === 'all') return true;
    if (selectedRegionId === 'none') return !s.region_id;
    return s.region_id === selectedRegionId;
  });

  const filteredStations = stationsToDisplay.filter(s => 
    s.station_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.station_code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6" id="stations-directory-container">
      {/* Toast banner */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-[90] p-4 rounded-xl bg-emerald-600 text-white shadow-xl flex items-center gap-2 text-xs font-bold animate-bounce">
          <Check size={16} />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {isRtl ? 'دليل المحطات والعهد والعمليات' : 'Stations & Custody Hub'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isRtl 
              ? `عرض هيكل وتفاصيل عهد فروع: ${companies.find(c => c.id === selectedCompanyId)?.name || ''}`
              : `View hierarchy and custody details for: ${companies.find(c => c.id === selectedCompanyId)?.name || ''}`
            }
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => setIsStructureOpen(!isStructureOpen)}
              className={`flex items-center gap-1.5 px-4 py-2 border rounded-lg font-bold text-xs transition-all cursor-pointer ${
                isStructureOpen
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600'
                  : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
              }`}
            >
              <Network size={14} />
              <span>{isStructureOpen ? (isRtl ? 'عرض كروت الفروع' : 'Show Branch Cards') : (isRtl ? 'إدارة الهيكل والوصول' : 'Manage Structure & Access')}</span>
            </button>
          )}
          <button
            onClick={() => setCurrentTab('dashboard')}
            className="flex items-center gap-2 px-4 py-2 border rounded-lg font-medium text-xs transition-all hover:bg-slate-100 dark:hover:bg-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 cursor-pointer"
          >
            {isRtl ? <ArrowRight size={14} className="text-slate-500/50" /> : <ArrowLeft size={14} className="text-slate-500/50" />}
            <span>{isRtl ? 'لوحة المتابعة' : 'Dashboard Overview'}</span>
          </button>
        </div>
      </div>

      {isStructureOpen ? (
        <div className="space-y-6 mt-4 animate-fade-in" id="stations-structure-tree">
          {/* Dynamic Organization Tree Manager */}
          <OrganizationTreeManager
            companyId={selectedCompanyId}
            isRtl={isRtl}
            theme={theme}
            onStructureChange={refreshData}
          />

          {/* Structure builder title banner */}
          <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            theme === 'dark' ? 'bg-indigo-950/15 border-indigo-900/40 text-indigo-200' : 'bg-indigo-50/50 border-indigo-100 text-indigo-700'
          }`}>
            <div className="flex items-center gap-2.5">
              <Network size={20} className="text-indigo-500" />
              <div>
                <h4 className="font-bold text-sm">
                  {isRtl ? 'الهيكل التنظيمي وإدارة الصلاحيات والوصول' : 'Organizational Hierarchy & Access Control'}
                </h4>
                <p className="text-xs text-slate-400">
                  {isRtl 
                    ? 'إدارة القطاعات، الفروع العهدية وحسابات تسجيل الدخول الخاصة بها.' 
                    : 'Manage regions/sectors, branches and their respective login accounts.'}
                </p>
              </div>
            </div>
            
            {/* Scoped Actions */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => startAddRegionForCompany(selectedCompanyId)}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <Plus size={13} />
                <span>{isRtl ? 'إضافة قطاع/منطقة' : 'Add Sector'}</span>
              </button>
              <button
                type="button"
                onClick={() => startAddStationDirectForCompany(selectedCompanyId)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <Plus size={13} />
                <span>{isRtl ? 'فرع مباشر' : 'Add Direct Branch'}</span>
              </button>
            </div>
          </div>

          <div className="space-y-8">
            {visibleCompanies.map(comp => {
              const compRegs = regions.filter(r => r.company_id === comp.id);
              const compStns = stations.filter(s => s.company_id === comp.id);
              const directStns = compStns.filter(s => !s.region_id);

              return (
                <div 
                  key={comp.id}
                  className="border border-indigo-100 dark:border-indigo-900/60 rounded-2xl p-5 bg-indigo-50/5 dark:bg-slate-900/10 shadow-sm relative overflow-hidden"
                >
                  {/* Company display banner */}
                  <div className="flex items-center gap-3 border-b border-indigo-100/50 dark:border-slate-800 pb-3 mb-4">
                    <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-sm">
                      <Building size={16} />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white">{comp.name}</h4>
                      <p className="text-[10px] text-slate-400">{isRtl ? 'المنظومة النشطة' : 'Active Organization'}</p>
                    </div>
                  </div>

                  {/* Company Structure */}
                  <div className="space-y-6 pl-4 border-l-2 border-indigo-100 dark:border-slate-800/80 mr-1 rtl:pl-0 rtl:pr-4 rtl:border-l-0 rtl:border-r-2">
                    {compRegs.length === 0 && directStns.length === 0 ? (
                      <div className="p-6 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-800 text-xs text-slate-400">
                        {isRtl 
                          ? 'لا يوجد هيكل تنظيمي مضاف حتى الآن. ابدأ بإضافة قطاع أو فرع من الأزرار بالأعلى.' 
                          : 'No organizational structure has been added yet. Start by adding a sector or branch.'}
                      </div>
                    ) : (
                      compRegs.map(reg => {
                        const regStns = compStns.filter(s => s.region_id === reg.id);

                        return (
                          <div key={reg.id} className="relative group/sector">
                            {/* Connector dot */}
                            <div className="absolute -left-[21px] rtl:-right-[21px] top-4 h-1.5 w-1.5 rounded-full bg-indigo-400 border border-white dark:border-slate-900" />
                            
                            {/* Sector Card */}
                            <div className="p-3.5 rounded-xl border border-indigo-100/60 dark:border-slate-800 bg-white/50 dark:bg-slate-800/10 flex items-center justify-between gap-3 hover:border-indigo-200 dark:hover:border-indigo-950 transition-all">
                              <div className="flex items-center gap-2">
                                <div className="p-1 rounded bg-indigo-500/10 text-indigo-600">
                                  <Globe size={14} />
                                </div>
                                <div>
                                  <h5 className="font-bold text-xs text-slate-800 dark:text-slate-100">{reg.name}</h5>
                                  <span className="text-[9px] font-mono text-slate-400 uppercase">
                                    {reg.code || 'REG-SEC'}
                                  </span>
                                </div>
                              </div>

                              {/* Sector actions */}
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => startAddStationForRegion(reg.id, comp.id)}
                                  className="px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold transition-all flex items-center gap-0.5 cursor-pointer"
                                  title={isRtl ? 'إضافة فرع تحت هذا القطاع' : 'Add Station under Sector'}
                                >
                                  <Plus size={10} />
                                  <span>{isRtl ? 'إضافة فرع' : 'Add Branch'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => startEditRegion(reg)}
                                  className="p-1 rounded hover:bg-indigo-50 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400 cursor-pointer"
                                  title={isRtl ? 'تعديل القطاع' : 'Edit Sector'}
                                >
                                  <Edit size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRegion(reg.id)}
                                  className="p-1 rounded hover:bg-rose-50 dark:hover:bg-slate-800 text-rose-500 hover:text-rose-600 cursor-pointer"
                                  title={isRtl ? 'حذف القطاع' : 'Delete Sector'}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>

                            {/* Sector manager credentials */}
                            <div className="mt-2.5 mb-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-100 dark:border-slate-850 max-w-xl flex items-center justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-450 dark:text-slate-500">
                                  <KeyRound size={11} />
                                  <span>{isRtl ? 'حساب مدير القطاع (إقليمي)' : 'Regional Sector Manager Account'}</span>
                                </div>
                                {users.find(u => u.region_id === reg.id && u.role === 'RegionalManager')?.email ? (
                                  <div className="text-[10px] text-slate-600 dark:text-slate-300 font-mono mt-1">
                                    <span className="font-bold text-slate-400 mr-1">{isRtl ? 'البريد:' : 'Email:'}</span>
                                    {users.find(u => u.region_id === reg.id && u.role === 'RegionalManager')?.email}
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 italic">
                                    {isRtl ? 'لم يتم تعيين مدير للقطاع' : 'No Sector Manager assigned'}
                                  </div>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  window.dispatchEvent(new CustomEvent('navigate_tab', { 
                                    detail: { tab: 'settings', settingsTab: 'permissions', selectedCompanyId: comp.id } 
                                  }));
                                }}
                                className="px-2.5 py-1 rounded-lg bg-indigo-600/10 hover:bg-indigo-600 text-indigo-600 hover:text-white dark:text-indigo-400 dark:hover:text-white text-[10px] font-bold transition-all shrink-0 cursor-pointer"
                              >
                                {isRtl ? 'إدارة الوصول والصلاحيات' : 'Manage Access'}
                              </button>
                            </div>

                            {/* Stations list of Sector */}
                            <div className="pl-6 mr-1 pr-0 border-l border-dashed border-indigo-100 dark:border-slate-800/80 my-2 space-y-3 rtl:pl-0 rtl:pr-6 rtl:border-l-0 rtl:border-r rtl:border-dashed animate-fade-in">
                              {regStns.length === 0 ? (
                                <div className="p-2.5 text-[10px] text-slate-400 italic">
                                  {isRtl ? 'لا توجد فروع مضافة تحت هذا القطاع.' : 'No branches added under this sector yet.'}
                                </div>
                              ) : (
                                regStns.map(stn => (
                                  <div 
                                    key={stn.id}
                                    className="p-3 rounded-xl border border-slate-100 dark:border-slate-850 bg-white dark:bg-slate-900/30 hover:border-slate-200 flex flex-col gap-2 max-w-xl"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        <div className={`h-1.5 w-1.5 rounded-full ${stn.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                        <div>
                                          <div className="font-bold text-[11px] text-slate-700 dark:text-slate-200">
                                            {stn.station_name}
                                          </div>
                                          <div className="text-[9px] text-slate-450 font-mono">
                                            Code: {stn.station_code} | {isRtl ? 'العهدة:' : 'Custody:'} {CustodyDB.getStationDeductedCustody(stn.id).toLocaleString()} EGP
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => startEditStation(stn)}
                                          className="p-1 rounded hover:bg-indigo-50 dark:hover:bg-slate-850 text-indigo-600 dark:text-indigo-400 cursor-pointer"
                                          title={isRtl ? 'تعديل الفرع' : 'Edit Branch'}
                                        >
                                          <Edit size={12} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteStation(stn.id)}
                                          className="p-1 rounded hover:bg-rose-50 dark:hover:bg-slate-850 text-rose-500 hover:text-rose-600 cursor-pointer"
                                          title={isRtl ? 'حذف الفرع' : 'Delete Branch'}
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Station credentials */}
                                    <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                                      <div>
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-450 dark:text-slate-500">
                                          <KeyRound size={10} />
                                          <span>{isRtl ? 'حساب مسؤول الفرع (المحطة)' : 'Branch Manager Account'}</span>
                                        </div>
                                        {users.find(u => u.station_id === stn.id && u.role === 'StationAdmin')?.email ? (
                                          <div className="text-[10px] text-slate-600 dark:text-slate-300 font-mono mt-1">
                                            <span className="font-bold text-slate-400 mr-1">{isRtl ? 'البريد:' : 'Email:'}</span>
                                            {users.find(u => u.station_id === stn.id && u.role === 'StationAdmin')?.email}
                                          </div>
                                        ) : (
                                          <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 italic">
                                            {isRtl ? 'لم يتم تعيين مسؤول للفرع' : 'No Branch Manager assigned'}
                                          </div>
                                        )}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          window.dispatchEvent(new CustomEvent('navigate_tab', { 
                                            detail: { tab: 'settings', settingsTab: 'permissions', selectedCompanyId: comp.id } 
                                          }));
                                        }}
                                        className="px-2 py-0.5 rounded-lg bg-indigo-600/10 hover:bg-indigo-600 text-indigo-600 hover:text-white dark:text-indigo-400 dark:hover:text-white text-[9px] font-bold transition-all shrink-0 cursor-pointer"
                                      >
                                        {isRtl ? 'إدارة الوصول' : 'Manage Access'}
                                      </button>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}

                    {/* Direct Stations */}
                    {directStns.length > 0 && (
                      <div className="space-y-3 mt-4 pt-4 border-t border-dashed border-slate-150 dark:border-slate-800">
                        <div className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2">
                          {isRtl ? '🔗 فروع مباشرة تحت الشركة الأم' : '🔗 Direct Corporate Branches'}
                        </div>
                        {directStns.map(stn => (
                          <div 
                            key={stn.id}
                            className="p-3 rounded-xl border border-slate-100 dark:border-slate-850 bg-white dark:bg-slate-900/30 hover:border-slate-200 flex flex-col gap-2 max-w-xl"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <div className={`h-1.5 w-1.5 rounded-full ${stn.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                <div>
                                  <div className="font-bold text-[11px] text-slate-700 dark:text-slate-200">
                                    {stn.station_name}
                                  </div>
                                  <div className="text-[9px] text-slate-450 font-mono">
                                    Code: {stn.station_code} | {isRtl ? 'العهدة:' : 'Custody:'} {CustodyDB.getStationDeductedCustody(stn.id).toLocaleString()} EGP
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => startEditStation(stn)}
                                  className="p-1 rounded hover:bg-indigo-50 dark:hover:bg-slate-850 text-indigo-600 dark:text-indigo-400 cursor-pointer"
                                  title={isRtl ? 'تعديل الفرع' : 'Edit Branch'}
                                >
                                  <Edit size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteStation(stn.id)}
                                  className="p-1 rounded hover:bg-rose-50 dark:hover:bg-slate-850 text-rose-500 hover:text-rose-600 cursor-pointer"
                                  title={isRtl ? 'حذف الفرع' : 'Delete Branch'}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>

                            {/* Station credentials */}
                            <div className="p-2 rounded bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-450 dark:text-slate-500">
                                  <KeyRound size={10} />
                                  <span>{isRtl ? 'حساب مسؤول الفرع (المحطة)' : 'Branch Manager Account'}</span>
                                </div>
                                {users.find(u => u.station_id === stn.id && u.role === 'StationAdmin')?.email ? (
                                  <div className="text-[10px] text-slate-600 dark:text-slate-300 font-mono mt-1">
                                    <span className="font-bold text-slate-400 mr-1">{isRtl ? 'البريد:' : 'Email:'}</span>
                                    {users.find(u => u.station_id === stn.id && u.role === 'StationAdmin')?.email}
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 italic">
                                    {isRtl ? 'لم يتم تعيين مسؤول للفرع' : 'No Branch Manager assigned'}
                                  </div>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  window.dispatchEvent(new CustomEvent('navigate_tab', { 
                                    detail: { tab: 'settings', settingsTab: 'permissions', selectedCompanyId: comp.id } 
                                  }));
                                }}
                                className="px-2 py-0.5 rounded-lg bg-indigo-600/10 hover:bg-indigo-600 text-indigo-600 hover:text-white dark:text-indigo-400 dark:hover:text-white text-[9px] font-bold transition-all shrink-0 cursor-pointer"
                              >
                                {isRtl ? 'إدارة الوصول' : 'Manage Access'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          {/* Directory Search & Filters Bar */}
          <div className={`p-4 rounded-xl border flex flex-col md:flex-row gap-4 items-center justify-between ${
            theme === 'dark' ? 'bg-[#1e293b]/40 border-[#334155]' : 'bg-white border-slate-200'
          }`}>
            <div className="relative w-full md:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder={isRtl ? 'البحث باسم المحطة أو الكود...' : 'Search station name or code...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-9 pr-4 py-2 text-sm rounded-lg border outline-none transition-all ${
                  theme === 'dark' 
                    ? 'bg-slate-800 border-slate-700 text-slate-100 focus:border-emerald-500' 
                    : 'bg-white border-slate-200 text-slate-800 focus:border-emerald-500'
                }`}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
              {/* Company Switcher for Administrators */}
              {isSystemAdmin && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-400 font-bold">{isRtl ? 'شركة العرض:' : 'Viewing Company:'}</span>
                  <select
                    value={selectedCompanyId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedCompanyId(id);
                      CustodyDB.setSelectedCompanyId(id);
                      // Auto select first region of new company
                      const compRegs = regions.filter(r => r.company_id === id);
                      setSelectedRegionId(compRegs[0]?.id || 'all');
                    }}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg border bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700 focus:outline-none"
                  >
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Region Switcher */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-400 font-bold">{isRtl ? 'تصفية المنطقة:' : 'Filter Region:'}</span>
                <select
                  value={selectedRegionId}
                  onChange={(e) => setSelectedRegionId(e.target.value)}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg border bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700 focus:outline-none"
                >
                  <option value="all">{isRtl ? 'عرض الكل (جميع الفروع)' : 'Show All Branches'}</option>
                  <option value="none">{isRtl ? 'فروع مباشرة (بدون منطقة)' : 'Direct Branches (No Region)'}</option>
                  {companyRegions.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg">
                <Layers size={14} className="text-emerald-500" />
                <span>
                  {isRtl 
                    ? `تم العثور على: ${filteredStations.length} فرع / محطة`
                    : `Found ${filteredStations.length} branch(es)`
                  }
                </span>
              </div>
            </div>
          </div>

          {/* Grid of Stations Cards (Desktop Layout & Responsive Board) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="stations-cards-grid">
            {filteredStations.map((station) => {
              const sMetrics = CustodyDB.getReconciliation(station.id);
              const stationTxs = allTransactions.filter(t => t.station_id === station.id);
              
              let lastActivityDate = isRtl ? 'لا توجد عمليات بعد' : 'No recent operations';
              if (stationTxs.length > 0) {
                const sorted = [...stationTxs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                lastActivityDate = sorted[0].date;
              }

              const percentAvailable = (sMetrics.cashAvailable / (sMetrics.custodyValue || 1)) * 100;

              return (
                <div 
                  key={station.id} 
                  className={`rounded-2xl border overflow-hidden shadow-sm hover:shadow-md transition-all group ${
                    theme === 'dark' ? 'bg-[#1e293b]/50 border-[#334155]' : 'bg-white border-slate-200'
                  }`}
                >
                  {/* Card Header Banner */}
                  <div className="p-5 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/20">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-500/10 text-indigo-600 rounded-xl group-hover:scale-105 transition-transform">
                          <Building size={18} />
                        </div>
                        <div>
                          <h3 className="font-bold text-base text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {station.station_name}
                          </h3>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-mono tracking-wider text-slate-400 font-semibold uppercase">
                              {station.station_code}
                            </span>
                            {station.region_id ? (
                              <span className="text-[9px] px-1.5 py-0.2 bg-slate-200 dark:bg-slate-800 text-slate-500 font-bold rounded">
                                {regions.find(r => r.id === station.region_id)?.name}
                              </span>
                            ) : (
                              <span className="text-[9px] px-1.5 py-0.2 bg-amber-500/15 text-amber-600 font-bold rounded">
                                {isRtl ? 'فرع مباشر' : 'Direct'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        station.is_active 
                          ? 'bg-emerald-500/10 text-emerald-500' 
                          : 'bg-rose-500/10 text-rose-500'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${station.is_active ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        {station.is_active ? t.active : t.inactive}
                      </span>
                    </div>
                  </div>

                  {/* Card Body Metrics */}
                  <div className="p-5 space-y-4">
                    {/* Available Liquid Cash Progress Bar */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400 font-medium">{t.cashAvailable}</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                          {percentAvailable.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            percentAvailable < 20 
                              ? 'bg-rose-500' 
                              : percentAvailable < 50 
                                ? 'bg-amber-500' 
                                : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(0, percentAvailable))}%` }}
                        />
                      </div>
                    </div>

                    {/* Grid values */}
                    <div className="grid grid-cols-2 gap-3 text-xs border-y py-3 border-slate-100 dark:border-slate-800/80">
                      <div>
                        <p className="text-slate-400 mb-0.5">{t.totalCustody}</p>
                        <p className="font-bold font-mono text-slate-800 dark:text-slate-200">
                          {sMetrics.custodyValue.toLocaleString()} EGP
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400 mb-0.5">{t.cashAvailable}</p>
                        <p className="font-bold font-mono text-emerald-500">
                          {sMetrics.cashAvailable.toLocaleString()} EGP
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400 mb-0.5">{t.totalPending}</p>
                        <p className="font-bold font-mono text-amber-500">
                          {sMetrics.pendingTotal.toLocaleString()} EGP
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-400 mb-0.5">{t.totalUnderSettlement}</p>
                        <p className="font-bold font-mono text-indigo-500">
                          {sMetrics.underSettlementTotal.toLocaleString()} EGP
                        </p>
                      </div>
                    </div>

                    {/* Extra Stats */}
                    <div className="flex justify-between items-center text-[11px] text-slate-400 font-semibold font-mono">
                      <div className="flex items-center gap-1">
                        <Clock size={12} />
                        <span>{stationTxs.length} {isRtl ? 'حركات مسجلة' : 'records logged'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar size={12} />
                        <span>{lastActivityDate}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card CTA Actions footer */}
                  <div className="p-3 bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    {canRecharge && (
                      <button
                        onClick={() => setRechargingStation(station)}
                        className="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-bold text-amber-600 hover:text-white bg-amber-50 hover:bg-amber-600 dark:bg-amber-500/10 dark:hover:bg-amber-600 rounded-lg transition-all"
                      >
                        <Coins size={13} />
                        <span>{isRtl ? 'استعاضة عهدة' : 'Replenish'}</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleViewStation(station.id)}
                      className="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-bold text-indigo-600 hover:text-white bg-indigo-50 hover:bg-indigo-600 dark:bg-indigo-500/10 dark:hover:bg-indigo-600 rounded-lg transition-all"
                    >
                      <span>{t.viewDashboard}</span>
                      {isRtl ? <ArrowLeft size={13} /> : <ArrowRight size={13} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {/* RECHARGE / CUSTODY REPLENISHMENT MODAL */}
      {rechargingStation && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`w-full max-w-md p-6 rounded-2xl border shadow-xl animate-fade-in ${
            theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200'
          }`}>
            <div className="flex justify-between items-center mb-4 border-b pb-2 border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Coins className="text-amber-500 animate-pulse" size={18} />
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                  {isRtl ? `شحن واستعاضة العهدة للمحطة: ${rechargingStation.station_name}` : `Replenish/Recharge Station Custody Balance`}
                </h3>
              </div>
              <button 
                onClick={() => setRechargingStation(null)}
                className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleRechargeSubmit} className="space-y-4">
              <div className={`p-4 rounded-xl text-xs space-y-1.5 ${
                theme === 'dark' ? 'bg-slate-850' : 'bg-slate-50'
              }`}>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">{isRtl ? 'العهدة الحالية:' : 'Current Custody Limit:'}</span>
                  <span className="font-mono font-bold">{CustodyDB.getReconciliation(rechargingStation.id).custodyValue.toLocaleString()} EGP</span>
                </div>
                <div className="flex justify-between border-t pt-1.5">
                  <span className="text-slate-400 font-bold">{isRtl ? 'السيولة المتوفرة بالخزنة:' : 'Current Cash Safe Liquid:'}</span>
                  <span className="font-mono font-bold text-emerald-500">
                    {CustodyDB.getReconciliation(rechargingStation.id).cashAvailable.toLocaleString()} EGP
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  {isRtl ? 'مبلغ الاستعاضة المراد إضافته (ج.م) *' : 'Replenishment Amount (EGP) *'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={rechargeAmount}
                  onChange={(e) => setRechargeAmount(e.target.value)}
                  placeholder={isRtl ? 'أدخل مبلغ الإضافة...' : 'e.g., 25000'}
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  {isRtl ? 'ملاحظات / مستندات شحن العهدة' : 'Recharge Documentation/Notes'}
                </label>
                <input
                  type="text"
                  value={rechargeNotes}
                  onChange={(e) => setRechargeNotes(e.target.value)}
                  placeholder={isRtl ? 'رقم شيك التغذية، السند المصرفي المرفق...' : 'Check number, bank transfer ID...'}
                  className={`w-full px-4 py-2.5 rounded-xl border text-xs focus:outline-none ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200'
                  }`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setRechargingStation(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1"
                >
                  <Coins size={13} />
                  <span>{isRtl ? 'تأكيد شحن واستعاضة الرصيد' : 'Confirm Replenishment'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
