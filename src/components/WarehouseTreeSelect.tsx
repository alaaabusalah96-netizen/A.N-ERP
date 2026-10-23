import React, { useState, useMemo } from 'react';
import { Warehouse, WarehouseTreeNode } from '../types/inventory';
import { WarehouseHierarchyEngine } from '../db/warehouseHierarchyEngine';
import { InventoryModule } from '../db/inventory';
import { 
  Warehouse as WarehouseIcon, 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  Layers, 
  Search, 
  Check, 
  X,
  SlidersHorizontal,
  Info
} from 'lucide-react';

export interface WarehouseTreeSelectProps {
  value: string;
  onChange: (warehouseId: string, warehouse?: Warehouse) => void;
  companyId: string;
  placeholder?: string;
  isRtl?: boolean;
  theme?: 'light' | 'dark';
  disabled?: boolean;
  required?: boolean;
  className?: string;
  filterTypeCode?: string | string[]; // e.g. 'DAMAGED' or ['MAIN', 'SUB']
  excludeId?: string; // exclude specific warehouse (e.g. self)
  label?: string;
  error?: string;
  showTreeModalButton?: boolean;
}

// Type badge helper
function getTypeBadgeColor(typeCode?: string) {
  switch (typeCode) {
    case 'MAIN':
      return 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20';
    case 'SUB':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
    case 'PRODUCTION':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
    case 'RAW_MATERIAL':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
    case 'FINISHED_GOODS':
      return 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20';
    case 'RETURNS':
      return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';
    case 'DAMAGED':
      return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
    case 'TRANSIT':
      return 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20';
    case 'SPARE_PARTS':
      return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';
    default:
      return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';
  }
}

function getTypeLabel(typeCode?: string, isRtl: boolean = true) {
  switch (typeCode) {
    case 'MAIN': return isRtl ? 'رئيسي' : 'Main';
    case 'SUB': return isRtl ? 'فرعي' : 'Sub';
    case 'PRODUCTION': return isRtl ? 'إنتاج' : 'Production';
    case 'RAW_MATERIAL': return isRtl ? 'مواد خام' : 'Raw Mat';
    case 'FINISHED_GOODS': return isRtl ? 'منتج تام' : 'Finished';
    case 'RETURNS': return isRtl ? 'مرتجعات' : 'Returns';
    case 'DAMAGED': return isRtl ? 'خردة' : 'Damaged';
    case 'TRANSIT': return isRtl ? 'ترانزيت' : 'Transit';
    case 'SPARE_PARTS': return isRtl ? 'قطع غيار' : 'Spare Parts';
    default: return typeCode || (isRtl ? 'عام' : 'General');
  }
}

// Flatten tree into formatted list for standard <select> options with hierarchy indentation symbols
interface FormattedSelectOption {
  id: string;
  name: string;
  code: string;
  level: number;
  typeCode?: string;
  indentedName: string;
  warehouse: Warehouse;
}

function flattenTreeForSelect(
  nodes: WarehouseTreeNode[],
  isRtl: boolean,
  prefix: string = '',
  level: number = 0,
  excludeId?: string,
  filterTypeCode?: string | string[]
): FormattedSelectOption[] {
  let options: FormattedSelectOption[] = [];

  const filterCodes = Array.isArray(filterTypeCode) ? filterTypeCode : filterTypeCode ? [filterTypeCode] : null;

  nodes.forEach((node, index) => {
    if (excludeId && node.id === excludeId) return;

    const isLast = index === nodes.length - 1;
    const branchSymbol = level === 0 ? '' : isLast ? (isRtl ? '└── ' : '└── ') : (isRtl ? '├── ' : '├── ');
    const indentSpace = '  '.repeat(level);
    const typeTag = node.type_code ? ` [${getTypeLabel(node.type_code, isRtl)}]` : '';
    const indentedName = `${indentSpace}${branchSymbol}${node.name} (${node.code})${typeTag}`;

    const matchesFilter = !filterCodes || (node.type_code && filterCodes.includes(node.type_code));

    if (matchesFilter) {
      options.push({
        id: node.id,
        name: node.name,
        code: node.code,
        level: node.level ?? level,
        typeCode: node.type_code,
        indentedName,
        warehouse: node,
      });
    }

    if (node.children && node.children.length > 0) {
      const childOptions = flattenTreeForSelect(
        node.children,
        isRtl,
        prefix,
        level + 1,
        excludeId,
        filterTypeCode
      );
      options = options.concat(childOptions);
    }
  });

  return options;
}

