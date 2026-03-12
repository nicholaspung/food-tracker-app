/**
 * Design 2 — Linear / Vercel minimal
 * Ultra-clean dark, crisp type scale, icon-accented sidebar, data surfaced without noise.
 */
export function Design2Linear() {
  return (
    <div style={s.root}>
      <style>{hoverCss}</style>
      <aside style={s.sidebar}>
        <div style={s.wordmark}>
          <div style={s.dot} />
          Food Tracker
        </div>

        <div style={s.workspace}>
          <span style={s.workspaceLabel}>Admin</span>
          <ChevronDown />
        </div>

        <div style={s.section}>
          <div style={s.sectionLabel}>Moderation</div>
          {[
            { icon: '◼', label: 'Dashboard', active: true },
            { icon: '⊞', label: 'Menu Reviews', badge: '12' },
            { icon: '✉', label: 'Feedback', badge: '7' },
            { icon: '⚑', label: 'Moderation' },
            { icon: '◎', label: 'Users' },
          ].map((item) => (
            <div
              key={item.label}
              style={{ ...s.navItem, ...(item.active ? s.navActive : {}) }}
              className="l-nav"
            >
              <span style={s.navIcon}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && <span style={s.badge}>{item.badge}</span>}
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <div style={s.userRow}>
          <div style={s.avatar}>A</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Admin User</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>admin@app.com</div>
          </div>
        </div>
      </aside>

      <main style={s.main}>
        {/* header */}
        <div style={s.header}>
          <div>
            <div style={s.breadcrumb}>Admin → Dashboard</div>
            <h1 style={s.pageTitle}>Dashboard</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={s.btnSecondary}>Export</button>
            <button style={s.btnPrimary}>+ New review</button>
          </div>
        </div>

        {/* metrics */}
        <div style={s.metricsRow}>
          {[
            { label: 'Pending reviews', value: '12', trend: '+3 today', up: true },
            { label: 'Open feedback', value: '7', trend: '−2 from yesterday', up: false },
            { label: 'Photos (7d)', value: '84', trend: '+17 this week', up: true },
            { label: 'Total users', value: '1,204', trend: '+6 new', up: true },
          ].map((m) => (
            <div key={m.label} style={s.metricCard} className="l-card">
              <div style={s.metricLabel}>{m.label}</div>
              <div style={s.metricValue}>{m.value}</div>
              <div style={{ fontSize: 11, color: m.up ? '#22c55e' : '#ef4444', marginTop: 4 }}>
                {m.up ? '↑' : '↓'} {m.trend}
              </div>
            </div>
          ))}
        </div>

        {/* body grid */}
        <div style={s.grid}>
          {/* queue table */}
          <div style={s.card}>
            <div style={s.cardHeader}>
              <span style={s.cardTitle}>Menu review queue</span>
              <span style={{ ...s.badge, fontSize: 11, padding: '2px 8px' }}>12 pending</span>
            </div>
            <table style={s.table}>
              <thead>
                <tr>
                  {['Restaurant', 'Requested by', 'Reason', 'Status', 'Age'].map((h) => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['The Golden Fork', 'u@test.com', 'Incorrect hours', 'pending', '2h'],
                  ['Sakura Ramen', 'alice@e.com', 'Missing items', 'pending', '5h'],
                  ['Burger Barn', 'bob@e.com', 'Wrong price', 'in_progress', '9h'],
                  ['Taco Town', 'carol@e.com', 'Bad photo', 'pending', '11h'],
                  ['Pizza Palace', 'dave@e.com', 'Name error', 'dismissed', '14h'],
                  ['Sushi Spot', 'eve@e.com', 'New items', 'reviewed', '1d'],
                ].map(([name, user, reason, status, age]) => (
                  <tr key={name} className="l-row">
                    <td style={s.td}><span style={{ fontWeight: 500 }}>{name}</span></td>
                    <td style={{ ...s.td, color: '#6b7280' }}>{user}</td>
                    <td style={{ ...s.td, color: '#6b7280' }}>{reason}</td>
                    <td style={s.td}><StatusChip status={status} /></td>
                    <td style={{ ...s.td, color: '#6b7280' }}>{age}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* activity feed */}
            <div style={s.card}>
              <div style={s.cardHeader}>
                <span style={s.cardTitle}>Recent activity</span>
              </div>
              {[
                { text: 'Menu review #003 approved', time: '9 min ago', icon: '✓', color: '#22c55e' },
                { text: 'Feedback #18 escalated', time: '23 min ago', icon: '↑', color: '#f59e0b' },
                { text: 'User uid=a7f2 banned', time: '45 min ago', icon: '✕', color: '#ef4444' },
                { text: 'Photo pid=cc1a flagged', time: '1h ago', icon: '⚑', color: '#f59e0b' },
                { text: 'DB snapshot completed', time: '1.5h ago', icon: '●', color: '#22c55e' },
              ].map((a) => (
                <div key={a.text} style={s.activityRow}>
                  <span style={{ ...s.activityIcon, color: a.color }}>{a.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13 }}>{a.text}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{a.time}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* quick stats */}
            <div style={s.card}>
              <div style={s.cardHeader}>
                <span style={s.cardTitle}>System health</span>
              </div>
              {[
                { label: 'API latency', value: '42ms', ok: true },
                { label: 'Error rate', value: '0.02%', ok: true },
                { label: 'DB connections', value: '12 / 50', ok: true },
                { label: 'Queue depth', value: '12', ok: false },
              ].map((row) => (
                <div key={row.label} style={s.healthRow}>
                  <span style={{ color: '#6b7280', fontSize: 13 }}>{row.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: row.ok ? '#e5e7eb' : '#f59e0b' }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function ChevronDown() {
  return <span style={{ fontSize: 10, color: '#6b7280' }}>▾</span>;
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    pending: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', label: 'Pending' },
    in_progress: { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', label: 'In review' },
    reviewed: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', label: 'Reviewed' },
    dismissed: { bg: 'rgba(107,114,128,0.12)', color: '#6b7280', label: 'Dismissed' },
  };
  const c = map[status] ?? map.pending;
  return (
    <span style={{ background: c.bg, color: c.color, borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
      {c.label}
    </span>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: { display: 'flex', minHeight: '100vh', background: '#0f1117', color: '#e5e7eb', fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif', fontSize: 13 },
  sidebar: { width: 220, background: '#0a0c12', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', padding: '20px 12px', gap: 4, flexShrink: 0 },
  wordmark: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', marginBottom: 12, fontWeight: 700, fontSize: 14 },
  dot: { width: 8, height: 8, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' },
  workspace: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', marginBottom: 16, cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  workspaceLabel: {},
  section: { display: 'flex', flexDirection: 'column', gap: 1 },
  sectionLabel: { fontSize: 10, fontWeight: 700, color: '#4b5563', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 8px', marginBottom: 4 },
  navItem: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', color: '#9ca3af', fontWeight: 500 },
  navActive: { background: 'rgba(99,102,241,0.12)', color: '#a5b4fc' },
  navIcon: { fontSize: 11, width: 16, textAlign: 'center' },
  badge: { background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 },
  userRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 8px', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 8 },
  avatar: { width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 },
  main: { flex: 1, display: 'flex', flexDirection: 'column', padding: '28px 32px', gap: 24, overflow: 'auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' },
  breadcrumb: { fontSize: 11, color: '#4b5563', marginBottom: 6 },
  pageTitle: { margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' },
  btnPrimary: { background: '#6366f1', border: 'none', color: '#fff', borderRadius: 7, padding: '7px 14px', fontWeight: 600, fontSize: 12, cursor: 'pointer' },
  btnSecondary: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', borderRadius: 7, padding: '7px 14px', fontWeight: 600, fontSize: 12, cursor: 'pointer' },
  metricsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 },
  metricCard: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '16px 18px', cursor: 'default' },
  metricLabel: { fontSize: 12, color: '#6b7280', fontWeight: 500 },
  metricValue: { fontSize: 26, fontWeight: 700, marginTop: 6, letterSpacing: '-0.02em' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 },
  card: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontWeight: 600, fontSize: 13 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 11, color: '#4b5563', fontWeight: 600, letterSpacing: '0.04em', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  td: { padding: '10px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)', verticalAlign: 'middle' },
  activityRow: { display: 'flex', gap: 10, alignItems: 'flex-start', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.04)' },
  activityIcon: { width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 700, fontSize: 12 },
  healthRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' },
};

const hoverCss = `
  .l-nav:hover { background: rgba(255,255,255,0.04) !important; color: #e5e7eb !important; }
  .l-row:hover td { background: rgba(255,255,255,0.02) !important; }
  .l-card:hover { border-color: rgba(99,102,241,0.3) !important; }
`;
