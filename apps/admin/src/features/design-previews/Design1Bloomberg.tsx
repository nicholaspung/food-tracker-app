/**
 * Design 1 — Bloomberg Terminal
 * Dense monospace data grid. Every pixel earns its place.
 * No decoration, pure signal.
 */
export function Design1Bloomberg() {
  return (
    <div style={s.root}>
      <style>{css}</style>

      {/* top bar */}
      <div style={s.topStrip}>
        <span style={s.brand}>FOOD TRACKER ▸ ADMIN</span>
        <span style={s.clock}>
          {new Date().toUTCString().toUpperCase()} &nbsp;|&nbsp; SESSION: ADMIN@SYSTEM
        </span>
      </div>

      <div style={s.shell}>
        {/* left rail */}
        <aside style={s.rail}>
          {['DASHBOARD', 'MENU-REVIEWS', 'FEEDBACK', 'MODERATION', 'USERS'].map((label, i) => (
            <div key={label} style={{ ...s.railItem, ...(i === 0 ? s.railItemActive : {}) }}>
              <span style={s.railNum}>{String(i + 1).padStart(2, '0')}</span>
              <span>{label}</span>
            </div>
          ))}
          <div style={s.railDivider} />
          <div style={{ ...s.railItem, color: '#ff5555', marginTop: 'auto' }}>LOGOUT</div>
        </aside>

        {/* main content */}
        <main style={s.main}>
          {/* headline row */}
          <div style={s.headRow}>
            <div>
              <div style={s.tag}>QUEUE HEALTH</div>
              <div style={s.headline}>MODERATION CONSOLE</div>
            </div>
            <div style={s.statusRow}>
              <Pill label="API" color="#50fa7b" />
              <Pill label="DB" color="#50fa7b" />
              <Pill label="AUTH" color="#50fa7b" />
            </div>
          </div>

          {/* metric strip */}
          <div style={s.metricStrip}>
            {[
              { label: 'PENDING REVIEWS', val: '12', delta: '+3', up: true },
              { label: 'OPEN FEEDBACK', val: '7', delta: '-2', up: false },
              { label: 'PHOTOS / 7D', val: '84', delta: '+17', up: true },
              { label: 'TOTAL USERS', val: '1,204', delta: '+6', up: true },
              { label: 'AVG RESOLUTION', val: '4.2H', delta: '-0.8H', up: false },
              { label: 'FLAG RATE', val: '0.4%', delta: '+0.1', up: true },
            ].map((m) => (
              <div key={m.label} style={s.metricCell}>
                <div style={s.metricLabel}>{m.label}</div>
                <div style={s.metricVal}>{m.val}</div>
                <div style={{ color: m.up ? '#50fa7b' : '#ff5555', fontSize: 11 }}>{m.delta}</div>
              </div>
            ))}
          </div>

          {/* two column body */}
          <div style={s.body}>
            {/* left: data table */}
            <div style={s.panel}>
              <div style={s.panelHeader}>
                MENU REVIEW QUEUE &nbsp;
                <span style={{ color: '#ffb86c' }}>12 PENDING</span>
              </div>
              <table style={s.table}>
                <thead>
                  <tr>
                    {['#', 'RESTAURANT', 'REQUESTED BY', 'REASON', 'STATUS', 'AGE'].map((h) => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['001', 'The Golden Fork', 'u@test.com', 'Incorrect hours', 'PENDING', '2H'],
                    ['002', 'Sakura Ramen', 'alice@e.com', 'Missing items', 'PENDING', '5H'],
                    ['003', 'Burger Barn', 'bob@e.com', 'Wrong price', 'IN REVIEW', '9H'],
                    ['004', 'Taco Town', 'carol@e.com', 'Bad photo', 'PENDING', '11H'],
                    ['005', 'Pizza Palace', 'dave@e.com', 'Name error', 'DISMISSED', '14H'],
                    ['006', 'Sushi Spot', 'eve@e.com', 'New items', 'REVIEWED', '1D'],
                    ['007', 'Curry House', 'frank@e.com', 'Price update', 'PENDING', '1D'],
                  ].map(([id, restaurant, user, reason, status, age]) => (
                    <tr key={id} style={s.tr} className="b-row">
                      <td style={s.td}>{id}</td>
                      <td style={s.td}>{restaurant}</td>
                      <td style={{ ...s.td, color: '#8be9fd' }}>{user}</td>
                      <td style={s.td}>{reason}</td>
                      <td style={{ ...s.td, color: statusColor(status) }}>{status}</td>
                      <td style={{ ...s.td, color: '#6272a4' }}>{age}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* right: sidebar panels */}
            <div style={s.sidebar}>
              <div style={s.panel}>
                <div style={s.panelHeader}>RECENT FEEDBACK</div>
                {[
                  { title: 'App crashes on photo upload', status: 'OPEN', user: 'u1@e.com', age: '30M' },
                  { title: 'Login loop after password reset', status: 'IN PROGRESS', user: 'u2@e.com', age: '2H' },
                  { title: 'Missing restaurant in search', status: 'OPEN', user: 'u3@e.com', age: '4H' },
                  { title: 'Wrong bill total calculation', status: 'RESOLVED', user: 'u4@e.com', age: '1D' },
                ].map((f) => (
                  <div key={f.title} style={s.feedRow}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ flex: 1 }}>{f.title}</span>
                      <span style={{ color: statusColor(f.status), whiteSpace: 'nowrap', fontSize: 10 }}>{f.status}</span>
                    </div>
                    <div style={{ color: '#6272a4', fontSize: 10, marginTop: 2 }}>
                      {f.user} &nbsp;·&nbsp; {f.age} AGO
                    </div>
                  </div>
                ))}
              </div>

              <div style={s.panel}>
                <div style={s.panelHeader}>SYSTEM LOG</div>
                {[
                  '[09:14:22] Admin reviewed menu/003',
                  '[09:02:11] Feedback #18 escalated',
                  '[08:55:03] User ban: uid=a7f2',
                  '[08:41:59] Photo flagged: pid=cc1a',
                  '[08:30:00] DB snapshot OK',
                  '[08:00:00] Cron: cleanup ran',
                ].map((line) => (
                  <div key={line} style={s.logLine}>{line}</div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ color, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em' }}>
      ● {label}
    </span>
  );
}

function statusColor(s: string) {
  if (s.includes('PEND')) return '#ffb86c';
  if (s.includes('REVIEW') || s.includes('RESOLVED')) return '#50fa7b';
  if (s.includes('DISMISSED')) return '#6272a4';
  if (s.includes('PROGRESS') || s.includes('IN REVIEW')) return '#8be9fd';
  return '#f8f8f2';
}

const FONT = '"Fira Code", "Courier New", monospace';

const s: Record<string, React.CSSProperties> = {
  root: { background: '#0d0d0d', color: '#f8f8f2', fontFamily: FONT, fontSize: 12, minHeight: '100vh', display: 'flex', flexDirection: 'column' },
  topStrip: { background: '#282a36', borderBottom: '1px solid #44475a', padding: '6px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: '#ffb86c', fontWeight: 700, letterSpacing: '0.18em', fontSize: 11 },
  clock: { color: '#6272a4', fontSize: 10 },
  shell: { display: 'flex', flex: 1 },
  rail: { background: '#111', borderRight: '1px solid #282a36', width: 180, display: 'flex', flexDirection: 'column', padding: '12px 0' },
  railItem: { display: 'flex', gap: 10, alignItems: 'center', padding: '8px 16px', color: '#6272a4', cursor: 'pointer', fontSize: 11, letterSpacing: '0.06em' },
  railItemActive: { background: 'rgba(255,184,108,0.08)', color: '#ffb86c', borderLeft: '2px solid #ffb86c' },
  railNum: { color: '#44475a', fontSize: 9, width: 16 },
  railDivider: { height: 1, background: '#282a36', margin: '8px 16px' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', padding: 20, gap: 16, overflow: 'hidden' },
  headRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  tag: { color: '#6272a4', fontSize: 10, letterSpacing: '0.16em', marginBottom: 4 },
  headline: { color: '#ffb86c', fontSize: 16, fontWeight: 700, letterSpacing: '0.1em' },
  statusRow: { display: 'flex', gap: 16, alignItems: 'center', background: '#111', border: '1px solid #282a36', padding: '6px 12px', borderRadius: 4 },
  metricStrip: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', border: '1px solid #282a36', background: '#111' },
  metricCell: { padding: '12px 14px', borderRight: '1px solid #282a36' },
  metricLabel: { color: '#6272a4', fontSize: 9, letterSpacing: '0.12em', marginBottom: 6 },
  metricVal: { color: '#f8f8f2', fontSize: 20, fontWeight: 700, marginBottom: 2 },
  body: { display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, flex: 1, minHeight: 0 },
  panel: { background: '#111', border: '1px solid #282a36', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  panelHeader: { background: '#282a36', padding: '7px 14px', fontSize: 10, letterSpacing: '0.12em', color: '#f8f8f2', fontWeight: 700 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 11 },
  th: { padding: '8px 12px', textAlign: 'left', color: '#6272a4', fontSize: 9, letterSpacing: '0.12em', borderBottom: '1px solid #282a36', whiteSpace: 'nowrap' },
  td: { padding: '7px 12px', borderBottom: '1px solid #1a1a2e', color: '#f8f8f2', whiteSpace: 'nowrap' },
  tr: { cursor: 'pointer' },
  sidebar: { display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' },
  feedRow: { padding: '8px 12px', borderBottom: '1px solid #1a1a2e', cursor: 'pointer' },
  logLine: { padding: '4px 12px', color: '#6272a4', fontSize: 10, borderBottom: '1px solid #1a1a2e' },
};

const css = `
  .b-row:hover td { background: rgba(255,184,108,0.04) !important; }
`;
