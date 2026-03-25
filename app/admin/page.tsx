'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { AppShell } from '@/components/app-shell';
import {
  collection, onSnapshot, query, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatCurrency } from '@/lib/ocr';
import {
  FileText, Clock, CheckCircle, XCircle,
  DollarSign, TrendingUp, Users, AlertTriangle,
  BarChart3, Fuel, Wrench, UtensilsCrossed, CircleDot, HelpCircle,
} from 'lucide-react';
import type { Request } from '@/lib/types';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  enviada:            { label: 'Enviada',     color: '#8b8ea0' },
  aprobada:           { label: 'Aprobada',    color: '#60a5fa' },
  transferida:        { label: 'Transferida', color: '#60a5fa' },
  comprobante_subido: { label: 'Comprobante', color: '#a78bfa' },
  factura_subida:     { label: 'Factura',     color: '#a78bfa' },
  validada:           { label: 'Validada',    color: '#22c55e' },
  observada:          { label: 'Observada',   color: '#f97316' },
  liquidada:          { label: 'Liquidada',   color: '#22c55e' },
  rechazada:          { label: 'Rechazada',   color: '#ef4444' },
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  combustible: <Fuel    size={13} />,
  materiales:  <Wrench  size={13} />,
  viatico:     <UtensilsCrossed size={13} />,
  gomera:      <CircleDot size={13} />,
  otros:       <HelpCircle size={13} />,
};

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_MAP[status] ?? { label: status, color: '#8b8ea0' };
  return (
    <span style={{
      fontSize: '.6rem', fontWeight: 700, letterSpacing: '.09em',
      textTransform: 'uppercase', color: cfg.color,
      background: `${cfg.color}18`, border: `1px solid ${cfg.color}30`,
      padding: '.15rem .5rem', borderRadius: 99, whiteSpace: 'nowrap',
    }}>{cfg.label}</span>
  );
}

function StatCard({ icon, value, label, color, loading }: {
  icon: React.ReactNode; value: string | number;
  label: string; color: string; loading: boolean;
}) {
  return (
    <div className="ad-stat">
      <div className="ad-stat-ico" style={{ background: `${color}15`, color }}>{icon}</div>
      {loading
        ? <><div className="ad-skeleton" style={{ width: '55%', height: '1.7rem', marginBottom: '.25rem' }} />
            <div className="ad-skeleton" style={{ width: '80%', height: '.65rem' }} /></>
        : <><span className="ad-stat-val">{value}</span>
            <span className="ad-stat-lbl">{label}</span></>}
    </div>
  );
}

