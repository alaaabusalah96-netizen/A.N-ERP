import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Copy, 
  Search, 
  Check, 
  AlertCircle, 
  FileText, 
  ChevronDown, 
  Calendar, 
  User, 
  Tag, 
  HelpCircle,
  Hash,
  Activity,
  DollarSign,
  Layers,
  Truck,
  PackageCheck,
  Package,
  X
} from 'lucide-react';
import { 
  InventoryDocument, 
  InventoryDocType, 
  InventoryDocStatus, 
  InventoryDocItem,
  Warehouse,
  Product,
  WarehouseBin
} from '../types/inventory';
import { InventoryModule } from '../db/inventory';
import { CustodyDB } from '../db';
import { CompaniesModule } from '../db/companies';
import { OrganizationEngine } from '../db/organizationEngine';
import { PurchasingBusinessEngine } from '../lib/enterprise/purchasing_engine';
import { PurchaseOrder } from '../types/purchasing';
import WarehouseTreeSelect from './WarehouseTreeSelect';
import kemitLogo from '../assets/images/kemit_logo_1784280480891.jpg';

interface InventoryDocumentFormProps {
  docId?: string; // If editing
  initialDocType?: InventoryDocType;
  onSave: (doc: InventoryDocument) => void;
  onCancel: () => void;
  language: 'en' | 'ar';
  theme: 'light' | 'dark';
}

interface DropdownItem {
  id: string;
  name: string;
  code: string;
  subText?: string;
}

// Pre-seeded suppliers for autocomplete
const DEFAULT_SUPPLIERS = [
  { id: 'sup-1', name: 'Shell Egypt (شل مصر)', code: 'SUP-SHELL', subText: 'مورد زيوت معتمد' },
  { id: 'sup-2', name: 'Bridgestone Middle East (بريدجستون الشرق الأوسط)', code: 'SUP-BRIDGE', subText: 'مورد إطارات أصلي' },
  { id: 'sup-3', name: 'El-Ahram Batteries Co. (شركة الأهرام للبطاريات)', code: 'SUP-AHRAM', subText: 'مورد بطاريات وطني' },
  { id: 'sup-4', name: 'Ghabour Auto Parts (جي بي غبور لقطع الغيار)', code: 'SUP-GB', subText: 'قطع غيار سيارات أصلية' }
];

