'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { AppShell } from '@/components/app-shell';
import { ChatBot } from '@/components/chat-bot';
import {
  Plus, FileText, Clock, CheckCircle,
  ChevronRight, Fuel, TrendingUp, Wrench,
  UtensilsCrossed, CircleDot, HelpCircle, Sparkles
} from 'lucide-react';
import {
  getRequestsByUserFirestore,
  getUserPreferencesFirestore,
} from '@/lib/firestore-service';
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
      fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em',
      textTransform: 'uppercase', color: cfg.color,
      background: `${cfg.color}18`, border: `1px solid ${cfg.color}35`,
      padding: '0.2rem 0.55rem', borderRadius: '99px',
      display: 'inline-block', whiteSpace: 'nowrap',
    }}>{cfg.label}</span>
  );
}

function TecnicoHome() {
  const { user } = useAuth();
  const [showChat, setShowChat]       = useState(false);
  const [requests, setRequests]       = useState<Request[]>([]);
  const [mounted, setMounted]         = useState(false);
  const [loading, setLoading]         = useState(true);
  const [preferences, setPreferences] = useState<{ type: string; defaultAmount: number }[]>([]);
  const [stats, setStats]             = useState({ total: 0, pending: 0, approved: 0, thisMonth: 0 });

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (user) loadData(); }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [userRequests, prefs] = await Promise.all([
        getRequestsByUserFirestore(user.id),
        getUserPreferencesFirestore(user.id),
      ]);
      setRequests(userRequests);
      setPreferences(prefs.slice(0, 4));
      const now = new Date();
      const thisMonthReqs = userRequests.filter((r: Request) => {
        const d = new Date(r.createdAt);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      });
      setStats({
        total:     userRequests.length,
        pending:   userRequests.filter((r: Request) => ['enviada','aprobada','transferida'].includes(r.status)).length,
        approved:  userRequests.filter((r: Request) => ['validada','liquidada'].includes(r.status)).length,
        thisMonth: thisMonthReqs.reduce((s: number, r: Request) => s + r.totalAmount, 0),
      });
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestCreated = (request: Request) => {
    setRequests(prev => [request, ...prev]);
    loadData();
    setTimeout(() => setShowChat(false), 2000);
  };

  const recentRequests = [...requests]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <AppShell requiredRole="tecnico">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Outfit:wght@300;400;500;600&display=swap');

        .gf-page {
          font-family: 'Outfit', sans-serif;
          padding: 1.5rem;
          max-width: 900px;
          margin: 0 auto;
          padding-bottom: 6rem;
          --ink:  #04080f; --ink2: #060c18; --ink3: #0a1120; --ink4: #0e1828; --ink5: #121f32;
          --blue: #3b82f6; --blue2: #60a5fa; --blue3: #93c5fd;
          --red:  #ef4444; --red2: #f87171;
          --w: #f0f4ff; --w70: rgba(240,244,255,.70); --w40: rgba(240,244,255,.40);
          --w20: rgba(240,244,255,.20); --w08: rgba(240,244,255,.08);
          --blue-dim: rgba(59,130,246,.10); --blue-glow: rgba(59,130,246,.22); --blue-border: rgba(59,130,246,.35);
          background: var(--ink); min-height: 100vh;
        }
        @media(min-width:768px) { .gf-page { padding: 2rem 2.5rem 2.5rem; } }
        @media(min-width:640px) { .gf-stats { grid-template-columns: repeat(4,1fr) !important; } }

        .gf-topbar { height:2px; background:linear-gradient(90deg,transparent,var(--blue),var(--red),transparent); opacity:.75; margin-bottom:1.75rem; border-radius:99px; }

        .gf-welcome { margin-bottom:1.75rem; }
        .gf-welcome-eyebrow { font-size:.67rem; font-weight:600; letter-spacing:.18em; text-transform:uppercase; color:var(--blue2); margin-bottom:.4rem; display:flex; align-items:center; gap:.5rem; }
        .gf-welcome-eyebrow::before { content:''; display:block; width:18px; height:1px; background:var(--blue2); opacity:.55; }
        .gf-welcome h1 { font-family:'Playfair Display',serif; font-size:1.9rem; font-weight:500; color:var(--w); letter-spacing:-.01em; line-height:1.2; margin-bottom:.3rem; }
        .gf-welcome h1 em { font-style:italic; background:linear-gradient(125deg,var(--blue2) 30%,var(--blue3) 60%,var(--red2) 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
        .gf-welcome p { font-size:.82rem; color:var(--w40); font-weight:300; }

        .gf-stats { display:grid; grid-template-columns:repeat(2,1fr); gap:.75rem; margin-bottom:1.75rem; }
        .gf-stat { background:var(--ink3); border:1px solid var(--w08); border-radius:14px; padding:1rem 1.1rem; position:relative; overflow:hidden; transition:border-color .2s,transform .2s cubic-bezier(.22,1,.36,1); }
        .gf-stat:hover { border-color:var(--blue-border); transform:translateY(-2px); }
        .gf-stat::before { content:''; position:absolute; top:0; left:0; right:0; height:1px; background:linear-gradient(90deg,transparent,var(--blue),transparent); opacity:0; transition:opacity .2s; }
        .gf-stat:hover::before { opacity:.5; }
        .gf-stat-icon { width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; margin-bottom:.75rem; }
        .gf-stat-val { font-family:'Playfair Display',serif; font-size:1.6rem; font-weight:600; color:var(--w); display:block; line-height:1; margin-bottom:.25rem; }
        .gf-stat-lbl { font-size:.65rem; color:var(--w40); text-transform:uppercase; letter-spacing:.08em; font-weight:500; }

        .gf-skeleton { background:linear-gradient(90deg,var(--ink3) 25%,var(--ink4) 50%,var(--ink3) 75%); background-size:200% 100%; animation:gf-shimmer 1.5s infinite; border-radius:8px; }
        @keyframes gf-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

        .gf-cta {
          width:100%; background:linear-gradient(135deg,var(--blue) 0%,#1d4ed8 35%,#b91c1c 100%);
          color:#ffffff; border:none; border-radius:14px;
          padding:1rem 1.5rem; font-family:'Outfit',sans-serif; font-size:.95rem; font-weight:600;
          letter-spacing:.04em; cursor:pointer; display:flex; align-items:center;
          justify-content:center; gap:.6rem; position:relative; overflow:hidden;
          margin-bottom:1.75rem; transition:transform .2s cubic-bezier(.22,1,.36,1),box-shadow .2s,filter .2s;
          box-shadow:0 4px 28px rgba(59,130,246,.30),0 1px 0 rgba(255,255,255,.1) inset;
        }
        .gf-cta::after { content:''; position:absolute; inset:0; background:linear-gradient(180deg,rgba(255,255,255,.08) 0%,transparent 100%); }
        .gf-cta:hover { transform:translateY(-2px); box-shadow:0 8px 40px rgba(59,130,246,.40); filter:brightness(1.06); }

        .gf-card { background:var(--ink3); border:1px solid var(--w08); border-radius:16px; overflow:hidden; margin-bottom:1rem; }
        .gf-card-hd { padding:1rem 1.25rem; border-bottom:1px solid var(--w08); display:flex; align-items:center; justify-content:space-between; }
        .gf-card-title { font-family:'Playfair Display',serif; font-size:1rem; font-weight:500; color:var(--w); }
        .gf-card-sub { font-size:.72rem; color:var(--w40); font-weight:300; margin-top:.1rem; }
        .gf-card-body { padding:1rem 1.25rem; }

        .gf-viewall { font-size:.72rem; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:var(--blue2); background:none; border:none; cursor:pointer; display:flex; align-items:center; gap:.3rem; text-decoration:none; transition:opacity .2s; }
        .gf-viewall:hover { opacity:.75; }

        .gf-req-row { display:flex; align-items:center; gap:.875rem; padding:.8rem 0; border-bottom:1px solid var(--w08); text-decoration:none; transition:opacity .15s; }
        .gf-req-row:last-child { border-bottom:none; padding-bottom:0; }
        .gf-req-row:first-child { padding-top:0; }
        .gf-req-row:hover { opacity:.8; }
        .gf-req-ico { width:36px; height:36px; border-radius:9px; background:var(--blue-dim); border:1px solid var(--blue-border); display:flex; align-items:center; justify-content:center; color:var(--blue2); flex-shrink:0; }
        .gf-req-info { flex:1; min-width:0; }
        .gf-req-num { font-size:.83rem; font-weight:600; color:var(--w); display:block; }
        .gf-req-meta { font-size:.68rem; color:var(--w40); margin-top:.1rem; text-transform:capitalize; }
        .gf-req-right { text-align:right; }
        .gf-req-amount { font-size:.875rem; font-weight:600; color:var(--w); display:block; margin-bottom:.3rem; }
        .gf-req-chev { width:14px; height:14px; color:var(--w20); margin-top:.3rem; display:block; margin-left:auto; }

        .gf-empty { text-align:center; padding:2.5rem 1rem; }
        .gf-empty-ico { width:44px; height:44px; border-radius:12px; background:var(--blue-dim); border:1px solid var(--blue-border); display:flex; align-items:center; justify-content:center; margin:0 auto 1rem; color:var(--blue2); }
        .gf-empty p { font-size:.82rem; color:var(--w40); font-weight:300; line-height:1.6; }

        .gf-prefs { display:grid; grid-template-columns:1fr 1fr; gap:.6rem; }
        .gf-pref-btn { background:var(--ink4); border:1px solid var(--w08); border-radius:12px; padding:.875rem 1rem; cursor:pointer; text-align:left; transition:border-color .2s,background .2s,transform .2s cubic-bezier(.22,1,.36,1); display:flex; flex-direction:column; gap:.2rem; font-family:'Outfit',sans-serif; }
        .gf-pref-btn:hover { border-color:var(--blue-border); background:var(--ink5); transform:translateY(-1px); }
        .gf-pref-lbl { font-size:.67rem; color:var(--w40); text-transform:capitalize; font-weight:400; }
        .gf-pref-amt { font-size:.95rem; font-weight:600; color:var(--blue3); font-family:'Playfair Display',serif; }

        .fu{opacity:0;transform:translateY(14px);transition:opacity .5s cubic-bezier(.22,1,.36,1),transform .5s cubic-bezier(.22,1,.36,1)}
        .fu.in{opacity:1;transform:none}
        .d1{transition-delay:.05s}.d2{transition-delay:.12s}.d3{transition-delay:.19s}.d4{transition-delay:.26s}
      `}</style>

      <div className="gf-page">
        <div className="gf-topbar" />

        <div className={`gf-welcome fu ${mounted ? 'in' : ''}`}>
          <div className="gf-welcome-eyebrow">Panel Técnico</div>
          <h1>Hola, <em>{user?.name?.split(' ')[0]}</em></h1>
          <p>Crea y gestiona tus solicitudes de gastos</p>
        </div>

        {/* Stats */}
        <div className={`gf-stats fu d1 ${mounted ? 'in' : ''}`}>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="gf-stat">
                <div className="gf-skeleton" style={{ width:32, height:32, marginBottom:'.75rem' }} />
                <div className="gf-skeleton" style={{ width:'60%', height:'1.6rem', marginBottom:'.25rem' }} />
                <div className="gf-skeleton" style={{ width:'80%', height:'.65rem' }} />
              </div>
            ))
          ) : (
            <>
              <div className="gf-stat">
                <div className="gf-stat-icon" style={{ background:'var(--blue-dim)', color:'var(--blue2)' }}><FileText size={16} /></div>
                <span className="gf-stat-val">{stats.total}</span>
                <span className="gf-stat-lbl">Total</span>
              </div>
              <div className="gf-stat">
                <div className="gf-stat-icon" style={{ background:'rgba(251,191,36,.12)', color:'#fbbf24' }}><Clock size={16} /></div>
                <span className="gf-stat-val">{stats.pending}</span>
                <span className="gf-stat-lbl">Pendientes</span>
              </div>
              <div className="gf-stat">
                <div className="gf-stat-icon" style={{ background:'rgba(34,197,94,.12)', color:'#22c55e' }}><CheckCircle size={16} /></div>
                <span className="gf-stat-val">{stats.approved}</span>
                <span className="gf-stat-lbl">Aprobadas</span>
              </div>
              <div className="gf-stat">
                <div className="gf-stat-icon" style={{ background:'rgba(239,68,68,.12)', color:'var(--red2)' }}><TrendingUp size={16} /></div>
                <span className="gf-stat-val" style={{ fontSize:'1.1rem' }}>{formatCurrency(stats.thisMonth)}</span>
                <span className="gf-stat-lbl">Este mes</span>
              </div>
            </>
          )}
        </div>

        <button className={`gf-cta fu d2 ${mounted ? 'in' : ''}`} onClick={() => setShowChat(true)}>
          <Plus size={20} />
          Nueva Solicitud
          <Sparkles size={15} style={{ opacity:.7 }} />
        </button>

        {/* Recent requests */}
        <div className={`gf-card fu d3 ${mounted ? 'in' : ''}`}>
          <div className="gf-card-hd">
            <div><div className="gf-card-title">Solicitudes Recientes</div></div>
            <Link href="/tecnico/solicitudes" className="gf-viewall">
              Ver todas <ChevronRight size={12} />
            </Link>
          </div>
          <div className="gf-card-body">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ display:'flex', gap:'.875rem', padding:'.8rem 0', borderBottom:'1px solid rgba(240,244,255,.08)' }}>
                  <div className="gf-skeleton" style={{ width:36, height:36, borderRadius:9, flexShrink:0 }} />
                  <div style={{ flex:1 }}>
                    <div className="gf-skeleton" style={{ width:'45%', height:'.83rem', marginBottom:'.35rem' }} />
                    <div className="gf-skeleton" style={{ width:'65%', height:'.68rem' }} />
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div className="gf-skeleton" style={{ width:70, height:'.875rem', marginBottom:'.4rem' }} />
                    <div className="gf-skeleton" style={{ width:56, height:'.65rem', borderRadius:99 }} />
                  </div>
                </div>
              ))
            ) : recentRequests.length === 0 ? (
              <div className="gf-empty">
                <div className="gf-empty-ico"><FileText size={20} /></div>
                <p>No tienes solicitudes aún.<br />Crea tu primera con el botón de arriba.</p>
              </div>
            ) : (
              recentRequests.map(req => (
                <Link key={req.id} href={`/tecnico/solicitudes/${req.id}`} className="gf-req-row">
                  <div className="gf-req-ico">{TYPE_ICONS[req.type] ?? <HelpCircle size={14} />}</div>
                  <div className="gf-req-info">
                    <span className="gf-req-num">{req.numero}</span>
                    <span className="gf-req-meta">
                      {req.type} · {new Date(req.createdAt).toLocaleDateString('es-DO', { day:'numeric', month:'short' })}
                    </span>
                  </div>
                  <div className="gf-req-right">
                    <span className="gf-req-amount">{formatCurrency(req.totalAmount)}</span>
                    <StatusPill status={req.status} />
                    <ChevronRight size={13} className="gf-req-chev" />
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Quick preferences */}
        {!loading && preferences.length > 0 && (
          <div className={`gf-card fu d4 ${mounted ? 'in' : ''}`}>
            <div className="gf-card-hd">
              <div>
                <div className="gf-card-title">Montos Frecuentes</div>
                <div className="gf-card-sub">Tus solicitudes más comunes</div>
              </div>
            </div>
            <div className="gf-card-body">
              <div className="gf-prefs">
                {preferences.map((pref, i) => (
                  <button key={i} className="gf-pref-btn" onClick={() => setShowChat(true)}>
                    <span className="gf-pref-lbl">{pref.type}</span>
                    <span className="gf-pref-amt">{formatCurrency(pref.defaultAmount)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {showChat && (
        <ChatBot onClose={() => setShowChat(false)} onRequestCreated={handleRequestCreated} />
      )}
    </AppShell>
  );
}

export default function TecnicoPage() {
  return <TecnicoHome />;
}