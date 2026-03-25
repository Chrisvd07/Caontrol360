'use client';

import { useState, useEffect, useMemo } from 'react';
import { AppShell } from '@/components/app-shell';
import {
  collection, onSnapshot, query, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  History, Search, Download, FileText,
  ArrowRight, SlidersHorizontal, Calendar,
  ChevronDown, X,
} from 'lucide-react';
import type { AuditLog } from '@/lib/types';
import { toast } from 'sonner';

const ACTION_COLORS: Record<string, string> = {
  SOLICITUD_CREADA: '#60a5fa',
  ESTADO_CAMBIADO:  '#a78bfa',
  EVIDENCIA_SUBIDA: '#22c55e',
  APROBACION:       '#93c5fd',
  RECHAZO:          '#ef4444',
};

const ACTION_LABELS: Record<string, string> = {
  SOLICITUD_CREADA: 'Solicitudes Creadas',
  ESTADO_CAMBIADO:  'Cambios de Estado',
  EVIDENCIA_SUBIDA: 'Evidencias Subidas',
  APROBACION:       'Aprobaciones',
  RECHAZO:          'Rechazos',
};

function ActionPill({ action }: { action: string }) {
  const key   = Object.keys(ACTION_COLORS).find(k => action.includes(k)) ?? '';
  const color = ACTION_COLORS[key] ?? '#8b8ea0';
  return (
    <span style={{
      fontSize: '.6rem', fontWeight: 700, letterSpacing: '.08em',
      textTransform: 'uppercase', color,
      background: `${color}18`, border: `1px solid ${color}30`,
      padding: '.15rem .5rem', borderRadius: 99, whiteSpace: 'nowrap',
    }}>{action.replace(/_/g, ' ')}</span>
  );
}

function DateRangeBar({ from, to, onFrom, onTo, onClear }: {
  from: string; to: string;
  onFrom: (v: string) => void;
  onTo:   (v: string) => void;
  onClear: () => void;
}) {
  const active = from || to;
  return (
    <div className="au-date-bar">
      <Calendar size={13} style={{ color: 'var(--blue2)', flexShrink: 0 }} />
      <span className="au-date-lbl">Desde</span>
      <input type="date" className="au-date-inp" value={from} onChange={e => onFrom(e.target.value)} />
      <span className="au-date-lbl">Hasta</span>
      <input type="date" className="au-date-inp" value={to}   onChange={e => onTo(e.target.value)} />
      {active && (
        <button className="au-date-clear" onClick={onClear}>
          <X size={11}/> Limpiar
        </button>
      )}
    </div>
  );
}

