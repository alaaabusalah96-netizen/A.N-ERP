import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

// Read config from local file
const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

// Initialize Firebase Admin SDK using Application Default Credentials (ADC) or credentials if in fallback
const app = admin.initializeApp({
  projectId: firebaseConfig.projectId
});

// Configure custom Database ID using getFirestore
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');

console.log(`Starting Cloud Firestore database initialization (using firebase-admin) for KEMIT ERP...`);
console.log(`Project ID: ${firebaseConfig.projectId}`);
console.log(`Database ID: ${firebaseConfig.firestoreDatabaseId || '(default)'}`);

// Helper to generate ISO strings for timestamps
const now = () => new Date().toISOString();

// Define data schemas for 30 collections
const seedData: Record<string, Record<string, any>> = {
  companies: {
    'comp-1': {
      id: 'comp-1',
      name: 'Aero Logistics Corp',
      taxId: 'TX-991203',
      status: 'active',
      subscription_plan: 'enterprise',
      subscription_status: 'active',
      expiry: '2028-12-31',
      createdAt: now(),
      updatedAt: now()
    }
  },
  branches: {
    'branch-1': {
      id: 'branch-1',
      company_id: 'comp-1',
      name: 'Northern Distribution Center',
      code: 'NDC-01',
      address: '100 Logistics Blvd, Chicago, IL',
      status: 'active',
      createdAt: now(),
      updatedAt: now()
    }
  },
  roles: {
    'role-admin': {
      id: 'role-admin',
      company_id: 'comp-1',
      name: 'Administrator',
      code: 'ADMIN',
      description: 'Full system administration access',
      isSystem: false,
      createdAt: now(),
      updatedAt: now()
    },
    'role-driver': {
      id: 'role-driver',
      company_id: 'comp-1',
      name: 'Logistics Driver',
      code: 'DRIVER',
      description: 'Driver role for fleet management',
      isSystem: true,
      createdAt: now(),
      updatedAt: now()
    }
  },
  permissions: {
    'perm-read-inventory': {
      id: 'perm-read-inventory',
      name: 'Read Inventory',
      code: 'inventory:read',
      module: 'inventory',
      description: 'Allows reading stock and warehouse balances',
      createdAt: now(),
      updatedAt: now()
    },
    'perm-write-inventory': {
      id: 'perm-write-inventory',
      name: 'Write Inventory',
      code: 'inventory:write',
      module: 'inventory',
      description: 'Allows adjusting stock and stock movements',
      createdAt: now(),
      updatedAt: now()
    }
  },
  users: {
    'user-1': {
      id: 'user-1',
      company_id: 'comp-1',
      branch_id: 'branch-1',
      name: 'Alaa Abu Salah',
      email: 'alaaabusalah96@gmail.com',
      role: 'SystemAdmin',
      status: 'active',
      createdAt: now(),
      updatedAt: now()
    },
    'user-2': {
      id: 'user-2',
      company_id: 'comp-1',
      branch_id: 'branch-1',
      name: 'John Driver',
      email: 'driver@aerologistics.com',
      role: 'Driver',
      status: 'active',
      createdAt: now(),
      updatedAt: now()
    }
  },
  employees: {
    'emp-1': {
      id: 'emp-1',
      company_id: 'comp-1',
      branch_id: 'branch-1',
      user_id: 'user-1',
      employeeId: 'EMP-001',
      firstName: 'Alaa',
      lastName: 'Abu Salah',
      department: 'IT & Architecture',
      position: 'Senior Enterprise Architect',
      status: 'active',
      createdAt: now(),
      updatedAt: now()
    }
  },
  drivers: {
    'driver-1': {
      id: 'driver-1',
      company_id: 'comp-1',
      branch_id: 'branch-1',
      user_id: 'user-2',
      employee_id: 'emp-2',
      licenseNumber: 'DL-991203',
      licenseClass: 'Class A CDL',
      licenseExpiry: '2029-05-15',
      status: 'active',
      createdAt: now(),
      updatedAt: now()
    }
  },
  vehicles: {
    'veh-1': {
      id: 'veh-1',
      company_id: 'comp-1',
      branch_id: 'branch-1',
      plateNumber: 'TRK-7712',
      vin: '1FVACWDB8FHXXXXXX',
      make: 'Freightliner',
      model: 'Cascadia',
      year: 2024,
      type: 'Semi-Truck',
      status: 'active',
      createdAt: now(),
      updatedAt: now()
    }
  },
  trailers: {
    'trl-1': {
      id: 'trl-1',
      company_id: 'comp-1',
      branch_id: 'branch-1',
      plateNumber: 'TRL-9988',
      type: 'Reefer',
      length: '53ft',
      status: 'active',
      createdAt: now(),
      updatedAt: now()
    }
  },
  customers: {
    'cust-1': {
      id: 'cust-1',
      company_id: 'comp-1',
      name: 'Apex Global Retail',
      code: 'AGR-01',
      taxId: 'TAX-112233',
      email: 'info@apexretail.com',
      phone: '+1-555-0199',
      status: 'active',
      createdAt: now(),
      updatedAt: now()
    }
  },
  suppliers: {
    'sup-1': {
      id: 'sup-1',
      company_id: 'comp-1',
      name: 'Prime Manufacturing Inc',
      code: 'PMI-02',
      taxId: 'TAX-998877',
      email: 'sales@primemanu.com',
      phone: '+1-555-0155',
      status: 'active',
      createdAt: now(),
      updatedAt: now()
    }
  },
  categories: {
    'cat-electronics': {
      id: 'cat-electronics',
      company_id: 'comp-1',
      name: 'Consumer Electronics',
      code: 'ELEC',
      description: 'Electronic goods and accessories',
      status: 'active',
      createdAt: now(),
      updatedAt: now()
    }
  },
  products: {
    'prod-1': {
      id: 'prod-1',
      company_id: 'comp-1',
      category_id: 'cat-electronics',
      name: 'Enterprise Wireless Router Pro',
      sku: 'RTR-PRO-01',
      barcode: '075128399123',
      description: 'High-throughput dual-band wireless router for enterprise setups',
      uom: 'unit',
      costPrice: 120.00,
      sellingPrice: 249.99,
      status: 'active',
      createdAt: now(),
      updatedAt: now()
    }
  },
  units: {
    'unit-piece': {
      id: 'unit-piece',
      company_id: 'comp-1',
      name: 'Piece / Unit',
      code: 'PCS',
      status: 'active',
      createdAt: now(),
      updatedAt: now()
    }
  },
  warehouses: {
    'wh-main': {
      id: 'wh-main',
      company_id: 'comp-1',
      branch_id: 'branch-1',
      name: 'Central Warehouse',
      code: 'CWH-01',
      location: 'Aisle A, Chicago',
      status: 'active',
      createdAt: now(),
      updatedAt: now()
    }
  },
  inventory: {
    'inv-prod1-whmain': {
      id: 'inv-prod1-whmain',
      company_id: 'comp-1',
      warehouse_id: 'wh-main',
      product_id: 'prod-1',
      quantity: 150,
      reorderLevel: 20,
      lastCountDate: '2026-07-13',
      createdAt: now(),
      updatedAt: now()
    }
  },
  stock_movements: {
    'mov-1': {
      id: 'mov-1',
      company_id: 'comp-1',
      warehouse_id: 'wh-main',
      product_id: 'prod-1',
      type: 'in',
      quantity: 150,
      referenceType: 'receipt',
      referenceId: 'rec-1',
      notes: 'Initial inventory load',
      createdAt: now(),
      updatedAt: now()
    }
  },
  receipts: {
    'rec-1': {
      id: 'rec-1',
      company_id: 'comp-1',
      branch_id: 'branch-1',
      supplier_id: 'sup-1',
      warehouse_id: 'wh-main',
      receiptNumber: 'REC-2026-0001',
      receivedDate: '2026-07-13',
      items: [{ product_id: 'prod-1', quantity: 150, unitCost: 120.00 }],
      status: 'completed',
      createdAt: now(),
      updatedAt: now()
    }
  },
  issues: {
    'iss-1': {
      id: 'iss-1',
      company_id: 'comp-1',
      branch_id: 'branch-1',
      customer_id: 'cust-1',
      warehouse_id: 'wh-main',
      issueNumber: 'ISS-2026-0001',
      issueDate: '2026-07-13',
      items: [{ product_id: 'prod-1', quantity: 10, unitPrice: 249.99 }],
      status: 'completed',
      createdAt: now(),
      updatedAt: now()
    }
  },
  returns: {
    'ret-1': {
      id: 'ret-1',
      company_id: 'comp-1',
      branch_id: 'branch-1',
      customer_id: 'cust-1',
      warehouse_id: 'wh-main',
      returnNumber: 'RET-2026-0001',
      type: 'customer',
      reason: 'Defective device box damage',
      items: [{ product_id: 'prod-1', quantity: 1 }],
      status: 'pending',
      createdAt: now(),
      updatedAt: now()
    }
  },
  transfers: {
    'trsf-1': {
      id: 'trsf-1',
      company_id: 'comp-1',
      from_warehouse_id: 'wh-main',
      to_warehouse_id: 'wh-secondary',
      transferNumber: 'TRSF-2026-0001',
      items: [{ product_id: 'prod-1', quantity: 5 }],
      status: 'pending',
      createdAt: now(),
      updatedAt: now()
    }
  },
  purchase_orders: {
    'po-1': {
      id: 'po-1',
      company_id: 'comp-1',
      supplier_id: 'sup-1',
      poNumber: 'PO-2026-0001',
      items: [{ product_id: 'prod-1', quantity: 100, unitCost: 120.00 }],
      status: 'approved',
      createdAt: now(),
      updatedAt: now()
    }
  },
  sales_orders: {
    'so-1': {
      id: 'so-1',
      company_id: 'comp-1',
      customer_id: 'cust-1',
      soNumber: 'SO-2026-0001',
      items: [{ product_id: 'prod-1', quantity: 50, unitPrice: 249.99 }],
      status: 'pending',
      createdAt: now(),
      updatedAt: now()
    }
  },
  fuel_logs: {
    'fuel-1': {
      id: 'fuel-1',
      company_id: 'comp-1',
      vehicle_id: 'veh-1',
      driver_id: 'driver-1',
      odometer: 120440.5,
      liters: 320,
      cost: 480.00,
      fuelCardNumber: 'FC-9912',
      createdAt: now(),
      updatedAt: now()
    }
  },
  maintenance: {
    'maint-1': {
      id: 'maint-1',
      company_id: 'comp-1',
      vehicle_id: 'veh-1',
      type: 'Preventative',
      description: 'Oil change and filter replacement',
      cost: 150.00,
      date: '2026-07-10',
      status: 'completed',
      createdAt: now(),
      updatedAt: now()
    }
  },
  expenses: {
    'exp-1': {
      id: 'exp-1',
      company_id: 'comp-1',
      branch_id: 'branch-1',
      category_id: 'cat-electronics',
      amount: 75.00,
      description: 'Office cable management accessories',
      status: 'approved',
      createdAt: now(),
      updatedAt: now()
    }
  },
  attachments: {
    'att-1': {
      id: 'att-1',
      company_id: 'comp-1',
      name: 'po-2026-0001-signed.pdf',
      url: 'https://storage.googleapis.com/refined-garage-5nzsc.firebasestorage.app/comp-1/po-2026-0001-signed.pdf',
      type: 'application/pdf',
      size: 145020,
      createdAt: now(),
      updatedAt: now()
    }
  },
  notifications: {
    'not-1': {
      id: 'not-1',
      company_id: 'comp-1',
      user_id: 'user-1',
      title: 'New Purchase Order',
      message: 'PO-2026-0001 has been approved.',
      read: false,
      createdAt: now(),
      updatedAt: now()
    }
  },
  activity_logs: {
    'act-1': {
      id: 'act-1',
      company_id: 'comp-1',
      user_id: 'user-1',
      action: 'Create Document',
      details: 'Created purchase order PO-2026-0001',
      createdAt: now(),
      updatedAt: now()
    }
  },
  settings: {
    'set-main': {
      id: 'set-main',
      company_id: 'comp-1',
      currency: 'USD',
      timezone: 'America/Chicago',
      allowNegativeInventory: false,
      createdAt: now(),
      updatedAt: now()
    }
  }
};