function AdminDashboard() {
  const [requests,  setRequests]  = useState<Request[]>([]);
  const [userCount, setUserCount] = useState(0);
  const [mounted,   setMounted]   = useState(false);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const q = query(collection(db, 'requests'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => {
        const raw = d.data();
        return {
          ...raw,
          id:        d.id,
          createdAt: raw.createdAt?.toDate?.()?.toISOString() ?? raw.createdAt ?? '',
          updatedAt: raw.updatedAt?.toDate?.()?.toISOString() ?? raw.updatedAt ?? '',
        } as Request;
      });
      setRequests(data);
      setLoading(false);
    }, err => { console.error('requests snapshot:', err); setLoading(false); });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), snap => {
      setUserCount(snap.size);
    });
    return () => unsub();
  }, []);

  const now = new Date();
  const thisMonth = requests.filter(r => {
    const d = new Date(r.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const stats = {
    total:     requests.length,
    pending:   requests.filter(r => !['validada','liquidada','rechazada'].includes(r.status)).length,
    validated: requests.filter(r => ['validada','liquidada'].includes(r.status)).length,
    rejected:  requests.filter(r => r.status === 'rechazada').length,
    totalAmt:  requests.reduce((s, r) => s + (r.totalAmount ?? 0), 0),
    monthAmt:  thisMonth.reduce((s, r) => s + (r.totalAmount ?? 0), 0),
    observed:  requests.filter(r => r.status === 'observada').length,
  };

  const recent = requests.slice(0, 10);

  const typeBreakdown = ['combustible','materiales','viatico','gomera','otros'].map(t => ({
    type: t,
    count: requests.filter(r => r.type === t).length,
    amount: requests.filter(r => r.type === t).reduce((s, r) => s + (r.totalAmount ?? 0), 0),
  })).filter(t => t.count > 0).sort((a, b) => b.amount - a.amount);

  return (
    <AppShell requiredRole="admin">
      <style>{STYLES}</style>

      <div className="ad-page">
        <div className="ad-topbar" />

        <div className={`fu ${mounted ? 'in' : ''}`}>
          <div className="ad-eyebrow">Panel Admin</div>
          <h1 className="ad-title">Dashboard <em>Administrativo</em></h1>
          <div className="ad-sub">
            <div className="ad-live-dot" />
            Actualización en tiempo real · Firebase Firestore
          </div>
        </div>

        {/* Stats grid */}
        <div className={`ad-stats fu d1 ${mounted ? 'in' : ''}`}>
          <StatCard icon={<FileText size={16}/>} value={stats.total}     label="Total solicitudes" color="#60a5fa" loading={loading} />
          <StatCard icon={<Clock size={16}/>}    value={stats.pending}   label="En proceso"        color="#93c5fd" loading={loading} />
          <StatCard icon={<CheckCircle size={16}/>} value={stats.validated} label="Validadas"      color="#22c55e" loading={loading} />
          <StatCard icon={<XCircle size={16}/>}  value={stats.rejected}  label="Rechazadas"        color="#ef4444" loading={loading} />
        </div>

        {/* Financiero */}
        <div className={`ad-fin fu d2 ${mounted ? 'in' : ''}`}>
          <div className="ad-fin-card accent" style={{ gridColumn: 'span 2' }}>
            <DollarSign size={28} className="ad-fin-ico" />
            <div className="ad-fin-lbl">Total procesado</div>
            <div className="ad-fin-val accent">{loading ? '—' : formatCurrency(stats.totalAmt)}</div>
          </div>
          <div className="ad-fin-card">
            <TrendingUp size={24} className="ad-fin-ico" />
            <div className="ad-fin-lbl">Este mes</div>
            <div className="ad-fin-val">{loading ? '—' : formatCurrency(stats.monthAmt)}</div>
          </div>
          <div className="ad-fin-card">
            <Users size={24} className="ad-fin-ico" />
            <div className="ad-fin-lbl">Usuarios</div>
            <div className="ad-fin-val">{userCount}</div>
          </div>
          <div className="ad-fin-card">
            <AlertTriangle size={24} className="ad-fin-ico" />
            <div className="ad-fin-lbl">Observadas</div>
            <div className="ad-fin-val" style={{ color: stats.observed > 0 ? '#f97316' : 'var(--w)' }}>
              {loading ? '—' : stats.observed}
            </div>
          </div>
        </div>

        {/* Alerta observadas */}
        {stats.observed > 0 && !loading && (
          <div className={`ad-alert fu d2 ${mounted ? 'in' : ''}`}>
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <span><strong>{stats.observed}</strong> solicitud{stats.observed !== 1 ? 'es' : ''} observada{stats.observed !== 1 ? 's' : ''} esperando corrección del técnico</span>
          </div>
        )}

        {/* Tipo de gasto */}
        {!loading && typeBreakdown.length > 0 && (
          <div className={`ad-card fu d3 ${mounted ? 'in' : ''}`}>
            <div className="ad-card-hd">
              <div className="ad-card-title"><BarChart3 size={15}/>Por tipo de gasto</div>
            </div>
            <div className="ad-card-body">
              {typeBreakdown.map(t => (
                <div key={t.type} className="ad-type-row">
                  <div className="ad-row-ico">{TYPE_ICONS[t.type] ?? <HelpCircle size={13}/>}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'.4rem' }}>
                      <span style={{ fontSize:'.78rem', fontWeight:500, color:'rgba(240,244,255,.7)', textTransform:'capitalize' }}>{t.type}</span>
                      <span style={{ fontSize:'.72rem', color:'rgba(240,244,255,.4)' }}>{t.count} · {formatCurrency(t.amount)}</span>
                    </div>
                    <div className="ad-type-bar-wrap">
                      <div className="ad-type-bar" style={{ width: `${(t.amount / stats.totalAmt * 100).toFixed(1)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actividad reciente */}
        <div className={`ad-card fu d4 ${mounted ? 'in' : ''}`}>
          <div className="ad-card-hd">
            <div className="ad-card-title"><FileText size={15}/>Actividad reciente</div>
            <span className="ad-card-count">{recent.length}</span>
          </div>
          <div className="ad-card-body">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{ display:'flex', gap:'.875rem', padding:'.8rem 1.25rem', borderBottom:'1px solid var(--w08)', alignItems:'center' }}>
                  <div className="ad-skeleton" style={{ width:34, height:34, borderRadius:9, flexShrink:0 }} />
                  <div style={{ flex:1 }}>
                    <div className="ad-skeleton" style={{ width:'40%', height:'.83rem', marginBottom:'.3rem' }} />
                    <div className="ad-skeleton" style={{ width:'60%', height:'.68rem' }} />
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div className="ad-skeleton" style={{ width:70, height:'.9rem', marginBottom:'.3rem' }} />
                    <div className="ad-skeleton" style={{ width:55, height:'.6rem', borderRadius:99 }} />
                  </div>
                </div>
              ))
            ) : recent.length === 0 ? (
              <div className="ad-empty">No hay solicitudes registradas aún.</div>
            ) : (
              recent.map(req => (
                <div key={req.id} className="ad-row">
                  <div className="ad-row-ico">{TYPE_ICONS[req.type] ?? <HelpCircle size={13}/>}</div>
                  <div className="ad-row-info">
                    <span className="ad-row-num">{req.numero}</span>
                    <span className="ad-row-meta">
                      {(req as any).userName ?? '—'} · {new Date(req.createdAt).toLocaleDateString('es-DO', { day:'numeric', month:'short', year:'numeric' })}
                    </span>
                  </div>
                  <div className="ad-row-right">
                    <span className="ad-row-amt">{formatCurrency(req.totalAmount)}</span>
                    <StatusPill status={req.status} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default function AdminPage() {
  return <AdminDashboard />;
}

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Outfit:wght@300;400;500;600&display=swap');

.ad-page {
  font-family: 'Outfit', sans-serif;
  padding: 1.5rem;
  max-width: 1000px;
  margin: 0 auto;
  padding-bottom: 6rem;
  --blue: #3b82f6; --blue2: #60a5fa; --blue3: #93c5fd;
  --red: #ef4444;  --red2: #f87171;
  --blue-dim: rgba(59,130,246,.10); --blue-border: rgba(59,130,246,.35);
  --red-dim:  rgba(239,68,68,.10);  --red-border:  rgba(239,68,68,.30);
  --i3: #0a1120; --i4: #0e1828;
  --w: #f0f4ff;
  --w70: rgba(240,244,255,.70); --w40: rgba(240,244,255,.40);
  --w20: rgba(240,244,255,.20); --w08: rgba(240,244,255,.08);
  background: #04080f; min-height: 100vh;
}
@media(min-width:768px) { .ad-page { padding: 2rem 2.5rem 3rem; } }

/* Top accent bar — blue → red like login */
.ad-topbar {
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--blue) 30%, var(--red) 70%, transparent);
  opacity: .75;
  margin-bottom: 1.75rem;
  border-radius: 99px;
}

.ad-eyebrow {
  font-size: .66rem; font-weight: 700; letter-spacing: .18em; text-transform: uppercase;
  color: var(--blue2); display: flex; align-items: center; gap: .5rem; margin-bottom: .4rem;
}
.ad-eyebrow::before { content: ''; width: 18px; height: 1px; background: var(--blue2); opacity: .55; display: block; }

.ad-title {
  font-family: 'Playfair Display', serif;
  font-size: 1.8rem; font-weight: 500; color: var(--w);
  letter-spacing: -.01em; line-height: 1.15; margin-bottom: .3rem;
}
.ad-title em {
  font-style: italic;
  background: linear-gradient(125deg, var(--blue2) 20%, var(--blue3) 60%, var(--red2) 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}

.ad-sub {
  font-size: .78rem; color: var(--w40); font-weight: 300;
  margin-bottom: 1.5rem; display: flex; align-items: center; gap: .4rem;
}
.ad-live-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,.6);
  animation: ad-blink 2s ease-in-out infinite;
}
@keyframes ad-blink { 0%,100%{opacity:.5} 50%{opacity:1} }

/* Stat cards */
.ad-stats {
  display: grid; grid-template-columns: repeat(2,1fr);
  gap: .75rem; margin-bottom: 1.25rem;
}
@media(min-width:640px) { .ad-stats { grid-template-columns: repeat(4,1fr); } }

.ad-stat {
  background: var(--i3); border: 1px solid var(--w08); border-radius: 14px;
  padding: 1rem 1.1rem;
  transition: border-color .2s, transform .2s cubic-bezier(.22,1,.36,1);
}
.ad-stat:hover { border-color: var(--blue-border); transform: translateY(-2px); }
.ad-stat-ico {
  width: 32px; height: 32px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center; margin-bottom: .75rem;
}
.ad-stat-val {
  font-family: 'Playfair Display', serif;
  font-size: 1.6rem; font-weight: 600; color: var(--w);
  display: block; line-height: 1; margin-bottom: .2rem;
}
.ad-stat-lbl { font-size: .63rem; color: var(--w40); text-transform: uppercase; letter-spacing: .08em; }

/* Financial cards */
.ad-fin {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: .75rem; margin-bottom: 1.25rem;
}
@media(min-width:640px) { .ad-fin { grid-template-columns: repeat(3,1fr); } }

.ad-fin-card {
  background: var(--i3); border: 1px solid var(--w08);
  border-radius: 14px; padding: 1.25rem 1.1rem;
  transition: border-color .2s;
  position: relative; overflow: hidden;
}
.ad-fin-card:hover { border-color: var(--blue-border); }
.ad-fin-card.accent {
  border-color: var(--blue-border);
  background: linear-gradient(135deg, rgba(59,130,246,.08) 0%, rgba(239,68,68,.05) 100%);
}
/* subtle diagonal shine on accent card */
.ad-fin-card.accent::before {
  content: '';
  position: absolute; top: 0; right: 0;
  width: 120px; height: 100%;
  background: linear-gradient(155deg, rgba(59,130,246,.06), transparent);
  pointer-events: none;
}
.ad-fin-lbl { font-size: .68rem; color: var(--w40); text-transform: uppercase; letter-spacing: .07em; margin-bottom: .4rem; }
.ad-fin-val {
  font-family: 'Playfair Display', serif;
  font-size: 1.45rem; font-weight: 600; color: var(--w);
}
.ad-fin-val.accent { color: var(--blue3); }
.ad-fin-ico { float: right; opacity: .14; }

/* Alert */
.ad-alert {
  background: rgba(249,115,22,.07); border: 1px solid rgba(249,115,22,.22);
  border-radius: 12px; padding: .875rem 1.1rem; margin-bottom: 1.25rem;
  display: flex; align-items: center; gap: .75rem;
  font-size: .82rem; color: rgba(249,115,22,.9);
}

/* Cards */
.ad-card {
  background: var(--i3); border: 1px solid var(--w08);
  border-radius: 16px; overflow: hidden; margin-bottom: 1rem;
}
.ad-card-hd {
  padding: .875rem 1.25rem; border-bottom: 1px solid var(--w08);
  display: flex; align-items: center; justify-content: space-between;
}
.ad-card-title {
  font-family: 'Playfair Display', serif;
  font-size: 1rem; font-weight: 500; color: var(--w);
  display: flex; align-items: center; gap: .5rem;
}
.ad-card-count {
  font-size: .68rem; color: var(--w40);
  background: var(--w08); border-radius: 99px; padding: .1rem .5rem;
}
.ad-card-body { padding: 0; }

/* Rows */
.ad-row {
  display: flex; align-items: center; gap: .875rem;
  padding: .8rem 1.25rem; border-bottom: 1px solid var(--w08);
  transition: background .15s;
}
.ad-row:last-child { border-bottom: none; }
.ad-row:hover { background: rgba(240,244,255,.02); }

.ad-row-ico {
  width: 34px; height: 34px; border-radius: 9px;
  background: var(--blue-dim); border: 1px solid var(--blue-border);
  display: flex; align-items: center; justify-content: center;
  color: var(--blue2); flex-shrink: 0;
}
.ad-row-info { flex: 1; min-width: 0; }
.ad-row-num { font-size: .83rem; font-weight: 600; color: var(--w); display: block; margin-bottom: .15rem; }
.ad-row-meta { font-size: .68rem; color: var(--w40); }
.ad-row-right { text-align: right; flex-shrink: 0; }
.ad-row-amt {
  font-family: 'Playfair Display', serif;
  font-size: .9rem; font-weight: 600; color: var(--w);
  display: block; margin-bottom: .2rem;
}

/* Type breakdown */
.ad-type-row {
  display: flex; align-items: center; gap: .875rem;
  padding: .75rem 1.25rem; border-bottom: 1px solid var(--w08);
}
.ad-type-row:last-child { border-bottom: none; }
.ad-type-bar-wrap {
  flex: 1; height: 4px; background: var(--w08);
  border-radius: 99px; overflow: hidden;
}
.ad-type-bar {
  height: 100%; border-radius: 99px;
  background: linear-gradient(90deg, var(--blue), var(--red));
  transition: width .6s cubic-bezier(.22,1,.36,1);
}

.ad-empty { text-align: center; padding: 3rem 1rem; font-size: .82rem; color: var(--w40); }

/* Skeleton */
.ad-skeleton {
  background: linear-gradient(90deg, var(--i3) 25%, var(--i4) 50%, var(--i3) 75%);
  background-size: 200% 100%;
  animation: ad-shimmer 1.5s infinite;
  border-radius: 8px;
}
@keyframes ad-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

/* Fade-up */
.fu { opacity:0; transform:translateY(14px); transition:opacity .5s cubic-bezier(.22,1,.36,1),transform .5s cubic-bezier(.22,1,.36,1); }
.fu.in { opacity:1; transform:none; }
.d1{transition-delay:.07s} .d2{transition-delay:.14s} .d3{transition-delay:.21s} .d4{transition-delay:.28s}
`;