export default function InventoryDocumentForm({
  docId,
  initialDocType = 'Receipt',
  onSave,
  onCancel,
  language,
  theme
}: InventoryDocumentFormProps) {
  const isRtl = language === 'ar';
  const activeUser = CustodyDB.getActiveUser();

  // Load basic lists
  const selectedCompanyId = activeUser?.company_id || CompaniesModule.getSelectedCompanyId() || '';
  const warehouses = useMemo(() => InventoryModule.getWarehouses(), []);
  const products = useMemo(() => InventoryModule.getProducts(), []);
  const stations = useMemo(() => CustodyDB.getStations(), []);
  const regions = useMemo(() => CustodyDB.getRegions(), []);
  const orgUnits = useMemo(() => OrganizationEngine.getOrganizationUnits(selectedCompanyId), [selectedCompanyId]);

  // Form states
  const [docType, setDocType] = useState<InventoryDocType>(initialDocType);
  const [scrapAction, setScrapAction] = useState<'IN' | 'OUT'>('IN');
  const [receiptSourceType, setReceiptSourceType] = useState<'supplier' | 'transfer'>('supplier');
  const [receiptTransferEntityId, setReceiptTransferEntityId] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [sourceWarehouseId, setSourceWarehouseId] = useState<string>('');
  const [destEntityId, setDestEntityId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [recipient, setRecipient] = useState<string>('');
  const [statement, setStatement] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [items, setItems] = useState<(Omit<InventoryDocItem, 'product_code' | 'product_name' | 'unit'> & { batch_no?: string; expiry_date?: string })[]>([]);

  // PO & Transfer Selection States
  const [poSearchQuery, setPoSearchQuery] = useState<string>('');
  const [selectedShipmentRef, setSelectedShipmentRef] = useState<string>('');

  // Sample Purchase Orders for Supplier Receipts
  const samplePurchaseOrders: PurchaseOrder[] = useMemo(() => [
    {
      id: 'sample-po-1',
      company_id: activeUser?.company_id || '',
      poNumber: 'PO-2026-0001',
      vendorId: 'sup-1',
      vendorName: 'Shell Egypt (شل مصر)',
      date: '2026-07-20',
      totalAmount: 70500,
      status: 'ISSUED',
      notes: 'طلب توريد زيوت شل هيلكس وفلاتر هواء للمخازن',
      items: [
        { productId: 'prod-1', productCode: 'PRD-MTR-01', productName: 'Shell Helix Motor Oil 4L (زيت محرك شل هيلكس 4 لتر)', unit: 'عبوة (Bottle)', qty: 50, unitPrice: 1200, totalPrice: 60000 },
        { productId: 'prod-4', productCode: 'PRD-FIL-04', productName: 'Air Filter (فلتر هواء محرك)', unit: 'عدد (Piece)', qty: 30, unitPrice: 350, totalPrice: 10500 }
      ],
      metadata: { tenantId: activeUser?.company_id || '', organizationId: activeUser?.company_id || '', created_at: new Date().toISOString(), created_by: 'system', companyId: activeUser?.company_id || '', version: 1 }
    },
    {
      id: 'sample-po-2',
      company_id: activeUser?.company_id || '',
      poNumber: 'PO-2026-0002',
      vendorId: 'sup-2',
      vendorName: 'Bridgestone Middle East (بريدجستون الشرق الأوسط)',
      date: '2026-07-21',
      totalAmount: 96000,
      status: 'ISSUED',
      notes: 'أمر شراء إطارات بريدجستون الأصلي',
      items: [
        { productId: 'prod-3', productCode: 'PRD-TIR-03', productName: 'Bridgestone Tire 205/55R16 (إطار بريدجستون 205/55R16)', unit: 'عدد (Piece)', qty: 20, unitPrice: 4800, totalPrice: 96000 }
      ],
      metadata: { tenantId: activeUser?.company_id || '', organizationId: activeUser?.company_id || '', created_at: new Date().toISOString(), created_by: 'system', companyId: activeUser?.company_id || '', version: 1 }
    },
    {
      id: 'sample-po-3',
      company_id: activeUser?.company_id || '',
      poNumber: 'PO-2026-0003',
      vendorId: 'sup-3',
      vendorName: 'El-Ahram Batteries Co. (شركة الأهرام للبطاريات)',
      date: '2026-07-21',
      totalAmount: 73750,
      status: 'ISSUED',
      notes: 'توريد بطاريات سيارات وأطقم تيل فرامل',
      items: [
        { productId: 'prod-2', productCode: 'PRD-BAT-02', productName: '12V 70Ah Car Battery (بطارية سيارة 12 فولت 70 أمبير)', unit: 'عدد (Piece)', qty: 15, unitPrice: 3500, totalPrice: 52500 },
        { productId: 'prod-5', productCode: 'PRD-BRK-05', productName: 'Front Brake Pads Set (طقم تيل فرامل أمامي)', unit: 'طقم (Set)', qty: 25, unitPrice: 850, totalPrice: 21250 }
      ],
      metadata: { tenantId: activeUser?.company_id || '', organizationId: activeUser?.company_id || '', created_at: new Date().toISOString(), created_by: 'system', companyId: activeUser?.company_id || '', version: 1 }
    },
    {
      id: 'sample-po-4',
      company_id: activeUser?.company_id || '',
      poNumber: 'PO-2026-0004',
      vendorId: 'sup-4',
      vendorName: 'Ghabour Auto Parts (جي بي غبور لقطع الغيار)',
      date: '2026-07-21',
      totalAmount: 53200,
      status: 'ISSUED',
      notes: 'شحنة قطع غيار وفلاتر محركات',
      items: [
        { productId: 'prod-5', productCode: 'PRD-BRK-05', productName: 'Front Brake Pads Set (طقم تيل فرامل أمامي)', unit: 'طقم (Set)', qty: 40, unitPrice: 820, totalPrice: 32800 },
        { productId: 'prod-4', productCode: 'PRD-FIL-04', productName: 'Air Filter (فلتر هواء محرك)', unit: 'عدد (Piece)', qty: 60, unitPrice: 340, totalPrice: 20400 }
      ],
      metadata: { tenantId: activeUser?.company_id || '', organizationId: activeUser?.company_id || '', created_at: new Date().toISOString(), created_by: 'system', companyId: activeUser?.company_id || '', version: 1 }
    }
  ], [activeUser]);

  // Combine real & sample purchase orders
  const availablePurchaseOrders = useMemo(() => {
    const companyId = activeUser?.company_id;
    const realPOs = companyId ? PurchasingBusinessEngine.getPurchaseOrders(companyId) : [];
    const existingNumbers = new Set(realPOs.map(p => p.poNumber));
    const uniqueSamples = samplePurchaseOrders.filter(p => !existingNumbers.has(p.poNumber));
    return [...realPOs, ...uniqueSamples];
  }, [activeUser, samplePurchaseOrders]);

  // Filter purchase orders by PO number search query
  const filteredPurchaseOrders = useMemo(() => {
    if (!poSearchQuery.trim()) return availablePurchaseOrders;
    const q = poSearchQuery.toLowerCase().trim();
    return availablePurchaseOrders.filter(po => 
      po.poNumber.toLowerCase().includes(q) ||
      po.vendorName.toLowerCase().includes(q) ||
      po.items.some(i => i.productName.toLowerCase().includes(q) || i.productCode.toLowerCase().includes(q))
    );
  }, [availablePurchaseOrders, poSearchQuery]);

  // Sample Transfer Shipments
  const sampleTransferShipments = useMemo(() => [
    {
      id: 'sample-trf-1',
      doc_no: 'TRF-2026-0010',
      date: '2026-07-20',
      doc_type: 'BranchTransfer' as InventoryDocType,
      source_warehouse_id: 'wh-1',
      dest_entity_id: sourceWarehouseId || 'wh-2',
      dest_entity_type: 'warehouse' as const,
      reason: 'تحويل مخزني لسد عجز المنتجات بالفرع',
      recipient: 'أحمد المحمودي (سائق الشاحنة #542)',
      statement: 'شحنة زيوت وبطاريات محولة من المخزن الرئيسي بالقاهرة',
      status: 'Posted' as InventoryDocStatus,
      company_id: activeUser?.company_id || '',
      tenantId: activeUser?.company_id || '',
      organizationId: activeUser?.company_id || '',
      version: 1,
      created_at: new Date().toISOString(),
      created_by: 'system',
      items: [
        { product_id: 'prod-1', product_code: 'PRD-MTR-01', product_name: 'Shell Helix Motor Oil 4L (زيت محرك شل هيلكس 4 لتر)', unit: 'عبوة (Bottle)', qty: 30, last_purchase_price: 1200, batch_no: 'BAT-2026-01', expiry_date: '2028-12-31' },
        { product_id: 'prod-2', product_code: 'PRD-BAT-02', product_name: '12V 70Ah Car Battery (بطارية سيارة 12 فولت 70 أمبير)', unit: 'عدد (Piece)', qty: 10, last_purchase_price: 3500, batch_no: 'BAT-2026-02', expiry_date: '2029-06-30' }
      ]
    },
    {
      id: 'sample-trf-2',
      doc_no: 'TRF-2026-0011',
      date: '2026-07-21',
      doc_type: 'Transfer' as InventoryDocType,
      source_warehouse_id: 'wh-2',
      dest_entity_id: sourceWarehouseId || 'wh-3',
      dest_entity_type: 'warehouse' as const,
      reason: 'شحنة تحويل إطارات وفلاتر عاجلة',
      recipient: 'محمود الخولي (سائق النقل)',
      statement: 'إذن تحويل وارد من مستودع الإسكندرية الفرعي',
      status: 'Posted' as InventoryDocStatus,
      company_id: activeUser?.company_id || '',
      tenantId: activeUser?.company_id || '',
      organizationId: activeUser?.company_id || '',
      version: 1,
      created_at: new Date().toISOString(),
      created_by: 'system',
      items: [
        { product_id: 'prod-3', product_code: 'PRD-TIR-03', product_name: 'Bridgestone Tire 205/55R16 (إطار بريدجستون 205/55R16)', unit: 'عدد (Piece)', qty: 12, last_purchase_price: 4800, batch_no: 'BAT-2026-03', expiry_date: '2030-01-01' },
        { product_id: 'prod-4', product_code: 'PRD-FIL-04', product_name: 'Air Filter (فلتر هواء محرك)', unit: 'عدد (Piece)', qty: 25, last_purchase_price: 350, batch_no: 'BAT-2026-04', expiry_date: '2028-06-01' }
      ]
    },
    {
      id: 'sample-trf-3',
      doc_no: 'TRF-2026-0012',
      date: '2026-07-21',
      doc_type: 'BranchTransfer' as InventoryDocType,
      source_warehouse_id: 'wh-1',
      dest_entity_id: sourceWarehouseId || 'wh-1',
      dest_entity_type: 'warehouse' as const,
      reason: 'إعادة توزيع مخزون قطع غيار بين الأفرع',
      recipient: 'سامح حسن (مندوب الفرع)',
      statement: 'شحنة أطقم تيل فرامل وزيوت محركات',
      status: 'Posted' as InventoryDocStatus,
      company_id: activeUser?.company_id || '',
      tenantId: activeUser?.company_id || '',
      organizationId: activeUser?.company_id || '',
      version: 1,
      created_at: new Date().toISOString(),
      created_by: 'system',
      items: [
        { product_id: 'prod-1', product_code: 'PRD-MTR-01', product_name: 'Shell Helix Motor Oil 4L (زيت محرك شل هيلكس 4 لتر)', unit: 'عبوة (Bottle)', qty: 20, last_purchase_price: 1200, batch_no: 'BAT-2026-05', expiry_date: '2028-11-15' },
        { product_id: 'prod-5', product_code: 'PRD-BRK-05', product_name: 'Front Brake Pads Set (طقم تيل فرامل أمامي)', unit: 'طقم (Set)', qty: 15, last_purchase_price: 850, batch_no: 'BAT-2026-06', expiry_date: '2031-05-01' }
      ]
    }
  ], [activeUser, sourceWarehouseId]);

  // Combine real & sample transfers
  const availableTransferShipments = useMemo(() => {
    const realTrfs = InventoryModule.getInventoryDocuments().filter(d => 
      ['Transfer', 'BranchTransfer', 'StationTransfer'].includes(d.doc_type)
    );
    const existingDocNos = new Set(realTrfs.map(t => t.doc_no));
    const uniqueSamples = sampleTransferShipments.filter(t => !existingDocNos.has(t.doc_no));
    return [...realTrfs, ...uniqueSamples];
  }, [sampleTransferShipments]);

  // Handle PO Selection
  const handleSelectPO = (po: PurchaseOrder) => {
    setDestEntityId(po.vendorId);
    setItems(po.items.map(i => ({
      product_id: i.productId,
      qty: i.qty,
      last_purchase_price: i.unitPrice,
      batch_no: '',
      expiry_date: '',
      notes: ''
    })));
    setStatement(isRtl ? `استلام توريد شحنة بضاعة بموجب أمر الشراء رقم ${po.poNumber}` : `Goods receipt per PO #${po.poNumber}`);
    setReason(isRtl ? `استلام مشتريات توريد من المورد ${po.vendorName}` : `Supplier goods receipt from ${po.vendorName}`);
    setRecipient(isRtl ? 'مسؤول استلام المشتريات بالفرع' : 'Branch Receiving Inspector');
    setSelectedShipmentRef(po.poNumber);
  };

  // Handle Transfer Selection
  const handleSelectTransfer = (trf: InventoryDocument) => {
    setReceiptTransferEntityId(trf.source_warehouse_id);
    setItems(trf.items.map(i => ({
      product_id: i.product_id,
      qty: i.qty,
      batch_no: i.batch_no || '',
      expiry_date: i.expiry_date || '',
      last_purchase_price: i.last_purchase_price || 0,
      notes: i.notes || ''
    })));
    const srcName = warehouses.find(w => w.id === trf.source_warehouse_id)?.name || (isRtl ? 'الفرع المحول منه' : 'Source Branch');
    setStatement(isRtl ? `استلام شحنة تحويل واردة رقم ${trf.doc_no} من ${srcName}` : `Received transfer shipment #${trf.doc_no}`);
    setReason(trf.reason || (isRtl ? 'إذن استلام تحويل بين الفروع / المخازن' : 'Inter-branch stock transfer receipt'));
    setRecipient(trf.recipient || (isRtl ? 'مشرف استلام المخزن' : 'Store Receiving Supervisor'));
    setSelectedShipmentRef(trf.doc_no);
  };

  // Phase 3 Multi-bin States
  const [activeBins, setActiveBins] = useState<WarehouseBin[]>([]);
  const [openBinIdx, setOpenBinIdx] = useState<number | null>(null);

  useEffect(() => {
    if (sourceWarehouseId) {
      setActiveBins(InventoryModule.getWarehouseBins(sourceWarehouseId));
    } else {
      setActiveBins([]);
    }
  }, [sourceWarehouseId]);

  const handleUpdateBinAllocations = (itemIdx: number, allocations: { bin_id: string; bin_code: string; qty: number }[]) => {
    setItems(prev => prev.map((it, idx) => {
      if (idx === itemIdx) {
        return {
          ...it,
          bin_allocations: allocations
        };
      }
      return it;
    }));
  };

  // Filter warehouses for Scrap / Obsolete documents
  const filteredWarehouses = useMemo(() => {
    if (docType === 'Damage') {
      return warehouses.filter(w =>
        w.name.includes('خردة') ||
        w.name.includes('كهنة') ||
        w.name.toLowerCase().includes('scrap') ||
        w.name.toLowerCase().includes('obsolete')
      );
    }
    return warehouses;
  }, [docType, warehouses]);

  // Automatically select first scrap warehouse if docType is Damage
  useEffect(() => {
    if (docType === 'Damage') {
      const scrapWhs = warehouses.filter(w =>
        w.name.includes('خردة') ||
        w.name.includes('كهنة') ||
        w.name.toLowerCase().includes('scrap') ||
        w.name.toLowerCase().includes('obsolete')
      );
      if (scrapWhs.length > 0) {
        const isCurrentScrap = scrapWhs.some(w => w.id === sourceWarehouseId);
        if (!isCurrentScrap) {
          setSourceWarehouseId(scrapWhs[0].id);
        }
      } else {
        setSourceWarehouseId('');
      }
    }
  }, [docType, warehouses]);

  // Validation/Error feedback state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Editing state loading
  useEffect(() => {
    if (docId) {
      const documents = InventoryModule.getInventoryDocuments();
      const document = documents.find(d => d.id === docId);
      if (document) {
        setDocType(document.doc_type);
        if (document.scrap_action) {
          setScrapAction(document.scrap_action);
        }
        if (document.receipt_source_type) {
          setReceiptSourceType(document.receipt_source_type);
        }
        if (document.receipt_transfer_entity_id) {
          setReceiptTransferEntityId(document.receipt_transfer_entity_id);
        }
        setDate(document.date);
        setSourceWarehouseId(document.source_warehouse_id);
        setDestEntityId(document.dest_entity_id);
        setReason(document.reason);
        setRecipient(document.recipient);
        setStatement(document.statement);
        setNotes(document.notes || '');
        // Items loading
        setItems(document.items.map(i => ({
          product_id: i.product_id,
          qty: i.qty,
          batch_no: i.batch_no || '',
          expiry_date: i.expiry_date || '',
          notes: i.notes || '',
          last_purchase_price: i.last_purchase_price,
          bin_allocations: i.bin_allocations || []
        })));
      }
    } else {
      // Set default source warehouse if available
      if (docType === 'Damage') {
        const scrapWhs = warehouses.filter(w =>
          w.name.includes('خردة') ||
          w.name.includes('كهنة') ||
          w.name.toLowerCase().includes('scrap') ||
          w.name.toLowerCase().includes('obsolete')
        );
        if (scrapWhs.length > 0) {
          setSourceWarehouseId(scrapWhs[0].id);
        }
      } else if (warehouses.length > 0) {
        setSourceWarehouseId(warehouses[0].id);
      }
      // Initialize with one empty item row
      setItems([{ product_id: '', qty: 1, notes: '', last_purchase_price: 0, bin_allocations: [] }]);
    }
  }, [docId, warehouses, docType]);

  // Handle document type selection adjustments
  const destEntityType = useMemo((): 'warehouse' | 'branch' | 'station' | 'supplier' | 'customer' | 'scrap' | 'adjustment' => {
    switch (docType) {
      case 'Transfer':
        return 'warehouse';
      case 'BranchTransfer':
      case 'BranchReturn':
        return 'branch';
      case 'StationTransfer':
        return 'station';
      case 'SupplierReturn':
        return 'supplier';
      case 'Damage':
        return 'scrap';
      case 'Adjustment':
        return 'adjustment';
      default:
        return 'supplier';
    }
  }, [docType]);

  // Dynamically resolve target entity list for searchable dropdown
  const destEntityList = useMemo((): DropdownItem[] => {
    const orgUnitItems = orgUnits.map(u => ({ id: u.id, name: isRtl ? (u.nameAr || u.name) : (u.nameEn || u.name), code: u.code, subText: isRtl ? 'وحدة تنظيمية / فرع' : 'Org Unit' }));
    if (docType === 'Receipt') {
      if (receiptSourceType === 'transfer') {
        const whItems = warehouses
          .filter(w => w.id !== sourceWarehouseId)
          .map(w => ({ id: w.id, name: w.name, code: w.code, subText: isRtl ? 'مخزن/فرع محول منه' : 'Source Warehouse' }));
        const branchItems = regions.map(r => ({ id: r.id, name: r.name, code: r.code || r.id, subText: isRtl ? 'فرع محول منه' : 'Source Branch' }));
        const stationItems = stations.map(s => ({ id: s.id, name: s.station_name, code: s.station_code, subText: isRtl ? 'محطة محول منها' : 'Source Station' }));
        return [...whItems, ...orgUnitItems, ...branchItems, ...stationItems];
      }
      return DEFAULT_SUPPLIERS;
    }
    switch (destEntityType) {
      case 'warehouse':
        return warehouses
          .filter(w => w.id !== sourceWarehouseId)
          .map(w => ({ id: w.id, name: w.name, code: w.code, subText: w.location }));
      case 'branch':
        const branchItems = regions.map(r => ({ id: r.id, name: r.name, code: r.code || r.id, subText: isRtl ? 'فرع مؤسسة' : 'Company Branch' }));
        return [...orgUnitItems, ...branchItems];
      case 'station':
        return stations.map(s => ({ id: s.id, name: s.station_name, code: s.station_code, subText: s.custody_amount.toLocaleString() + ' EGP' }));
      case 'supplier':
        return DEFAULT_SUPPLIERS;
      default:
        return [];
    }
  }, [docType, receiptSourceType, destEntityType, warehouses, sourceWarehouseId, regions, stations, orgUnits, isRtl]);

  // Autocomplete suggestions for fields
  const [activeDropdown, setActiveDropdown] = useState<{ type: 'dest' | number; search: string } | null>(null);

  // Validate fields before submission
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!activeUser?.company_id || !activeUser.company_id.trim()) {
      newErrors.global = isRtl
        ? 'خطأ أمني: لم يتم العثور على شركة تابعة لحساب المستخدم الحالي. تم إيقاف عملية الحفظ لمنع تداخل البيانات.'
        : 'Security Error: No company associated with the active user. Save operation blocked to prevent tenant isolation breaches.';
    }

    if (!sourceWarehouseId) {
      newErrors.sourceWarehouseId = isRtl ? 'المخزن المستلم/الرئيسي إلزامي' : 'Main/Receiving warehouse is required';
    }

    if (docType === 'Receipt') {
      if (receiptSourceType === 'supplier' && !destEntityId) {
        newErrors.destEntityId = isRtl ? 'حقل المورد إلزامي' : 'Supplier is required';
      }
      if (receiptSourceType === 'transfer' && !receiptTransferEntityId) {
        newErrors.receiptTransferEntityId = isRtl ? 'الفرع/المخزن المحول منه إلزامي' : 'Transfer source entity is required';
      }
    } else if (destEntityType !== 'scrap' && destEntityType !== 'adjustment' && !destEntityId) {
      newErrors.destEntityId = isRtl ? 'الجهة المستلمة/المعنية إلزامية' : 'Destination entity is required';
    }

    if (sourceWarehouseId && destEntityId && sourceWarehouseId === destEntityId && destEntityType === 'warehouse') {
      newErrors.destEntityId = isRtl ? 'لا يمكن التحويل لنفس المخزن' : 'Cannot transfer to the same warehouse';
    }

    if (!reason.trim()) {
      newErrors.reason = isRtl ? 'سبب الحركة إلزامي' : 'Reason is required';
    }

    if (!recipient.trim()) {
      newErrors.recipient = isRtl ? 'المستلم/المشرف إلزامي' : 'Recipient/Operator is required';
    }

    if (!statement.trim()) {
      newErrors.statement = isRtl ? 'البيان إلزامي' : 'Statement is required';
    }

    if (items.length === 0) {
      newErrors.items = isRtl ? 'يجب إضافة صنف واحد على الأقل' : 'At least one item is required';
    }

    // Items row-level validation
    items.forEach((item, idx) => {
      if (!item.product_id) {
        newErrors[`item_product_${idx}`] = isRtl ? 'يرجى اختيار الصنف' : 'Please select product';
      }
      if (item.qty <= 0) {
        newErrors[`item_qty_${idx}`] = isRtl ? 'الكمية يجب أن تكون أكبر من صفر' : 'Quantity must be > 0';
      }

      // Overdraft check if it decreases stock
      if (item.product_id && sourceWarehouseId && (docType as string) !== 'Receipt' && (docType as string) !== 'Addition' && (docType as string) !== 'BranchReturn' && (docType as string) !== 'Adjustment') {
        const isAddition = (docType as string) === 'Receipt' || (docType as string) === 'Addition' || (docType as string) === 'BranchReturn' || (docType === 'Damage' && scrapAction === 'IN');
        if (!isAddition) {
          const currentStock = InventoryModule.getProductStock(item.product_id, sourceWarehouseId);
          if (currentStock < item.qty) {
            newErrors[`item_qty_${idx}`] = isRtl 
              ? `الكمية المطلوبة تتجاوز الرصيد الحالي (${currentStock})` 
              : `Requested quantity exceeds current stock (${currentStock})`;
          }
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    // Build final items array with enriched codes/names
    const enrichedItems: InventoryDocItem[] = items.map(item => {
      const prod = products.find(p => p.id === item.product_id);
      return {
        product_id: item.product_id,
        product_code: prod?.code || '',
        product_name: prod?.name || '',
        unit: prod?.unit || '',
        qty: item.qty,
        batch_no: item.batch_no || '',
        expiry_date: item.expiry_date || '',
        notes: item.notes,
        last_purchase_price: item.last_purchase_price || prod?.last_purchase_price || 0,
        bin_allocations: item.bin_allocations || []
      };
    });

    const targetDestEntityId = docType === 'Receipt'
      ? (receiptSourceType === 'transfer' ? receiptTransferEntityId : destEntityId)
      : destEntityId;

    const targetDestEntityType = docType === 'Receipt'
      ? (receiptSourceType === 'transfer' ? 'warehouse' : 'supplier')
      : destEntityType;

    try {
      if (docId) {
        // Update draft
        InventoryModule.updateInventoryDocument(docId, {
          company_id: activeUser.company_id,
          tenantId: activeUser.company_id,
          organizationId: activeUser.company_id,
          date,
          doc_type: docType,
          source_warehouse_id: sourceWarehouseId,
          dest_entity_id: targetDestEntityId,
          dest_entity_type: targetDestEntityType,
          receipt_source_type: docType === 'Receipt' ? receiptSourceType : undefined,
          receipt_transfer_entity_id: docType === 'Receipt' && receiptSourceType === 'transfer' ? receiptTransferEntityId : undefined,
          reason,
          recipient,
          statement,
          notes,
          items: enrichedItems,
          scrap_action: docType === 'Damage' ? scrapAction : undefined
        });
        setSuccessMsg(isRtl ? 'تم تحديث المسودة بنجاح!' : 'Draft updated successfully!');
      } else {
        // Add new document
        await InventoryModule.addInventoryDocument({
          company_id: activeUser.company_id,
          tenantId: activeUser.company_id,
          organizationId: activeUser.company_id,
          date,
          doc_type: docType,
          source_warehouse_id: sourceWarehouseId,
          dest_entity_id: targetDestEntityId,
          dest_entity_type: targetDestEntityType,
          receipt_source_type: docType === 'Receipt' ? receiptSourceType : undefined,
          receipt_transfer_entity_id: docType === 'Receipt' && receiptSourceType === 'transfer' ? receiptTransferEntityId : undefined,
          reason,
          recipient,
          statement,
          notes,
          items: enrichedItems,
          scrap_action: docType === 'Damage' ? scrapAction : undefined
        } as any);
        setSuccessMsg(isRtl ? 'تم إنشاء السند المخزني كمسودة بنجاح!' : 'Inventory document draft created successfully!');
      }

      setTimeout(() => {
        onSave({} as any); // Trigger reload
      }, 1500);

    } catch (err: any) {
      setErrors({ global: err.message });
    }
  };

  // Items table row modifiers
  const handleAddItemRow = () => {
    setItems([...items, { product_id: '', qty: 1, notes: '', last_purchase_price: 0 }]);
  };

  const handleDeleteItemRow = (index: number) => {
    if (items.length === 1) {
      setItems([{ product_id: '', qty: 1, notes: '', last_purchase_price: 0 }]);
    } else {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleDuplicateItemRow = (index: number) => {
    const rowToCopy = items[index];
    const newItems = [...items];
    newItems.splice(index + 1, 0, { ...rowToCopy });
    setItems(newItems);
  };

  const handleUpdateItemValue = (index: number, key: string, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [key]: value };

    // Auto-fill price or show alerts when product changes
    if (key === 'product_id' && value) {
      const prod = products.find(p => p.id === value);
      if (prod) {
        updated[index].last_purchase_price = prod.last_purchase_price || 0;
      }
      if (docType !== 'Receipt' && docType !== 'Addition' && sourceWarehouseId) {
        const batches = InventoryModule.getProductBatches(value, sourceWarehouseId);
        if (batches.length > 0) {
          updated[index].batch_no = batches[0].batch_no;
          updated[index].expiry_date = batches[0].expiry_date || '';
        } else {
          updated[index].batch_no = '';
          updated[index].expiry_date = '';
        }
      }
    }

    setItems(updated);
  };

  const handleSourceWarehouseChange = (whId: string) => {
    setSourceWarehouseId(whId);
    if (docType !== 'Receipt' && docType !== 'Addition' && whId) {
      const updated = items.map(item => {
        if (item.product_id) {
          const batches = InventoryModule.getProductBatches(item.product_id, whId);
          if (batches.length > 0) {
            return {
              ...item,
              batch_no: batches[0].batch_no,
              expiry_date: batches[0].expiry_date || ''
            };
          }
        }
        return item;
      });
      setItems(updated);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Document Frame / Paper-like Look */}
      <div className={`rounded-3xl border p-4 md:p-8 transition-colors duration-200 shadow-xl ${
        theme === 'dark' ? 'bg-[#111827] border-[#1e293b]' : 'bg-white border-slate-100'
      }`}>
        {/* Document Header (أعلى الورقة المستندية) */}
        <div className="border-b-2 border-dashed border-slate-200 dark:border-slate-800 pb-6 mb-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Right: Company Logo Block */}
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl overflow-hidden bg-white flex items-center justify-center shadow-md shrink-0 border border-slate-150">
                <img src={kemitLogo} alt="KEMIT ERP Logo" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-tight">KEMIT ERP</h3>
                <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Integrated ERP Solution</p>
              </div>
            </div>

            {/* Center: Main Document Title Card */}
            <div className="text-center bg-slate-50 dark:bg-slate-800 px-6 py-2 rounded-2xl border border-slate-200/50 dark:border-slate-700">
              <h2 className="text-sm md:text-lg font-black text-emerald-600 dark:text-emerald-400">
                {docType === 'Receipt' && (isRtl ? 'إذن استلام مخزنـي (Receipt Voucher)' : 'Inventory Receipt Voucher')}
                {docType === 'Addition' && (isRtl ? 'إذن إضافة مخزنـي (Addition Voucher)' : 'Inventory Addition Voucher')}
                {docType === 'Issue' && (isRtl ? 'إذن صرف مخزنـي (Issue Voucher)' : 'Inventory Issue Voucher')}
                {docType === 'Transfer' && (isRtl ? 'إذن تحويل مخزنـي (Transfer Voucher)' : 'Warehouse Transfer Voucher')}
                {docType === 'BranchTransfer' && (isRtl ? 'تحويل مخزني إلى فرع (Branch Transfer)' : 'Branch Transfer Voucher')}
                {docType === 'StationTransfer' && (isRtl ? 'تحويل مخزني إلى محطة (Station Transfer)' : 'Station Transfer Voucher')}
                {docType === 'BranchReturn' && (isRtl ? 'مرتجع من فرع / محطة (Branch Return)' : 'Branch Return Voucher')}
                {docType === 'SupplierReturn' && (isRtl ? 'مرتجع إلى مورد (Supplier Return)' : 'Supplier Return Voucher')}
                {docType === 'Adjustment' && (isRtl ? 'سند تسوية جردية (Inventory Adjustment)' : 'Inventory Adjustment Voucher')}
                {docType === 'Damage' && (isRtl ? 'إذن خردة / كهنة (Scrap & Obsolete)' : 'Scrap & Obsolete Voucher')}
              </h2>
              <p className="text-[9px] text-slate-400 font-mono mt-0.5">SECURE TRANSACTION SHEET</p>
            </div>

            {/* Left: Metadata Numbering & Date */}
            <div className="text-right flex flex-col items-end gap-1">
              <div className="flex items-center gap-1 text-xs">
                <span className="text-slate-400">{isRtl ? 'الرقم:' : 'Serial:'}</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  {docId ? 'Draft / قيد التعديل' : 'AUTO_SEQUENCE_KEY'}
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-400 font-mono mt-1">
                <Calendar size={12} />
                <span>{date}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Global Error/Success Message */}
        {successMsg && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{successMsg}</span>
          </div>
        )}
        {errors.global && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-2">
            <AlertCircle size={16} />
            <span>{errors.global}</span>
          </div>
        )}

        {/* Basic Fields (البيانات الأساسية للمستند) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Document Type Selection */}
          <div className="w-full">
            <label className={`block text-xs font-bold mb-1.5 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
              {isRtl ? 'نوع المستند' : 'Document Type'}
            </label>
            <select
              value={docType}
              onChange={(e) => {
                setDocType(e.target.value as InventoryDocType);
                setDestEntityId('');
              }}
              disabled={!!docId}
              className={`w-full px-3.5 py-2 text-xs border rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                theme === 'dark' ? 'text-slate-100 bg-[#1e293b] border-[#334155]' : 'text-slate-800 bg-white border-slate-200'
              }`}
            >
              <option value="Receipt">{isRtl ? 'إذن استلام (الاستلامات)' : 'Receipt'}</option>
              <option value="Addition">{isRtl ? 'إذن إضافة' : 'Addition'}</option>
              <option value="Issue">{isRtl ? 'إذن صرف' : 'Issue'}</option>
              <option value="Transfer">{isRtl ? 'إذن تحويل بين المخازن' : 'Transfer'}</option>
              <option value="BranchTransfer">{isRtl ? 'إذن تحويل إلى فرع' : 'Branch Transfer'}</option>
              <option value="StationTransfer">{isRtl ? 'إذن تحويل إلى محطة' : 'Station Transfer'}</option>
              <option value="BranchReturn">{isRtl ? 'مرتجع من فرع أو محطة' : 'Branch Return'}</option>
              <option value="SupplierReturn">{isRtl ? 'مرتجع إلى مورد' : 'Supplier Return'}</option>
              <option value="Adjustment">{isRtl ? 'تسوية جرد' : 'Adjustment'}</option>
              <option value="Damage">{isRtl ? 'إذن خردة / كهنة' : 'Scrap / Obsolete'}</option>
            </select>
          </div>

          {/* Source Warehouse (المخزن الأساسي) */}
          <div className="w-full">
            <WarehouseTreeSelect
              label={
                docType === 'Damage' 
                  ? (isRtl ? 'مخزن الخردة / الكهنة' : 'Scrap & Obsolete Warehouse') 
                  : (isRtl ? 'المخزن الرئيسي للمستند' : 'Primary Warehouse')
              }
              value={sourceWarehouseId}
              onChange={(whId) => handleSourceWarehouseChange(whId)}
              filterTypeCode={docType === 'Damage' ? 'DAMAGED' : undefined}
              companyId={activeUser?.company_id || CustodyDB.getSelectedCompanyId() || ''}
              isRtl={isRtl}
              theme={theme}
              error={errors.sourceWarehouseId}
            />
          </div>

          {/* Date Picker */}
          <div className="w-full">
            <label className={`block text-xs font-bold mb-1.5 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
              {isRtl ? 'التاريخ' : 'Document Date'}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={`w-full px-3.5 py-2 text-xs border rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                theme === 'dark' ? 'text-slate-100 bg-[#1e293b] border-[#334155]' : 'text-slate-800 bg-white border-slate-200'
              }`}
            />
          </div>
        </div>

        {/* Scrap / Obsolete action nature selection buttons */}
        {docType === 'Damage' && (
          <div className="p-5 rounded-2xl border mb-8 bg-amber-500/5 border-amber-500/20 space-y-4 animate-fade-in">
            <h4 className="text-xs font-black text-amber-600 dark:text-amber-400 flex items-center gap-1.5 uppercase tracking-wider">
              <Tag size={14} />
              <span>{isRtl ? 'طبيعة حركة الخردة / الكهنة' : 'Scrap / Obsolete Transaction Nature'}</span>
            </h4>
            
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <button
                type="button"
                onClick={() => setScrapAction('IN')}
                className={`flex-1 w-full px-4 py-3 rounded-xl font-bold text-xs border transition-all cursor-pointer flex items-center justify-center gap-2 text-right ${
                  scrapAction === 'IN'
                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-md'
                    : theme === 'dark'
                      ? 'bg-slate-800/40 border-slate-700 text-slate-300 hover:bg-slate-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${scrapAction === 'IN' ? 'bg-white animate-pulse' : 'bg-emerald-500'}`} />
                <div>
                  <div className="font-extrabold">{isRtl ? 'إضافة للمخزن (تكهين صنف خردة)' : 'Inward / Addition (Scrapping Item)'}</div>
                  <div className={`text-[10px] mt-0.5 ${scrapAction === 'IN' ? 'text-emerald-100' : 'text-slate-400'}`}>
                    {isRtl ? 'يتم زيادة رصيد مخزن الخردة/الكهنة المحدد عند تكهين أو إتلاف أصل/صنف' : 'Increases scrap/obsolete stock balance upon scrapping'}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setScrapAction('OUT')}
                className={`flex-1 w-full px-4 py-3 rounded-xl font-bold text-xs border transition-all cursor-pointer flex items-center justify-center gap-2 text-right ${
                  scrapAction === 'OUT'
                    ? 'bg-rose-600 border-rose-600 text-white shadow-md'
                    : theme === 'dark'
                      ? 'bg-slate-800/40 border-slate-700 text-slate-300 hover:bg-slate-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${scrapAction === 'OUT' ? 'bg-white animate-pulse' : 'bg-rose-500'}`} />
                <div>
                  <div className="font-extrabold">{isRtl ? 'صرف من المخزن (بيع الخردة/الكهنة)' : 'Outward / Issue (Selling Scrap)'}</div>
                  <div className={`text-[10px] mt-0.5 ${scrapAction === 'OUT' ? 'text-rose-100' : 'text-slate-400'}`}>
                    {isRtl ? 'يتم خصم رصيد مخزن الخردة/الكهنة المحدد عند بيع أو التخلص من الخردة' : 'Decreases scrap/obsolete stock balance upon selling scrap'}
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Receipt Document Specific Options: Split between "Receipt from Supplier" vs "Receipt from Transfer" */}
        {docType === 'Receipt' && (
          <div className="p-5 rounded-2xl border mb-8 bg-blue-500/5 border-blue-500/20 space-y-4 animate-fade-in">
            <h4 className="text-xs font-black text-blue-600 dark:text-blue-400 flex items-center gap-1.5 uppercase tracking-wider">
              <Layers size={14} />
              <span>{isRtl ? 'مصدر الإضافة للمخزن' : 'Receipt Source Type'}</span>
            </h4>
            
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  setReceiptSourceType('supplier');
                  setDestEntityId('');
                  setReceiptTransferEntityId('');
                }}
                className={`flex-1 w-full px-4 py-3 rounded-xl font-bold text-xs border transition-all cursor-pointer flex items-center justify-center gap-2 text-right ${
                  receiptSourceType === 'supplier'
                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-md'
                    : theme === 'dark'
                      ? 'bg-slate-800/40 border-slate-700 text-slate-300 hover:bg-slate-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${receiptSourceType === 'supplier' ? 'bg-white animate-pulse' : 'bg-emerald-500'}`} />
                <div>
                  <div className="font-extrabold">{isRtl ? 'إضافة من مورد' : 'Receipt from Supplier'}</div>
                  <div className={`text-[10px] mt-0.5 ${receiptSourceType === 'supplier' ? 'text-emerald-100' : 'text-slate-400'}`}>
                    {isRtl ? 'استلام منتجات وشحنات واردة من مورد خارجي' : 'Products received from external vendor'}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setReceiptSourceType('transfer');
                  setDestEntityId('');
                  setReceiptTransferEntityId('');
                  setSelectedShipmentRef('');
                }}
                className={`flex-1 w-full px-4 py-3 rounded-xl font-bold text-xs border transition-all cursor-pointer flex items-center justify-center gap-2 text-right ${
                  receiptSourceType === 'transfer'
                    ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                    : theme === 'dark'
                      ? 'bg-slate-800/40 border-slate-700 text-slate-300 hover:bg-slate-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${receiptSourceType === 'transfer' ? 'bg-white animate-pulse' : 'bg-blue-500'}`} />
                <div>
                  <div className="font-extrabold">{isRtl ? 'إضافة بالتحويل' : 'Receipt from Transfer'}</div>
                  <div className={`text-[10px] mt-0.5 ${receiptSourceType === 'transfer' ? 'text-blue-100' : 'text-slate-400'}`}>
                    {isRtl ? 'استلام منتجات محولة من فروع أو مخازن أخرى بالشركة' : 'Products transferred from internal branches/warehouses'}
                  </div>
                </div>
              </button>
            </div>

            {/* Shipment Selection List for Transfer Receipts */}
            {receiptSourceType === 'transfer' && (
              <div className="p-4 rounded-xl border bg-slate-50/80 dark:bg-slate-800/40 border-blue-500/30 space-y-3 mt-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                    <Truck size={14} />
                    <span>{isRtl ? 'اختر شحنة التحويل الواردة للفرع (استلام أوتوماتيكي بدون كتابة):' : 'Select Incoming Transfer Shipment:'}</span>
                  </span>
                  <span className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2.5 py-0.5 rounded-full font-bold">
                    {availableTransferShipments.length} {isRtl ? 'شحنات صادرة للفرع' : 'Shipments'}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2.5 max-h-60 overflow-y-auto pr-1">
                  {availableTransferShipments.map(trf => {
                    const isSelected = selectedShipmentRef === trf.doc_no;
                    const srcWarehouse = warehouses.find(w => w.id === trf.source_warehouse_id);
                    const itemsSummary = trf.items.map(i => `${i.product_name || products.find(p => p.id === i.product_id)?.name || i.product_id}: ${i.qty}`).join(' | ');

                    return (
                      <div 
                        key={trf.id}
                        onClick={() => handleSelectTransfer(trf)}
                        className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-right ${
                          isSelected 
                            ? 'bg-blue-600/10 border-blue-500 text-blue-600 dark:text-blue-300 ring-2 ring-blue-500/20' 
                            : theme === 'dark' 
                              ? 'bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-800' 
                              : 'bg-white border-slate-200 text-slate-800 hover:bg-blue-50/50'
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-blue-600 text-white rounded-md text-[10px] font-mono font-bold">
                              {trf.doc_no}
                            </span>
                            <span className="font-bold text-xs truncate">
                              {isRtl ? `من: ${srcWarehouse?.name || 'المخزن الرئيسي'}` : `From: ${srcWarehouse?.name || 'Main Warehouse'}`}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">({trf.date})</span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                            <Package size={12} className="shrink-0 text-blue-500" />
                            <span><strong className="text-slate-700 dark:text-slate-300">{isRtl ? 'النوع والعدد:' : 'Items & Qty:'}</strong> {itemsSummary}</span>
                          </div>
                          {trf.recipient && (
                            <div className="text-[10px] text-slate-400">
                              {isRtl ? `الناقل/السائق: ${trf.recipient}` : `Driver: ${trf.recipient}`}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectTransfer(trf);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 flex items-center gap-1 transition-all ${
                            isSelected 
                              ? 'bg-blue-600 text-white shadow-sm' 
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-blue-600 hover:text-white'
                          }`}
                        >
                          <PackageCheck size={13} />
                          <span>{isSelected ? (isRtl ? 'مختارة' : 'Selected') : (isRtl ? 'استلام الشحنة' : 'Receive')}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Shipment Selection List with Search for Supplier Receipts */}
            {receiptSourceType === 'supplier' && (
              <div className="p-4 rounded-xl border bg-slate-50/80 dark:bg-slate-800/40 border-emerald-500/30 space-y-3 mt-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <PackageCheck size={14} />
                    <span>{isRtl ? 'اختر أمر الشراء (PO) أو ابحث برقم الـ PO لاستلام الشحنة أوتوماتيكياً:' : 'Select or Search Purchase Order (PO) to Receive:'}</span>
                  </span>
                  
                  {/* Search Input for PO */}
                  <div className="relative flex items-center min-w-[220px]">
                    <Search size={13} className="absolute right-3 text-slate-400" />
                    <input
                      type="text"
                      value={poSearchQuery}
                      onChange={(e) => setPoSearchQuery(e.target.value)}
                      placeholder={isRtl ? 'ابحث برقم الـ PO أو المورد...' : 'Search PO # or vendor...'}
                      className={`w-full pr-8 pl-3 py-1.5 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                        theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                      }`}
                    />
                    {poSearchQuery && (
                      <button 
                        type="button" 
                        onClick={() => setPoSearchQuery('')}
                        className="absolute left-2 text-slate-400 hover:text-slate-600"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5 max-h-60 overflow-y-auto pr-1">
                  {filteredPurchaseOrders.length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-400">
                      {isRtl ? 'لا توجد أذونات/أوامر شراء مطابقة للبحث' : 'No matching purchase orders found'}
                    </div>
                  ) : (
                    filteredPurchaseOrders.map(po => {
                      const isSelected = selectedShipmentRef === po.poNumber;
                      const itemsSummary = po.items.map(i => `${i.productName}: ${i.qty} ${i.unit}`).join(' | ');

                      return (
                        <div 
                          key={po.id}
                          onClick={() => handleSelectPO(po)}
                          className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-right ${
                            isSelected 
                              ? 'bg-emerald-600/10 border-emerald-500 text-emerald-600 dark:text-emerald-300 ring-2 ring-emerald-500/20' 
                              : theme === 'dark' 
                                ? 'bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-800' 
                                : 'bg-white border-slate-200 text-slate-800 hover:bg-emerald-50/50'
                          }`}
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-md text-[10px] font-mono font-bold">
                                {po.poNumber}
                              </span>
                              <span className="font-bold text-xs truncate text-emerald-700 dark:text-emerald-400">
                                {po.vendorName}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">({po.date})</span>
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                              <Package size={12} className="shrink-0 text-emerald-500" />
                              <span><strong className="text-slate-700 dark:text-slate-300">{isRtl ? 'النوع والعدد:' : 'Type & Qty:'}</strong> {itemsSummary}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {isRtl ? `إجمالي القيمة: ${po.totalAmount.toLocaleString()} ج.م` : `Total: $${po.totalAmount.toLocaleString()}`}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectPO(po);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 flex items-center gap-1 transition-all ${
                              isSelected 
                                ? 'bg-emerald-600 text-white shadow-sm' 
                                : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-emerald-600 hover:text-white'
                            }`}
                          >
                            <PackageCheck size={13} />
                            <span>{isSelected ? (isRtl ? 'مختارة' : 'Selected') : (isRtl ? 'استلام الشحنة' : 'Receive PO')}</span>
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Auto-filled Confirmation Banner */}
            {selectedShipmentRef && (
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300 font-bold animate-fade-in mt-3">
                <div className="flex items-center gap-2">
                  <Check size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    {isRtl 
                      ? `تم اختيار الشحنة/أمر الشراء [${selectedShipmentRef}] بنجاح - تم استيراد الأصناف والكميات والبيانات تلقائياً دون حاجة لإدخال يدوي.` 
                      : `Shipment [${selectedShipmentRef}] selected successfully - All items, quantities, and details prefilled.`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedShipmentRef('');
                    setItems([]);
                  }}
                  className="text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 text-[11px] underline shrink-0 mr-2"
                >
                  {isRtl ? 'إلغاء الاختيار' : 'Clear'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Dynamic target selection block depending on docType */}
        {destEntityType !== 'adjustment' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {destEntityType !== 'scrap' ? (
              <>
                {/* Searchable dropdown for destination/entity */}
                <div className="w-full">
                  <SearchableDropdown
                    label={
                      docType === 'Receipt' ? (
                        receiptSourceType === 'transfer'
                          ? (isRtl ? 'إضافة بالتحويل (المستند/الفرع المحول منه)' : 'Source Warehouse/Branch')
                          : (isRtl ? 'إضافة من مورد (المورد المورد)' : 'External Supplier')
                      ) : destEntityType === 'warehouse' ? (isRtl ? 'المخزن المستلم' : 'Destination Warehouse') :
                      destEntityType === 'branch' ? (isRtl ? 'الفرع المستلم' : 'Target Branch') :
                      destEntityType === 'station' ? (isRtl ? 'المحطة المستلمة' : 'Target Station') :
                      isRtl ? 'المورد المستهدف' : 'Supplier Target'
                    }
                    placeholder={isRtl ? 'اختر الجهة...' : 'Select entity...'}
                    value={docType === 'Receipt' && receiptSourceType === 'transfer' ? receiptTransferEntityId : destEntityId}
                    list={destEntityList}
                    onSelect={(id) => {
                      if (docType === 'Receipt' && receiptSourceType === 'transfer') {
                        setReceiptTransferEntityId(id);
                      } else {
                        setDestEntityId(id);
                      }
                    }}
                    error={docType === 'Receipt' && receiptSourceType === 'transfer' ? errors.receiptTransferEntityId : errors.destEntityId}
                    typeKey="dest"
                    theme={theme}
                    isRtl={isRtl}
                    activeDropdown={activeDropdown}
                    setActiveDropdown={setActiveDropdown}
                  />
                </div>

                {/* Recipient / Driver / Supervisor */}
                <div className="w-full">
                  <label className={`block text-xs font-bold mb-1.5 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                    {isRtl ? 'المستلم أو الناقل المسئول' : 'Recipient / Driver'}
                  </label>
                  <div className="relative flex items-center">
                    <User size={14} className="absolute right-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder={isRtl ? 'اسم المستلم ثلاثياً، رقم السيارة، إلخ...' : 'Recipient full name or vehicle license...'}
                      className={`w-full pr-10 pl-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                        theme === 'dark' ? 'bg-[#1e293b] border-[#334155] text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                      } ${errors.recipient ? 'border-rose-500' : ''}`}
                    />
                  </div>
                  {errors.recipient && <p className="text-[10px] text-rose-500 font-semibold mt-1 flex items-center gap-1"><AlertCircle size={10} />{errors.recipient}</p>}
                </div>
              </>
            ) : (
              /* If scrap: only show recipient with customized label */
              <div className="w-full col-span-2">
                <label className={`block text-xs font-bold mb-1.5 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
                  {scrapAction === 'OUT' 
                    ? (isRtl ? 'الجهة المستلمة / المشتري للخردة' : 'Buyer / Scrap Recipient')
                    : (isRtl ? 'المشرف المسؤول عن التكهين' : 'Responsible Supervisor / Technician')}
                </label>
                <div className="relative flex items-center">
                  <User size={14} className="absolute right-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder={
                      scrapAction === 'OUT'
                        ? (isRtl ? 'اسم المشتري، رقم السيارة، شركة إعادة التدوير...' : 'Buyer name, vehicle license, recycling company...')
                        : (isRtl ? 'اسم رئيس لجنة التكهين أو الفني المسؤول...' : 'Commission head name, technician...')
                    }
                    className={`w-full pr-10 pl-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                      theme === 'dark' ? 'bg-[#1e293b] border-[#334155] text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                    } ${errors.recipient ? 'border-rose-500' : ''}`}
                  />
                </div>
                {errors.recipient && <p className="text-[10px] text-rose-500 font-semibold mt-1 flex items-center gap-1"><AlertCircle size={10} />{errors.recipient}</p>}
              </div>
            )}
          </div>
        )}

        {/* Statement & Reason for transaction */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Reason (سبب الحركة) */}
          <div className="w-full">
            <label className={`block text-xs font-bold mb-1.5 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
              {isRtl ? 'سبب الحركة المخزنية' : 'Stock Movement Reason'}
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isRtl ? 'مثال: توريد كميات سنوية، طلبية طوارئ، تالف تعويضات...' : 'e.g. Emergency replenishment, regular supply...'}
              className={`w-full px-3.5 py-2 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                theme === 'dark' ? 'bg-[#1e293b] border-[#334155] text-slate-100' : 'bg-white border-slate-200 text-slate-800'
              } ${errors.reason ? 'border-rose-500' : ''}`}
            />
            {errors.reason && <p className="text-[10px] text-rose-500 font-semibold mt-1 flex items-center gap-1"><AlertCircle size={10} />{errors.reason}</p>}
          </div>

          {/* Statement (البيان) */}
          <div className="w-full">
            <label className={`block text-xs font-bold mb-1.5 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
              {isRtl ? 'البيان الإجمالي (الشرح العام)' : 'General Statement / Memo'}
            </label>
            <input
              type="text"
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder={isRtl ? 'مثال: صرف وتوريد قطع غيار عهدة المحطات الشرقية...' : 'General memo for the entire document...'}
              className={`w-full px-3.5 py-2 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                theme === 'dark' ? 'bg-[#1e293b] border-[#334155] text-slate-100' : 'bg-white border-slate-200 text-slate-800'
              } ${errors.statement ? 'border-rose-500' : ''}`}
            />
            {errors.statement && <p className="text-[10px] text-rose-500 font-semibold mt-1 flex items-center gap-1"><AlertCircle size={10} />{errors.statement}</p>}
          </div>
        </div>

        {/* Dynamic Items Grid (جدول الأصناف المرفقة) */}
        <div className="mb-8 overflow-hidden rounded-2xl border border-slate-200/50 dark:border-slate-800">
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200/50 dark:border-slate-800 flex items-center justify-between">
            <h4 className="text-xs font-bold flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <Activity size={14} />
              <span>{isRtl ? 'الأصناف وحركة الكميات المرفقة' : 'Document Items & Quantities'}</span>
            </h4>
            <button
              type="button"
              onClick={handleAddItemRow}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <Plus size={12} />
              <span>{isRtl ? 'إضافة صنف' : 'Add Item'}</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className={`text-[11px] font-bold border-b ${
                  theme === 'dark' ? 'bg-slate-800/30 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'
                }`}>
                  <th className="p-3 w-10 text-center">#</th>
                  <th className="p-3 min-w-[200px]">{isRtl ? 'الصنف المستهدف' : 'Product / Item'}</th>
                  <th className="p-3 w-28">{isRtl ? 'الوحدة' : 'Unit'}</th>
                  <th className="p-3 w-28 text-center">{isRtl ? 'الرصيد المتاح' : 'Available Stock'}</th>
                  <th className="p-3 w-28">{isRtl ? 'الكمية المطلوبة' : 'Quantity'}</th>
                  <th className="p-3 w-32">{isRtl ? 'رقم الباتش / التشغيلة' : 'Batch No.'}</th>
                  <th className="p-3 w-36">{isRtl ? 'تاريخ الصلاحية' : 'Expiry Date'}</th>
                  {(docType === 'Receipt' || docType === 'Addition') && <th className="p-3 w-32">{isRtl ? 'سعر الشراء (ج.م)' : 'Purchase Price'}</th>}
                  <th className="p-3 min-w-[150px]">{isRtl ? 'ملاحظات الصنف' : 'Item Notes'}</th>
                  <th className="p-3 w-24 text-center">{isRtl ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {items.map((item, idx) => {
                  const selectedProd = products.find(p => p.id === item.product_id);
                  const currentStock = sourceWarehouseId && item.product_id 
                    ? InventoryModule.getProductStock(item.product_id, sourceWarehouseId)
                    : 0;

                  return (
                    <React.Fragment key={idx}>
                      <tr 
                        className={`text-xs hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all ${
                          errors[`item_product_${idx}`] || errors[`item_qty_${idx}`] ? 'bg-rose-500/5' : ''
                        }`}
                      >
                        {/* Row Index */}
                        <td className="p-3 text-center font-mono text-slate-400 font-bold">{idx + 1}</td>

                        {/* Product Smart Searchable Dropdown */}
                        <td className="p-2 relative">
                          <SearchableDropdown
                            label=""
                            placeholder={isRtl ? '-- اختر الصنف --' : '-- Select Product --'}
                            value={item.product_id}
                            list={products.map(p => ({
                              id: p.id,
                              name: p.name,
                              code: p.code,
                              subText: (p.barcode ? `Barcode: ${p.barcode}` : '') + ` | Min: ${p.min_stock}`
                            }))}
                            onSelect={(id) => handleUpdateItemValue(idx, 'product_id', id)}
                            error={errors[`item_product_${idx}`]}
                            typeKey={idx}
                            theme={theme}
                            isRtl={isRtl}
                            activeDropdown={activeDropdown}
                            setActiveDropdown={setActiveDropdown}
                          />
                        </td>

                        {/* Unit (Automatic) */}
                        <td className="p-3 font-medium text-slate-500 dark:text-slate-400">
                          {selectedProd ? selectedProd.unit : <span className="italic text-slate-400">---</span>}
                        </td>

                        {/* Available Balance (Calculated) */}
                        <td className="p-3 text-center font-mono font-bold text-slate-600 dark:text-slate-400">
                          {item.product_id ? (
                            <span className={`px-2 py-0.5 rounded ${
                              currentStock < (selectedProd?.min_stock || 0)
                                ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                            }`}>
                              {currentStock}
                            </span>
                          ) : (
                            <span className="italic text-slate-400">---</span>
                          )}
                        </td>

                        {/* Quantity */}
                        <td className="p-2">
                          <input
                            type="number"
                            value={item.qty}
                            onChange={(e) => handleUpdateItemValue(idx, 'qty', parseFloat(e.target.value) || 0)}
                            className={`w-full px-2.5 py-1.5 rounded-lg border text-xs text-center font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                              theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                            } ${errors[`item_qty_${idx}`] ? 'border-rose-500 ring-2 ring-rose-500/10' : ''}`}
                          />
                          {errors[`item_qty_${idx}`] && <p className="text-[9px] text-rose-500 font-bold mt-1 text-center">{errors[`item_qty_${idx}`]}</p>}
                        </td>

                        {/* Batch Number */}
                        <td className="p-2 min-w-[180px]">
                          {docType === 'Receipt' ? (
                            <input
                              type="text"
                              value={item.batch_no || ''}
                              onChange={(e) => handleUpdateItemValue(idx, 'batch_no', e.target.value)}
                              placeholder={isRtl ? 'رقم الباتش...' : 'Batch #...'}
                              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                                theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                              }`}
                            />
                          ) : (
                            (() => {
                              const availableBatches = item.product_id && sourceWarehouseId 
                                ? InventoryModule.getProductBatches(item.product_id, sourceWarehouseId) 
                                : [];

                              if (!item.product_id || !sourceWarehouseId) {
                                return (
                                  <span className="text-slate-400 italic text-[11px] block text-center">
                                    {isRtl ? 'اختر الصنف والمخزن' : 'Select product & store'}
                                  </span>
                                );
                              }

                              if (availableBatches.length === 0) {
                                return (
                                  <div className="space-y-1">
                                    <input
                                      type="text"
                                      value={item.batch_no || ''}
                                      onChange={(e) => handleUpdateItemValue(idx, 'batch_no', e.target.value)}
                                      placeholder={isRtl ? 'عام / بدون باتش' : 'General Stock'}
                                      className={`w-full px-2 py-1 rounded-lg border text-xs font-mono focus:outline-none ${
                                        theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-600'
                                      }`}
                                    />
                                    <span className="text-[9px] font-semibold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 block text-center">
                                      {isRtl ? 'لا توجد باتشات مقيدة' : 'No batch logged'}
                                    </span>
                                  </div>
                                );
                              }

                              const currentValKey = `${item.batch_no || ''}___${item.expiry_date || ''}`;

                              return (
                                <div className="space-y-1">
                                  <select
                                    value={currentValKey}
                                    onChange={(e) => {
                                      const [bNo, expDate] = e.target.value.split('___');
                                      const updated = [...items];
                                      updated[idx] = {
                                        ...updated[idx],
                                        batch_no: bNo,
                                        expiry_date: expDate || ''
                                      };
                                      setItems(updated);
                                    }}
                                    className={`w-full px-2 py-1.5 rounded-lg border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                                    }`}
                                  >
                                    {availableBatches.map((b, bIdx) => {
                                      const optionValKey = `${b.batch_no}___${b.expiry_date || ''}`;
                                      return (
                                        <option key={`${b.batch_no}-${b.expiry_date}-${bIdx}`} value={optionValKey}>
                                          {bIdx === 0 ? (isRtl ? '⭐ [الأقدم صلاحية FEFO] ' : '⭐ [FEFO Oldest] ') : ''}
                                          {b.batch_no} | {b.expiry_date ? (isRtl ? `انتهاء: ${b.expiry_date}` : `Exp: ${b.expiry_date}`) : (isRtl ? 'بدون تاريخ' : 'No Exp')} | {isRtl ? `المتاح: ${b.available_qty}` : `Stock: ${b.available_qty}`}
                                        </option>
                                      );
                                    })}
                                  </select>

                                  <div className="flex items-center justify-between text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 px-1">
                                    <span className="flex items-center gap-0.5">
                                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse inline-block"></span>
                                      {isRtl ? 'مرتبة FEFO (الأقدم صلاحية أولاً)' : 'FEFO Sorted (Oldest First)'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })()
                          )}
                        </td>

                        {/* Expiry Date */}
                        <td className="p-2 min-w-[130px]">
                          {docType === 'Receipt' ? (
                            <input
                              type="date"
                              value={item.expiry_date || ''}
                              onChange={(e) => handleUpdateItemValue(idx, 'expiry_date', e.target.value)}
                              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                                theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                              }`}
                            />
                          ) : (
                            <div className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono text-center font-bold ${
                              item.expiry_date
                                ? theme === 'dark' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
                                : theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-500'
                            }`}>
                              {item.expiry_date || (isRtl ? 'غير محدد' : 'N/A')}
                            </div>
                          )}
                        </td>

                        {/* Last Purchase Price (for Receipt or Addition) */}
                        {(docType === 'Receipt' || docType === 'Addition') && (
                          <td className="p-2">
                            <input
                              type="number"
                              value={item.last_purchase_price || 0}
                              onChange={(e) => handleUpdateItemValue(idx, 'last_purchase_price', parseFloat(e.target.value) || 0)}
                              className={`w-full px-2.5 py-1.5 rounded-lg border text-xs text-center font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                                theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                              }`}
                            />
                          </td>
                        )}

                        {/* Notes */}
                        <td className="p-2">
                          <input
                            type="text"
                            value={item.notes || ''}
                            onChange={(e) => handleUpdateItemValue(idx, 'notes', e.target.value)}
                            placeholder={isRtl ? 'مواصفات إضافية...' : 'Item specifications...'}
                            className={`w-full px-2.5 py-1.5 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                              theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                            }`}
                          />
                        </td>

                        {/* Actions */}
                        <td className="p-2 text-center flex items-center justify-center gap-1">
                          {activeBins.length > 0 && item.product_id && (
                            <button
                              type="button"
                              onClick={() => setOpenBinIdx(openBinIdx === idx ? null : idx)}
                              className={`p-1.5 rounded transition-all cursor-pointer ${
                                openBinIdx === idx 
                                  ? 'bg-emerald-600 text-white shadow-sm' 
                                  : 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-600 hover:text-white'
                              }`}
                              title={isRtl ? 'توزيع الحاويات' : 'Configure Bins'}
                            >
                              <Layers size={12} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDuplicateItemRow(idx)}
                            className="p-1.5 rounded bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white transition-all cursor-pointer"
                            title={isRtl ? 'تكرار الصف' : 'Duplicate Row'}
                          >
                            <Copy size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteItemRow(idx)}
                            className="p-1.5 rounded bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all cursor-pointer"
                            title={isRtl ? 'حذف الصف' : 'Delete Row'}
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>

                      {/* Bin Allocation Sub-Row */}
                      {openBinIdx === idx && activeBins.length > 0 && item.product_id && (
                        <tr className="bg-slate-500/5 dark:bg-slate-800/10">
                          <td colSpan={(docType === 'Receipt' || docType === 'Addition') ? 8 : 7} className="p-4 border-t border-slate-100 dark:border-slate-800">
                            <div className="max-w-2xl mx-auto space-y-4">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                  {isRtl ? `توزيع صنف (${selectedProd?.name}) على حاويات المستودع` : `Distribute item (${selectedProd?.name}) across bins`}
                                </span>
                                <span className="text-xs font-medium font-mono text-slate-500">
                                  {isRtl 
                                    ? `الكمية الإجمالية: ${item.qty} | المخصصة: ${item.bin_allocations?.reduce((sum, a) => sum + a.qty, 0) || 0}` 
                                    : `Total Qty: ${item.qty} | Allocated: ${item.bin_allocations?.reduce((sum, a) => sum + a.qty, 0) || 0}`}
                                </span>
                              </div>
                              
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {activeBins.map((bin) => {
                                  const currentAlloc = item.bin_allocations?.find(a => a.bin_id === bin.id)?.qty || 0;
                                  const currentBinStock = InventoryModule.getBinTotalStock(bin.id);
                                  const productBinStock = item.product_id ? InventoryModule.getBinProductStock(item.product_id, bin.id) : 0;
                                  return (
                                    <div key={bin.id} className={`p-3 rounded-xl border text-xs flex flex-col justify-between gap-2 transition-all ${
                                      currentAlloc > 0 
                                        ? 'border-emerald-500/50 bg-emerald-500/5' 
                                        : (theme === 'dark' ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-white')
                                    }`}>
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <p className="font-bold text-slate-700 dark:text-slate-300">{bin.name} ({bin.code})</p>
                                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                            {isRtl 
                                              ? `الرصيد الكلي: ${currentBinStock} / ${bin.max_capacity_qty || '∞'} | رصيد الصنف: ${productBinStock}` 
                                              : `Total Stock: ${currentBinStock} / ${bin.max_capacity_qty || '∞'} | Product Stock: ${productBinStock}`}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[10px] text-slate-400 font-bold">{isRtl ? 'الكمية:' : 'Qty:'}</span>
                                        <input
                                          type="number"
                                          min="0"
                                          value={currentAlloc || ''}
                                          placeholder="0"
                                          onChange={(e) => {
                                            const val = parseFloat(e.target.value) || 0;
                                            let otherAllocations = (item.bin_allocations || []).filter(a => a.bin_id !== bin.id);
                                            if (val > 0) {
                                              otherAllocations.push({
                                                bin_id: bin.id,
                                                bin_code: bin.code,
                                                qty: val
                                              });
                                            }
                                            handleUpdateBinAllocations(idx, otherAllocations);
                                          }}
                                          className={`w-24 px-2 py-1 border rounded-lg font-mono text-center focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                                            theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                                          }`}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Notes & Comments */}
        <div className="grid grid-cols-1 gap-4 mb-8">
          <div>
            <label className={`block text-xs font-bold mb-1.5 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
              {isRtl ? 'ملاحظات المستند العامة' : 'General Document Notes'}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={isRtl ? 'اكتب أي ملاحظات أو توجيهات إدارية هنا...' : 'Write any other administrative comments or notes here...'}
              className={`w-full px-3.5 py-2 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                theme === 'dark' ? 'bg-[#1e293b] border-[#334155] text-slate-100' : 'bg-white border-slate-200 text-slate-800'
              }`}
            />
          </div>
        </div>

        {/* Print Signatures Block (مربعات توقيع المستند الورقي) */}
        <div className="border-t border-dashed border-slate-200 dark:border-slate-800 pt-6 mt-8">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center mb-6">
            {isRtl ? 'أختام وتوقيعات اعتماد المستند المخزني' : 'Document Authentication & Signatures'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            <div className={`p-4 rounded-2xl border border-dashed ${theme === 'dark' ? 'border-[#334155]' : 'border-slate-200'}`}>
              <p className="text-xs font-bold">{isRtl ? 'مُعد المستند (أمين المخزن)' : 'Document Creator (Storekeeper)'}</p>
              <div className="h-10 border-b border-slate-200 dark:border-slate-800 my-2"></div>
              <p className="text-[10px] text-slate-400 font-mono">
                {activeUser?.full_name} | {new Date().toLocaleDateString('en-US')}
              </p>
            </div>
            <div className={`p-4 rounded-2xl border border-dashed ${theme === 'dark' ? 'border-[#334155]' : 'border-slate-200'}`}>
              <p className="text-xs font-bold">{isRtl ? 'المستلم أو الناقل المعتمد' : 'Recipient / Delivery Agent'}</p>
              <div className="h-10 border-b border-slate-200 dark:border-slate-800 my-2"></div>
              <p className="text-[10px] text-slate-400 font-mono">
                {recipient ? recipient : <span className="italic">---</span>}
              </p>
            </div>
            <div className={`p-4 rounded-2xl border border-dashed ${theme === 'dark' ? 'border-[#334155]' : 'border-slate-200'}`}>
              <p className="text-xs font-bold">{isRtl ? 'الاعتماد النهائي (المدير المسؤول)' : 'Final Approval (Authorizing Manager)'}</p>
              <div className="h-10 border-b border-slate-200 dark:border-slate-800 my-2"></div>
              <p className="text-[10px] text-slate-400 font-mono">Enterprise Lifecycle Engine Sec</p>
            </div>
          </div>
        </div>
      </div>

      {/* Save / Cancel Controls */}
      <div className="flex items-center justify-end gap-3.5">
        <button
          type="button"
          onClick={onCancel}
          className={`px-5 py-2.5 rounded-2xl text-xs font-black transition-all cursor-pointer ${
            theme === 'dark' ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          {isRtl ? 'إلغاء والعودة' : 'Cancel & Back'}
        </button>
        <button
          type="submit"
          className="px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition-all shadow-lg shadow-emerald-600/10 active:scale-95 cursor-pointer"
        >
          {docId ? (isRtl ? 'حفظ التغييرات' : 'Save Changes') : (isRtl ? 'حفظ كمسودة' : 'Save Draft')}
        </button>
      </div>
    </form>
  );
}

// Standalone SearchableDropdown Component to maintain stable lifecycle & styling
interface SearchableDropdownProps {
  label: string;
  placeholder: string;
  value: string;
  list: DropdownItem[];
  onSelect: (id: string) => void;
  error?: string;
  typeKey: 'dest' | number;
  theme: 'light' | 'dark';
  isRtl: boolean;
  activeDropdown: { type: 'dest' | number; search: string } | null;
  setActiveDropdown: React.Dispatch<React.SetStateAction<{ type: 'dest' | number; search: string } | null>>;
}

function SearchableDropdown({
  label,
  placeholder,
  value,
  list,
  onSelect,
  error,
  typeKey,
  theme,
  isRtl,
  activeDropdown,
  setActiveDropdown
}: SearchableDropdownProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter list based on smart search query
  const filteredList = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return list;
    return list.filter(item => 
      item.name.toLowerCase().includes(query) ||
      item.code.toLowerCase().includes(query) ||
      (item.subText && item.subText.toLowerCase().includes(query))
    );
  }, [list, searchQuery]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setActiveDropdown]);

  const selectedItem = list.find(item => item.id === value);

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {label && (
        <label className={`block text-xs font-bold mb-1.5 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
          {label}
        </label>
      )}
      
      <button
        type="button"
        onClick={() => setActiveDropdown(activeDropdown?.type === typeKey ? null : { type: typeKey, search: '' })}
        className={`flex w-full items-center justify-between px-3.5 py-2 border rounded-xl text-xs font-medium text-right focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all ${
          theme === 'dark' 
            ? 'bg-[#1e293b] border-[#334155] text-slate-100 hover:bg-[#334155]/50' 
            : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50'
        } ${error ? 'border-rose-500 ring-2 ring-rose-500/10' : ''}`}
      >
        <span className="truncate">
          {selectedItem ? `${selectedItem.name} [${selectedItem.code}]` : placeholder}
        </span>
        <ChevronDown size={14} className="text-slate-400 shrink-0" />
      </button>

      {activeDropdown?.type === typeKey && (
        <div className={`absolute z-50 mt-1.5 w-full max-h-60 overflow-y-auto rounded-xl border p-2 shadow-xl ${
          theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200'
        }`}>
          <div className="relative flex items-center mb-2 px-1">
            <Search size={14} className="absolute right-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isRtl ? 'ابحث بالاسم أو الكود...' : 'Search by name or code...'}
              className={`w-full pr-8 pl-3 py-1.5 text-xs rounded-lg border focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'
              }`}
              autoFocus
            />
          </div>
          
          <div className="space-y-0.5">
            {filteredList.length === 0 ? (
              <div className="text-center py-4 text-xs text-slate-400">
                {isRtl ? 'لا توجد نتائج مطابقة' : 'No matching results'}
              </div>
            ) : (
              filteredList.map(item => {
                const isSelected = item.id === value;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelect(item.id);
                      setActiveDropdown(null);
                      setSearchQuery('');
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all text-right ${
                      isSelected 
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold' 
                        : theme === 'dark' 
                          ? 'text-slate-300 hover:bg-slate-800' 
                          : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold truncate">{item.name}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 rounded">
                          {item.code}
                        </span>
                        {item.subText && (
                          <span className="text-[10px] text-slate-400 truncate max-w-[150px]">
                            {item.subText}
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check size={14} className="text-emerald-500 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {error && <p className="text-[10px] text-rose-500 font-semibold mt-1 flex items-center gap-1"><AlertCircle size={10} />{error}</p>}
    </div>
  );
}

