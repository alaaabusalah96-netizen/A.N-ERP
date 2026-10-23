import React from 'react';
import { Building2, Plus } from 'lucide-react';
import { ContractingProject, BOQItem } from '../../types/contracting';

interface ContractingProjectsTabProps {
  isRtl: boolean;
  projects: ContractingProject[];
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  boqItems: BOQItem[];
}

export const ContractingProjectsTab: React.FC<ContractingProjectsTabProps> = ({
  isRtl,
  projects,
  selectedProjectId,
  setSelectedProjectId,
  boqItems,
}) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Projects Directory List */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center justify-between">
            <span>{isRtl ? 'سجل المشاريع والمواقع' : 'Projects Directory'}</span>
            <span className="text-xs bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-full">{projects.length}</span>
          </h3>
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {projects.map((p) => {
              const isSelected = p.id === selectedProjectId;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedProjectId(p.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-amber-500 bg-amber-500/5 dark:bg-amber-500/10'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400">{p.code}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600">
                      {p.status === 'IN_PROGRESS' ? (isRtl ? 'قيد التنفيذ' : 'In Progress') : (isRtl ? 'مكتمل' : 'Completed')}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">{p.name}</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{p.client_name} - {p.location}</p>
                  <div className="flex items-center justify-between mt-3 text-xs border-t border-slate-100 dark:border-slate-700 pt-2">
                    <span className="text-slate-500">{isRtl ? 'قيمة العقد:' : 'Value:'}</span>
                    <span className="font-bold text-slate-900 dark:text-white">{p.contract_value.toLocaleString()} ج.م</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Project BOQ Items (جدول مقايسة بنود الكميات) */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {isRtl ? 'جدول المقايسة وبنود الكميات (BOQ)' : 'Bill of Quantities (BOQ)'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {isRtl ? 'البنود المتعاقد عليها ومواصفات وأسعار الوحدة لكل بند بالمشروع' : 'Contracted items, units, and unit rates'}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-100 dark:bg-slate-700/50 text-slate-900 dark:text-slate-100 font-bold uppercase text-[11px]">
                <tr>
                  <th className="p-2.5 rounded-r-lg">بند#</th>
                  <th className="p-2.5">الوصف والمواصفات الفنية</th>
                  <th className="p-2.5 text-center">الوحدة</th>
                  <th className="p-2.5 text-center">الكمية التعاقدية</th>
                  <th className="p-2.5 text-center">فئة الوحدة</th>
                  <th className="p-2.5 text-left rounded-l-lg">الإجمالي التعاقدي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700 font-medium">
                {boqItems.map((boq) => (
                  <tr key={boq.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="p-2.5 font-bold font-mono text-amber-600">{boq.item_number}</td>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-white">{boq.description}</td>
                    <td className="p-2.5 text-center font-bold bg-slate-50 dark:bg-slate-700/20">{boq.unit}</td>
                    <td className="p-2.5 text-center font-bold">{boq.contracted_qty.toLocaleString()}</td>
                    <td className="p-2.5 text-center">{boq.unit_price.toLocaleString()} ج.م</td>
                    <td className="p-2.5 text-left font-black text-slate-900 dark:text-white">
                      {boq.total_amount.toLocaleString()} ج.م
                    </td>
                  </tr>
                ))}
                {!boqItems.length && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400">
                      {isRtl ? 'لا توجد بنود مقايسة مسجلة لهذا المشروع بعد.' : 'No BOQ items listed for this project yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
