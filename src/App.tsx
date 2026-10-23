import React, { useState, useEffect, Suspense, lazy } from 'react';
import { CustodyDB, ModulesModule } from './db';
import { AppUser, Language, Theme, Transaction } from './types';
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import Layout from './components/Layout';
import { Download, X, Smartphone, ArrowDown, Sparkles, ShieldAlert } from 'lucide-react';

// Lazy Loaded Pages for Role-Based Code Splitting
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const NewExpense = lazy(() => import('./pages/NewExpense'));
const PendingTransactions = lazy(() => import('./pages/PendingTransactions'));
const CashPaymentVoucher = lazy(() => import('./pages/CashPaymentVoucher'));
const UnderSettlement = lazy(() => import('./pages/UnderSettlement'));
const CashReconciliation = lazy(() => import('./pages/CashReconciliation'));
const Custody = lazy(() => import('./pages/Custody'));
const Reports = lazy(() => import('./pages/Reports'));
const Search = lazy(() => import('./pages/Search'));
const Settings = lazy(() => import('./pages/Settings'));
const RegionalDashboard = lazy(() => import('./pages/RegionalDashboard'));
const Stations = lazy(() => import('./pages/Stations'));
const StationDetails = lazy(() => import('./pages/StationDetails'));
const AuditLogView = lazy(() => import('./pages/AuditLog'));
const SuperAdmin = lazy(() => import('./pages/SuperAdmin'));
const CompanyAdminDashboard = lazy(() => import('./pages/CompanyAdminDashboard'));
const RegionAdminDashboard = lazy(() => import('./pages/RegionAdminDashboard'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Purchasing = lazy(() => import('./pages/Purchasing'));
const Accounting = lazy(() => import('./pages/Accounting'));
const SalesAR = lazy(() => import('./pages/SalesAR'));
const POS = lazy(() => import('./pages/POS'));
const CRM = lazy(() => import('./pages/CRM'));
const FixedAssets = lazy(() => import('./pages/FixedAssets'));
const FleetManagement = lazy(() => import('./pages/FleetManagement'));
const HRPayroll = lazy(() => import('./pages/HRPayroll'));
const Contracting = lazy(() => import('./pages/Contracting'));
const RestaurantMenu = lazy(() => import('./pages/RestaurantMenu'));
const RestaurantOrders = lazy(() => import('./pages/RestaurantOrders'));
const FirstRunSetup = lazy(() => import('./pages/FirstRunSetup'));
import ApprovalInbox from './components/ApprovalInbox';
import ChangePasswordRequired from './components/ChangePasswordRequired';

export default function App() {
  // Try to load any existing active session, or default to null
  const [activeUser, setActiveUser] = useState<AppUser | null>(() => {
    return CustodyDB.getActiveUser();
  });

  const [hasPlatformOwner, setHasPlatformOwner] = useState<boolean | null>(null);

  useEffect(() => {
    if (!activeUser) {
      let isMounted = true;
      fetch('/api/auth/platform-status')
        .then((res) => {
          if (!res.ok) throw new Error('Status endpoint returned non-200');
          return res.json();
        })
        .then((data) => {
          if (isMounted) {
            setHasPlatformOwner(data?.hasPlatformOwner ?? true);
          }
        })
        .catch((err) => {
          console.warn('Failed to check platform status, defaulting to Login screen:', err);
          if (isMounted) {
            setHasPlatformOwner(true);
          }
        });
      return () => { isMounted = false; };
    }
  }, [activeUser]);

  const [currentTab, setCurrentTab] = useState<string>(() => {
    try {
      const stored = localStorage.getItem('custody_active_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed) {
          const storedTab = localStorage.getItem('custody_active_tab');
          if (storedTab) return storedTab;
          if (parsed.role === 'SystemAdmin' && !parsed.impersonator) return 'super-admin';
          if (parsed.role === 'Admin') return 'dashboard';
          if (parsed.role === 'RegionalManager') return 'region-admin';
          if (parsed.role === 'StationAdmin') return 'reconciliation';
          return 'dashboard';
        }
      }
    } catch {
      // ignore
    }
    return 'dashboard';
  });
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>('ar');
  const [theme, setTheme] = useState<Theme>('light');

  // Shared state: transaction pre-selected for voucher settlement
  const [selectedPendingTx, setSelectedPendingTx] = useState<Transaction | null>(null);

  const [dbVersion, setDbVersion] = useState(0);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'general' | 'users' | 'workflows'>('general');
  const [settingsInitialCenterTab, setSettingsInitialCenterTab] = useState<'users' | 'org_structure' | 'modules' | 'companies'>('users');
  const [settingsSelectedCompanyId, setSettingsSelectedCompanyId] = useState<string>('');

  // PWA Install Prompt State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [showPwaBanner, setShowPwaBanner] = useState(false);

  useEffect(() => {
    // Detect iOS devices
    const isApple = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    setIsIOS(isApple);

    // Only show banner if not in standalone and hasn't dismissed it in this session
    const isDismissed = sessionStorage.getItem('pwa_banner_dismissed') === 'true';
    if (!isStandalone && !isDismissed) {
      // For iOS, show it because we cannot capture beforeinstallprompt
      if (isApple) {
        setShowPwaBanner(true);
      }
    }

    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!isDismissed && !isStandalone) {
        setShowPwaBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handlePwaInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('PWA installation outcome:', outcome);
      if (outcome === 'accepted') {
        setShowPwaBanner(false);
      }
      setDeferredPrompt(null);
    } else if (isIOS) {
      alert(
        language === 'ar'
          ? 'لتثبيت التطبيق على جهاز iPhone/iPad:\n1. اضغط على زر "مشاركة" (Share) في أسفل المتصفح.\n2. اختر "إضافة إلى الشاشة الرئيسية" (Add to Home Screen).\n3. اضغط "إضافة" (Add) في الزاوية العلوية.'
          : 'To install on iPhone/iPad:\n1. Tap the "Share" button at the bottom of Safari.\n2. Scroll down and tap "Add to Home Screen".\n3. Tap "Add" in the top-right corner.'
      );
    }
  };

  const dismissPwaBanner = () => {
    sessionStorage.setItem('pwa_banner_dismissed', 'true');
    setShowPwaBanner(false);
  };

  // Redirect non-admin users if needed
  useEffect(() => {
    if (activeUser) {
      const isAdminOrSystemAdmin = activeUser.role === 'Admin' || activeUser.role === 'SystemAdmin';
      // No redirect needed as reports is default
    }
  }, [activeUser, currentTab]);

  useEffect(() => {
    const handleUpdate = () => {
      setDbVersion(prev => prev + 1);
      
      // Update local user state in case permission configurations or roles change
      const currentActive = CustodyDB.getActiveUser();
      if (currentActive) {
        setActiveUser(prev => {
          if (!prev || prev.id !== currentActive.id || prev.role !== currentActive.role || JSON.stringify(prev.permissions) !== JSON.stringify(currentActive.permissions) || JSON.stringify(prev.impersonator) !== JSON.stringify(currentActive.impersonator)) {
            return currentActive;
          }
          return prev;
        });
      }
    };
    window.addEventListener('custody_db_updated', handleUpdate);
    return () => {
      window.removeEventListener('custody_db_updated', handleUpdate);
    };
  }, []);

  // Listen to cross-module navigate_tab CustomEvent
  useEffect(() => {
    const handleNavigateTab = (e: any) => {
      const detail = e?.detail;
      if (!detail) return;
      const targetTab = detail.tab || 'dashboard';

      if (detail.selectedCompanyId) {
        CustodyDB.setSelectedCompanyId(detail.selectedCompanyId);
        setSettingsSelectedCompanyId(detail.selectedCompanyId);
      }

      if (targetTab === 'settings') {
        if (detail.settingsTab === 'permissions' || detail.settingsTab === 'users' || detail.settingsTab === 'access_control') {
          setSettingsInitialTab('users');
        } else if (detail.settingsTab === 'workflows') {
          setSettingsInitialTab('workflows');
        } else if (detail.settingsTab === 'general') {
          setSettingsInitialTab('general');
        }

        if (detail.centerTab) {
          setSettingsInitialCenterTab(detail.centerTab);
        } else if (detail.settingsTab === 'companies') {
          setSettingsInitialTab('users');
          setSettingsInitialCenterTab('companies');
        } else if (detail.settingsTab === 'org_structure') {
          setSettingsInitialTab('users');
          setSettingsInitialCenterTab('org_structure');
        } else if (detail.settingsTab === 'modules') {
          setSettingsInitialTab('users');
          setSettingsInitialCenterTab('modules');
        }
      }

      setCurrentTab(targetTab);
    };

    window.addEventListener('navigate_tab', handleNavigateTab);
    return () => {
      window.removeEventListener('navigate_tab', handleNavigateTab);
    };
  }, []);

  // Monitor Firebase auth state to ensure session validity and multi-tenancy sync
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        try {
          const stored = localStorage.getItem('custody_active_user');
          let currentLocalUser: AppUser | null = null;
          try {
            currentLocalUser = stored ? JSON.parse(stored) : null;
          } catch (e) {
            currentLocalUser = null;
          }

          if (firebaseUser) {
            // If we are currently impersonating and the impersonator matches the signed-in Firebase user, keep it as-is!
            const isImpersonatingAndValid = currentLocalUser && currentLocalUser.impersonator && 
              currentLocalUser.impersonator.email?.toLowerCase().trim() === firebaseUser.email?.toLowerCase().trim();
            if (isImpersonatingAndValid) {
              // Do nothing, let the user stay in support impersonation session
              return;
            }

            if (!currentLocalUser || currentLocalUser.email?.toLowerCase().trim() !== firebaseUser.email?.toLowerCase().trim()) {
              const users = CustodyDB.getUsers();
              const matchedUser = users.find(u => u.email?.toLowerCase().trim() === firebaseUser.email?.toLowerCase().trim());
              if (matchedUser) {
                // Synchronize ID if needed to enforce rules
                if (matchedUser.id !== firebaseUser.uid) {
                  matchedUser.id = firebaseUser.uid;
                  try {
                    await CustodyDB.saveUsers(users.map(u => (u.email?.toLowerCase().trim() === firebaseUser.email?.toLowerCase().trim()) ? { ...u, id: firebaseUser.uid } : u));
                  } catch (e) {
                    console.warn('Deferred UID sync save:', e);
                  }
                }
                CustodyDB.setActiveUser(matchedUser);
                setActiveUser(matchedUser);
              }
            }
          } else {
            // Firebase says signed out - clear session immediately to prevent local hijacking
            // ONLY if online. If we are offline, preserve the local cached session for full offline operations!
            // Also, do NOT clear the session if the active user is currently in an impersonation session
            // Note: If user was never logged into Firebase yet (e.g. initial page visit), do not blank the page
            if (typeof navigator !== 'undefined' && navigator.onLine) {
              if (currentLocalUser && !currentLocalUser.impersonator) {
                // Keep session if it was logged in locally via server session
                const hasLocalSession = !!localStorage.getItem('custody_active_user');
                if (!hasLocalSession) {
                  CustodyDB.setActiveUser(null);
                  setActiveUser(null);
                }
              }
            }
          }
        } catch (authSyncErr) {
          console.warn('Non-fatal auth state sync warning:', authSyncErr);
        }
      }, (authError) => {
        console.warn('Firebase onAuthStateChanged notice (offline/unconfigured fallback):', authError);
      });
    } catch (e) {
      console.warn('Could not initialize onAuthStateChanged listener:', e);
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Apply theme classes to standard document element
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const handleLoginSuccess = (user: AppUser) => {
    const enriched: AppUser = {
      ...user,
      permissions: CustodyDB.enrichUserPermissions(user.role, user.permissions)
    };
    setActiveUser(enriched);

    // Always set the correct home tab synchronously BEFORE first paint of renderPage().
    let homeTab = 'reconciliation';
    if (enriched.role === 'SystemAdmin') {
      homeTab = 'super-admin';
    } else if (enriched.role === 'Admin') {
      homeTab = 'company-admin';
    } else if (enriched.role === 'RegionalManager') {
      homeTab = 'region-admin';
    }
    setCurrentTab(homeTab);

    // Persist preferred tab so hard refresh / close-reopen does not land on a wrong operational screen.
    try {
      localStorage.setItem('custody_last_home_tab', homeTab);
    } catch {
      // ignore
    }
  };

  const handleLogout = async () => {
    // 1. Instant optimistic local reset: UI transitions immediately with zero lag or delay
    CustodyDB.setActiveUser(null);
    setActiveUser(null);
    setSelectedPendingTx(null);

    try {
      localStorage.removeItem('custody_active_user');
      localStorage.removeItem('custody_active_tab');
      localStorage.removeItem('custody_last_home_tab');
      sessionStorage.clear();
    } catch {
      // ignore storage access errors
    }

    // 2. Non-blocking resilient backend session revocation & Firebase signOut in background
    const bgTasks = [
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        keepalive: true
      }).catch(err => {
        console.warn('Logout session revocation warning:', err);
      }),
      signOut(auth).catch(err => {
        console.warn('Firebase signOut warning:', err);
      })
    ];

    try {
      await Promise.race([
        Promise.allSettled(bgTasks),
        new Promise(resolve => setTimeout(resolve, 600))
      ]);
    } catch {
      // ignore
    }
  };

  const handleSelectTxForSettle = (tx: Transaction) => {
    setSelectedPendingTx(tx);
  };

  const renderAccessDenied = () => {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center space-y-4">
        <div className="p-4 bg-rose-500/10 text-rose-500 rounded-2xl border border-rose-500/20">
          <ShieldAlert className="h-10 w-10" />
        </div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 font-sans tracking-tight">
          {isRtl ? 'غير مصرح بالوصول' : 'Access Denied'}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md leading-relaxed font-semibold">
          {isRtl 
            ? 'عذراً، تم تقييد هذا الحساب (Company Admin / SaaS Super Admin) من الوصول المباشر لهذه الشاشة للحفاظ على حوكمة فصل المهام وحماية سلامة العهد والقيود المالية.' 
            : 'Access restricted: This role (Company Admin / SaaS Super Admin) is restricted from directly accessing this screen to maintain segregation of duties and financial integrity.'}
        </p>
        <button 
          onClick={() => setCurrentTab(
            activeUser?.role === 'SystemAdmin'
              ? 'super-admin'
              : activeUser?.role === 'Admin'
                ? 'company-admin'
                : activeUser?.role === 'RegionalManager'
                  ? 'region-admin'
                  : 'reconciliation'
          )} 
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
        >
          {isRtl ? 'العودة للصفحة الرئيسية' : 'Return to Home'}
        </button>
      </div>
    );
  };

  // Main Page Router Dispatcher
  const renderPage = () => {
    // Platform SystemAdmin must never be blocked from SaaS/platform screens by company module flags.
    // Also never block pure platform tabs even if company modules map is incomplete.
    const platformTabs = new Set([
      'super-admin',
      'audit-log',
      'settings',
      'search',
    ]);

    const isSystemAdminUser =
      activeUser?.role === 'SystemAdmin' && !activeUser?.impersonator;

    if (
      activeUser?.company_id &&
      !platformTabs.has(currentTab) &&
      !isSystemAdminUser &&
      !ModulesModule.isScreenEnabledForCompany(activeUser.company_id, currentTab)
    ) {
      return renderAccessDenied();
    }

    // If a pure SystemAdmin somehow lands on an operational tab, auto-redirect home instead of Access Denied.
    if (isSystemAdminUser) {
      const operationalTabs = new Set([
        'dashboard',
        'reconciliation',
        'new-expense',
        'pending',
        'voucher',
        'under-settlement',
        'inventory',
        'purchasing',
        'accounting',
        'sales_ar',
        'pos',
        'crm',
        'fixed_assets',
        'fleet',
        'hr_payroll',
        'stations',
        'station-details',
        'region-admin',
        'company-admin',
        'approvals',
        'reports',
      ]);
      if (operationalTabs.has(currentTab)) {
        // Force SaaS home; do not show Access Denied first.
        if (currentTab !== 'super-admin') {
          setTimeout(() => setCurrentTab('super-admin'), 0);
        }
        // Fall through to super-admin case below after state update; meanwhile render super-admin shell safely.
      }
    }

    switch (currentTab) {
      case 'dashboard':
        if (activeUser?.role !== 'Admin' && activeUser?.role !== 'SystemAdmin') {
          return (
            <CashReconciliation
              language={language}
              theme={theme}
              onNavigate={setCurrentTab}
              onSelectTransactionForSettle={handleSelectTxForSettle}
            />
          );
        }
        return (
          <Dashboard 
            language={language} 
            theme={theme} 
            onNavigate={setCurrentTab} 
            onSelectTransactionForSettle={handleSelectTxForSettle}
          />
        );
      case 'stations':
        return (
          <Stations
            language={language}
            theme={theme}
            setCurrentTab={setCurrentTab}
            setSelectedStationId={setSelectedStationId}
          />
        );
      case 'station-details':
        return (
          <StationDetails
            stationId={selectedStationId || 'stn-1-1-1'}
            language={language}
            theme={theme}
            onBack={() => setCurrentTab('stations')}
          />
        );
      case 'new-expense':
        if ((activeUser?.role === 'Admin' || activeUser?.role === 'SystemAdmin') && !activeUser?.impersonator) {
          return renderAccessDenied();
        }
        return (
          <NewExpense 
            language={language} 
            theme={theme} 
            onNavigate={setCurrentTab} 
          />
        );
      case 'pending':
        return (
          <PendingTransactions
            language={language}
            theme={theme}
            onNavigate={setCurrentTab}
            onSelectTransactionForSettle={handleSelectTxForSettle}
          />
        );
      case 'voucher':
        if ((activeUser?.role === 'Admin' || activeUser?.role === 'SystemAdmin') && !activeUser?.impersonator) {
          return renderAccessDenied();
        }
        return (
          <CashPaymentVoucher
            language={language}
            theme={theme}
            onNavigate={setCurrentTab}
            selectedTx={selectedPendingTx}
            setSelectedTx={setSelectedPendingTx}
          />
        );
      case 'settled':
        return (
          <UnderSettlement 
            language={language} 
            theme={theme} 
            onNavigate={setCurrentTab} 
          />
        );
      case 'reconciliation':
        if (activeUser?.role === 'SystemAdmin' && !activeUser?.impersonator) {
          return renderAccessDenied();
        }
        return (
          <CashReconciliation 
            language={language} 
            theme={theme} 
            onNavigate={setCurrentTab}
            onSelectTransactionForSettle={handleSelectTxForSettle}
          />
        );
      case 'custody':
        if (activeUser?.role === 'SystemAdmin' && !activeUser?.impersonator) {
          return renderAccessDenied();
        }
        return (
          <Custody 
            language={language} 
            theme={theme} 
            onNavigate={setCurrentTab}
          />
        );
      case 'approvals':
        return (
          <ApprovalInbox
            activeUser={activeUser}
            isRtl={language === 'ar'}
            theme={theme}
          />
        );
      case 'reports':
        return (
          <Reports 
            language={language} 
            theme={theme} 
          />
        );
      case 'search':
        return (
          <Search
            language={language}
            theme={theme}
            onNavigate={setCurrentTab}
            onSelectTransactionForSettle={handleSelectTxForSettle}
          />
        );
      case 'settings':
        return (
          <Settings 
            language={language} 
            theme={theme}
            initialTab={settingsInitialTab}
            initialCenterTab={settingsInitialCenterTab}
            initialSelectedCompanyId={settingsSelectedCompanyId}
            onNavigate={setCurrentTab}
          />
        );
      case 'audit-log':
        return (
          <AuditLogView
            language={language}
            theme={theme}
          />
        );
      case 'inventory':
        return (
          <Inventory
            language={language}
            theme={theme}
          />
        );
      case 'purchasing':
        return (
          <Purchasing
            language={language}
            theme={theme}
          />
        );
      case 'accounting':
        return (
          <Accounting
            language={language}
            theme={theme}
          />
        );
      case 'sales_ar':
        return (
          <SalesAR
            language={language}
            theme={theme}
          />
        );
      case 'pos':
        return (
          <POS
            language={language}
            theme={theme}
          />
        );
      case 'crm':
        return (
          <CRM
            language={language}
            theme={theme}
          />
        );
      case 'fixed_assets':
        return (
          <FixedAssets
            language={language}
            theme={theme}
          />
        );
      case 'fleet':
        return (
          <FleetManagement
            language={language}
            theme={theme}
          />
        );
      case 'hr_payroll':
        return (
          <HRPayroll
            language={language}
            theme={theme}
          />
        );
      case 'contracting':
        return (
          <Contracting
            activeUser={activeUser!}
            language={language}
            theme={theme}
          />
        );
      case 'restaurant-menu':
        return (
          <RestaurantMenu
            language={language}
            theme={theme}
          />
        );
      case 'restaurant-orders':
        return (
          <RestaurantOrders
            language={language}
            theme={theme}
          />
        );
      case 'super-admin':
        return (
          <SuperAdmin
            language={language}
            theme={theme}
            onNavigate={setCurrentTab}
          />
        );
      case 'company-admin':
        if (activeUser?.role !== 'Admin' && activeUser?.role !== 'SystemAdmin') {
          return renderAccessDenied();
        }
        return (
          <CompanyAdminDashboard
            activeUser={activeUser!}
            language={language}
            theme={theme}
          />
        );
      case 'region-admin':
        if (activeUser?.role !== 'RegionalManager' && activeUser?.role !== 'SystemAdmin') {
          return renderAccessDenied();
        }
        return (
          <RegionAdminDashboard
            activeUser={activeUser!}
            language={language}
            theme={theme}
          />
        );
      default:
        if (activeUser?.role !== 'Admin' && activeUser?.role !== 'SystemAdmin') {
          return (
            <CashReconciliation
              language={language}
              theme={theme}
              onNavigate={setCurrentTab}
              onSelectTransactionForSettle={handleSelectTxForSettle}
            />
          );
        }
        return (
          <Dashboard 
            language={language} 
            theme={theme} 
            onNavigate={setCurrentTab} 
            onSelectTransactionForSettle={handleSelectTxForSettle}
          />
        );
    }
  };

  const isRtl = language === 'ar';

  const renderPwaBanner = () => {
    if (!showPwaBanner) return null;
    return (
      <div 
        dir={isRtl ? 'rtl' : 'ltr'}
        className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-[420px] z-[9999] bg-gradient-to-r from-slate-900/95 to-slate-950/95 border border-emerald-500/30 text-white rounded-2xl p-4 shadow-2xl shadow-emerald-950/30 flex items-start gap-3.5 backdrop-blur-md animate-bounce-subtle"
      >
        <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0 border border-emerald-500/20">
          <Smartphone size={20} className="animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h4 className="text-xs font-black text-slate-100 uppercase tracking-wider">
              {isRtl ? 'تثبيت تطبيق KEMIT ERP' : 'Install KEMIT ERP App'}
            </h4>
            <Sparkles size={12} className="text-amber-400" />
          </div>
          <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
            {isRtl 
              ? 'ثبت التطبيق الآن على جهازك للوصول المباشر السريع بنقرة واحدة وتجربة تصفح مذهلة وفائقة السرعة!'
              : 'Install the app on your device for instant one-tap access and a lightning-fast experience!'}
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handlePwaInstall}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-emerald-900/20 active:scale-95 cursor-pointer"
            >
              <Download size={12} />
              <span>{isRtl ? 'تثبيت الآن' : 'Install Now'}</span>
            </button>
            <button
              onClick={dismissPwaBanner}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-all cursor-pointer"
            >
              {isRtl ? 'ليس الآن' : 'Not Now'}
            </button>
          </div>
        </div>
        <button 
          onClick={dismissPwaBanner}
          className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800/50 transition-all shrink-0 cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>
    );
  };

  if (!activeUser) {
    if (hasPlatformOwner === null) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      );
    }

    return (
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      }>
        {hasPlatformOwner === false ? (
          <FirstRunSetup
            language={language}
            setLanguage={setLanguage}
            theme={theme}
            onLoginSuccess={handleLoginSuccess}
          />
        ) : (
          <Login
            language={language}
            setLanguage={setLanguage}
            theme={theme}
            onLoginSuccess={handleLoginSuccess}
          />
        )}
        {renderPwaBanner()}
      </Suspense>
    );
  }

  if (activeUser.must_change_password) {
    return (
      <ChangePasswordRequired
        activeUser={activeUser}
        language={language}
        onPasswordChanged={(updatedUser) => {
          setActiveUser(updatedUser);
        }}
        onLogout={handleLogout}
      />
    );
  }


  return (
    <Layout
      currentTab={currentTab}
      setCurrentTab={setCurrentTab}
      language={language}
      setLanguage={setLanguage}
      theme={theme}
      setTheme={setTheme}
      activeUser={activeUser}
      onLogout={handleLogout}
    >
      <Suspense fallback={
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 dark:border-emerald-400"></div>
          <span className="text-xs text-slate-500 dark:text-slate-400 mt-3 font-medium">
            {isRtl ? 'جاري التحميل...' : 'Loading module...'}
          </span>
        </div>
      }>
        {renderPage()}
      </Suspense>
      {renderPwaBanner()}
    </Layout>
  );
}
