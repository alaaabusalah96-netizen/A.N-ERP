import { StorageEngine } from './storage';
import { syncWriteWithOfflineFallback } from './offlineQueue';
import { LogsModule } from './logs';
import { UsersModule } from './users';

export interface LeadInteraction {
  id: string;
  type: 'CALL' | 'MEETING' | 'EMAIL';
  summary: string;
  date: string;
}

export interface Lead {
  id: string;
  company_id: string;
  name: string;
  phone: string;
  email: string;
  source: string;
  status: 'PROSPECT' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL_SENT' | 'WON' | 'LOST';
  dealValue: number;
  assignedTo: string;
  notes: string;
  interactions: LeadInteraction[];
  createdAt: string;
}

export class LeadsModule {
  static getLeads(companyId?: string): Lead[] {
    const allLeads = StorageEngine.getStored<Lead[]>('leads', []);
    if (!companyId) return allLeads;
    return allLeads.filter(l => l.company_id === companyId);
  }

  static async saveLeadAsync(lead: Lead): Promise<{ success: boolean; error?: string }> {
    const allLeads = StorageEngine.getStored<Lead[]>('leads', []);
    const existingIdx = allLeads.findIndex(l => l.id === lead.id);
    const prevLeads = [...allLeads];

    let updatedLeads: Lead[];
    if (existingIdx !== -1) {
      updatedLeads = allLeads.map(l => l.id === lead.id ? lead : l);
    } else {
      updatedLeads = [...allLeads, lead];
    }

    StorageEngine.setStored('leads', updatedLeads);

    try {
      const syncRes = await syncWriteWithOfflineFallback('leads', lead.id, lead);
      if (!syncRes.success) {
        StorageEngine.setStored('leads', prevLeads);
        return {
          success: false,
          error: syncRes.error || 'Failed to sync CRM lead to cloud database.'
        };
      }
      return { success: true };
    } catch (err: any) {
      StorageEngine.setStored('leads', prevLeads);
      return {
        success: false,
        error: err?.message || 'Unexpected error while syncing CRM lead.'
      };
    }
  }

  static async addInteractionAsync(leadId: string, interaction: LeadInteraction): Promise<{ success: boolean; error?: string; lead?: Lead }> {
    const allLeads = StorageEngine.getStored<Lead[]>('leads', []);
    const lead = allLeads.find(l => l.id === leadId);
    if (!lead) {
      return { success: false, error: 'Lead not found' };
    }

    const updatedLead: Lead = {
      ...lead,
      interactions: [...(lead.interactions || []), interaction]
    };

    const saveRes = await this.saveLeadAsync(updatedLead);
    if (!saveRes.success) {
      return { success: false, error: saveRes.error };
    }

    return { success: true, lead: updatedLead };
  }

  static async updateLeadStageAsync(
    leadId: string, 
    nextStatus: Lead['status'],
    activeUserId?: string,
    activeUserName?: string,
    isRtl?: boolean
  ): Promise<{ success: boolean; error?: string; lead?: Lead }> {
    const allLeads = StorageEngine.getStored<Lead[]>('leads', []);
    const lead = allLeads.find(l => l.id === leadId);
    if (!lead) {
      return { success: false, error: 'Lead not found' };
    }

    const updatedLead: Lead = {
      ...lead,
      status: nextStatus
    };

    const saveRes = await this.saveLeadAsync(updatedLead);
    if (!saveRes.success) {
      return { success: false, error: saveRes.error };
    }

    LogsModule.addLog(
      activeUserId || 'system',
      activeUserName || 'System',
      isRtl ? 'تحديث حالة العميل CRM' : 'Update CRM Lead Status',
      `Moved prospect ${lead.name} to stage ${nextStatus}`
    );

    return { success: true, lead: updatedLead };
  }
}
