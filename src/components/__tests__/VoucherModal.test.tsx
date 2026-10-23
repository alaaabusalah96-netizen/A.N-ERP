import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import VoucherModal from '../VoucherModal';

describe('VoucherModal Component (React Testing Library)', () => {
  const mockTransaction = {
    id: 'tx-555',
    transaction_no: 'EXP-2026-0555',
    amount: 1250,
    category: 'مهمات وقطع غيار',
    status: 'APPROVED' as const,
    description: 'مصروف شراء زيوت محركات للمحطة',
    notes: 'مصروف شراء زيوت محركات للمحطة',
    date: '2026-08-10',
    created_at: '2026-08-10T10:00:00Z',
    created_by: 'user-01',
    company_id: 'comp-1'
  };

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <VoucherModal
        transaction={mockTransaction as any}
        isOpen={false}
        onClose={vi.fn()}
        theme="light"
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders transaction details and barcode when modal is open', () => {
    render(
      <VoucherModal
        transaction={mockTransaction as any}
        isOpen={true}
        onClose={vi.fn()}
        theme="light"
      />
    );

    expect(screen.getByText('EXP-2026-0555')).toBeInTheDocument();
    expect(screen.getAllByText((content) => content.includes('مصروف شراء زيوت')).length).toBeGreaterThan(0);
    expect(screen.getByText(/معاينة وطباعة/i)).toBeInTheDocument();
  });

  it('triggers onClose when close button is clicked', () => {
    const onCloseMock = vi.fn();
    render(
      <VoucherModal
        transaction={mockTransaction as any}
        isOpen={true}
        onClose={onCloseMock}
        theme="light"
      />
    );

    const closeBtn = screen.getByRole('button', { name: /إغلاق/i });
    fireEvent.click(closeBtn);

    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });
});
