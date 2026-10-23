import { describe, it, expect } from 'vitest';

describe('MSW API Mock Integration', () => {
  it('intercepts /api/auth/me request', async () => {
    const response = await fetch('/api/auth/me');
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.authenticated).toBe(true);
    expect(data.user.email).toBe('admin@kemit.com');
  });

  it('intercepts /api/transactions request', async () => {
    const response = await fetch('/api/transactions');
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.transactions)).toBe(true);
  });

  it('intercepts purchasing orders request', async () => {
    const response = await fetch('/api/purchasing/orders');
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.orders.length).toBeGreaterThan(0);
  });

  it('intercepts HR employees request', async () => {
    const response = await fetch('/api/hr/employees');
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.employees[0].fullName).toContain('سامي');
  });

  it('intercepts contracting claims request', async () => {
    const response = await fetch('/api/contracting/claims');
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.claims[0].claimNo).toBe('IPC-2026-001');
  });

  it('intercepts restaurant orders request and handles order creation', async () => {
    const response = await fetch('/api/restaurant/orders');
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.orders.length).toBeGreaterThan(0);

    const createRes = await fetch('/api/restaurant/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableNo: 'T10', totalAmount: 180, items: [] })
    });
    const createData = await createRes.json();
    expect(createRes.status).toBe(201);
    expect(createData.order.tableNo).toBe('T10');
  });
});
