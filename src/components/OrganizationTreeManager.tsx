import React, { useState, useEffect } from 'react';
import { 
  Network, 
  Plus, 
  Edit, 
  Trash2, 
  ChevronRight, 
  ChevronDown, 
  Building2, 
  FolderTree, 
  Sparkles, 
  Check, 
  X, 
  Layers, 
  MapPin, 
  Globe, 
  Briefcase, 
  Search, 
  HelpCircle,
  RefreshCw,
  LayoutGrid
} from 'lucide-react';
import { OrganizationEngine, DEFAULT_ORGANIZATION_UNIT_TYPES } from '../db/organizationEngine';
import { CustodyDB } from '../db';
import { OrganizationUnit, OrganizationTreeNode, OrganizationTemplate } from '../types/organization';
import { Language, Theme } from '../types';

interface OrganizationTreeManagerProps {
  companyId: string;
  isRtl: boolean;
  theme: Theme;
  onStructureChange?: () => void;
}

export default function OrganizationTreeManager({
  companyId,
  isRtl,
  theme,
  onStructureChange
}: OrganizationTreeManagerProps) {
  const [treeData, setTreeData] = useState<OrganizationTreeNode[]>([]);
  const [flatUnits, setFlatUnits] = useState<OrganizationUnit[]>([]);
  const [templates, setTemplates] = useState<OrganizationTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal states
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Form states for Add/Edit
  const [targetParentId, setTargetParentId] = useState<string | null>(null);
  const [editingUnit, setEditingUnit] = useState<OrganizationUnit | null>(null);
  
  const [formCode, setFormCode] = useState('');
  const [formNameAr, setFormNameAr] = useState('');
  const [formNameEn, setFormNameEn] = useState('');
  const [formCustomType, setFormCustomType] = useState('out-unit');
  const [formCustomTypeLabel, setFormCustomTypeLabel] = useState('');

  // Expanded nodes state
  const [expandedNodeIds, setExpandedNodeIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadData();
  }, [companyId]);

  const loadData = () => {
    if (!companyId) return;
    const tree = OrganizationEngine.buildTree(companyId);
    const units = OrganizationEngine.getUnits(companyId);
    const tpls = OrganizationEngine.getTemplates();
    
    setTreeData(tree);
    setFlatUnits(units);
    setTemplates(tpls);

    // Expand top 2 levels by default
    const initialExpanded: Record<string, boolean> = {};
    const markExpanded = (nodes: OrganizationTreeNode[], currentDepth: number) => {
      nodes.forEach(n => {
        if (currentDepth <= 2) {
          initialExpanded[n.id] = true;
        }
        if (n.children && n.children.length > 0) {
          markExpanded(n.children, currentDepth + 1);
        }
      });
    };
    markExpanded(tree, 1);
    setExpandedNodeIds(initialExpanded);
  };

  const toggleExpand = (nodeId: string) => {
    setExpandedNodeIds(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  const expandAll = () => {
    const allExpanded: Record<string, boolean> = {};
    flatUnits.forEach(u => {
      allExpanded[u.id] = true;
    });
    setExpandedNodeIds(allExpanded);
  };

  const collapseAll = () => {
    setExpandedNodeIds({});
  };

  const handleApplyTemplate = async () => {
    if (!selectedTemplateId) return;
    try {
      const selectedTpl = templates.find(t => t.id === selectedTemplateId);
      if (!selectedTpl) return;

      await OrganizationEngine.applyTemplateToCompany(companyId, selectedTemplateId);
      setIsTemplateModalOpen(false);
      setSelectedTemplateId(null);
      loadData();
      if (onStructureChange) onStructureChange();
      alert(isRtl ? `تم تطبيق هيكل "${selectedTpl.nameAr}" بنجاح!` : `Successfully applied "${selectedTpl.nameEn}" template!`);
    } catch (err: any) {
      alert(err.message || 'Failed to apply template');
    }
  };

  const handleOpenAdd = (parentId: string | null) => {
    setTargetParentId(parentId);
    setFormCode(`ORG-${Math.floor(1000 + Math.random() * 9000)}`);
    setFormNameAr('');
    setFormNameEn('');
    setFormCustomType('out-unit');
    setFormCustomTypeLabel('');
    setIsAddModalOpen(true);
  };

  const handleSaveNewUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNameAr.trim()) {
      alert(isRtl ? 'يرجى إدخال اسم الوحدة التنظيمية' : 'Please enter unit name');
      return;
    }

    try {
      await OrganizationEngine.addUnit({
        companyId,
        parentId: targetParentId,
        typeId: formCustomType,
        code: formCode.trim() || `ORG-${Date.now().toString().slice(-4)}`,
        name: formNameAr.trim(),
        nameAr: formNameAr.trim(),
        nameEn: formNameEn.trim() || formNameAr.trim(),
        metadata: {
          customLevelLabel: formCustomTypeLabel.trim() || undefined
        }
      });

      setIsAddModalOpen(false);
      loadData();
      if (onStructureChange) onStructureChange();
    } catch (err: any) {
      alert(err.message || 'Failed to add unit');
    }
  };

  const handleOpenEdit = (unit: OrganizationUnit) => {
    setEditingUnit(unit);
    setFormCode(unit.code || '');
    setFormNameAr(unit.nameAr || unit.name || '');
    setFormNameEn(unit.nameEn || '');
    setFormCustomType(unit.typeId || unit.type_id || 'out-unit');
    setFormCustomTypeLabel(unit.metadata?.customLevelLabel || '');
    setTargetParentId(unit.parentId || unit.parent_id || null);
    setIsEditModalOpen(true);
  };

  const handleSaveEditUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUnit || !formNameAr.trim()) return;

    try {
      await OrganizationEngine.updateUnit(editingUnit.id, {
        code: formCode.trim(),
        name: formNameAr.trim(),
        nameAr: formNameAr.trim(),
        nameEn: formNameEn.trim() || formNameAr.trim(),
        typeId: formCustomType,
        parentId: targetParentId,
        metadata: {
          ...editingUnit.metadata,
          customLevelLabel: formCustomTypeLabel.trim() || undefined
        }
      });

      setIsEditModalOpen(false);
      setEditingUnit(null);
      loadData();
      if (onStructureChange) onStructureChange();
    } catch (err: any) {
      alert(err.message || 'Failed to update unit');
    }
  };

  const handleDeleteUnit = async (unitId: string, unitName: string) => {
    const confirmMsg = isRtl 
      ? `هل أنت تأكد من حذف الوحدة التنظيمية "${unitName}"؟` 
      : `Are you sure you want to delete organization unit "${unitName}"?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await OrganizationEngine.deleteUnit(unitId);
      loadData();
      if (onStructureChange) onStructureChange();
    } catch (err: any) {
      alert(err.message || 'Failed to delete unit');
    }
  };

  const handleRaiseHeadcount = async (unitId: string) => {
    const activeUser = CustodyDB.getActiveUser();
    const res = await OrganizationEngine.raiseMaxAccountsAllowed(unitId, activeUser);
    if (!res.success) {
      alert(isRtl ? res.errorAr : res.errorEn);
      return;
    }
    loadData();
    if (onStructureChange) onStructureChange();
  };

  // Helper to render unit level badge using plain business language
  const renderUnitLevelBadge = (unit: OrganizationUnit) => {
    if (unit.metadata?.customLevelLabel) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-200/50">
          {unit.metadata.customLevelLabel}
        </span>
      );
    }

    const matchedType = DEFAULT_ORGANIZATION_UNIT_TYPES.find(t => t.id === unit.typeId || t.id === unit.type_id);
    const label = isRtl ? matchedType?.nameAr : matchedType?.nameEn;

    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-900/40">
        {label || (isRtl ? 'وحدة عمل' : 'Work Unit')}
      </span>
    );
  };

  // Recursive tree node renderer
  const renderTreeNode = (node: OrganizationTreeNode, depth: number = 0) => {
    const isExpanded = !!expandedNodeIds[node.id];
    const hasChildren = node.children && node.children.length > 0;
    const isFiltered = searchQuery.trim().length > 0;

    if (isFiltered) {
      const q = searchQuery.toLowerCase();
      const matchSelf = (node.nameAr || node.name || '').toLowerCase().includes(q) ||
                        (node.code || '').toLowerCase().includes(q);
      const matchChild = (nodes: OrganizationTreeNode[]): boolean => {
        return nodes.some(c => 
          (c.nameAr || c.name || '').toLowerCase().includes(q) ||
          (c.code || '').toLowerCase().includes(q) ||
          (c.children && matchChild(c.children))
        );
      };
      if (!matchSelf && (!node.children || !matchChild(node.children))) {
        return null;
      }
    }

    const headcount = OrganizationEngine.getUnitAccountHeadcount(node.id);
    const raiseClearance = OrganizationEngine.canRaiseMaxAccountsAllowed(node, CustodyDB.getActiveUser());
    const isAtCeiling = headcount.maxAllowed >= 5;

    return (
      <div key={node.id} className="relative group/node my-1">
        {/* Unit Row */}
        <div 
          className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
            theme === 'dark' 
              ? 'bg-slate-900/40 hover:bg-slate-800/60 border-slate-800/80 hover:border-indigo-900/80' 
              : 'bg-white hover:bg-indigo-50/30 border-slate-200/80 hover:border-indigo-200'
          }`}
          style={{
            marginRight: isRtl ? `${depth * 20}px` : 0,
            marginLeft: !isRtl ? `${depth * 20}px` : 0,
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Expand / Collapse Button */}
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleExpand(node.id)}
                className="p-1 rounded-lg hover:bg-indigo-100 dark:hover:bg-slate-800 text-slate-500 transition-colors cursor-pointer"
              >
                {isExpanded ? <ChevronDown size={16} /> : (isRtl ? <ChevronRight size={16} className="rotate-180" /> : <ChevronRight size={16} />)}
              </button>
            ) : (
              <div className="w-6 flex justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
              </div>
            )}

            {/* Depth Level Indicator */}
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
              L{node.level}
            </span>

            {/* Unit Icon & Details */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h5 className="font-bold text-xs text-slate-900 dark:text-white truncate">
                  {isRtl ? (node.nameAr || node.name) : (node.nameEn || node.name)}
                </h5>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-600 dark:text-slate-300">
                  {node.code}
                </span>
                {renderUnitLevelBadge(node)}
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                  headcount.activeAccountsCount >= headcount.maxAllowed
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200/50'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/50'
                }`}>
                  {isRtl ? `${headcount.activeAccountsCount}/${headcount.maxAllowed} حسابات` : `${headcount.activeAccountsCount}/${headcount.maxAllowed} Accounts`}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                {node.path}
              </div>
            </div>
          </div>

          {/* Node Actions */}
          <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
            {raiseClearance.canRaise && (
              <button
                type="button"
                onClick={() => handleRaiseHeadcount(node.id)}
                disabled={isAtCeiling}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 ${
                  isAtCeiling
                    ? 'bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed'
                    : 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 cursor-pointer'
                }`}
                title={isAtCeiling ? (isRtl ? 'الحد الأقصى المطلق 5 حسابات لكل وحدة' : 'Hard ceiling of 5 accounts reached') : (isRtl ? 'رفع الحد الأقصى لعدد الحسابات في هذه الوحدة بمقدار +1' : 'Raise unit account ceiling by +1')}
              >
                <Plus size={12} />
                <span>{isRtl ? '+1 حساب' : '+1 Account'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => handleOpenAdd(node.id)}
              className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
              title={isRtl ? 'إضافة فرع تحت هذه الوحدة' : 'Add Child Unit'}
            >
              <Plus size={12} />
              <span>{isRtl ? 'إضافة فرع' : 'Add Child'}</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenEdit(node)}
              className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400 transition-colors cursor-pointer"
              title={isRtl ? 'تعديل الوحدة' : 'Edit Unit'}
            >
              <Edit size={14} />
            </button>
            <button
              type="button"
              onClick={() => handleDeleteUnit(node.id, node.nameAr || node.name)}
              className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-slate-800 text-rose-500 hover:text-rose-600 transition-colors cursor-pointer"
              title={isRtl ? 'حذف الوحدة' : 'Delete Unit'}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Child Nodes */}
        {hasChildren && isExpanded && (
          <div className="border-l-2 rtl:border-l-0 rtl:border-r-2 border-indigo-100 dark:border-slate-800/80 my-1">
            {node.children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Header Banner */}
      <div className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
        theme === 'dark' ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-sm">
            <FolderTree size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {isRtl ? 'بناء ومتابعة الهيكل التنظيمي (شجرة الوحدات)' : 'Organization Unit Hierarchy Builder'}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300">
                {flatUnits.length} {isRtl ? 'وحدة' : 'Units'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {isRtl 
                ? 'هيكل متعدد المستويات بدون حد أقصى للعمق - يتكيف مع كافة الأنشطة التجارية والصناعية'
                : 'Unlimited-depth organizational tree supporting multi-sector, branches, farms, & facilities.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsTemplateModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles size={14} />
            <span>{isRtl ? 'تطبيق قالب قطاعي جاهز' : 'Apply Industry Template'}</span>
          </button>
          
          <button
            type="button"
            onClick={() => handleOpenAdd(null)}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Plus size={14} />
            <span>{isRtl ? 'إضافة وحدة جذرية' : 'Add Root Unit'}</span>
          </button>
        </div>
      </div>

      {/* Control Bar: Search & Expand/Collapse */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isRtl ? 'بحث في شجرة الهيكل التنظيمي...' : 'Search organization units...'}
            className={`w-full pl-9 rtl:pl-3 rtl:pr-9 pr-3 py-1.5 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
              theme === 'dark' ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
          />
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={expandAll}
            className="px-2.5 py-1 rounded-lg border text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {isRtl ? 'توسيع الكل' : 'Expand All'}
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="px-2.5 py-1 rounded-lg border text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {isRtl ? 'طي الكل' : 'Collapse All'}
          </button>
        </div>
      </div>

      {/* Tree View Canvas */}
      <div className={`p-4 rounded-2xl border min-h-[320px] ${
        theme === 'dark' ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-50/50 border-slate-200'
      }`}>
        {treeData.length === 0 ? (
          <div className="p-12 text-center max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 flex items-center justify-center mx-auto">
              <Network size={24} />
            </div>
            <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
              {isRtl ? 'لا يوجد هيكل تنظيمي مضاف لهذه الشركة حتى الآن' : 'No Organization Hierarchy Set Up Yet'}
            </h4>
            <p className="text-xs text-slate-400">
              {isRtl 
                ? 'يمكنك البدء باختيار قالب جاهز حسب نشاط شركتك (تجارة، مصانع، دواجن، مقاولات) أو إضافة الهيكل يدوياً'
                : 'Choose an industry template or build your custom organization hierarchy from scratch.'}
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all cursor-pointer"
              >
                {isRtl ? 'اختر قالب جاهز' : 'Choose Template'}
              </button>
              <button
                type="button"
                onClick={() => handleOpenAdd(null)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer"
              >
                {isRtl ? 'بناء هيكل مخصص' : 'Build Custom Tree'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {treeData.map(node => renderTreeNode(node, 0))}
          </div>
        )}
      </div>

      {/* MODAL 1: Industry Templates Selector */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-2xl rounded-2xl border shadow-xl overflow-hidden flex flex-col max-h-[90vh] ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-purple-500" />
                <h3 className="font-bold text-sm">
                  {isRtl ? 'قوالب الهياكل التنظيمية الجاهزة حسب النشاط' : 'Predefined Industry Organization Templates'}
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              <p className="text-xs text-slate-400">
                {isRtl 
                  ? 'اختر القالب الأنسب لنشاط شركتك لإنشاء شجرة القطاعات والفروع والأقسام تلقائياً مع المحافظة على البيانات الحالية.'
                  : 'Select an industry template to automatically construct sectors, branches, and work units.'}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                {templates.map(tpl => {
                  const isSelected = selectedTemplateId === tpl.id;
                  return (
                    <div
                      key={tpl.id}
                      onClick={() => setSelectedTemplateId(tpl.id)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20'
                          : 'border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-slate-700 bg-white/50 dark:bg-slate-800/20'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                          {tpl.category}
                        </span>
                        {isSelected && <Check size={14} className="text-indigo-600 dark:text-indigo-400" />}
                      </div>
                      <h4 className="font-bold text-xs mt-1 text-slate-900 dark:text-white">
                        {isRtl ? tpl.nameAr : tpl.nameEn}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                        {isRtl ? tpl.descriptionAr : tpl.descriptionEn}
                      </p>
                      <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500">
                        <span>{tpl.units.length} {isRtl ? 'وحدات مدمجة' : 'Units included'}</span>
                        <span className="font-mono text-slate-400">{tpl.code}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50/50 dark:bg-slate-900/50">
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className="px-4 py-2 rounded-xl border text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={!selectedTemplateId}
                onClick={handleApplyTemplate}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition-all cursor-pointer"
              >
                {isRtl ? 'تطبيق القالب المختار' : 'Apply Selected Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Add / Edit Organization Unit Form */}
      {(isAddModalOpen || isEditModalOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-lg rounded-2xl border shadow-xl overflow-hidden flex flex-col ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-sm">
                {isAddModalOpen 
                  ? (targetParentId ? (isRtl ? 'إضافة وحدة فرعية جديدة' : 'Add Child Organization Unit') : (isRtl ? 'إضافة وحدة تنظيمية جذرية' : 'Add Root Organization Unit'))
                  : (isRtl ? 'تعديل بيانات الوحدة التنظيمية' : 'Edit Organization Unit')}
              </h3>
              <button 
                type="button"
                onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={isAddModalOpen ? handleSaveNewUnit : handleSaveEditUnit} className="p-4 space-y-4">
              {/* Target Parent Display */}
              {targetParentId && (
                <div className="p-2.5 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 text-xs flex items-center justify-between">
                  <span className="text-slate-500">{isRtl ? 'الوحدة الأب (المستوى الأعلى):' : 'Parent Unit:'}</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-300">
                    {flatUnits.find(u => u.id === targetParentId)?.nameAr || flatUnits.find(u => u.id === targetParentId)?.name || targetParentId}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    {isRtl ? 'كود الوحدة التنظيمية' : 'Unit Code'}
                  </label>
                  <input
                    type="text"
                    required
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    placeholder="e.g. BR-CAIRO-01"
                    className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    {isRtl ? 'مسمى نوع/مستوى الوحدة' : 'Unit Type / Level Label'}
                  </label>
                  <select
                    value={formCustomType}
                    onChange={(e) => setFormCustomType(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  >
                    {DEFAULT_ORGANIZATION_UNIT_TYPES.map(t => (
                      <option key={t.id} value={t.id}>
                        {isRtl ? t.nameAr : t.nameEn}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  {isRtl ? 'اسم الوحدة التنظيمية (بالعربية)' : 'Unit Name (Arabic)'}
                </label>
                <input
                  type="text"
                  required
                  value={formNameAr}
                  onChange={(e) => setFormNameAr(e.target.value)}
                  placeholder={isRtl ? 'مثال: مزرعة السلام 1 / فرع القاهرة' : 'e.g. Cairo Main Branch'}
                  className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  {isRtl ? 'اسم الوحدة التنظيمية (بالإنجليزية)' : 'Unit Name (English)'}
                </label>
                <input
                  type="text"
                  value={formNameEn}
                  onChange={(e) => setFormNameEn(e.target.value)}
                  placeholder="e.g. Cairo Branch 1"
                  className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">
                  {isRtl ? 'تسمية العمل الخاصة للمستوى (اختياري)' : 'Custom Business Level Label (Optional)'}
                </label>
                <input
                  type="text"
                  value={formCustomTypeLabel}
                  onChange={(e) => setFormCustomTypeLabel(e.target.value)}
                  placeholder={isRtl ? 'مثال: محطة، مجزر، مجمع، مدرسة، مستشفى' : 'e.g. Farm, Station, Facility, Plant'}
                  className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
                  className="px-4 py-2 rounded-xl border text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer"
                >
                  {isRtl ? 'حفظ البيانات' : 'Save Unit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
