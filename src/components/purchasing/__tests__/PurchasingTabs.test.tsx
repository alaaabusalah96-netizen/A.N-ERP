import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PurchasingRfqsTab from '../PurchasingRfqsTab';
import PurchasingOrdersTab from '../PurchasingOrdersTab';

describe('Purchasing Component Tabs (React Testing Library)', () => {
  it('renders RFQs tab with empty state and trigger button', () => {
    const setShowCreateRFQ = vi.fn();
    render(
      <PurchasingRfqsTab
        isRtl={true}
        rfqs={[]}
        quotations={[]}
        setShowCreateRFQ={setShowCreateRFQ}
        handleOpenSubmitQuote={vi.fn()}
        handleAcceptQuotation={vi.fn()}
      />
    );

    expect(screen.getByText(/طلبات عروض الأسعار والتثمين/i)).toBeInTheDocument();
    expect(screen.getByText(/لا توجد طلبات عروض أسعار مسجلة حالياً/i)).toBeInTheDocument();

    const newRfqBtn = screen.getByRole('button', { name: /إصدار طلب عرض أسعار جديد/i });
    fireEvent.click(newRfqBtn);
    expect(setShowCreateRFQ).toHaveBeenCalledWith(true);
  });

  it('renders Orders tab with order items and receive action button', () => {
    const setShowReceivePO = vi.fn();
    const mockOrder: any = {
      id: 'po-1',
      poNumber: 'PO-2026-0001',
      vendorId: 'v1',
      vendorName: 'شركة النيل للتوريدات',
      totalAmount: 15000,
      status: 'ISSUED',
      createdAt: '2026-08-10',
      items: [{ id: 'i1', name: 'زيت هيدروليك 20L', qty: 10, unitPrice: 1500, totalPrice: 15000, unit: 'علبة' }]
    };

    render(
      <PurchasingOrdersTab
        isRtl={true}
        orders={[mockOrder]}
        orgUnits={[]}
        workflowConfig={{ allowDirectPoWithoutPr: true, autoApproveBelowAmount: 5000, prefixes: { pr: 'PR', po: 'PO', rfq: 'RFQ' } } as any}
        setShowDirectPO={vi.fn()}
        setPrintPO={vi.fn()}
        setShowReceivePO={setShowReceivePO}
      />
    );

    expect(screen.getByText('PO-2026-0001')).toBeInTheDocument();
    expect(screen.getByText(/شركة النيل للتوريدات/i)).toBeInTheDocument();

    const receiveBtn = screen.getByRole('button', { name: /استلام الشحنة وتغذية المخزون/i });
    fireEvent.click(receiveBtn);
    expect(setShowReceivePO).toHaveBeenCalledWith('po-1');
  });
});
