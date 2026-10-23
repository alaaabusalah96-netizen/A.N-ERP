import React, { useState, useEffect } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { 
  Users, Plus, FileText, Check, X, ClipboardList, ShoppingCart, 
  Store, Phone, Mail, MapPin, Hash, ShieldAlert, ArrowLeftRight, Clock,
  Calendar, CheckCircle2, ChevronRight, CornerDownLeft, Printer,
  Sliders, Settings, DollarSign, Award, TrendingUp, Send, Layers, Eye,
  Building2, Search, ArrowUpRight, Scale, RefreshCw
} from 'lucide-react';
import { PurchasingBusinessEngine } from '../lib/enterprise/purchasing_engine';
import { InventoryModule } from '../db/inventory';
import { UsersModule } from '../db/users';
import { CompaniesModule } from '../db/companies';
import { OrganizationEngine } from '../db/organizationEngine';
import { CustodyDB } from '../db';
import { 
  PurchaseRequest, PurchaseOrder, Vendor, PRItem, POItem, 
  RFQ, VendorQuotation, PurchasingWorkflowConfig, VendorAPStatementItem 
} from '../types/purchasing';
import { Product, Warehouse } from '../types/inventory';
import { OrganizationUnit } from '../types/organization';
import { createEventEnvelope } from '../lib/enterprise/metadata';
import ApprovalWorkflowManager from '../components/ApprovalWorkflowManager';
import WarehouseTreeSelect from '../components/WarehouseTreeSelect';
import OrgUnitTreeSelect from '../components/OrgUnitTreeSelect';
import PurchasingVendorsTab from '../components/purchasing/PurchasingVendorsTab';
import PurchasingRequestsTab from '../components/purchasing/PurchasingRequestsTab';
import PurchasingRfqsTab from '../components/purchasing/PurchasingRfqsTab';
import PurchasingOrdersTab from '../components/purchasing/PurchasingOrdersTab';
import PurchasingConfigTab from '../components/purchasing/PurchasingConfigTab';

interface PurchasingProps {
  language: 'ar' | 'en';
  theme: 'light' | 'dark';
}

