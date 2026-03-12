/**
 * Design 3 — Grafana / Analytics-first
 * Wide horizontal metric bar, chart-centric layout, navy blue palette.
 * Every screen looks like a monitoring dashboard.
 */
export function Design3Grafana() {
  return (
    <div style={s.root}>
      <style>{css}</style>

      {/* top nav bar */}
      <header style={s.topbar}>
        <div style={s.topLeft}>
          <span style={s.logo}>⬡</span>
          <span style={s.logoText}>Food Tracker</span>
          <span style={s.divider} />
          <nav style={s.topNav}>
            {['Dashboard', 'Menu Reviews', 'Feedback', 'Moderation', 'Users'].map((label, i) => (
              <a key={label} style={{ ...s.topNavLink, ...(i === 0 ? s.topNavActive : {}) }} href="#">
                {label}
              </a>
            ))}
          </nav>
        </div>
        <div style={s.topRight}>
          <TimeRangePicker />
          <button style={s.refreshBtn}>↻ Refresh</button>
          <span style={s.adminBadge}>admin</span>
        </div>
      </header>

      <div style={s.body}>
        {/* page heading */}
        <div style={s.pageHead}>
          <div>
            <div style={s.pageEyebrow}>Moderation Console</div>
            <h1 style={s.pageTitle}>Queue Health Overview</h1>
          </div>
          <div style={{ color: '#8faac3', fontSize: 12 }}>Last updated: just now</div>
        </div>

        {/* stat strip */}
        <div style={s.statStrip}>
          {[
            { label: 'Pending Reviews', value: '12', unit: '', color: '#f5a623', spark: [4, 6, 8, 7, 10, 12] },
            { label: 'Open Feedback', value: '7', unit: '', color: '#50e3c2', spark: [10, 9, 8, 9, 8, 7] },
            { label: 'Photos / 7d', value: '84', unit: '', color: '#7b68ee', spark: [50, 55, 62, 70, 78, 84] },
            { label: 'Total Users', value: '1.2k', unit: '', color: '#4fc3f7', spark: [1100, 1140, 1160, 1180, 1198, 1204] },
            { label: 'Avg Resolution', value: '4.2', unit: 'hrs', color: '#81c784', spark: [6, 5.5, 5, 4.8, 4.4, 4.2] },
            { label: 'Flag Rate', value: '0.4', unit: '%', color: '#ef9a9a', spark: [0.2, 0.3, 0.35, 0.4, 0.38, 0.4] },
          ].map((stat) => (
            <div key={stat.label} style={s.statCard}>
              <div style={s.statLabel}>{stat.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ ...s.statValue, color: stat.color }}>{stat.value}</span>
                {stat.unit && <span style={{ fontSize: 13, color: '#8faac3' }}>{stat.unit}</span>}
              </div>
              <MiniSparkline values={stat.spark} color={stat.color} />
            </div>
          ))}
        </div>

        {/* main panels */}
        <div style={s.panelGrid}>
          {/* queue timeline bar chart */}
          <div style={s.panel}>
            <div style={s.panelTitle}>
              Review queue — last 7 days
              <span style={s.panelBadge}>bar chart</span>
            </div>
            <BarChart
              data={[
                { label: 'Mon', pending: 8, reviewed: 5, dismissed: 1 },
                { label: 'Tue', pending: 11, reviewed: 7, dismissed: 2 },
                { label: 'Wed', pending: 9, reviewed: 9, dismissed: 0 },
                { label: 'Thu', pending: 14, reviewed: 10, dismissed: 3 },
                { label: 'Fri', pending: 10, reviewed: 8, dismissed: 1 },
                { label: 'Sat', pending: 6, reviewed: 4, dismissed: 0 },
                { label: 'Sun', pending: 12, reviewed: 6, dismissed: 2 },
              ]}
            />
            <div style={s.legend}>
              {[['#f5a623', 'Pending'], ['#50e3c2', 'Reviewed'], ['#6272a4', 'Dismissed']].map(([c, l]) => (
                <span key={l} style={s.legendItem}>
                  <span style={{ ...s.legendDot, background: c }} />{l}
                </span>
              ))}
            </div>
          </div>

          {/* donut placeholder */}
          <div style={s.panel}>
            <div style={s.panelTitle}>
              Status distribution
              <span style={s.panelBadge}>donut</span>
            </div>
            <DonutChart
              slices={[
                { label: 'Pending', value: 42, color: '#f5a623' },
                { label: 'In review', value: 18, color: '#4fc3f7' },
                { label: 'Reviewed', value: 30, color: '#50e3c2' },
                { label: 'Dismissed', value: 10, color: '#6272a4' },
              ]}
            />
          </div>

          {/* table panel */}
          <div style={{ ...s.panel, gridColumn: '1 / -1' }}>
            <div style={s.panelTitle}>
              Menu review queue
              <span style={s.panelBadge}>table</span>
            </div>
            <table style={s.table}>
              <thead>
                <tr>
                  {['Restaurant', 'User', 'Reason', 'Status', 'Created', 'Age'].map((h) => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['The Golden Fork', 'u@test.com', 'Incorrect hours', 'pending', '2026-03-10 09:12', '2h'],
                  ['Sakura Ramen', 'alice@e.com', 'Missing items', 'pending', '2026-03-10 06:30', '5h'],
                  ['Burger Barn', 'bob@e.com', 'Wrong price', 'in_progress', '2026-03-10 02:15', '9h'],
                  ['Taco Town', 'carol@e.com', 'Bad photo', 'pending', '2026-03-10 00:05', '11h'],
                  ['Pizza Palace', 'dave@e.com', 'Name error', 'dismissed', '2026-03-09 22:00', '14h'],
                  ['Sushi Spot', 'eve@e.com', 'New items', 'reviewed', '2026-03-09 12:00', '1d'],
                ].map(([name, user, reason, status, created, age]) => (
                  <tr key={name} className="g-row">
                    <td style={s.td}><strong>{name}</strong></td>
                    <td style={{ ...s.td, color: '#8faac3' }}>{user}</td>
                    <td style={{ ...s.td, color: '#8faac3' }}>{reason}</td>
                    <td style={s.td}><GStatus s={status} /></td>
                    <td style={{ ...s.td, color: '#8faac3', fontFamily: 'monospace', fontSize: 11 }}>{created}</td>
                    <td style={{ ...s.td, color: '#8faac3' }}>{age}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimeRangePicker() {
  return (
    <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '4px 10px', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center', color: '#c0d4e9' }}>
      <span>🕐</span>
      <span>Last 24 hours</span>
      <span style={{ color: '#4a6785' }}>▾</span>
    </div>
  );
}

function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 80, h = 28;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  });
  return (
    <svg width={w} height={h} style={{ marginTop: 8, display: 'block' }}>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" opacity="0.8" />
    </svg>
  );
}

function BarChart({ data }: { data: Array<{ label: string; pending: number; reviewed: number; dismissed: number }> }) {
  const max = Math.max(...data.map((d) => d.pending + d.reviewed + d.dismissed));
  const h = 120;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: h + 24, padding: '0 8px' }}>
      {data.map((d) => {
        const total = d.pending + d.reviewed + d.dismissed;
        const scale = h / max;
        return (
          <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: h }}>
              <div style={{ background: '#6272a4', height: d.dismissed * scale, width: '100%', borderRadius: '2px 2px 0 0' }} />
              <div style={{ background: '#50e3c2', height: d.reviewed * scale, width: '100%' }} />
              <div style={{ background: '#f5a623', height: d.pending * scale, width: '100%' }} />
            </div>
            <div style={{ fontSize: 10, color: '#8faac3' }}>{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({ slices }: { slices: Array<{ label: string; value: number; color: string }> }) {
  const total = slices.reduce((a, b) => a + b.value, 0);
  let cumulative = 0;
  const cx = 80, cy = 80, r = 60, inner = 36;

  const paths = slices.map((slice) => {
    const startAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
    cumulative += slice.value;
    const endAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const ix1 = cx + inner * Math.cos(startAngle);
    const iy1 = cy + inner * Math.sin(startAngle);
    const ix2 = cx + inner * Math.cos(endAngle);
    const iy2 = cy + inner * Math.sin(endAngle);
    const large = slice.value / total > 0.5 ? 1 : 0;
    return (
      <path
        key={slice.label}
        d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${inner} ${inner} 0 ${large} 0 ${ix1} ${iy1} Z`}
        fill={slice.color}
        opacity={0.85}
      />
    );
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <svg width={160} height={160}>
        {paths}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="#c0d4e9" fontSize={18} fontWeight="700">{total}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="#8faac3" fontSize={10}>total</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {slices.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ color: '#8faac3', minWidth: 72 }}>{s.label}</span>
            <span style={{ fontWeight: 700, color: '#c0d4e9' }}>{s.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GStatus({ s }: { s: string }) {
  const map: Record<string, [string, string]> = {
    pending: ['#f5a623', 'Pending'],
    in_progress: ['#4fc3f7', 'In review'],
    reviewed: ['#50e3c2', 'Reviewed'],
    dismissed: ['#6272a4', 'Dismissed'],
  };
  const [color, label] = map[s] ?? ['#8faac3', s];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      <span style={{ color }}>{label}</span>
    </span>
  );
}

const s: Record<string, React.CSSProperties> = {
  root: { background: '#111926', color: '#c0d4e9', fontFamily: '"Inter", system-ui, sans-serif', fontSize: 13, minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  topbar: { background: '#0d1520', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 48, flexShrink: 0 },
  topLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  logo: { fontSize: 18, color: '#f5a623' },
  logoText: { fontWeight: 700, fontSize: 14, color: '#e2eaf4' },
  divider: { width: 1, height: 20, background: 'rgba(255,255,255,0.1)' },
  topNav: { display: 'flex', gap: 2 },
  topNavLink: { padding: '6px 12px', borderRadius: 4, color: '#8faac3', fontSize: 13, textDecoration: 'none', cursor: 'pointer' },
  topNavActive: { background: 'rgba(245,166,35,0.1)', color: '#f5a623' },
  topRight: { display: 'flex', alignItems: 'center', gap: 10 },
  refreshBtn: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#c0d4e9', padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  adminBadge: { background: 'rgba(80,227,194,0.1)', color: '#50e3c2', borderRadius: 4, padding: '3px 8px', fontSize: 11, fontWeight: 600 },
  body: { padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 },
  pageHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' },
  pageEyebrow: { fontSize: 11, color: '#4a6785', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 },
  pageTitle: { margin: 0, fontSize: 20, fontWeight: 700, color: '#e2eaf4', letterSpacing: '-0.01em' },
  statStrip: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' },
  statCard: { background: '#0d1520', padding: '14px 16px', display: 'flex', flexDirection: 'column' },
  statLabel: { fontSize: 10, color: '#4a6785', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 },
  statValue: { fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' },
  panelGrid: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 },
  panel: { background: '#0d1520', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 },
  panelTitle: { fontSize: 12, fontWeight: 700, color: '#8faac3', letterSpacing: '0.04em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 10 },
  panelBadge: { background: 'rgba(255,255,255,0.06)', borderRadius: 3, padding: '2px 6px', fontSize: 9, fontWeight: 400, letterSpacing: '0.06em', color: '#4a6785' },
  legend: { display: 'flex', gap: 16 },
  legendItem: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#8faac3' },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 10, color: '#4a6785', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  td: { padding: '10px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)', verticalAlign: 'middle' },
};

const css = `.g-row:hover td { background: rgba(255,255,255,0.02) !important; cursor: pointer; }`;
