import { NavLink, Outlet } from 'react-router-dom';

import { useAuth } from '@/features/auth/AuthProvider';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '⊞' },
  { to: '/menu-reviews', label: 'Menu Reviews', icon: '☰' },
  { to: '/feedback', label: 'Feedback', icon: '✉' },
  { to: '/moderation', label: 'Moderation', icon: '⚑' },
  { to: '/users', label: 'Users', icon: '◎' },
];

export function AdminShell() {
  const { user, logout } = useAuth();

  const initials = (user?.name?.trim() || user?.email || 'A')[0].toUpperCase();

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        {/* App identity */}
        <div className="sidebar-header">
          <span className="brand-mark">🍔</span>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">Food Tracker</span>
            <span className="sidebar-brand-sub">Admin Console</span>
          </div>
        </div>

        {/* Nav */}
        <div className="sidebar-section-label">Navigation</div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
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
            className="button ghost"
            onClick={logout}
            style={{ padding: '4px 8px', minHeight: 'auto', fontSize: 12, flexShrink: 0 }}
            title="Log out"
            type="button"
          >
            ↩
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