async function seed() {
  const summary: Record<string, { status: string; docsSeeded: number }> = {};
  
  for (const [colName, docs] of Object.entries(seedData)) {
    try {
      console.log(`Checking collection [${colName}]...`);
      const qCol = db.collection(colName).limit(1);
      const snap = await qCol.get();
      
      if (!snap.empty) {
        console.log(`Collection [${colName}] already exists and contains data. Skipping.`);
        summary[colName] = { status: 'skipped (already exists)', docsSeeded: 0 };
      } else {
        console.log(`Seeding collection [${colName}]...`);
        let seededCount = 0;
        for (const [docId, docData] of Object.entries(docs)) {
          const docRef = db.collection(colName).doc(docId);
          await docRef.set(docData);
          seededCount++;
        }
        console.log(`Successfully seeded ${seededCount} documents into [${colName}].`);
        summary[colName] = { status: 'created & seeded', docsSeeded: seededCount };
      }
    } catch (error: any) {
      console.error(`Error processing collection [${colName}]:`, error.message || error);
      summary[colName] = { status: `error: ${error.message || String(error)}`, docsSeeded: 0 };
    }
  }

  console.log('\n--- SYSTEM SEEDING SUMMARY ---');
  console.table(summary);
  console.log('Seeding process complete.');
}

seed();
