import React, { useState, useMemo, useEffect } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import { 
  Users2, 
  ShieldCheck, 
  Building2, 
  MapPin, 
  Search, 
  Filter, 
  Edit2, 
  Trash2, 
  UserPlus, 
  Check, 
  X, 
  Car, 
  Receipt, 
  FileText, 
  BarChart3, 
  Sliders, 
  Layers, 
  AlertTriangle, 
  CheckCircle2, 
  HelpCircle, 
  Info,
  Lock,
  ChevronRight,
  Shield,
  Eye,
  CheckSquare,
  Square,
  Package,
  ShoppingCart,
  BookOpen,
  Landmark,
  Briefcase,
  Plus,
  Power,
  Sparkles,
  RefreshCw,
  KeyRound,
  Globe,
  ArrowRight,
  FolderTree,
  Boxes,
  CreditCard,
  UserCheck,
  Copy,
  EyeOff,
  Calendar,
  ArrowUpDown,
  SlidersHorizontal,
  Zap,
  Loader2
} from 'lucide-react';
import { 
  Language, 
  Theme, 
  AppUser, 
  UserRole, 
  Region, 
  Station, 
  UserPermissions, 
  OrganizationUnit,
  Company,
  SystemPermission,
  SignupRequest,
  AccountCorrectionRequest
} from '../../types';
import { auth } from '../../firebase';
import { CustodyDB, ModulesModule, ERP_MODULES_REGISTRY, CompanyModuleSettings } from '../../db';
import { UsersModule } from '../../db/users';
import { CompaniesModule } from '../../db/companies';
import { OrganizationEngine } from '../../db/organizationEngine';
import { OrganizationScopeEngine } from '../../db/organizationScopeEngine';
import { DEFAULT_PERMISSIONS, DEFAULT_ROLES } from '../../db/defaults';
import { deriveScopeIdsFromOrgUnit } from '../../pages/Settings';
import { createManagedUser, updateManagedUser } from '../../lib/userProvisioning';
import OrgUnitTreeSelect from '../OrgUnitTreeSelect';
import OrganizationTreeManager from '../OrganizationTreeManager';

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
    bgClass: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20',
    systemAdminOnly: true
  },
  {
    id: 'Admin',
    labelEn: 'Company Admin',
    labelAr: 'أدمن الشركة (Company Admin)',
    colorClass: 'text-rose-500 font-bold dark:text-rose-400',
    bgClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
  },
  {
    id: 'RegionalManager',
    labelEn: 'Regional Manager',
    labelAr: 'مدير منطقة / قطاع (Regional Manager)',
    colorClass: 'text-sky-600 font-semibold dark:text-sky-400',
    bgClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20'
  },
  {
    id: 'StationAdmin',
    labelEn: 'Station / Branch Admin',
    labelAr: 'مدير فرع / محطة / أمين عهدة',
    colorClass: 'text-emerald-600 font-semibold dark:text-emerald-400',
    bgClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
  }
];

import { 
  buildDynamicPermissionCategories, 
  generateRandomPassword as generateRandomPasswordHelper, 
  getUserActiveModules as getUserActiveModulesHelper, 
  getCategoryPermissionStatus as getCategoryPermissionStatusHelper, 
  getUserBranchLabel as getUserBranchLabelHelper,
  CATEGORY_METADATA_MAP,
  type DynamicModuleCategory,
  type ActiveModuleBadge,
  type CategoryPermissionStatus
} from './unifiedAccessHelpers';

export { 
  buildDynamicPermissionCategories, 
  generateRandomPasswordHelper as generateRandomPassword,
  getUserActiveModulesHelper as getUserActiveModules,
  getCategoryPermissionStatusHelper as getCategoryPermissionStatus,
  getUserBranchLabelHelper as getUserBranchLabel,
  CATEGORY_METADATA_MAP,
  type DynamicModuleCategory,
  type ActiveModuleBadge,
  type CategoryPermissionStatus
};

export interface UnifiedAccessControlCenterProps {
  language: Language;
  theme: Theme;
  currentUser: AppUser;
  users: AppUser[];
  regions: Region[];
  stations: Station[];
  editingUserId: string | null;
  setEditingUserId: (v: string | null) => void;
  editUserFullName: string;
  setEditUserFullName: (v: string) => void;
  editUserRole: UserRole;
  editUserStationId: string;
  setEditUserStationId: (v: string) => void;
  editUserRegionId: string;
  setEditUserRegionId: (v: string) => void;
  editUserOrgUnitId: string;
  setEditUserOrgUnitId: (v: string) => void;
  editUserAssignedOrgUnitIds: string[];
  setEditUserAssignedOrgUnitIds: (v: string[]) => void;
  editUserIsActive?: boolean;
  setEditUserIsActive?: (v: boolean) => void;
  editUserPermissions: UserPermissions;
  setEditUserPermissions: (v: UserPermissions) => void;
  editUserIsDefaultMode: boolean;
  handleEditUserRoleChange: (role: UserRole) => void;
  handleEditUserToggleMode: (useDefault: boolean) => void;
  handleSaveEditUser: (id: string) => void;
  handleDeleteUser: (id: string) => void;
  handleStartEditUser: (u: AppUser) => void;
  newUserName: string;
  setNewUserName: (v: string) => void;
  newUserEmail: string;
  setNewUserEmail: (v: string) => void;
  newUserPassword?: string;
  setNewUserPassword?: (v: string) => void;
  newUserMustChangePassword?: boolean;
  setNewUserMustChangePassword?: (v: boolean) => void;
  newUserRole: UserRole;
  setNewUserRole: (v: UserRole) => void;
  newUserStationId: string;
  setNewUserStationId?: (v: string) => void;
  newUserRegionId: string;
  setNewUserRegionId: (v: string) => void;
  newUserOrgUnitId: string;
  setNewUserOrgUnitId: (v: string) => void;
  newUserAssignedOrgUnitIds: string[];
  setNewUserAssignedOrgUnitIds: (v: string[]) => void;
  newUserCompanyId?: string;
  setNewUserCompanyId?: (v: string) => void;
  handleAddUser: (e: React.FormEvent) => void | boolean | Promise<void | boolean>;
  getAuthHeaders: () => Promise<Record<string, string>>;
  setUsers: (users: AppUser[]) => void;
  triggerToast: (msg: string) => void;
  initialCenterTab?: 'users' | 'org_structure' | 'modules' | 'companies';
  initialSelectedCompanyId?: string;
}

