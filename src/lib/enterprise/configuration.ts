import { Firestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { 
  TenantSettings, 
  CompanySettings, 
  FeatureFlags, 
  LimitsThresholds, 
  DefaultValues, 
  NumberingSettings, 
  WorkflowSettings 
} from '../../types/enterprise';

/**
 * 3.6 Configuration Engine
 * محرك الإعدادات والتحكم المشترك للمؤسسات
 * 
 * Provides an isolated, highly reusable component to handle company settings, 
 * feature flags, limits/thresholds, default values, numbering, and workflow settings.
 * Relies on a single Firestore collection called 'settings' acting as a Key-Value store per Tenant.
 * Adheres strictly to the "Additive Only", "KISS", and "Zero-Disruption" guidelines.
 */
export class ConfigurationEngine {
  private db?: Firestore;
  private memorySettings: Record<string, TenantSettings> = {}; // Local in-memory cache / fallback for tests

  constructor(dbInstance?: Firestore) {
    if (dbInstance) {
      this.db = dbInstance;
    }
  }

  /**
   * Generates sane default settings for a given tenant.
   * Ensures Backward Compatibility and Zero-Disruption.
   */
  getDefaultSettings(tenantId: string): TenantSettings {
    return {
      id: tenantId,
      tenantId: tenantId,
      organizationId: tenantId,
      company_settings: {
        companyNameEn: 'Default Corporate',
        companyNameAr: 'المؤسسة الافتراضية',
        timezone: 'Asia/Riyadh',
        baseCurrency: 'SAR'
      },
      feature_flags: {
        enable_pdf_reports: true,
        enable_notifications: true
      },
      limits_thresholds: {
        max_expense_amount: 10000,
        daily_vouchers_limit: 20
      },
      default_values: {
        expense_category: 'General',
        custody_amount: 10000
      },
      numbering_settings: {
        voucherPrefix: 'VOU',
        expensePrefix: 'EXP',
        padding: 4,
        includeYear: true
      },
      workflow_settings: {
        requiresDualApproval: false,
        autoPostLedger: true,
        allowOverdraft: false
      }
    };
  }

  /**
   * Retrieves full configuration settings for a given tenant.
   * If not found in Firestore, falls back to the local memory cache, or returns default configurations.
   * 
   * @param tenantId The company/tenant ID
   * @returns TenantSettings object
   */
  async getTenantSettings(tenantId: string): Promise<TenantSettings> {
    if (!tenantId) {
      throw new Error('Tenant identification is required to retrieve configurations.');
    }

    // 1. Check local cache first
    if (this.memorySettings[tenantId]) {
      return this.memorySettings[tenantId];
    }

    // 2. Fetch from Firestore if DB is online
    if (this.db) {
      try {
        const settingsDocRef = doc(this.db, 'settings', tenantId);
        const docSnap = await getDoc(settingsDocRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data() as TenantSettings;
          // Ensure structure is populated with defaults if missing nested properties
          const merged: TenantSettings = {
            id: tenantId,
            tenantId: tenantId,
            organizationId: data.organizationId || tenantId,
            company_settings: { ...this.getDefaultSettings(tenantId).company_settings, ...data.company_settings },
            feature_flags: { ...this.getDefaultSettings(tenantId).feature_flags, ...data.feature_flags },
            limits_thresholds: { ...this.getDefaultSettings(tenantId).limits_thresholds, ...data.limits_thresholds },
            default_values: { ...this.getDefaultSettings(tenantId).default_values, ...data.default_values },
            numbering_settings: { ...this.getDefaultSettings(tenantId).numbering_settings, ...data.numbering_settings },
            workflow_settings: { ...this.getDefaultSettings(tenantId).workflow_settings, ...data.workflow_settings },
            updated_at: data.updated_at
          };
          this.memorySettings[tenantId] = merged;
          return merged;
        }
      } catch (error) {
        console.error(`Failed to retrieve configuration settings for tenant ${tenantId} from Firestore:`, error);
        // Fall back to defaults on error to prevent application crashes (Zero-Disruption principle)
      }
    }

    // 3. Fallback to default settings
    return this.getDefaultSettings(tenantId);
  }

  /**
   * Saves or updates configuration settings for a given tenant.
   * 
   * @param tenantId The company/tenant ID
   * @param settings Part or all of TenantSettings configuration
   */
  async saveTenantSettings(tenantId: string, settings: Partial<TenantSettings>): Promise<TenantSettings> {
    if (!tenantId) {
      throw new Error('Tenant identification is required to save configurations.');
    }

    const current = await this.getTenantSettings(tenantId);
    
    // Merge new updates onto current settings
    const updated: TenantSettings = {
      id: tenantId,
      tenantId: tenantId,
      organizationId: tenantId,
      company_settings: { ...current.company_settings, ...settings.company_settings },
      feature_flags: { ...current.feature_flags, ...settings.feature_flags },
      limits_thresholds: { ...current.limits_thresholds, ...settings.limits_thresholds },
      default_values: { ...current.default_values, ...settings.default_values },
      numbering_settings: { ...current.numbering_settings, ...settings.numbering_settings },
      workflow_settings: { ...current.workflow_settings, ...settings.workflow_settings },
      updated_at: new Date().toISOString()
    };

    // Update local memory cache
    this.memorySettings[tenantId] = updated;

    // Persist to Firestore settings collection
    if (this.db) {
      try {
        const settingsDocRef = doc(this.db, 'settings', tenantId);
        await setDoc(settingsDocRef, updated);
      } catch (error) {
        console.error(`Failed to persist configuration settings for tenant ${tenantId} to Firestore:`, error);
        throw error;
      }
    } else {
      console.warn('ConfigurationEngine running in Memory-Only Mode. Settings recorded locally in memory.');
    }

    return updated;
  }

  /**
   * Returns a specific feature flag for a tenant.
   */
  async getFeatureFlag(tenantId: string, flagKey: string, defaultVal: boolean = false): Promise<boolean> {
    const settings = await this.getTenantSettings(tenantId);
    return settings.feature_flags[flagKey] !== undefined ? settings.feature_flags[flagKey] : defaultVal;
  }

  /**
   * Returns a specific numeric limit or threshold for a tenant.
   */
  async getLimit(tenantId: string, limitKey: string, defaultVal: number = 0): Promise<number> {
    const settings = await this.getTenantSettings(tenantId);
    return settings.limits_thresholds[limitKey] !== undefined ? settings.limits_thresholds[limitKey] : defaultVal;
  }

  /**
   * Returns a specific default value configuration for a tenant.
   */
  async getDefaultValue(tenantId: string, valueKey: string, defaultVal: any = null): Promise<any> {
    const settings = await this.getTenantSettings(tenantId);
    return settings.default_values[valueKey] !== undefined ? settings.default_values[valueKey] : defaultVal;
  }

  /**
   * Helper to set a specific feature flag directly in memory/firestore.
   */
  async setFeatureFlag(tenantId: string, flagKey: string, value: boolean): Promise<TenantSettings> {
    const current = await this.getTenantSettings(tenantId);
    const newFlags = { ...current.feature_flags, [flagKey]: value };
    return this.saveTenantSettings(tenantId, { feature_flags: newFlags });
  }

  /**
   * Helper to set a specific limit directly in memory/firestore.
   */
  async setLimit(tenantId: string, limitKey: string, value: number): Promise<TenantSettings> {
    const current = await this.getTenantSettings(tenantId);
    const newLimits = { ...current.limits_thresholds, [limitKey]: value };
    return this.saveTenantSettings(tenantId, { limits_thresholds: newLimits });
  }

  /**
   * Forcefully clears in-memory cached settings (strictly for testing lifecycle).
   */
  clearMemoryCache(): void {
    this.memorySettings = {};
  }
}
