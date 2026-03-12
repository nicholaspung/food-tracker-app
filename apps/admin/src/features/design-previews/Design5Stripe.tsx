/**
 * Design 5 — Stripe Dashboard
 * Professional dark slate, horizontal topnav, prominent number hierarchy,
 * inline filter chips, dense readable tables.
 */
export function Design5Stripe() {
  return (
    <div style={s.root}>
      <style>{css}</style>

      {/* top nav */}
      <header style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.logo}>
            <span style={s.logoBracket}>&lt;</span>
            <span style={s.logoText}>ft</span>
            <span style={s.logoBracket}>/&gt;</span>
          </div>
          <nav style={s.nav}>
            {[
              { label: 'Dashboard', active: true },
              { label: 'Menu Reviews', badge: '12' },
              { label: 'Feedback', badge: '7' },
              { label: 'Moderation' },
              { label: 'Users' },
            ].map((item) => (
              <a key={item.label} style={{ ...s.navLink, ...(item.active ? s.navLinkActive : {}) }} href="#" className="s-nav">
                {item.label}
                {item.badge && <span style={s.navBadge}>{item.badge}</span>}
              </a>
            ))}
          </nav>
        </div>
        <div style={s.headerRight}>
          <span style={s.envBadge}>● Live</span>
          <button style={s.headerBtn}>⚙</button>
          <div style={s.headerAvatar}>A</div>
        </div>
      </header>

      <div style={s.body}>
        {/* page title */}
        <div style={s.pageHead}>
          <div>
            <h1 style={s.pageTitle}>Overview</h1>
            <p style={s.pageDesc}>Moderation queue health and recent admin activity.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select style={s.select}>
              <option>Last 24 hours</option>
              <option>Last 7 days</option>
              <option>Last 30 days</option>
            </select>
            <button style={s.primaryBtn}>Export</button>
          </div>
        </div>

        {/* big metrics */}
        <div style={s.metricsGrid}>
          {[
            { label: 'Pending reviews', value: '12', change: '+3', up: true, note: 'vs yesterday' },
            { label: 'Open feedback', value: '7', change: '−2', up: false, note: 'vs yesterday' },
            { label: 'Photos uploaded', value: '84', change: '+17', up: true, note: 'this week' },
            { label: 'Total users', value: '1,204', change: '+6', up: true, note: 'new this week' },
            { label: 'Avg resolution', value: '4.2h', change: '−0.8h', up: false, note: 'faster' },
          ].map((m) => (
            <div key={m.label} style={s.metricCard} className="s-card">
              <div style={s.metricLabel}>{m.label}</div>
              <div style={s.metricValueRow}>
                <span style={s.metricValue}>{m.value}</span>
                <span style={{ ...s.metricChange, color: m.up ? '#3ecf8e' : '#f97316' }}>
                  {m.change}
                </span>
              </div>
              <div style={s.metricNote}>{m.note}</div>
              <MiniLine up={m.up} />
            </div>
          ))}
        </div>

        {/* main grid */}
        <div style={s.mainGrid}>
          {/* queue table */}
          <div style={s.tableCard}>
            <div style={s.tableHeader}>
              <div style={s.tableTitle}>Menu Review Queue</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {['All', 'Pending', 'In review', 'Reviewed', 'Dismissed'].map((f, i) => (
                  <span key={f} style={{ ...s.filterChip, ...(i === 0 ? s.filterChipActive : {}) }} className="s-chip">
                    {f}
                  </span>
                ))}
              </div>
            </div>
            <table style={s.table}>
              <thead>
                <tr>
                  {['Restaurant', 'Requested by', 'Reason', 'Status', 'Age', ''].map((h) => (
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
                  ['Curry House', 'frank@e.com', 'Price update', 'pending', '1d'],
                ].map(([name, user, reason, status, age]) => (
                  <tr key={name} className="s-row">
                    <td style={s.td}>
                      <div style={s.restaurantCell}>
                        <div style={s.restaurantIcon}>{name[0]}</div>
                        <span style={{ fontWeight: 500 }}>{name}</span>
                      </div>
                    </td>
                    <td style={{ ...s.td, color: '#94a3b8' }}>{user}</td>
                    <td style={{ ...s.td, color: '#94a3b8' }}>{reason}</td>
                    <td style={s.td}><SStatus s={status} /></td>
                    <td style={{ ...s.td, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{age}</td>
                    <td style={s.td}>
                      <span style={s.actionLink} className="s-link">Review →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={s.tableFoot}>
              <span style={{ color: '#64748b', fontSize: 12 }}>Showing 7 of 12</span>
              <button style={s.loadMoreBtn}>Load more</button>
            </div>
          </div>

          {/* right sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* health */}
            <div style={s.sideCard}>
              <div style={s.sideTitle}>System</div>
              {[
                { label: 'API', value: 'Healthy', ok: true },
                { label: 'Database', value: 'Healthy', ok: true },
                { label: 'Auth service', value: 'Healthy', ok: true },
                { label: 'Queue depth', value: '12 items', ok: false },
                { label: 'Error rate', value: '0.02%', ok: true },
              ].map((r) => (
                <div key={r.label} style={s.healthRow}>
                  <span style={{ color: '#94a3b8', fontSize: 12 }}>{r.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: r.ok ? '#3ecf8e' : '#f97316' }}>
                    {r.value}
                  </span>
                </div>
              ))}
            </div>

            {/* recent feedback */}
            <div style={s.sideCard}>
              <div style={s.sideTitle}>Recent feedback</div>
              {[
                { title: 'App crashes on photo upload', status: 'open', user: 'u1@e.com', time: '30m' },
                { title: 'Login loop after reset', status: 'in_progress', user: 'u2@e.com', time: '2h' },
                { title: 'Missing restaurant', status: 'open', user: 'u3@e.com', time: '4h' },
                { title: 'Wrong bill total', status: 'resolved', user: 'u4@e.com', time: '1d' },
              ].map((f) => (
                <div key={f.title} style={s.feedItem}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>{f.title}</span>
                    <SStatus s={f.status} small />
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{f.user} · {f.time} ago</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SStatus({ s, small }: { s: string; small?: boolean }) {
  const map: Record<string, { dot: string; label: string }> = {
    pending: { dot: '#f97316', label: 'Pending' },
    in_progress: { dot: '#60a5fa', label: 'In review' },
    reviewed: { dot: '#3ecf8e', label: 'Reviewed' },
    dismissed: { dot: '#475569', label: 'Dismissed' },
    open: { dot: '#f97316', label: 'Open' },
    resolved: { dot: '#3ecf8e', label: 'Resolved' },
  };
  const c = map[s] ?? map.pending;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: small ? 10 : 12, background: c.dot + '18', borderRadius: 4, padding: small ? '2px 6px' : '3px 8px', whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
      <span style={{ color: c.dot, fontWeight: 600 }}>{c.label}</span>
    </span>
  );
}

function MiniLine({ up }: { up: boolean }) {
  const color = up ? '#3ecf8e' : '#f97316';
  const d = up
    ? 'M0,20 C10,18 20,12 30,10 C40,8 50,4 60,2'
    : 'M0,2 C10,4 20,8 30,10 C40,12 50,16 60,18';
  return (
    <svg width={60} height={22} style={{ display: 'block', marginTop: 8 }}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} opacity={0.6} />
    </svg>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: { background: '#0b1120', color: '#e2e8f0', fontFamily: '"Inter", system-ui, sans-serif', fontSize: 13, minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  header: { background: '#0d1526', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52, flexShrink: 0 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 24 },
  logo: { display: 'flex', alignItems: 'center', gap: 1, fontFamily: 'monospace', fontWeight: 900 },
  logoBracket: { color: '#7c3aed', fontSize: 16 },
  logoText: { color: '#e2e8f0', fontSize: 14 },
  nav: { display: 'flex', gap: 2 },
  navLink: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, color: '#94a3b8', fontSize: 13, textDecoration: 'none', fontWeight: 500 },
  navLinkActive: { background: 'rgba(124,58,237,0.12)', color: '#a78bfa' },
  navBadge: { background: '#7c3aed', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  envBadge: { color: '#3ecf8e', fontSize: 12, fontWeight: 600 },
  headerBtn: { background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: '#94a3b8', padding: '5px 9px', cursor: 'pointer' },
  headerAvatar: { width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 },
  body: { padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 24, flex: 1 },
  pageHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  pageTitle: { margin: '0 0 4px', fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', color: '#f1f5f9' },
  pageDesc: { margin: 0, color: '#64748b', fontSize: 13 },
  select: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7, color: '#e2e8f0', padding: '7px 10px', fontSize: 12, cursor: 'pointer' },
  primaryBtn: { background: '#7c3aed', border: 'none', color: '#fff', borderRadius: 7, padding: '7px 16px', fontWeight: 600, fontSize: 12, cursor: 'pointer' },
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 },
  metricCard: { background: '#0d1526', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', cursor: 'default' },
  metricLabel: { fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 },
  metricValueRow: { display: 'flex', alignItems: 'baseline', gap: 8 },
  metricValue: { fontSize: 26, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.03em' },
  metricChange: { fontSize: 12, fontWeight: 700 },
  metricNote: { fontSize: 11, color: '#475569', marginTop: 2 },
  mainGrid: { display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, flex: 1 },
  tableCard: { background: '#0d1526', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  tableHeader: { padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  tableTitle: { fontWeight: 700, fontSize: 14, color: '#f1f5f9' },
  filterChip: { padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, color: '#64748b', cursor: 'pointer', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' },
  filterChipActive: { background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', color: '#a78bfa' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '10px 16px', fontSize: 10, color: '#475569', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  td: { padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', verticalAlign: 'middle' },
  restaurantCell: { display: 'flex', alignItems: 'center', gap: 10 },
  restaurantIcon: { width: 26, height: 26, borderRadius: 6, background: 'rgba(124,58,237,0.2)', color: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 },
  actionLink: { color: '#7c3aed', fontWeight: 600, fontSize: 12, cursor: 'pointer' },
  tableFoot: { padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  loadMoreBtn: { background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: '#94a3b8', padding: '5px 12px', fontSize: 12, cursor: 'pointer' },
  sideCard: { background: '#0d1526', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 },
  sideTitle: { fontWeight: 700, fontSize: 13, color: '#f1f5f9', paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 2 },
  healthRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  feedItem: { paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' },
};

const css = `
  .s-nav:hover { background: rgba(255,255,255,0.04) !important; color: #e2e8f0 !important; }
  .s-row:hover td { background: rgba(255,255,255,0.02) !important; cursor: pointer; }
  .s-chip:hover { border-color: rgba(124,58,237,0.3) !important; color: #a78bfa !important; }
  .s-link:hover { color: #a78bfa !important; }
  .s-card:hover { border-color: rgba(124,58,237,0.2) !important; }
`;
