import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import { useAuth } from '@/features/auth/AuthProvider';
import brandLogo from '../../../../mobile/assets/brand-logo.png';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '⊞' },
  { to: '/menu-reviews', label: 'Menu Reviews', icon: '☰' },
  { to: '/menu-inventory', label: 'Menu Inventory', icon: '▤' },
  { to: '/ai-image-debug', label: 'AI Image Debug', icon: '◇' },
  { to: '/feedback', label: 'Feedback', icon: '✉' },
  { to: '/access-controls', label: 'Access Controls', icon: '⌘' },
  { to: '/waitlist', label: 'Waitlist', icon: '@' },
  { to: '/moderation', label: 'Moderation', icon: '⚑' },
  { to: '/users', label: 'Users', icon: '◎' },
  { to: '/record-counts', label: 'Record Counts', icon: '#' },
  { to: '/audit-trail', label: 'Audit Trail', icon: '≡' },
];

const SIDEBAR_STORAGE_KEY = 'admin-sidebar-collapsed';

export function AdminShell() {
  const { user, logout } = useAuth();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const initials = (user?.name?.trim() || user?.email || 'A')[0].toUpperCase();

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    setIsSidebarCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  return (
    <div className={`admin-shell${isSidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        {/* App identity */}
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <span className="brand-mark">
              <img alt="" aria-hidden="true" className="brand-mark-image" src={brandLogo} />
            </span>
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-name">Yummy Recs</span>
              <span className="sidebar-brand-sub">Admin</span>
            </div>
          </div>
          <button
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="sidebar-toggle sidebar-toggle-header"
            onClick={() => setIsSidebarCollapsed((value) => !value)}
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            type="button"
          >
            <span aria-hidden="true" className="sidebar-toggle-icon">
              {isSidebarCollapsed ? '›' : '‹'}
            </span>
          </button>
        </div>

        {/* Nav */}
        <div className="sidebar-section-label">Navigation</div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              title={item.label}
              to={item.to}
            >
              <span className="nav-link-icon">{item.icon}</span>
              <span className="nav-link-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User card */}
        <div className="sidebar-user-card">
          <div className="sidebar-user-avatar">{initials}</div>
          <div className="sidebar-user-info">
            <span className="sidebar-user-name">{user?.name?.trim() || 'Admin'}</span>
            <span className="sidebar-user-email">{user?.email}</span>
          </div>
          <button
            className="button ghost sidebar-logout-button"
            onClick={logout}
            title="Log out"
            type="button"
          >
            ↩
          </button>
        </div>

        <div className="sidebar-mobile-toggle-wrap">
          <button
            aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="sidebar-toggle sidebar-toggle-mobile"
            onClick={() => setIsSidebarCollapsed((value) => !value)}
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            type="button"
          >
            <span aria-hidden="true" className="sidebar-toggle-icon">
              {isSidebarCollapsed ? '›' : '‹'}
            </span>
          </button>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <h1>Admin workspace</h1>
          <div className="topbar-actions">
            <span className="user-pill">{user?.email}</span>
          </div>
        </header>

        <div style={{ padding: '24px 28px 32px', display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
