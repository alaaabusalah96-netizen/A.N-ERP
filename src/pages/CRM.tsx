import React, { useState, useEffect } from 'react';
import { 
  Users, Plus, Phone, Mail, FileText, Check, X, 
  Search, Award, DollarSign, Calendar, MessageSquare, 
  Clock, ArrowRight, TrendingUp, AlertCircle, Loader2
} from 'lucide-react';
import { StorageEngine } from '../db/storage';
import { UsersModule } from '../db/users';
import { CompaniesModule } from '../db/companies';
import { LogsModule } from '../db/logs';
import { LeadsModule, Lead, LeadInteraction } from '../db/leads';
import { SalesBusinessEngine } from '../lib/enterprise/sales_engine';

export type { Lead, LeadInteraction };

interface CRMProps {
  language: 'ar' | 'en';
  theme: 'light' | 'dark';
}

export default function CRM({ language, theme }: CRMProps) {
  const isRtl = language === 'ar';
  const activeUser = UsersModule.getActiveUser();
  const companyId = activeUser?.company_id || CompaniesModule.getSelectedCompanyId() || '';

  // Core CRM States
  const [leads, setLeads] = useState<Lead[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'pipeline' | 'directory'>('pipeline');

  // Modals & form states
  const [showAddLead, setShowAddLead] = useState(false);
  const [viewLeadDetails, setViewLeadDetails] = useState<Lead | null>(null);

  // Submitting States
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);
  const [isSubmittingInteraction, setIsSubmittingInteraction] = useState(false);
  const [updatingStageLeadId, setUpdatingStageLeadId] = useState<string | null>(null);

  // Form States - Lead
  const [leadForm, setLeadForm] = useState({
    name: '', phone: '', email: '', source: 'Social Media', dealValue: 0, notes: '', assignedTo: ''
  });

  // Form States - Interaction log
  const [interactionForm, setInteractionForm] = useState({
    type: 'CALL' as 'CALL' | 'MEETING' | 'EMAIL', summary: '', date: new Date().toISOString().split('T')[0]
  });

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  // Load leads
  const loadLeads = () => {
    const allLeads = StorageEngine.getStored<Lead[]>('leads', []);
    const companyLeads = allLeads.filter(l => l.company_id === companyId);

    if (companyLeads.length === 0) {
      // Seed default leads
      const defaultLeads: Lead[] = [
        {
          id: 'lead-1',
          company_id: companyId,
          name: isRtl ? 'مزرعة الأمل لتسمين المواشي' : 'Al-Amal Feedlot Farms',
          phone: '+201124455889',
          email: 'purchase@alamalfarms.com',
          source: 'Website',
          status: 'QUALIFIED',
          dealValue: 120000,
          assignedTo: activeUser?.full_name || 'System Admin',
          notes: 'مهتمون بشراء شحنة 10 طن من أعلاف التسمين الممتازة مع عقد ربع سنوي.',
          createdAt: new Date().toISOString(),
          interactions: [
            { id: 'int-1', type: 'CALL', summary: 'الاتصال الأول والتعريف بأسعار الطن للشحنات الكبيرة.', date: '2026-07-15' }
          ]
        },
        {
          id: 'lead-2',
          company_id: companyId,
          name: isRtl ? 'المهندس مصطفى محمود (وكيل دواجن)' : 'Eng. Mostafa Mahmoud (Poultry Broker)',
          phone: '+201099112233',
          email: 'mostafa@gmail.com',
          source: 'Social Media',
          status: 'PROSPECT',
          dealValue: 45000,
          assignedTo: activeUser?.full_name || 'System Admin',
          notes: 'يبحث عن كتاكيت عمر يوم واحد سلالة هبرد بإنتاجية عالية لفروع الغربية.',
          createdAt: new Date().toISOString(),
          interactions: []
        }
      ];
      StorageEngine.setStored('leads', [...allLeads, ...defaultLeads]);
      setLeads(defaultLeads);
    } else {
      setLeads(companyLeads);
    }
  };

  useEffect(() => {
    loadLeads();
    const onUpdate = () => loadLeads();
    window.addEventListener('custody_db_updated', onUpdate);
    return () => window.removeEventListener('custody_db_updated', onUpdate);
  }, [companyId]);

  // Calculations
  const totalPipelineValue = leads.reduce((sum, l) => sum + l.dealValue, 0);
  const activeLeadsCount = leads.filter(l => l.status !== 'WON' && l.status !== 'LOST').length;
  const wonValue = leads.filter(l => l.status === 'WON').reduce((sum, l) => sum + l.dealValue, 0);

  // Submit Lead
  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) {
      showToast('error', isRtl ? 'يرجى اختيار شركة أولاً' : 'Please select a company first');
      return;
    }
    if (!leadForm.name) {
      showToast('error', isRtl ? 'يرجى إدخال اسم العميل المحتمل' : 'Please input prospect name');
      return;
    }

    setIsSubmittingLead(true);
    try {
      const newLead: Lead = {
        id: `lead-${Date.now()}`,
        company_id: companyId,
        name: leadForm.name,
        phone: leadForm.phone,
        email: leadForm.email,
        source: leadForm.source,
        status: 'PROSPECT',
        dealValue: Number(leadForm.dealValue) || 0,
        assignedTo: leadForm.assignedTo || activeUser?.full_name || 'System Client',
        notes: leadForm.notes,
        interactions: [],
        createdAt: new Date().toISOString()
      };

      const res = await LeadsModule.saveLeadAsync(newLead);
      if (!res.success) {
        showToast('error', res.error || (isRtl ? 'فشل حفظ الفرصة في قاعدة البيانات' : 'Failed to save lead to database'));
        return;
      }

      // Logs
      LogsModule.addLog(
        activeUser?.id || 'system',
        activeUser?.full_name || 'System',
        isRtl ? 'تسجيل فرصة بيعية جديدة' : 'Register New CRM Lead',
        `Registered prospect ${newLead.name} with expected value ${newLead.dealValue.toLocaleString()} EGP`
      );

      showToast('success', isRtl ? 'تم تسجيل الفرصة البيعية بنجاح' : 'CRM lead registered successfully');
      setLeadForm({ name: '', phone: '', email: '', source: 'Social Media', dealValue: 0, notes: '', assignedTo: '' });
      setShowAddLead(false);
      loadLeads();
    } catch (err: any) {
      showToast('error', err?.message || (isRtl ? 'حدث خطأ غير متوقع أثناء الحفظ' : 'Unexpected error during save'));
    } finally {
      setIsSubmittingLead(false);
    }
  };

  // Add Interaction Log
  const handleAddInteraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewLeadDetails || !interactionForm.summary) return;

    setIsSubmittingInteraction(true);
    try {
      const newInt: LeadInteraction = {
        id: `int-${Date.now()}`,
        type: interactionForm.type,
        summary: interactionForm.summary,
        date: interactionForm.date
      };

      const res = await LeadsModule.addInteractionAsync(viewLeadDetails.id, newInt);
      if (!res.success) {
        showToast('error', res.error || (isRtl ? 'فشل تسجيل النشاط في قاعدة البيانات' : 'Failed to log interaction to database'));
        return;
      }

      showToast('success', isRtl ? 'تم إضافة سجل التواصل والنشاط' : 'Interaction logged successfully');
      setInteractionForm({ type: 'CALL', summary: '', date: new Date().toISOString().split('T')[0] });
      
      // Update active viewed lead
      if (res.lead) {
        setViewLeadDetails(res.lead);
      }
      loadLeads();
    } catch (err: any) {
      showToast('error', err?.message || (isRtl ? 'حدث خطأ أثناء تسجيل النشاط' : 'Unexpected error logging interaction'));
    } finally {
      setIsSubmittingInteraction(false);
    }
  };

  // Change Lead pipeline Stage
  const changeLeadStage = async (leadId: string, nextStatus: Lead['status']) => {
    if (updatingStageLeadId) return; // Prevent concurrent stage modifications

    setUpdatingStageLeadId(leadId);
    try {
      const res = await LeadsModule.updateLeadStageAsync(
        leadId,
        nextStatus,
        activeUser?.id,
        activeUser?.full_name,
        isRtl
      );

      if (!res.success) {
        showToast('error', res.error || (isRtl ? 'فشل تحديث حالة الفرصة البيعية' : 'Failed to update lead status'));
        return;
      }

      const leadObj = res.lead;
      if (leadObj) {
        // Auto-convert Lead to Customer & Sales Invoice on Closed Won
        if (nextStatus === 'WON') {
          try {
            await SalesBusinessEngine.convertLeadToCustomerAndInvoice(
              companyId,
              activeUser?.id || 'system',
              {
                leadId: leadObj.id,
                leadName: leadObj.name,
                phone: leadObj.phone,
                email: leadObj.email,
                dealValue: leadObj.dealValue
              }
            );
            showToast(
              'success',
              isRtl
                ? 'تم الفوز بالصفقة وتحويل الفرصة إلى عميل دائم وإصدار فاتورة المبيعات القيد المحاسبي!'
                : 'Deal won! Lead converted to permanent customer & sales invoice issued.'
            );
          } catch (err) {
            console.error('Error converting lead to customer:', err);
          }
        } else {
          showToast('success', isRtl ? 'تم ترقية صفقة العميل بالمرحلة' : 'Lead stage updated successfully');
        }
      }

      loadLeads();
    } catch (err: any) {
      showToast('error', err?.message || (isRtl ? 'حدث خطأ أثناء تغيير المرحلة' : 'Unexpected error changing stage'));
    } finally {
      setUpdatingStageLeadId(null);
    }
  };

  // Search filter
  const filteredLeads = leads.filter(l => 
    l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.assignedTo.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Grouped stages
  const pipelineStages: { id: Lead['status']; titleAr: string; titleEn: string; color: string }[] = [
    { id: 'PROSPECT', titleAr: 'فرصة جديدة', titleEn: 'New Leads', color: 'bg-slate-500/10 text-slate-500 border-slate-500/20' },
    { id: 'CONTACTED', titleAr: 'تم التواصل', titleEn: 'Contacted', color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' },
    { id: 'QUALIFIED', titleAr: 'مؤهل للشراء', titleEn: 'Qualified', color: 'bg-sky-500/10 text-sky-500 border-sky-500/20' },
    { id: 'PROPOSAL_SENT', titleAr: 'عرض السعر', titleEn: 'Proposal Sent', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
    { id: 'WON', titleAr: 'تم الفوز بها 🎉', titleEn: 'Closed Won 🎉', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
    { id: 'LOST', titleAr: 'خسارة صفقة ❌', titleEn: 'Closed Lost ❌', color: 'bg-rose-500/10 text-rose-600 border-rose-500/20' }
  ];

  return (
    <div className="space-y-6">
      
      {/* Toast feedback */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 p-4 rounded-xl shadow-lg border text-white flex items-center gap-3 transition-all ${
          toast.type === 'success' ? 'bg-emerald-600 border-emerald-500' : 'bg-rose-600 border-rose-500'
        }`}>
          <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
          <span className="text-xs font-bold font-sans">{toast.text}</span>
        </div>
      )}

      {/* CRM Main Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="text-emerald-500 h-6 w-6" />
            <span>{isRtl ? 'إدارة المبيعات وعلاقات العملاء CRM' : 'Customer Relationship (CRM)'}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isRtl 
              ? 'متابعة قنوات المبيعات والفرص الاستثمارية للشركة، وجدولة المتابعات وسجل الاتصال والاجتماعات.' 
              : 'Pipeline deal tracking, client prospects acquisition, and corporate interaction logger.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddLead(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>{isRtl ? 'تسجيل فرصة عميل جديدة' : 'Register CRM Lead'}</span>
          </button>
        </div>
      </div>

      {/* KPI Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{isRtl ? 'حجم الصفقات المعلقة الكلي' : 'Pipeline Expected Value'}</p>
            <h3 className="text-lg font-black text-slate-800 dark:text-white mt-1">{totalPipelineValue.toLocaleString()} EGP</h3>
          </div>
          <div className="p-2 bg-indigo-500/10 text-indigo-600 rounded-xl">
            <DollarSign className="h-5 w-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{isRtl ? 'الفرص الفعالة والمتابعة' : 'Active Leads Count'}</p>
            <h3 className="text-lg font-black text-slate-800 dark:text-white mt-1">{activeLeadsCount} {isRtl ? 'فرصة' : 'Leads'}</h3>
          </div>
          <div className="p-2 bg-sky-500/10 text-sky-600 rounded-xl">
            <Clock className="h-5 w-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{isRtl ? 'الصفقات المغلقة الناجحة' : 'Closed Won Value'}</p>
            <h3 className="text-lg font-black text-emerald-600 mt-1">{wonValue.toLocaleString()} EGP</h3>
          </div>
          <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-xl">
            <Award className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* CRM Navigation Tab lists */}
      <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-1">
        {(['pipeline', 'directory'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-bold transition-all border-b-2 cursor-pointer ${
              activeTab === tab
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            {tab === 'pipeline' && (isRtl ? 'مسار الصفقات Pipeline' : 'Deals Funnel Pipeline')}
            {tab === 'directory' && (isRtl ? 'سجل تواصل ومتابعة العملاء' : 'Client Relations Directory')}
          </button>
        ))}
      </div>

      {/* Pipeline View (Funnel stages) */}
      {activeTab === 'pipeline' && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-[1100px] h-[500px]">
            {pipelineStages.map((stage) => {
              const stageLeads = filteredLeads.filter(l => l.status === stage.id);
              return (
                <div key={stage.id} className="flex-1 min-w-[200px] bg-slate-50 dark:bg-slate-950/30 rounded-2xl border border-slate-100 dark:border-slate-800/60 p-3 flex flex-col justify-between">
                  <div>
                    {/* Stage Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-200/50 dark:border-slate-800">
                      <h4 className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                        {isRtl ? stage.titleAr : stage.titleEn}
                      </h4>
                      <span className="text-[10px] font-mono bg-slate-200/50 dark:bg-slate-800 px-1.5 py-0.5 rounded font-extrabold">
                        {stageLeads.length}
                      </span>
                    </div>

                    {/* Stage Leads list */}
                    <div className="space-y-3 mt-3 overflow-y-auto max-h-[380px]">
                      {stageLeads.map(lead => (
                        <div 
                          key={lead.id} 
                          className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-xl hover:shadow-sm transition-all text-xs"
                        >
                          <h5 className="font-extrabold text-slate-800 dark:text-slate-100">{lead.name}</h5>
                          <p className="text-[10px] font-mono text-emerald-600 font-bold mt-1">
                            {lead.dealValue.toLocaleString()} EGP
                          </p>

                          <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/50">
                            <button
                              onClick={() => setViewLeadDetails(lead)}
                              className="text-[10px] font-extrabold text-indigo-500 hover:text-indigo-600"
                            >
                              {isRtl ? 'التفاعلات والنشاط' : 'Log interaction'}
                            </button>

                            {/* Move Stage Actions */}
                            <div className="flex items-center gap-1">
                              {stage.id !== 'WON' && stage.id !== 'LOST' && (
                                <>
                                  <button
                                    onClick={() => {
                                      const nextMap: Record<string, Lead['status']> = {
                                        'PROSPECT': 'CONTACTED',
                                        'CONTACTED': 'QUALIFIED',
                                        'QUALIFIED': 'PROPOSAL_SENT',
                                        'PROPOSAL_SENT': 'WON'
                                      };
                                      changeLeadStage(lead.id, nextMap[stage.id]);
                                    }}
                                    disabled={updatingStageLeadId === lead.id}
                                    className="p-1 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-[9px] font-bold"
                                    title={isRtl ? 'ترقية للمرحلة التالية' : 'Advance'}
                                  >
                                    {updatingStageLeadId === lead.id ? (
                                      <Loader2 size={10} className="animate-spin" />
                                    ) : (
                                      <ArrowRight size={10} />
                                    )}
                                  </button>
                                  <button
                                    onClick={() => changeLeadStage(lead.id, 'LOST')}
                                    disabled={updatingStageLeadId === lead.id}
                                    className="p-1 bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-[9px]"
                                    title={isRtl ? 'خسارة الصفقة' : 'Mark Lost'}
                                  >
                                    <X size={10} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Directory View */}
      {activeTab === 'directory' && (
        <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                  <th className="p-3">{isRtl ? 'اسم الفرصة' : 'Prospect Name'}</th>
                  <th className="p-3">{isRtl ? 'رقم الهاتف' : 'Phone'}</th>
                  <th className="p-3">{isRtl ? 'مصدر العميل' : 'Source'}</th>
                  <th className="p-3">{isRtl ? 'القيمة المتوقعة' : 'Value'}</th>
                  <th className="p-3">{isRtl ? 'المسؤول' : 'Rep Assigned'}</th>
                  <th className="p-3 text-center">{isRtl ? 'مرحلة البيع' : 'Stage'}</th>
                  <th className="p-3 text-center">{isRtl ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs text-slate-700 dark:text-slate-200">
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-950/30">
                    <td className="p-3 font-bold">{lead.name}</td>
                    <td className="p-3 font-mono text-slate-500">{lead.phone}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full text-[10px] font-bold">
                        {lead.source}
                      </span>
                    </td>
                    <td className="p-3 font-bold font-mono text-emerald-600">{lead.dealValue.toLocaleString()} EGP</td>
                    <td className="p-3 font-semibold">{lead.assignedTo}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        lead.status === 'WON' ? 'bg-emerald-500/10 text-emerald-600' :
                        lead.status === 'LOST' ? 'bg-rose-500/10 text-rose-600' :
                        'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => setViewLeadDetails(lead)}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg font-bold"
                      >
                        {isRtl ? 'سجل النشاط' : 'Manage Interactions'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: REGISTER LEAD */}
      {showAddLead && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setShowAddLead(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <X size={16} />
            </button>
            <h3 className="text-md font-black text-slate-800 dark:text-white mb-4 flex items-center gap-2">
              <Users className="text-emerald-500 h-5 w-5" />
              <span>{isRtl ? 'تسجيل فرصة عميل جديدة' : 'Register New CRM Lead'}</span>
            </h3>

            <form onSubmit={handleAddLead} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'اسم الجهة / العميل المحتمل *' : 'Lead / Company Name *'}</label>
                <input
                  type="text"
                  required
                  value={leadForm.name}
                  onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'رقم الهاتف' : 'Phone'}</label>
                  <input
                    type="text"
                    value={leadForm.phone}
                    onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'البريد الإلكتروني' : 'Email'}</label>
                  <input
                    type="email"
                    value={leadForm.email}
                    onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'قيمة الصفقة المقدرة' : 'Estimated Deal Value (EGP)'}</label>
                  <input
                    type="number"
                    value={leadForm.dealValue}
                    onChange={(e) => setLeadForm({ ...leadForm, dealValue: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'مصدر العميل' : 'Lead Source'}</label>
                  <select
                    value={leadForm.source}
                    onChange={(e) => setLeadForm({ ...leadForm, source: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-100"
                  >
                    <option value="Social Media">{isRtl ? 'شبكات التواصل' : 'Social Media'}</option>
                    <option value="Direct Visit">{isRtl ? 'زيارة ميدانية مباشرة' : 'Direct Visit'}</option>
                    <option value="Website">{isRtl ? 'موقع إلكتروني' : 'Website'}</option>
                    <option value="Referral">{isRtl ? 'توصية / زميل' : 'Referral'}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'المندوب / المندوبة المسؤول' : 'Sales Representative'}</label>
                <input
                  type="text"
                  placeholder="e.g. Ahmed, Sara..."
                  value={leadForm.assignedTo}
                  onChange={(e) => setLeadForm({ ...leadForm, assignedTo: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">{isRtl ? 'ملاحظات الفرصة البيعية' : 'Additional Notes'}</label>
                <textarea
                  value={leadForm.notes}
                  onChange={(e) => setLeadForm({ ...leadForm, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-emerald-500 text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddLead(false)}
                  disabled={isSubmittingLead}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 text-xs font-bold rounded-xl"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingLead}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
                >
                  {isSubmittingLead && <Loader2 size={12} className="animate-spin" />}
                  <span>{isRtl ? 'حفظ الفرصة البيعية' : 'Save CRM Lead'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: LEAD INTERACTIONS LOGGER */}
      {viewLeadDetails && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setViewLeadDetails(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <X size={16} />
            </button>
            <h3 className="text-md font-black text-slate-800 dark:text-white mb-2">{viewLeadDetails.name}</h3>
            <p className="text-xs text-slate-400 font-medium mb-4">{isRtl ? 'إدارة التفاعلات والمتابعة للعميل المحتمل' : 'Manage Interactions History & Next Steps'}</p>

            {/* Interaction Form Log */}
            <form onSubmit={handleAddInteraction} className="p-4 rounded-xl border border-slate-200/60 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 space-y-4 mb-5">
              <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">{isRtl ? 'إضافة سجل تواصل ونشاط جديد' : 'Log New Interaction Activity'}</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">{isRtl ? 'نوع التواصل' : 'Activity Type'}</label>
                  <select
                    value={interactionForm.type}
                    onChange={(e) => setInteractionForm({ ...interactionForm, type: e.target.value as any })}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                  >
                    <option value="CALL">{isRtl ? 'اتصال هاتف' : 'Phone Call'}</option>
                    <option value="MEETING">{isRtl ? 'اجتماع ميداني' : 'On-site Meeting'}</option>
                    <option value="EMAIL">{isRtl ? 'بريد إلكتروني' : 'Email Contact'}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">{isRtl ? 'تاريخ المتابعة' : 'Date'}</label>
                  <input
                    type="date"
                    value={interactionForm.date}
                    onChange={(e) => setInteractionForm({ ...interactionForm, date: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">{isRtl ? 'ملخص المكالمة / الاجتماع *' : 'Activity Summary *'}</label>
                <input
                  type="text"
                  required
                  placeholder={isRtl ? 'اكتب تفاصيل ما دار ومخرجات التواصل...' : 'What did you talk about, next actions?'}
                  value={interactionForm.summary}
                  onChange={(e) => setInteractionForm({ ...interactionForm, summary: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmittingInteraction}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1.5"
              >
                {isSubmittingInteraction && <Loader2 size={12} className="animate-spin" />}
                <span>{isRtl ? 'إدراج النشاط' : 'Submit Activity'}</span>
              </button>
            </form>

            {/* Interaction History Lists */}
            <div className="space-y-3.5">
              <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">{isRtl ? 'أرشيف الاتصالات والأنشطة السابقة' : 'Past Activity Timeline'}</h4>
              {(viewLeadDetails.interactions || []).length === 0 ? (
                <div className="p-6 text-center text-slate-400 font-medium">
                  {isRtl ? 'لم يتم تسجيل أي اتصالات سابقة مع هذا العميل بعد.' : 'No communication logs recorded yet for this prospect.'}
                </div>
              ) : (
                <div className="relative border-l border-slate-100 dark:border-slate-800 pl-4 space-y-4">
                  {viewLeadDetails.interactions.map((item) => (
                    <div key={item.id} className="relative text-xs">
                      {/* Timeline dot */}
                      <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-emerald-500 border border-white" />
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-400">{item.date}</span>
                        <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[9px] font-bold text-slate-500">
                          {item.type}
                        </span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 mt-1 leading-relaxed font-semibold">
                        {item.summary}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
