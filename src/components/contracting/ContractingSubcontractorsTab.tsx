import React from 'react';
import { Plus } from 'lucide-react';
import { Subcontractor } from '../../types/contracting';

interface ContractingSubcontractorsTabProps {
  isRtl: boolean;
  subcontractors: Subcontractor[];
  setShowSubcontractorModal: (show: boolean) => void;
}

export const ContractingSubcontractorsTab: React.FC<ContractingSubcontractorsTabProps> = ({
  isRtl,
  subcontractors,
  setShowSubcontractorModal,
}) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {isRtl ? 'دليل مقاولي الباطن والعقود' : 'Subcontractors & Contracts Directory'}
          </h3>
          <p className="text-xs text-slate-500">
            {isRtl ? 'سجل شركات المقاولات الفرعية، العقود المبرمة، ونسب الخصم والمحتجزات' : 'Directory of sub-contractors and assigned scopes'}
          </p>
        </div>
        <button
          onClick={() => setShowSubcontractorModal(true)}
          className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
        >
          <Plus size={14} />
          <span>{isRtl ? 'إضافة مقاول باطن' : 'Add Subcontractor'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {subcontractors.map((s) => (
          <div key={s.id} className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-bold text-amber-600">{s.code}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">
                {s.status === 'ACTIVE' ? (isRtl ? 'نشط' : 'Active') : (isRtl ? 'غير نشط' : 'Inactive')}
              </span>
            </div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">{s.name}</h4>
            <p className="text-xs text-slate-500 mt-1">{isRtl ? 'التخصص:' : 'Specialty:'} <span className="font-semibold text-slate-700 dark:text-slate-300">{s.specialty}</span></p>
            <div className="flex items-center justify-between mt-4 border-t border-slate-100 dark:border-slate-700 pt-3 text-xs">
              <span className="text-slate-500">{s.phone}</span>
              <span className="font-medium text-slate-400">{isRtl ? 'س.ت:' : 'CR:'} {s.commercial_register || 'غير مدخل'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
