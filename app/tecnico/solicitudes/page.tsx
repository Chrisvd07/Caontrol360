'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { AppShell } from '@/components/app-shell';
import {
  Search, Filter, Fuel, Wrench,
  UtensilsCrossed, CircleDot, HelpCircle, ChevronRight, SlidersHorizontal
} from 'lucide-react';
import { getRequestsByUserFirestore } from '@/lib/firestore-service';
import { formatCurrency } from '@/lib/ocr';
import type { Request } from '@/lib/types';
import Link from 'next/link';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  combustible: <Fuel className="w-4 h-4" />,
  materiales:  <Wrench className="w-4 h-4" />,
  viatico:     <UtensilsCrossed className="w-4 h-4" />,
  gomera:      <CircleDot className="w-4 h-4" />,
  otros:       <HelpCircle className="w-4 h-4" />,
};

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

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_MAP[status] ?? { label: status, color: '#8b8ea0' };
  return (
    <span style={{
      fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.08em',
      textTransform: 'uppercase' as const, color: cfg.color,
      background: `${cfg.color}18`, border: `1px solid ${cfg.color}35`,
      padding: '0.18rem 0.5rem', borderRadius: '99px',
      display: 'inline-block', whiteSpace: 'nowrap' as const,
    }}>{cfg.label}</span>
  );
}

const FILTER_STATUSES = ['enviada', 'aprobada', 'observada', 'rechazada'] as const;
const ALL_TYPES       = ['combustible', 'materiales', 'viatico', 'gomera', 'otros'];

