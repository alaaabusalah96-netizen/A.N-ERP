import { UserRole } from '../../types';
import { BaseMetadata, EventEnvelope } from '../../types/enterprise';

/**
 * Generates a unique, high-entropy string ID for events and metadata.
 */
export function generateId(prefix: string = 'evt'): string {
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substring(2, 8);
  const randomNum = Math.floor(Math.random() * 1000);
  return `${prefix}-${timestamp}-${randomPart}-${randomNum}`;
}

/**
 * 3.1 Base Metadata Creator
 * 
 * Creates an initial BaseMetadata envelope for a new document.
 * 
 * @param tenantId The active tenant identification string
 * @param userId The ID of the operator creating the document
 * @returns An initialized BaseMetadata object with version 1
 */
export function createBaseMetadata(tenantId: string, userId: string): BaseMetadata {
  const nowStr = new Date().toISOString();
  return {
    tenantId,
    organizationId: tenantId,
    created_at: nowStr,
    created_by: userId,
    updated_at: nowStr,
    updated_by: userId,
    version: 1
  };
}

/**
 * 3.1 Base Metadata Updater
 * 
 * Creates a modified copy of existing BaseMetadata with incremented version and updated timestamp.
 * 
 * @param existing The current BaseMetadata instance
 * @param userId The ID of the operator updating the document
 * @returns A new BaseMetadata object with incremented version and updated tracking fields
 */
export function updateBaseMetadata(existing: BaseMetadata, userId: string): BaseMetadata {
  return {
    ...existing,
    updated_at: new Date().toISOString(),
    updated_by: userId,
    version: (existing.version || 1) + 1
  };
}

/**
 * 3.1 Event Envelope Packager
 * 
 * Packages a domain-specific payload into a standardized immutable EventEnvelope.
 * 
 * @param params Context parameters for envelope packaging
 * @returns A structured EventEnvelope containing the metadata and payload
 */
export function createEventEnvelope<T = Record<string, any>>(params: {
  eventType: string;
  tenantId: string;
  userId: string;
  userName: string;
  userRole: UserRole | 'System';
  payload: T;
}): EventEnvelope<T> {
  return {
    eventId: generateId('evt'),
    eventType: params.eventType,
    timestamp: new Date().toISOString(),
    tenantId: params.tenantId,
    organizationId: params.tenantId,
    user_id: params.userId,
    user_name: params.userName,
    user_role: params.userRole,
    payload: params.payload,
    metadataVersion: '1.0'
  };
}
