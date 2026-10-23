import React, { useState, useMemo, useRef, useEffect } from 'react';
import { OrganizationEngine } from '../db/organizationEngine';
import { OrganizationTreeNode, OrganizationUnit } from '../types/organization';
import { OrganizationScopeEngine } from '../db/organizationScopeEngine';
import { 
  Building2, 
  ChevronDown, 
  ChevronRight, 
  Search, 
  ShieldCheck, 
  Check, 
  X, 
  Layers, 
  Sparkles,
  CheckSquare,
  Square
} from 'lucide-react';

interface OrgUnitTreeSelectProps {
  companyId: string;
  value?: string; // single selection (org_unit_id)
  selectedIds?: string[]; // multi selection (assigned_org_unit_ids)
  onChange?: (unitId: string, unit?: OrganizationUnit) => void;
  onMultiChange?: (unitIds: string[]) => void;
  mode?: 'single' | 'multi';
  label?: string;
  placeholder?: string;
  isRtl?: boolean;
  theme?: 'light' | 'dark';
  error?: string;
  allowClear?: boolean;
  showInheritanceSummary?: boolean;
}

export const OrgUnitTreeSelect: React.FC<OrgUnitTreeSelectProps> = ({
  companyId,
  value = '',
  selectedIds = [],
  onChange,
  onMultiChange,
  mode = 'single',
  label,
  placeholder,
  isRtl = true,
  theme = 'light',
  error,
  allowClear = true,
  showInheritanceSummary = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allUnits = useMemo(() => {
    return OrganizationEngine.getOrganizationUnits(companyId);
  }, [companyId]);

  const treeData = useMemo(() => {
    return OrganizationEngine.getOrganizationTree(companyId);
  }, [companyId]);

  // Expand all by default
  useEffect(() => {
    const initialExpanded: Record<string, boolean> = {};
    const traverse = (nodes: OrganizationTreeNode[]) => {
      nodes.forEach(n => {
        initialExpanded[n.id] = true;
        if (n.children && n.children.length > 0) {
          traverse(n.children);
        }
      });
    };
    traverse(treeData);
    setExpandedNodes(initialExpanded);
  }, [treeData]);

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const selectedUnit = useMemo(() => {
    if (!value) return null;
    return allUnits.find(u => u.id === value) || null;
  }, [value, allUnits]);

  // Selected multi units
  const selectedMultiUnits = useMemo(() => {
    return allUnits.filter(u => selectedIds.includes(u.id));
  }, [selectedIds, allUnits]);

  // Calculate inherited sub-units for single selected unit
  const inheritedDescendants = useMemo(() => {
    if (!value || !selectedUnit) return [];
    return OrganizationEngine.getDescendantUnits(value, companyId);
  }, [value, selectedUnit, companyId]);

  const handleSelectUnit = (unit: OrganizationUnit) => {
    if (mode === 'single') {
      if (onChange) onChange(unit.id, unit);
      setIsOpen(false);
    } else {
      let newIds: string[];
      if (selectedIds.includes(unit.id)) {
        newIds = selectedIds.filter(id => id !== unit.id);
      } else {
        newIds = [...selectedIds, unit.id];
      }
      if (onMultiChange) onMultiChange(newIds);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (mode === 'single' && onChange) {
      onChange('', undefined);
    } else if (mode === 'multi' && onMultiChange) {
      onMultiChange([]);
    }
  };

  const renderTreeNode = (node: OrganizationTreeNode, depth = 0) => {
    const isExpanded = expandedNodes[node.id] ?? true;
    const hasChildren = node.children && node.children.length > 0;
    const isSelectedSingle = mode === 'single' && value === node.id;
    const isSelectedMulti = mode === 'multi' && selectedIds.includes(node.id);

    // Search filter check
    const matchesSearch = !searchQuery.trim() || 
      node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      node.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ((node as any).levelName && (node as any).levelName.toLowerCase().includes(searchQuery.toLowerCase()));

    // If node doesn't match search and none of children match, hide
    const hasMatchingChild = (n: OrganizationTreeNode): boolean => {
      if (n.name.toLowerCase().includes(searchQuery.toLowerCase()) || n.code.toLowerCase().includes(searchQuery.toLowerCase())) return true;
      return (n.children || []).some(c => hasMatchingChild(c));
    };

    if (searchQuery.trim() && !matchesSearch && !hasMatchingChild(node)) {
      return null;
    }

    return (
      <div key={node.id} className="space-y-0.5">
        <div
          onClick={() => handleSelectUnit(node)}
          className={`flex items-center justify-between p-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            isSelectedSingle || isSelectedMulti
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
              : theme === 'dark' 
                ? 'hover:bg-slate-800 text-slate-200' 
                : 'hover:bg-slate-100 text-slate-700'
          }`}
          style={{ paddingRight: isRtl ? `${depth * 16 + 8}px` : undefined, paddingLeft: !isRtl ? `${depth * 16 + 8}px` : undefined }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => toggleExpand(node.id, e)}
                className="p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {isExpanded ? <ChevronDown size={14} /> : (isRtl ? <ChevronDown size={14} className="-rotate-90" /> : <ChevronRight size={14} />)}
              </button>
            ) : (
              <span className="w-4" />
            )}

            {mode === 'multi' && (
              <div className="text-emerald-600 dark:text-emerald-400">
                {isSelectedMulti ? <CheckSquare size={15} /> : <Square size={15} className="text-slate-400" />}
              </div>
            )}

            <Building2 size={14} className="text-emerald-500 shrink-0" />

            <div className="min-w-0 truncate">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="truncate">{node.name}</span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                  {node.code}
                </span>
                {node.levelName && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded-full border bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 font-bold">
                    {node.levelName}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {node.children && node.children.length > 0 && (
              <span className="text-[9px] text-slate-400 px-1.5 py-0.5 rounded bg-slate-200/50 dark:bg-slate-800">
                +{node.children.length} {isRtl ? 'فرع' : 'sub'}
              </span>
            )}
            {isSelectedSingle && <Check size={14} className="text-emerald-600 dark:text-emerald-400" />}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-0.5">
            {node.children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const defaultPlaceholder = isRtl ? 'اختر النطاق / الوحدة التنظيمية...' : 'Select Organization Unit Scope...';

  return (
    <div className="space-y-1 relative" ref={dropdownRef}>
      {label && (
        <label className={`block text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'} mb-1`}>
          {label}
        </label>
      )}

      {/* Main Trigger Field */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${
          error ? 'border-rose-500 ring-1 ring-rose-500' : ''
        } ${
          theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Layers size={15} className="text-emerald-500 shrink-0" />

          {mode === 'single' ? (
            selectedUnit ? (
              <div className="min-w-0 truncate flex items-center gap-2">
                <span className="font-extrabold text-slate-800 dark:text-slate-100">{selectedUnit.name}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 font-bold">
                  {selectedUnit.code}
                </span>
                {(selectedUnit as any).levelName && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full border bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20">
                    {(selectedUnit as any).levelName}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-slate-400 font-normal">{placeholder || defaultPlaceholder}</span>
            )
          ) : (
            selectedMultiUnits.length > 0 ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                {selectedMultiUnits.slice(0, 2).map(u => (
                  <span key={u.id} className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-extrabold">
                    {u.name}
                  </span>
                ))}
                {selectedMultiUnits.length > 2 && (
                  <span className="text-[10px] font-bold text-slate-400">
                    +{selectedMultiUnits.length - 2} {isRtl ? 'وحدات أخرى' : 'more'}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-slate-400 font-normal">{placeholder || defaultPlaceholder}</span>
            )
          )}
        </div>

        <div className="flex items-center gap-1">
          {allowClear && (selectedUnit || selectedMultiUnits.length > 0) && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded text-slate-400 hover:text-rose-500 transition-all"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown size={15} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {error && <p className="text-[10px] font-bold text-rose-500 mt-1">{error}</p>}

      {/* Dropdown Menu */}
      {isOpen && (
        <div className={`absolute z-50 mt-1 w-full rounded-2xl border p-3 shadow-2xl space-y-2 max-h-80 overflow-y-auto ${
          theme === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
        }`}>
          {/* Search Bar */}
          <div className="relative">
            <Search size={14} className={`absolute top-2.5 text-slate-400 ${isRtl ? 'right-2.5' : 'left-2.5'}`} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={isRtl ? 'بحث باسم الوحدة أو الكود...' : 'Search unit or code...'}
              className={`w-full text-xs p-2 rounded-xl border focus:outline-none ${
                isRtl ? 'pr-8' : 'pl-8'
              } ${
                theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200'
              }`}
            />
          </div>

          {/* Tree Render */}
          <div className="space-y-1 pt-1">
            {treeData.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">
                {isRtl ? 'لا توجد وحدات تنظيمية مضافة بعد' : 'No organization units created yet'}
              </div>
            ) : (
              treeData.map(node => renderTreeNode(node, 0))
            )}
          </div>
        </div>
      )}

      {/* Automatic Inheritance Explanation Card */}
      {showInheritanceSummary && selectedUnit && mode === 'single' && (
        <div className="p-3 rounded-2xl border bg-emerald-500/5 border-emerald-500/20 text-xs space-y-1 animate-fade-in">
          <div className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
            <ShieldCheck size={15} />
            <span>
              {isRtl ? `توارث الصلاحيات النطاقية: [${selectedUnit.name}]` : `Scope Inheritance Active: [${selectedUnit.name}]`}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            {isRtl 
              ? `تعيين الموظف على هذه الوحدة يمنحه صلاحية الإشراف التلقائي على الوحدة الرئيسية بالإضافة إلى جميع الفروع والأقسام التابعة لها (${inheritedDescendants.length} وحدة فرعية متوارثة) بدون الحاجة لإعدادات إضافية.`
              : `Assigning user to this unit automatically grants authority over this unit and all its ${inheritedDescendants.length} sub-branches and descendant units without extra setup.`}
          </p>
          {inheritedDescendants.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap pt-1">
              <span className="text-[10px] font-bold text-slate-400">{isRtl ? 'الفروع التابعة:' : 'Sub-units:'}</span>
              {inheritedDescendants.slice(0, 4).map(d => (
                <span key={d.id} className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-bold">
                  {d.name}
                </span>
              ))}
              {inheritedDescendants.length > 4 && (
                <span className="text-[9px] text-slate-400 font-bold">+{inheritedDescendants.length - 4} {isRtl ? 'آخرين' : 'more'}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OrgUnitTreeSelect;