function SolicitudesContent() {
  const { user } = useAuth();
  const [requests, setRequests]       = useState<Request[]>([]);
  const [filtered, setFiltered]       = useState<Request[]>([]);
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatus]     = useState('all');
  const [typeFilter, setType]         = useState('all');
  const [mounted, setMounted]         = useState(false);
  const [loading, setLoading]         = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (user) {
      (async () => {
        setLoading(true);
        try {
          const r = await getRequestsByUserFirestore(user.id);
          const sorted = r.sort((a: Request, b: Request) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          setRequests(sorted);
          setFiltered(sorted);
        } catch (error) {
          console.error('Error fetching requests:', error);
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [user]);

  useEffect(() => {
    let r = requests;
    if (search)                r = r.filter(x => x.numero.toLowerCase().includes(search.toLowerCase()) || x.type.toLowerCase().includes(search.toLowerCase()));
    if (statusFilter !== 'all') r = r.filter(x => x.status === statusFilter);
    if (typeFilter   !== 'all') r = r.filter(x => x.type   === typeFilter);
    setFiltered(r);
  }, [search, statusFilter, typeFilter, requests]);

  const activeFilters  = (statusFilter !== 'all' ? 1 : 0) + (typeFilter !== 'all' ? 1 : 0);
  const countByStatus  = (status: string) => requests.filter(r => r.status === status).length;

  return (
    <AppShell requiredRole="tecnico">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Outfit:wght@300;400;500;600&display=swap');

        .sl-page {
          font-family: 'Outfit', sans-serif; padding: 1.5rem;
          max-width: 900px; margin: 0 auto; padding-bottom: 6rem;
          --ink: #04080f; --ink2: #060c18; --ink3: #0a1120; --ink4: #0e1828; --ink5: #121f32;
          --blue: #3b82f6; --blue2: #60a5fa; --blue3: #93c5fd;
          --red: #ef4444; --red2: #f87171;
          --w: #f0f4ff; --w70: rgba(240,244,255,.70); --w40: rgba(240,244,255,.40);
          --w20: rgba(240,244,255,.20); --w08: rgba(240,244,255,.08);
          --blue-dim: rgba(59,130,246,.10); --blue-glow: rgba(59,130,246,.22); --blue-border: rgba(59,130,246,.35);
          background: var(--ink); min-height: 100vh;
        }
        @media(min-width:768px) { .sl-page { padding: 2rem 2.5rem 2.5rem; } }

        .sl-topbar { height:2px; background:linear-gradient(90deg,transparent,var(--blue),var(--red),transparent); opacity:.75; margin-bottom:1.75rem; border-radius:99px; }
        .sl-hd { margin-bottom:1.5rem; }
        .sl-eyebrow { font-size:.67rem; font-weight:600; letter-spacing:.18em; text-transform:uppercase; color:var(--blue2); margin-bottom:.4rem; display:flex; align-items:center; gap:.5rem; }
        .sl-eyebrow::before { content:''; display:block; width:18px; height:1px; background:var(--blue2); opacity:.55; }
        .sl-hd h1 { font-family:'Playfair Display',serif; font-size:1.75rem; font-weight:500; color:var(--w); letter-spacing:-.01em; margin-bottom:.25rem; }
        .sl-hd p { font-size:.8rem; color:var(--w40); font-weight:300; }

        .sl-bar { display:flex; gap:.6rem; margin-bottom:1rem; align-items:center; }
        .sl-search-wrap { flex:1; position:relative; }
        .sl-search-ico { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--w20); width:14px; height:14px; pointer-events:none; }
        .sl-search { width:100%; background:var(--ink3); border:1px solid var(--w08); border-radius:10px; padding:.72rem .875rem .72rem 2.4rem; font-size:.855rem; color:var(--w); font-family:'Outfit',sans-serif; outline:none; transition:border-color .2s,box-shadow .2s; -webkit-appearance:none; }
        .sl-search::placeholder { color:var(--w20); }
        .sl-search:focus { border-color:var(--blue-border); box-shadow:0 0 0 3px var(--blue-dim); }

        .sl-filter-btn { background:var(--ink3); border:1px solid var(--w08); border-radius:10px; padding:.72rem .9rem; color:var(--w40); cursor:pointer; display:flex; align-items:center; gap:.4rem; font-size:.78rem; font-family:'Outfit',sans-serif; font-weight:500; transition:border-color .2s,color .2s; white-space:nowrap; flex-shrink:0; }
        .sl-filter-btn.active,.sl-filter-btn:hover { border-color:var(--blue-border); color:var(--blue2); }
        .sl-filter-badge { background:var(--blue); color:#fff; font-size:.58rem; font-weight:700; width:16px; height:16px; border-radius:50%; display:flex; align-items:center; justify-content:center; }

        .sl-filter-panel { background:var(--ink3); border:1px solid var(--w08); border-radius:12px; padding:1rem 1.25rem; margin-bottom:1rem; display:grid; grid-template-columns:1fr 1fr; gap:.875rem; }
        .sl-filter-group label { font-size:.65rem; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--w40); display:block; margin-bottom:.4rem; }
        .sl-select { width:100%; background:var(--ink4); border:1px solid var(--w08); border-radius:8px; padding:.55rem .75rem; font-size:.8rem; color:var(--w); font-family:'Outfit',sans-serif; outline:none; cursor:pointer; -webkit-appearance:none; transition:border-color .2s; }
        .sl-select:focus { border-color:var(--blue-border); }

        .sl-chips { display:flex; gap:.4rem; flex-wrap:wrap; margin-bottom:1rem; }
        .sl-chip { font-size:.68rem; font-weight:500; letter-spacing:.06em; padding:.3rem .65rem; border-radius:99px; cursor:pointer; border:1px solid var(--w08); background:var(--ink3); color:var(--w40); transition:all .18s; font-family:'Outfit',sans-serif; white-space:nowrap; display:flex; align-items:center; gap:.35rem; }
        .sl-chip:hover,.sl-chip.on { border-color:var(--blue-border); color:var(--blue2); }
        .sl-chip.on { background:var(--blue-dim); }
        .sl-chip-badge { font-size:.58rem; font-weight:700; min-width:16px; height:16px; border-radius:99px; display:flex; align-items:center; justify-content:center; padding:0 4px; line-height:1; transition:all .18s; }

        .sl-count { font-size:.72rem; color:var(--w40); margin-bottom:.875rem; }
        .sl-count b { color:var(--blue3); font-weight:600; }

        .sl-card { background:var(--ink3); border:1px solid var(--w08); border-radius:14px; overflow:hidden; margin-bottom:.6rem; transition:border-color .2s,transform .18s cubic-bezier(.22,1,.36,1); display:block; text-decoration:none; }
        .sl-card:hover { border-color:var(--blue-border); transform:translateX(2px); }
        .sl-card-inner { display:flex; align-items:center; gap:.875rem; padding:.95rem 1.1rem; }
        .sl-ico { width:40px; height:40px; border-radius:10px; flex-shrink:0; background:var(--blue-dim); border:1px solid var(--blue-border); display:flex; align-items:center; justify-content:center; color:var(--blue2); }
        .sl-info { flex:1; min-width:0; }
        .sl-num { font-size:.875rem; font-weight:600; color:var(--w); display:block; }
        .sl-meta { font-size:.7rem; color:var(--w40); margin-top:.15rem; text-transform:capitalize; }
        .sl-right { text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:.3rem; }
        .sl-amount { font-size:.9rem; font-weight:600; color:var(--w); font-family:'Playfair Display',serif; }
        .sl-chev { width:14px; height:14px; color:var(--w20); margin-top:.1rem; transition:color .2s; }
        .sl-card:hover .sl-chev { color:var(--blue2); }

        .sl-empty { background:var(--ink3); border:1px solid var(--w08); border-radius:14px; padding:3rem 1.5rem; text-align:center; }
        .sl-empty-ico { width:48px; height:48px; border-radius:12px; background:var(--blue-dim); border:1px solid var(--blue-border); display:flex; align-items:center; justify-content:center; margin:0 auto 1rem; color:var(--blue2); }
        .sl-empty p { font-size:.82rem; color:var(--w40); font-weight:300; line-height:1.6; }

        .sl-skeleton { background:linear-gradient(90deg,var(--ink3) 25%,var(--ink4) 50%,var(--ink3) 75%); background-size:200% 100%; animation:sl-shimmer 1.5s infinite; border-radius:8px; }
        @keyframes sl-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

        .fu{opacity:0;transform:translateY(12px);transition:opacity .5s cubic-bezier(.22,1,.36,1),transform .5s cubic-bezier(.22,1,.36,1)}
        .fu.in{opacity:1;transform:none}
        .d1{transition-delay:.06s}.d2{transition-delay:.12s}
      `}</style>

      <div className="sl-page">
        <div className="sl-topbar" />

        <div className={`sl-hd fu ${mounted ? 'in' : ''}`}>
          <div className="sl-eyebrow">Historial</div>
          <h1>Mis Solicitudes</h1>
          <p>Todas tus solicitudes de gastos</p>
        </div>

        <div className={`fu d1 ${mounted ? 'in' : ''}`}>
          <div className="sl-bar">
            <div className="sl-search-wrap">
              <Search className="sl-search-ico" />
              <input
                className="sl-search"
                placeholder="Buscar por número o tipo..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button
              className={`sl-filter-btn ${showFilters || activeFilters > 0 ? 'active' : ''}`}
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal size={14} />
              Filtros
              {activeFilters > 0 && <span className="sl-filter-badge">{activeFilters}</span>}
            </button>
          </div>

          {showFilters && (
            <div className="sl-filter-panel">
              <div className="sl-filter-group">
                <label>Estado</label>
                <select className="sl-select" value={statusFilter} onChange={e => setStatus(e.target.value)}>
                  <option value="all">Todos</option>
                  {FILTER_STATUSES.map(s => (
                    <option key={s} value={s}>{STATUS_MAP[s]?.label ?? s}</option>
                  ))}
                </select>
              </div>
              <div className="sl-filter-group">
                <label>Tipo</label>
                <select className="sl-select" value={typeFilter} onChange={e => setType(e.target.value)}>
                  <option value="all">Todos</option>
                  {ALL_TYPES.map(t => (
                    <option key={t} value={t} style={{ textTransform:'capitalize' }}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Chips con conteo */}
          <div className="sl-chips">
            <button className={`sl-chip ${statusFilter === 'all' ? 'on' : ''}`} onClick={() => setStatus('all')}>
              Todas
              {!loading && requests.length > 0 && (
                <span className="sl-chip-badge" style={{
                  background: statusFilter === 'all' ? 'rgba(59,130,246,.25)' : 'rgba(240,244,255,.1)',
                  color: statusFilter === 'all' ? '#93c5fd' : 'rgba(240,244,255,.35)',
                }}>
                  {requests.length}
                </span>
              )}
            </button>

            {FILTER_STATUSES.map(s => {
              const count = countByStatus(s);
              const cfg   = STATUS_MAP[s];
              const isOn  = statusFilter === s;
              return (
                <button key={s} className={`sl-chip ${isOn ? 'on' : ''}`} onClick={() => setStatus(s)}>
                  {cfg?.label ?? s}
                  {!loading && count > 0 && (
                    <span className="sl-chip-badge" style={{
                      background: isOn ? `${cfg?.color}30` : 'rgba(240,244,255,.08)',
                      color: isOn ? cfg?.color : 'rgba(240,244,255,.35)',
                      border: isOn ? `1px solid ${cfg?.color}40` : '1px solid transparent',
                    }}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className={`sl-count fu d2 ${mounted ? 'in' : ''}`}>
          {loading
            ? 'Cargando solicitudes...'
            : <><b>{filtered.length}</b> solicitud{filtered.length !== 1 ? 'es' : ''} encontrada{filtered.length !== 1 ? 's' : ''}</>
          }
        </div>

        <div>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ background:'#0a1120', border:'1px solid rgba(240,244,255,.08)', borderRadius:14, padding:'.95rem 1.1rem', marginBottom:'.6rem', display:'flex', alignItems:'center', gap:'.875rem' }}>
                <div className="sl-skeleton" style={{ width:40, height:40, borderRadius:10, flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <div className="sl-skeleton" style={{ width:'40%', height:'.875rem', marginBottom:'.35rem' }} />
                  <div className="sl-skeleton" style={{ width:'60%', height:'.7rem' }} />
                </div>
                <div style={{ textAlign:'right' }}>
                  <div className="sl-skeleton" style={{ width:72, height:'.9rem', marginBottom:'.4rem' }} />
                  <div className="sl-skeleton" style={{ width:56, height:'.62rem', borderRadius:99 }} />
                </div>
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="sl-empty">
              <div className="sl-empty-ico"><Filter size={20} /></div>
              <p>No se encontraron solicitudes<br />con los filtros aplicados.</p>
            </div>
          ) : (
            filtered.map(req => (
              <Link key={req.id} href={`/tecnico/solicitudes/${req.id}`} className="sl-card">
                <div className="sl-card-inner">
                  <div className="sl-ico">{TYPE_ICONS[req.type] ?? <HelpCircle size={16} />}</div>
                  <div className="sl-info">
                    <span className="sl-num">{req.numero}</span>
                    <span className="sl-meta">
                      {req.type} · {new Date(req.createdAt).toLocaleDateString('es-DO', { day:'numeric', month:'short', year:'numeric' })}
                    </span>
                  </div>
                  <div className="sl-right">
                    <span className="sl-amount">{formatCurrency(req.totalAmount)}</span>
                    <StatusPill status={req.status} />
                    <ChevronRight className="sl-chev" />
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function SolicitudesPage() {
  return <SolicitudesContent />;
}