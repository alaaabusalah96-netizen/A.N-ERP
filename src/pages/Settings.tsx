import React, { useState, useEffect } from 'react';
import { CustodyDB, ModulesModule } from '../db';
import { StorageEngine } from '../db/storage';
import { OrganizationUnit, OrganizationUnitType } from '../types/organization';
import { DEFAULT_ORGANIZATION_UNIT_TYPES, REGION_TYPE_IDS } from '../db/organizationEngine';
import { auth, useScreenListeners } from '../firebase';
import { createManagedUser, updateManagedUser, deleteManagedUser, getAuthHeaders } from '../lib/userProvisioning';
import ApprovalWorkflowManager from '../components/ApprovalWorkflowManager';
import OrgUnitTreeSelect from '../components/OrgUnitTreeSelect';
import SettingsGeneralTab from '../components/settings/SettingsGeneralTab';
import UnifiedAccessControlCenter from '../components/settings/UnifiedAccessControlCenter';
import { UsersModule } from '../db/users';
import { translations, Language, Theme, AppUser, UserRole, Region, Station, UserPermissions } from '../types';
import { 
  Settings as SettingsIcon, 
  Building, 
  Coins, 
  Users2, 
  ShieldCheck, 
  Lock, 
  PlusCircle, 
  Check, 
  Trash2, 
  UserPlus,
  Download,
  Upload,
  Edit2,
  MapPin,
  Globe,
  RefreshCw,
  Sliders,
  CheckCircle,
  AlertTriangle,
  Inbox,
  Copy
} from 'lucide-react';

interface SettingsProps {
  language: Language;
  theme: Theme;
  initialTab?: 'general' | 'users' | 'workflows';
  initialCenterTab?: 'users' | 'org_structure' | 'modules' | 'companies';
  initialSelectedCompanyId?: string;
  onNavigate?: (tab: string) => void;
}

interface RoleDefinition {
  id: UserRole;
  labelEn: string;
  labelAr: string;
  colorClass: string;
  bgClass: string;
  systemAdminOnly?: boolean;
}

const SYSTEM_ROLES: RoleDefinition[] = [
  {
    id: 'SystemAdmin',
    labelEn: 'Platform Admin',
    labelAr: 'أدمن منصة (Platform Admin)',
    colorClass: 'text-indigo-600 font-bold dark:text-indigo-400',
    bgClass: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/10',
    systemAdminOnly: true
  },
  {
    id: 'Admin',
    labelEn: 'Company Admin',
    labelAr: 'ادمن الشركة (Company Admin)',
    colorClass: 'text-rose-500 font-bold dark:text-rose-400',
    bgClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/10'
  },
  {
    id: 'RegionalManager',
    labelEn: 'Regional Manager',
    labelAr: 'مدير منطقة (Regional Manager)',
    colorClass: 'text-sky-600 font-semibold dark:text-sky-400',
    bgClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/10'
  },
  {
    id: 'StationAdmin',
    labelEn: 'Station Manager',
    labelAr: 'مدير محطة / أمين عهدة',
    colorClass: 'text-emerald-600 font-semibold dark:text-emerald-400',
    bgClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10'
  }
];

const PERMISSIONS_LIST = [
  { key: 'create_expense', ar: 'إضافة وتسجيل المصروفات', en: 'Create & record expenses' },
  { key: 'delete_expense', ar: 'حذف المصروفات المسجلة', en: 'Delete recorded expenses' },
  { key: 'settle_voucher', ar: 'تسوية وإقفال المطالبات', en: 'Settle & close vouchers' },
  { key: 'replace_custody', ar: 'طلب استعاضة العهدة النقدية', en: 'Request replenishment' },
  { key: 'view_reports', ar: 'عرض وتصدير التقارير المالية', en: 'View financial reports' },
  { key: 'manage_settings', ar: 'إدارة الإعدادات والنسخ', en: 'Manage settings & backups' },
] as const;

export interface DerivedScopeResult {
  region_id: string | null;
  station_id: string | null;
  company_id?: string | null;
  unlinked?: boolean;
  unlinkedMessage?: string | null;
  warning?: string | null;
}