export default function UnifiedAccessControlCenter({
  language,
  theme,
  currentUser,
  users,
  regions,
  stations,
  editingUserId,
  setEditingUserId,
  editUserFullName,
  setEditUserFullName,
  editUserRole,
  editUserStationId,
  setEditUserStationId,
  editUserRegionId,
  setEditUserRegionId,
  editUserOrgUnitId,
  setEditUserOrgUnitId,
  editUserAssignedOrgUnitIds,
  setEditUserAssignedOrgUnitIds,
  editUserIsActive,
  setEditUserIsActive,
  editUserPermissions,
  setEditUserPermissions,
  editUserIsDefaultMode,
  handleEditUserRoleChange,
  handleEditUserToggleMode,
  handleSaveEditUser,
  handleDeleteUser,
  handleStartEditUser,
  newUserName,
  setNewUserName,
  newUserEmail,
  setNewUserEmail,
  newUserPassword,
  setNewUserPassword,
  newUserMustChangePassword,
  setNewUserMustChangePassword,
  newUserRole,
  setNewUserRole,
  newUserStationId,
  setNewUserStationId,
  newUserRegionId,
  setNewUserRegionId,
  newUserOrgUnitId,
  setNewUserOrgUnitId,
  newUserAssignedOrgUnitIds,
  setNewUserAssignedOrgUnitIds,
  newUserCompanyId,
  setNewUserCompanyId,
  handleAddUser,
  getAuthHeaders,
  setUsers,
  triggerToast,
  initialCenterTab,
  initialSelectedCompanyId
}: UnifiedAccessControlCenterProps) {
  const isRtl = language === 'ar';

  // Available Companies list
  const [companiesRefreshTrigger, setCompaniesRefreshTrigger] = useState(0);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(() => !CompaniesModule.isHydrated());

  useEffect(() => {
    if (!CompaniesModule.isHydrated()) {
      CompaniesModule.ensureHydrated().then(() => {
        setIsLoadingCompanies(false);
        setCompaniesRefreshTrigger(t => t + 1);
      });
    }
  }, []);

  const allCompanies = useMemo(() => {
    return CompaniesModule.getCompanies();
  }, [companiesRefreshTrigger]);

  // User creation company state (props with internal fallback)
  const [internalNewUserCompanyId, setInternalNewUserCompanyId] = useState<string>('');
  const activeNewUserCompanyId = newUserCompanyId !== undefined ? newUserCompanyId : internalNewUserCompanyId;
  const setActiveNewUserCompanyId = setNewUserCompanyId || setInternalNewUserCompanyId;

  // User creation password state (props with internal fallback)
  const [internalNewUserPassword, setInternalNewUserPassword] = useState('');
  const [internalNewUserMustChangePassword, setInternalNewUserMustChangePassword] = useState(true);
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);

  const activeNewUserPassword = newUserPassword !== undefined ? newUserPassword : internalNewUserPassword;
  const setActiveNewUserPassword = setNewUserPassword || setInternalNewUserPassword;
  const activeNewUserMustChangePassword = newUserMustChangePassword !== undefined ? newUserMustChangePassword : internalNewUserMustChangePassword;
  const setActiveNewUserMustChangePassword = setNewUserMustChangePassword || setInternalNewUserMustChangePassword;

  const generateRandomPassword = () => {
    const pass = generateRandomPasswordHelper();
    setActiveNewUserPassword(pass);
    return pass;
  };

  // Company Management State & Filters
  const [companySearch, setCompanySearch] = useState('');
  const [companySortField, setCompanySortField] = useState<'name' | 'status' | 'userCount' | 'expiry'>('name');
  const [companySortOrder, setCompanySortOrder] = useState<'asc' | 'desc'>('asc');

  // Add Company Modal State
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyId, setNewCompanyId] = useState('');
  const [newCompanyCustody, setNewCompanyCustody] = useState(0);
  const [newCompanyPlan, setNewCompanyPlan] = useState<Company['subscription_plan']>('Basic');
  const [newCompanyStatus, setNewCompanyStatus] = useState<Company['subscription_status']>('active');
  const [newCompanyExpiry, setNewCompanyExpiry] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  });
  const [newCompanyAdminName, setNewCompanyAdminName] = useState('');
  const [newCompanyAdminEmail, setNewCompanyAdminEmail] = useState('');
  const [newCompanyAdminPassword, setNewCompanyAdminPassword] = useState('');
  const [newCompanyAdminMustChangePassword, setNewCompanyAdminMustChangePassword] = useState(true);
  const [showNewCompanyAdminPassword, setShowNewCompanyAdminPassword] = useState(false);
  const [createdCompanyCredentials, setCreatedCompanyCredentials] = useState<{
    companyName: string;
    companyId: string;
    adminEmail: string;
    adminPassword: string;
  } | null>(null);
  const [showCreatedPassword, setShowCreatedPassword] = useState(true);
  const [newCompanyModules, setNewCompanyModules] = useState<Record<string, boolean>>({
    custody: true,
    inventory: true,
    reports: true,
    audit: true,
    purchasing: false,
    accounting: false,
    sales_ar: false,
    pos: false,
    crm: false,
    fixed_assets: false,
    hr_payroll: false,
    contracting: false,
    restaurant: false,
    fleet: false,
  });

  // Edit Company & Subscription Modal State
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editCompanyPlan, setEditCompanyPlan] = useState<Company['subscription_plan']>('Basic');
  const [editCompanyStatus, setEditCompanyStatus] = useState<Company['subscription_status']>('active');
  const [editCompanyExpiry, setEditCompanyExpiry] = useState('');
  const [editCompanyModulesSettings, setEditCompanyModulesSettings] = useState<Record<string, CompanyModuleSettings>>({});
  const [activeEditCompanyModalTab, setActiveEditCompanyModalTab] = useState<'details' | 'modules'>('details');

  // Delete Company Confirmation State
  const [deletingCompany, setDeletingCompany] = useState<Company | null>(null);

  // Active Center Tab State: 'users' | 'org_structure' | 'modules' | 'companies'
  const [centerTab, setCenterTab] = useState<'users' | 'org_structure' | 'modules' | 'companies'>(
    initialCenterTab || 'users'
  );

  // Explicit Company Selection for SystemAdmin
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(() => {
    if (initialSelectedCompanyId) return initialSelectedCompanyId;
    const stored = CustodyDB.getSelectedCompanyId();
    if (stored) return stored;
    const comps = CompaniesModule.getCompanies();
    return comps.length > 0 ? comps[0].id : '';
  });

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
      if (detail.selectedCompanyId) {
        setSelectedCompanyId(detail.selectedCompanyId);
        CustodyDB.setSelectedCompanyId(detail.selectedCompanyId);
      }
      if (detail.centerTab) {
        setCenterTab(detail.centerTab);
      } else if (detail.settingsTab === 'companies') {
        setCenterTab('companies');
      } else if (detail.settingsTab === 'org_structure') {
        setCenterTab('org_structure');
      } else if (detail.settingsTab === 'modules') {
        setCenterTab('modules');
      } else if (detail.settingsTab === 'permissions' || detail.settingsTab === 'users' || detail.settingsTab === 'access_control') {
        if (!detail.centerTab) {
          setCenterTab('users');
        }
      }
    };

    window.addEventListener('navigate_tab', handleNavigateEvent);
    return () => {
      window.removeEventListener('navigate_tab', handleNavigateEvent);
    };
  }, []);

  // Effective Company ID: No hardcoded fallback
  const effectiveCompanyId = useMemo(() => {
    if (currentUser.role === 'SystemAdmin') {
      return selectedCompanyId || (allCompanies.length > 0 ? allCompanies[0].id : '');
    }
    return currentUser.company_id || '';
  }, [currentUser.role, currentUser.company_id, selectedCompanyId, allCompanies]);

  const activeCompany = useMemo(() => {
    return allCompanies.find(c => c.id === effectiveCompanyId) || null;
  }, [allCompanies, effectiveCompanyId]);

  // Handle SystemAdmin company switch
  const handleCompanyChange = (newCompanyId: string) => {
    setSelectedCompanyId(newCompanyId);
    CustodyDB.setSelectedCompanyId(newCompanyId);
    setActiveNewUserCompanyId(newCompanyId);
    setUsers(CustodyDB.getUsers());
    setCompaniesRefreshTrigger(prev => prev + 1);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('custody_db_updated'));
    }
    triggerToast?.(isRtl ? `🏢 تم تحويل نطاق الإشراف إلى: ${newCompanyId}` : `🏢 Active scope switched to: ${newCompanyId}`);
  };

  // Dynamic Permission Categories from DEFAULT_PERMISSIONS
  const dynamicCategories = useMemo(() => {
    return buildDynamicPermissionCategories(DEFAULT_PERMISSIONS);
  }, []);

  // Organization Units for the effective company
  const companyOrgUnits = useMemo(() => {
    if (!effectiveCompanyId) return [];
    return OrganizationEngine.getOrganizationUnits(effectiveCompanyId);
  }, [effectiveCompanyId, companiesRefreshTrigger]);

  // Company Modules state for Modules tab
  const [companyModules, setCompanyModules] = useState<Record<string, CompanyModuleSettings>>(() => {
    return effectiveCompanyId ? ModulesModule.getCompanyModules(effectiveCompanyId) : {};
  });

  useEffect(() => {
    if (effectiveCompanyId) {
      setCompanyModules(ModulesModule.getCompanyModules(effectiveCompanyId));
    }
  }, [effectiveCompanyId]);

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [moduleFilter, setModuleFilter] = useState<string>('ALL');
  const [branchFilter, setBranchFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [showNewUserModal, setShowNewUserModal] = useState(false);

  // Sub-view inside Users tab: directory, signups, corrections
  const [usersSubView, setUsersSubView] = useState<'directory' | 'signups' | 'corrections'>('directory');

  // Pending Signup Requests & Account Corrections State
  const [signupRequests, setSignupRequests] = useState<SignupRequest[]>(() => CustodyDB.getSignupRequests());
  const [correctionRequests, setCorrectionRequests] = useState<AccountCorrectionRequest[]>(() => CustodyDB.getAccountCorrectionRequests());

  const [rejectingSignupId, setRejectingSignupId] = useState<string | null>(null);
  const [signupRejectReason, setSignupRejectReason] = useState('');

  const [rejectingCorrectionId, setRejectingCorrectionId] = useState<string | null>(null);
  const [correctionRejectReason, setCorrectionRejectReason] = useState('');

  const [approvingCorrectionReq, setApprovingCorrectionReq] = useState<AccountCorrectionRequest | null>(null);
  const [corrEditEmail, setCorrEditEmail] = useState('');
  const [corrEditName, setCorrEditName] = useState('');
  const [corrEditPassword, setCorrEditPassword] = useState('');
  const [corrError, setCorrError] = useState('');

  // Reload requests on database update event
  const refreshRequests = () => {
    setSignupRequests(CustodyDB.getSignupRequests());
    setCorrectionRequests(CustodyDB.getAccountCorrectionRequests());
  };

  useEffect(() => {
    const handleUpdate = () => {
      refreshRequests();
      setCompaniesRefreshTrigger(prev => prev + 1);
      setUsers(CustodyDB.getScopedUsers());
    };
    window.addEventListener('custody_db_updated', handleUpdate);
    return () => window.removeEventListener('custody_db_updated', handleUpdate);
  }, []);

  // Role permissions checks
  const canManageUsers = useMemo(() => {
    return currentUser.role === 'SystemAdmin' || 
           currentUser.role === 'Admin' || 
           !!currentUser.permissions?.manage_users || 
           !!currentUser.permissions?.manage_roles;
  }, [currentUser]);

  const canManageModules = useMemo(() => {
    return currentUser.role === 'SystemAdmin' || 
           (currentUser.role === 'Admin' && !!currentUser.permissions?.manage_settings);
  }, [currentUser]);

  const isSystemAdmin = currentUser.role === 'SystemAdmin';
  const isCompanyAdmin = currentUser.role === 'Admin';
  const isScopedAdmin = currentUser.role === 'RegionalManager' || currentUser.role === 'StationAdmin';

  // Filter pending signup requests by effective company / scope
  const scopedSignupRequests = useMemo(() => {
    return signupRequests.filter(r => {
      const isPending = String(r.status || '').toLowerCase() === 'pending';
      if (!isPending) return false;
      if (isSystemAdmin) return true;
      if (effectiveCompanyId && r.company_id && r.company_id !== effectiveCompanyId) return false;
      if (currentUser.role === 'RegionalManager' && currentUser.region_id && r.region_id !== currentUser.region_id) return false;
      if (currentUser.role === 'StationAdmin' && currentUser.station_id && r.station_id !== currentUser.station_id) return false;
      return true;
    });
  }, [signupRequests, isSystemAdmin, effectiveCompanyId, currentUser]);

  // Filter pending correction requests by effective company / scope
  const scopedCorrectionRequests = useMemo(() => {
    return correctionRequests.filter(r => {
      const isPending = String(r.status || '').toLowerCase() === 'pending';
      if (!isPending) return false;
      if (isSystemAdmin) return true;
      if (effectiveCompanyId && r.company_id && r.company_id !== effectiveCompanyId) return false;
      if (currentUser.role === 'RegionalManager' && currentUser.region_id && r.region_id !== currentUser.region_id) return false;
      if (currentUser.role === 'StationAdmin' && currentUser.station_id && r.station_id !== currentUser.station_id) return false;
      return true;
    });
  }, [correctionRequests, isSystemAdmin, effectiveCompanyId, currentUser]);

  // Signup Request Handlers
  const handleApproveSignup = async (req: SignupRequest) => {
    if (req.role === 'RegionalManager') {
      if (!req.region_id) {
        alert(isRtl
          ? '⚠️ لا يمكن اعتماد الطلب: يجب تحديد منطقة صالحة وموثقة لدور مدير المنطقة.'
          : '⚠️ Cannot approve signup: A valid region is required for Regional Manager.');
        return;
      }
      const allRegions = CustodyDB.getRegions();
      const validRegion = allRegions.find(r => r.id === req.region_id || r.org_unit_id === req.region_id);
      if (!validRegion) {
        alert(isRtl
          ? '⚠️ لا يمكن اعتماد الطلب: سجل المنطقة المحدد غير موجود في قاعدة البيانات.'
          : '⚠️ Cannot approve signup: The selected region record does not exist in the database.');
        return;
      }
    }

    const cleanEmail = req.email.trim().toLowerCase();
    const payload = {
      email: cleanEmail,
      full_name: req.full_name,
      role: req.role,
      company_id: req.company_id || effectiveCompanyId,
      region_id: req.region_id || null,
      station_id: req.station_id || null,
      permissions: CustodyDB.enrichUserPermissions(req.role),
      must_change_password: true
    };

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = await auth.currentUser?.getIdToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let createdUser: AppUser | null = null;
      let tempPasswordMsg = '';

      try {
        const data = await createManagedUser(payload);
        if (data.success && data.user) {
          createdUser = data.user;
          if (data.temporaryPassword) {
            tempPasswordMsg = isRtl ? ` (كلمة المرور المؤقتة: ${data.temporaryPassword})` : ` (Temporary Password: ${data.temporaryPassword})`;
          }
        }
      } catch {
        // Fallback for offline / direct DB save
      }

      if (!createdUser) {
        createdUser = {
          id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          email: cleanEmail,
          full_name: req.full_name,
          role: req.role,
          company_id: req.company_id || effectiveCompanyId,
          region_id: req.region_id || undefined,
          station_id: req.station_id || undefined,
          permissions: CustodyDB.enrichUserPermissions(req.role),
          is_active: true
        };
      }

      const usersList = CustodyDB.getUsers();
      const existingIdx = usersList.findIndex(u => u.id === createdUser!.id || u.email?.toLowerCase() === cleanEmail);
      if (existingIdx >= 0) {
        usersList[existingIdx] = createdUser;
      } else {
        usersList.push(createdUser);
      }
      await CustodyDB.saveUsers(usersList);
      setUsers(CustodyDB.getScopedUsers());

      await CustodyDB.deleteSignupRequest(req.id);
      CustodyDB.logAudit('APPROVE_SIGNUP_REQUEST', `Approved signup for ${req.full_name} (${cleanEmail}) as ${req.role}`);

      triggerToast?.((isRtl ? '✅ تم قبول طلب التسجيل وتفعيل الحساب بنجاح!' : '✅ Signup request approved and account activated!') + tempPasswordMsg);
      refreshRequests();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('custody_db_updated'));
      }
    } catch (err: any) {
      triggerToast?.(`⚠️ ${err.message || 'Error approving request'}`);
    }
  };

  const handleRejectSignup = async (req: SignupRequest) => {
    if (!signupRejectReason.trim()) {
      triggerToast?.(isRtl ? '⚠️ يرجى كتابة سبب الرفض' : '⚠️ Please enter a rejection reason');
      return;
    }

    const updated = {
      ...req,
      status: 'Rejected' as const,
      rejection_reason: signupRejectReason.trim()
    };
    await CustodyDB.saveSignupRequest(updated);
    CustodyDB.logAudit('REJECT_SIGNUP_REQUEST', `Rejected signup for ${req.full_name} (${req.email}). Reason: ${signupRejectReason}`);

    triggerToast?.(isRtl ? 'تم رفض طلب التسجيل' : 'Signup request rejected.');
    setRejectingSignupId(null);
    setSignupRejectReason('');
    refreshRequests();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('custody_db_updated'));
    }
  };

  // Correction Request Handlers
  const handleStartApproveCorrection = (req: AccountCorrectionRequest) => {
    setApprovingCorrectionReq(req);
    setCorrEditEmail(req.targetEmail || '');
    setCorrEditName(req.targetUserName || '');
    setCorrEditPassword('');
    setCorrError('');
  };

  const handleConfirmApproveCorrection = async () => {
    if (!approvingCorrectionReq) return;
    setCorrError('');

    try {
      const res = await CustodyDB.approveAccountCorrectionRequest(approvingCorrectionReq.id, {
        newEmail: corrEditEmail.trim() || undefined,
        newFullName: corrEditName.trim() || undefined,
        newPasswordPlain: corrEditPassword.trim() || undefined,
        approvedBy: currentUser.email || 'Admin'
      });

      if (!res.success) {
        setCorrError(isRtl ? res.messageAr : res.messageEn);
        return;
      }

      setUsers(CustodyDB.getScopedUsers());
      triggerToast?.(isRtl ? `✅ ${res.messageAr}` : `✅ ${res.messageEn}`);
      setApprovingCorrectionReq(null);
      refreshRequests();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('custody_db_updated'));
      }
    } catch (err: any) {
      setCorrError(err.message || 'Error approving correction');
    }
  };

  const handleRejectCorrection = async (req: AccountCorrectionRequest) => {
    if (!correctionRejectReason.trim()) {
      triggerToast?.(isRtl ? '⚠️ يرجى إدخال سبب الرفض' : '⚠️ Please provide a rejection reason');
      return;
    }

    const res = await CustodyDB.rejectAccountCorrectionRequest(
      req.id,
      correctionRejectReason.trim(),
      currentUser.email || 'Admin'
    );

    triggerToast?.(isRtl ? res.messageAr : res.messageEn);
    setRejectingCorrectionId(null);
    setCorrectionRejectReason('');
    refreshRequests();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('custody_db_updated'));
    }
  };

  // Helper: check what modules a user has active
  const getUserActiveModules = (user: AppUser) => {
    return getUserActiveModulesHelper(user);
  };

  // Helper: get branch name for a user
  const getUserBranchLabel = (user: AppUser) => {
    return getUserBranchLabelHelper(user, companyOrgUnits, isRtl, stations, regions);
  };

  // Toggle user active / inactive status
  const handleToggleUserActive = async (targetUser: AppUser) => {
    const accessCheck = UsersModule.canUserManageTargetUser(currentUser, targetUser);
    if (!accessCheck.allowed) {
      triggerToast?.(`⚠️ ${accessCheck.reason || (isRtl ? 'ليس لديك صلاحية لتعديل هذا المستخدم!' : 'Insufficient permissions to edit this user!')}`);
      return;
    }

    const newActiveState = targetUser.is_active === false;
    const confirmMsg = isRtl
      ? `هل ترغب في ${newActiveState ? 'تفعيل' : 'تعطيل'} حساب "${targetUser.full_name}"؟`
      : `Are you sure you want to ${newActiveState ? 'activate' : 'deactivate'} user "${targetUser.full_name}"?`;

    if (!confirm(confirmMsg)) return;

    const payload = {
      is_active: newActiveState
    };

    try {
      const data = await updateManagedUser(targetUser.id, payload);

      if (!data.success) {
        const errMsg = data.message || (isRtl ? 'فشل تحديث حالة الحساب' : 'Failed to update account status');
        triggerToast?.(`⚠️ ${errMsg}`);
        return;
      }

      if (data.user) {
        const allUsers = CustodyDB.getUsers().map(u => u.id === targetUser.id ? { ...u, ...data.user } : u);
        await CustodyDB.saveUsers(allUsers);
      }
      setUsers(CustodyDB.getScopedUsers());
      triggerToast?.(isRtl
        ? `تم ${newActiveState ? 'تفعيل' : 'تعطيل'} حساب ${targetUser.full_name} بنجاح.`
        : `User ${targetUser.full_name} ${newActiveState ? 'activated' : 'deactivated'} successfully.`);
    } catch (err: any) {
      triggerToast?.(`⚠️ ${err.message || 'Error updating user status'}`);
    }
  };

  // Filter users list by company scope and search criteria
  const scopedUsers = useMemo(() => {
    return users.filter(u => {
      if (statusFilter === 'ACTIVE' && u.is_active === false) return false;
      if (statusFilter === 'INACTIVE' && u.is_active !== false) return false;

      const userCompanyId = u.company_id || (u as any).companyId || '';

      // For SystemAdmin: if effectiveCompanyId is selected, show SystemAdmins + employees of effectiveCompanyId
      if (isSystemAdmin) {
        if (effectiveCompanyId) {
          return u.role === 'SystemAdmin' || userCompanyId === effectiveCompanyId;
        }
        return true;
      }

      // Scoped by company for other roles
      if (effectiveCompanyId && userCompanyId && userCompanyId !== effectiveCompanyId && u.role !== 'SystemAdmin') {
        return false;
      }

      // If user is StationAdmin or RegionalManager, limit to their branch/region
      if (currentUser.role === 'StationAdmin' && currentUser.station_id && u.station_id !== currentUser.station_id && u.id !== currentUser.id) {
        return false;
      }
      if (currentUser.role === 'RegionalManager' && currentUser.region_id && u.region_id !== currentUser.region_id && u.id !== currentUser.id) {
        return false;
      }

      return true;
    });
  }, [users, effectiveCompanyId, currentUser, isSystemAdmin, statusFilter]);

  const filteredUsers = useMemo(() => {
    return scopedUsers.filter(u => {
      // Search match
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchesName = u.full_name?.toLowerCase().includes(q);
        const matchesEmail = u.email?.toLowerCase().includes(q);
        const matchesRole = u.role?.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesRole) return false;
      }

      // Role filter
      if (roleFilter !== 'ALL' && u.role !== roleFilter) {
        return false;
      }

      // Branch filter
      if (branchFilter !== 'ALL') {
        if (u.org_unit_id !== branchFilter && (!u.assigned_org_unit_ids || !u.assigned_org_unit_ids.includes(branchFilter))) {
          return false;
        }
      }

      // Module filter
      if (moduleFilter !== 'ALL') {
        const activeMods = getUserActiveModules(u);
        if (!activeMods.some(m => m.id === moduleFilter)) {
          return false;
        }
      }

      return true;
    });
  }, [scopedUsers, searchTerm, roleFilter, moduleFilter, branchFilter]);

  // Master category toggle helper inside edit mode
  const handleToggleModuleCategory = (category: DynamicModuleCategory, enable: boolean) => {
    const updated = { ...editUserPermissions };
    category.permissions.forEach(p => {
      if (!p.systemAdminOnly || currentUser.role === 'SystemAdmin') {
        updated[p.key] = enable;
      }
    });
    setEditUserPermissions(updated);
    if (editUserIsDefaultMode) {
      handleEditUserToggleMode(false);
    }
  };

  // Check if a category is fully or partially enabled in edit mode
  const getCategoryStatusInEdit = (category: DynamicModuleCategory) => {
    return getCategoryPermissionStatusHelper(category, editUserPermissions, currentUser.role === 'SystemAdmin');
  };

  // Active editing user memo
  const activeEditingUser = useMemo(() => {
    if (!editingUserId) return null;
    return users.find(u => u.id === editingUserId) || null;
  }, [editingUserId, users]);

  // Module toggle handler for company settings
  const handleToggleCompanyModule = (moduleId: string, enabled: boolean) => {
    if (!effectiveCompanyId || !canManageModules) return;
    const updatedMods = {
      ...companyModules,
      [moduleId]: {
        ...(companyModules[moduleId] || {
          plan: 'Enterprise',
          status: 'active',
          activation_date: new Date().toISOString().split('T')[0],
          expiry_date: '2028-12-31'
        }),
        enabled
      }
    };
    setCompanyModules(updatedMods);
    ModulesModule.saveCompanyModules(effectiveCompanyId, updatedMods);
    triggerToast?.(isRtl ? '✅ تم تحديث إعدادات الموديول للشركة بنجاح!' : '✅ Company module settings updated successfully!');
  };

  // Company Management Handlers
  const handleSortCompanies = (field: 'name' | 'status' | 'userCount' | 'expiry') => {
    if (companySortField === field) {
      setCompanySortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setCompanySortField(field);
      setCompanySortOrder('asc');
    }
  };

  const sortedAndFilteredCompanies = useMemo(() => {
    let result = [...allCompanies];
    if (companySearch.trim()) {
      const q = companySearch.toLowerCase().trim();
      result = result.filter(c => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
    }
    result.sort((a, b) => {
      let valA: any = '';
      let valB: any = '';
      if (companySortField === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (companySortField === 'status') {
        valA = a.subscription_status || 'active';
        valB = b.subscription_status || 'active';
      } else if (companySortField === 'userCount') {
        valA = users.filter(u => u.company_id === a.id && u.is_active !== false).length;
        valB = users.filter(u => u.company_id === b.id && u.is_active !== false).length;
      } else if (companySortField === 'expiry') {
        valA = a.subscription_expiry || '9999-12-31';
        valB = b.subscription_expiry || '9999-12-31';
      }
      if (valA < valB) return companySortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return companySortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [allCompanies, companySearch, companySortField, companySortOrder, users]);

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    const compName = newCompanyName.trim();
    if (!compName) return;

    const targetCompanyId = newCompanyId.trim();
    const adminEmail = newCompanyAdminEmail.trim().toLowerCase();
    const adminName = newCompanyAdminName.trim() || `Admin ${compName}`;
    const rawAdminPass = newCompanyAdminPassword.trim();

    try {
      const createdComp = await CustodyDB.addCompany(compName, newCompanyCustody || 0, targetCompanyId || undefined);
      if (!createdComp) {
        throw new Error(isRtl ? 'فشل إنشاء سجل الشركة في قاعدة البيانات' : 'Failed to create company record');
      }
      const effectiveCompanyId = targetCompanyId || createdComp.id;
      
      await CustodyDB.updateCompany(createdComp.id, {
        id: effectiveCompanyId,
        subscription_plan: newCompanyPlan,
        subscription_status: newCompanyStatus,
        subscription_expiry: newCompanyExpiry || undefined,
        is_active: newCompanyStatus !== 'suspended'
      });

      // Save initial module settings
      const moduleSettings = ModulesModule.getDefaultModulesForPlan(newCompanyPlan);
      Object.keys(newCompanyModules).forEach(mId => {
        if (moduleSettings[mId]) {
          moduleSettings[mId].enabled = !!newCompanyModules[mId];
          moduleSettings[mId].status = newCompanyModules[mId] ? 'active' : 'inactive';
        }
      });
      ModulesModule.saveCompanyModules(effectiveCompanyId, moduleSettings);

      // Provision Admin User if provided
      let finalAdminPassword = '';
      if (adminEmail) {
        // Resolve password once: trimmed manual if length >= 12, else generate secure temp (length >= 12)
        const initialAdminPass = rawAdminPass.length >= 12
          ? rawAdminPass
          : `Pass@${Math.floor(100000 + Math.random() * 900000)}${Math.random().toString(36).slice(2, 6)}`;

        const provisionRes = await createManagedUser({
          email: adminEmail,
          password: initialAdminPass,
          full_name: adminName,
          role: 'Admin',
          company_id: effectiveCompanyId,
          permissions: CustodyDB.enrichUserPermissions('Admin'),
          must_change_password: true // Rule 6: must_change_password true by default for that admin
        });

        if (!provisionRes.success || !provisionRes.user) {
          // Rule 4: If admin email was provided and createManagedUser fails -> overall operation FAILS.
          // Roll back the company just created.
          try {
            await CustodyDB.deleteCompany(effectiveCompanyId);
          } catch (rbErr) {
            console.warn('[handleCreateCompany] Rollback failed:', rbErr);
          }
          const errMsg = provisionRes.message || (isRtl ? 'تعذر إنشاء حساب مدير الشركة' : 'Failed to provision Admin user');
          throw new Error(isRtl
            ? `فشل إنشاء حساب مدير الشركة (${errMsg}). تم إلغاء إنشاء الشركة منعاً لتعليق الحسابات.`
            : `Failed to provision Company Admin user (${errMsg}). Company creation rolled back.`);
        }

        finalAdminPassword = provisionRes.temporaryPassword || initialAdminPass;

        // Rule 5: On admin success: merge user into local users and refresh directory via same source as the screen
        const allUsers = CustodyDB.getUsers();
        const existingIdx = allUsers.findIndex(u => u.id === provisionRes.user!.id || u.email.toLowerCase() === adminEmail);
        if (existingIdx >= 0) {
          allUsers[existingIdx] = provisionRes.user;
        } else {
          allUsers.push(provisionRes.user);
        }
        await CustodyDB.saveUsers(allUsers);
        setUsers(CustodyDB.getScopedUsers());
      }

      setSelectedCompanyId(effectiveCompanyId);
      CustodyDB.setSelectedCompanyId(effectiveCompanyId);
      setActiveNewUserCompanyId(effectiveCompanyId);
      setCompaniesRefreshTrigger(prev => prev + 1);
      setShowAddCompanyModal(false);
      setNewCompanyName('');
      setNewCompanyId('');
      setNewCompanyCustody(0);
      setNewCompanyAdminName('');
      setNewCompanyAdminEmail('');
      setNewCompanyAdminPassword('');

      // Rule 3: Success UI MUST show the exact password used (copyable), whether manual or generated.
      // One bilingual success message including email + password. Never success-only “company created” without password when admin was requested.
      if (adminEmail && finalAdminPassword) {
        setCreatedCompanyCredentials({
          companyName: compName,
          companyId: effectiveCompanyId,
          adminEmail: adminEmail,
          adminPassword: finalAdminPassword
        });

        const bilingualMsg = isRtl
          ? `✅ تم إنشاء الشركة وتعيين المدير بنجاح!\nالبريد: ${adminEmail}\nكلمة المرور: ${finalAdminPassword}`
          : `✅ Company and Admin created successfully!\nEmail: ${adminEmail}\nPassword: ${finalAdminPassword}`;
        triggerToast?.(bilingualMsg);
      } else {
        triggerToast?.(isRtl ? '✅ تم إنشاء الشركة وتفعيل اشتراكها بنجاح!' : '✅ Company created and configured successfully!');
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('custody_db_updated'));
      }
    } catch (err: any) {
      triggerToast?.(`⚠️ ${err.message || 'Error creating company'}`);
    }
  };

  const handleStartEditCompany = (comp: Company) => {
    setEditingCompany(comp);
    setEditCompanyName(comp.name);
    setEditCompanyPlan(comp.subscription_plan || 'Basic');
    setEditCompanyStatus(comp.subscription_status || 'active');
    setEditCompanyExpiry(comp.subscription_expiry || '');
    setEditCompanyModulesSettings(ModulesModule.getCompanyModules(comp.id));
    setActiveEditCompanyModalTab('details');
  };

  const handleSaveEditCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompany || !editCompanyName.trim()) return;

    const updated: Company = {
      ...editingCompany,
      name: editCompanyName.trim(),
      subscription_plan: editCompanyPlan,
      subscription_status: editCompanyStatus,
      subscription_expiry: editCompanyExpiry || undefined,
      is_active: editCompanyStatus !== 'suspended'
    };

    CompaniesModule.updateCompany(editingCompany.id, updated);
    ModulesModule.saveCompanyModules(editingCompany.id, editCompanyModulesSettings);

    setCompaniesRefreshTrigger(prev => prev + 1);
    setEditingCompany(null);
    triggerToast?.(isRtl ? '✅ تم تحديث بيانات الشركة والاشتراك بنجاح!' : '✅ Company details and subscription updated!');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('custody_db_updated'));
    }
  };

  const handleToggleCompanyActive = (comp: Company) => {
    const nextActive = comp.is_active === false;
    const nextStatus = nextActive ? 'active' : 'suspended';
    const updated: Company = {
      ...comp,
      is_active: nextActive,
      subscription_status: nextStatus
    };
    CompaniesModule.updateCompany(comp.id, updated);
    setCompaniesRefreshTrigger(prev => prev + 1);
    triggerToast?.(isRtl 
      ? (nextActive ? '✅ تم تفعيل الشركة بنجاح' : '⏸️ تم تعطيل / إيقاف الشركة') 
      : (nextActive ? 'Company activated' : 'Company suspended')
    );
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('custody_db_updated'));
    }
  };

  const [isDeletingCompany, setIsDeletingCompany] = useState(false);

  const handleDeleteCompany = async () => {
    if (!deletingCompany || isDeletingCompany) return;
    setIsDeletingCompany(true);
    try {
      const result = await CompaniesModule.deleteCompany(deletingCompany.id);
      if (!result.success) {
        triggerToast?.(isRtl
          ? `❌ فشل حذف الشركة: ${result.error || 'خطأ في الخادم'}`
          : `❌ Failed to delete company: ${result.error || 'Server error'}`);
        return;
      }
      setCompaniesRefreshTrigger(prev => prev + 1);
      setDeletingCompany(null);
      triggerToast?.(isRtl ? '🗑️ تم حذف الشركة بنجاح.' : 'Company deleted.');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('custody_db_updated'));
      }
    } catch (err: any) {
      triggerToast?.(isRtl
        ? `❌ خطأ غير متوقع أثناء الحذف: ${err?.message || ''}`
        : `❌ Unexpected error deleting company: ${err?.message || ''}`);
    } finally {
      setIsDeletingCompany(false);
    }
  };

  return (
    <ErrorBoundary>
      <div className="space-y-6 animate-fade-in" id="unified-access-control-center">
      {/* Top Banner / Scope Summary Header */}
      <div className={`p-5 rounded-2xl border ${
        theme === 'dark' 
          ? 'bg-slate-900/95 border-slate-800 shadow-xl' 
          : 'bg-gradient-to-r from-indigo-50/90 via-white to-sky-50/90 border-indigo-200/80 shadow-sm'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-500/30">
                <ShieldCheck size={20} />
              </div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                {isRtl ? 'مركز التحكم وإدارة الصلاحيات الموحد (الشركات × الهيكل × المستخدمون)' : 'Unified Access Control & Governance Center'}
              </h2>
            </div>
            <p className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 max-w-2xl leading-relaxed">
              {isRtl 
                ? 'لوحة موحدة لضبط نطاق الفروع والمحطات، تخصيص الصلاحيات الفردية، وتفعيل موديولات النظام بدقة لكل موظف وشركة.' 
                : 'Centralized governance hub to assign branch scopes, customize fine-grained authority, and toggle ERP modules per employee.'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canManageUsers && (
              <button
                onClick={() => {
                  setEditingUserId(null);
                  if (!activeNewUserCompanyId) {
                    setActiveNewUserCompanyId(selectedCompanyId || effectiveCompanyId);
                  }
                  setShowNewUserModal(true);
                }}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                id="btn-register-new-employee"
              >
                <UserPlus size={15} />
                <span>{isRtl ? '+ تسجيل موظف جديد' : '+ Register Employee'}</span>
              </button>
            )}
          </div>
        </div>

        {/* SystemAdmin Explicit Company Selector Bar */}
        {isSystemAdmin && (
          <div className="mt-4 pt-3.5 border-t border-slate-200/60 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-indigo-600 shrink-0" />
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                {isRtl ? 'تحديد الشركة المستهدفة للإدارة:' : 'Select Target Company to Manage:'}
              </span>
              {allCompanies.length === 0 ? (
                <span className="text-xs text-amber-600 dark:text-amber-400 font-bold px-2.5 py-1 bg-amber-500/10 rounded-lg">
                  {isRtl ? 'لا توجد شركات متاحة' : 'No companies available'}
                </span>
              ) : (
                <select
                  value={effectiveCompanyId}
                  onChange={(e) => handleCompanyChange(e.target.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-indigo-300' : 'bg-white border-indigo-200 text-indigo-700 shadow-xs'
                  }`}
                  id="select-target-company-dropdown"
                >
                  <option value="">{isRtl ? '-- اختر شركة --' : '-- Select company --'}</option>
                  {allCompanies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id}) {c.subscription_plan ? `• ${c.subscription_plan}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {activeCompany && (
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-500/20 text-[10px]">
                  {activeCompany.subscription_status === 'active' ? (isRtl ? '● نشط' : '● Active') : (isRtl ? '○ غير نشط' : '○ Inactive')}
                </span>
                <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-[10px]">
                  {activeCompany.id}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Non-SystemAdmin Scope Status */}
        {!isSystemAdmin && (
          <div className="mt-4 pt-3.5 border-t border-slate-200/60 dark:border-slate-800 flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-slate-600 dark:text-slate-300">
              <span className="text-[11px] text-slate-400">{isRtl ? 'نطاق إشرافك الحالي:' : 'Your Active Scope:'}</span>
              <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-500/20">
                {currentUser.role === 'Admin'
                  ? (isRtl ? `🏢 أدمن الشركة (${activeCompany?.name || effectiveCompanyId})` : `🏢 Company Admin (${activeCompany?.name || effectiveCompanyId})`)
                  : (isRtl ? '📍 مدير نطاق فروع محددة' : '📍 Scoped Branch Manager')}
              </span>
            </div>

            <div className="hidden sm:block text-slate-300 dark:text-slate-700">|</div>

            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span>{isRtl ? `الموظفون في النطاق: ${filteredUsers.length} من إجمالي ${scopedUsers.length}` : `Employees in Scope: ${filteredUsers.length} of ${scopedUsers.length}`}</span>
            </div>
          </div>
        )}
      </div>

      {/* Internal Navigation Tabs (التبويبات المستقلة) */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto pb-px">
        {/* Tab 1: Users */}
        <button
          type="button"
          onClick={() => setCenterTab('users')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-black border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            centerTab === 'users'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
          id="tab-center-users"
        >
          <Users2 size={15} />
          <span>{isRtl ? `👥 المستخدمون والصلاحيات (${scopedUsers.length})` : `👥 Users & Permissions (${scopedUsers.length})`}</span>
          {(scopedSignupRequests.length > 0 || scopedCorrectionRequests.length > 0) && (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-amber-500 text-white font-black font-mono animate-pulse">
              {scopedSignupRequests.length + scopedCorrectionRequests.length}
            </span>
          )}
        </button>

        {/* Tab 2: Org Structure */}
        <button
          type="button"
          onClick={() => setCenterTab('org_structure')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-black border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            centerTab === 'org_structure'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
          id="tab-center-org-structure"
        >
          <FolderTree size={15} />
          <span>{isRtl ? '🏢 الهيكل التنظيمي والفروع' : '🏢 Organization Structure'}</span>
        </button>

        {/* Tab 3: Modules & Subscription (Visible to SystemAdmin and Company Admin only, hidden from StationAdmin) */}
        {!isScopedAdmin && (
          <button
            type="button"
            onClick={() => setCenterTab('modules')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-black border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              centerTab === 'modules'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-black'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
            id="tab-center-modules"
          >
            <Boxes size={15} />
            <span>{isRtl ? '📦 موديولات الشركة والاشتراك' : '📦 Modules & Subscription'}</span>
          </button>
        )}

        {/* Tab 4: Companies Overview (SystemAdmin only) */}
        {isSystemAdmin && (
          <button
            type="button"
            onClick={() => setCenterTab('companies')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-black border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              centerTab === 'companies'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-black'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
            id="tab-center-companies"
          >
            <Building2 size={15} />
            <span>{isRtl ? `🌐 شركات المنصة (${allCompanies.length})` : `🌐 SaaS Companies (${allCompanies.length})`}</span>
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: USERS DIRECTORY & ACCESS PROFILES                                 */}
      {/* ========================================================================= */}
      {centerTab === 'users' && (
        <div className="space-y-6">
          {/* Sub-view Navigation Pills */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setUsersSubView('directory')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  usersSubView === 'directory'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
                id="btn-subview-directory"
              >
                <Users2 size={13} />
                <span>{isRtl ? 'دليل الموظفين والصلاحيات' : 'Employees Directory'}</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 text-white font-mono">
                  {filteredUsers.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setUsersSubView('signups')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  usersSubView === 'signups'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
                id="btn-subview-signups"
              >
                <UserPlus size={13} />
                <span>{isRtl ? 'طلبات التسجيل المعلقة' : 'Pending Signups'}</span>
                {scopedSignupRequests.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-white font-bold animate-pulse font-mono">
                    {scopedSignupRequests.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setUsersSubView('corrections')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  usersSubView === 'corrections'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
                id="btn-subview-corrections"
              >
                <KeyRound size={13} />
                <span>{isRtl ? 'طلبات تصحيح الحسابات' : 'Account Corrections'}</span>
                {scopedCorrectionRequests.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-sky-500 text-white font-bold font-mono">
                    {scopedCorrectionRequests.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Subview 1: Employees Directory */}
          {usersSubView === 'directory' && (
            <div className="space-y-6">
              {/* Notification banner if pending requests exist */}
              {(scopedSignupRequests.length > 0 || scopedCorrectionRequests.length > 0) && (
                <div 
                  id="unified-requests-notification-banner"
                  className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold">
                    <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                    <span>
                      {isRtl
                        ? `يوجد ${scopedSignupRequests.length} طلب تسجيل جديد و ${scopedCorrectionRequests.length} طلب تصحيح حسابات بانتظار المراجعة والاعتماد.`
                        : `You have ${scopedSignupRequests.length} pending signups and ${scopedCorrectionRequests.length} account correction requests awaiting review.`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {scopedSignupRequests.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setUsersSubView('signups')}
                        className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-black text-[11px] cursor-pointer"
                      >
                        {isRtl ? 'مراجعة طلبات التسجيل' : 'Review Signups'}
                      </button>
                    )}
                    {scopedCorrectionRequests.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setUsersSubView('corrections')}
                        className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-black text-[11px] cursor-pointer"
                      >
                        {isRtl ? 'مراجعة التصحيحات' : 'Review Corrections'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Filter Bar */}
              <div className={`p-4 rounded-2xl border flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 ${
                theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
              }`}>
                <div className="flex-1 relative">
                  <Search size={15} className={`absolute top-1/2 -translate-y-1/2 text-slate-400 ${isRtl ? 'right-3' : 'left-3'}`} />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={isRtl ? 'بحث بالاسم، البريد الإلكتروني، أو الدور...' : 'Search by name, email, or role...'}
                    className={`w-full py-2 rounded-xl text-xs border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      isRtl ? 'pr-9 pl-3' : 'pl-9 pr-3'
                    } ${
                      theme === 'dark' ? 'bg-slate-800/80 border-slate-700 text-slate-100 placeholder:text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400'
                    }`}
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className={`absolute top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 ${isRtl ? 'left-3' : 'right-3'}`}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Role Filter */}
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <option value="ALL">{isRtl ? 'جميع الأدوار (All Roles)' : 'All Roles'}</option>
                    {SYSTEM_ROLES.filter(r => !r.systemAdminOnly || isSystemAdmin).map(r => (
                      <option key={r.id} value={r.id}>{isRtl ? r.labelAr : r.labelEn}</option>
                    ))}
                  </select>

                  {/* Module Filter */}
                  <select
                    value={moduleFilter}
                    onChange={(e) => setModuleFilter(e.target.value)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <option value="ALL">{isRtl ? 'جميع الموديولات (All Modules)' : 'All Modules'}</option>
                    <option value="custody">{isRtl ? '💰 العهد والمصروفات' : '💰 Custody & Expenses'}</option>
                    <option value="vouchers">{isRtl ? '📄 سندات الصرف' : '📄 Cash Vouchers'}</option>
                    <option value="fleet">{isRtl ? '🚗 الأسطول والمركبات' : '🚗 Fleet & Logistics'}</option>
                    <option value="reports">{isRtl ? '📊 التقارير' : '📊 Reports'}</option>
                    <option value="admin">{isRtl ? '⚙️ الإدارة والنظام' : '⚙️ Administration'}</option>
                  </select>

                  {/* Org Unit / Branch Filter */}
                  {companyOrgUnits.length > 0 && (
                    <select
                      value={branchFilter}
                      onChange={(e) => setBranchFilter(e.target.value)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer max-w-[180px] truncate ${
                        theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      <option value="ALL">{isRtl ? 'جميع الفروع / الوحدات' : 'All Branches & Units'}</option>
                      {companyOrgUnits.map(u => (
                        <option key={u.id} value={u.id}>{isRtl ? (u.nameAr || u.name) : (u.nameEn || u.name)}</option>
                      ))}
                    </select>
                  )}

                  {/* Status Filter */}
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold border focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <option value="ACTIVE">{isRtl ? '🟢 الحسابات النشطة فقط' : '🟢 Active Only'}</option>
                    <option value="INACTIVE">{isRtl ? '🔴 الحسابات المعطلة فقط' : '🔴 Inactive Only'}</option>
                    <option value="ALL">{isRtl ? '⚪ جميع الحالات (All)' : '⚪ All Statuses'}</option>
                  </select>
                </div>
              </div>

          {/* Main Layout: List of Users + Editing Drawer / Workspace */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left / User List Column */}
            <div className={editingUserId ? "lg:col-span-5 space-y-3" : "lg:col-span-12 space-y-3"}>
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {isRtl ? `قائمة الموظفين والوصول (${filteredUsers.length})` : `Employee Access Profiles (${filteredUsers.length})`}
                </span>
                {editingUserId && (
                  <button
                    onClick={() => setEditingUserId(null)}
                    className="text-xs text-indigo-600 hover:text-indigo-500 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Eye size={13} />
                    <span>{isRtl ? 'عرض كامل للشاشة' : 'Expand View'}</span>
                  </button>
                )}
              </div>

              {filteredUsers.length === 0 ? (
                <div className={`p-8 rounded-2xl border text-center ${
                  theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <AlertTriangle size={24} className="mx-auto text-amber-500 mb-2" />
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {effectiveCompanyId && activeCompany
                      ? (isRtl 
                          ? `لا يوجد موظفون مسجلون حالياً في شركة "${activeCompany.name}" أو يطابقون شروط البحث.`
                          : `No employees currently registered in "${activeCompany.name}" or matching search filters.`)
                      : (isRtl ? 'لم يتم العثور على موظفين يطابقون خيارات البحث أو التصفية.' : 'No employees matching your search or filters.')
                    }
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                    {isRtl ? 'يمكنك إضافة موظف جديد لهذه الشركة بالضغط على زر "تسجيل موظف جديد" بالأعلى.' : 'You can register a new employee for this company using the "+ Register Employee" button above.'}
                  </p>
                </div>
              ) : (
                <div className={editingUserId ? "space-y-3" : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"}>
                  {filteredUsers.map((u) => {
                    const isSelected = editingUserId === u.id;
                    const activeMods = getUserActiveModules(u);
                    const branchInfo = getUserBranchLabel(u);
                    const roleDef = SYSTEM_ROLES.find(r => r.id === u.role);
                    const userCanManageThis = UsersModule.canUserManageTargetUser(currentUser, u).allowed;

                    return (
                      <div
                        key={u.id}
                        className={`p-4 rounded-2xl border transition-all relative flex flex-col justify-between gap-3 ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/10 dark:bg-indigo-950/20 shadow-md ring-2 ring-indigo-500/20'
                            : theme === 'dark'
                            ? 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                            : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-sm'
                        }`}
                      >
                        <div>
                          {/* User Identity Header */}
                          <div className="flex items-start justify-between gap-2 mb-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 shadow-sm ${
                                u.is_active === false
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                                  : (roleDef?.bgClass || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300')
                              }`}>
                                {u.full_name?.charAt(0) || 'U'}
                              </div>
                              <div>
                                <div className="font-bold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                                  <span className={u.is_active === false ? 'line-through text-slate-400 dark:text-slate-500' : ''}>
                                    {u.full_name}
                                  </span>
                                  {u.id === currentUser.id && (
                                    <span className="text-[9px] bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.2 rounded font-mono">
                                      {isRtl ? 'حسابك' : 'You'}
                                    </span>
                                  )}
                                  {u.is_active === false && (
                                    <span className="text-[9px] bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold px-1.5 py-0.5 rounded-md">
                                      {isRtl ? 'معطل' : 'Inactive'}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-400 font-mono block">{u.email}</span>
                              </div>
                            </div>

                            <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black shrink-0 ${roleDef?.bgClass || 'bg-slate-100 text-slate-600'}`}>
                              {roleDef ? (isRtl ? roleDef.labelAr : roleDef.labelEn) : u.role}
                            </span>
                          </div>

                          {/* Branch / Scope Badge */}
                          <div className="flex items-center gap-1.5 text-[11px] mb-3">
                            <MapPin size={12} className={branchInfo.isWarning ? "text-amber-500 shrink-0" : "text-sky-500 shrink-0"} />
                            <span className={`font-semibold ${
                              branchInfo.isWarning 
                                ? 'text-amber-600 dark:text-amber-400' 
                                : 'text-slate-600 dark:text-slate-300'
                            }`}>
                              {branchInfo.text}
                            </span>
                          </div>

                          {/* Active Modules Pills */}
                          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                              {isRtl ? 'الموديولات المفعّلة للموظف:' : 'Active Enabled Modules:'}
                            </span>

                            {activeMods.length === 0 ? (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-rose-500/10 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-md font-semibold border border-rose-500/15">
                                <AlertTriangle size={10} />
                                {isRtl ? 'لا توجد موديولات مفعّلة' : 'No Modules Enabled'}
                              </span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {activeMods.map(m => {
                                  const IconComponent = m.icon;
                                  return (
                                    <span
                                      key={m.id}
                                      className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md font-bold border ${m.badgeBg}`}
                                    >
                                      <IconComponent size={10} />
                                      <span>{isRtl ? m.nameAr : m.nameEn}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action Bar */}
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                          <button
                            onClick={() => handleStartEditUser(u)}
                            disabled={!userCanManageThis}
                            className={`flex-1 py-1.5 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : userCanManageThis
                                ? 'bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400'
                                : 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-100 dark:bg-slate-800'
                            }`}
                          >
                            <Edit2 size={12} />
                            <span>{isRtl ? 'تعديل الصلاحيات والنطاق' : 'Edit Scope & Authority'}</span>
                          </button>

                          {userCanManageThis && u.id !== currentUser.id && (
                            <button
                              type="button"
                              onClick={() => handleToggleUserActive(u)}
                              className={`p-1.5 rounded-xl transition-all cursor-pointer ${
                                u.is_active === false
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-600 dark:text-amber-400'
                              }`}
                              title={u.is_active === false ? (isRtl ? 'تفعيل الحساب' : 'Activate Account') : (isRtl ? 'تعطيل الحساب' : 'Deactivate Account')}
                            >
                              <Power size={14} />
                            </button>
                          )}

                          {isSystemAdmin && u.id !== currentUser.id && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(isRtl ? `هل ترغب في بدء جلسة دعم فني ومحاكاة حساب "${u.full_name}"؟` : `Start technical support impersonation session for "${u.full_name}"?`)) {
                                    UsersModule.impersonateUser(u, 'Technical Support from Access Control Center');
                                    window.location.reload();
                                  }
                                }}
                                className="p-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 transition-all cursor-pointer"
                                title={isRtl ? 'دخول الدعم الفني (Impersonate)' : 'Technical Support Session (Impersonate)'}
                              >
                                <UserCheck size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u.id)}
                                className="p-1.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-400 hover:text-rose-600 transition-all cursor-pointer"
                                title={isRtl ? 'حذف الحساب' : 'Delete user profile'}
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right / Edit Mode Workspace (شخص × فرع × موديول) */}
            {editingUserId && activeEditingUser && (
              <div className="lg:col-span-7 space-y-4 animate-fade-in" id="edit-user-access-panel">
                <div className={`p-5 rounded-2xl border space-y-5 shadow-lg ${
                  theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                }`}>
                  {/* Edit Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-indigo-600 text-white font-black">
                        <ShieldCheck size={18} />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-slate-800 dark:text-slate-100">
                          {isRtl ? `تخصيص صلاحيات ونطاق: ${activeEditingUser.full_name}` : `Access Profile: ${activeEditingUser.full_name}`}
                        </h3>
                        <span className="text-[11px] text-slate-400 font-mono">{activeEditingUser.email}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setEditingUserId(null)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* 1. Basic Identity & System Role */}
                  <div className="space-y-3">
                    <span className="text-xs font-black text-slate-700 dark:text-slate-300 block">
                      {isRtl ? '1. الدور الوظيفي والمسمى:' : '1. System Role & Identity:'}
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 mb-1">
                          {isRtl ? 'الاسم بالكامل:' : 'Full Name:'}
                        </label>
                        <input
                          type="text"
                          value={editUserFullName}
                          onChange={(e) => setEditUserFullName(e.target.value)}
                          className={`w-full px-3 py-2 rounded-xl text-xs border font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                            theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'
                          }`}
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 mb-1">
                          {isRtl ? 'الدور الوظيفي:' : 'System Role:'}
                        </label>
                        <select
                          value={editUserRole}
                          onChange={(e) => handleEditUserRoleChange(e.target.value as UserRole)}
                          className={`w-full px-3 py-2 rounded-xl text-xs font-bold border focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer ${
                            theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'
                          }`}
                        >
                          {SYSTEM_ROLES.filter(r => !r.systemAdminOnly || isSystemAdmin).map(r => (
                            <option key={r.id} value={r.id}>{isRtl ? r.labelAr : r.labelEn}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Account Status (Active/Inactive) Toggle */}
                    {setEditUserIsActive && (
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${editUserIsActive !== false ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          <div>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                              {isRtl ? 'حالة الحساب في النظام:' : 'Account Status:'}
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">
                              {editUserIsActive !== false
                                ? (isRtl ? 'الحساب نشط ويمكنه تسجيل الدخول واستخدام النظام' : 'Account is active and can sign in')
                                : (isRtl ? 'الحساب معطل وممنوع من تسجيل الدخول' : 'Account is inactive and cannot sign in')}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setEditUserIsActive(editUserIsActive === false ? true : false)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                            editUserIsActive !== false
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                              : 'bg-rose-600 hover:bg-rose-500 text-white shadow-sm'
                          }`}
                        >
                          <Power size={13} />
                          <span>
                            {editUserIsActive !== false
                              ? (isRtl ? 'نشط (Active)' : 'Active')
                              : (isRtl ? 'معطل (Inactive)' : 'Inactive')}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 2. Organizational Branch / Unit Scope */}
                  <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-700 dark:text-slate-300 block">
                        {isRtl ? '2. النطاق الإشرافي والفروع المخصصة:' : '2. Organizational Scope & Branches:'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {isRtl ? 'يرث الموظف صلاحيات الفروع التابعة تلقائياً' : 'Inherits sub-units automatically'}
                      </span>
                    </div>

                    <OrgUnitTreeSelect
                      companyId={effectiveCompanyId}
                      value={editUserOrgUnitId}
                      onChange={(unitId) => {
                        const newOrgUnitId = Array.isArray(unitId) ? unitId[0] : unitId;
                        setEditUserOrgUnitId(newOrgUnitId);
                        if (newOrgUnitId) {
                          const derived = deriveScopeIdsFromOrgUnit(newOrgUnitId, editUserRole);
                          if (derived.unlinked && (editUserRole === 'StationAdmin' || editUserRole === 'RegionalManager')) {
                            alert(derived.unlinkedMessage || (isRtl
                              ? 'تنبيه: الوحدة التنظيمية المحددة غير مرتبطة بسجل منطقة أو محطة معتمد.'
                              : 'Warning: The selected organizational unit is not linked to an official Region or Station.'));
                          } else if (editUserRole === 'StationAdmin' && !derived.station_id) {
                            alert(isRtl
                              ? 'تنبيه: الوحدة التنظيمية المحددة ليست مرتبطة بمحطة/فرع صرف، وهو ما قد يتعارض مع دور مدير الفرع/المحطة.'
                              : 'Warning: The selected organizational unit is not linked to a station/branch, which may conflict with the Station Admin role.');
                          } else if (editUserRole === 'RegionalManager' && !derived.region_id) {
                            alert(isRtl
                              ? 'تنبيه: الوحدة التنظيمية المحددة ليست مرتبطة بمنطقة جغرافية، وهو ما قد يتعارض مع دور مدير المنطقة.'
                              : 'Warning: The selected organizational unit is not linked to a region, which may conflict with the Regional Manager role.');
                          }
                        }
                      }}
                      mode="single"
                      isRtl={isRtl}
                      theme={theme}
                      showInheritanceSummary={true}
                      placeholder={isRtl ? 'اختر الفرع أو المحطة التابع لها...' : 'Select assigned Branch or Station...'}
                    />
                  </div>

                  {/* 3. Fine-Grained Module Permissions (Generated Dynamically from DEFAULT_PERMISSIONS) */}
                  <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <span className="text-xs font-black text-slate-700 dark:text-slate-300 block">
                          {isRtl ? '3. مصفوفة الصلاحيات والموديولات:' : '3. Permission & Module Matrix:'}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {isRtl ? 'يتم توليد الأقسام ديناميكياً من مصفوفة الصلاحيات' : 'Generated dynamically from DEFAULT_PERMISSIONS'}
                        </span>
                      </div>

                      {/* Mode Switcher: Role Defaults vs Custom Override */}
                      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 self-start sm:self-auto">
                        <button
                          type="button"
                          onClick={() => handleEditUserToggleMode(true)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                            editUserIsDefaultMode
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                          }`}
                        >
                          {isRtl ? 'افتراضي حسب الدور' : 'Role Default'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEditUserToggleMode(false)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                            !editUserIsDefaultMode
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                          }`}
                        >
                          {isRtl ? 'مخصص (Custom)' : 'Custom Override'}
                        </button>
                      </div>
                    </div>

                    {/* Render Each Dynamic Permission Category */}
                    <div className="space-y-3">
                      {dynamicCategories.map((cat) => {
                        const IconComp = cat.icon;
                        const catStatus = getCategoryStatusInEdit(cat);

                        return (
                          <div
                            key={cat.id}
                            className={`p-3.5 rounded-xl border transition-all ${
                              catStatus.allEnabled
                                ? 'border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/20 dark:bg-indigo-950/10'
                                : catStatus.partiallyEnabled
                                ? 'border-amber-200 dark:border-amber-900/40 bg-amber-50/15 dark:bg-amber-950/10'
                                : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50'
                            }`}
                          >
                            {/* Category Header with Master Toggle */}
                            <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200/60 dark:border-slate-800">
                              <div className="flex items-center gap-2">
                                <div className={`p-1.5 rounded-lg border ${cat.badgeBg}`}>
                                  <IconComp size={14} />
                                </div>
                                <div>
                                  <span className="font-black text-xs text-slate-800 dark:text-slate-100 block">
                                    {isRtl ? cat.nameAr : cat.nameEn}
                                  </span>
                                  <span className="text-[10px] text-slate-400 block">
                                    {isRtl ? cat.descAr : cat.descEn}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  catStatus.allEnabled
                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                    : catStatus.partiallyEnabled
                                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                                }`}>
                                  {catStatus.enabledCount} / {catStatus.totalCount}
                                </span>

                                <button
                                  type="button"
                                  onClick={() => handleToggleModuleCategory(cat, !catStatus.allEnabled)}
                                  className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                                    catStatus.allEnabled
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-indigo-600 hover:text-white'
                                  }`}
                                >
                                  {catStatus.allEnabled ? (isRtl ? 'مفعّل' : 'Active') : (isRtl ? 'تمكين الكل' : 'Enable All')}
                                </button>
                              </div>
                            </div>

                            {/* Fine-grained permissions checkboxes */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                              {cat.permissions.filter(p => !p.systemAdminOnly || isSystemAdmin).map((perm) => {
                                const isChecked = !!editUserPermissions[perm.key];

                                return (
                                  <label
                                    key={perm.key}
                                    className={`flex items-start gap-2 p-2 rounded-lg border transition-all cursor-pointer ${
                                      isChecked
                                        ? 'bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800/40 text-slate-800 dark:text-slate-200'
                                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 hover:border-slate-300'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={(e) => {
                                        setEditUserPermissions({
                                          ...editUserPermissions,
                                          [perm.key]: e.target.checked
                                        });
                                        if (editUserIsDefaultMode) {
                                          handleEditUserToggleMode(false);
                                        }
                                      }}
                                      className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 shrink-0"
                                    />
                                    <div className="space-y-0.5">
                                      <span className="font-bold text-[11px] block leading-tight">
                                        {isRtl ? perm.nameAr : perm.nameEn}
                                      </span>
                                      <span className="text-[9px] text-slate-400 block leading-tight">
                                        {isRtl ? perm.descAr : perm.descEn}
                                      </span>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 4. Live Impact Summary Bar */}
                  <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <Info size={15} className="text-indigo-600 shrink-0" />
                      <span className="text-indigo-900 dark:text-indigo-300 font-semibold text-[11px]">
                        {isRtl ? 'ملخص الإسناد: سيتم تحديث صلاحيات الموظف على مستوى الفروع والموديولات المحددة فوراً.' : 'Summary: User authority across assigned branches and modules will apply immediately.'}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setEditingUserId(null)}
                      className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold cursor-pointer"
                    >
                      {isRtl ? 'إلغاء' : 'Cancel'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSaveEditUser(activeEditingUser.id)}
                      className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black shadow-md shadow-indigo-600/20 transition-all cursor-pointer flex items-center gap-1.5"
                      id="btn-save-user-access"
                    >
                      <Check size={14} />
                      <span>{isRtl ? 'حفظ الصلاحيات والنطاق' : 'Save Access Profile'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subview 2: Pending Signup Requests */}
      {usersSubView === 'signups' && (
        <div className="space-y-4 animate-fade-in" id="unified-signup-requests-view">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <UserPlus size={15} className="text-amber-500" />
                <span>{isRtl ? `طلبات الانضمام والتسجيل المعلقة (${scopedSignupRequests.length})` : `Pending Registration Requests (${scopedSignupRequests.length})`}</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isRtl ? 'مراجعة بيانات المتقدمين الجدد، قبول وتوليد الحساب، أو رفض الطلب مع السبب' : 'Review employee applications, provision access & generate passwords, or decline with feedback.'}
              </p>
            </div>
          </div>

          {scopedSignupRequests.length === 0 ? (
            <div className={`p-8 rounded-2xl border text-center ${
              theme === 'dark' ? 'bg-slate-900/40 border-slate-800' : 'bg-slate-50/70 border-slate-200'
            }`}>
              <ShieldCheck size={28} className="mx-auto text-emerald-500 mb-2" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isRtl ? 'لا توجد أي طلبات تسجيل جديدة معلقة حالياً.' : 'No pending registration requests at this time.'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {isRtl ? 'كافة طلبات الانضمام معالجة بالكامل.' : 'All onboarding requests have been reviewed and resolved.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scopedSignupRequests.map((req) => {
                const roleDef = SYSTEM_ROLES.find(r => r.id === req.role);
                return (
                  <div
                    key={req.id}
                    className={`p-4 rounded-2xl border shadow-sm space-y-3.5 flex flex-col justify-between transition-all ${
                      theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-amber-100/80 shadow-xs'
                    }`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 font-black text-xs flex items-center justify-center border border-amber-500/20">
                            {req.full_name?.charAt(0) || 'U'}
                          </div>
                          <div>
                            <h4 className="font-black text-xs text-slate-800 dark:text-slate-100">
                              {req.full_name}
                            </h4>
                            <span className="text-[10px] text-slate-400 font-mono block">{req.email}</span>
                          </div>
                        </div>

                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${roleDef?.bgClass || 'bg-slate-100 text-slate-600'}`}>
                          {isRtl ? (roleDef?.labelAr || req.role) : (roleDef?.labelEn || req.role)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                          <span className="text-[9px] text-slate-400 block">{isRtl ? 'تاريخ الطلب:' : 'Request Date:'}</span>
                          <span className="font-mono text-slate-700 dark:text-slate-300 text-[10px]">
                            {new Date(req.created_at).toLocaleString(isRtl ? 'ar-EG' : 'en-US')}
                          </span>
                        </div>

                        <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                          <span className="text-[9px] text-slate-400 block">{isRtl ? 'الشركة المستهدفة:' : 'Target Company:'}</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300 text-[10px] truncate block">
                            {req.company_id || effectiveCompanyId}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingSignupId(req.id);
                          setSignupRejectReason('');
                        }}
                        className="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/50 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-bold transition-all cursor-pointer"
                      >
                        {isRtl ? 'رفض الطلب' : 'Reject'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleApproveSignup(req)}
                        className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Check size={13} />
                        <span>{isRtl ? 'قبول وتفعيل الحساب' : 'Approve & Activate'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Subview 3: Account Correction Requests */}
      {usersSubView === 'corrections' && (
        <div className="space-y-4 animate-fade-in" id="unified-correction-requests-view">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <KeyRound size={15} className="text-sky-500" />
                <span>{isRtl ? `طلبات تصحيح وتعديل الحسابات (${scopedCorrectionRequests.length})` : `Account Correction Requests (${scopedCorrectionRequests.length})`}</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isRtl ? 'مراجعة طلبات تعديل البريد، الاسم، أو إعادة تعيين كلمة المرور للموظفين' : 'Review requests for email updates, name corrections, and credential resets.'}
              </p>
            </div>
          </div>

          {scopedCorrectionRequests.length === 0 ? (
            <div className={`p-8 rounded-2xl border text-center ${
              theme === 'dark' ? 'bg-slate-900/40 border-slate-800' : 'bg-slate-50/70 border-slate-200'
            }`}>
              <ShieldCheck size={28} className="mx-auto text-emerald-500 mb-2" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {isRtl ? 'لا توجد أي طلبات تصحيح حسابات معلقة حالياً.' : 'No pending account correction requests.'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {isRtl ? 'كافة طلبات تعديل البيانات تمت مراجعتها.' : 'All profile adjustment tickets are cleared.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scopedCorrectionRequests.map((req) => (
                <div
                  key={req.id}
                  className={`p-4 rounded-2xl border shadow-sm space-y-3.5 flex flex-col justify-between transition-all ${
                    theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-sky-100 shadow-xs'
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400 font-black text-xs flex items-center justify-center border border-sky-500/20">
                          <KeyRound size={16} />
                        </div>
                        <div>
                          <h4 className="font-black text-xs text-slate-800 dark:text-slate-100">
                            {req.targetUserName || req.targetEmail}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-mono block">{req.targetEmail}</span>
                        </div>
                      </div>

                      <span className="px-2 py-0.5 rounded-lg text-[9px] font-black bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/20">
                        {isRtl ? 'طلب تصحيح' : 'Correction Ticket'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-[11px] space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">{isRtl ? 'نوع التصحيح:' : 'Correction Type:'}</span>
                        <span className="font-bold text-sky-600 dark:text-sky-400">{req.correctionType}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">{isRtl ? 'الدور الوظيفي:' : 'Role:'}</span>
                        <span className="font-bold text-slate-700 dark:text-slate-200">{req.targetRole}</span>
                      </div>
                      {req.reason && (
                        <div className="pt-1 border-t border-slate-200/50 dark:border-slate-700 text-slate-500 italic">
                          "{req.reason}"
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRejectingCorrectionId(req.id);
                        setCorrectionRejectReason('');
                      }}
                      className="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/50 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-bold transition-all cursor-pointer"
                    >
                      {isRtl ? 'رفض' : 'Reject'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStartApproveCorrection(req)}
                      className="px-4 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Check size={13} />
                      <span>{isRtl ? 'مراجعة واعتماد' : 'Review & Approve'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )}

      {/* ========================================================================= */}
      {/* TAB 2: ORGANIZATIONAL STRUCTURE TREE                                      */}
      {/* ========================================================================= */}
      {centerTab === 'org_structure' && (
        <div className="space-y-4">
          <OrganizationTreeManager
            companyId={effectiveCompanyId}
            isRtl={isRtl}
            theme={theme}
            onStructureChange={() => {
              setCompaniesRefreshTrigger(prev => prev + 1);
            }}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: ERP MODULES & SUBSCRIPTION PLAN (Admin / SystemAdmin only)         */}
      {/* ========================================================================= */}
      {centerTab === 'modules' && !isScopedAdmin && (
        <div className="space-y-5">
          {/* Header Card */}
          <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div>
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Boxes size={16} className="text-indigo-600" />
                <span>{isRtl ? `موديولات نظام ERP للشركة (${activeCompany?.name || effectiveCompanyId})` : `ERP Modules Registry (${activeCompany?.name || effectiveCompanyId})`}</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isRtl 
                  ? 'تفعيل وتعطيل الموديولات والأنظمة الفرعية على مستوى مستأجر الشركة.' 
                  : 'Enable or disable ERP modules and sub-systems across this tenant.'}
              </p>
            </div>

            {activeCompany && (
              <div className="flex items-center gap-2 text-xs">
                <span className="px-3 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800">
                  {isRtl ? `الخطة: ${activeCompany.subscription_plan || 'Enterprise'}` : `Plan: ${activeCompany.subscription_plan || 'Enterprise'}`}
                </span>
              </div>
            )}
          </div>

          {/* Modules Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {ERP_MODULES_REGISTRY.map((mod) => {
              const setting = companyModules[mod.id] || {
                enabled: true,
                plan: 'Enterprise',
                status: 'active'
              };
              const isEnabled = setting.enabled !== false;

              return (
                <div
                  key={mod.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                    isEnabled
                      ? 'border-indigo-200 dark:border-indigo-900/40 bg-white dark:bg-slate-900 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 opacity-75'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-xl border font-bold ${
                          isEnabled
                            ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/20'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-400 border-slate-300 dark:border-slate-700'
                        }`}>
                          <Package size={16} />
                        </div>
                        <div>
                          <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100">
                            {isRtl ? mod.name_ar : mod.name_en}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-mono">{mod.id}</span>
                        </div>
                      </div>

                      <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black ${
                        isEnabled
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                      }`}>
                        {isEnabled ? (isRtl ? 'مفعّل' : 'Enabled') : (isRtl ? 'معطّل' : 'Disabled')}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      {isRtl ? mod.description_ar : mod.description_en}
                    </p>
                  </div>

                  {canManageModules && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold">
                        {isRtl ? 'حالة التفعيل:' : 'Status:'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggleCompanyModule(mod.id, !isEnabled)}
                        className={`px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                          isEnabled
                            ? 'bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 border border-rose-200 dark:border-rose-900/40'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs'
                        }`}
                      >
                        <Power size={12} />
                        <span>{isEnabled ? (isRtl ? 'تعطيل الموديول' : 'Disable') : (isRtl ? 'تفعيل الموديول' : 'Enable')}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: SAAS COMPANIES & SUBSCRIPTIONS (SystemAdmin only)                  */}
      {/* ========================================================================= */}
      {centerTab === 'companies' && isSystemAdmin && (
        <div className="space-y-4">
          {/* Header & KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className={`p-3.5 rounded-2xl border ${
              theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400">{isRtl ? 'إجمالي الشركات' : 'Total Companies'}</span>
                <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                  <Building2 size={16} />
                </div>
              </div>
              <p className="text-xl font-black text-slate-800 dark:text-slate-100 mt-1">{allCompanies.length}</p>
              <span className="text-[10px] text-slate-400">{isRtl ? 'مؤسسات مسجلة' : 'Registered tenants'}</span>
            </div>

            <div className={`p-3.5 rounded-2xl border ${
              theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400">{isRtl ? 'شركات نشطة' : 'Active'}</span>
                <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={16} />
                </div>
              </div>
              <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                {allCompanies.filter(c => c.subscription_status === 'active' && c.is_active !== false).length}
              </p>
              <span className="text-[10px] text-emerald-500 font-bold">{isRtl ? 'اشتراك ساري' : 'Active licenses'}</span>
            </div>

            <div className={`p-3.5 rounded-2xl border ${
              theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400">{isRtl ? 'معطلة / منتهية' : 'Suspended'}</span>
                <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
                  <AlertTriangle size={16} />
                </div>
              </div>
              <p className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1">
                {allCompanies.filter(c => c.subscription_status === 'suspended' || c.is_active === false).length}
              </p>
              <span className="text-[10px] text-rose-500 font-bold">{isRtl ? 'متوقفة مؤقتاً' : 'Suspended'}</span>
            </div>

            <div className={`p-3.5 rounded-2xl border ${
              theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400">{isRtl ? 'إجمالي المستخدمين' : 'Total SaaS Users'}</span>
                <div className="p-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400">
                  <Users2 size={16} />
                </div>
              </div>
              <p className="text-xl font-black text-sky-600 dark:text-sky-400 mt-1">
                {users.filter(u => u.is_active !== false).length}
              </p>
              <span className="text-[10px] text-slate-400">{isRtl ? 'عبر كافة الشركات' : 'Across all tenants'}</span>
            </div>
          </div>

          {/* Companies Toolbar: Search, Sort, and Add Company */}
          <div className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border flex-1 ${
                theme === 'dark' ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50 border-slate-200'
              }`}>
                <Search size={14} className="text-slate-400 shrink-0" />
                <input
                  type="text"
                  placeholder={isRtl ? 'البحث عن شركة بالاسم أو الكود...' : 'Search companies by name or ID...'}
                  value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                  className="w-full bg-transparent text-xs focus:outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
                />
                {companySearch && (
                  <button onClick={() => setCompanySearch('')} className="text-slate-400 hover:text-slate-600">
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Sorting Filter */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleSortCompanies('name')}
                  className={`px-2.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1 ${
                    companySortField === 'name'
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400'
                      : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  title={isRtl ? 'ترتيب حسب الاسم' : 'Sort by name'}
                >
                  <ArrowUpDown size={12} />
                  <span className="hidden md:inline">{isRtl ? 'الاسم' : 'Name'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSortCompanies('userCount')}
                  className={`px-2.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1 ${
                    companySortField === 'userCount'
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400'
                      : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  title={isRtl ? 'ترتيب حسب عدد الموظفين' : 'Sort by users count'}
                >
                  <Users2 size={12} />
                  <span className="hidden md:inline">{isRtl ? 'الموظفين' : 'Users'}</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setNewCompanyName('');
                setNewCompanyId('');
                setNewCompanyCustody(0);
                setNewCompanyPlan('Basic');
                setNewCompanyStatus('active');
                setNewCompanyAdminName('');
                setNewCompanyAdminEmail('');
                setNewCompanyAdminPassword('');
                setShowAddCompanyModal(true);
              }}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              <Plus size={14} />
              <span>{isRtl ? 'إضافة شركة ومستأجر جديد' : 'Add New Company / Tenant'}</span>
            </button>
          </div>

          {/* Companies Grid */}
          {isLoadingCompanies ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 animate-pulse">
              {[1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-2xl border h-48 flex flex-col justify-between ${
                    theme === 'dark' ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800" />
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-2/3" />
                      <div className="h-3 bg-slate-100 dark:bg-slate-800/60 rounded w-1/3" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="h-8 bg-slate-100 dark:bg-slate-800/40 rounded-xl" />
                    <div className="h-8 bg-slate-100 dark:bg-slate-800/40 rounded-xl" />
                    <div className="h-8 bg-slate-100 dark:bg-slate-800/40 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {sortedAndFilteredCompanies.map((comp) => {
              const isCurrent = comp.id === effectiveCompanyId;
              const companyUsersCount = users.filter(u => u.company_id === comp.id && u.is_active !== false).length;
              const companyUnitsCount = OrganizationEngine.getOrganizationUnits(comp.id).length;
              const companyMods = ModulesModule.getCompanyModules(comp.id);
              const enabledModsCount = Object.values(companyMods).filter(m => m.enabled).length;

              const planBadgeColors = {
                Enterprise: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/20',
                Pro: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/20',
                Basic: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/20',
                Custom: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20'
              };

              return (
                <div
                  key={comp.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3.5 ${
                    isCurrent
                      ? 'border-indigo-600 bg-indigo-50/10 dark:bg-indigo-950/20 shadow-md ring-2 ring-indigo-500/20'
                      : theme === 'dark'
                      ? 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                      : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Card Header: Icon, Name, ID, Badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 font-black text-xs shrink-0">
                          <Building2 size={18} />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                            <span>{comp.name}</span>
                            {isCurrent && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-indigo-600 text-white">
                                {isRtl ? 'النشطة' : 'Active Scope'}
                              </span>
                            )}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-mono block mt-0.5">{comp.id}</span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black border ${
                          comp.subscription_status === 'active' && comp.is_active !== false
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
                            : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/20'
                        }`}>
                          {comp.subscription_status === 'active' && comp.is_active !== false ? (isRtl ? 'نشط' : 'Active') : (isRtl ? 'معطل' : 'Suspended')}
                        </span>

                        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black border ${planBadgeColors[comp.subscription_plan || 'Basic'] || planBadgeColors.Basic}`}>
                          {comp.subscription_plan || 'Basic'}
                        </span>
                      </div>
                    </div>

                    {/* Expiry Date */}
                    {comp.subscription_expiry && (
                      <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        <Calendar size={12} className="text-slate-400" />
                        <span>{isRtl ? 'انتهاء الاشتراك:' : 'Expires:'} {comp.subscription_expiry}</span>
                      </div>
                    )}

                    {/* Quick Metrics Grid */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                      <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-center">
                        <span className="text-[10px] text-slate-400 block">{isRtl ? 'الموظفون' : 'Users'}</span>
                        <span className="font-black text-slate-700 dark:text-slate-200 text-xs">{companyUsersCount}</span>
                      </div>

                      <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-center">
                        <span className="text-[10px] text-slate-400 block">{isRtl ? 'الفروع' : 'Units'}</span>
                        <span className="font-black text-slate-700 dark:text-slate-200 text-xs">{companyUnitsCount}</span>
                      </div>

                      <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-center">
                        <span className="text-[10px] text-slate-400 block">{isRtl ? 'الموديولات' : 'Modules'}</span>
                        <span className="font-black text-indigo-600 dark:text-indigo-400 text-xs">{enabledModsCount}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    {/* Management Navigation Tabs */}
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          handleCompanyChange(comp.id);
                          setCenterTab('users');
                        }}
                        className="py-1.5 px-2 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300 hover:text-indigo-600 transition-all flex items-center justify-center gap-1"
                        title={isRtl ? 'إدارة موظفي وصلاحيات هذه الشركة' : 'Manage Company Users'}
                      >
                        <Users2 size={12} />
                        <span>{isRtl ? 'المستخدمين' : 'Users'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          handleCompanyChange(comp.id);
                          setCenterTab('org_structure');
                        }}
                        className="py-1.5 px-2 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300 hover:text-indigo-600 transition-all flex items-center justify-center gap-1"
                        title={isRtl ? 'إدارة الهيكل التنظيمي والفروع لهذه الشركة' : 'Manage Org Structure'}
                      >
                        <FolderTree size={12} />
                        <span>{isRtl ? 'الهيكل' : 'Org Units'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          handleCompanyChange(comp.id);
                          setCenterTab('modules');
                        }}
                        className="py-1.5 px-2 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300 hover:text-indigo-600 transition-all flex items-center justify-center gap-1"
                        title={isRtl ? 'تفعيل وتخصيص موديولات الشركة' : 'Manage Company Modules'}
                      >
                        <Layers size={12} />
                        <span>{isRtl ? 'الموديولات' : 'Modules'}</span>
                      </button>
                    </div>

                    {/* Operational Action Buttons: Edit, Toggle Active, Delete */}
                    <div className="flex items-center justify-between gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleStartEditCompany(comp)}
                        className="flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Edit2 size={12} />
                        <span>{isRtl ? 'تعديل والاشتراك' : 'Edit & Plan'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleCompanyActive(comp)}
                        className={`p-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                          comp.is_active !== false && comp.subscription_status === 'active'
                            ? 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
                        }`}
                        title={comp.is_active !== false ? (isRtl ? 'تعطيل الشركة مؤقتاً' : 'Suspend Company') : (isRtl ? 'تفعيل الشركة' : 'Activate Company')}
                      >
                        <Power size={13} />
                      </button>

                      {allCompanies.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setDeletingCompany(comp)}
                          className="p-1.5 rounded-lg text-xs bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 transition-all cursor-pointer"
                          title={isRtl ? 'حذف الشركة' : 'Delete Company'}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          )}

          {!isLoadingCompanies && sortedAndFilteredCompanies.length === 0 && (
            <div className={`p-8 rounded-2xl border text-center space-y-2 ${
              theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <Building2 size={28} className="mx-auto text-slate-400" />
              <p className="text-xs font-bold text-slate-500">{isRtl ? 'لم يتم العثور على شركات مطابقة' : 'No companies found'}</p>
            </div>
          )}
        </div>
      )}

      {/* New User Register Modal with Password and Security Controls */}
      {showNewUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
          <div className={`w-full max-w-lg p-5 rounded-2xl border shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black">
                  <UserPlus size={16} />
                </div>
                <h3 className="font-black text-sm">
                  {isRtl ? 'تسجيل وتعيين موظف جديد' : 'Register & Provision New Employee'}
                </h3>
              </div>

              <button
                onClick={() => setShowNewUserModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={async (e) => {
              const res = await handleAddUser(e);
              if (res !== false) {
                setShowNewUserModal(false);
              }
            }} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-500 font-bold mb-1">{isRtl ? 'الاسم بالكامل:' : 'Full Name:'}</label>
                <input
                  type="text"
                  required
                  placeholder={isRtl ? 'الاسم الثلاثي للموظف' : 'Employee Full Name'}
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'
                  }`}
                />
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">{isRtl ? 'البريد الإلكتروني:' : 'Email Address:'}</label>
                <input
                  type="email"
                  required
                  placeholder="user@company.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'
                  }`}
                />
              </div>

              {/* Password Management for New User */}
              <div className="space-y-1.5 p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                <div className="flex items-center justify-between">
                  <label className="text-slate-600 dark:text-slate-300 font-bold flex items-center gap-1.5">
                    <KeyRound size={13} className="text-indigo-600" />
                    <span>{isRtl ? 'كلمة المرور الأولية للإنشاء:' : 'Initial Password:'}</span>
                  </label>
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles size={12} />
                    <span>{isRtl ? 'توليد تلقائي' : 'Generate Random'}</span>
                  </button>
                </div>

                <div className="relative flex items-center">
                  <input
                    type={showNewUserPassword ? 'text' : 'password'}
                    placeholder={isRtl ? 'اتركها فارغة للتوليد التلقائي أو أدخل كلمة سر' : 'Enter password or leave blank to auto-generate'}
                    value={activeNewUserPassword}
                    onChange={(e) => setActiveNewUserPassword(e.target.value)}
                    className={`w-full pl-16 pr-3 py-2 rounded-xl border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200'
                    }`}
                  />
                  <div className="absolute left-2 flex items-center gap-1 text-slate-400">
                    <button
                      type="button"
                      onClick={() => setShowNewUserPassword(!showNewUserPassword)}
                      className="p-1 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showNewUserPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    {activeNewUserPassword && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(activeNewUserPassword);
                          triggerToast?.(isRtl ? '📋 تم نسخ كلمة المرور' : '📋 Password copied');
                        }}
                        className="p-1 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        <Copy size={13} />
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isRtl
                    ? 'اختياري — اترك الحقل فارغاً للتوليد التلقائي؛ بحد أدنى 12 حرفاً في حال الإدخال اليدوي'
                    : 'Optional — leave blank to auto-generate; minimum 12 characters if typed.'}
                </p>

                {activeNewUserPassword.trim().length > 0 && activeNewUserPassword.trim().length < 12 && (
                  <p className="text-[11px] text-rose-500 font-bold">
                    {isRtl
                      ? '⚠️ كلمة المرور يجب أن لا تقل عن 12 حرفاً'
                      : '⚠️ Password must be at least 12 characters'}
                  </p>
                )}

                <label className="flex items-center gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeNewUserMustChangePassword}
                    onChange={(e) => setActiveNewUserMustChangePassword(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-[11px] text-slate-600 dark:text-slate-300 font-bold">
                    {isRtl ? 'إلزام الموظف بتغيير كلمة المرور عند أول تسجيل دخول' : 'Require password change on first login'}
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">{isRtl ? 'الدور الوظيفي:' : 'System Role:'}</label>
                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl border bg-slate-50 dark:bg-slate-800/50">
                  {SYSTEM_ROLES.filter(r => !r.systemAdminOnly || isSystemAdmin).map(r => (
                    <label key={r.id} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="modalUserRole"
                        checked={newUserRole === r.id}
                        onChange={() => setNewUserRole(r.id)}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className={`text-[11px] font-bold ${r.colorClass}`}>{isRtl ? r.labelAr : r.labelEn}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Company Selection for user creation (visible to SystemAdmin or when multi-company) */}
              {isSystemAdmin && (
                <div className="space-y-1">
                  <label className="block text-slate-500 font-bold mb-1">
                    {isRtl ? 'الشركة / المؤسسة التابع لها الموظف:' : 'Assigned Company / Tenant:'}
                    <span className="text-rose-500 mx-1">*</span>
                  </label>
                  <select
                    id="new-user-modal-company-select"
                    value={activeNewUserCompanyId || selectedCompanyId || effectiveCompanyId}
                    onChange={(e) => {
                      const nextCid = e.target.value;
                      setActiveNewUserCompanyId(nextCid);
                      setSelectedCompanyId(nextCid);
                      CustodyDB.setSelectedCompanyId(nextCid);
                      setNewUserOrgUnitId('');
                      if (setNewUserStationId) setNewUserStationId('');
                      if (setNewUserRegionId) setNewUserRegionId('');
                    }}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  >
                    {allCompanies.length === 0 && (
                      <option value="">{isRtl ? '-- لا توجد شركات --' : '-- No companies --'}</option>
                    )}
                    {allCompanies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.id}) {c.subscription_plan ? `• ${c.subscription_plan}` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400">
                    {isRtl
                      ? 'حدد الشركة التي ينتمي إليها الموظف لربطه بهيكلها الإداري'
                      : 'Select the company the employee belongs to in order to display its organization units'}
                  </p>
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-slate-500 font-bold mb-1">
                  {newUserRole === 'Admin'
                    ? (isRtl ? 'الفرع أو الوحدة الإشرافية (اختياري لمدير الشركة - الافتراضي كامل فروع الشركة):' : 'Supervisory Unit (Optional for Company Admin - Defaults to entire company):')
                    : (isRtl ? 'نطاق الفرع / المحطة (الشجرة التنظيمية):' : 'Supervisory Scope (Organization Tree):')}
                  {newUserRole !== 'Admin' && newUserRole !== 'SystemAdmin' && <span className="text-rose-500 mx-1">*</span>}
                </label>
                <OrgUnitTreeSelect
                  companyId={activeNewUserCompanyId || selectedCompanyId || effectiveCompanyId}
                  value={newUserOrgUnitId}
                  onChange={(unitId) => {
                    const newOrgUnitId = Array.isArray(unitId) ? unitId[0] : unitId;
                    setNewUserOrgUnitId(newOrgUnitId);
                    if (newOrgUnitId) {
                      const derived = deriveScopeIdsFromOrgUnit(newOrgUnitId, newUserRole);
                      if (derived.unlinked && (newUserRole === 'StationAdmin' || newUserRole === 'RegionalManager')) {
                        alert(derived.unlinkedMessage || (isRtl
                          ? 'تنبيه: الوحدة التنظيمية المحددة غير مرتبطة بسجل منطقة أو محطة.'
                          : 'Warning: The selected organizational unit is not linked to a Region or Station record.'));
                      } else if (newUserRole === 'StationAdmin' && !derived.station_id) {
                        alert(isRtl
                          ? 'تنبيه: الوحدة التنظيمية المحددة ليست مرتبطة بمحطة/فرع صرف، وهو ما قد يتعارض مع دور مدير الفرع/المحطة.'
                          : 'Warning: The selected organizational unit is not linked to a station/branch, which may conflict with the Station Admin role.');
                      } else if (newUserRole === 'RegionalManager' && !derived.region_id) {
                        alert(isRtl
                          ? 'تنبيه: الوحدة التنظيمية المحددة ليست مرتبطة بمنطقة جغرافية، وهو ما قد يتعارض مع دور مدير المنطقة.'
                          : 'Warning: The selected organizational unit is not linked to a region, which may conflict with the Regional Manager role.');
                      }
                    }
                  }}
                  mode="single"
                  isRtl={isRtl}
                  theme={theme}
                  showInheritanceSummary={true}
                  placeholder={isRtl ? 'اختر الفرع أو المحطة التابع لها...' : 'Select assigned Branch or Station...'}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowNewUserModal(false)}
                  className="px-4 py-2 rounded-xl border text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-md shadow-indigo-600/20"
                >
                  {isRtl ? 'إنشاء وتعميم الصلاحيات' : 'Provision User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add New Company & Subscription */}
      {showAddCompanyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
          <div className={`w-full max-w-lg p-5 rounded-2xl border shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black">
                  <Building2 size={16} />
                </div>
                <h3 className="font-black text-sm">
                  {isRtl ? 'إضافة شركة / مستأجر جديد (Multi-Tenant)' : 'Add New Tenant Company'}
                </h3>
              </div>
              <button
                onClick={() => setShowAddCompanyModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCompany} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 font-bold mb-1">{isRtl ? 'اسم الشركة / المؤسسة:' : 'Company Name:'}</label>
                  <input
                    type="text"
                    required
                    placeholder={isRtl ? 'شركة الفلاح للنقليات' : 'Acme Logistics Co.'}
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-slate-500 font-bold mb-1">{isRtl ? 'كود المعرف (ID):' : 'Company ID Code:'}</label>
                  <input
                    type="text"
                    placeholder="comp_alfallah"
                    value={newCompanyId}
                    onChange={(e) => setNewCompanyId(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-500 font-bold mb-1">{isRtl ? 'باقة الاشتراك:' : 'Subscription Plan:'}</label>
                  <select
                    value={newCompanyPlan}
                    onChange={(e) => setNewCompanyPlan(e.target.value as any)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <option value="Basic">Basic</option>
                    <option value="Professional">Professional</option>
                    <option value="Enterprise">Enterprise</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-500 font-bold mb-1">{isRtl ? 'حالة الاشتراك:' : 'Status:'}</label>
                  <select
                    value={newCompanyStatus}
                    onChange={(e) => setNewCompanyStatus(e.target.value as any)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <option value="active">{isRtl ? 'نشط' : 'Active'}</option>
                    <option value="suspended">{isRtl ? 'معطل / موقوف' : 'Suspended'}</option>
                    <option value="trial">{isRtl ? 'تجريبي' : 'Trial'}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-500 font-bold mb-1">{isRtl ? 'تاريخ الانتهاء:' : 'Expiry Date:'}</label>
                  <input
                    type="date"
                    value={newCompanyExpiry}
                    onChange={(e) => setNewCompanyExpiry(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'
                    }`}
                  />
                </div>
              </div>

              {/* Initial Admin Account */}
              <div className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2.5">
                <h4 className="font-black text-slate-700 dark:text-slate-200 text-xs flex items-center gap-1.5">
                  <UserCheck size={14} className="text-indigo-600" />
                  <span>{isRtl ? 'حساب مدير النظام الرئيسي للشركة (Company Admin):' : 'Company Initial Administrator Account:'}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    placeholder={isRtl ? 'اسم مدير الشركة (مثلاً: محمد أحمد)' : 'Admin Full Name'}
                    value={newCompanyAdminName}
                    onChange={(e) => setNewCompanyAdminName(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200'
                    }`}
                  />
                  <input
                    type="email"
                    placeholder="admin@company.com"
                    value={newCompanyAdminEmail}
                    onChange={(e) => setNewCompanyAdminEmail(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs font-mono ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200'
                    }`}
                  />
                </div>

                <div className="relative flex items-center">
                  <input
                    type={showNewCompanyAdminPassword ? 'text' : 'password'}
                    placeholder={isRtl ? 'كلمة المرور (اتركها فارغة للتوليد التلقائي)' : 'Admin password (leave blank for auto)'}
                    value={newCompanyAdminPassword}
                    onChange={(e) => setNewCompanyAdminPassword(e.target.value)}
                    className={`w-full pl-10 pr-3 py-2 rounded-xl border text-xs font-mono ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewCompanyAdminPassword(!showNewCompanyAdminPassword)}
                    className="absolute left-2.5 p-1 text-slate-400 hover:text-slate-600"
                  >
                    {showNewCompanyAdminPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>

              {/* Modules selection */}
              <div className="space-y-1.5">
                <label className="block text-slate-500 font-bold">{isRtl ? 'الموديولات المتاحة للشركة:' : 'Enabled Modules:'}</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ERP_MODULES_REGISTRY.map((mod) => (
                    <label key={mod.id} className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer ${
                      newCompanyModules[mod.id] !== false
                        ? 'bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800'
                        : 'border-slate-200 dark:border-slate-800 opacity-60'
                    }`}>
                      <input
                        type="checkbox"
                        checked={newCompanyModules[mod.id] !== false}
                        onChange={(e) => setNewCompanyModules(prev => ({ ...prev, [mod.id]: e.target.checked }))}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">
                        {isRtl ? mod.name_ar : mod.name_en}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddCompanyModal(false)}
                  className="px-4 py-2 rounded-xl border text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-md shadow-indigo-600/20"
                >
                  {isRtl ? 'إنشاء الشركة وتفعيل الاشتراك' : 'Create & Activate Company'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Created Company Admin Credentials */}
      {createdCompanyCredentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
          <div className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl space-y-4 ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black">
                <CheckCircle2 size={22} />
              </div>
              <div>
                <h3 className="font-black text-sm text-emerald-600 dark:text-emerald-400">
                  {isRtl ? 'تم إنشاء الشركة وحساب المدير بنجاح!' : 'Company & Admin Created Successfully!'}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {isRtl ? 'يرجى حفظ بيانات الاعتماد لاستخدامها في تسجيل الدخول' : 'Please save login credentials to log in'}
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
                <div>
                  <span className="text-slate-400 text-[10px] block">{isRtl ? 'اسم الشركة:' : 'Company Name:'}</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{createdCompanyCredentials.companyName}</span>
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-slate-400 text-[10px] block">{isRtl ? 'البريد الإلكتروني (اسم المستخدم):' : 'Admin Email:'}</span>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-100 select-all">{createdCompanyCredentials.adminEmail}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(createdCompanyCredentials.adminEmail);
                        triggerToast?.(isRtl ? '📋 تم نسخ البريد الإلكتروني' : '📋 Email copied');
                      }}
                      className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-700"
                      title={isRtl ? 'نسخ البريد' : 'Copy Email'}
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-slate-400 text-[10px] block">{isRtl ? 'كلمة المرور الابتدائية:' : 'Temporary Password:'}</span>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-sm select-all">
                      {showCreatedPassword ? createdCompanyCredentials.adminPassword : '••••••••••••••••'}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setShowCreatedPassword(!showCreatedPassword)}
                        className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-700"
                        title={showCreatedPassword ? 'إخفاء' : 'إظهار'}
                      >
                        {showCreatedPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(createdCompanyCredentials.adminPassword);
                          triggerToast?.(isRtl ? '📋 تم نسخ كلمة المرور' : '📋 Password copied');
                        }}
                        className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-700"
                        title={isRtl ? 'نسخ كلمة المرور' : 'Copy Password'}
                      >
                        <Copy size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300">
                ⚠️ {isRtl 
                  ? 'حساب المدير ملزم بتغيير كلمة المرور عند تسجيل الدخول الأول لأسباب أمنية.'
                  : 'The administrator must change their password upon their first login for security reasons.'}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  const credText = `Company: ${createdCompanyCredentials.companyName}\nEmail: ${createdCompanyCredentials.adminEmail}\nPassword: ${createdCompanyCredentials.adminPassword}`;
                  navigator.clipboard.writeText(credText);
                  triggerToast?.(isRtl ? '📋 تم نسخ كافة بيانات الاعتماد' : '📋 All credentials copied');
                }}
                className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5"
              >
                <Copy size={13} />
                <span>{isRtl ? 'نسخ كافة البيانات' : 'Copy All'}</span>
              </button>
              <button
                type="button"
                onClick={() => setCreatedCompanyCredentials(null)}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-md shadow-indigo-600/20"
              >
                {isRtl ? 'تم / إغلاق' : 'Done / Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Company & Subscription Plan */}
      {editingCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
          <div className={`w-full max-w-lg p-5 rounded-2xl border shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black">
                  <Edit2 size={16} />
                </div>
                <h3 className="font-black text-sm">
                  {isRtl ? `تعديل بيانات واشتراك: ${editingCompany.name}` : `Edit Tenant: ${editingCompany.name}`}
                </h3>
              </div>
              <button
                onClick={() => setEditingCompany(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Tabs: Details / Modules */}
            <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setActiveEditCompanyModalTab('details')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  activeEditCompanyModalTab === 'details'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {isRtl ? 'بيانات الشركة والاشتراك' : 'Company & Plan'}
              </button>
              <button
                type="button"
                onClick={() => setActiveEditCompanyModalTab('modules')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  activeEditCompanyModalTab === 'modules'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {isRtl ? 'موديولات النظام المتاحة' : 'ERP Modules'}
              </button>
            </div>

            <form onSubmit={handleSaveEditCompany} className="space-y-3.5 text-xs">
              {activeEditCompanyModalTab === 'details' ? (
                <>
                  <div>
                    <label className="block text-slate-500 font-bold mb-1">{isRtl ? 'اسم الشركة / المؤسسة:' : 'Company Name:'}</label>
                    <input
                      type="text"
                      required
                      value={editCompanyName}
                      onChange={(e) => setEditCompanyName(e.target.value)}
                      className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'
                      }`}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-slate-500 font-bold mb-1">{isRtl ? 'باقة الاشتراك:' : 'Subscription Plan:'}</label>
                      <select
                        value={editCompanyPlan}
                        onChange={(e) => setEditCompanyPlan(e.target.value as any)}
                        className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                          theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <option value="Basic">Basic</option>
                        <option value="Professional">Professional</option>
                        <option value="Enterprise">Enterprise</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-500 font-bold mb-1">{isRtl ? 'حالة الاشتراك:' : 'Status:'}</label>
                      <select
                        value={editCompanyStatus}
                        onChange={(e) => setEditCompanyStatus(e.target.value as any)}
                        className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                          theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <option value="active">{isRtl ? 'نشط' : 'Active'}</option>
                        <option value="suspended">{isRtl ? 'معطل / موقوف' : 'Suspended'}</option>
                        <option value="trial">{isRtl ? 'تجريبي' : 'Trial'}</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-500 font-bold mb-1">{isRtl ? 'تاريخ الانتهاء:' : 'Expiry Date:'}</label>
                      <input
                        type="date"
                        value={editCompanyExpiry}
                        onChange={(e) => setEditCompanyExpiry(e.target.value)}
                        className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                          theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'
                        }`}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] text-slate-400">
                    {isRtl ? 'حدد الموديولات المتاحة للاستخدام لموظفي هذه الشركة:' : 'Select enabled modules for this tenant:'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ERP_MODULES_REGISTRY.map((mod) => {
                      const isEnabled = editCompanyModulesSettings[mod.id]?.enabled !== false;
                      return (
                        <div
                          key={mod.id}
                          onClick={() => {
                            setEditCompanyModulesSettings(prev => ({
                              ...prev,
                              [mod.id]: {
                                ...(prev[mod.id] || {
                                  plan: editCompanyPlan || 'Basic',
                                  status: 'active',
                                  activation_date: new Date().toISOString().split('T')[0],
                                  expiry_date: editCompanyExpiry || '2028-12-31'
                                }),
                                enabled: !isEnabled
                              }
                            }));
                          }}
                          className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                            isEnabled
                              ? 'bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                              : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-400'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              readOnly
                              className="rounded text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="font-bold text-xs">{isRtl ? mod.name_ar : mod.name_en}</span>
                          </div>
                          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                            isEnabled ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                          }`}>
                            {isEnabled ? (isRtl ? 'مفعل' : 'ON') : (isRtl ? 'معطل' : 'OFF')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingCompany(null)}
                  className="px-4 py-2 rounded-xl border text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-md shadow-indigo-600/20"
                >
                  {isRtl ? 'حفظ التعديلات' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Company Confirmation */}
      {deletingCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
          <div className={`w-full max-w-md p-5 rounded-2xl border shadow-2xl space-y-4 ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-black text-sm text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                <Trash2 size={16} />
                <span>{isRtl ? 'تأكيد حذف الشركة' : 'Confirm Company Deletion'}</span>
              </h3>
              <button onClick={() => setDeletingCompany(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <p>
                {isRtl 
                  ? `هل أنت متأكد من رغبتك في حذف الشركة (${deletingCompany.name})؟` 
                  : `Are you sure you want to permanently delete company (${deletingCompany.name})?`}
              </p>
              <p className="text-[11px] text-rose-500 font-bold">
                {isRtl 
                  ? '⚠️ تحذير: سيتم إلغاء تفعيل كافة ارتباطات هذه الشركة.' 
                  : '⚠️ Warning: This will remove tenant configurations.'}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => !isDeletingCompany && setDeletingCompany(null)}
                disabled={isDeletingCompany}
                className="px-4 py-2 rounded-xl border text-slate-500 hover:bg-slate-100 font-bold text-xs disabled:opacity-50"
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleDeleteCompany}
                disabled={isDeletingCompany}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-md shadow-rose-600/20 disabled:opacity-50 flex items-center gap-1.5"
              >
                {isDeletingCompany ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>{isRtl ? 'جاري الحذف...' : 'Deleting...'}</span>
                  </>
                ) : (
                  <span>{isRtl ? 'تأكيد الحذف' : 'Confirm Delete'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Signup Request Modal */}
      {rejectingSignupId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
          <div className={`w-full max-w-md p-5 rounded-2xl border shadow-2xl space-y-4 ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-black text-sm text-rose-600 dark:text-rose-400">
                {isRtl ? 'رفض طلب التسجيل' : 'Reject Signup Request'}
              </h3>
              <button
                onClick={() => setRejectingSignupId(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-500">
                {isRtl ? 'يرجى كتابة سبب رفض طلب التسجيل لتسجيله في سجل التدقيق والمتابعة:' : 'Please provide a reason for rejecting this signup application for audit tracking:'}
              </p>
              <textarea
                rows={3}
                required
                value={signupRejectReason}
                onChange={(e) => setSignupRejectReason(e.target.value)}
                placeholder={isRtl ? 'سبب الرفض...' : 'Rejection reason...'}
                className={`w-full p-2.5 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 ${
                  theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'
                }`}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setRejectingSignupId(null)}
                className="px-4 py-2 rounded-xl border text-slate-500 hover:bg-slate-100 font-bold text-xs"
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const req = signupRequests.find(r => r.id === rejectingSignupId);
                  if (req) handleRejectSignup(req);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-md shadow-rose-600/20"
              >
                {isRtl ? 'تأكيد الرفض' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review & Approve Account Correction Modal */}
      {approvingCorrectionReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
          <div className={`w-full max-w-lg p-5 rounded-2xl border shadow-2xl space-y-4 ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-sky-600 text-white flex items-center justify-center font-black">
                  <KeyRound size={16} />
                </div>
                <h3 className="font-black text-sm">
                  {isRtl ? 'مراجعة واعتماد طلب تصحيح الحساب' : 'Review & Approve Account Correction'}
                </h3>
              </div>
              <button
                onClick={() => setApprovingCorrectionReq(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            {corrError && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs font-bold">
                ⚠️ {corrError}
              </div>
            )}

            <div className="space-y-3.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                <span className="text-[10px] text-slate-400 block">{isRtl ? 'الحساب المستهدف للتعديل:' : 'Target Account:'}</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{approvingCorrectionReq.targetUserName || approvingCorrectionReq.targetEmail}</span>
                <span className="font-mono text-[11px] text-slate-500 block">{approvingCorrectionReq.targetEmail}</span>
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">{isRtl ? 'البريد الإلكتروني المعتمد:' : 'Approved Email:'}</label>
                <input
                  type="email"
                  value={corrEditEmail}
                  onChange={(e) => setCorrEditEmail(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'
                  }`}
                />
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">{isRtl ? 'الاسم بالكامل المعتمد:' : 'Approved Full Name:'}</label>
                <input
                  type="text"
                  value={corrEditName}
                  onChange={(e) => setCorrEditName(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'
                  }`}
                />
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">
                  {isRtl ? 'تعيين كلمة مرور جديدة (اختياري، اترك فارغاً إذا لم يُطلب):' : 'Set New Password (Optional, leave blank if not needed):'}
                </label>
                <input
                  type="text"
                  value={corrEditPassword}
                  onChange={(e) => setCorrEditPassword(e.target.value)}
                  placeholder={isRtl ? 'كلمة المرور الجديدة...' : 'New password...'}
                  className={`w-full px-3 py-2 rounded-xl border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'
                  }`}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setApprovingCorrectionReq(null)}
                className="px-4 py-2 rounded-xl border text-slate-500 hover:bg-slate-100 font-bold text-xs"
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirmApproveCorrection}
                className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-black text-xs shadow-md shadow-sky-600/20"
              >
                {isRtl ? 'حفظ وتحديث الحساب' : 'Apply & Update Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Correction Modal */}
      {rejectingCorrectionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
          <div className={`w-full max-w-md p-5 rounded-2xl border shadow-2xl space-y-4 ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-black text-sm text-rose-600 dark:text-rose-400">
                {isRtl ? 'رفض طلب تصحيح الحساب' : 'Reject Account Correction'}
              </h3>
              <button
                onClick={() => setRejectingCorrectionId(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-500">
                {isRtl ? 'يرجى كتابة سبب رفض طلب التعديل لتسجيله في سجل المتابعة:' : 'Please provide a reason for rejecting this correction request:'}
              </p>
              <textarea
                rows={3}
                required
                value={correctionRejectReason}
                onChange={(e) => setCorrectionRejectReason(e.target.value)}
                placeholder={isRtl ? 'سبب الرفض...' : 'Rejection reason...'}
                className={`w-full p-2.5 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 ${
                  theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'
                }`}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setRejectingCorrectionId(null)}
                className="px-4 py-2 rounded-xl border text-slate-500 hover:bg-slate-100 font-bold text-xs"
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const req = correctionRequests.find(r => r.id === rejectingCorrectionId);
                  if (req) handleRejectCorrection(req);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-md shadow-rose-600/20"
              >
                {isRtl ? 'تأكيد الرفض' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
}
