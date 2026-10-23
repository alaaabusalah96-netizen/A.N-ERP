import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Layout from '../Layout';
import { CustodyDB } from '../../db';

describe('Layout Component (React Testing Library)', () => {
  const mockUser = {
    id: 'usr-1',
    full_name: 'علي عبد الله',
    email: 'ali@kemit.com',
    role: 'Admin' as const,
    company_id: 'comp-1',
    permissions: []
  };

  it('renders layout header with active user full name', () => {
    vi.spyOn(CustodyDB, 'getActiveUser').mockReturnValue(mockUser as any);

    render(
      <MemoryRouter>
        <Layout
          currentTab="dashboard"
          setCurrentTab={vi.fn()}
          language="ar"
          setLanguage={vi.fn()}
          theme="light"
          setTheme={vi.fn()}
          activeUser={mockUser as any}
          onLogout={vi.fn()}
        >
          <div>محتوى التطبيق الرئيسي</div>
        </Layout>
      </MemoryRouter>
    );

    expect(screen.getByText('علي عبد الله')).toBeInTheDocument();
    expect(screen.getByText('محتوى التطبيق الرئيسي')).toBeInTheDocument();
  });

  it('triggers theme toggle button click handler', () => {
    const setTheme = vi.fn();

    const { container } = render(
      <MemoryRouter>
        <Layout
          currentTab="dashboard"
          setCurrentTab={vi.fn()}
          language="ar"
          setLanguage={vi.fn()}
          theme="light"
          setTheme={setTheme}
          activeUser={mockUser as any}
          onLogout={vi.fn()}
        >
          <div>اختبار الثيم</div>
        </Layout>
      </MemoryRouter>
    );

    const themeBtn = container.querySelector('#btn-toggle-theme');
    expect(themeBtn).not.toBeNull();
    if (themeBtn) {
      fireEvent.click(themeBtn);
      expect(setTheme).toHaveBeenCalled();
    }
  });

  it('triggers logout button click handler immediately', () => {
    const onLogout = vi.fn();

    const { container } = render(
      <MemoryRouter>
        <Layout
          currentTab="dashboard"
          setCurrentTab={vi.fn()}
          language="ar"
          setLanguage={vi.fn()}
          theme="light"
          setTheme={vi.fn()}
          activeUser={mockUser as any}
          onLogout={onLogout}
        >
          <div>اختبار الخروج</div>
        </Layout>
      </MemoryRouter>
    );

    const logoutBtn = container.querySelector('#btn-logout');
    expect(logoutBtn).not.toBeNull();
    if (logoutBtn) {
      fireEvent.click(logoutBtn);
      expect(onLogout).toHaveBeenCalledTimes(1);
    }
  });
});
