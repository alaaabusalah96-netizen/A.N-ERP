/**
 * @file DomainEventBus.ts
 * @description Unified Domain Events Bus & Catalog for A.N ERP (Section 1F)
 * Standardizes domain event publishing, subscribing, and audit persistence.
 */

export type DomainEventType =
  | 'DOCUMENT_POSTED'
  | 'SECURITY_ALERT_TRIGGERED'
  | 'USER_LOGGED_IN'
  | 'MODULE_ACTIVATED_FOR_TENANT'
  | 'USER_INVITED'
  | 'SESSION_REVOKED'
  | 'SOD_CONFLICT_DETECTED'
  | 'CUSTODY_OPENED'
  | 'CUSTODY_TRANSACTION_RECORDED'
  | 'CUSTODY_SETTLED'
  | 'CUSTODY_CLOSED'
  | 'EXPENSE_REQUESTED'
  | 'EXPENSE_APPROVED'
  | 'EXPENSE_REJECTED'
  | 'EXPENSE_POSTED'
  | 'STOCK_RECEIVED'
  | 'STOCK_ISSUED'
  | 'STOCK_TRANSFERRED'
  | 'STOCK_COUNT_VARIANCE_DETECTED'
  | 'REORDER_POINT_REACHED'
  | 'PURCHASE_REQUESTED'
  | 'RFQ_SENT'
  | 'SUPPLIER_QUOTE_RECEIVED'
  | 'PO_ISSUED'
  | 'THREE_WAY_MATCH_FAILED'
  | 'SUPPLIER_INVOICE_APPROVED';

export interface DomainEvent<T = any> {
  id: string;
  eventType: DomainEventType;
  tenantId: string;
  actorId: string;
  actorName: string;
  payload: T;
  timestamp: string;
  idempotencyKey?: string;
}

export type DomainEventListener = (event: DomainEvent) => Promise<void> | void;

export class DomainEventBus {
  private static listeners: Map<DomainEventType, Set<DomainEventListener>> = new Map();
  private static eventHistory: DomainEvent[] = [];

  /**
   * Registers a subscriber for a domain event
   */
  public static subscribe(eventType: DomainEventType, listener: DomainEventListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }

    const set = this.listeners.get(eventType)!;
    set.add(listener);

    return () => {
      set.delete(listener);
    };
  }

  /**
   * Publishes a domain event across all subscribers
   */
  public static async publish<T = any>(event: Omit<DomainEvent<T>, 'id' | 'timestamp'>): Promise<DomainEvent<T>> {
    const fullEvent: DomainEvent<T> = {
      ...event,
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
    };

    this.eventHistory.push(fullEvent);

    // Keep memory capped at last 500 events in memory
    if (this.eventHistory.length > 500) {
      this.eventHistory.shift();
    }

    const subscribers = this.listeners.get(fullEvent.eventType);
    if (subscribers) {
      for (const sub of subscribers) {
        try {
          await sub(fullEvent);
        } catch (err) {
          console.error(`Error in event listener for ${fullEvent.eventType}:`, err);
        }
      }
    }

    return fullEvent;
  }

  /**
   * Retrieves recent domain events for audit / diagnostics
   */
  public static getRecentEvents(tenantId?: string, limit = 50): DomainEvent[] {
    let list = this.eventHistory;
    if (tenantId) {
      list = list.filter((e) => e.tenantId === tenantId);
    }
    return [...list].reverse().slice(0, limit);
  }
}
