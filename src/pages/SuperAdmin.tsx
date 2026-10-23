import React, { useState, useMemo, useEffect } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { CustodyDB, ModulesModule, ERP_MODULES_REGISTRY, CompanyModuleSettings } from '../db';
import { useScreenListeners, auth } from '../firebase';
import { Company, AppUser, Language, Theme, AuditLog, Region, Station, UserPermissions, Transaction, TransactionStatus, ActivityLog, DeletedTransaction, SignupRequest } from '../types';
import { createManagedUser, updateManagedUser } from '../lib/userProvisioning';
import { 
  Building2, ShieldCheck, KeyRound, UserCheck, RefreshCw, AlertTriangle, 
  Plus, Calendar, Sparkles, User, LogOut, ClipboardList, Info, Check, Search, ShieldAlert,
  Globe, Laptop, FileText, CheckCircle2, XCircle, Network, X, Settings, Trash2, Edit,
  PlusCircle, Building, Layers, Power, Activity, RotateCcw, Lock, Download, Upload, ArrowUpDown, Sliders
} from 'lucide-react';
import SuperAdminImpersonateTab from '../components/SuperAdminImpersonateTab';
import SuperAdminAuditTab from '../components/SuperAdminAuditTab';
import SuperAdminSecurityTab from '../components/SuperAdminSecurityTab';
import SuperAdminOperationsTab from '../components/SuperAdminOperationsTab';
import SuperAdminCompaniesTab from '../components/SuperAdminCompaniesTab';

interface SuperAdminProps {
  language: Language;
  theme: Theme;
  initialSubTab?: 'companies' | 'operations' | 'impersonate' | 'audit' | 'security';
  embedded?: boolean;
  onNavigate?: (tab: string) => void;
}


