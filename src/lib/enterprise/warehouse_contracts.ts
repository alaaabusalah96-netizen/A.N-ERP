import { EventEnvelope } from '../../types/enterprise';

/**
 * Phase 4A: Module Contracts (تجهيز العقود لموديول المخازن)
 * -------------------------------------------------------------
 * This file implements the strict architecture contracts and domain models
 * for the future Warehouse & Inventory module under the Enterprise Foundation.
 * 
 * Consistent with Phase 4A specifications:
 * - It defines types, interfaces, and relationship contracts only.
 * - No active database models, processors, workflows, or operational services are created.
 * - It strictly adheres to "Additive Only", "Zero-Disruption", and "Backward Compatibility" principles.
 */

/**
 * 1. Module Manifest
 * سجل تسجيل وإدارة الموديولات داخل البنية الأساسية للمؤسسة
 */
export interface ModuleManifest {
  moduleId: string;           // Unique identifier for the module (e.g. "warehouse_management")
  nameEn: string;             // English name
  nameAr: string;             // Arabic name
  version: string;            // Version string (e.g. "1.0.0")
  dependencies: string[];     // List of depending enterprise modules/engines
  isEnabled: boolean;         // Current operational status
  registeredAt: string;       // ISO-8601 registration timestamp
  metadata?: Record<string, any>; // Extensible metadata parameters
}

/**
 * 2. Business Engine Contract
 * عقد محرك منطق الأعمال المشترك - يحدد شكل الحدث المستلم والمخرجات المتوقعة
 */
export interface BusinessEngineContract<TInput = any, TOutput = any> {
  engineId: string;           // Unique ID of the engine (e.g. "inventory_settlement_engine")
  supportedEvents: string[];   // Types of events this engine can process (e.g., ["GOODS_RECEIVED", "STOCK_TRANSFERRED"])
  
  /**
   * Processes a domain event envelope in accordance with enterprise business rules.
   * @param event The immutable EventEnvelope containing the event payload and context
   * @returns A promise that resolves to the standardized EngineExecutionResult
   */
  processEvent(event: EventEnvelope<TInput>): Promise<EngineExecutionResult<TOutput>>;
}

/**
 * Standardized Engine Execution Output
 * المخرجات الموحدة لنتائج تشغيل محركات الأعمال
 */
export interface EngineExecutionResult<TOutput = any> {
  success: boolean;           // True if execution succeeded and was committed
  engineId: string;           // ID of the processing engine
  eventId: string;            // Reference to the source event.eventId
  processedAt: string;        // ISO-8601 execution timestamp
  statusCode: string;         // Standardized status code (e.g. "SUCCESS", "INSUFFICIENT_STOCK", "FORBIDDEN")
  messageEn: string;          // Developer and operator status message in English
  messageAr: string;          // Developer and operator status message in Arabic
  outputData?: TOutput;       // Produced output payload (journal entries, balance changes, etc.)
}

/**
 * 3. Root Domain Models & Entity Relationships
 * نماذج الكيانات وتوثيق العلاقات الهيكلية بينها
 */

/**
 * A. Organization Entity (المؤسسة)
 * Represents the top-level corporate organizational structure.
 * 
 * Relationships / العلاقات:
 * - Has many Branches (1-to-N) / تملك المؤسسة عدة فروع
 * - Has many Users (1-to-N) / يتبع للمؤسسة عدة مستخدمين
 */
export interface Organization {
  id: string;                 // Unique organization ID
  nameEn: string;             // English corporate name
  nameAr: string;             // Arabic corporate name
  taxRegistrationNo?: string; // Tax registration identifier
  commercialRegisterNo?: string; // Commercial register identifier
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;          // ISO-8601 creation timestamp
  updatedAt?: string;         // ISO-8601 update timestamp
}

/**
 * B. Branch Entity (الفرع)
 * Represents a geographical or administrative branch under the organization.
 * 
 * Relationships / العلاقات:
 * - Belongs to one Organization (N-to-1) / ينتمي الفرع لمؤسسة واحدة رئيسية
 * - Has many Warehouses (1-to-N) / يحتوي الفرع على مستودعات أو مخازن متعددة
 */
export interface Branch {
  id: string;                 // Unique branch ID
  organizationId: string;     // Reference to parent Organization
  nameEn: string;             // English branch name
  nameAr: string;             // Arabic branch name
  code: string;               // Sequence and identifier code (e.g., "BR-01")
  location?: string;          // Physical or geographical location coordinates/address
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;          // ISO-8601 creation timestamp
  updatedAt?: string;         // ISO-8601 update timestamp
}

/**
 * C. Warehouse Entity (المستودع / المخزن)
 * Represents an inventory storage and logistics warehouse.
 * 
 * Relationships / العلاقات:
 * - Belongs to one Branch (N-to-1) / يتبع المستودع لفرع واحد محدد
 * - Belongs to one Organization (N-to-1) / ينتمي المستودع لمؤسسة واحدة رئيسية
 */
export interface Warehouse {
  id: string;                 // Unique warehouse ID
  organizationId: string;     // Reference to parent Organization
  branchId: string;           // Reference to parent Branch
  nameEn: string;             // English warehouse name
  nameAr: string;             // Arabic warehouse name
  code: string;               // Stock location code for sequences (e.g., "WH-05")
  address?: string;           // Shipping and physical location address
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;          // ISO-8601 creation timestamp
  updatedAt?: string;         // ISO-8601 update timestamp
}

/**
 * D. Enterprise User Entity (المستخدم المشترك)
 * Represents a staff member or user in the unified enterprise directory.
 * 
 * Relationships / العلاقات:
 * - Belongs to one Organization (N-to-1) / ينتمي المستخدم لمؤسسة واحدة رئيسية
 * - Assigned to multiple Branches (N-to-M) / يمكن ربط المستخدم بصلاحيات العمل على عدة فروع
 * - Assigned to multiple Roles (N-to-M) / يمكن تخصيص عدة أدوار صلاحياتية للمستخدم
 */
export interface EnterpriseUser {
  id: string;                 // Unique user ID
  assignedOrganizationIds: string[]; // Replaces singular organizationId per ADR-0006 — supports cross-company access within a Business Group
  email: string;              // Standard user email address
  fullNameEn: string;         // Full name in English
  fullNameAr: string;         // Full name in Arabic
  assignedBranchIds: string[]; // List of Branch IDs this user is authorized to access
  roleIds: string[];          // List of Role IDs assigned to this user
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;          // ISO-8601 creation timestamp
  updatedAt?: string;         // ISO-8601 update timestamp
}

/**
 * E. Enterprise Role Entity (الدور الصلاحياتي للمؤسسات)
 * Represents a role containing specific permission nodes within the enterprise RBAC.
 * 
 * Relationships / العلاقات:
 * - Assigned to multiple Users (N-to-M) / يسند الدور لعدة مستخدمين
 * - Contains multiple permissions (N-to-M) / يحتوي الدور على مصفوفة من الصلاحيات والامتيازات
 */
export interface EnterpriseRole {
  id: string;                 // Unique role key (e.g., "inventory_manager")
  organizationId: string;     // Reference to parent Organization
  nameEn: string;             // English role name
  nameAr: string;             // Arabic role name
  permissions: string[];      // Array of granted system permission IDs
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;          // ISO-8601 creation timestamp
  updatedAt?: string;         // ISO-8601 update timestamp
}
