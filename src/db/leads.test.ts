import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LeadsModule, Lead } from './leads';
import { StorageEngine } from './storage';
import * as offlineQueue from './offlineQueue';

describe('LeadsModule async writes and error handling', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('successfully saves lead and persists to StorageEngine when write succeeds', async () => {
    vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({ success: true, syncedToFirestore: true, queuedOffline: false });

    const newLead: Lead = {
      id: 'lead-test-1',
      company_id: 'test-co',
      name: 'Test Prospect',
      phone: '1234567890',
      email: 'test@prospect.com',
      source: 'Website',
      status: 'PROSPECT',
      dealValue: 50000,
      assignedTo: 'Admin',
      notes: 'Initial note',
      interactions: [],
      createdAt: new Date().toISOString()
    };

    const res = await LeadsModule.saveLeadAsync(newLead);
    expect(res.success).toBe(true);

    const stored = StorageEngine.getStored<Lead[]>('leads', []);
    expect(stored.find(l => l.id === 'lead-test-1')?.name).toBe('Test Prospect');
  });

  it('rolls back local storage and returns error when cloud write fails', async () => {
    vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({
      success: false,
      syncedToFirestore: false,
      queuedOffline: false,
      error: 'Permission denied / Cloud error'
    });

    const newLead: Lead = {
      id: 'lead-test-fail',
      company_id: 'test-co',
      name: 'Failed Prospect',
      phone: '1234567890',
      email: 'fail@prospect.com',
      source: 'Website',
      status: 'PROSPECT',
      dealValue: 10000,
      assignedTo: 'Admin',
      notes: '',
      interactions: [],
      createdAt: new Date().toISOString()
    };

    const res = await LeadsModule.saveLeadAsync(newLead);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Permission denied / Cloud error');

    const stored = StorageEngine.getStored<Lead[]>('leads', []);
    expect(stored.find(l => l.id === 'lead-test-fail')).toBeUndefined();
  });

  it('adds interaction to lead successfully', async () => {
    vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({ success: true, syncedToFirestore: true, queuedOffline: false });

    const initialLead: Lead = {
      id: 'lead-int-1',
      company_id: 'test-co',
      name: 'Interaction Lead',
      phone: '1234567890',
      email: 'int@prospect.com',
      source: 'Website',
      status: 'PROSPECT',
      dealValue: 20000,
      assignedTo: 'Admin',
      notes: '',
      interactions: [],
      createdAt: new Date().toISOString()
    };

    await LeadsModule.saveLeadAsync(initialLead);

    const intRes = await LeadsModule.addInteractionAsync('lead-int-1', {
      id: 'int-1',
      type: 'CALL',
      summary: 'Discussed requirements',
      date: '2026-09-01'
    });

    expect(intRes.success).toBe(true);
    expect(intRes.lead?.interactions.length).toBe(1);
    expect(intRes.lead?.interactions[0].summary).toBe('Discussed requirements');
  });

  it('updates lead stage successfully', async () => {
    vi.spyOn(offlineQueue, 'syncWriteWithOfflineFallback').mockResolvedValue({ success: true, syncedToFirestore: true, queuedOffline: false });

    const initialLead: Lead = {
      id: 'lead-stage-1',
      company_id: 'test-co',
      name: 'Stage Lead',
      phone: '1234567890',
      email: 'stage@prospect.com',
      source: 'Website',
      status: 'PROSPECT',
      dealValue: 30000,
      assignedTo: 'Admin',
      notes: '',
      interactions: [],
      createdAt: new Date().toISOString()
    };

    await LeadsModule.saveLeadAsync(initialLead);

    const updateRes = await LeadsModule.updateLeadStageAsync('lead-stage-1', 'QUALIFIED', 'user-1', 'Admin');
    expect(updateRes.success).toBe(true);
    expect(updateRes.lead?.status).toBe('QUALIFIED');
  });
});
