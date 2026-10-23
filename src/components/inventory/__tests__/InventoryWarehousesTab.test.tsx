import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import InventoryWarehousesTab, { InventoryWarehousesTabProps } from '../InventoryWarehousesTab';

describe('InventoryWarehousesTab Component (React Testing Library)', () => {
  const defaultProps: InventoryWarehousesTabProps = {
    isRtl: true,
    theme: 'light',
    activeUser: { id: 'u1', full_name: 'مدير المخزن', role: 'Admin', company_id: 'c1' },
    setRefreshKey: vi.fn(),
    relocShow: false,
    setRelocShow: vi.fn(),
    setRelocSuccess: vi.fn(),
    setRelocError: vi.fn(),
    relocError: '',
    relocSuccess: '',
    relocWhId: '',
    setRelocWhId: vi.fn(),
    setRelocFromBinId: vi.fn(),
    setRelocToBinId: vi.fn(),
    relocProdId: '',
    setRelocProdId: vi.fn(),
    products: [],
    relocFromBinId: '',
    relocToBinId: '',
    relocQty: 0,
    setRelocQty: vi.fn(),
    warehouses: [],
    whEnforceCap: {},
    setWhEnforceCap: vi.fn(),
    whCapQty: {},
    setWhCapQty: vi.fn(),
    selectedWhForBins: null,
    setSelectedWhForBins: vi.fn(),
    setBinShowForm: vi.fn(),
    setBinEditingId: vi.fn(),
    binShowForm: false,
    binFormName: '',
    setBinFormName: vi.fn(),
    binFormCode: '',
    setBinFormCode: vi.fn(),
    binFormZone: '',
    setBinFormZone: vi.fn(),
    binFormCapacity: '',
    setBinFormCapacity: vi.fn(),
    binEditingId: null
  };

  it('renders warehouse tree title and action buttons', () => {
    render(<InventoryWarehousesTab {...defaultProps} />);

    expect(screen.getByText(/إدارة بنية المستودعات/i)).toBeInTheDocument();
  });

  it('allows clicking add main warehouse button', () => {
    render(<InventoryWarehousesTab {...defaultProps} />);

    const addBtn = screen.getByRole('button', { name: /إضافة مستودع رئيسي/i });
    expect(addBtn).toBeInTheDocument();
    fireEvent.click(addBtn);
  });
});
