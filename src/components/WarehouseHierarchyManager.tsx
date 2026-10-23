import React, { useState, useMemo } from 'react';
import { Warehouse, WarehouseTreeNode, WarehouseType } from '../types/inventory';
import { WarehouseHierarchyEngine } from '../db/warehouseHierarchyEngine';
import { WarehouseTemplateEngine } from '../db/warehouseTemplateEngine';
import { InventoryModule } from '../db/inventory';
import { 
  Layers, 
  Plus, 
  FolderTree, 
  Sparkles, 
  Edit, 
  Move, 
  Trash2, 
  Check, 
  AlertCircle, 
  ChevronRight, 
  ChevronDown, 
  Building2, 
  Warehouse as WarehouseIcon,
  ShieldCheck,
  RefreshCw,
  Box,
  Sliders,
  CheckCircle2
} from 'lucide-react';

interface WarehouseHierarchyManagerProps {
  companyId: string;
  isRtl?: boolean;
  theme?: 'light' | 'dark';
  onWarehousesUpdated?: () => void;
}

export const WarehouseHierarchyManager: React.FC<WarehouseHierarchyManagerProps> = ({
  companyId,
  isRtl = true,
  theme = 'light',
  onWarehousesUpdated,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'tree' | 'templates' | 'types' | 'audit'>('tree');
  const [refreshKey, setRefreshKey] = useState(0);

  // States for Add / Edit Warehouse Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWhId, setEditingWhId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    parentId: '',
    typeId: '',
    location: '',
    maxCapacityQty: 10000,
    receivingApprovalWorkflow: false,
  });

  // State for Template Instantiation
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templatePrefixAr, setTemplatePrefixAr] = useState('');
  const [templatePrefixEn, setTemplatePrefixEn] = useState('');
  const [templateCodePrefix, setTemplateCodePrefix] = useState('');
  const [templateParentWhId, setTemplateParentWhId] = useState('');

  // Status message state
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Expanded nodes state
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  // Data fetching
  const treeNodes = useMemo(() => {
    return WarehouseHierarchyEngine.buildWarehouseTree(companyId);
  }, [companyId, refreshKey]);

  const allWarehouses = useMemo(() => {
    return InventoryModule.getWarehouses(companyId);
  }, [companyId, refreshKey]);

  const warehouseTypes = useMemo(() => {
    return WarehouseHierarchyEngine.getWarehouseTypes(companyId);
  }, [companyId, refreshKey]);

  const warehouseTemplates = useMemo(() => {
    return WarehouseTemplateEngine.getWarehouseTemplates(companyId);
  }, [companyId, refreshKey]);

  const auditResult = useMemo(() => {
    return WarehouseHierarchyEngine.validateWarehouseHierarchy(companyId);
  }, [companyId, refreshKey]);

  const reloadData = () => {
    setRefreshKey(prev => prev + 1);
    if (onWarehousesUpdated) onWarehousesUpdated();
  };

  const handleOpenAddModal = (parentId: string = '') => {
    setEditingWhId(null);
    setFormData({
      name: '',
      code: `WH-${Math.floor(1000 + Math.random() * 9000)}`,
      parentId,
      typeId: warehouseTypes.length > 0 ? warehouseTypes[0].id : '',
      location: '',
      maxCapacityQty: 10000,
      receivingApprovalWorkflow: false,
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (wh: Warehouse) => {
    setEditingWhId(wh.id);
    setFormData({
      name: wh.name,
      code: wh.code,
      parentId: wh.parent_id || '',
      typeId: wh.type_id || '',
      location: wh.location || '',
      maxCapacityQty: wh.max_capacity_qty || 10000,
      receivingApprovalWorkflow: wh.receiving_approval_workflow ?? false,
    });
    setIsModalOpen(true);
  };

  const handleSaveWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.code.trim()) {
      setMsg({ type: 'error', text: isRtl ? 'يرجى إدخال اسم وكود المستودع' : 'Please provide warehouse name and code' });
      return;
    }

    try {
      const selectedType = warehouseTypes.find(t => t.id === formData.typeId);

      if (editingWhId) {
        await WarehouseHierarchyEngine.updateWarehouse(editingWhId, {
          name: formData.name,
          code: formData.code,
          parent_id: formData.parentId || null,
          type_id: formData.typeId || undefined,
          type_code: selectedType?.code || undefined,
          location: formData.location,
          max_capacity_qty: Number(formData.maxCapacityQty),
          receiving_approval_workflow: formData.receivingApprovalWorkflow,
          company_id: companyId,
        });
        setMsg({ type: 'success', text: isRtl ? 'تم تحديث المستودع بنجاح' : 'Warehouse updated successfully' });
      } else {
        await WarehouseHierarchyEngine.addWarehouse({
          name: formData.name,
          code: formData.code,
          parent_id: formData.parentId || null,
          type_id: formData.typeId || undefined,
          type_code: selectedType?.code || undefined,
          location: formData.location,
          max_capacity_qty: Number(formData.maxCapacityQty),
          receiving_approval_workflow: formData.receivingApprovalWorkflow,
          company_id: companyId,
          is_active: true,
        });
        setMsg({ type: 'success', text: isRtl ? 'تم إضافة المستودع بنجاح إلى الهيكل' : 'Warehouse added to hierarchy successfully' });
      }

      setIsModalOpen(false);
      reloadData();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleInstantiateTemplate = async () => {
    if (!selectedTemplateId) {
      setMsg({ type: 'error', text: isRtl ? 'يرجى اختيار قالب الهيكل المخزني' : 'Please select a warehouse template' });
      return;
    }

    try {
      const createdWhs = await WarehouseTemplateEngine.instantiateWarehouseTemplate({
        templateId: selectedTemplateId,
        companyId,
        namePrefixAr: templatePrefixAr.trim() || undefined,
        namePrefixEn: templatePrefixEn.trim() || undefined,
        codePrefix: templateCodePrefix.trim() || undefined,
        parentWarehouseId: templateParentWhId || null,
      });

      setMsg({
        type: 'success',
        text: isRtl
          ? `تم تطبيق القالب بنجاح وإنشاء ${createdWhs.length} مستودع فرعي بالهيكل!`
          : `Template applied successfully! Created ${createdWhs.length} warehouses.`
      });

      reloadData();
      setActiveSubTab('tree');
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const toggleNodeExpand = (id: string) => {
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const renderTreeNodes = (nodes: WarehouseTreeNode[], depth = 0) => {
    return nodes.map(node => {
      const isExpanded = expandedNodes[node.id] ?? true;
      const hasChildren = node.children && node.children.length > 0;
      const totalStock = WarehouseHierarchyEngine.getWarehouseInclusiveStock(node.id, undefined, companyId);

      return (
        <div key={node.id} className="space-y-1">
          <div
            className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-2xl border transition-all ${
              theme === 'dark' ? 'bg-slate-800/60 border-slate-700/70 hover:bg-slate-800' : 'bg-white border-slate-200 hover:bg-slate-50'
            }`}
            style={{ paddingRight: isRtl ? `${depth * 24 + 12}px` : undefined, paddingLeft: !isRtl ? `${depth * 24 + 12}px` : undefined }}
          >
            <div className="flex items-center gap-2 min-w-0">
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => toggleNodeExpand(node.id)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
                >
                  {isExpanded ? <ChevronDown size={16} /> : (isRtl ? <ChevronDown size={16} className="-rotate-90" /> : <ChevronRight size={16} />)}
                </button>
              ) : (
                <span className="w-6" />
              )}

              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <WarehouseIcon size={16} />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100">{node.name}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 font-bold">
                    {node.code}
                  </span>
                  {node.type_code && (
                    <span className="text-[9px] px-2 py-0.5 rounded-full border font-bold bg-indigo-500/10 text-indigo-600 border-indigo-500/20">
                      {node.type_code}
                    </span>
                  )}
                  {node.receiving_approval_workflow && (
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 font-bold">
                      {isRtl ? 'اعتماد إجبارى' : 'Workflow Required'}
                    </span>
                  )}
                </div>

                <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                  <span>{isRtl ? `المسار: ${node.path || '/'}` : `Path: ${node.path || '/'}`}</span>
                  {node.location && <span>• {node.location}</span>}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-2 sm:mt-0 justify-end">
              <div className="text-right">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 font-mono">
                  {totalStock.toLocaleString()} {isRtl ? 'وحدة' : 'units'}
                </div>
                <div className="text-[9px] text-slate-400">
                  {isRtl ? 'إجمالي المخزون بالمستودع وفروعه' : 'Total stock (inclusive)'}
                </div>
              </div>

              <div className="flex items-center gap-1 border-r pr-2 border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => handleOpenAddModal(node.id)}
                  title={isRtl ? 'إضافة مستودع فرعي تحت هذا المستودع' : 'Add child warehouse'}
                  className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-500/10 transition-all cursor-pointer"
                >
                  <Plus size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenEditModal(node)}
                  title={isRtl ? 'تعديل بيانات المستودع' : 'Edit warehouse'}
                  className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-500/10 transition-all cursor-pointer"
                >
                  <Edit size={14} />
                </button>
              </div>
            </div>
          </div>

          {hasChildren && isExpanded && (
            <div className="space-y-1">
              {renderTreeNodes(node.children, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="space-y-6">
      {/* Module Title Banner */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 rounded-3xl border bg-gradient-to-r from-emerald-600/10 via-teal-600/5 to-indigo-600/10 border-emerald-500/20">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
            <Layers size={24} />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-800 dark:text-slate-100">
              {isRtl ? 'إدارة بنية المستودعات والقوالب الهرمية' : 'Warehouse Hierarchy & Templates Manager'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isRtl 
                ? 'تنظيم المستودعات في شجرة متعددة المستويات وتطبيق القوالب المخزنية الجاهزة للأنشطة المختلفة' 
                : 'Organize warehouses into multi-level hierarchical trees and apply predefined templates.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleOpenAddModal('')}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
          >
            <Plus size={15} />
            <span>{isRtl ? 'إضافة مستودع رئيسي' : 'Add Root Warehouse'}</span>
          </button>
        </div>
      </div>

      {/* Message Banner */}
      {msg && (
        <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between animate-fade-in ${
          msg.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' 
            : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
        }`}>
          <div className="flex items-center gap-2">
            {msg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{msg.text}</span>
          </div>
          <button type="button" onClick={() => setMsg(null)} className="text-slate-400 hover:text-slate-600">×</button>
        </div>
      )}

      {/* Tabs Row */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto pb-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('tree')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeSubTab === 'tree'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <FolderTree size={14} />
          <span>{isRtl ? 'شجرة المستودعات الهرمية' : 'Warehouse Tree'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('templates')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeSubTab === 'templates'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Sparkles size={14} />
          <span>{isRtl ? 'تطبيق القوالب الجاهزة' : 'Industry Templates'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('audit')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeSubTab === 'audit'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <ShieldCheck size={14} />
          <span>{isRtl ? 'فحص سلامة الهيكل' : 'Hierarchy Audit'}</span>
        </button>
      </div>

      {/* SUB-TAB 1: WAREHOUSE TREE */}
      {activeSubTab === 'tree' && (
        <div className="space-y-4">
          {treeNodes.length === 0 ? (
            <div className="p-12 text-center border rounded-3xl bg-slate-500/5">
              <WarehouseIcon size={36} className="mx-auto text-slate-400 mb-2" />
              <p className="text-xs font-bold text-slate-500">
                {isRtl ? 'لا توجد مستودعات مضافة بعد. يمكنك إضافة مستودع جديد أو تطبيق قالب جاهز بنقرة واحدة.' : 'No warehouses found. Add your first warehouse or apply a template.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {renderTreeNodes(treeNodes, 0)}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: INDUSTRY TEMPLATES */}
      {activeSubTab === 'templates' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {warehouseTemplates.map(tpl => {
              const isSelected = selectedTemplateId === tpl.id;
              return (
                <div
                  key={tpl.id}
                  onClick={() => setSelectedTemplateId(tpl.id)}
                  className={`p-5 rounded-3xl border transition-all cursor-pointer space-y-3 ${
                    isSelected
                      ? 'bg-emerald-500/10 border-emerald-500 ring-2 ring-emerald-500/20'
                      : theme === 'dark' ? 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800' : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                      {isRtl ? tpl.nameAr : tpl.nameEn}
                    </span>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500">
                      {tpl.code}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 leading-relaxed">
                    {isRtl ? tpl.descriptionAr : tpl.descriptionEn}
                  </p>

                  <div className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                    <Box size={13} />
                    <span>{isRtl ? `يتضمن ${tpl.nodes[0]?.children?.length || 0} مستودع فرعي تابع` : `Includes ${tpl.nodes[0]?.children?.length || 0} sub-warehouses`}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedTemplateId && (
            <div className={`p-6 rounded-3xl border space-y-4 shadow-lg ${
              theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <h3 className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <Sparkles size={15} />
                <span>{isRtl ? 'إعدادات تطبيق القالب المختار' : 'Template Instantiation Options'}</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    {isRtl ? 'بادئة الاسم باللغة العربية' : 'Arabic Name Prefix'}
                  </label>
                  <input
                    type="text"
                    value={templatePrefixAr}
                    onChange={e => setTemplatePrefixAr(e.target.value)}
                    placeholder={isRtl ? 'مثال: فرع القاهرة - ' : 'e.g. Cairo Branch - '}
                    className={`w-full p-2.5 rounded-xl border text-xs ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    {isRtl ? 'بادئة كود المستودعات' : 'Code Prefix'}
                  </label>
                  <input
                    type="text"
                    value={templateCodePrefix}
                    onChange={e => setTemplateCodePrefix(e.target.value)}
                    placeholder={isRtl ? 'مثال: CAI-' : 'e.g. CAI-'}
                    className={`w-full p-2.5 rounded-xl border text-xs font-mono ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    {isRtl ? 'ربطه بمستودع رئيسي موجود (اختياري)' : 'Parent Warehouse (Optional)'}
                  </label>
                  <select
                    value={templateParentWhId}
                    onChange={e => setTemplateParentWhId(e.target.value)}
                    className={`w-full p-2.5 rounded-xl border text-xs ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    <option value="">{isRtl ? '-- إنشاء كهيكل جذر رئيسي مستقل --' : '-- Root level hierarchy --'}</option>
                    {allWarehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name} [{w.code}]</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleInstantiateTemplate}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-2"
                >
                  <Check size={15} />
                  <span>{isRtl ? 'تطبيق وتوليد المستودعات' : 'Generate Warehouse Structure'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: HIERARCHY AUDIT */}
      {activeSubTab === 'audit' && (
        <div className="space-y-4">
          <div className={`p-6 rounded-3xl border space-y-4 ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'
          }`}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <ShieldCheck className="text-emerald-500" size={18} />
                <span>{isRtl ? 'نتائج التفتيش وفحص تكامل هيكل المستودعات' : 'Warehouse Hierarchy Audit & Integrity Check'}</span>
              </h3>
              <button
                type="button"
                onClick={reloadData}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5"
              >
                <RefreshCw size={13} />
                <span>{isRtl ? 'إعادة الفحص' : 'Re-audit'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl border bg-slate-500/5">
                <div className="text-[10px] text-slate-400 font-bold uppercase">{isRtl ? 'إجمالي المستودعات' : 'Total Warehouses'}</div>
                <div className="text-xl font-black text-slate-800 dark:text-slate-100 mt-1">{auditResult.totalWarehouses}</div>
              </div>

              <div className="p-4 rounded-2xl border bg-slate-500/5">
                <div className="text-[10px] text-slate-400 font-bold uppercase">{isRtl ? 'أقصى عمق للهيكل' : 'Max Hierarchy Depth'}</div>
                <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{auditResult.maxDepth} {isRtl ? 'مستويات' : 'levels'}</div>
              </div>

              <div className="p-4 rounded-2xl border bg-slate-500/5">
                <div className="text-[10px] text-slate-400 font-bold uppercase">{isRtl ? 'حالة التكامل' : 'Integrity Status'}</div>
                <div className={`text-xl font-black mt-1 ${auditResult.isValid ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {auditResult.isValid ? (isRtl ? 'سليم 100%' : '100% Valid') : (isRtl ? 'توجد تنبيهات' : 'Issues Found')}
                </div>
              </div>
            </div>

            {auditResult.errors.length > 0 && (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <AlertCircle size={14} />
                  <span>{isRtl ? 'الملاحظات المكتشفة:' : 'Audit findings:'}</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5">
                  {auditResult.errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ADD / EDIT WAREHOUSE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-lg rounded-3xl border p-6 shadow-2xl space-y-6 ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-900'
          }`}>
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <h3 className="text-sm font-extrabold flex items-center gap-2">
                <WarehouseIcon className="text-emerald-500" size={18} />
                <span>{editingWhId ? (isRtl ? 'تعديل بيانات المستودع' : 'Edit Warehouse') : (isRtl ? 'إضافة مستودع جديد للهيكل' : 'Add New Warehouse')}</span>
              </h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">×</button>
            </div>

            <form onSubmit={handleSaveWarehouse} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                  {isRtl ? 'اسم المستودع' : 'Warehouse Name'} *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className={`w-full p-2.5 rounded-xl border text-xs ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    {isRtl ? 'كود المستودع' : 'Warehouse Code'} *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={e => setFormData({ ...formData, code: e.target.value })}
                    className={`w-full p-2.5 rounded-xl border text-xs font-mono ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    {isRtl ? 'نوع المستودع' : 'Warehouse Type'}
                  </label>
                  <select
                    value={formData.typeId}
                    onChange={e => setFormData({ ...formData, typeId: e.target.value })}
                    className={`w-full p-2.5 rounded-xl border text-xs ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    {warehouseTypes.map(t => (
                      <option key={t.id} value={t.id}>
                        {isRtl ? t.nameAr : t.nameEn} ({t.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                  {isRtl ? 'المستودع الأب بالهيكل' : 'Parent Warehouse'}
                </label>
                <select
                  value={formData.parentId}
                  onChange={e => setFormData({ ...formData, parentId: e.target.value })}
                  className={`w-full p-2.5 rounded-xl border text-xs ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  <option value="">{isRtl ? '-- مستودع جذر رئيسي (Root) --' : '-- Root Warehouse --'}</option>
                  {allWarehouses.filter(w => w.id !== editingWhId).map(w => (
                    <option key={w.id} value={w.id}>{w.name} [{w.code}]</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    {isRtl ? 'السعة القصوى (وحدات)' : 'Max Capacity Qty'}
                  </label>
                  <input
                    type="number"
                    value={formData.maxCapacityQty}
                    onChange={e => setFormData({ ...formData, maxCapacityQty: Number(e.target.value) })}
                    className={`w-full p-2.5 rounded-xl border text-xs font-mono ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    {isRtl ? 'الموقع الجغرافي / العنوان' : 'Location'}
                  </label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={e => setFormData({ ...formData, location: e.target.value })}
                    className={`w-full p-2.5 rounded-xl border text-xs ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.receivingApprovalWorkflow}
                  onChange={e => setFormData({ ...formData, receivingApprovalWorkflow: e.target.checked })}
                  className="rounded text-emerald-600"
                />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isRtl ? 'اشتراط دورة اعتماد واستلام قبل تحديث أعداء المخزون' : 'Require approval workflow before stock update'}
                </span>
              </label>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold rounded-xl text-xs"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5"
                >
                  <Check size={14} />
                  <span>{isRtl ? 'حفظ' : 'Save'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default WarehouseHierarchyManager;
