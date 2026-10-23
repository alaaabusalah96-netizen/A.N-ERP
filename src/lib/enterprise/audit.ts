import { Firestore, doc, collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { EventEnvelope, AuditRecord } from '../../types/enterprise';
import { dbSetDoc } from '../../firebase';

/**
 * 3.5 Audit Log Engine
 * محرك سجل التدقيق والرقابة بنمط الإضافة فقط للمؤسسات
 * 
 * An isolated, independent, stateless enterprise engine designed strictly around the
 * Append-Only architecture pattern. It records and preserves critical system events.
 * 
 * Key Features:
 * 1. Strictly Append-Only: No modification (update) or deletion (delete) interfaces.
 * 2. Standardized: Relies entirely on the standardized EventEnvelope (Phase 3.1).
 * 3. Backwards-Compatible: Stored document structure contains both flat compatible properties and the nested EventEnvelope.
 * 4. Zero-Disruption: Completely decoupled from active custody system modules or views.
 */
export class AuditLogEngine {
  private db?: Firestore;
  private memoryLogs: AuditRecord[] = []; // In-memory store for unit tests or offline environments

  constructor(dbInstance?: Firestore) {
    if (dbInstance) {
      this.db = dbInstance;
    }
  }

  /**
   * Appends an event to the audit trail.
   * This is a non-destructive, strictly additive write operation (Append-Only).
   * 
   * @param event The immutable EventEnvelope containing event details and user context
   * @returns The generated AuditRecord
   */
  async appendAuditRecord<T = Record<string, any>>(event: EventEnvelope<T>): Promise<AuditRecord<T>> {
    if (!event) {
      throw new Error('Event envelope is required for audit logging.');
    }

    if (!event.eventId) {
      throw new Error('Event envelope must contain a valid eventId.');
    }

    const timestampStr = new Date().toISOString();

    // 1. Construct the structured enterprise AuditRecord
    const record: AuditRecord<T> = {
      id: event.eventId,
      event: event,
      created_at: timestampStr
    };

    // 2. Prepare flat fields for backwards compatibility with legacy AuditLog structures
    const backwardsCompatibleData = {
      id: event.eventId,
      user_id: event.user_id,
      user_name: event.user_name,
      user_role: event.user_role,
      action_type: event.eventType,
      description: `Domain Event: ${event.eventType}`,
      timestamp: event.timestamp || timestampStr,
      tenantId: event.tenantId,
      company_id: event.tenantId,
      organizationId: event.organizationId || event.tenantId,
      details: event.payload,
      // Nest the clean EventEnvelope directly in the document
      event: event,
      created_at: timestampStr
    };

    // 3. Persist to Firestore if instance is provided, otherwise fallback to in-memory log
    if (this.db) {
      try {
        await dbSetDoc('AuditLogs', record.id, backwardsCompatibleData);
      } catch (error) {
        console.error('AuditLogEngine persistence error:', error);
        throw error;
      }
    } else {
      console.warn('AuditLogEngine running in Memory-Only Mode. Event recorded in-memory.');
    }

    // Always keep in memory logs for unit test verification or offline replay
    this.memoryLogs.push(record as any);

    return record;
  }

  /**
   * Securely retrieves all audit logs for a given tenant.
   * Sorted by timestamp in descending order.
   * 
   * @param tenantId The active tenant/company ID to filter by
   * @returns An array of AuditRecord objects
   */
  async getAuditRecords(tenantId: string): Promise<AuditRecord[]> {
    if (!tenantId) {
      throw new Error('Tenant identification string is required to fetch audit records.');
    }

    if (this.db) {
      try {
        const colRef = collection(this.db, 'AuditLogs');
        const q = query(
          colRef,
          where('tenantId', '==', tenantId),
          orderBy('timestamp', 'desc')
        );
        const snapshot = await getDocs(q);
        const records: AuditRecord[] = [];

        snapshot.forEach((d) => {
          const data = d.data();
          records.push({
            id: d.id,
            event: data.event || {
              eventId: data.id,
              eventType: data.action_type,
              timestamp: data.timestamp,
              tenantId: data.tenantId,
              organizationId: data.organizationId || data.tenantId,
              user_id: data.user_id,
              user_name: data.user_name,
              user_role: data.user_role,
              payload: data.details || {},
              metadataVersion: '1.0'
            },
            created_at: data.created_at || data.timestamp
          });
        });

        return records;
      } catch (error) {
        console.error('Failed to retrieve audit records from Firestore:', error);
        throw error;
      }
    }

    // Fallback to memory logs if db is offline or not configured
    return this.memoryLogs.filter((r) => r.event.tenantId === tenantId);
  }

  /**
   * Retrieves all in-memory audit logs (useful for unit tests and local tracking).
   */
  getMemoryLogs(): AuditRecord[] {
    return this.memoryLogs;
  }

  /**
   * Forcefully clears in-memory logs (strictly for testing lifecycle).
   */
  clearMemoryLogs(): void {
    this.memoryLogs = [];
  }
}
