import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import InventoryDocumentForm from '../../InventoryDocumentForm';
import { InventoryDocType } from '../../../types/inventory';

describe('InventoryDocumentForm Component (React Testing Library)', () => {
  const defaultProps = {
    initialDocType: 'Addition' as InventoryDocType,
    onSave: vi.fn(),
    onCancel: vi.fn(),
    language: 'ar' as const,
    theme: 'light' as const
  };

  it('renders document form header and inputs', () => {
    render(<InventoryDocumentForm {...defaultProps} />);

    expect(screen.getAllByText(/إذن إضافة/i).length).toBeGreaterThan(0);
  });

  it('invokes onCancel callback when clicking cancel button', () => {
    render(<InventoryDocumentForm {...defaultProps} />);

    const cancelButtons = screen.getAllByRole('button', { name: /إلغاء/i });
    expect(cancelButtons.length).toBeGreaterThan(0);
    fireEvent.click(cancelButtons[0]);

    expect(defaultProps.onCancel).toHaveBeenCalled();
  });
});