export default function Purchasing({ language, theme }: PurchasingProps) {
  const isRtl = language === 'ar';
  const activeUser = UsersModule.getActiveUser();
  const companyId = CompaniesModule.getSelectedCompanyId();

  // Active Tab: 'requests' | 'rfq' | 'orders' | 'vendors' | 'config'
  const [activeTab, setActiveTab] = useState<'requests' | 'rfq' | 'orders' | 'vendors' | 'config'>('requests');

  // Loaded Data
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [quotations, setQuotations] = useState<VendorQuotation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrganizationUnit[]>([]);
  const [workflowConfig, setWorkflowConfig] = useState<PurchasingWorkflowConfig>(
    PurchasingBusinessEngine.getWorkflowConfig(companyId)
  );

  // Modals & Forms State
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [showCreatePR, setShowCreatePR] = useState(false);
  const [showCreateRFQ, setShowCreateRFQ] = useState(false);
  const [showSubmitQuote, setShowSubmitQuote] = useState<RFQ | null>(null);
  const [showDirectPO, setShowDirectPO] = useState(false);
  const [showReceivePO, setShowReceivePO] = useState<string | null>(null);
  const [selectedVendorForStatement, setSelectedVendorForStatement] = useState<Vendor | null>(null);

  // Vendor Form
  const [vendorForm, setVendorForm] = useState({
    nameAr: '', nameEn: '', phone: '', email: '', taxNo: '', address: ''
  });

  // PR Form
  const [prNotes, setPrNotes] = useState('');
  const [prDepartment, setPrDepartment] = useState('');
  const [prOrgUnitId, setPrOrgUnitId] = useState<string>('');
  const [prItems, setPrItems] = useState<PRItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);
  const [selectedEstPrice, setSelectedEstPrice] = useState(0);

  // RFQ Form
  const [rfqSourcePrId, setRfqSourcePrId] = useState('');
  const [rfqDeadline, setRfqDeadline] = useState('');
  const [rfqSelectedVendors, setRfqSelectedVendors] = useState<string[]>([]);
  const [rfqNotes, setRfqNotes] = useState('');

  // Quote Form
  const [quoteNumber, setQuoteNumber] = useState('');
  const [quoteDeliveryDays, setQuoteDeliveryDays] = useState(7);
  const [quotePaymentTerms, setQuotePaymentTerms] = useState('Net 30 Days');
  const [quoteItems, setQuoteItems] = useState<{ productId: string; productCode: string; productName: string; unit: string; qty: number; unitPrice: number }[]>([]);

  // Direct PO Form
  const [directPoVendorId, setDirectPoVendorId] = useState('');
  const [directPoOrgUnitId, setDirectPoOrgUnitId] = useState<string>('');
  const [directPoNotes, setDirectPoNotes] = useState('');
  const [directPoItems, setDirectPoItems] = useState<POItem[]>([]);

  // PO Receiving Warehouse
  const [receiveWarehouseId, setReceiveWarehouseId] = useState('');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOrgUnitId, setFilterOrgUnitId] = useState<string>('');

  // Printing State
  const [printPR, setPrintPR] = useState<PurchaseRequest | null>(null);
  const [printPO, setPrintPO] = useState<PurchaseOrder | null>(null);

  // Feedback toast
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadAllData = () => {
    const v = PurchasingBusinessEngine.getVendors(companyId);
    const pr = PurchasingBusinessEngine.getPurchaseRequests(companyId);
    const po = PurchasingBusinessEngine.getPurchaseOrders(companyId);
    const r = PurchasingBusinessEngine.getRFQs(companyId);
    const q = PurchasingBusinessEngine.getQuotations(companyId);
    const prd = InventoryModule.getProducts();
    const wh = InventoryModule.getWarehouses();
    const units = OrganizationEngine.getUnits(companyId);
    const cfg = PurchasingBusinessEngine.getWorkflowConfig(companyId);

    setVendors(v);
    setRequests(pr);
    setOrders(po);
    setRfqs(r);
    setQuotations(q);
    setProducts(prd);
    setWarehouses(wh);
    setOrgUnits(units);
    setWorkflowConfig(cfg);

    if (wh.length > 0 && !receiveWarehouseId) {
      setReceiveWarehouseId(wh[0].id);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [companyId]);

  const triggerFeedback = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  // 1. Add Vendor
  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorForm.nameAr || !vendorForm.nameEn) {
      triggerFeedback('error', isRtl ? 'يرجى إدخال اسم المورد باللغتين' : 'Please input vendor name in both languages');
      return;
    }

    const res = await PurchasingBusinessEngine.addVendor(
      companyId,
      vendorForm.nameAr,
      vendorForm.nameEn,
      vendorForm.phone,
      vendorForm.email,
      vendorForm.taxNo,
      vendorForm.address
    );

    if (!res.success) {
      triggerFeedback('error', isRtl ? (res.error || 'فشل حفظ المورد') : (res.error || 'Failed to save vendor'));
      return;
    }

    triggerFeedback('success', isRtl ? 'تم تسجيل المورد بنجاح' : 'Vendor registered successfully');
    setVendorForm({ nameAr: '', nameEn: '', phone: '', email: '', taxNo: '', address: '' });
    setShowAddVendor(false);
    loadAllData();
  };

  // 2. Add PR Item
  const handleAddPRItem = () => {
    if (!selectedProductId) return;
    const prod = products.find(p => p.id === selectedProductId);
    if (!prod) return;

    if (prItems.some(item => item.productId === selectedProductId)) {
      triggerFeedback('error', isRtl ? 'هذا المنتج مضاف بالفعل' : 'Product already added');
      return;
    }

    const newItem: PRItem = {
      productId: prod.id,
      productCode: prod.code,
      productName: prod.name,
      unit: prod.unit,
      qty: selectedQty,
      estimatedPrice: selectedEstPrice || prod.last_purchase_price || 0
    };

    setPrItems([...prItems, newItem]);
    setSelectedProductId('');
    setSelectedQty(1);
    setSelectedEstPrice(0);
  };

  const handleRemovePRItem = (productId: string) => {
    setPrItems(prItems.filter(item => item.productId !== productId));
  };

  // 3. Create PR
  const handleCreatePR = async () => {
    if (prItems.length === 0) {
      triggerFeedback('error', isRtl ? 'يرجى إضافة صنف واحد على الأقل للطلب' : 'Please add at least one item');
      return;
    }

    const engine = new PurchasingBusinessEngine();
    const event = createEventEnvelope({
      eventType: 'PR_SUBMITTED',
      tenantId: companyId,
      userId: activeUser?.id || 'system',
      userName: activeUser?.full_name || 'System',
      userRole: activeUser?.role as any || 'System',
      payload: {
        requesterId: activeUser?.id || 'system',
        requesterName: activeUser?.full_name || 'System',
        department: prDepartment,
        org_unit_id: prOrgUnitId || undefined,
        items: prItems,
        notes: prNotes
      }
    });

    const result = await engine.processEvent(event);
    if (result.success) {
      triggerFeedback('success', isRtl ? result.messageAr : result.messageEn);
      setPrItems([]);
      setPrNotes('');
      setPrDepartment('');
      setPrOrgUnitId('');
      setShowCreatePR(false);
      loadAllData();
    } else {
      triggerFeedback('error', isRtl ? result.messageAr : result.messageEn);
    }
  };

  // 4. Approve / Reject PR
  const handleApprovePR = async (prId: string) => {
    const engine = new PurchasingBusinessEngine();
    const event = createEventEnvelope({
      eventType: 'PR_APPROVED',
      tenantId: companyId,
      userId: activeUser?.id || 'system',
      userName: activeUser?.full_name || 'System',
      userRole: activeUser?.role as any || 'System',
      payload: { prId }
    });

    const result = await engine.processEvent(event);
    if (result.success) {
      triggerFeedback('success', isRtl ? result.messageAr : result.messageEn);
      loadAllData();
    } else {
      triggerFeedback('error', isRtl ? result.messageAr : result.messageEn);
    }
  };

  const handleRejectPR = async (prId: string) => {
    const engine = new PurchasingBusinessEngine();
    const event = createEventEnvelope({
      eventType: 'PR_REJECTED',
      tenantId: companyId,
      userId: activeUser?.id || 'system',
      userName: activeUser?.full_name || 'System',
      userRole: activeUser?.role as any || 'System',
      payload: { prId }
    });

    const result = await engine.processEvent(event);
    if (result.success) {
      triggerFeedback('success', isRtl ? result.messageAr : result.messageEn);
      loadAllData();
    } else {
      triggerFeedback('error', isRtl ? result.messageAr : result.messageEn);
    }
  };

  // 5. Create RFQ
  const handleCreateRFQ = async () => {
    let itemsToUse: PRItem[] = prItems;

    if (rfqSourcePrId) {
      const sourcePr = requests.find(p => p.id === rfqSourcePrId);
      if (sourcePr) {
        itemsToUse = sourcePr.items;
      }
    }

    if (itemsToUse.length === 0) {
      triggerFeedback('error', isRtl ? 'يرجى اختيار طلب شراء مصدري أو إضافة بنود لطلب العرض' : 'Please select a source PR or add items');
      return;
    }

    if (rfqSelectedVendors.length === 0) {
      triggerFeedback('error', isRtl ? 'يرجى تحديد مورد واحد على الأقل لإرسال الطلب إليه' : 'Please select at least one vendor');
      return;
    }

    const engine = new PurchasingBusinessEngine();
    const event = createEventEnvelope({
      eventType: 'RFQ_CREATED',
      tenantId: companyId,
      userId: activeUser?.id || 'system',
      userName: activeUser?.full_name || 'System',
      userRole: activeUser?.role as any || 'System',
      payload: {
        prId: rfqSourcePrId || undefined,
        deadline: rfqDeadline || new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0],
        items: itemsToUse,
        vendorIds: rfqSelectedVendors,
        notes: rfqNotes
      }
    });

    const result = await engine.processEvent(event);
    if (result.success) {
      triggerFeedback('success', isRtl ? result.messageAr : result.messageEn);
      setShowCreateRFQ(false);
      setRfqSourcePrId('');
      setRfqSelectedVendors([]);
      setRfqNotes('');
      loadAllData();
    } else {
      triggerFeedback('error', isRtl ? result.messageAr : result.messageEn);
    }
  };

  // 6. Record Vendor Quotation
  const handleOpenSubmitQuote = (rfq: RFQ) => {
    setShowSubmitQuote(rfq);
    setQuoteItems(rfq.items.map(it => ({
      productId: it.productId,
      productCode: it.productCode,
      productName: it.productName,
      unit: it.unit,
      qty: it.qty,
      unitPrice: it.estimatedPrice
    })));
  };

  const handleSubmitVendorQuote = async (vendorId: string) => {
    if (!showSubmitQuote) return;

    const engine = new PurchasingBusinessEngine();
    const event = createEventEnvelope({
      eventType: 'QUOTATION_SUBMITTED',
      tenantId: companyId,
      userId: activeUser?.id || 'system',
      userName: activeUser?.full_name || 'System',
      userRole: activeUser?.role as any || 'System',
      payload: {
        rfqId: showSubmitQuote.id,
        vendorId,
        quoteNumber: quoteNumber.trim() || `QT-${Date.now().toString().substring(6)}`,
        items: quoteItems,
        deliveryDays: quoteDeliveryDays,
        paymentTerms: quotePaymentTerms,
        notes: ''
      }
    });

    const result = await engine.processEvent(event);
    if (result.success) {
      triggerFeedback('success', isRtl ? result.messageAr : result.messageEn);
      setShowSubmitQuote(null);
      setQuoteNumber('');
      loadAllData();
    } else {
      triggerFeedback('error', isRtl ? result.messageAr : result.messageEn);
    }
  };

  // 7. Accept Winning Quote
  const handleAcceptQuotation = async (quoteId: string) => {
    const engine = new PurchasingBusinessEngine();
    const event = createEventEnvelope({
      eventType: 'QUOTATION_ACCEPTED',
      tenantId: companyId,
      userId: activeUser?.id || 'system',
      userName: activeUser?.full_name || 'System',
      userRole: activeUser?.role as any || 'System',
      payload: { quoteId }
    });

    const result = await engine.processEvent(event);
    if (result.success) {
      triggerFeedback('success', isRtl ? result.messageAr : result.messageEn);
      setActiveTab('orders');
      loadAllData();
    } else {
      triggerFeedback('error', isRtl ? result.messageAr : result.messageEn);
    }
  };

  // 8. Convert PR to PO or Direct PO
  const handleConvertPRToPO = async (pr: PurchaseRequest) => {
    if (vendors.length === 0) {
      triggerFeedback('error', isRtl ? 'يرجى تسجيل مورد واحد على الأقل أولاً' : 'Please register at least one vendor first');
      return;
    }

    const defaultVendor = vendors[0];
    const engine = new PurchasingBusinessEngine();
    const event = createEventEnvelope({
      eventType: 'PO_ISSUED',
      tenantId: companyId,
      userId: activeUser?.id || 'system',
      userName: activeUser?.full_name || 'System',
      userRole: activeUser?.role as any || 'System',
      payload: {
        prId: pr.id,
        vendorId: defaultVendor.id,
        items: pr.items.map(it => ({
          productId: it.productId,
          productCode: it.productCode,
          productName: it.productName,
          unit: it.unit,
          qty: it.qty,
          unitPrice: it.estimatedPrice
        })),
        notes: `Issued automatically from PR ${pr.prNumber}.`,
        deliveryWarehouseId: warehouses[0]?.id
      }
    });

    const result = await engine.processEvent(event);
    if (result.success) {
      triggerFeedback('success', isRtl ? result.messageAr : result.messageEn);
      setActiveTab('orders');
      loadAllData();
    } else {
      triggerFeedback('error', isRtl ? result.messageAr : result.messageEn);
    }
  };

  // 9. Issue Direct PO
  const handleCreateDirectPO = async () => {
    if (!directPoVendorId) {
      triggerFeedback('error', isRtl ? 'يرجى اختيار المورد' : 'Please select vendor');
      return;
    }

    if (directPoItems.length === 0) {
      triggerFeedback('error', isRtl ? 'يرجى إضافة أصناف لأمر الشراء' : 'Please add items');
      return;
    }

    const engine = new PurchasingBusinessEngine();
    const event = createEventEnvelope({
      eventType: 'PO_ISSUED',
      tenantId: companyId,
      userId: activeUser?.id || 'system',
      userName: activeUser?.full_name || 'System',
      userRole: activeUser?.role as any || 'System',
      payload: {
        vendorId: directPoVendorId,
        org_unit_id: directPoOrgUnitId || undefined,
        items: directPoItems,
        notes: directPoNotes,
        deliveryWarehouseId: warehouses[0]?.id
      }
    });

    const result = await engine.processEvent(event);
    if (result.success) {
      triggerFeedback('success', isRtl ? result.messageAr : result.messageEn);
      setShowDirectPO(false);
      setDirectPoItems([]);
      setDirectPoNotes('');
      setDirectPoOrgUnitId('');
      loadAllData();
    } else {
      triggerFeedback('error', isRtl ? result.messageAr : result.messageEn);
    }
  };

  // 10. Receive PO Stock
  const handleReceivePO = async (poId: string) => {
    if (!receiveWarehouseId) {
      triggerFeedback('error', isRtl ? 'يرجى تحديد مستودع الاستلام' : 'Please select receiving warehouse');
      return;
    }

    const engine = new PurchasingBusinessEngine();
    const event = createEventEnvelope({
      eventType: 'PO_RECEIVED',
      tenantId: companyId,
      userId: activeUser?.id || 'system',
      userName: activeUser?.full_name || 'System',
      userRole: activeUser?.role as any || 'System',
      payload: {
        poId,
        warehouseId: receiveWarehouseId
      }
    });

    const result = await engine.processEvent(event);
    if (result.success) {
      triggerFeedback('success', isRtl ? result.messageAr : result.messageEn);
      setShowReceivePO(null);
      loadAllData();
    } else {
      triggerFeedback('error', isRtl ? result.messageAr : result.messageEn);
    }
  };

  // 11. Save Workflow Config
  const handleSaveWorkflowConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await PurchasingBusinessEngine.saveWorkflowConfig(workflowConfig);
    if (!res.success) {
      triggerFeedback('error', isRtl ? (res.error || 'فشل حفظ إعدادات المشتريات') : (res.error || 'Failed to save purchasing policies'));
      return;
    }
    triggerFeedback('success', isRtl ? 'تم حفظ إعدادات وسياسات المشتريات بنجاح' : 'Purchasing policies saved successfully');
  };

  // Compute AP Statement data for active selected vendor
  const selectedVendorStatementData = selectedVendorForStatement
    ? PurchasingBusinessEngine.getVendorAPStatement(companyId, selectedVendorForStatement.id)
    : null;

  return (
    <ErrorBoundary>
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto font-sans" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 shadow-2xl relative overflow-hidden border border-indigo-500/20">
        <div className="absolute right-0 bottom-0 opacity-10">
          <ShoppingCart className="h-64 w-64 translate-x-12 translate-y-12 text-indigo-400" />
        </div>
        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-xs font-bold">
            <ShoppingCart className="h-3.5 w-3.5" />
            {isRtl ? 'موديول المشتريات والتموين والربط المحاسبي' : 'Purchasing, Procurement & Ledger Integration'}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {isRtl ? 'إدارة التموين والمشتريات وحسابات الموردين' : 'Procurement & Vendor AP Management'}
          </h1>
          <p className="text-xs sm:text-sm text-indigo-100/80 max-w-2xl leading-relaxed">
            {isRtl 
              ? 'دورة مستندية متكاملة تشمل طلبات الشراء (PR)، عروض الأسعار والتثمين (RFQ)، أوامر التوريد (PO)، الاستلام المخزني الآلي، وكشوف حسابات الموردين مع التخصيص الكامل لسياسات الاعتماد.'
              : 'End-to-end procurement lifecycle covering PRs, RFQs, binding POs, automated inventory receipt, supplier AP ledgers, and zero-code workflow policy configuration.'}
          </p>
        </div>
      </div>

      {/* Alert Feedbacks */}
      {feedback && (
        <div className={`p-4 rounded-2xl border flex items-center gap-3 animate-fade-in ${
          feedback.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
            : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
        }`}>
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="text-xs font-bold">{feedback.text}</p>
        </div>
      )}

      {/* Nav Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-1 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('requests')}
          className={`px-5 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 rounded-t-xl ${
            activeTab === 'requests' 
              ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20' 
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <FileText className="h-4 w-4" />
          {isRtl ? 'طلبات الشراء (PR)' : 'Purchase Requests'}
          <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full text-[10px]">
            {requests.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('rfq')}
          className={`px-5 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 rounded-t-xl ${
            activeTab === 'rfq' 
              ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20' 
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Scale className="h-4 w-4" />
          {isRtl ? 'عروض الأسعار (RFQ)' : 'RFQs & Quotes'}
          <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full text-[10px]">
            {rfqs.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`px-5 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 rounded-t-xl ${
            activeTab === 'orders' 
              ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20' 
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <ShoppingCart className="h-4 w-4" />
          {isRtl ? 'أوامر التوريد (PO)' : 'Purchase Orders'}
          <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full text-[10px]">
            {orders.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('vendors')}
          className={`px-5 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 rounded-t-xl ${
            activeTab === 'vendors' 
              ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20' 
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Users className="h-4 w-4" />
          {isRtl ? 'الموردون وكشف الحساب' : 'Vendors & AP Ledger'}
          <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full text-[10px]">
            {vendors.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('config')}
          className={`px-5 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 rounded-t-xl ${
            activeTab === 'config' 
              ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20' 
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Sliders className="h-4 w-4" />
          {isRtl ? 'سياسات واعتمادات الشراء' : 'Workflow Matrix & Policy'}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: PURCHASE REQUESTS (PR) */}
      {/* ========================================================================= */}
      {activeTab === 'requests' && (
        <PurchasingRequestsTab
          isRtl={isRtl}
          requests={requests}
          orgUnits={orgUnits}
          setShowCreatePR={setShowCreatePR}
          setPrintPR={setPrintPR}
          handleRejectPR={handleRejectPR}
          handleApprovePR={handleApprovePR}
          setRfqSourcePrId={setRfqSourcePrId}
          setShowCreateRFQ={setShowCreateRFQ}
          setActiveTab={setActiveTab}
          handleConvertPRToPO={handleConvertPRToPO}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB 2: RFQ & QUOTATIONS */}
      {/* ========================================================================= */}
      {activeTab === 'rfq' && (
        <PurchasingRfqsTab
          isRtl={isRtl}
          rfqs={rfqs}
          quotations={quotations}
          setShowCreateRFQ={setShowCreateRFQ}
          handleOpenSubmitQuote={handleOpenSubmitQuote}
          handleAcceptQuotation={handleAcceptQuotation}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB 3: PURCHASE ORDERS (PO) */}
      {/* ========================================================================= */}
      {activeTab === 'orders' && (
        <PurchasingOrdersTab
          isRtl={isRtl}
          orders={orders}
          orgUnits={orgUnits}
          workflowConfig={workflowConfig}
          setShowDirectPO={setShowDirectPO}
          setPrintPO={setPrintPO}
          setShowReceivePO={setShowReceivePO}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB 4: VENDORS & AP STATEMENT */}
      {/* ========================================================================= */}
      {activeTab === 'vendors' && (
        <PurchasingVendorsTab
          isRtl={isRtl}
          companyId={companyId}
          vendors={vendors}
          setShowAddVendor={setShowAddVendor}
          setSelectedVendorForStatement={setSelectedVendorForStatement}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB 5: WORKFLOW MATRIX & CONFIGURATION */}
      {/* ========================================================================= */}
      {activeTab === 'config' && (
        <div className="space-y-8">
          <PurchasingConfigTab
            isRtl={isRtl}
            workflowConfig={workflowConfig}
            setWorkflowConfig={setWorkflowConfig}
            handleSaveWorkflowConfig={handleSaveWorkflowConfig}
          />

          <ApprovalWorkflowManager
            companyId={activeUser?.company_id || CustodyDB.getSelectedCompanyId() || ''}
            isRtl={isRtl}
            theme={theme}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* VENDOR AP STATEMENT MODAL */}
      {/* ========================================================================= */}
      {selectedVendorForStatement && selectedVendorStatementData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 rounded-xl">
                  <Building2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-lg text-slate-900 dark:text-slate-100">
                    {isRtl ? `كشف حساب المورد: ${selectedVendorForStatement.nameAr}` : `AP Statement: ${selectedVendorForStatement.nameEn}`}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    {selectedVendorForStatement.code} {selectedVendorForStatement.taxNo && `| Tax: ${selectedVendorForStatement.taxNo}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedVendorForStatement(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
                <span className="text-[11px] text-slate-500 block">{isRtl ? 'إجمالي قيم الشحنات' : 'Total Invoiced'}</span>
                <span className="text-base font-extrabold text-slate-800 dark:text-slate-100">{selectedVendorStatementData.totalInvoiced.toLocaleString()} EGP</span>
              </div>
              <div className="p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/20">
                <span className="text-[11px] text-emerald-600 block">{isRtl ? 'إجمالي السدادات' : 'Total Payments'}</span>
                <span className="text-base font-extrabold text-emerald-600">{selectedVendorStatementData.totalPaid.toLocaleString()} EGP</span>
              </div>
              <div className="p-3 bg-indigo-500/5 rounded-xl border border-indigo-500/20">
                <span className="text-[11px] text-indigo-600 block">{isRtl ? 'صافي المتبقي للمورد' : 'Net Payable Balance'}</span>
                <span className="text-base font-extrabold text-indigo-600">{selectedVendorStatementData.netBalance.toLocaleString()} EGP</span>
              </div>
            </div>

            {/* Ledger Table */}
            <div className="overflow-x-auto border rounded-2xl border-slate-200 dark:border-slate-800">
              <table className="w-full text-xs text-right border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    <th className="p-3">{isRtl ? 'التاريخ' : 'Date'}</th>
                    <th className="p-3">{isRtl ? 'نوع المستند' : 'Type'}</th>
                    <th className="p-3">{isRtl ? 'رقم المستند' : 'Doc No'}</th>
                    <th className="p-3">{isRtl ? 'البيان والتفاصيل' : 'Description'}</th>
                    <th className="p-3 text-emerald-600">{isRtl ? 'مدين (مسدد)' : 'Debit (Paid)'}</th>
                    <th className="p-3 text-rose-600">{isRtl ? 'دائن (شحنة)' : 'Credit (Invoiced)'}</th>
                    <th className="p-3">{isRtl ? 'الرصيد الجاري' : 'Balance'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {selectedVendorStatementData.items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400">
                        {isRtl ? 'لا توجد حركات مسجلة لهذا المورد حتى الآن' : 'No statement transactions recorded for this vendor yet'}
                      </td>
                    </tr>
                  ) : (
                    selectedVendorStatementData.items.map(it => (
                      <tr key={it.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-mono text-slate-500">{it.date}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            it.docType === 'PO_RECEIPT' ? 'bg-indigo-500/10 text-indigo-600' : 'bg-emerald-500/10 text-emerald-600'
                          }`}>
                            {it.docType === 'PO_RECEIPT' ? (isRtl ? 'استلام شحنة' : 'PO Receipt') : (isRtl ? 'سند صرف نقدية' : 'Cash Voucher')}
                          </span>
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-700 dark:text-slate-300">{it.docNo}</td>
                        <td className="p-3 font-medium">{isRtl ? it.descriptionAr : it.descriptionEn}</td>
                        <td className="p-3 font-bold text-emerald-600">{it.debit > 0 ? it.debit.toLocaleString() : '-'}</td>
                        <td className="p-3 font-bold text-rose-600">{it.credit > 0 ? it.credit.toLocaleString() : '-'}</td>
                        <td className="p-3 font-extrabold text-indigo-600">{it.balance.toLocaleString()} EGP</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedVendorForStatement(null)}
                className="px-5 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-200"
              >
                {isRtl ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD VENDOR */}
      {/* ========================================================================= */}
      {showAddVendor && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-extrabold text-slate-900 dark:text-slate-100">
                {isRtl ? 'تسجيل مورد جديد' : 'Register New Vendor'}
              </h3>
              <button onClick={() => setShowAddVendor(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddVendor} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isRtl ? 'اسم المورد بالعربية *' : 'Vendor Arabic Name *'}
                </label>
                <input
                  type="text"
                  required
                  value={vendorForm.nameAr}
                  onChange={e => setVendorForm({ ...vendorForm, nameAr: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isRtl ? 'اسم المورد بالإنجليزية *' : 'Vendor English Name *'}
                </label>
                <input
                  type="text"
                  required
                  value={vendorForm.nameEn}
                  onChange={e => setVendorForm({ ...vendorForm, nameEn: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{isRtl ? 'الهاتف' : 'Phone'}</label>
                  <input
                    type="text"
                    value={vendorForm.phone}
                    onChange={e => setVendorForm({ ...vendorForm, phone: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{isRtl ? 'الرقم الضريبي' : 'Tax No'}</label>
                  <input
                    type="text"
                    value={vendorForm.taxNo}
                    onChange={e => setVendorForm({ ...vendorForm, taxNo: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{isRtl ? 'البريد الإلكتروني' : 'Email'}</label>
                <input
                  type="email"
                  value={vendorForm.email}
                  onChange={e => setVendorForm({ ...vendorForm, email: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddVendor(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  {isRtl ? 'حفظ المورد' : 'Save Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE PR */}
      {/* ========================================================================= */}
      {showCreatePR && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-extrabold text-slate-900 dark:text-slate-100">
                {isRtl ? 'إنشاء طلب شراء داخلي جديد (PR)' : 'Create Purchase Request (PR)'}
              </h3>
              <button onClick={() => setShowCreatePR(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <OrgUnitTreeSelect
                    label={isRtl ? 'الوحدة التنظيمية / الفرع' : 'Organization Unit'}
                    value={prOrgUnitId}
                    onChange={(id) => setPrOrgUnitId(id)}
                    placeholder={isRtl ? '-- اختيار الفرع/الوحدة --' : '-- Select Unit --'}
                    companyId={companyId}
                    isRtl={isRtl}
                    theme={theme}
                    showInheritanceSummary={false}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isRtl ? 'القسم / الإدارة الطالبة' : 'Department'}
                  </label>
                  <input
                    type="text"
                    value={prDepartment}
                    onChange={e => setPrDepartment(e.target.value)}
                    placeholder={isRtl ? 'مثال: قسم الصيانة والتشغيل' : 'Maintenance & Operations'}
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isRtl ? 'ملاحظات وتبرير الطلب' : 'Justification Notes'}
                  </label>
                  <input
                    type="text"
                    value={prNotes}
                    onChange={e => setPrNotes(e.target.value)}
                    placeholder={isRtl ? 'تغذية المخزون الدوري' : 'Routine stock replenishment'}
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs"
                  />
                </div>
              </div>

              {/* Add Item Builder */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  {isRtl ? 'إضافة صنف لطلب الشراء:' : 'Add Item to PR:'}
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <div className="sm:col-span-2">
                    <select
                      value={selectedProductId}
                      onChange={e => {
                        setSelectedProductId(e.target.value);
                        const p = products.find(prod => prod.id === e.target.value);
                        if (p) setSelectedEstPrice(p.last_purchase_price || 0);
                      }}
                      className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs font-bold"
                    >
                      <option value="">{isRtl ? '-- اختر صنفاً --' : '-- Select Product --'}</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <input
                      type="number"
                      min="1"
                      value={selectedQty}
                      onChange={e => setSelectedQty(Number(e.target.value))}
                      placeholder={isRtl ? 'الكمية' : 'Qty'}
                      className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs"
                    />
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={handleAddPRItem}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold"
                    >
                      {isRtl ? 'إضافة الصنف' : 'Add Item'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Added Items List */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                  {isRtl ? `البنود المضافة (${prItems.length}):` : `Added Items (${prItems.length}):`}
                </span>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border rounded-xl border-slate-200 dark:border-slate-800 max-h-40 overflow-y-auto">
                  {prItems.length === 0 ? (
                    <p className="p-4 text-center text-xs text-slate-400">{isRtl ? 'لم يتم إضافة أصناف بعد' : 'No items added yet'}</p>
                  ) : (
                    prItems.map(it => (
                      <div key={it.productId} className="p-2.5 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-slate-800 dark:text-slate-200">{it.productName}</span>
                          <span className="text-slate-400 font-mono ml-2">({it.productCode})</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold">{it.qty} {it.unit}</span>
                          <button
                            onClick={() => handleRemovePRItem(it.productId)}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreatePR(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleCreatePR}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  {isRtl ? 'تقديم طلب الشراء' : 'Submit PR'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE RFQ */}
      {/* ========================================================================= */}
      {showCreateRFQ && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-extrabold text-slate-900 dark:text-slate-100">
                {isRtl ? 'إصدار طلب عرض أسعار الموردين (RFQ)' : 'Issue Request for Quotations (RFQ)'}
              </h3>
              <button onClick={() => setShowCreateRFQ(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isRtl ? 'ربط بطلب شراء معتمد (PR)' : 'Link to Approved PR'}
                </label>
                <select
                  value={rfqSourcePrId}
                  onChange={e => setRfqSourcePrId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs font-bold"
                >
                  <option value="">{isRtl ? '-- طلب جديد قائم بحد ذاته --' : '-- Standalone RFQ --'}</option>
                  {requests.filter(r => r.status === 'APPROVED').map(p => (
                    <option key={p.id} value={p.id}>{p.prNumber} - {p.requesterName} ({p.items.length} items)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isRtl ? 'تحديد الموردين الموجه إليهم الطلب' : 'Select Target Vendors'}
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto border p-2 rounded-xl border-slate-200 dark:border-slate-800">
                  {vendors.map(v => (
                    <label key={v.id} className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rfqSelectedVendors.includes(v.id)}
                        onChange={e => {
                          if (e.target.checked) setRfqSelectedVendors([...rfqSelectedVendors, v.id]);
                          else setRfqSelectedVendors(rfqSelectedVendors.filter(id => id !== v.id));
                        }}
                        className="rounded text-indigo-600 h-3.5 w-3.5"
                      />
                      <span>{v.nameAr} ({v.code})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateRFQ(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 rounded-xl text-xs font-bold"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleCreateRFQ}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  {isRtl ? 'تعميم طلب الأسعار' : 'Publish RFQ'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: RECORD VENDOR QUOTATION */}
      {/* ========================================================================= */}
      {showSubmitQuote && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-extrabold text-slate-900 dark:text-slate-100">
                {isRtl ? `تسجيل عرض سعر المورد لـ ${showSubmitQuote.rfqNumber}` : `Record Vendor Quote for ${showSubmitQuote.rfqNumber}`}
              </h3>
              <button onClick={() => setShowSubmitQuote(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isRtl ? 'اختر المورد مقدم العرض' : 'Select Vendor'}
                </label>
                <select
                  id="quote-vendor-select"
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs font-bold"
                >
                  {vendors.map(v => (
                    <option key={v.id} value={v.id}>{v.nameAr} ({v.code})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{isRtl ? 'رقم عرض المورد' : 'Quote Ref No'}</label>
                  <input
                    type="text"
                    value={quoteNumber}
                    onChange={e => setQuoteNumber(e.target.value)}
                    placeholder="e.g. QT-9988"
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{isRtl ? 'مدة التوريد (أيام)' : 'Lead Time (Days)'}</label>
                  <input
                    type="number"
                    value={quoteDeliveryDays}
                    onChange={e => setQuoteDeliveryDays(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">{isRtl ? 'أسعار البنود المعروضة من المورد:' : 'Item Pricing:'}</span>
                {quoteItems.map((it, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs">
                    <span className="font-bold">{it.productName} ({it.qty} {it.unit})</span>
                    <input
                      type="number"
                      value={it.unitPrice}
                      onChange={e => {
                        const updated = [...quoteItems];
                        updated[idx].unitPrice = Number(e.target.value);
                        setQuoteItems(updated);
                      }}
                      className="w-24 p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs text-center font-bold"
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSubmitQuote(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 rounded-xl text-xs font-bold"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const sel = (document.getElementById('quote-vendor-select') as HTMLSelectElement)?.value;
                    if (sel) handleSubmitVendorQuote(sel);
                  }}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  {isRtl ? 'حفظ عرض السعر' : 'Save Quote'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: RECEIVE PO STOCK */}
      {/* ========================================================================= */}
      {/* MODAL: DIRECT PO */}
      {/* ========================================================================= */}
      {showDirectPO && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-extrabold text-slate-900 dark:text-slate-100">
                {isRtl ? 'إصدار امر شراء مباشر (Direct PO)' : 'Issue Direct Purchase Order (PO)'}
              </h3>
              <button onClick={() => setShowDirectPO(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isRtl ? 'اختر المورد' : 'Select Vendor'}
                  </label>
                  <select
                    value={directPoVendorId}
                    onChange={e => setDirectPoVendorId(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs font-bold"
                  >
                    <option value="">{isRtl ? '-- اختيار المورد --' : '-- Select Vendor --'}</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>{v.nameAr} ({v.code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <OrgUnitTreeSelect
                    label={isRtl ? 'الوحدة التنظيمية / الفرع' : 'Organization Unit'}
                    value={directPoOrgUnitId}
                    onChange={(id) => setDirectPoOrgUnitId(id)}
                    placeholder={isRtl ? '-- اختيار الفرع/الوحدة --' : '-- Select Unit --'}
                    companyId={companyId}
                    isRtl={isRtl}
                    theme={theme}
                    showInheritanceSummary={false}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isRtl ? 'ملاحظات وشروط الأمر' : 'PO Notes'}
                </label>
                <input
                  type="text"
                  value={directPoNotes}
                  onChange={e => setDirectPoNotes(e.target.value)}
                  placeholder={isRtl ? 'ملاحظات الشراء والتوريد المباشر' : 'Direct PO notes'}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs"
                />
              </div>

              {/* Add Item Builder for PO */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  {isRtl ? 'إضافة صنف لأمر الشراء:' : 'Add Item to PO:'}
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <div className="sm:col-span-2">
                    <select
                      value={selectedProductId}
                      onChange={e => {
                        setSelectedProductId(e.target.value);
                        const p = products.find(prod => prod.id === e.target.value);
                        if (p) setSelectedEstPrice(p.last_purchase_price || 0);
                      }}
                      className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs font-bold"
                    >
                      <option value="">{isRtl ? '-- اختر الصنف --' : '-- Select Product --'}</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <input
                      type="number"
                      min={1}
                      value={selectedQty}
                      onChange={e => setSelectedQty(Number(e.target.value))}
                      placeholder={isRtl ? 'الكمية' : 'Qty'}
                      className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs"
                    />
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedProductId) return;
                        const p = products.find(prod => prod.id === selectedProductId);
                        if (!p) return;
                        const newItem: POItem = {
                          productId: p.id,
                          productCode: p.code,
                          productName: p.name,
                          unit: p.unit,
                          qty: selectedQty,
                          unitPrice: selectedEstPrice || p.last_purchase_price || 100,
                          totalPrice: (selectedQty) * (selectedEstPrice || p.last_purchase_price || 100)
                        };
                        setDirectPoItems([...directPoItems, newItem]);
                        setSelectedProductId('');
                        setSelectedQty(1);
                      }}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold"
                    >
                      {isRtl ? 'إضافة للصنف' : 'Add Item'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Items List */}
              {directPoItems.length > 0 && (
                <div className="border rounded-xl border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
                  <table className="w-full text-right">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                      <tr>
                        <th className="p-2">{isRtl ? 'الصنف' : 'Product'}</th>
                        <th className="p-2 text-center">{isRtl ? 'الكمية' : 'Qty'}</th>
                        <th className="p-2 text-center">{isRtl ? 'سعر الوحدة' : 'Unit Price'}</th>
                        <th className="p-2 text-center">{isRtl ? 'الإجمالي' : 'Total'}</th>
                        <th className="p-2 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {directPoItems.map((it, idx) => (
                        <tr key={idx}>
                          <td className="p-2 font-bold">{it.productName}</td>
                          <td className="p-2 text-center">{it.qty} {it.unit}</td>
                          <td className="p-2 text-center">{it.unitPrice}</td>
                          <td className="p-2 text-center font-extrabold">{it.totalPrice}</td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => setDirectPoItems(directPoItems.filter((_, i) => i !== idx))}
                              className="text-red-500 hover:text-red-700"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowDirectPO(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 rounded-xl text-xs font-bold"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleCreateDirectPO}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  {isRtl ? 'إصدار أمر الشراء' : 'Issue PO'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {showReceivePO && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-extrabold text-slate-900 dark:text-slate-100">
                {isRtl ? 'استلام شحنة التوريد بالمخزن' : 'Receive PO Goods into Store'}
              </h3>
              <button onClick={() => setShowReceivePO(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <WarehouseTreeSelect
                  label={isRtl ? 'تحديد المخزن/المستودع المستلم' : 'Select Destination Warehouse'}
                  value={receiveWarehouseId}
                  onChange={whId => setReceiveWarehouseId(whId)}
                  companyId={companyId}
                  isRtl={isRtl}
                  theme={theme}
                />
              </div>

              <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl text-xs">
                {isRtl 
                  ? 'سيتم إضافة البنود مباشرة إلى أرصدة المستودع المحدد، وتثبيت إذن الاستلام المخزني وتحديث السجلات المالية.'
                  : 'Items will be added directly into target warehouse stock, creating a goods receipt document and updating records.'}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowReceivePO(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 rounded-xl text-xs font-bold"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => handleReceivePO(showReceivePO)}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  {isRtl ? 'تأكيد الاستلام بالمخزن' : 'Confirm Receipt'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
}