function AuditContent() {
  const [logs,    setLogs]    = useState<AuditLog[]>([]);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [search,     setSearch]     = useState('');
  const [action,     setAction]     = useState('all');
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const q = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => {
        const raw = d.data();
        return {
          ...raw, id: d.id,
          timestamp: raw.timestamp?.toDate?.()?.toISOString() ?? raw.timestamp ?? '',
        } as AuditLog;
      });
      setLogs(data);
      setLoading(false);
    }, err => { console.error('auditLogs snapshot:', err); setLoading(false); });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    let r = logs;
    if (search) {
      const s = search.toLowerCase();
      r = r.filter(l =>
        l.requestId?.toLowerCase().includes(s) ||
        l.userName?.toLowerCase().includes(s) ||
        l.action?.toLowerCase().includes(s) ||
        l.details?.toLowerCase().includes(s)
      );
    }
    if (action !== 'all') r = r.filter(l => l.action.includes(action));
    if (dateFrom) r = r.filter(l => new Date(l.timestamp) >= new Date(dateFrom));
    if (dateTo)   r = r.filter(l => new Date(l.timestamp) <= new Date(dateTo + 'T23:59:59'));
    return r;
  }, [logs, search, action, dateFrom, dateTo]);

  const stats = {
    total:       logs.length,
    created:     logs.filter(l => l.action.includes('SOLICITUD_CREADA')).length,
    transitions: logs.filter(l => l.action.includes('ESTADO_CAMBIADO')).length,
    evidences:   logs.filter(l => l.action.includes('EVIDENCIA_SUBIDA')).length,
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const XLSX: any = await new Promise((resolve, reject) => {
        if ((window as any).XLSX) { resolve((window as any).XLSX); return; }
        const script = document.createElement('script');
        script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
        script.onload  = () => resolve((window as any).XLSX);
        script.onerror = () => reject(new Error('No se pudo cargar SheetJS'));
        document.head.appendChild(script);
      });

      const now = new Date();
      const fmtDate = (iso: string) =>
        new Date(iso).toLocaleDateString('es-DO', { day:'2-digit', month:'2-digit', year:'numeric' });
      const fmtTime = (iso: string) =>
        new Date(iso).toLocaleTimeString('es-DO', { hour:'2-digit', minute:'2-digit' });

      const sheet1: any[][] = [
        [`GastoFlow — Audit Log · Exportado: ${fmtDate(now.toISOString())} ${fmtTime(now.toISOString())}`],
        [],
        ['#', 'Solicitud ID', 'Acción', 'Usuario', 'Estado Anterior', 'Estado Nuevo', 'Detalle', 'Fecha', 'Hora'],
        ...filtered.map((log, i) => [
          i + 1, log.requestId ?? '—', (log.action ?? '').replace(/_/g, ' '),
          log.userName ?? '—', log.previousStatus ?? '—', log.newStatus ?? '—',
          log.details ?? '—', fmtDate(log.timestamp), fmtTime(log.timestamp),
        ]),
        [], ['TOTAL', filtered.length],
      ];

      const actionCounts: Record<string, number> = {};
      filtered.forEach(l => {
        const k = Object.keys(ACTION_LABELS).find(k => l.action?.includes(k)) ?? 'OTROS';
        actionCounts[k] = (actionCounts[k] ?? 0) + 1;
      });
      const sheet2: any[][] = [
        ['Resumen por Tipo de Acción'], [],
        ['Acción', 'Total', '% del Total'],
        ...Object.entries(ACTION_LABELS).map(([k, label]) => {
          const cnt = actionCounts[k] ?? 0;
          return [label, cnt, filtered.length ? `${((cnt / filtered.length) * 100).toFixed(1)}%` : '0.0%'];
        }),
        [], ['TOTAL', filtered.length, '100.0%'],
      ];

      const wb = XLSX.utils.book_new();
      const makeSheet = (data: any[][], colWidths: number[]) => {
        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = colWidths.map(w => ({ wch: w }));
        return ws;
      };
      XLSX.utils.book_append_sheet(wb, makeSheet(sheet1, [5, 20, 24, 20, 18, 18, 44, 14, 10]), 'Registro Completo');
      XLSX.utils.book_append_sheet(wb, makeSheet(sheet2, [28, 12, 14]), 'Resumen por Acción');

      const filename = `audit-log-gastoflow-${now.toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, filename);
      toast.success(`✅ ${filtered.length} registros exportados a Excel`);
    } catch (err: any) {
      console.error('[Export]', err);
      toast.error(err?.message ?? 'Error al exportar');
    } finally {
      setExporting(false);
    }
  };

  const clearDates = () => { setDateFrom(''); setDateTo(''); };
  const activeFilters = (action !== 'all' ? 1 : 0) + (dateFrom || dateTo ? 1 : 0) + (search ? 1 : 0);

  return (
    <AppShell requiredRole="admin">
      <style>{STYLES}</style>
      <div className="au-page">
        <div className="au-topbar" />

        <div className={`fu ${mounted ? 'in' : ''}`}>
          <div className="au-eyebrow">Admin</div>
          <h1 className="au-title">Audit <em>Log</em></h1>
        </div>

        <div className={`au-sub-row fu ${mounted ? 'in' : ''}`}>
          <div className="au-sub">
            <div className="au-live-dot" />
            Tiempo real · {logs.length} registros totales
          </div>
          <button className="au-export-btn" onClick={handleExport} disabled={exporting || filtered.length === 0}>
            {exporting
              ? <><div className="au-export-spin" /> Exportando...</>
              : <><Download size={13}/> Exportar Excel ({filtered.length})</>}
          </button>
        </div>

        {/* Stats */}
        <div className={`au-stats fu d1 ${mounted ? 'in' : ''}`}>
          {[
            { val: stats.total,       lbl: 'Total',        color: 'var(--w)'   },
            { val: stats.created,     lbl: 'Creaciones',   color: '#60a5fa'    },
            { val: stats.transitions, lbl: 'Transiciones', color: '#a78bfa'    },
            { val: stats.evidences,   lbl: 'Evidencias',   color: '#22c55e'    },
          ].map((s, i) => (
            <div key={i} className="au-stat">
              {loading
                ? <><div className="au-skeleton" style={{ width:'50%', height:'1.45rem', margin:'0 auto .2rem' }}/><div className="au-skeleton" style={{ width:'70%', height:'.62rem', margin:'0 auto' }}/></>
                : <><span className="au-stat-val" style={{ color: s.color }}>{s.val}</span>
                    <span className="au-stat-lbl">{s.lbl}</span></>}
            </div>
          ))}
        </div>

        {/* Search + filters */}
        <div className={`fu d2 ${mounted ? 'in' : ''}`}>
          <div className="au-bar">
            <div className="au-search-wrap">
              <Search className="au-search-ico" />
              <input className="au-search" placeholder="Buscar por usuario, solicitud, acción..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <button
              className={`au-filter-btn ${showFilters || activeFilters > 0 ? 'active' : ''}`}
              onClick={() => setShowFilters(!showFilters)}>
              <SlidersHorizontal size={13}/>
              Filtros
              {activeFilters > 0 && <span className="au-badge">{activeFilters}</span>}
            </button>
          </div>

          {showFilters && (
            <div className="au-filter-panel">
              <div className="au-select-wrap">
                <label className="au-select-lbl">Tipo de acción</label>
                <select className="au-select" value={action} onChange={e => setAction(e.target.value)}>
                  <option value="all">Todas</option>
                  <option value="SOLICITUD_CREADA">Solicitudes creadas</option>
                  <option value="ESTADO_CAMBIADO">Cambios de estado</option>
                  <option value="EVIDENCIA_SUBIDA">Evidencias subidas</option>
                </select>
              </div>
              <div className="au-select-wrap">
                <label className="au-select-lbl">Rango de fechas</label>
                <DateRangeBar from={dateFrom} to={dateTo} onFrom={setDateFrom} onTo={setDateTo} onClear={clearDates} />
              </div>
            </div>
          )}

          <div className="au-count">
            {loading
              ? 'Cargando registros...'
              : <><b>{filtered.length}</b> registro{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}</>}
          </div>
        </div>

        {/* Log list */}
        <div className={`au-card fu d3 ${mounted ? 'in' : ''}`}>
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ padding:'.875rem 1.25rem', borderBottom:'1px solid var(--w08)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'.5rem' }}>
                  <div className="au-skeleton" style={{ width:'35%', height:'.72rem' }} />
                  <div className="au-skeleton" style={{ width:'18%', height:'.65rem' }} />
                </div>
                <div className="au-skeleton" style={{ width:'55%', height:'.68rem' }} />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="au-empty">No se encontraron registros con los filtros aplicados.</div>
          ) : (
            filtered.map(log => (
              <div key={log.id} className="au-log">
                <div className="au-log-top">
                  <div className="au-log-badges">
                    <ActionPill action={log.action} />
                    <span className="au-req-id">{log.requestId?.slice(0, 16)}…</span>
                  </div>
                  <div className="au-log-time">
                    {new Date(log.timestamp).toLocaleString('es-DO', {
                      day: 'numeric', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                </div>
                <div className="au-log-mid">
                  <span className="au-log-user">👤 {log.userName ?? '—'}</span>
                  {log.previousStatus && log.newStatus && (
                    <span className="au-log-transition">
                      <span style={{ textTransform:'capitalize', color:'var(--w40)' }}>{log.previousStatus}</span>
                      <ArrowRight size={10}/>
                      <span style={{ textTransform:'capitalize', color:'var(--blue2)' }}>{log.newStatus}</span>
                    </span>
                  )}
                </div>
                {log.details && <div className="au-log-detail">{log.details}</div>}
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function AdminAuditPage() {
  return <AuditContent />;
}

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Outfit:wght@300;400;500;600&display=swap');

.au-page {
  font-family: 'Outfit', sans-serif;
  padding: 1.5rem; max-width: 960px; margin: 0 auto; padding-bottom: 6rem;
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
@media(min-width:768px) { .au-page { padding: 2rem 2.5rem 3rem; } }

/* Top bar — blue→red */
.au-topbar {
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--blue) 30%, var(--red) 70%, transparent);
  opacity: .75; margin-bottom: 1.75rem; border-radius: 99px;
}

.au-eyebrow {
  font-size: .66rem; font-weight: 700; letter-spacing: .18em; text-transform: uppercase;
  color: var(--blue2); display: flex; align-items: center; gap: .5rem; margin-bottom: .4rem;
}
.au-eyebrow::before { content: ''; width: 18px; height: 1px; background: var(--blue2); opacity: .55; display: block; }

.au-title {
  font-family: 'Playfair Display', serif;
  font-size: 1.8rem; font-weight: 500; color: var(--w);
  letter-spacing: -.01em; line-height: 1.15; margin-bottom: .3rem;
}
.au-title em {
  font-style: italic;
  background: linear-gradient(125deg, var(--blue2) 20%, var(--blue3) 60%, var(--red2) 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}

.au-sub-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap;
}
.au-sub {
  font-size: .78rem; color: var(--w40); font-weight: 300;
  display: flex; align-items: center; gap: .4rem;
}
.au-live-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,.6);
  animation: au-blink 2s ease-in-out infinite;
}
@keyframes au-blink { 0%,100%{opacity:.5} 50%{opacity:1} }

/* Export button — blue style like login */
.au-export-btn {
  display: flex; align-items: center; gap: .45rem;
  background: var(--blue-dim); border: 1px solid var(--blue-border);
  color: var(--blue2); border-radius: 10px; padding: .55rem 1rem;
  font-family: 'Outfit', sans-serif; font-size: .78rem; font-weight: 600;
  cursor: pointer; transition: all .2s; white-space: nowrap;
}
.au-export-btn:hover:not(:disabled) { background: rgba(59,130,246,.18); transform: translateY(-1px); }
.au-export-btn:disabled { opacity: .45; cursor: not-allowed; }
.au-export-spin {
  width: 12px; height: 12px;
  border: 2px solid var(--blue2); border-top-color: transparent;
  border-radius: 50%; animation: au-spin .7s linear infinite;
}
@keyframes au-spin { to { transform: rotate(360deg); } }

/* Stats */
.au-stats {
  display: grid; grid-template-columns: repeat(2,1fr);
  gap: .65rem; margin-bottom: 1.25rem;
}
@media(min-width:640px) { .au-stats { grid-template-columns: repeat(4,1fr); } }
.au-stat {
  background: var(--i3); border: 1px solid var(--w08);
  border-radius: 12px; padding: .875rem 1rem; text-align: center;
  transition: border-color .2s, transform .2s cubic-bezier(.22,1,.36,1);
}
.au-stat:hover { border-color: var(--blue-border); transform: translateY(-2px); }
.au-stat-val {
  font-family: 'Playfair Display', serif;
  font-size: 1.45rem; font-weight: 600;
  display: block; line-height: 1; margin-bottom: .2rem;
}
.au-stat-lbl { font-size: .62rem; color: var(--w40); text-transform: uppercase; letter-spacing: .08em; }

/* Search bar */
.au-bar { display: flex; gap: .6rem; margin-bottom: .75rem; align-items: center; flex-wrap: wrap; }
.au-search-wrap { flex: 1; position: relative; min-width: 200px; }
.au-search-ico { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--w20); width: 13px; height: 13px; pointer-events: none; }
.au-search {
  width: 100%; background: var(--i3); border: 1px solid var(--w08);
  border-radius: 10px; padding: .68rem .875rem .68rem 2.2rem;
  font-size: .845rem; color: var(--w); font-family: 'Outfit', sans-serif;
  outline: none; transition: border-color .2s, box-shadow .2s; -webkit-appearance: none;
}
.au-search::placeholder { color: var(--w20); }
.au-search:focus { border-color: var(--blue-border); box-shadow: 0 0 0 3px var(--blue-dim); }

.au-filter-btn {
  background: var(--i3); border: 1px solid var(--w08); border-radius: 10px;
  padding: .68rem .9rem; color: var(--w40); cursor: pointer;
  display: flex; align-items: center; gap: .4rem;
  font-size: .78rem; font-family: 'Outfit', sans-serif; font-weight: 500;
  transition: border-color .2s, color .2s; white-space: nowrap; flex-shrink: 0;
}
.au-filter-btn.active { border-color: var(--blue-border); color: var(--blue2); }
.au-badge {
  background: var(--blue); color: #fff;
  font-size: .58rem; font-weight: 700; width: 16px; height: 16px;
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
}

/* Filter panel */
.au-filter-panel {
  background: var(--i3); border: 1px solid var(--w08);
  border-radius: 12px; padding: 1rem 1.25rem; margin-bottom: .75rem;
  display: grid; grid-template-columns: 1fr; gap: .875rem;
}
.au-select-wrap { display: flex; flex-direction: column; gap: .35rem; }
.au-select-lbl { font-size: .65rem; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--w40); }
.au-select {
  width: 100%; background: var(--i4); border: 1px solid var(--w08);
  border-radius: 8px; padding: .55rem .75rem; font-size: .8rem; color: var(--w);
  font-family: 'Outfit', sans-serif; outline: none; cursor: pointer;
  -webkit-appearance: none; transition: border-color .2s;
}
.au-select:focus { border-color: var(--blue-border); }
.au-select option { background: #0e1828; }

/* Date bar */
.au-date-bar {
  display: flex; align-items: center; gap: .6rem;
  background: var(--i4); border: 1px solid var(--w08);
  border-radius: 10px; padding: .55rem .875rem; flex-wrap: wrap;
}
.au-date-lbl { font-size: .7rem; color: var(--w40); font-weight: 500; white-space: nowrap; }
.au-date-inp {
  background: none; border: none; color: var(--w70);
  font-family: 'Outfit', sans-serif; font-size: .8rem; outline: none; cursor: pointer; -webkit-appearance: none;
}
.au-date-inp::-webkit-calendar-picker-indicator { filter: invert(.5); cursor: pointer; }
.au-date-clear {
  display: flex; align-items: center; gap: .25rem;
  background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.22);
  border-radius: 6px; color: #ef4444; font-size: .68rem; font-weight: 600;
  padding: .2rem .5rem; cursor: pointer; margin-left: auto;
}

.au-count { font-size: .72rem; color: var(--w40); margin-bottom: .875rem; }
.au-count b { color: var(--blue3); font-weight: 600; }

/* Card */
.au-card {
  background: var(--i3); border: 1px solid var(--w08);
  border-radius: 16px; overflow: hidden;
}

/* Log rows */
.au-log {
  padding: .875rem 1.25rem; border-bottom: 1px solid var(--w08);
  transition: background .15s;
}
.au-log:last-child { border-bottom: none; }
.au-log:hover { background: rgba(240,244,255,.02); }
.au-log-top {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: .75rem; margin-bottom: .45rem; flex-wrap: wrap;
}
.au-log-badges { display: flex; align-items: center; gap: .4rem; flex-wrap: wrap; }
.au-log-time { font-size: .65rem; color: var(--w40); white-space: nowrap; margin-top: .1rem; }
.au-log-mid { display: flex; align-items: center; gap: .75rem; font-size: .72rem; color: var(--w40); flex-wrap: wrap; }
.au-log-user { display: flex; align-items: center; gap: .3rem; }
.au-log-transition { display: flex; align-items: center; gap: .3rem; }
.au-log-detail { font-size: .72rem; color: var(--w20); margin-top: .3rem; line-height: 1.4; }
.au-req-id {
  font-size: .65rem; font-family: monospace; color: var(--w20);
  background: var(--w08); border-radius: 4px; padding: .05rem .35rem;
}
.au-empty { text-align: center; padding: 3.5rem 1rem; font-size: .82rem; color: var(--w40); }

/* Skeleton */
.au-skeleton {
  background: linear-gradient(90deg, var(--i3) 25%, var(--i4) 50%, var(--i3) 75%);
  background-size: 200% 100%; animation: au-shimmer 1.5s infinite; border-radius: 8px;
}
@keyframes au-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

/* Fade-up */
.fu { opacity:0; transform:translateY(14px); transition:opacity .5s cubic-bezier(.22,1,.36,1),transform .5s cubic-bezier(.22,1,.36,1); }
.fu.in { opacity:1; transform:none; }
.d1{transition-delay:.07s} .d2{transition-delay:.14s} .d3{transition-delay:.21s}
`;