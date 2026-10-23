import { EventEnvelope } from '../../types/enterprise';
import { BusinessEngineContract, EngineExecutionResult } from './warehouse_contracts';
import { InventoryModule } from '../../db/inventory';
import { AuditLogEngine } from './audit';

/**
 * Concrete Warehouse and Inventory Business Engine
 * محرك عمليات المخازن والمستودعات الفعلي
 * 
 * Implements BusinessEngineContract to handle stock transactions via standardized EventEnvelopes.
 * Strictly adheres to ADR-0005 (Centralized Business Logic) and is fully backward-compatible.
 */
export class WarehouseBusinessEngine implements BusinessEngineContract {
  engineId = 'warehouse_business_engine';
  supportedEvents = [
    'STOCK_RECEIVED',
    'STOCK_ISSUED',
    'STOCK_TRANSFERRED',
    'INVENTORY_COUNT_ADJUSTED'
  ];

  private auditEngine = new AuditLogEngine();

  async processEvent(event: EventEnvelope<any>): Promise<EngineExecutionResult<any>> {
    if (!this.supportedEvents.includes(event.eventType)) {
      return {
        success: false,
        engineId: this.engineId,
        eventId: event.eventId,
        processedAt: new Date().toISOString(),
        statusCode: 'UNSUPPORTED_EVENT',
        messageEn: `Event type ${event.eventType} is not supported by this engine.`,
        messageAr: `نوع الحدث ${event.eventType} غير مدعوم من هذا المحرك.`
      };
    }

    try {
      // 1. Audit Log persistence via Event Envelope
      await this.auditEngine.appendAuditRecord(event);

      // 2. Process based on event type
      switch (event.eventType) {
        case 'STOCK_RECEIVED': {
          const { warehouseId, items } = event.payload;
          // Verify warehouse exists and capacity
          const whs = InventoryModule.getWarehouses();
          const warehouse = whs.find(w => w.id === warehouseId);
          if (!warehouse) {
            throw new Error(`Warehouse ${warehouseId} not found`);
          }

          // Enforce capacity bounds if enabled
          if (warehouse.is_capacity_enforced && warehouse.max_capacity_qty) {
            const currentStock = InventoryModule.getWarehouseStock(warehouseId);
            const incomingQty = items.reduce((sum: number, item: any) => sum + item.qty, 0);
            if (currentStock + incomingQty > warehouse.max_capacity_qty) {
              return {
                success: false,
                engineId: this.engineId,
                eventId: event.eventId,
                processedAt: new Date().toISOString(),
                statusCode: 'INSUFFICIENT_CAPACITY',
                messageEn: `Cannot receive stock. Warehouse capacity exceeded (Max: ${warehouse.max_capacity_qty}).`,
                messageAr: `لا يمكن استلام البضاعة. تم تجاوز سعة المستودع القصوى (${warehouse.max_capacity_qty}).`
              };
            }
          }

          // Apply stock increase
          for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
            const item = items[itemIdx];
            const idempotencyKey = `wh-rcv-${event.eventId}-${warehouseId}-${item.product_id}-${item.bin_id || 'nobin'}-${itemIdx}`;
            await InventoryModule.adjustStock(warehouseId, item.product_id, item.qty, 'Receipt', event.user_id, item.bin_id, idempotencyKey);
          }

          return {
            success: true,
            engineId: this.engineId,
            eventId: event.eventId,
            processedAt: new Date().toISOString(),
            statusCode: 'SUCCESS',
            messageEn: 'Stock received and processed successfully.',
            messageAr: 'تم استلام وتجهيز البضاعة بنجاح.'
          };
        }

        case 'STOCK_ISSUED': {
          const { warehouseId, items } = event.payload;
          
          // Verify stock levels before issuing
          for (const item of items) {
            const stock = InventoryModule.getProductStockInWarehouse(warehouseId, item.product_id, item.bin_id);
            if (stock < item.qty) {
              return {
                success: false,
                engineId: this.engineId,
                eventId: event.eventId,
                processedAt: new Date().toISOString(),
                statusCode: 'INSUFFICIENT_STOCK',
                messageEn: `Insufficient stock for product ${item.product_id} in bin/warehouse. Current stock: ${stock}.`,
                messageAr: `رصيد غير كافٍ للمنتج ${item.product_id} في الرف/المستودع. الرصيد الحالي: ${stock}.`
              };
            }
          }

          // Apply stock decrease
          for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
            const item = items[itemIdx];
            const idempotencyKey = `wh-iss-${event.eventId}-${warehouseId}-${item.product_id}-${item.bin_id || 'nobin'}-${itemIdx}`;
            await InventoryModule.adjustStock(warehouseId, item.product_id, -item.qty, 'Issue', event.user_id, item.bin_id, idempotencyKey);
          }

          return {
            success: true,
            engineId: this.engineId,
            eventId: event.eventId,
            processedAt: new Date().toISOString(),
            statusCode: 'SUCCESS',
            messageEn: 'Stock issued and processed successfully.',
            messageAr: 'تم صرف وتحديث أرصيد المخزن بنجاح.'
          };
        }

        case 'STOCK_TRANSFERRED': {
          const { srcWarehouseId, destWarehouseId, items } = event.payload;
          
          const whs = InventoryModule.getWarehouses();
          const destWh = whs.find(w => w.id === destWarehouseId);
          if (!destWh) {
            throw new Error(`Destination warehouse ${destWarehouseId} not found`);
          }

          // Verify destination capacity if enforced
          if (destWh.is_capacity_enforced && destWh.max_capacity_qty) {
            const currentStock = InventoryModule.getWarehouseStock(destWarehouseId);
            const incomingQty = items.reduce((sum: number, item: any) => sum + item.qty, 0);
            if (currentStock + incomingQty > destWh.max_capacity_qty) {
              return {
                success: false,
                engineId: this.engineId,
                eventId: event.eventId,
                processedAt: new Date().toISOString(),
                statusCode: 'INSUFFICIENT_CAPACITY',
                messageEn: `Cannot transfer stock. Destination warehouse capacity exceeded.`,
                messageAr: `لا يمكن نقل البضاعة. تم تجاوز السعة الاستيعابية للمستودع المستهدف.`
              };
            }
          }

          // Verify source stock levels
          for (const item of items) {
            const stock = InventoryModule.getProductStockInWarehouse(srcWarehouseId, item.product_id, item.src_bin_id);
            if (stock < item.qty) {
              return {
                success: false,
                engineId: this.engineId,
                eventId: event.eventId,
                processedAt: new Date().toISOString(),
                statusCode: 'INSUFFICIENT_STOCK',
                messageEn: `Insufficient source stock for product ${item.product_id}. Available: ${stock}.`,
                messageAr: `رصيد غير كافٍ في مستودع المصدر للمنتج ${item.product_id}. الرصيد المتاح: ${stock}.`
              };
            }
          }

          // Process the transfer with rollback compensation if any item step fails
          const completedAdjustments: Array<{
            warehouseId: string;
            productId: string;
            qtyChange: number;
            binId?: string;
            compIndex: number;
          }> = [];

          try {
            for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
              const item = items[itemIdx];
              // Deduct from source
              const srcIdempotencyKey = `wh-trf-${event.eventId}-src-${srcWarehouseId}-${item.product_id}-${item.src_bin_id || 'nobin'}-${itemIdx}`;
              await InventoryModule.adjustStock(srcWarehouseId, item.product_id, -item.qty, 'Transfer', event.user_id, item.src_bin_id, srcIdempotencyKey);
              completedAdjustments.push({
                warehouseId: srcWarehouseId,
                productId: item.product_id,
                qtyChange: item.qty, // Compensating action would be +item.qty
                binId: item.src_bin_id,
                compIndex: itemIdx * 2
              });

              // Add to destination
              const destIdempotencyKey = `wh-trf-${event.eventId}-dest-${destWarehouseId}-${item.product_id}-${item.dest_bin_id || 'nobin'}-${itemIdx}`;
              await InventoryModule.adjustStock(destWarehouseId, item.product_id, item.qty, 'Transfer', event.user_id, item.dest_bin_id, destIdempotencyKey);
              completedAdjustments.push({
                warehouseId: destWarehouseId,
                productId: item.product_id,
                qtyChange: -item.qty, // Compensating action would be -item.qty
                binId: item.dest_bin_id,
                compIndex: itemIdx * 2 + 1
              });
            }
          } catch (transferErr: any) {
            // Attempt compensating reverse adjustments in reverse order
            const compensationFailures: string[] = [];
            for (let i = completedAdjustments.length - 1; i >= 0; i--) {
              const comp = completedAdjustments[i];
              try {
                const compIdempotencyKey = `wh-trf-comp-${event.eventId}-${comp.compIndex}-${comp.warehouseId}-${comp.productId}-${comp.binId || 'nobin'}`;
                await InventoryModule.adjustStock(comp.warehouseId, comp.productId, comp.qtyChange, 'Transfer', event.user_id, comp.binId, compIdempotencyKey);
              } catch (rollbackErr: any) {
                console.error(`Transfer compensation rollback failed for ${comp.productId} in ${comp.warehouseId}:`, rollbackErr);
                compensationFailures.push(`${comp.productId}@${comp.warehouseId}`);
              }
            }

            const errorDetails = transferErr?.message || 'Transfer adjustment step failed';
            if (compensationFailures.length > 0) {
              throw new Error(`فشل التحويل وفشلت بعض حركات التراجع (${compensationFailures.join(', ')}): ${errorDetails} / Transfer failed and compensation rollback had errors (${compensationFailures.join(', ')}): ${errorDetails}`);
            }
            throw new Error(`فشل تحويل المخزون وتم التراجع عن الحركات السابقة: ${errorDetails} / Stock transfer failed; prior adjustments were compensated and rolled back: ${errorDetails}`);
          }

          return {
            success: true,
            engineId: this.engineId,
            eventId: event.eventId,
            processedAt: new Date().toISOString(),
            statusCode: 'SUCCESS',
            messageEn: 'Stock transfer processed successfully.',
            messageAr: 'تم معالجة حركة تحويل المخزون بنجاح.'
          };
        }

