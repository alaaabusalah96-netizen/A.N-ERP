import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ApprovalInbox from '../ApprovalInbox';

describe('ApprovalInbox Component (React Testing Library)', () => {
  const mockAdminUser = {
    id: 'user-admin-1',
    full_name: 'أحمد محمود',
    email: 'admin@kemit.com',
    role: 'Admin' as const,
    company_id: 'comp-1',
    permissions: []
  };

  it('renders approval inbox tabs and default pending status', async () => {
    render(
      <ApprovalInbox
        activeUser={mockAdminUser as any}
        isRtl={true}
        theme="light"
        onActionComplete={vi.fn()}
      />
    );

    expect(screen.getByText(/بانتظار موافقتي/i)).toBeInTheDocument();
    expect(screen.getByText(/سجل الاعتمادات السابقة/i)).toBeInTheDocument();
  });

  it('switches between pending and history tabs', async () => {
    render(
      <ApprovalInbox
        activeUser={mockAdminUser as any}
        isRtl={true}
        theme="light"
        onActionComplete={vi.fn()}
      />
    );

    const historyTab = screen.getByText(/سجل الاعتمادات السابقة/i);
    fireEvent.click(historyTab);

    await waitFor(() => {
      expect(historyTab).toHaveClass(/bg-white/);
    });
  });

  it('renders document type filter options', () => {
    render(
      <ApprovalInbox
        activeUser={mockAdminUser as any}
        isRtl={true}
        theme="light"
        onActionComplete={vi.fn()}
      />
    );

    expect(screen.getByText(/جميع أنواع المستندات/i)).toBeInTheDocument();
  });
});