export default function SuperAdmin({ language, theme, initialSubTab, embedded = false, onNavigate }: SuperAdminProps) {
  useScreenListeners(['AuditLogs', 'logs', 'transactions', 'deleted_transactions', 'signup_requests']);

  const isRtl = language === 'ar';
  
  // State
  const [companies, setCompanies] = useState<Company[]>(() => CustodyDB.getCompanies());
  const [users, setUsers] = useState<AppUser[]>(() => CustodyDB.getUsers());
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => CustodyDB.getAuditLogs());
  const [activeSubTab, setActiveSubTab] = useState<'companies' | 'operations' | 'impersonate' | 'audit' | 'security'>(initialSubTab || 'companies');

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // Company Table Sorting State
  const [sortField, setSortField] = useState<'name' | 'status' | 'userCount' | 'expiry'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: 'name' | 'status' | 'userCount' | 'expiry') => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleRefreshData = () => {
    setCompanies(CustodyDB.getCompanies());
    setUsers(CustodyDB.getUsers());
    setAuditLogs(CustodyDB.getAuditLogs());
    setRegions(CustodyDB.getRegions());
    setStations(CustodyDB.getStations());
  };

  useEffect(() => {
    handleRefreshData();
    const handleUpdate = () => handleRefreshData();
    window.addEventListener('custody_db_updated', handleUpdate);
    return () => {
      window.removeEventListener('custody_db_updated', handleUpdate);
    };
  }, []);

  // Search/Filters state
  const [companySearch, setCompanySearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [supportUserSearch, setSupportUserSearch] = useState('');
  
  // Create Company state
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyCustody, setNewCompanyCustody] = useState<number>(0);
  const [showCreateCompanyModal, setShowCreateCompanyModal] = useState(false);
  const [isSeedingData, setIsSeedingData] = useState(false);

  // Edit Subscription state
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [subPlan, setSubPlan] = useState<Company['subscription_plan']>('Basic');
  const [subStatus, setSubStatus] = useState<Company['subscription_status']>('active');
  const [subExpiry, setSubExpiry] = useState('');
  const [activeModalTab, setActiveModalTab] = useState<'subscription' | 'modules'>('subscription');
  const [companyModules, setCompanyModules] = useState<Record<string, any>>({});
  const [copySourceCompanyId, setCopySourceCompanyId] = useState<string>('');

  // Password reset state
  const [selectedUserForReset, setSelectedUserForReset] = useState<AppUser | null>(null);
  const [newPlainPassword, setNewPlainPassword] = useState('');
  const [resetSuccessMessage, setResetSuccessMessage] = useState('');

  // Impersonation state
  const [impersonateReason, setImpersonateReason] = useState('');
  const [impersonateTargetUserId, setImpersonateTargetUserId] = useState('');
  const [impersonateError, setImpersonateError] = useState('');

  // States for Structure Builder inside SaaS Companies Sub-Tab
  const [isStructureOpen, setIsStructureOpen] = useState(true);
  const [structureView, setStructureView] = useState<'tree' | 'tables'>('tree');
  const [structureTab, setStructureTab] = useState<'companies' | 'regions' | 'stations'>('companies');
  
  const [regions, setRegions] = useState<Region[]>(() => CustodyDB.getRegions());
  const [stations, setStations] = useState<Station[]>(() => CustodyDB.getStations());
  const [structSelectedCompanyId, setStructSelectedCompanyId] = useState<string>(() => companies[0]?.id || '');
  const [structSelectedRegionId, setStructSelectedRegionId] = useState<string>('all');

  // Modals for structure builder
  const [showStructCompanyModal, setShowStructCompanyModal] = useState(false);
  const [showStructRegionModal, setShowStructRegionModal] = useState(false);
  const [showStructStationModal, setShowStructStationModal] = useState(false);
  const [createdCredentialsModal, setCreatedCredentialsModal] = useState<{ email: string; password: string; role: string; name: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Form states
  const [structCompName, setStructCompName] = useState('');
  const [structEditingCompany, setStructEditingCompany] = useState<Company | null>(null);

  const [structRegName, setStructRegName] = useState('');
  const [structRegCompanyId, setStructRegCompanyId] = useState('');
  const [structEditingRegion, setStructEditingRegion] = useState<Region | null>(null);

  const [structStnName, setStructStnName] = useState('');
  const [structStnCode, setStructStnCode] = useState('');
  const [structStnCustody, setStructStnCustody] = useState('');
  const [structStnRegionId, setStructStnRegionId] = useState('');
  const [structEditingStation, setStructEditingStation] = useState<Station | null>(null);

  const [structToastMsg, setStructToastMsg] = useState('');
  const showStructToast = (msg: string) => {
    setStructToastMsg(msg);
    setTimeout(() => setStructToastMsg(''), 3000);
  };

  // Handlers for Company Structure Builder
  const handleStructAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!structCompName.trim()) return;

    if (structEditingCompany) {
      await CustodyDB.updateCompany(structEditingCompany.id, {
        name: structCompName.trim()
      });
      showStructToast(isRtl ? 'تم تحديث الشركة بنجاح' : 'Company updated successfully');
      setStructEditingCompany(null);
    } else {
      const created = await CustodyDB.addCompany(structCompName.trim(), newCompanyCustody);
      if (created) {
        await CustodyDB.updateCompanySubscription(created.id, 'Basic', 'active', new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
      }
      showStructToast(isRtl ? 'تم إضافة وتفعيل الشركة بنجاح' : 'Company added and activated successfully');
    }
    setStructCompName('');
    setNewCompanyCustody(0);
    setShowStructCompanyModal(false);
    handleRefreshData();
  };

  const startStructAddCompany = () => {
    setStructEditingCompany(null);
    setStructCompName('');
    setNewCompanyCustody(0);
    setShowStructCompanyModal(true);
  };

  const startStructEditCompany = (c: Company) => {
    setStructEditingCompany(c);
    setStructCompName(c.name);
    setShowStructCompanyModal(true);
  };

  const handleStructDeleteCompany = async (id: string) => {
    const connectedRegions = regions.filter(r => r.company_id === id);
    const connectedStations = stations.filter(s => s.company_id === id);

    const confirmMsg = isRtl
      ? `هل تريد بالتأكيد حذف هذه الشركة نهائياً؟\nسيتم حذف الشركة وكافة فروعها (${connectedStations.length}) وقطاعاتها (${connectedRegions.length}) وجميع حسابات المستخدمين التابعين لها بدون رجعة.`
      : `Are you sure you want to permanently delete this company?\nThis will delete the company, its ${connectedStations.length} branches, ${connectedRegions.length} regions, and all associated user accounts permanently.`;

    if (confirm(confirmMsg)) {
      try {
        showStructToast(isRtl ? 'جاري حذف الشركة وكافة توابعها...' : 'Deleting company and all assets...');
        const res = await CustodyDB.deleteCompany(id);
        if (!res.success) {
          alert(isRtl ? `خطأ أثناء حذف الشركة: ${res.error || 'فشلت العملية'}` : `Error deleting company: ${res.error || 'Operation failed'}`);
          return;
        }
        showStructToast(isRtl ? 'تم حذف الشركة وكافة بياناتها ومستخدميها نهائياً' : 'Company and all associated users deleted permanently');
        handleRefreshData();
      } catch (err: any) {
        alert(isRtl ? `خطأ أثناء حذف الشركة: ${err.message}` : `Error deleting company: ${err.message}`);
      }
    }
  };

  // Region Handlers
  const handleStructAddRegion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!structRegName.trim() || !structRegCompanyId) return;

    if (structEditingRegion) {
      CustodyDB.updateRegion(structEditingRegion.id, {
        name: structRegName.trim(),
        company_id: structRegCompanyId
      });
      showStructToast(isRtl ? 'تم تحديث الإقليم بنجاح' : 'Region updated successfully');
      setStructEditingRegion(null);
    } else {
      CustodyDB.addRegion(structRegName.trim(), '', structRegCompanyId);
      showStructToast(isRtl ? 'تم إضافة الإقليم بنجاح' : 'Region added successfully');
    }
    setStructRegName('');
    setShowStructRegionModal(false);
    handleRefreshData();
  };

  const startStructAddRegionForCompany = (companyId: string) => {
    setStructEditingRegion(null);
    setStructRegName('');
    setStructRegCompanyId(companyId);
    setShowStructRegionModal(true);
  };

  const startStructEditRegion = (r: Region) => {
    setStructEditingRegion(r);
    setStructRegName(r.name);
    setStructRegCompanyId(r.company_id || structSelectedCompanyId);
    setShowStructRegionModal(true);
  };

  const handleStructDeleteRegion = (id: string) => {
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
      showStructToast(isRtl ? 'تم حذف الإقليم بنجاح' : 'Region deleted successfully');
      handleRefreshData();
    }
  };

  // Station Handlers
  const handleStructAddStation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!structStnName.trim() || !structStnCode.trim() || !structStnCustody) return;
    const val = parseFloat(structStnCustody);
    if (isNaN(val) || val <= 0) return;

    const rId = structStnRegionId === 'none' || !structStnRegionId ? undefined : structStnRegionId;

    if (structEditingStation) {
      CustodyDB.updateStation(structEditingStation.id, {
        station_name: structStnName.trim(),
        station_code: structStnCode.toUpperCase().trim(),
        custody_amount: val,
        region_id: rId
      });
      showStructToast(isRtl ? 'تم تحديث المحطة بنجاح' : 'Station/Branch updated successfully');
      setStructEditingStation(null);
    } else {
      let targetCompanyId = structSelectedCompanyId;
      if (rId) {
        const reg = regions.find(r => r.id === rId);
        if (reg && reg.company_id) {
          targetCompanyId = reg.company_id;
        }
      }
      CustodyDB.addStation(structStnName.trim(), structStnCode.toUpperCase().trim(), val, rId, targetCompanyId);
      showStructToast(isRtl ? 'تم إضافة المحطة بنجاح' : 'Station/Branch added successfully');
    }
    setStructStnName('');
    setStructStnCode('');
    setStructStnCustody('');
    setStructStnRegionId('');
    setShowStructStationModal(false);
    handleRefreshData();
  };

  const startStructAddStationForRegion = (regionId: string, companyId?: string) => {
    setStructEditingStation(null);
    setStructStnName('');
    setStructStnCode('');
    setStructStnCustody('');
    setStructStnRegionId(regionId);
    if (companyId) {
      setStructSelectedCompanyId(companyId);
    }
    setShowStructStationModal(true);
  };

  const startStructAddStationDirectForCompany = (companyId: string) => {
    setStructEditingStation(null);
    setStructStnName('');
    setStructStnCode('');
    setStructStnCustody('');
    setStructStnRegionId('none');
    setStructSelectedCompanyId(companyId);
    setShowStructStationModal(true);
  };

  const startStructEditStation = (s: Station) => {
    setStructEditingStation(s);
    setStructStnName(s.station_name);
    setStructStnCode(s.station_code);
    setStructStnCustody(String(s.custody_amount));
    setStructStnRegionId(s.region_id || 'none');
    setShowStructStationModal(true);
  };

  const handleStructDeleteStation = (id: string) => {
    if (confirm(isRtl ? 'هل تريد حذف هذا الفرع/المحطة بالتأكيد؟' : 'Are you sure you want to delete this station?')) {
      CustodyDB.deleteStation(id);
      showStructToast(isRtl ? 'تم حذف الفرع بنجاح' : 'Station deleted successfully');
      handleRefreshData();
    }
  };

  const handleSaveCompanyAdmin = async (companyId: string, email: string, pass: string, permissions?: UserPermissions) => {
    if (!email || !email.trim()) return;
    const cleanEmail = email.trim().toLowerCase();
    const usersList = CustodyDB.getUsers();
    const existingAdmin = usersList.find(u => u.company_id === companyId && u.role === 'Admin');

    if (existingAdmin) {
      const payload: any = {
        email: cleanEmail,
        company_id: companyId,
        role: 'Admin',
        is_active: true,
        permissions: permissions ? { ...existingAdmin.permissions, ...permissions } : existingAdmin.permissions
      };
      if (pass && pass.trim()) {
        payload.password = pass.trim();
      }

      try {
        const data = await updateManagedUser(existingAdmin.id, payload);
        if (!data.success) {
          alert(`⚠️ ${data.message || (isRtl ? 'فشل تحديث بيانات أدمن الشركة' : 'Failed to update Company Admin')}`);
          return;
        }

        if (data.user) {
          const updatedUsers = usersList.map(u => u.id === existingAdmin.id ? { ...u, ...data.user } : u);
          await CustodyDB.saveUsers(updatedUsers);
        }
        showStructToast(isRtl ? 'تم تحديث بيانات أدمن الشركة بنجاح!' : 'Company Admin credentials updated successfully!');
        handleRefreshData();
      } catch (err: any) {
        alert(isRtl ? `⚠️ خطأ في الاتصال بالخادم: ${err.message}` : `⚠️ Server connection error: ${err.message}`);
      }
    } else {
      const payload: any = {
        email: cleanEmail,
        full_name: isRtl ? 'أدمن الشركة' : 'Company Admin',
        role: 'Admin',
        company_id: companyId,
        region_id: null,
        station_id: null,
        permissions: permissions || CustodyDB.enrichUserPermissions('Admin'),
        must_change_password: true
      };
      if (pass && pass.trim()) {
        payload.password = pass.trim();
      }

      try {
        const data = await createManagedUser(payload);
        if (!data.success) {
          alert(`⚠️ ${data.message || (isRtl ? 'فشل إنشاء حساب أدمن الشركة' : 'Failed to create Company Admin')}`);
          return;
        }

        if (data.user) {
          const allUsers = CustodyDB.getUsers();
          const existingIdx = allUsers.findIndex(u => u.id === data.user!.id);
          if (existingIdx >= 0) {
            allUsers[existingIdx] = data.user!;
          } else {
            allUsers.push(data.user!);
          }
          await CustodyDB.saveUsers(allUsers);
        }

        const effectivePass = data.temporaryPassword || (pass && pass.trim()) || '';
        setCreatedCredentialsModal({
          email: cleanEmail,
          password: effectivePass,
          role: isRtl ? 'أدمن شركة' : 'Company Admin',
          name: isRtl ? 'أدمن شركة' : 'Company Admin'
        });

        showStructToast(isRtl ? 'تم إنشاء حساب أدمن الشركة بنجاح!' : 'Company Admin created successfully!');
        handleRefreshData();
      } catch (err: any) {
        alert(isRtl ? `⚠️ خطأ في الاتصال بالخادم: ${err.message}` : `⚠️ Server connection error: ${err.message}`);
      }
    }
  };

  const handleSaveRegionalManager = async (regionId: string, companyId: string, email: string, pass: string, permissions?: UserPermissions) => {
    if (!email || !email.trim()) return;
    const cleanEmail = email.trim().toLowerCase();
    const usersList = CustodyDB.getUsers();
    const existingManager = usersList.find(u => u.region_id === regionId && u.role === 'RegionalManager');

    if (existingManager) {
      const payload: any = {
        email: cleanEmail,
        company_id: companyId,
        region_id: regionId,
        role: 'RegionalManager',
        is_active: true,
        permissions: permissions ? { ...existingManager.permissions, ...permissions } : existingManager.permissions
      };
      if (pass && pass.trim()) {
        payload.password = pass.trim();
      }

      try {
        const data = await updateManagedUser(existingManager.id, payload);
        if (!data.success) {
          alert(`⚠️ ${data.message || (isRtl ? 'فشل تحديث بيانات مدير القطاع' : 'Failed to update Regional Manager')}`);
          return;
        }

        if (data.user) {
          const updatedUsers = usersList.map(u => u.id === existingManager.id ? { ...u, ...data.user } : u);
          await CustodyDB.saveUsers(updatedUsers);
        }
        showStructToast(isRtl ? 'تم تحديث بيانات مدير القطاع بنجاح!' : 'Regional Manager credentials updated successfully!');
        handleRefreshData();
      } catch (err: any) {
        alert(isRtl ? `⚠️ خطأ في الاتصال بالخادم: ${err.message}` : `⚠️ Server connection error: ${err.message}`);
      }
    } else {
      const payload: any = {
        email: cleanEmail,
        full_name: isRtl ? 'مدير قطاع' : 'Regional Manager',
        role: 'RegionalManager',
        company_id: companyId,
        region_id: regionId,
        station_id: null,
        permissions: permissions || CustodyDB.enrichUserPermissions('RegionalManager'),
        must_change_password: true
      };
      if (pass && pass.trim()) {
        payload.password = pass.trim();
      }

      try {
        const data = await createManagedUser(payload);
        if (!data.success) {
          alert(`⚠️ ${data.message || (isRtl ? 'فشل إنشاء حساب مدير القطاع' : 'Failed to create Regional Manager')}`);
          return;
        }

        if (data.user) {
          const allUsers = CustodyDB.getUsers();
          const existingIdx = allUsers.findIndex(u => u.id === data.user!.id);
          if (existingIdx >= 0) {
            allUsers[existingIdx] = data.user!;
          } else {
            allUsers.push(data.user!);
          }
          await CustodyDB.saveUsers(allUsers);
        }

        const effectivePass = data.temporaryPassword || (pass && pass.trim()) || '';
        setCreatedCredentialsModal({
          email: cleanEmail,
          password: effectivePass,
          role: isRtl ? 'مدير قطاع' : 'Regional Manager',
          name: isRtl ? 'مدير قطاع' : 'Regional Manager'
        });

        showStructToast(isRtl ? 'تم إنشاء حساب مدير القطاع بنجاح!' : 'Regional Manager created successfully!');
        handleRefreshData();
      } catch (err: any) {
        alert(isRtl ? `⚠️ خطأ في الاتصال بالخادم: ${err.message}` : `⚠️ Server connection error: ${err.message}`);
      }
    }
  };

  const handleSaveStationAdmin = async (stationId: string, regionId: string | undefined, companyId: string, email: string, pass: string, permissions?: UserPermissions) => {
    if (!email || !email.trim()) return;
    const cleanEmail = email.trim().toLowerCase();
    const usersList = CustodyDB.getUsers();
    const existingAdmin = usersList.find(u => u.station_id === stationId && u.role === 'StationAdmin');

    if (existingAdmin) {
      const payload: any = {
        email: cleanEmail,
        company_id: companyId,
        region_id: regionId || null,
        station_id: stationId,
        role: 'StationAdmin',
        is_active: true,
        permissions: permissions ? { ...existingAdmin.permissions, ...permissions } : existingAdmin.permissions
      };
      if (pass && pass.trim()) {
        payload.password = pass.trim();
      }

      try {
        const data = await updateManagedUser(existingAdmin.id, payload);
        if (!data.success) {
          alert(`⚠️ ${data.message || (isRtl ? 'فشل تحديث بيانات مسؤول الفرع' : 'Failed to update Station Admin')}`);
          return;
        }

        if (data.user) {
          const updatedUsers = usersList.map(u => u.id === existingAdmin.id ? { ...u, ...data.user } : u);
          await CustodyDB.saveUsers(updatedUsers);
        }
        showStructToast(isRtl ? 'تم تحديث بيانات مسؤول الفرع بنجاح!' : 'Station Admin credentials updated successfully!');
        handleRefreshData();
      } catch (err: any) {
        alert(isRtl ? `⚠️ خطأ في الاتصال بالخادم: ${err.message}` : `⚠️ Server connection error: ${err.message}`);
      }
    } else {
      const payload: any = {
        email: cleanEmail,
        full_name: isRtl ? 'مسؤول فرع' : 'Branch Administrator',
        role: 'StationAdmin',
        company_id: companyId,
        region_id: regionId || null,
        station_id: stationId,
        permissions: permissions || CustodyDB.enrichUserPermissions('StationAdmin'),
        must_change_password: true
      };
      if (pass && pass.trim()) {
        payload.password = pass.trim();
      }

      try {
        const data = await createManagedUser(payload);
        if (!data.success) {
          alert(`⚠️ ${data.message || (isRtl ? 'فشل إنشاء حساب مسؤول الفرع' : 'Failed to create Station Admin')}`);
          return;
        }

        if (data.user) {
          const allUsers = CustodyDB.getUsers();
          const existingIdx = allUsers.findIndex(u => u.id === data.user!.id);
          if (existingIdx >= 0) {
            allUsers[existingIdx] = data.user!;
          } else {
            allUsers.push(data.user!);
          }
          await CustodyDB.saveUsers(allUsers);
        }

        const effectivePass = data.temporaryPassword || (pass && pass.trim()) || '';
        setCreatedCredentialsModal({
          email: cleanEmail,
          password: effectivePass,
          role: isRtl ? 'مسؤول فرع' : 'Station Admin',
          name: isRtl ? 'مسؤول فرع' : 'Station Admin'
        });

        showStructToast(isRtl ? 'تم إنشاء حساب مسؤول الفرع بنجاح!' : 'Station Admin created successfully!');
        handleRefreshData();
      } catch (err: any) {
        alert(isRtl ? `⚠️ خطأ في الاتصال بالخادم: ${err.message}` : `⚠️ Server connection error: ${err.message}`);
      }
    }
  };


  // 1. Create New Company
  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName.trim()) return;
    
    const created = await CustodyDB.addCompany(newCompanyName.trim(), newCompanyCustody);
    
    // Automatically set default subscription properties
    if (created) {
      await CustodyDB.updateCompanySubscription(created.id, 'Basic', 'active', new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    }
    
    setNewCompanyName('');
    setNewCompanyCustody(0);
    setShowCreateCompanyModal(false);
    handleRefreshData();
  };

  // 2. Toggle Activation Status
  const handleToggleCompanyActive = (companyId: string, currentStatus: boolean) => {
    CustodyDB.toggleCompanyStatus(companyId, !currentStatus);
    handleRefreshData();
  };

  // 3. Save Subscription Plan/Expiry
  const handleSaveSubscription = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompany) return;
    
    CustodyDB.updateCompanySubscription(editingCompany.id, subPlan, subStatus, subExpiry);
    ModulesModule.saveCompanyModules(editingCompany.id, companyModules);
    setEditingCompany(null);
    handleRefreshData();
  };

  // 4. Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForReset || !newPlainPassword.trim()) return;

    if (newPlainPassword.trim().length < 12) {
      alert(isRtl ? '⚠️ كلمة المرور يجب أن لا تقل عن 12 حرفاً وتحتوي على حروف وأرقام.' : '⚠️ Password must be at least 12 characters and contain letters and numbers.');
      return;
    }

    try {
      const data = await updateManagedUser(selectedUserForReset.id, {
        password: newPlainPassword.trim()
      });
      if (!data.success) {
        alert(`⚠️ ${data.message || (isRtl ? 'فشل إعادة تعيين كلمة المرور' : 'Failed to reset password')}`);
        return;
      }

      setResetSuccessMessage(isRtl ? `🎉 تم تعيين كلمة المرور بنجاح للمدير: ${selectedUserForReset.full_name}` : `🎉 Password successfully reset for: ${selectedUserForReset.full_name}`);
      setNewPlainPassword('');
      setTimeout(() => {
        setResetSuccessMessage('');
        setSelectedUserForReset(null);
      }, 3000);
      handleRefreshData();
    } catch (err: any) {
      alert(isRtl ? `⚠️ خطأ في إعادة تعيين كلمة المرور: ${err.message}` : `⚠️ Password reset error: ${err.message}`);
    }
  };

  // 5. Impersonate support login
  const handleStartImpersonation = (targetUser: AppUser) => {
    if (!targetUser) return;
    
    try {
      CustodyDB.impersonateUser(targetUser, impersonateReason.trim());
      // Refresh the page session
      window.location.reload();
    } catch (err: any) {
      setImpersonateError(err.message);
    }
  };

  const handleApproveSignupRequest = async (req: SignupRequest) => {
    try {
      const emailLower = (req.email || '').toLowerCase().trim();
      if (!emailLower) {
        alert(isRtl ? 'البريد الإلكتروني غير صالح في الطلب.' : 'Invalid email on signup request.');
        return;
      }

      // Prevent duplicate approval if user already exists
      const existingUsers = CustodyDB.getUsers();
      const already = existingUsers.find(u => (u.email || '').toLowerCase().trim() === emailLower);
      if (already) {
        // Still force-delete the request so it does not reappear after reload
        await CustodyDB.deleteSignupRequest(req.id);
        // Mark status Approved locally in case listener is slow
        const remaining = CustodyDB.getSignupRequests().filter(r => r.id !== req.id);
        // (deleteSignupRequest already updates storage; this is a safety no-op)
        void remaining;
        alert(isRtl ? 'هذا البريد مسجّل مسبقاً. تم إزالة طلب التسجيل.' : 'User already exists. Signup request removed.');
        handleRefreshData();
        return;
      }

      const plainPassword = (req.password && String(req.password).trim()) || 'ChangeMe123!';
      const newUserId = `user-approved-${req.role.toLowerCase()}-${Date.now()}`;
      const salt = emailLower;

      const newUser: AppUser = {
        id: newUserId,
        email: emailLower,
        full_name: req.full_name,
        role: req.role,
        company_id: req.company_id,
        station_id: req.station_id,
        region_id: req.region_id,
        org_unit_id: req.org_unit_id,
        is_active: true,
        // Do NOT leave a long-lived plaintext password on the public user doc.
        // Temporary local hash for offline resilience; vault is source of truth.
        password: CustodyDB.hashPassword ? CustodyDB.hashPassword(plainPassword, salt) : undefined,
        salt,
        permissions: CustodyDB.enrichUserPermissions(req.role),
      };

      const usersList = [...existingUsers, newUser];
      await CustodyDB.saveUsers(usersList);

      // Persist credentials into the zero-trust vault via server (PBKDF2 + pepper_version 2)
      try {
        const active = CustodyDB.getActiveUser?.() || null;
        let idToken = '';
        try {
          // @ts-ignore - firebase auth currentUser may exist
          const { auth } = await import('../firebase');
          idToken = (await auth.currentUser?.getIdToken?.()) || '';
        } catch {
          idToken = '';
        }

        if (idToken) {
          const resp = await fetch('/api/auth/save-credentials', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              userId: newUserId,
              companyId: req.company_id || '',
              email: emailLower,
              password: plainPassword,
              salt,
            }),
          });
          if (!resp.ok) {
            console.warn('[approve-signup] save-credentials failed', await resp.text());
          }
        } else {
          console.warn('[approve-signup] No idToken available; credentials vault write skipped');
        }
      } catch (credErr) {
        console.warn('[approve-signup] vault write error:', credErr);
      }

      // Hard-delete the signup request (local + cloud). If cloud fails, mark status Approved
      // so a re-hydrated document does not show as Pending again.
      await CustodyDB.deleteSignupRequest(req.id);

      // Safety: if request somehow still present locally, mark it Approved instead of Pending
      try {
        const stillThere = CustodyDB.getSignupRequests().find(r => r.id === req.id);
        if (stillThere) {
          await CustodyDB.saveSignupRequest({
            ...stillThere,
            status: 'Approved' as any,
          });
        }
      } catch {
        // ignore
      }

      CustodyDB.logAudit(
        'APPROVE_SIGNUP_REQUEST',
        `Approved signup for ${req.full_name} (${emailLower}) as ${req.role}`
      );
      alert(isRtl ? 'تم قبول طلب التسجيل وتفعيل الحساب بنجاح!' : 'Signup request approved successfully!');
      handleRefreshData();
    } catch (err: any) {
      console.error('[approve-signup] failed:', err);
      alert(
        isRtl
          ? `فشل قبول الطلب: ${err?.message || 'خطأ غير معروف'}`
          : `Failed to approve request: ${err?.message || 'Unknown error'}`
      );
    }
  };

  const handleRejectSignupRequest = async (id: string, email: string) => {
    if (confirm(isRtl ? 'هل أنت متأكد من رفض هذا الطلب وحذفه؟' : 'Are you sure you want to reject and delete this request?')) {
      await CustodyDB.deleteSignupRequest(id);
      CustodyDB.logAudit('REJECT_SIGNUP_REQUEST', `Rejected signup request for ${email}`);
      alert(isRtl ? 'تم رفض طلب التسجيل وحذفه.' : 'Signup request rejected and deleted.');
      handleRefreshData();
    }
  };

  // Filters
  const filteredCompanies = useMemo(() => {
    return companies.filter(c => 
      c.name.toLowerCase().includes(companySearch.toLowerCase()) ||
      c.id.toLowerCase().includes(companySearch.toLowerCase())
    );
  }, [companies, companySearch]);

  const sortedAndFilteredCompanies = useMemo(() => {
    const list = [...filteredCompanies];
    list.sort((a, b) => {
      let aVal: any = '';
      let bVal: any = '';

      if (sortField === 'name') {
        aVal = (a.name || '').toLowerCase();
        bVal = (b.name || '').toLowerCase();
      } else if (sortField === 'status') {
        aVal = a.is_active !== false ? 'active' : 'disabled';
        bVal = b.is_active !== false ? 'active' : 'disabled';
      } else if (sortField === 'userCount') {
        aVal = users.filter(u => u.company_id === a.id).length;
        bVal = users.filter(u => u.company_id === b.id).length;
      } else if (sortField === 'expiry') {
        aVal = a.subscription_expiry || '';
        bVal = b.subscription_expiry || '';
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [filteredCompanies, sortField, sortOrder, users]);

  // Database Backup and Restore Handlers
  const handleExportBackup = () => {
    try {
      const backupObj = {
        version: '2.5',
        exportedAt: new Date().toISOString(),
        companies: CustodyDB.getCompanies(),
        regions: CustodyDB.getRegions(),
        stations: CustodyDB.getStations(),
        categories: CustodyDB.getCategories(),
        users: CustodyDB.getUsers(),
        transactions: CustodyDB.getTransactions(),
        auditLogs: CustodyDB.getAuditLogs(),
        logs: CustodyDB.getLogs(),
        deletedTransactions: CustodyDB.getDeletedTransactions()
      };

      const dataStr = JSON.stringify(backupObj, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
      const exportFileDefaultName = `kemiterp-backup-${new Date().toISOString().slice(0, 10)}.json`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();

      CustodyDB.logAudit('EXPORT_BACKUP', 'Exported full platform JSON database snapshot');
      showStructToast(isRtl ? 'تم تصدير نسخة احتياطية كاملة بنجاح.' : 'JSON Database snapshot exported successfully.');
    } catch (e) {
      alert(isRtl ? 'فشل تصدير البيانات.' : 'Backup failed.');
    }
  };

  const handleRestoreData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    const file = e.target.files?.[0];
    if (!file) return;

    fileReader.onload = async (event) => {
      try {
        const rawContent = event.target?.result as string;
        const parsed = JSON.parse(rawContent);

        // Strict validation of backup root structure and required collections
        if (
          !parsed ||
          typeof parsed !== 'object' ||
          !Array.isArray(parsed.companies) ||
          !Array.isArray(parsed.users) ||
          !Array.isArray(parsed.transactions) ||
          (parsed.regions && !Array.isArray(parsed.regions)) ||
          (parsed.stations && !Array.isArray(parsed.stations)) ||
          (parsed.categories && !Array.isArray(parsed.categories))
        ) {
          alert(
            isRtl
              ? 'ملف النسخة الاحتياطية غير صالح أو ناقص البنية الأساسية (يلزم وجود مصفوفات للشركات والمستخدمين والمعاملات)!'
              : 'Invalid backup file schema! Backup must contain valid arrays for companies, users, and transactions.'
          );
          if (e.target) e.target.value = '';
          return;
        }

        // Validate basic record shape in required collections to prevent corrupted restores
        const hasValidCompanies = parsed.companies.every((c: any) => c && typeof c === 'object' && typeof c.id === 'string' && typeof c.name === 'string');
        const hasValidUsers = parsed.users.every((u: any) => u && typeof u === 'object' && typeof u.id === 'string' && typeof u.email === 'string');
        const hasValidTransactions = parsed.transactions.every((t: any) => t && typeof t === 'object' && typeof t.id === 'string');

        if (!hasValidCompanies || !hasValidUsers || !hasValidTransactions) {
          alert(
            isRtl
              ? 'فشل التحقق من صحة بنية السجلات في ملف النسخة الاحتياطية. تم رفض الاستعادة لمنع تلف البيانات.'
              : 'Backup records validation failed. Restore rejected to prevent data corruption.'
          );
          if (e.target) e.target.value = '';
          return;
        }

        // Explicit user confirmation before executing restore
        const confirmMsg = isRtl
          ? `تنبيه أمني: هل أنت متأكد من رغبتك في استعادة قاعدة البيانات من هذه النسخة الاحتياطية؟\n\nتتضمن النسخة:\n- ${parsed.companies.length} شركة\n- ${parsed.users.length} مستخدم\n- ${parsed.transactions.length} معاملة\n\nسيتم تحديث واستبدال السجلات المطابقة في النظام.`
          : `Security Confirmation: Are you sure you want to restore the database from this backup file?\n\nBackup contains:\n- ${parsed.companies.length} Companies\n- ${parsed.users.length} Users\n- ${parsed.transactions.length} Transactions\n\nMatching records will be updated and synchronized.`;

        if (!window.confirm(confirmMsg)) {
          if (e.target) e.target.value = '';
          return;
        }

        // Execute validated restore
        CustodyDB.saveCompanies(parsed.companies);
        if (parsed.regions) CustodyDB.saveRegions(parsed.regions);
        if (parsed.stations) CustodyDB.saveStations(parsed.stations);
        if (parsed.categories) CustodyDB.saveCategories(parsed.categories);
        await CustodyDB.saveUsers(parsed.users);
        CustodyDB.saveTransactions(parsed.transactions);

        CustodyDB.logAudit('RESTORE_BACKUP', `Restored database snapshot containing ${parsed.transactions.length} transactions and ${parsed.users.length} users.`);
        showStructToast(isRtl ? 'تم استعادة قاعدة البيانات وتحديث النظام بالكامل بنجاح!' : 'Database successfully restored and synchronized.');
        handleRefreshData();
      } catch (err) {
        alert(isRtl ? 'فشل قراءة الملف كبنية JSON صالحة.' : 'Failed to parse JSON backup file.');
      } finally {
        if (e.target) e.target.value = '';
      }
    };
    fileReader.readAsText(file);
  };

  const handleSeedData = async () => {
    if (!confirm(isRtl ? 'هل تريد شحن وتجديد البيانات التجريبية الشاملة لجميع الشركات والتقسيمات الإدارية؟' : 'Do you want to reload full multi-company seed datasets?')) {
      return;
    }
    setIsSeedingData(true);
    try {
      await CustodyDB.seedSampleData();
      showStructToast(isRtl ? 'تم شحن وتأكيد البيانات التجريبية الشاملة لجميع الشركات بنجاح!' : 'Full sample datasets re-seeded successfully!');
      handleRefreshData();
    } catch (e: any) {
      alert(isRtl ? `خطأ أثناء شحن البيانات: ${e.message}` : `Error seeding data: ${e.message}`);
    } finally {
      setIsSeedingData(false);
    }
  };

  const companyAdmins = useMemo(() => {
    return users.filter(u => 
      u.role === 'Admin' && 
      ((u.full_name || '').toLowerCase().includes(userSearch.toLowerCase()) || (u.email || '').toLowerCase().includes(userSearch.toLowerCase()))
    );
  }, [users, userSearch]);

  const supportUsersList = useMemo(() => {
    return users.filter(u => 
      u.role !== 'SystemAdmin' && (
        (u.full_name || '').toLowerCase().includes(supportUserSearch.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(supportUserSearch.toLowerCase()) ||
        (u.role || '').toLowerCase().includes(supportUserSearch.toLowerCase())
      )
    );
  }, [users, supportUserSearch]);

  const impersonationAuditLogs = useMemo(() => {
    return auditLogs.filter(log => 
      log.action_type === 'IMPERSONATION_START' || 
      log.action_type === 'IMPERSONATION_END'
    );
  }, [auditLogs]);

  return (
    <ErrorBoundary>
      <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
      {/* SaaS Header Bar */}
      {!embedded && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E7EB] dark:border-slate-800">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#18181B] dark:text-slate-100">
              {isRtl ? 'لوحة تحكم المدير العام للمنصة (SaaS)' : 'SaaS Super Admin Control Center'}
            </h1>
            <p className="text-xs sm:text-sm text-[#71717A] dark:text-slate-400 mt-1">
              {isRtl 
                ? 'مرحباً بك في وحدة الإدارة الشاملة لنظام SaaS. يمكنك التحكم بالاشتراكات وتفعيل وتعطيل الشركات المنضوية، والولوج الفوري للدعم الفني لمساعدة المستخدمين مع الرقابة والامتثال الكامل.'
                : 'Welcome to the complete multi-tenant SaaS management hub. Easily regulate subscriptions, toggle organization status, reset administrative passwords, and gain instant technical support access under secure audit rails.'}
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button 
              type="button"
              onClick={() => {
                if (onNavigate) {
                  onNavigate('settings');
                }
                window.dispatchEvent(new CustomEvent('navigate_tab', { 
                  detail: { tab: 'settings', settingsTab: 'permissions', centerTab: 'users' } 
                }));
              }}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-all shadow-xs active:scale-95 cursor-pointer flex-1 sm:flex-initial"
            >
              <ShieldCheck size={16} />
              <span>{isRtl ? 'الانتقال إلى مركز التحكم الموحد' : 'Unified Access Control'}</span>
            </button>
            <button 
              onClick={handleRefreshData}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all shadow-xs active:scale-95 cursor-pointer flex-1 sm:flex-initial"
            >
              <RefreshCw size={15} />
              <span>{isRtl ? 'تحديث البيانات' : 'Refresh'}</span>
            </button>
          </div>
        </div>
      )}

      {/* SaaS Overview Summary Cards - Completely isolated from company context */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 sm:p-5 rounded-2xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between transition-all hover:shadow-md">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold">{isRtl ? 'إجمالي الشركات المنضمّة' : 'Total SaaS Companies'}</span>
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-slate-800 text-[#2451B8] dark:text-blue-400">
              <Building2 size={18} />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-mono">
              {companies.length}
            </span>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              {isRtl ? 'شركة مسجلة' : 'Registered'}
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between transition-all hover:shadow-md">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold">{isRtl ? 'الشركات النشطة حالياً' : 'Active Organizations'}</span>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
              {companies.filter(c => c.is_active !== false).length}
            </span>
            <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">
              {isRtl ? 'تعمل بنشاط' : 'Active'}
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between transition-all hover:shadow-md">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold">{isRtl ? 'الشركات الموقوفة / المعطلة' : 'Suspended Entities'}</span>
            <div className="p-2 rounded-xl bg-rose-50 dark:bg-slate-800 text-rose-600 dark:text-rose-400">
              <XCircle size={18} />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400 font-mono">
              {companies.filter(c => c.is_active === false).length}
            </span>
            <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider">
              {isRtl ? 'موقوف' : 'Suspended'}
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between transition-all hover:shadow-md">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-bold">{isRtl ? 'طلبات الاشتراك المعلقة' : 'Pending Signup Requests'}</span>
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-slate-800 text-amber-600 dark:text-amber-400">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400 font-mono">
              {CustodyDB.getSignupRequests().filter(r => {
                const s = String(r.status || '').toLowerCase();
                return s === 'pending';
              }).length}
            </span>
            <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">
              {isRtl ? 'في انتظار الموافقة' : 'Pending'}
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Pending Signup Requests Banner/List for SuperAdmin */}
      {(() => {
        const pendingReqs = CustodyDB.getSignupRequests().filter(r => {
          const s = String(r.status || '').toLowerCase();
          return s === 'pending';
        });
        if (pendingReqs.length === 0) return null;
        return (
          <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-sm">
                <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400" />
                <span>{isRtl ? `طلبات تسجيل مستخدمين جديدة بانتظار الموافقة (${pendingReqs.length})` : `New Pending Signup Requests (${pendingReqs.length})`}</span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pendingReqs.map(req => (
                <div key={req.id} className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-100 dark:border-slate-800 shadow-sm flex flex-col justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-slate-800 dark:text-slate-100 text-sm truncate">{req.full_name}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#2451B8]/10 dark:bg-slate-800 text-[#2451B8] dark:text-blue-400 border border-[#2451B8]/20 dark:border-slate-700">{req.role}</span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">{req.email}</p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      {isRtl ? 'الشركة: ' : 'Company: '}{companies.find(c => c.id === req.company_id)?.name || req.company_id}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleApproveSignupRequest(req)}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
                    >
                      {isRtl ? 'قبول وتفعيل' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRejectSignupRequest(req.id, req.email)}
                      className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-rose-600 dark:text-rose-400 text-xs font-bold transition-all cursor-pointer border border-rose-200 dark:border-slate-700"
                    >
                      {isRtl ? 'رفض' : 'Reject'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Navigation Sub-Tabs */}
      {!embedded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <button
            onClick={() => setActiveSubTab('companies')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center lg:justify-start gap-2 transition-all cursor-pointer ${
              activeSubTab === 'companies'
                ? 'bg-[#2451B8] text-white shadow-md'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Building2 size={16} />
            <span>{isRtl ? 'دليل الشركات والاشتراكات' : 'Companies & Subscriptions'}</span>
          </button>
          <button
            onClick={() => setActiveSubTab('operations')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center lg:justify-start gap-2 transition-all cursor-pointer ${
              activeSubTab === 'operations'
                ? 'bg-[#2451B8] text-white shadow-md'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <Activity size={16} />
            <span>{isRtl ? 'إدارة العمليات الداخلية لكل الشركات' : 'Internal Operations Management'}</span>
          </button>
          <button
            onClick={() => setActiveSubTab('impersonate')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center lg:justify-start gap-2 transition-all cursor-pointer ${
              activeSubTab === 'impersonate'
                ? 'bg-[#2451B8] text-white shadow-md'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <UserCheck size={16} />
            <span>{isRtl ? 'بوابة الدعم والمحاكاة' : 'Support Impersonation Portal'}</span>
          </button>
          <button
            onClick={() => setActiveSubTab('audit')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center lg:justify-start gap-2 transition-all cursor-pointer ${
              activeSubTab === 'audit'
                ? 'bg-[#2451B8] text-white shadow-md'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <ClipboardList size={16} />
            <span>{isRtl ? 'سجل الرقابة للرؤساء' : 'Impersonation Audit Logs'}</span>
          </button>
          <button
            onClick={() => setActiveSubTab('security')}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs md:text-sm flex items-center justify-center lg:justify-start gap-2 transition-all cursor-pointer ${
              activeSubTab === 'security'
                ? 'bg-[#2451B8] text-white shadow-md'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <ShieldCheck size={16} />
            <span>{isRtl ? 'أمان التشفير (Phase 4.1)' : 'Security & Encryption (Phase 4.1)'}</span>
          </button>
        </div>
      )}

      {/* Tab Contents */}
      {activeSubTab === 'companies' && (
        <SuperAdminCompaniesTab
          isRtl={isRtl}
          theme={theme}
          companies={companies}
          users={users}
          regions={regions}
          stations={stations}
          companySearch={companySearch}
          setCompanySearch={setCompanySearch}
          sortField={sortField}
          handleSort={handleSort}
          sortedAndFilteredCompanies={sortedAndFilteredCompanies}
          filteredCompanies={filteredCompanies}
          isStructureOpen={isStructureOpen}
          setIsStructureOpen={setIsStructureOpen}
          structureView={structureView}
          setStructureView={setStructureView}
          structToastMsg={structToastMsg}
          startStructAddCompany={startStructAddCompany}
          startStructEditCompany={startStructEditCompany}
          handleStructDeleteCompany={handleStructDeleteCompany}
          startStructAddRegionForCompany={startStructAddRegionForCompany}
          startStructAddStationDirectForCompany={startStructAddStationDirectForCompany}
          startStructEditRegion={startStructEditRegion}
          handleStructDeleteRegion={handleStructDeleteRegion}
          startStructAddStationForRegion={startStructAddStationForRegion}
          startStructEditStation={startStructEditStation}
          handleStructDeleteStation={handleStructDeleteStation}
          handleToggleCompanyActive={handleToggleCompanyActive}
          setEditingCompany={setEditingCompany}
          setSubPlan={setSubPlan}
          setSubStatus={setSubStatus}
          setSubExpiry={setSubExpiry}
          setCompanyModules={setCompanyModules}
          setActiveModalTab={setActiveModalTab}
          handleSaveCompanyAdmin={handleSaveCompanyAdmin}
          handleSaveRegionManager={handleSaveRegionalManager}
          handleSaveStationAdmin={handleSaveStationAdmin}
          structureTab={structureTab}
          setStructureTab={setStructureTab}
          structSelectedCompanyId={structSelectedCompanyId}
        />
      )}
      {activeSubTab === 'operations' && (
        <SuperAdminOperationsTab
          isRtl={isRtl}
          language={language}
          companies={companies}
          regions={regions}
          stations={stations}
          showStructToast={showStructToast}
        />
      )}

      {activeSubTab === 'impersonate' && (
        <SuperAdminImpersonateTab
          supportUsersList={supportUsersList}
          companies={companies}
          regions={regions}
          stations={stations}
          supportUserSearch={supportUserSearch}
          setSupportUserSearch={setSupportUserSearch}
          impersonateError={impersonateError}
          handleStartImpersonation={handleStartImpersonation}
          isRtl={isRtl}
        />
      )}

      {activeSubTab === 'audit' && (
        <SuperAdminAuditTab
          impersonationAuditLogs={impersonationAuditLogs}
          language={language}
          isRtl={isRtl}
        />
      )}

      {activeSubTab === 'security' && (
        <SuperAdminSecurityTab
          isRtl={isRtl}
        />
      )}

      {/* MODAL 1: Create Company */}

      {/* MODAL 1: Create Company */}
      {showCreateCompanyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowCreateCompanyModal(false)} />
          <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl space-y-4 text-xs">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Building2 size={20} className="text-[#2451B8]" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{isRtl ? 'إضافة شركة جديدة للمنصة' : 'Onboard New Company'}</h3>
            </div>

            <form onSubmit={handleCreateCompany} className="space-y-4">
              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">{isRtl ? 'اسم الشركة (عربي / إنجليزي)' : 'Company Name'}</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Al-Futtaim Egypt (الفطيم مصر)"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-extrabold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#2451B8]/20 dark:bg-slate-950 focus:border-[#2451B8]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">{isRtl ? 'قيمة العهدة الابتدائية المسموح بها' : 'Initial Custody Limit'}</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={newCompanyCustody}
                  onChange={(e) => setNewCompanyCustody(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-extrabold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#2451B8]/20 dark:bg-slate-950 focus:border-[#2451B8]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateCompanyModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all cursor-pointer"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-[#2451B8] hover:bg-[#1d429a] text-white rounded-xl font-bold transition-all shadow-md cursor-pointer"
                >
                  {isRtl ? 'إنشاء وتفعيل' : 'Onboard Company'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Edit Subscription & Modules */}
      {editingCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setEditingCompany(null)} />
          <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 w-full max-w-2xl shadow-2xl space-y-4 text-xs my-8">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Calendar size={20} className="text-[#2451B8]" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {isRtl ? `إدارة تراخيص واشتراكات: ${editingCompany.name}` : `Licensing & Subscription: ${editingCompany.name}`}
                </h3>
              </div>
              <button onClick={() => setEditingCompany(null)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer">
                <X size={16} className="text-slate-400" />
              </button>
            </div>

            {/* Tab Switches */}
            <div className="flex border-b border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setActiveModalTab('subscription')}
                className={`py-2 px-4 font-bold border-b-2 transition-all cursor-pointer ${
                  activeModalTab === 'subscription'
                    ? 'border-[#2451B8] text-[#2451B8] dark:text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                {isRtl ? 'بيانات الاشتراك الرئيسي' : 'Main Subscription'}
              </button>
              <button
                type="button"
                onClick={() => setActiveModalTab('modules')}
                className={`py-2 px-4 font-bold border-b-2 transition-all cursor-pointer ${
                  activeModalTab === 'modules'
                    ? 'border-[#2451B8] text-[#2451B8] dark:text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                {isRtl ? 'الموديولات والأقسام (Modules)' : 'Module Management'}
              </button>
            </div>

            <form onSubmit={handleSaveSubscription} className="space-y-4">
              {activeModalTab === 'subscription' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">{isRtl ? 'الباقة المفعلة' : 'Select Subscription Plan'}</label>
                    <select
                      value={subPlan}
                      onChange={(e) => setSubPlan(e.target.value as Company['subscription_plan'])}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-extrabold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#2451B8]/20 dark:bg-slate-950 focus:border-[#2451B8]"
                    >
                      <option value="Basic">{isRtl ? 'الباقة الأساسية (Basic)' : 'Basic Plan'}</option>
                      <option value="Professional">{isRtl ? 'باقة المحترفين (Professional)' : 'Professional Plan'}</option>
                      <option value="Enterprise">{isRtl ? 'باقة الشركات الكبرى (Enterprise)' : 'Enterprise Plan'}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">{isRtl ? 'حالة الاشتراك' : 'Subscription Status'}</label>
                    <select
                      value={subStatus}
                      onChange={(e) => setSubStatus(e.target.value as Company['subscription_status'])}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-extrabold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#2451B8]/20 dark:bg-slate-950 focus:border-[#2451B8]"
                    >
                      <option value="active">{isRtl ? 'نشط (Active)' : 'Active'}</option>
                      <option value="suspended">{isRtl ? 'موقوف مؤقتاً (Suspended)' : 'Suspended'}</option>
                      <option value="trial">{isRtl ? 'فترة تجريبية (Trial)' : 'Trial Period'}</option>
                      <option value="expired">{isRtl ? 'منتهي الصلاحية (Expired)' : 'Expired'}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">{isRtl ? 'تاريخ انتهاء الاشتراك' : 'Subscription Expiry Date'}</label>
                    <input
                      type="date"
                      required
                      value={subExpiry}
                      onChange={(e) => setSubExpiry(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-extrabold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#2451B8]/20 dark:bg-slate-950 focus:border-[#2451B8]"
                    />
                  </div>
                </div>
              )}

              {activeModalTab === 'modules' && (
                <div className="space-y-4">
                  {/* Top quick administrative actions */}
                  <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-wrap gap-2 items-center justify-between">
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = { ...companyModules };
                          Object.keys(updated).forEach(k => {
                            updated[k] = { ...updated[k], enabled: true, status: 'active' };
                          });
                          setCompanyModules(updated);
                        }}
                        className="px-2.5 py-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg hover:bg-emerald-500/20 cursor-pointer font-bold text-[10px]"
                      >
                        {isRtl ? 'تفعيل الكل' : 'Enable All'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = { ...companyModules };
                          Object.keys(updated).forEach(k => {
                            updated[k] = { ...updated[k], enabled: false, status: 'inactive' };
                          });
                          setCompanyModules(updated);
                        }}
                        className="px-2.5 py-1.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-lg hover:bg-rose-500/20 cursor-pointer font-bold text-[10px]"
                      >
                        {isRtl ? 'تعطيل الكل' : 'Disable All'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const defaults = ModulesModule.getDefaultModulesForPlan(subPlan);
                          setCompanyModules(defaults);
                        }}
                        className="px-2.5 py-1.5 bg-[#2451B8]/10 text-[#2451B8] dark:text-blue-400 rounded-lg hover:bg-[#2451B8]/20 cursor-pointer font-bold text-[10px]"
                      >
                        {isRtl ? 'تطبيق باقة الاشتراك' : 'Apply Package'}
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <select
                        value={copySourceCompanyId}
                        onChange={(e) => setCopySourceCompanyId(e.target.value)}
                        className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-[10px] text-slate-800 dark:text-white font-semibold"
                      >
                        <option value="">{isRtl ? 'نسخ من شركة...' : 'Copy from company...'}</option>
                        {CustodyDB.getCompanies()
                          .filter(c => c.id !== editingCompany.id)
                          .map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                      </select>
                      <button
                        type="button"
                        disabled={!copySourceCompanyId}
                        onClick={() => {
                          if (!copySourceCompanyId) return;
                          const copied = ModulesModule.getCompanyModules(copySourceCompanyId);
                          setCompanyModules(copied);
                        }}
                        className="px-2 py-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer font-bold text-[10px]"
                      >
                        {isRtl ? 'نسخ' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  {/* Modules detail matrix list */}
                  <div className="max-h-72 overflow-y-auto space-y-3.5 pr-1">
                    {ERP_MODULES_REGISTRY.map(m => {
                      const modSettings = companyModules[m.id] || {
                        enabled: false,
                        plan: 'Basic',
                        status: 'inactive',
                        activation_date: '',
                        expiry_date: '',
                        notes: ''
                      };

                      const updateModField = (field: keyof CompanyModuleSettings, val: any) => {
                        setCompanyModules({
                          ...companyModules,
                          [m.id]: {
                            ...modSettings,
                            [field]: val
                          }
                        });
                      };

                      return (
                        <div
                          key={m.id}
                          className={`p-3 rounded-2xl border transition-all ${
                            modSettings.enabled
                              ? 'bg-[#2451B8]/5 border-[#2451B8]/10 dark:border-[#2451B8]/20'
                              : 'bg-slate-50/50 border-slate-100 dark:border-slate-850 dark:bg-slate-850/40 text-slate-400'
                          }`}
                        >
                          {/* Module identity */}
                          <div className="flex items-start justify-between gap-4 mb-2.5">
                            <div>
                              <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                <span className={`h-2 w-2 rounded-full ${modSettings.enabled ? 'bg-[#2451B8]' : 'bg-slate-300'}`} />
                                {isRtl ? m.name_ar : m.name_en}
                              </h4>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                                {isRtl ? m.description_ar : m.description_en}
                              </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={!!modSettings.enabled}
                                onChange={(e) => {
                                  updateModField('enabled', e.target.checked);
                                  updateModField('status', e.target.checked ? 'active' : 'inactive');
                                }}
                                className="sr-only peer"
                              />
                              <div className="w-9 h-5 bg-slate-200 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#2451B8]" />
                            </label>
                          </div>

                          {/* Module detail fields */}
                          {modSettings.enabled && (
                            <div className="grid grid-cols-2 gap-2 text-[10px] mt-2 border-t border-slate-100 dark:border-slate-800/60 pt-2.5">
                              <div>
                                <label className="block text-slate-400 font-bold mb-1">{isRtl ? 'مستوى الخدمة (Plan)' : 'Service Plan'}</label>
                                <select
                                  value={modSettings.plan}
                                  onChange={(e) => updateModField('plan', e.target.value)}
                                  className="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-800 dark:bg-slate-950 rounded-lg text-[10px] text-slate-800 dark:text-white"
                                >
                                  <option value="Basic">{isRtl ? 'أساسي (Basic)' : 'Basic'}</option>
                                  <option value="Professional">{isRtl ? 'محترف (Professional)' : 'Professional'}</option>
                                  <option value="Enterprise">{isRtl ? 'مؤسسات (Enterprise)' : 'Enterprise'}</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-slate-400 font-bold mb-1">{isRtl ? 'حالة التفعيل (Status)' : 'Activation Status'}</label>
                                <select
                                  value={modSettings.status}
                                  onChange={(e) => updateModField('status', e.target.value)}
                                  className="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-800 dark:bg-slate-950 rounded-lg text-[10px] text-slate-800 dark:text-white"
                                >
                                  <option value="active">{isRtl ? 'نشط (Active)' : 'Active'}</option>
                                  <option value="inactive">{isRtl ? 'معطل (Inactive)' : 'Inactive'}</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-slate-400 font-bold mb-1">{isRtl ? 'تاريخ البدء' : 'Start Date'}</label>
                                <input
                                  type="date"
                                  value={modSettings.activation_date || ''}
                                  onChange={(e) => updateModField('activation_date', e.target.value)}
                                  className="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-800 dark:bg-slate-950 rounded-lg text-[10px] text-slate-800 dark:text-white font-mono"
                                />
                              </div>

                              <div>
                                <label className="block text-slate-400 font-bold mb-1">{isRtl ? 'تاريخ الانتهاء' : 'Expiry Date'}</label>
                                <input
                                  type="date"
                                  value={modSettings.expiry_date || ''}
                                  onChange={(e) => updateModField('expiry_date', e.target.value)}
                                  className="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-800 dark:bg-slate-950 rounded-lg text-[10px] text-slate-800 dark:text-white font-mono"
                                />
                              </div>

                              <div className="col-span-2">
                                <label className="block text-slate-400 font-bold mb-1">{isRtl ? 'ملاحظات' : 'Licensing Notes'}</label>
                                <input
                                  type="text"
                                  placeholder={isRtl ? 'مثال: باقة تجريبية مجانية لمدير فرع جده' : 'e.g. Free demo for region admin'}
                                  value={modSettings.notes || ''}
                                  onChange={(e) => updateModField('notes', e.target.value)}
                                  className="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-800 dark:bg-slate-950 rounded-lg text-[10px] text-slate-800 dark:text-white"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingCompany(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all cursor-pointer"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-[#2451B8] hover:bg-[#1d429a] text-white rounded-xl font-bold transition-all shadow-md cursor-pointer"
                >
                  {isRtl ? 'حفظ التعديلات والترخيص' : 'Save & License'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Reset Password Confirm */}
      {selectedUserForReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setSelectedUserForReset(null)} />
          <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl space-y-4 text-xs">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 text-rose-500">
              <KeyRound size={20} />
              <h3 className="text-sm font-bold">{isRtl ? `تغيير كلمة المرور: ${selectedUserForReset.full_name}` : `Reset Password: ${selectedUserForReset.full_name}`}</h3>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">{isRtl ? 'البريد الإلكتروني للمدير' : 'Manager Email'}</label>
                <input
                  type="text"
                  disabled
                  value={selectedUserForReset.email}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs bg-slate-50 dark:bg-slate-850 text-slate-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">{isRtl ? 'كلمة المرور الجديدة' : 'New Password'}</label>
                <input
                  type="text"
                  required
                  minLength={12}
                  placeholder="e.g. Pass@2026Secure"
                  value={newPlainPassword}
                  onChange={(e) => setNewPlainPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-extrabold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#2451B8]/20 dark:bg-slate-950 focus:border-[#2451B8] font-mono"
                />
              </div>

              {resetSuccessMessage && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold text-center">
                  {resetSuccessMessage}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedUserForReset(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all cursor-pointer"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition-all shadow-md cursor-pointer"
                >
                  {isRtl ? 'تغيير كلمة المرور الآن' : 'Commit Reset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Structure Builder Company Modal */}
      {showStructCompanyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowStructCompanyModal(false)} />
          <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl space-y-4 text-xs">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Building2 size={20} className="text-[#2451B8]" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {structEditingCompany ? (isRtl ? 'تعديل بيانات الشركة الكيان' : 'Edit Enterprise Company') : (isRtl ? 'إضافة شركة كيان جديدة للمنصة' : 'Add New Enterprise Company')}
              </h3>
            </div>

            <form onSubmit={handleStructAddCompany} className="space-y-4">
              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">{isRtl ? 'اسم الشركة (عربي / إنجليزي)' : 'Company Name'}</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Al-Futtaim Egypt (الفطيم مصر)"
                  value={structCompName}
                  onChange={(e) => setStructCompName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-extrabold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#2451B8]/20 dark:bg-slate-950 focus:border-[#2451B8]"
                />
              </div>

              {!structEditingCompany && (
                <div>
                  <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">{isRtl ? 'قيمة العهدة الابتدائية المسموح بها' : 'Initial Custody Limit'}</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={newCompanyCustody}
                    onChange={(e) => setNewCompanyCustody(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-extrabold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#2451B8]/20 dark:bg-slate-950 focus:border-[#2451B8]"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowStructCompanyModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all cursor-pointer"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-[#2451B8] hover:bg-[#1d429a] text-white rounded-xl font-bold transition-all shadow-md cursor-pointer"
                >
                  {isRtl ? 'حفظ وتفعيل' : 'Save & Onboard'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: Structure Builder Region Modal */}
      {showStructRegionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowStructRegionModal(false)} />
          <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl space-y-4 text-xs">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Globe size={20} className="text-[#2451B8]" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {structEditingRegion ? (isRtl ? 'تعديل قطاع / منطقة' : 'Edit Region Sector') : (isRtl ? 'إضافة قطاع / منطقة جديدة' : 'Add New Region Sector')}
              </h3>
            </div>

            <form onSubmit={handleStructAddRegion} className="space-y-4">
              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">{isRtl ? 'المنطقة الجغرافية / اسم القطاع' : 'Region/Sector Name'}</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Cairo South (جنوب القاهرة)"
                  value={structRegName}
                  onChange={(e) => setStructRegName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-extrabold text-white focus:ring-2 focus:ring-[#2451B8]/20 dark:bg-slate-950 focus:border-[#2451B8]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">{isRtl ? 'الشركة التابعة لها' : 'Belongs to Parent Company'}</label>
                <select
                  value={structRegCompanyId}
                  onChange={(e) => setStructRegCompanyId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-extrabold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#2451B8]/20 dark:bg-slate-950 focus:border-[#2451B8]"
                >
                  <option value="">{isRtl ? '-- اختر الشركة التابعة لها --' : '-- Select Parent Company --'}</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowStructRegionModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all cursor-pointer"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-[#2451B8] hover:bg-[#1d429a] text-white rounded-xl font-bold transition-all shadow-md cursor-pointer"
                >
                  {isRtl ? 'حفظ' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: Structure Builder Station Modal */}
      {showStructStationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowStructStationModal(false)} />
          <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl space-y-4 text-xs">
            <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Building size={20} className="text-[#2451B8]" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {structEditingStation ? (isRtl ? 'تعديل فرع عهدة / محطة' : 'Edit Custody Station') : (isRtl ? 'إضافة فرع عهدة / محطة جديدة' : 'Add Custody Station')}
              </h3>
            </div>

            <form onSubmit={handleStructAddStation} className="space-y-4">
              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">{isRtl ? 'اسم الفرع / المحطة العهدية' : 'Station/Branch Name'}</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Degla Maadi Branch (فرع دجلة المعادي)"
                  value={structStnName}
                  onChange={(e) => setStructStnName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-extrabold text-white focus:ring-2 focus:ring-[#2451B8]/20 dark:bg-slate-950 focus:border-[#2451B8]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">{isRtl ? 'كود مركز الكلفة المالي' : 'Cost Center Code'}</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., CC-MAADI-01"
                  value={structStnCode}
                  onChange={(e) => setStructStnCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-extrabold text-white focus:ring-2 focus:ring-[#2451B8]/20 dark:bg-slate-950 focus:border-[#2451B8] font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">{isRtl ? 'قيمة الرصيد الدفتري الكلي للعهدة (EGP)' : 'Total Custody Book Limit (EGP)'}</label>
                <input
                  type="number"
                  min={1}
                  required
                  placeholder="e.g., 50000"
                  value={structStnCustody}
                  onChange={(e) => setStructStnCustody(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-extrabold text-white focus:ring-2 focus:ring-[#2451B8]/20 dark:bg-slate-950 focus:border-[#2451B8] font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">{isRtl ? 'القطاع / الإقليم الجغرافي التابع له' : 'Belongs to Region/Sector'}</label>
                <select
                  value={structStnRegionId}
                  onChange={(e) => setStructStnRegionId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-extrabold text-slate-900 dark:text-white focus:ring-2 focus:ring-[#2451B8]/20 dark:bg-slate-950 focus:border-[#2451B8]"
                >
                  <option value="none">{isRtl ? 'ارتباط مباشر بالشركة (بدون قطاع)' : 'Direct Link to Company (No Sector)'}</option>
                  {regions.map(r => (
                    <option key={r.id} value={r.id}>{r.name} ({companies.find(c => c.id === r.company_id)?.name})</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowStructStationModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all cursor-pointer"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-[#2451B8] hover:bg-[#1d429a] text-white rounded-xl font-bold transition-all shadow-md cursor-pointer"
                >
                  {isRtl ? 'حفظ الفرع' : 'Save Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: Created Credentials & Instant Copy Modal */}
      {createdCredentialsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setCreatedCredentialsModal(null)} />
          <div className="relative bg-white dark:bg-slate-900 border border-emerald-500/30 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {isRtl ? 'تم إنشاء الحساب وتوثيق بيانات الدخول' : 'Account Created & Authenticated'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {createdCredentialsModal.role} - {createdCredentialsModal.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCreatedCredentialsModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <Info size={14} />
                {isRtl ? 'توجيهات تسجيل الدخول الأول:' : 'First Login Instructions:'}
              </p>
              <p className="text-[11px] leading-relaxed">
                {isRtl
                  ? 'تم إنشاء الحساب بنجاح وتعيين حالة "تغيير كلمة المرور إلزامي". عند تسجيل الدخول الأول بهذه البيانات، سيتم توجيه المستخدم تلقائياً لصفحة تغيير كلمة المرور لتحديد كلمته الخاصة.'
                  : 'Account successfully created with required password change. Upon first login with these credentials, the user will be guided to change their password.'}
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  {isRtl ? 'البريد الإلكتروني / اسم المستخدم' : 'Email / Username'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={createdCredentialsModal.email}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white select-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(createdCredentialsModal.email);
                      setCopiedField('email');
                      setTimeout(() => setCopiedField(null), 2000);
                    }}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0"
                  >
                    {copiedField === 'email' ? <Check size={14} className="text-emerald-500" /> : <ClipboardList size={14} />}
                    {copiedField === 'email' ? (isRtl ? 'تم!' : 'Copied') : (isRtl ? 'نسخ' : 'Copy')}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                  {isRtl ? 'كلمة المرور المؤقتة المحددة' : 'Assigned Temporary Password'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={createdCredentialsModal.password}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(createdCredentialsModal.password);
                      setCopiedField('password');
                      setTimeout(() => setCopiedField(null), 2000);
                    }}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0"
                  >
                    {copiedField === 'password' ? <Check size={14} className="text-emerald-500" /> : <ClipboardList size={14} />}
                    {copiedField === 'password' ? (isRtl ? 'تم!' : 'Copied') : (isRtl ? 'نسخ' : 'Copy')}
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  const textToCopy = `Email: ${createdCredentialsModal.email}\nPassword: ${createdCredentialsModal.password}`;
                  navigator.clipboard.writeText(textToCopy);
                  setCopiedField('all');
                  setTimeout(() => setCopiedField(null), 2000);
                }}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
              >
                {copiedField === 'all' ? <Check size={16} /> : <ClipboardList size={16} />}
                {copiedField === 'all'
                  ? (isRtl ? 'تم نسخ بيانات الدخول بالكامل!' : 'All Credentials Copied!')
                  : (isRtl ? 'نسخ البريد وكلمة المرور معاً' : 'Copy Both Email & Password')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
}
