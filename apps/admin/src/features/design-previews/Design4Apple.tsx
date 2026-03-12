/**
 * Design 4 — Apple / macOS system light mode
 * SF Pro-like typography, sidebar with translucent vibrancy feel,
 * generous whitespace, subtle blur-card depth.
 */
export function Design4Apple() {
  return (
    <div style={s.root}>
      <style>{css}</style>
      <aside style={s.sidebar}>
        <div style={s.sidebarTop}>
          <div style={s.appIcon}>🍔</div>
          <div>
            <div style={s.appName}>Food Tracker</div>
            <div style={s.appSub}>Admin Console</div>
          </div>
        </div>

        <div style={s.sectionLabel}>Navigation</div>
        {[
          { label: 'Dashboard', icon: '⊞', active: true },
          { label: 'Menu Reviews', icon: '☰', badge: 12 },
          { label: 'Feedback', icon: '✉', badge: 7 },
          { label: 'Moderation', icon: '⚑' },
          { label: 'Users', icon: '◎' },
        ].map((item) => (
          <div
            key={item.label}
            style={{ ...s.navRow, ...(item.active ? s.navRowActive : {}) }}
            className="a-nav"
          >
            <span style={s.navIcon}>{item.icon}</span>
            <span style={{ flex: 1, fontWeight: item.active ? 600 : 400 }}>{item.label}</span>
            {item.badge ? <span style={s.pillBadge}>{item.badge}</span> : null}
          </div>
        ))}

        <div style={{ flex: 1 }} />
        <div style={s.userCard}>
          <div style={s.userAvatar}>A</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#1d1d1f' }}>Admin</div>
            <div style={{ fontSize: 11, color: '#6e6e73' }}>admin@app.com</div>
          </div>
          <button style={s.logoutBtn}>↩</button>
        </div>
      </aside>

      <div style={s.mainWrap}>
        {/* toolbar */}
        <div style={s.toolbar}>
          <div style={s.toolbarTitle}>Dashboard</div>
          <div style={s.toolbarRight}>
            <div style={s.searchBar}>
              <span>🔍</span>
              <span style={{ color: '#c7c7cc' }}>Search...</span>
            </div>
            <button style={s.primaryBtn}>+ New review</button>
          </div>
        </div>

        <div style={s.content}>
          {/* metrics row */}
          <div style={s.metricsRow}>
            {[
              { label: 'Pending Reviews', value: '12', icon: '🗂', color: '#ff9f0a', bg: '#fff8ee' },
              { label: 'Open Feedback', value: '7', icon: '✉', color: '#0a84ff', bg: '#eef5ff' },
              { label: 'Photos (7d)', value: '84', icon: '🖼', color: '#30d158', bg: '#f0faf2' },
              { label: 'Total Users', value: '1,204', icon: '👤', color: '#bf5af2', bg: '#f8f0ff' },
            ].map((m) => (
              <div key={m.label} style={s.metricCard} className="a-card">
                <div style={{ ...s.metricIcon, background: m.bg, color: m.icon }}>
                  {m.icon}
                </div>
                <div style={s.metricLabel}>{m.label}</div>
                <div style={{ ...s.metricValue, color: m.color }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* content grid */}
          <div style={s.grid}>
            {/* queue table */}
            <div style={s.card}>
              <div style={s.cardHeader}>
                <div style={s.cardTitle}>Review Queue</div>
                <div style={{ ...s.pillBadge, background: '#fff3cd', color: '#b45309' }}>12 pending</div>
              </div>
              <table style={s.table}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f2f2f7' }}>
                    {['Restaurant', 'Requested by', 'Status', 'Age'].map((h) => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['The Golden Fork', 'u@test.com', 'pending', '2h'],
                    ['Sakura Ramen', 'alice@e.com', 'pending', '5h'],
                    ['Burger Barn', 'bob@e.com', 'in_progress', '9h'],
                    ['Taco Town', 'carol@e.com', 'pending', '11h'],
                    ['Pizza Palace', 'dave@e.com', 'dismissed', '14h'],
                    ['Sushi Spot', 'eve@e.com', 'reviewed', '1d'],
                  ].map(([name, user, status, age]) => (
                    <tr key={name} className="a-row">
                      <td style={s.td}><span style={{ fontWeight: 500 }}>{name}</span></td>
                      <td style={{ ...s.td, color: '#6e6e73' }}>{user}</td>
                      <td style={s.td}><AStatus s={status} /></td>
                      <td style={{ ...s.td, color: '#6e6e73' }}>{age}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* right column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* quick links */}
              <div style={s.card}>
                <div style={s.cardHeader}>
                  <div style={s.cardTitle}>Quick Actions</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: 'Open menu review queue', icon: '🗂', color: '#ff9f0a' },
                    { label: 'Check feedback inbox', icon: '✉', color: '#0a84ff' },
                    { label: 'Search users', icon: '◎', color: '#bf5af2' },
                    { label: 'View recent photos', icon: '🖼', color: '#30d158' },
                  ].map((a) => (
                    <div key={a.label} style={s.quickAction} className="a-action">
                      <span style={{ ...s.quickIcon, color: a.color }}>{a.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{a.label}</span>
                      <span style={{ color: '#c7c7cc', marginLeft: 'auto' }}>›</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* recent activity */}
              <div style={s.card}>
                <div style={s.cardHeader}>
                  <div style={s.cardTitle}>Recent Activity</div>
                </div>
                {[
                  { text: 'Menu review #003 approved', time: '9 min', icon: '✓', color: '#30d158' },
                  { text: 'Feedback #18 escalated', time: '23 min', icon: '↑', color: '#ff9f0a' },
                  { text: 'User uid=a7f2 banned', time: '45 min', icon: '✕', color: '#ff3b30' },
                  { text: 'Photo pid=cc1a flagged', time: '1h', icon: '⚑', color: '#ff9f0a' },
                ].map((a) => (
                  <div key={a.text} style={s.activityRow}>
                    <div style={{ ...s.actBubble, background: a.color + '22', color: a.color }}>{a.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: '#1d1d1f' }}>{a.text}</div>
                      <div style={{ fontSize: 11, color: '#6e6e73' }}>{a.time} ago</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AStatus({ s }: { s: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    pending: { bg: '#fff3cd', color: '#b45309', label: 'Pending' },
    in_progress: { bg: '#dbeafe', color: '#1d4ed8', label: 'In review' },
    reviewed: { bg: '#dcfce7', color: '#15803d', label: 'Reviewed' },
    dismissed: { bg: '#f3f4f6', color: '#6b7280', label: 'Dismissed' },
  };
  const c = map[s] ?? map.pending;
  return (
    <span style={{ background: c.bg, color: c.color, borderRadius: 20, padding: '3px 9px', fontSize: 11, fontWeight: 600 }}>
      {c.label}
    </span>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: { display: 'flex', minHeight: '100vh', background: '#f2f2f7', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif', fontSize: 13, color: '#1d1d1f' },
  sidebar: { width: 240, background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRight: '1px solid rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', padding: '20px 12px', gap: 2, flexShrink: 0 },
  sidebarTop: { display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px', marginBottom: 20 },
  appIcon: { fontSize: 28, lineHeight: 1 },
  appName: { fontWeight: 700, fontSize: 15, color: '#1d1d1f' },
  appSub: { fontSize: 11, color: '#6e6e73' },
  sectionLabel: { fontSize: 10, fontWeight: 700, color: '#8e8e93', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '4px 10px', marginBottom: 4 },
  navRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', color: '#3a3a3c', fontWeight: 400, fontSize: 13 },
  navRowActive: { background: '#0071e3', color: '#fff' },
  navIcon: { fontSize: 14, width: 18, textAlign: 'center', opacity: 0.8 },
  pillBadge: { background: '#e5e5ea', color: '#3a3a3c', borderRadius: 20, padding: '2px 7px', fontSize: 11, fontWeight: 600 },
  userCard: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px', background: 'rgba(0,0,0,0.04)', borderRadius: 10, marginTop: 8 },
  userAvatar: { width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, #0071e3, #30d158)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 },
  logoutBtn: { marginLeft: 'auto', background: 'rgba(0,0,0,0.06)', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 12 },
  mainWrap: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  toolbar: { background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(0,0,0,0.07)', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  toolbarTitle: { fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em' },
  toolbarRight: { display: 'flex', alignItems: 'center', gap: 12 },
  searchBar: { display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.06)', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: '#8e8e93', minWidth: 180 },
  primaryBtn: { background: '#0071e3', border: 'none', color: '#fff', borderRadius: 8, padding: '7px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  content: { padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20, overflow: 'auto', flex: 1 },
  metricsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 },
  metricCard: { background: '#fff', borderRadius: 14, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.04)', cursor: 'default' },
  metricIcon: { fontSize: 22, width: 42, height: 42, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  metricLabel: { fontSize: 12, color: '#6e6e73', fontWeight: 500 },
  metricValue: { fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 },
  card: { background: '#fff', borderRadius: 14, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.04)' },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 8px', fontSize: 11, color: '#8e8e93', fontWeight: 600, letterSpacing: '0.03em' },
  td: { padding: '10px 8px', borderBottom: '1px solid #f2f2f7', verticalAlign: 'middle' },
  quickAction: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, cursor: 'pointer', background: '#f9f9fb' },
  quickIcon: { fontSize: 16, width: 24, textAlign: 'center' },
  activityRow: { display: 'flex', gap: 10, alignItems: 'flex-start', paddingTop: 10, borderTop: '1px solid #f2f2f7' },
  actBubble: { width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, flexShrink: 0 },
};

const css = `
  .a-nav:hover:not([style*="background: #0071e3"]) { background: rgba(0,0,0,0.04) !important; }
  .a-row:hover td { background: #fafafe !important; cursor: pointer; }
  .a-action:hover { background: #ececf0 !important; }
  .a-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1), 0 8px 24px rgba(0,0,0,0.07) !important; }
`;
