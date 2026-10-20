import React, { useState } from 'react';
import { Building2, Network } from 'lucide-react';
import { CompanyWizardView } from './CompanyWizardView';
import { OrgGroupsView } from './OrgGroupsView';

export type PlatformHubTab = 'companies' | 'groups';

interface PlatformHubViewProps {
  onNotification: (msg: string) => void;
  initialTab?: PlatformHubTab;
}

/**
 * UI-PLATFORM-HUB-1: single platform screen for company create + org groups.
 * Child views keep their own APIs; this is UI composition only.
 */
export const PlatformHubView: React.FC<PlatformHubViewProps> = ({
  onNotification,
  initialTab = 'companies',
}) => {
  const [tab, setTab] = useState<PlatformHubTab>(initialTab);

  return (
    <div className="space-y-4">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <h2 className="text-lg font-bold text-slate-900">المنصة: شركات ومجموعات</h2>
        <p className="text-xs text-slate-500 mt-1">
          شاشة موحّدة لإنشاء منشأة (معالج المنصة) وإدارة مجموعات الشركات والأصناف — دون تغيير مسارات الـ API.
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          <button
            type="button"
            onClick={() => setTab('companies')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold ${
              tab === 'companies' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            <Building2 className="w-4 h-4" />
            إنشاء منشأة
          </button>
          <button
            type="button"
            onClick={() => setTab('groups')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold ${
              tab === 'groups' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            <Network className="w-4 h-4" />
            مجموعات الشركات وأصنافها
          </button>
        </div>
      </div>

      {tab === 'companies' && <CompanyWizardView onNotification={onNotification} />}
      {tab === 'groups' && <OrgGroupsView onNotification={onNotification} />}
    </div>
  );
};