export const WarehouseTreeSelect: React.FC<WarehouseTreeSelectProps> = ({
  value,
  onChange,
  companyId,
  placeholder,
  isRtl = true,
  theme = 'light',
  disabled = false,
  required = false,
  className = '',
  filterTypeCode,
  excludeId,
  label,
  error,
  showTreeModalButton = true,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedNodeIds, setExpandedNodeIds] = useState<Record<string, boolean>>({});

  // Build warehouse tree
  const treeNodes = useMemo(() => {
    return WarehouseHierarchyEngine.buildWarehouseTree(companyId);
  }, [companyId]);

  // Flat list with indentation for select dropdown
  const flatSelectOptions = useMemo(() => {
    return flattenTreeForSelect(treeNodes, isRtl, '', 0, excludeId, filterTypeCode);
  }, [treeNodes, isRtl, excludeId, filterTypeCode]);

  // All flat warehouses
  const allWarehouses = useMemo(() => {
    return InventoryModule.getWarehouses(companyId);
  }, [companyId]);

  const selectedWarehouse = useMemo(() => {
    return allWarehouses.find(w => w.id === value);
  }, [allWarehouses, value]);

  const defaultPlaceholder = placeholder || (isRtl ? '-- اختر المستودع من الهيكل --' : '-- Select Warehouse from Hierarchy --');

  // Toggle tree node expansion
  const toggleExpand = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodeIds(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  // Filtered tree for tree modal search
  const filterTree = (nodes: WarehouseTreeNode[], query: string): WarehouseTreeNode[] => {
    if (!query.trim()) return nodes;
    const q = query.toLowerCase().trim();

    return nodes.reduce<WarehouseTreeNode[]>((acc, node) => {
      const nameMatch = node.name.toLowerCase().includes(q) || node.code.toLowerCase().includes(q);
      const filteredChildren = node.children ? filterTree(node.children, query) : [];

      if (nameMatch || filteredChildren.length > 0) {
        acc.push({
          ...node,
          children: filteredChildren,
        });
      }
      return acc;
    }, []);
  };

  const filteredModalTree = useMemo(() => {
    return filterTree(treeNodes, searchQuery);
  }, [treeNodes, searchQuery]);

  // Recursive Tree Node component inside Modal
  const renderTreeNode = (node: WarehouseTreeNode, depth: number = 0) => {
    const isSelected = node.id === value;
    const isExpanded = expandedNodeIds[node.id] ?? true; // default expanded
    const hasChildren = node.children && node.children.length > 0;
    const stockQty = InventoryModule.getWarehouseTotalStock(node.id);

    return (
      <div key={node.id} className="select-none">
        <div
          onClick={() => {
            onChange(node.id, node);
            setIsModalOpen(false);
          }}
          style={{ paddingRight: isRtl ? `${depth * 20 + 12}px` : undefined, paddingLeft: !isRtl ? `${depth * 20 + 12}px` : undefined }}
          className={`group flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
            isSelected
              ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold'
              : theme === 'dark'
                ? 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800 text-slate-200'
                : 'bg-white border-slate-200/80 hover:bg-slate-50 text-slate-800'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => toggleExpand(node.id, e)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
              >
                {isExpanded ? <ChevronDown size={14} /> : (isRtl ? <ChevronDown size={14} className="-rotate-90" /> : <ChevronRight size={14} />)}
              </button>
            ) : (
              <span className="w-5" />
            )}

            <WarehouseIcon size={16} className={isSelected ? 'text-emerald-500' : 'text-slate-400'} />

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold truncate">{node.name}</span>
                <span className="text-[10px] font-mono text-slate-400">[{node.code}]</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold ${getTypeBadgeColor(node.type_code)}`}>
                  {getTypeLabel(node.type_code, isRtl)}
                </span>
              </div>
              {node.location && (
                <span className="text-[10px] text-slate-400 truncate">{node.location}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right text-[10px] text-slate-400 font-mono">
              <span className="font-bold text-slate-700 dark:text-slate-300">{stockQty}</span> {isRtl ? 'وحدة' : 'units'}
            </div>

            {isSelected && <Check size={16} className="text-emerald-500 shrink-0" />}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="mt-1 space-y-1">
            {node.children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className={`block text-xs font-bold mb-1.5 ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <select
            value={value}
            disabled={disabled}
            onChange={(e) => {
              const selectedId = e.target.value;
              const wh = allWarehouses.find(w => w.id === selectedId);
              onChange(selectedId, wh);
            }}
            className={`w-full px-3.5 py-2 text-xs border rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 appearance-none ${
              theme === 'dark' ? 'text-slate-100 bg-[#1e293b] border-[#334155]' : 'text-slate-800 bg-white border-slate-200'
            } ${error ? 'border-rose-500' : ''} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <option value="">{defaultPlaceholder}</option>
            {flatSelectOptions.map(opt => (
              <option key={opt.id} value={opt.id}>
                {opt.indentedName}
              </option>
            ))}
          </select>

          {/* Chevron dropdown icon */}
          <div className={`absolute top-1/2 -translate-y-1/2 pointer-events-none ${isRtl ? 'left-3' : 'right-3'} text-slate-400`}>
            <ChevronDown size={14} />
          </div>
        </div>

        {showTreeModalButton && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setIsModalOpen(true)}
            title={isRtl ? 'تصفح مستودعات الشركة في شجرة تفاعلية' : 'Browse warehouse hierarchy tree'}
            className={`p-2 rounded-xl border text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
              theme === 'dark'
                ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
            }`}
          >
            <Layers size={14} className="text-emerald-500" />
            <span className="hidden sm:inline text-[11px]">{isRtl ? 'الشجرة' : 'Tree'}</span>
          </button>
        )}
      </div>

      {/* Selected warehouse parent path hint */}
      {selectedWarehouse && (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400 font-mono">
          <Info size={11} className="text-emerald-500 shrink-0" />
          <span>
            {isRtl ? 'الموقع بالهيكل: ' : 'Hierarchy Path: '}
            <strong className="text-slate-600 dark:text-slate-300">
              {selectedWarehouse.path || `/${selectedWarehouse.name}`}
            </strong>
          </span>
        </div>
      )}

      {error && (
        <p className="text-[10px] text-rose-500 font-semibold mt-1 flex items-center gap-1">
          {error}
        </p>
      )}

      {/* Interactive Warehouse Hierarchy Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden ${
            theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-900'
          }`}>
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                  <Layers size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold">
                    {isRtl ? 'شجرة ومستودعات الشركة الهرمية' : 'Warehouse Hierarchy Tree'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {isRtl ? 'اختر المستودع المطلوبة للعملية من الهيكل التنظيمي للمستودعات' : 'Browse and select target warehouse from tree layout'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Search Input */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <div className="relative">
                <Search size={14} className={`absolute top-1/2 -translate-y-1/2 text-slate-400 ${isRtl ? 'right-3' : 'left-3'}`} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={isRtl ? 'ابحث باسم أو كود المستودع...' : 'Search warehouse name or code...'}
                  className={`w-full py-2 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                    isRtl ? 'pr-9 pl-3' : 'pl-9 pr-3'
                  } ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}`}
                />
              </div>
            </div>

            {/* Modal Tree View List */}
            <div className="p-4 flex-1 overflow-y-auto space-y-2">
              {filteredModalTree.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  {isRtl ? 'لا توجد مستودعات مطابقة لمفتاح البحث' : 'No warehouses matched your search'}
                </div>
              ) : (
                filteredModalTree.map(node => renderTreeNode(node, 0))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs bg-slate-50/50 dark:bg-slate-800/30">
              <div className="text-[11px] text-slate-400">
                {isRtl ? `إجمالي المستودعات: ${allWarehouses.length}` : `Total Warehouses: ${allWarehouses.length}`}
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-800 dark:text-slate-200 font-bold rounded-xl"
              >
                {isRtl ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WarehouseTreeSelect;