        case 'INVENTORY_COUNT_ADJUSTED': {
          const { warehouseId, productId, binId, expectedQty, countedQty, reason } = event.payload;
          const diff = countedQty - expectedQty;
          
          if (diff === 0) {
            return {
              success: true,
              engineId: this.engineId,
              eventId: event.eventId,
              processedAt: new Date().toISOString(),
              statusCode: 'NO_CHANGE',
              messageEn: 'Count matches expected stock. No adjustment needed.',
              messageAr: 'الكمية الفعلية تطابق الكمية الدفترية. لا توجد حاجة للتسوية.'
            };
          }

          const idempotencyKey = `wh-count-adj-${event.eventId}-${warehouseId}-${productId}-${binId || 'nobin'}`;
          await InventoryModule.adjustStock(warehouseId, productId, diff, 'Adjustment', event.user_id, binId, idempotencyKey);

          return {
            success: true,
            engineId: this.engineId,
            eventId: event.eventId,
            processedAt: new Date().toISOString(),
            statusCode: 'SUCCESS',
            messageEn: 'Inventory adjustment completed.',
            messageAr: 'تم تسجيل تسوية المخزون وتعديل الأرصدة بنجاح.'
          };
        }

        default:
          throw new Error(`Unhandled event type: ${event.eventType}`);
      }

    } catch (error: any) {
      const msg = error?.message || '';
      const parts = msg.includes(' / ') ? msg.split(' / ') : [msg, msg];
      return {
        success: false,
        engineId: this.engineId,
        eventId: event.eventId,
        processedAt: new Date().toISOString(),
        statusCode: 'EXECUTION_ERROR',
        messageEn: parts[1]?.trim() || msg || 'Unknown execution error occurred',
        messageAr: parts[0]?.trim() || msg || 'حدث خطأ مجهول أثناء المعالجة'
      };
    }
  }
}
