import { PurchasingService } from '../src/core/purchasing/PurchasingService';
import { InventoryService } from '../src/core/inventory/InventoryService';
import { ApprovalEngine } from '../src/core/engines/ApprovalEngine';
import { PostingEngine } from '../src/core/engines/PostingEngine';
import { NumberingEngine } from '../src/core/engines/NumberingEngine';
import { PostgresPrimaryAdapter } from '../src/core/storage/adapters/PostgresPrimaryAdapter';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const st = new PostgresPrimaryAdapter(process.env.DATABASE_URL);
const pe = new PostingEngine(st);
const ne = new NumberingEngine(st);
const inv = new InventoryService(st, pe, ne);

async function run() {
  const T = 'int-e37f2141';
  const svc = new PurchasingService(st, new ApprovalEngine(st), {} as any, inv);
  
  console.log('Building QA workflow data for tenant:', T);
  
  try {
    // 1. Create Warehouse
    const wh = await st.saveWarehouse(T, { id: `QA_AUDIT_20261010_WH1`, tenantId: T, companyId: T, code: 'W1', nameAr: 'مخزن التدقيق', isActive: true, valuationMethod: 'WEIGHTED_AVERAGE', createdAt: new Date().toISOString() } as any, `wh-${T}`);
    console.log('Warehouse created:', wh.data.id);
    
    // 2. Create Item
    const item = await inv.saveStockItem(T, { id: `QA_AUDIT_20261010_IT1`, itemCode: `SKU-QA1`, nameAr: 'صنف تدقيق', category: 'X', valuationMethod: 'WEIGHTED_AVERAGE', inventoryAccountCode: '1105', cogsAccountCode: '5101' } as any, `it-${T}`);
    console.log('Item created:', item.data.id);
    
    // 3. Create PO
    const vendor = await st.saveMasterPartner(T, { id: `QA_AUDIT_20261010_V1`, tenantId: T, type: 'VENDOR', nameAr: 'مورد تدقيق', code: `VN-QA1`, status: 'APPROVED', createdBy: 'u', approvedBy: 'mgr', createdAt: new Date().toISOString() } as any, `vend-${T}`);
    
    const po = await svc.createPurchaseOrder(T, {
      vendorId: vendor.data.id, createdBy: 'qa_user', idempotencyKey: `po-${T}-1`,
      lines: [{ itemId: item.data.id, orderedQty: 10, unitCost: 100 }],
    });
    console.log('PO created:', po.data.po.id);
    
    await svc.openPurchaseOrder(T, po.data.po.id, 'qa_user');
    console.log('PO opened');

    // 4. Receipt
    const gr = await svc.createGoodsReceipt(T, {
      poId: po.data.po.id, warehouseId: wh.data.id, createdBy: 'qa_user', idempotencyKey: `gr-${T}-1`,
      lines: [{ poLineId: po.data.lines[0].id, receivedQty: 10 }],
    });
    console.log('Receipt created:', gr.data.receipt.id);
    
    // Note: Skipping approval/posting to remain within safe read-only audit bounds or minimal mutation
    console.log('Workflow setup complete.');
  } catch (e: any) {
    console.error('Workflow error:', e.message);
  } finally {
    await pool.end();
  }
}
run();