export function deriveScopeIdsFromOrgUnit(
  orgUnitId: string | null,
  role: string
): DerivedScopeResult {
  // 1. If !orgUnitId → { region_id: null, station_id: null, company_id: defaultCompId }
  if (!orgUnitId) {
    const defaultCompId = CustodyDB.getSelectedCompanyId() || StorageEngine.getStored<string>('selected_company_id', '') || (CustodyDB.getCompanies()[0]?.id || null);
    return {
      region_id: null,
      station_id: null,
      company_id: defaultCompId,
      unlinked: false,
      unlinkedMessage: null
    };
  }

  // 2. Load organization_units, regions, stations
  const units = StorageEngine.getStored<OrganizationUnit[]>('organization_units', []);
  const allStations = CustodyDB.getStations();
  const allRegions = CustodyDB.getRegions();

  // Find target unit by id or code
  const unit = units.find(u => u.id === orgUnitId || u.code === orgUnitId);

  // Helper: station resolution
  // resolve ONLY via:
  // - metadata.legacyStationId / legacy_station_id
  // - station.org_unit_id === targetId || targetId === `org-unit-station-${s.id}` || s.id === targetId
  // - targetId startsWith('org-unit-station-')
  // - targetUnit.typeId === 'out-station' || targetUnit.typeId === 'out-branch'
  // STRICTLY FORBIDDEN: Name or substring heuristics
  const resolveStation = (targetUnit?: OrganizationUnit | null, targetId?: string) => {
    const legacyStnId = targetUnit?.metadata?.legacyStationId || targetUnit?.metadata?.legacy_station_id;
    if (legacyStnId) {
      const stn = allStations.find(s => s.id === legacyStnId);
      if (stn) return stn;
      return {
        id: legacyStnId,
        org_unit_id: targetUnit?.id,
        company_id: targetUnit?.companyId || (targetUnit as any)?.company_id,
        region_id: targetUnit?.metadata?.legacyRegionId || targetUnit?.metadata?.legacy_region_id || null
      } as any;
    }

    if (targetId) {
      const stn = allStations.find(s =>
        s.org_unit_id === targetId ||
        targetId === `org-unit-station-${s.id}` ||
        s.id === targetId
      );
      if (stn) return stn;

      if (targetId.startsWith('org-unit-station-')) {
        const parsedId = targetId.replace('org-unit-station-', '');
        return {
          id: parsedId,
          org_unit_id: targetId,
          company_id: targetUnit?.companyId || (targetUnit as any)?.company_id,
          region_id: null
        } as any;
      }
    }

    if (targetUnit && (targetUnit.typeId === 'out-station' || targetUnit.typeId === 'out-branch')) {
      return {
        id: targetUnit.id,
        name: targetUnit.name,
        code: targetUnit.code,
        company_id: targetUnit.companyId || (targetUnit as any)?.company_id,
        org_unit_id: targetUnit.id,
        region_id: targetUnit.metadata?.legacyRegionId || targetUnit.metadata?.legacy_region_id || null
      } as any;
    }

    return null;
  };

  // Helper: region resolution
  // resolve ONLY via:
  // - metadata.legacyRegionId / legacy_region_id
  // - region.org_unit_id === targetId || targetId === `org-unit-region-${r.id}` || r.id === targetId
  // - targetId startsWith('org-unit-region-')
  // - targetUnit.typeId === 'out-region' or REGION_TYPE_IDS
  // STRICTLY FORBIDDEN: Name or substring heuristics or synthetic region fallback when record does not exist
  const resolveRegion = (targetUnit?: OrganizationUnit | null, targetId?: string) => {
    const legacyRegId = targetUnit?.metadata?.legacyRegionId || targetUnit?.metadata?.legacy_region_id;
    if (legacyRegId) {
      const reg = allRegions.find(r => r.id === legacyRegId);
      if (reg) return reg;
      return null;
    }

    if (targetId) {
      const reg = allRegions.find(r =>
        r.org_unit_id === targetId ||
        targetId === `org-unit-region-${r.id}` ||
        r.id === targetId
      );
      if (reg) return reg;

      if (targetId.startsWith('org-unit-region-')) {
        const parsedId = targetId.replace('org-unit-region-', '');
        const reg2 = allRegions.find(r => r.id === parsedId);
        if (reg2) return reg2;
        return null;
      }
    }

    if (targetUnit && (targetUnit.typeId === 'out-region' || REGION_TYPE_IDS.includes(targetUnit.typeId))) {
      const reg = allRegions.find(r =>
        r.org_unit_id === targetUnit.id ||
        r.id === targetUnit.id ||
        (targetUnit.metadata?.legacyRegionId && r.id === targetUnit.metadata.legacyRegionId)
      );
      if (reg) return reg;
      return null;
    }

    return null;
  };

  // 3. Direct station resolution
  const matchedStation = resolveStation(unit, orgUnitId);
  let resolvedStationId: string | null = matchedStation ? matchedStation.id : null;
  let resolvedRegionId: string | null = matchedStation?.region_id || null;
  let resolvedCompanyId: string | null = unit?.companyId || (unit as any)?.company_id || matchedStation?.company_id || null;

  // 4. Direct region resolution
  const matchedRegion = resolveRegion(unit, orgUnitId);
  if (matchedRegion) {
    resolvedRegionId = matchedRegion.id;
    if (!resolvedCompanyId && matchedRegion.company_id) {
      resolvedCompanyId = matchedRegion.company_id;
    }
  }

  // 5. Ancestor fallback (for child units under a linked region/station)
  if (unit) {
    const ancestors: OrganizationUnit[] = [];
    const visited = new Set<string>([unit.id]);
    let curr = unit;
    while (curr.parentId && !visited.has(curr.parentId)) {
      visited.add(curr.parentId);
      const parent = units.find(u => u.id === curr.parentId);
      if (!parent) break;
      ancestors.push(parent);
      curr = parent;
    }

    if (ancestors.length === 0 && unit.path) {
      const segs = unit.path.split('/').filter(Boolean);
      segs.pop(); // remove self
      segs.reverse(); // nearest first
      for (const segId of segs) {
        if (!visited.has(segId)) {
          visited.add(segId);
          const u = units.find(item => item.id === segId);
          if (u) ancestors.push(u);
        }
      }
    }

    for (const ancestor of ancestors) {
      if (!resolvedCompanyId && (ancestor.companyId || (ancestor as any).company_id)) {
        resolvedCompanyId = ancestor.companyId || (ancestor as any).company_id;
      }
      if (!resolvedStationId) {
        const ancStation = resolveStation(ancestor, ancestor.id);
        if (ancStation) {
          resolvedStationId = ancStation.id;
          if (!resolvedRegionId && ancStation.region_id) {
            resolvedRegionId = ancStation.region_id;
          }
          if (!resolvedCompanyId && ancStation.company_id) {
            resolvedCompanyId = ancStation.company_id;
          }
        }
      }
      if (!resolvedRegionId) {
        const ancRegion = resolveRegion(ancestor, ancestor.id);
        if (ancRegion) {
          resolvedRegionId = ancRegion.id;
          if (!resolvedCompanyId && ancRegion.company_id) {
            resolvedCompanyId = ancRegion.company_id;
          }
        }
      }
    }
  }

  if (!resolvedCompanyId) {
    resolvedCompanyId = CustodyDB.getSelectedCompanyId() || StorageEngine.getStored<string>('selected_company_id', '') || (CustodyDB.getCompanies()[0]?.id || null);
  }

  const isRegionLike = unit && (unit.typeId === 'out-region' || REGION_TYPE_IDS.includes(unit.typeId));
  const isUnlinked = (isRegionLike && !resolvedRegionId) || (!resolvedRegionId && !resolvedStationId);
  const unlinkedMessage = isUnlinked
    ? (isRegionLike && !resolvedRegionId
        ? 'الوحدة التنظيمية المحددة كمنطقة غير مرتبطة بسجل منطقة معتمد في قاعدة البيانات / The selected region unit is not linked to an official region record in the database.'
        : 'الوحدة التنظيمية المحددة غير مرتبطة بسجل منطقة أو محطة / The selected organizational unit is not linked to a Region or Station record.')
    : null;

  return {
    region_id: resolvedRegionId,
    station_id: resolvedStationId,
    company_id: resolvedCompanyId,
    unlinked: isUnlinked,
    unlinkedMessage
  };
}

export default function Settings({ 
  language, 
  theme,
  initialTab,
  initialCenterTab,
  initialSelectedCompanyId,
  onNavigate
}: SettingsProps) {
  useScreenListeners(['logs', 'AuditLogs']);

  const t = translations[language];
  const isRtl = language === 'ar';

  const currentUser = CustodyDB.getActiveUser();

  // Tab State
  const [activeTab, setActiveTab] = useState<'general' | 'users' | 'workflows'>(initialTab || 'general');
  const [centerTab, setCenterTab] = useState<'users' | 'org_structure' | 'modules' | 'companies'>(initialCenterTab || 'users');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(initialSelectedCompanyId || CustodyDB.getSelectedCompanyId() || '');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (initialCenterTab) {
      setCenterTab(initialCenterTab);
    }
  }, [initialCenterTab]);

  useEffect(() => {
    if (initialSelectedCompanyId) {
      setSelectedCompanyId(initialSelectedCompanyId);
      CustodyDB.setSelectedCompanyId(initialSelectedCompanyId);
    }
  }, [initialSelectedCompanyId]);

  useEffect(() => {
    const handleNavigateEvent = (e: any) => {
      const detail = e?.detail;
      if (!detail) return;
      if (detail.tab === 'settings') {
        if (detail.settingsTab === 'permissions' || detail.settingsTab === 'users' || detail.settingsTab === 'access_control') {
          setActiveTab('users');
        } else if (detail.settingsTab === 'workflows') {
          setActiveTab('workflows');
        } else if (detail.settingsTab === 'general') {
          setActiveTab('general');
        }
        if (detail.centerTab) {
          setCenterTab(detail.centerTab);
        } else if (detail.settingsTab === 'companies') {
          setActiveTab('users');
          setCenterTab('companies');
        } else if (detail.settingsTab === 'org_structure') {
          setActiveTab('users');
          setCenterTab('org_structure');
        } else if (detail.settingsTab === 'modules') {
          setActiveTab('users');
          setCenterTab('modules');
        }
        if (detail.selectedCompanyId) {
          setSelectedCompanyId(detail.selectedCompanyId);
          CustodyDB.setSelectedCompanyId(detail.selectedCompanyId);
        }
      }
    };

    window.addEventListener('navigate_tab', handleNavigateEvent);
    return () => {
      window.removeEventListener('navigate_tab', handleNavigateEvent);
    };
  }, []);

  // General Settings State
  const [companyName, setCompanyName] = useState(() => CustodyDB.getConfig().company_name);
  const [custodyValue, setCustodyValue] = useState(() => String(CustodyDB.getConfig().custody_value));
  const [useCustomTemplate, setUseCustomTemplate] = useState(() => CustodyDB.getConfig().use_custom_template || false);
  const [customTemplateImage, setCustomTemplateImage] = useState(() => CustodyDB.getConfig().custom_template_image || '');

  // Infrastructure Lists
  const [regions, setRegions] = useState<Region[]>(() => CustodyDB.getScopedRegions());
  const [stations, setStations] = useState<Station[]>(() => CustodyDB.getScopedStations());

  // Regions Form & Edit State
  const [newRegName, setNewRegName] = useState('');
  const [newRegCode, setNewRegCode] = useState('');
  const [editingRegionId, setEditingRegionId] = useState<string | null>(null);
  const [editRegName, setEditRegName] = useState('');
  const [editRegCode, setEditRegCode] = useState('');

  // Stations Form & Edit State
  const [newStnName, setNewStnName] = useState('');
  const [newStnCode, setNewStnCode] = useState('');
  const [newStnCustody, setNewStnCustody] = useState('');
  const [newStnRegionId, setNewStnRegionId] = useState('');
  const [editingStationId, setEditingStationId] = useState<string | null>(null);
  const [editStnName, setEditStnName] = useState('');
  const [editStnCode, setEditStnCode] = useState('');
  const [editStnCustody, setEditStnCustody] = useState('');
  const [editStnRegionId, setEditStnRegionId] = useState('');

  // Users Lists & Edit State
  const [users, setUsers] = useState<AppUser[]>(() => CustodyDB.getUsers());
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserMustChangePassword, setNewUserMustChangePassword] = useState(true);
  const [newUserRole, setNewUserRole] = useState<UserRole>('StationAdmin');
  const [newUserStationId, setNewUserStationId] = useState('');
  const [newUserRegionId, setNewUserRegionId] = useState('');
  const [newUserOrgUnitId, setNewUserOrgUnitId] = useState('');
  const [newUserAssignedOrgUnitIds, setNewUserAssignedOrgUnitIds] = useState<string[]>([]);
  const [newUserCompanyId, setNewUserCompanyId] = useState('');
  const [createdUserSuccess, setCreatedUserSuccess] = useState<{
    fullName: string;
    email: string;
    companyId: string;
    temporaryPassword: string;
  } | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  // Edit User State
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserFullName, setEditUserFullName] = useState('');
  const [editUserRole, setEditUserRole] = useState<UserRole>('StationAdmin');
  const [editUserStationId, setEditUserStationId] = useState('');
  const [editUserRegionId, setEditUserRegionId] = useState('');
  const [editUserOrgUnitId, setEditUserOrgUnitId] = useState('');
  const [editUserAssignedOrgUnitIds, setEditUserAssignedOrgUnitIds] = useState<string[]>([]);
  const [editUserIsActive, setEditUserIsActive] = useState<boolean>(true);
  const [editUserPermissions, setEditUserPermissions] = useState<UserPermissions>({
    manage_settings: false,
    create_expense: false,
    settle_voucher: false,
    delete_expense: false,
    view_reports: false
  });
  const [editUserIsDefaultMode, setEditUserIsDefaultMode] = useState<boolean>(true);

  const [pendingMappings, setPendingMappings] = useState<Record<string, { stationId?: string; regionId?: string; org_unit_id?: string }>>({});

  const [toastMessage, setToastMessage] = useState('');

  // Platform Admin Security Settings State
  const [currentAdminPassword, setCurrentAdminPassword] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('');
  const [adminSecurityError, setAdminSecurityError] = useState('');
  const [adminSecuritySuccess, setAdminSecuritySuccess] = useState('');
  const [adminEmailResetStep, setAdminEmailResetStep] = useState(0); // 0: Idle, 1: Sending, 2: Code Sent, 3: Success
  const [adminGeneratedCode, setAdminGeneratedCode] = useState('');
  const [adminResetCodeInput, setAdminResetCodeInput] = useState('');

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  const handleUpdateAdminPasswordDirectly = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminSecurityError('');
    setAdminSecuritySuccess('');

    if (newAdminPassword.length < 4) {
      setAdminSecurityError(isRtl ? '❌ يجب ألا تقل كلمة المرور الجديدة عن 4 أحرف.' : '❌ Password must be at least 4 characters long.');
      return;
    }

    if (newAdminPassword !== confirmAdminPassword) {
      setAdminSecurityError(isRtl ? '❌ كلمات المرور الجديدة غير متطابقة.' : '❌ Passwords do not match.');
      return;
    }

    const usersList = CustodyDB.getUsers();
    const adminUser = usersList.find(u => u.role === 'SystemAdmin' && CustodyDB.isPlatformOwner(u.email));

    if (!adminUser) {
      setAdminSecurityError(isRtl ? '❌ لم يتم العثور على حساب أدمن المنصة في قاعدة البيانات!' : '❌ Platform Admin account not found.');
      return;
    }

    if (adminUser.password && adminUser.password !== currentAdminPassword) {
      setAdminSecurityError(isRtl ? '❌ كلمة المرور الحالية غير صحيحة.' : '❌ Current password is incorrect.');
      return;
    }

    const updated = usersList.map(u => {
      if (u.id === adminUser.id) {
        return { ...u, password: newAdminPassword };
      }
      return u;
    });

    await CustodyDB.saveUsers(updated);
    setAdminSecuritySuccess(isRtl ? '✅ تم تحديث كلمة مرور أدمن المنصة وحفظها بنجاح!' : '✅ Platform Admin password updated successfully.');
    setCurrentAdminPassword('');
    setNewAdminPassword('');
    setConfirmAdminPassword('');
  };

  const handleTriggerAdminEmailReset = () => {
    setAdminSecurityError('');
    setAdminSecuritySuccess('');
    setAdminEmailResetStep(1);

    setTimeout(() => {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      setAdminGeneratedCode(code);
      setAdminEmailResetStep(2);
      setAdminSecuritySuccess(isRtl 
        ? '📩 تم إرسال كود التحقق الأمني السري إلى بريدك بنجاح! راجع محاكي علبة الوارد بالأسفل.' 
        : '📩 Security verification code sent to your email! Please check the simulator card below.'
      );
    }, 1200);
  };

  const handleVerifyAdminEmailCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminSecurityError('');
    setAdminSecuritySuccess('');

    if (adminResetCodeInput.trim() !== adminGeneratedCode) {
      setAdminSecurityError(isRtl ? '❌ كود التحقق المدخل غير صحيح.' : '❌ Invalid verification code.');
      return;
    }

    if (newAdminPassword.length < 4) {
      setAdminSecurityError(isRtl ? '❌ يجب ألا تقل كلمة المرور الجديدة عن 4 أحرف.' : '❌ New password must be at least 4 characters.');
      return;
    }

    const usersList = CustodyDB.getUsers();
    const updated = usersList.map(u => {
      const isPlatformAdmin = u.email && CustodyDB.isPlatformOwner(u.email);
      if (isPlatformAdmin) {
        return { ...u, password: newAdminPassword };
      }
      return u;
    });

    await CustodyDB.saveUsers(updated);
    setAdminEmailResetStep(3);
    setAdminSecuritySuccess(isRtl ? '🎉 تم تحديث كلمة مرور أدمن المنصة بنجاح عبر البريد الإلكتروني!' : '🎉 Password successfully updated via email code!');
    setNewAdminPassword('');
    setConfirmAdminPassword('');
    setAdminResetCodeInput('');
  };

  useEffect(() => {
    const handleUpdate = () => {
      setCompanyName(CustodyDB.getConfig().company_name);
      setCustodyValue(String(CustodyDB.getConfig().custody_value));
      setRegions(CustodyDB.getScopedRegions());
      setStations(CustodyDB.getScopedStations());
      setUsers(CustodyDB.getScopedUsers());
    };
    window.addEventListener('custody_db_updated', handleUpdate);
    return () => {
      window.removeEventListener('custody_db_updated', handleUpdate);
    };
  }, []);

  // 1. Access Security Check: Only Admin and SystemAdmin roles can enter Settings
  if (!currentUser || (currentUser.role !== 'Admin' && currentUser.role !== 'SystemAdmin')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="h-16 w-16 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mb-4">
          <Lock size={32} />
        </div>
        <h3 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">
          {t.accessDenied}
        </h3>
        <p className="text-xs text-slate-500 max-w-sm mt-2">
          {isRtl 
            ? 'تتطلب هذه الصفحة صلاحيات مدير النظام (Admin). يرجى التبديل لحساب "أحمد السيد" لتجربة الإعدادات.' 
            : 'Access is restricted to Admin role credentials. Please switch your profile session to modify configuration.'
          }
        </p>
      </div>
    );
  }

  // --- GENERAL SETTINGS ACTIONS ---
  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();

    CustodyDB.saveConfig({
      company_name: companyName.trim(),
      custody_value: 0,
      use_custom_template: useCustomTemplate,
      custom_template_image: customTemplateImage
    });

    triggerToast(isRtl ? 'تم حفظ التعديلات العامة وتعميمها بنجاح' : 'General parameters saved and synchronized.');
  };

  // Backup Data to JSON
  const handleBackupData = () => {
    try {
      const backupObj = {
        companies: CustodyDB.getCompanies(),
        regions: CustodyDB.getRegions(),
        stations: CustodyDB.getStations(),
        categories: CustodyDB.getCategories(),
        users: CustodyDB.getUsers(),
        transactions: CustodyDB.getTransactions(),
        logs: CustodyDB.getLogs()
      };

      const dataStr = JSON.stringify(backupObj, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

      const exportFileDefaultName = `kemiterp-backup-${new Date().toISOString().slice(0, 10)}.json`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();

      CustodyDB.addLog(
        currentUser.id,
        currentUser.full_name,
        'Export Backup',
        'Successfully downloaded complete platform database snapshot.'
      );
      triggerToast(isRtl ? 'تم تصدير نسخة احتياطية كاملة بنجاح.' : 'JSON Database snapshot exported successfully.');
    } catch (e) {
      alert(isRtl ? 'فشل تصدير البيانات.' : 'Backup failed.');
    }
  };

  // Restore Data from JSON
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

        // Write directly to local DB
        CustodyDB.saveCompanies(parsed.companies);
        if (parsed.regions) CustodyDB.saveRegions(parsed.regions);
        if (parsed.stations) CustodyDB.saveStations(parsed.stations);
        if (parsed.categories) CustodyDB.saveCategories(parsed.categories);
        await CustodyDB.saveUsers(parsed.users);
        CustodyDB.saveTransactions(parsed.transactions);

        // Reload page states
        setCompanyName(CustodyDB.getConfig().company_name);
        setCustodyValue(String(CustodyDB.getConfig().custody_value));
        setRegions(CustodyDB.getScopedRegions());
        setStations(CustodyDB.getScopedStations());
        setUsers(CustodyDB.getScopedUsers());

        CustodyDB.addLog(
          currentUser.id,
          currentUser.full_name,
          'Restore Backup',
          `Restored platform snapshot containing ${parsed.transactions.length} records and ${parsed.users.length} user profiles.`
        );

        triggerToast(isRtl ? 'تم استعادة قاعدة البيانات وتحديث النظام بالكامل بنجاح!' : 'Database successfully restored and synchronized.');
      } catch (err) {
        alert(isRtl ? 'فشل قراءة الملف كبنية JSON صالحة.' : 'Failed to parse JSON backup file.');
      } finally {
        if (e.target) e.target.value = '';
      }
    };
    fileReader.readAsText(file);
  };

  // --- REGIONS ACTIONS ---
  const handleAddRegion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRegName.trim()) return;

    CustodyDB.addRegion(newRegName.trim(), '');
    setRegions(CustodyDB.getScopedRegions());
    setNewRegName('');
    setNewRegCode('');
    triggerToast(isRtl ? 'تم إنشاء المنطقة الجغرافية الجديدة بنجاح.' : 'Geographical region added.');
  };

  const handleStartEditRegion = (reg: Region) => {
    setEditingRegionId(reg.id);
    setEditRegName(reg.name);
    setEditRegCode('');
  };

  const handleSaveEditRegion = (id: string) => {
    if (!editRegName.trim()) return;
    CustodyDB.updateRegion(id, {
      name: editRegName.trim(),
      code: ''
    });
    setRegions(CustodyDB.getScopedRegions());
    setEditingRegionId(null);
    triggerToast(isRtl ? 'تم تحديث بيانات المنطقة.' : 'Geographical region updated.');
  };

  const handleDeleteRegion = (id: string) => {
    if (!confirm(isRtl ? 'هل أنت متأكد من حذف هذه المنطقة؟ سيتم فصل فروعها التابعة.' : 'Delete this region? This will detach its stations.')) return;
    CustodyDB.deleteRegion(id);
    setRegions(CustodyDB.getScopedRegions());
    triggerToast(isRtl ? 'تم حذف المنطقة بنجاح.' : 'Region deleted.');
  };

  // --- STATIONS ACTIONS ---
  const handleAddStation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStnName.trim() || !newStnCode.trim() || !newStnCustody.trim()) return;

    const amount = parseFloat(newStnCustody);
    if (isNaN(amount) || amount < 0) return;

    CustodyDB.addStation(
      newStnName.trim(),
      newStnCode.trim().toUpperCase(),
      amount,
      newStnRegionId || undefined
    );
    setStations(CustodyDB.getScopedStations());
    setNewStnName('');
    setNewStnCode('');
    setNewStnCustody('');
    triggerToast(isRtl ? 'تم إنشاء فرع/محطة الصرف والصندوق التابع بنجاح.' : 'Station added.');
  };

  const handleStartEditStation = (stn: Station) => {
    setEditingStationId(stn.id);
    setEditStnName(stn.station_name);
    setEditStnCode(stn.station_code);
    setEditStnCustody(String(stn.custody_amount));
    setEditStnRegionId(stn.region_id || '');
  };

  const handleSaveEditStation = (id: string) => {
    const amount = parseFloat(editStnCustody);
    if (!editStnName.trim() || !editStnCode.trim() || isNaN(amount)) return;

    CustodyDB.updateStation(id, {
      station_name: editStnName.trim(),
      station_code: editStnCode.trim().toUpperCase(),
      custody_amount: amount,
      region_id: editStnRegionId || undefined
    });
    setStations(CustodyDB.getScopedStations());
    setEditingStationId(null);
    triggerToast(isRtl ? 'تم حفظ تعديلات المحطة.' : 'Station updated.');
  };

  const handleDeleteStation = (id: string) => {
    if (!confirm(isRtl ? 'هل تريد حذف هذه المحطة؟' : 'Are you sure you want to delete this station?')) return;
    CustodyDB.deleteStation(id);
    setStations(CustodyDB.getScopedStations());
    triggerToast(isRtl ? 'تم حذف المحطة.' : 'Station deleted.');
  };

  // Helper to fetch authorization headers for secure user admin API
  const getAuthHeaders = async () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    try {
      const token = await auth.currentUser?.getIdToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } catch (err) {
      console.warn('Failed to retrieve ID token:', err);
    }
    return headers;
  };

  // --- USERS ACTIONS ---
  const handleAddUser = async (e: React.FormEvent): Promise<boolean> => {
    e.preventDefault();
    if (currentUser.role !== 'SystemAdmin' && currentUser.role !== 'Admin' && !currentUser.permissions?.manage_users) {
      alert(isRtl ? '⚠️ هذه الصلاحية حصرية لإدارة المنصة والشركة فقط!' : '⚠️ Privilege restricted to Platform & Company Admins.');
      return false;
    }
    if (!newUserName.trim() || !newUserEmail.trim()) return false;

    const trimmedPassword = newUserPassword ? newUserPassword.trim() : '';
    if (trimmedPassword && trimmedPassword.length < 12) {
      alert(isRtl ? '⚠️ كلمة المرور يجب أن لا تقل عن 12 حرفاً.' : '⚠️ Password must be at least 12 characters.');
      return false;
    }

    const isUserAdmin = newUserRole === 'Admin' || newUserRole === 'SystemAdmin';
    const isRegional = newUserRole === 'RegionalManager';
    const isStationAdmin = newUserRole === 'StationAdmin';

    const derived = deriveScopeIdsFromOrgUnit(newUserOrgUnitId, newUserRole);

    if (newUserOrgUnitId && derived.unlinked && (isRegional || isStationAdmin)) {
      alert(`⚠️ ${derived.unlinkedMessage || (isRtl ? 'الوحدة التنظيمية المحددة غير مرتبطة بسجل منطقة أو محطة' : 'The selected organizational unit is not linked to a Region or Station record.')}`);
      return false;
    }

    if (isRegional && (!derived.region_id || derived.unlinked)) {
      alert(isRtl
        ? '⚠️ لا يمكن حفظ المستخدم: يجب اختيار وحدة تنظيمية تابعة لمنطقة صالحة وموثقة في قاعدة البيانات لمدير المنطقة!'
        : '⚠️ Cannot create user: A valid region-linked organizational unit must be selected for Regional Manager!');
      return false;
    }

    if (isStationAdmin && !derived.station_id && !newUserStationId) {
      alert(isRtl ? '⚠️ يجب اختيار وحدة تنظيمية تابعة لمحطة صالحة لمدير المحطة!' : '⚠️ A valid station-linked organizational unit must be selected for Station Manager!');
      return false;
    }

    // RegionalManager caller guard: cannot create StationAdmin for station outside creator's region
    const isCallerRegionalManager = (currentUser.role as string) === 'RegionalManager' || (currentUser.role as string) === 'BranchManager';
    if (isCallerRegionalManager && isStationAdmin) {
      const creatorRegionId = currentUser.region_id;
      if (creatorRegionId && derived.region_id && derived.region_id !== creatorRegionId) {
        alert(isRtl ? '⚠️ غير مصرح: مصرح فقط بإنشاء مدراء محطات تابعين لمنطقتك!' : '⚠️ Forbidden: You can only create station admins for stations within your assigned region!');
        return false;
      }
    }

    const permissions = {
      manage_settings: isUserAdmin,
      create_expense: isUserAdmin || isStationAdmin,
      settle_voucher: isUserAdmin || isStationAdmin,
      delete_expense: isUserAdmin,
      view_reports: true
    };

    let effectiveCompanyId: string;
    if (currentUser.role === 'Admin' && currentUser.company_id) {
      effectiveCompanyId = currentUser.company_id;
    } else {
      const companyId = CustodyDB.getSelectedCompanyId() || '';
      effectiveCompanyId =
        newUserCompanyId ||
        companyId ||
        derived.company_id ||
        currentUser.company_id ||
        StorageEngine.getStored<string>('selected_company_id', '') ||
        (CustodyDB.getCompanies()[0]?.id || '');
    }

    const payload: any = {
      email: newUserEmail.trim().toLowerCase(),
      full_name: newUserName.trim(),
      role: newUserRole,
      company_id: effectiveCompanyId,
      region_id: isRegional ? (derived.region_id || null) : null,
      station_id: isStationAdmin ? (derived.station_id || newUserStationId || null) : null,
      org_unit_id: newUserOrgUnitId || null,
      assigned_org_unit_ids: newUserAssignedOrgUnitIds.length > 0 ? newUserAssignedOrgUnitIds : [],
      permissions: permissions,
      must_change_password: newUserMustChangePassword !== undefined ? newUserMustChangePassword : true
    };

    if (trimmedPassword) {
      payload.password = trimmedPassword;
    }

    try {
      const data = await createManagedUser(payload);

      if (!data.success) {
        const errMsg = data.message || (isRtl ? 'فشل إنشاء حساب المستخدم' : 'Failed to create user');
        alert(`⚠️ ${errMsg}`);
        return false;
      }

      if (data.user) {
        const allUsers = CustodyDB.getUsers();
        const existingIdx = allUsers.findIndex(u => u.id === data.user.id);
        if (existingIdx >= 0) {
          allUsers[existingIdx] = data.user;
        } else {
          allUsers.push(data.user);
        }
        await CustodyDB.saveUsers(allUsers);
        setUsers(allUsers);
      } else {
        setUsers(CustodyDB.getUsers());
      }

      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserMustChangePassword(true);
      setNewUserOrgUnitId('');
      setNewUserAssignedOrgUnitIds([]);
      setNewUserStationId('');
      setNewUserRegionId('');

      const tempPass = data.temporaryPassword || '';
      const displayCompanyId = effectiveCompanyId;
      if (tempPass) {
        setCreatedUserSuccess({
          fullName: newUserName.trim(),
          email: payload.email,
          companyId: displayCompanyId,
          temporaryPassword: tempPass
        });
        setCopiedPassword(false);
      }

      alert(isRtl
        ? `✅ تم إنشاء وتوثيق حساب الموظف بنجاح!\n\nالشركة: ${displayCompanyId}\nالبريد: ${payload.email}${tempPass ? `\nكلمة المرور المؤقتة هي: ${tempPass}` : ''}\n\nيرجى تسليمها للموظف لاستخدامها عند تسجيل الدخول لأول مرة.`
        : `✅ User account created and provisioned successfully!\n\nCompany: ${displayCompanyId}\nEmail: ${payload.email}${tempPass ? `\nTemporary Password: ${tempPass}` : ''}\n\nPlease share this temporary password with the user.`
      );

      triggerToast(isRtl ? 'تم إضافة وتوثيق حساب المستخدم بنجاح.' : 'New user created successfully.');
      return true;
    } catch (err: any) {
      alert(isRtl ? `⚠️ خطأ في الاتصال بالخادم: ${err.message}` : `⚠️ Server connection error: ${err.message}`);
      return false;
    }
  };

  const handleStartEditUser = (u: AppUser) => {
    setEditingUserId(u.id);
    setEditUserFullName(u.full_name);
    setEditUserRole(u.role);
    setEditUserStationId(u.station_id || '');
    setEditUserRegionId(u.region_id || '');
    setEditUserOrgUnitId(u.org_unit_id || '');
    setEditUserAssignedOrgUnitIds(u.assigned_org_unit_ids || []);
    setEditUserIsActive(u.is_active !== false);
    setEditUserPermissions({ ...u.permissions });

    // Check if permissions match default permissions for this role
    const defaults = CustodyDB.enrichUserPermissions(u.role);
    const keysToCheck = ['create_expense', 'delete_expense', 'settle_voucher', 'replace_custody', 'view_reports', 'manage_settings'];
    const isMatching = keysToCheck.every(k => !!u.permissions[k as keyof UserPermissions] === !!defaults[k as keyof UserPermissions]);
    setEditUserIsDefaultMode(isMatching);
  };

  const handleEditUserRoleChange = (role: UserRole) => {
    setEditUserRole(role);
    if (editUserIsDefaultMode) {
      setEditUserPermissions(CustodyDB.enrichUserPermissions(role));
    }
  };

  const handleEditUserToggleMode = (useDefault: boolean) => {
    setEditUserIsDefaultMode(useDefault);
    if (useDefault) {
      setEditUserPermissions(CustodyDB.enrichUserPermissions(editUserRole));
    }
  };

  const handleSaveEditUser = async (id: string) => {
    const targetUser = users.find(u => u.id === id);
    if (!targetUser) return;

    const accessCheck = UsersModule.canUserManageTargetUser(currentUser, targetUser);
    if (!accessCheck.allowed) {
      alert(`⚠️ ${accessCheck.reason || (isRtl ? 'ليس لديك صلاحية لتعديل هذا المستخدم!' : 'Insufficient permissions to edit this user!')}`);
      return;
    }
    if (!editUserFullName.trim()) return;

    const derived = deriveScopeIdsFromOrgUnit(editUserOrgUnitId, editUserRole);

    let effectiveCompanyId: string;
    if (currentUser.role === 'Admin' && currentUser.company_id) {
      effectiveCompanyId = currentUser.company_id;
    } else {
      const companyId = targetUser.company_id || CustodyDB.getSelectedCompanyId() || '';
      effectiveCompanyId =
        companyId ||
        derived.company_id ||
        currentUser.company_id ||
        StorageEngine.getStored<string>('selected_company_id', '') ||
        (CustodyDB.getCompanies()[0]?.id || '');
    }

    if (editUserOrgUnitId && derived.unlinked && (editUserRole === 'RegionalManager' || editUserRole === 'StationAdmin')) {
      alert(`⚠️ ${derived.unlinkedMessage || (isRtl ? 'الوحدة التنظيمية المحددة غير مرتبطة بسجل منطقة أو محطة' : 'The selected organizational unit is not linked to a Region or Station record.')}`);
      return;
    }

    if (editUserRole === 'RegionalManager' && (!derived.region_id || derived.unlinked)) {
      alert(isRtl
        ? '⚠️ لا يمكن تحديث المستخدم: يجب اختيار وحدة تنظيمية تابعة لمنطقة صالحة وموثقة في قاعدة البيانات لمدير المنطقة!'
        : '⚠️ Cannot update user: A valid region-linked organizational unit must be selected for Regional Manager!');
      return;
    }

    if (editUserRole === 'StationAdmin' && !derived.station_id) {
      alert(isRtl ? '⚠️ يجب اختيار وحدة تنظيمية تابعة لمحطة صالحة لمدير المحطة!' : '⚠️ A valid station-linked organizational unit must be selected for Station Manager!');
      return;
    }

    // RegionalManager caller guard: cannot edit StationAdmin for station outside creator's region
    const isCallerRegionalManager = (currentUser.role as string) === 'RegionalManager' || (currentUser.role as string) === 'BranchManager';
    if (isCallerRegionalManager && editUserRole === 'StationAdmin') {
      const creatorRegionId = currentUser.region_id;
      if (creatorRegionId && derived.region_id && derived.region_id !== creatorRegionId) {
        alert(isRtl ? '⚠️ غير مصرح: مصرح فقط بتعيين مدراء محطات تابعين لمنطقتك!' : '⚠️ Forbidden: You can only assign station admins to stations within your assigned region!');
        return;
      }
    }

    const payload = {
      full_name: editUserFullName.trim(),
      role: editUserRole,
      company_id: effectiveCompanyId,
      region_id: editUserRole === 'RegionalManager' ? (derived.region_id || null) : null,
      station_id: editUserRole === 'StationAdmin' ? (derived.station_id || null) : null,
      org_unit_id: editUserOrgUnitId || null,
      assigned_org_unit_ids: editUserAssignedOrgUnitIds.length > 0 ? editUserAssignedOrgUnitIds : [],
      is_active: editUserIsActive,
      permissions: editUserPermissions,
    };

    try {
      const data = await updateManagedUser(id, payload);

      if (!data.success) {
        const errMsg = data.message || (isRtl ? 'فشل تحديث بيانات المستخدم' : 'Failed to update user');
        alert(`⚠️ ${errMsg}`);
        return;
      }

      if (data.user) {
        const allUsers = CustodyDB.getUsers().map(u => u.id === id ? { ...u, ...data.user } : u);
        await CustodyDB.saveUsers(allUsers);
      }
      setUsers(CustodyDB.getScopedUsers());
      setEditingUserId(null);
      triggerToast(isRtl ? 'تم تحديث أدوار وصلاحيات الموظف بنجاح.' : 'User permissions successfully updated.');
    } catch (err: any) {
      alert(isRtl ? `⚠️ خطأ في الاتصال بالخادم: ${err.message}` : `⚠️ Server connection error: ${err.message}`);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (currentUser.role !== 'SystemAdmin') {
      alert(isRtl ? '⚠️ هذه الصلاحية حصرية لأدمن المنصة فقط!' : '⚠️ This privilege is exclusive to Platform Admins.');
      return;
    }
    if (id === currentUser.id) {
      alert(isRtl ? 'لا يمكن حذف حسابك النشط!' : 'You cannot delete your active session profile!');
      return;
    }
    if (!confirm(isRtl ? 'حذف حساب هذا الموظف وسحب الصلاحيات نهائياً؟' : 'Permanently remove this user and revoke access?')) return;

    try {
      const data = await deleteManagedUser(id);

      if (!data.success) {
        const errorMsg = data?.message || (isRtl ? 'فشل حذف المستخدم من الخادم.' : 'Server failed to delete user.');
        alert(isRtl ? `⚠️ خطأ أثناء حذف الحساب: ${errorMsg}` : `⚠️ Error deleting user: ${errorMsg}`);
        return;
      }

      // Successful server deletion: update local cache and UI
      const allUsers = CustodyDB.getUsers().filter(u => u.id !== id);
      await CustodyDB.saveUsers(allUsers);
      setUsers(CustodyDB.getScopedUsers());
      triggerToast(isRtl ? 'تم حذف حساب الموظف وسحب الصلاحيات.' : 'User deleted.');
    } catch (err: any) {
      const connErrorMsg = err?.message || (isRtl ? 'فشل الاتصال بالخادم.' : 'Could not connect to server.');
      alert(isRtl ? `⚠️ تعذر الاتصال بالخادم لحذف المستخدم: ${connErrorMsg}` : `⚠️ Server connection error while deleting user: ${connErrorMsg}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight md:text-2xl flex items-center gap-2">
            <SettingsIcon className="text-emerald-500" />
            <span>{t.settings}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isRtl 
              ? 'إدارة محددات الصناديق، صلاحيات الموظفين، الفروع الجغرافية، والنسخ الاحتياطي لقاعدة البيانات.' 
              : 'Configure general system parameters, corporate cash base, geographical stations, and database backups.'
            }
          </p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-1 overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2 text-xs font-black transition-all border-b-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'general'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-400'
          }`}
        >
          {isRtl ? '⚙️ الإعدادات العامة' : '⚙️ General Settings'}
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 text-xs font-black transition-all border-b-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'users'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-400'
          }`}
        >
          {isRtl ? '👥 الصلاحيات والوصول (شخص × فرع × موديول)' : '👥 Access Control & Scope'}
        </button>
        <button
          onClick={() => setActiveTab('workflows')}
          className={`px-4 py-2 text-xs font-black transition-all border-b-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'workflows'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-400'
          }`}
        >
          {isRtl ? '🔄 مسارات وسياسات الاعتماد' : '🔄 Approval Workflows'}
        </button>
      </div>

      {/* Success Toast Banner */}
      {toastMessage && (
        <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold animate-fade-in flex items-center gap-2">
          <CheckCircle size={14} className="text-emerald-500 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* --- TAB 1: GENERAL & BACKUP --- */}
      {activeTab === 'general' && (
        <SettingsGeneralTab
          language={language}
          theme={theme}
          currentUser={currentUser}
          companyName={companyName}
          setCompanyName={setCompanyName}
          custodyValue={custodyValue}
          setCustodyValue={setCustodyValue}
          useCustomTemplate={useCustomTemplate}
          setUseCustomTemplate={setUseCustomTemplate}
          customTemplateImage={customTemplateImage}
          setCustomTemplateImage={setCustomTemplateImage}
          regions={regions}
          stations={stations}
          handleSaveConfig={handleSaveConfig}
          handleBackupData={handleBackupData}
          handleRestoreData={handleRestoreData}
          currentAdminPassword={currentAdminPassword}
          setCurrentAdminPassword={setCurrentAdminPassword}
          newAdminPassword={newAdminPassword}
          setNewAdminPassword={setNewAdminPassword}
          confirmAdminPassword={confirmAdminPassword}
          setConfirmAdminPassword={setConfirmAdminPassword}
          adminSecurityError={adminSecurityError}
          adminSecuritySuccess={adminSecuritySuccess}
          adminEmailResetStep={adminEmailResetStep}
          setAdminEmailResetStep={setAdminEmailResetStep}
          adminGeneratedCode={adminGeneratedCode}
          adminResetCodeInput={adminResetCodeInput}
          setAdminResetCodeInput={setAdminResetCodeInput}
          handleUpdateAdminPasswordDirectly={handleUpdateAdminPasswordDirectly}
          handleTriggerAdminEmailReset={handleTriggerAdminEmailReset}
          handleVerifyAdminEmailCode={handleVerifyAdminEmailCode}
          setAdminSecurityError={setAdminSecurityError}
          setAdminSecuritySuccess={setAdminSecuritySuccess}
        />
      )}

      {/* --- TAB 2: UNIFIED ACCESS CONTROL & PERMISSIONS (شخص × فرع × موديول) --- */}
      {activeTab === 'users' && (
        <UnifiedAccessControlCenter
          language={language}
          theme={theme}
          currentUser={currentUser}
          users={users}
          regions={regions}
          stations={stations}
          editingUserId={editingUserId}
          setEditingUserId={setEditingUserId}
          editUserFullName={editUserFullName}
          setEditUserFullName={setEditUserFullName}
          editUserRole={editUserRole}
          editUserStationId={editUserStationId}
          setEditUserStationId={setEditUserStationId}
          editUserRegionId={editUserRegionId}
          setEditUserRegionId={setEditUserRegionId}
          editUserOrgUnitId={editUserOrgUnitId}
          setEditUserOrgUnitId={setEditUserOrgUnitId}
          editUserAssignedOrgUnitIds={editUserAssignedOrgUnitIds}
          setEditUserAssignedOrgUnitIds={setEditUserAssignedOrgUnitIds}
          editUserIsActive={editUserIsActive}
          setEditUserIsActive={setEditUserIsActive}
          editUserPermissions={editUserPermissions}
          setEditUserPermissions={setEditUserPermissions}
          editUserIsDefaultMode={editUserIsDefaultMode}
          handleEditUserRoleChange={handleEditUserRoleChange}
          handleEditUserToggleMode={handleEditUserToggleMode}
          handleSaveEditUser={handleSaveEditUser}
          handleDeleteUser={handleDeleteUser}
          handleStartEditUser={handleStartEditUser}
          newUserName={newUserName}
          setNewUserName={setNewUserName}
          newUserEmail={newUserEmail}
          setNewUserEmail={setNewUserEmail}
          newUserPassword={newUserPassword}
          setNewUserPassword={setNewUserPassword}
          newUserMustChangePassword={newUserMustChangePassword}
          setNewUserMustChangePassword={setNewUserMustChangePassword}
          newUserRole={newUserRole}
          setNewUserRole={setNewUserRole}
          newUserStationId={newUserStationId}
          setNewUserStationId={setNewUserStationId}
          newUserRegionId={newUserRegionId}
          setNewUserRegionId={setNewUserRegionId}
          newUserOrgUnitId={newUserOrgUnitId}
          setNewUserOrgUnitId={setNewUserOrgUnitId}
          newUserAssignedOrgUnitIds={newUserAssignedOrgUnitIds}
          setNewUserAssignedOrgUnitIds={setNewUserAssignedOrgUnitIds}
          newUserCompanyId={newUserCompanyId}
          setNewUserCompanyId={setNewUserCompanyId}
          handleAddUser={handleAddUser}
          getAuthHeaders={getAuthHeaders}
          setUsers={setUsers}
          triggerToast={triggerToast}
          initialCenterTab={centerTab}
          initialSelectedCompanyId={selectedCompanyId}
        />
      )}

      {activeTab === 'workflows' && (
        <ApprovalWorkflowManager
          companyId={currentUser.company_id || CustodyDB.getSelectedCompanyId() || ''}
          isRtl={isRtl}
          theme={theme}
        />
      )}

      {/* User Provisioning Success Modal with One-Click Copy */}
      {createdUserSuccess && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl border p-6 space-y-4 ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
                <CheckCircle size={22} />
              </div>
              <div>
                <h3 className="font-bold text-base">
                  {isRtl ? 'تم إنشاء وتوثيق الحساب بنجاح' : 'User Account Created Successfully'}
                </h3>
                <p className="text-xs text-slate-500">
                  {createdUserSuccess.fullName} ({createdUserSuccess.email})
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  {isRtl ? 'كلمة المرور المؤقتة:' : 'Temporary password:'}
                </span>
                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                  {isRtl ? 'لأول تسجيل دخول' : 'First-time login'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400 select-all">
                <span className="break-all">{createdUserSuccess.temporaryPassword}</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(createdUserSuccess.temporaryPassword);
                    setCopiedPassword(true);
                    triggerToast(isRtl ? 'تم النسخ' : 'Copied');
                    setTimeout(() => setCopiedPassword(false), 3000);
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-sans font-bold transition-colors cursor-pointer ${
                    copiedPassword
                      ? 'bg-emerald-600 text-white'
                      : 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60'
                  }`}
                >
                  {copiedPassword ? (
                    <>
                      <Check size={13} />
                      <span>{isRtl ? 'تم النسخ' : 'Copied'}</span>
                    </>
                  ) : (
                    <>
                      <Copy size={13} />
                      <span>{isRtl ? 'نسخ' : 'Copy'}</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isRtl
                  ? 'يرجى تسليم كلمة المرور للموظف لاستخدامها عند تسجيل الدخول لأول مرة.'
                  : 'Please share this temporary password with the user for their first login.'}
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setCreatedUserSuccess(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {isRtl ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
