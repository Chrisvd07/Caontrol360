'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { AppShell } from '@/components/app-shell';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  TrendingUp, TrendingDown, DollarSign, CheckCircle,
  AlertTriangle, FileText, Download, Calendar,
  BarChart2, PieChart, Activity, Users, Zap,
  ChevronRight, ArrowUpRight, ArrowDownRight, X,
} from 'lucide-react';
import { formatCurrency } from '@/lib/ocr';
import type { Request } from '@/lib/types';
import { toast } from 'sonner';

type Period = '7d' | '30d' | '90d' | 'all';

const TYPE_LABELS: Record<string, string> = {
  combustible: 'Combustible', materiales: 'Materiales',
  viatico: 'Viático', gomera: 'Gomera', otros: 'Otros',
};

/* Type colors now use the login palette */
const TYPE_COLORS: Record<string, string> = {
  combustible: '#60a5fa',  // blue2
  materiales:  '#a78bfa',  // purple accent
  viatico:     '#34d399',  // green
  gomera:      '#93c5fd',  // blue3
  otros:       '#f87171',  // red2
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  enviada:            { label: 'Enviada',     color: '#8b8ea0' },
  en_revision:        { label: 'En Revisión', color: '#60a5fa' },
  aprobada:           { label: 'Aprobada',    color: '#60a5fa' },
  rechazada:          { label: 'Rechazada',   color: '#ef4444' },
  comprobante_subido: { label: 'Comprobante', color: '#a78bfa' },
  factura_subida:     { label: 'Factura',     color: '#8b5cf6' },
  observada:          { label: 'Observada',   color: '#f97316' },
  validada:           { label: 'Validada',    color: '#22c55e' },
  liquidada:          { label: 'Liquidada',   color: '#10b981' },
};

/* ── Bar Chart ─────────────────────────────────────────────────────────────── */
function BarChart({ data, color = '#60a5fa', height = 80 }: {
  data: { label: string; value: number }[];
  color?: string; height?: number;
}) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <svg viewBox={`0 0 ${data.length * 40} ${height + 20}`} style={{ width: '100%', height: height + 20, display: 'block' }}>
      {data.map((d, i) => {
        const barH = (d.value / max) * height;
        const x = i * 40 + 4; const y = height - barH;
        return (
          <g key={i}>
            <rect x={x} y={0} width={32} height={height} rx={4} fill="rgba(240,244,255,.04)" />
            <rect x={x} y={y} width={32} height={barH} rx={4} fill={color} opacity={.85}>
              <animate attributeName="height" from="0" to={barH} dur=".6s" fill="freeze" calcMode="spline" keySplines="0.22 1 0.36 1" keyTimes="0;1" />
              <animate attributeName="y" from={height} to={y} dur=".6s" fill="freeze" calcMode="spline" keySplines="0.22 1 0.36 1" keyTimes="0;1" />
            </rect>
            <text x={x + 16} y={height + 14} textAnchor="middle" fontSize="8" fill="rgba(240,244,255,.3)">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── Donut Chart ───────────────────────────────────────────────────────────── */
function DonutChart({ slices, size = 120 }: {
  slices: { label: string; value: number; color: string }[]; size?: number;
}) {
  const total = slices.reduce((s, d) => s + d.value, 0) || 1;
  const r = 44; const cx = 60; const cy = 60;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const arcs = slices.map(s => {
    const dash = (s.value / total) * circ;
    const gap  = circ - dash;
    const arc  = { offset, dash, gap, ...s };
    offset += dash;
    return arc;
  });
  return (
    <svg viewBox="0 0 120 120" style={{ width: size, height: size }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(240,244,255,.05)" strokeWidth={14} />
      {arcs.map((a, i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="none"
          stroke={a.color} strokeWidth={13}
          strokeDasharray={`${a.dash} ${a.gap}`}
          strokeDashoffset={-a.offset}
          strokeLinecap="round"
          style={{ transform: 'rotate(-90deg)', transformOrigin: '60px 60px', transition: 'stroke-dasharray .6s cubic-bezier(.22,1,.36,1)' }}
        />
      ))}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#f0f4ff"
        style={{ fontFamily: "'Playfair Display', serif" }}>{total}</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="7" fill="rgba(240,244,255,.35)">total</text>
    </svg>
  );
}

/* ── Sparkline ─────────────────────────────────────────────────────────────── */
function Sparkline({ values, color = '#60a5fa', w = 80, h = 28 }: {
  values: number[]; color?: string; w?: number; h?: number;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => `${i * step},${h - (v / max) * (h - 4)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h, overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".8" />
    </svg>
  );
}

/* ── KPI Card ──────────────────────────────────────────────────────────────── */
function KpiCard({ label, value, sub, trend, trendVal, color, icon, sparkData }: {
  label: string; value: string | number; sub?: string;
  trend?: 'up' | 'down' | 'neutral'; trendVal?: string;
  color: string; icon: React.ReactNode; sparkData?: number[];
}) {
  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : null;
  const trendColor = trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : '#8b8ea0';
  return (
    <div className="rp-kpi">
      <div className="rp-kpi-top">
        <div className="rp-kpi-ico" style={{ background: `${color}14`, color }}>{icon}</div>
        {sparkData && <Sparkline values={sparkData} color={color} />}
      </div>
      <div className="rp-kpi-val">{value}</div>
      <div className="rp-kpi-lbl">{label}</div>
      {(sub || trendVal) && (
        <div className="rp-kpi-meta">
          {trendVal && TrendIcon && (
            <span style={{ color: trendColor, display: 'flex', alignItems: 'center', gap: 2, fontSize: '.67rem', fontWeight: 700 }}>
              <TrendIcon size={11} />{trendVal}
            </span>
          )}
          {sub && <span style={{ fontSize: '.67rem', color: 'rgba(240,244,255,.28)', fontWeight: 300 }}>{sub}</span>}
        </div>
      )}
    </div>
  );
}

/* ── Horizontal Bar ────────────────────────────────────────────────────────── */
function HBar({ label, value, max, color, sub }: {
  label: string; value: number; max: number; color: string; sub?: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ marginBottom: '.65rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '.3rem' }}>
        <span style={{ fontSize: '.78rem', color: 'rgba(240,244,255,.75)', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: '.72rem', color, fontWeight: 700 }}>{sub ?? value}</span>
      </div>
      <div style={{ height: 5, background: 'rgba(240,244,255,.05)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 99, background: color, width: `${pct}%`, transition: 'width .7s cubic-bezier(.22,1,.36,1)' }} />
      </div>
    </div>
  );
}

/* ── Main ──────────────────────────────────────────────────────────────────── */
export default function ContabilidadReportesPage() {
  const { user } = useAuth();
  const [requests,  setRequests]  = useState<Request[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [mounted,   setMounted]   = useState(false);
  const [period,    setPeriod]    = useState<Period>('30d');
  const [exporting, setExporting] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const q = query(collection(db, 'requests'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => {
        const raw = d.data();
        return {
          ...raw, id: d.id,
          createdAt:   raw.createdAt?.toDate?.()?.toISOString()   ?? raw.createdAt   ?? '',
          updatedAt:   raw.updatedAt?.toDate?.()?.toISOString()   ?? raw.updatedAt   ?? '',
          validatedAt: raw.validatedAt?.toDate?.()?.toISOString() ?? raw.validatedAt ?? null,
        } as Request;
      });
      setRequests(data);
      setLoading(false);
    }, err => { console.error('requests snapshot:', err); setLoading(false); });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    if (period === 'all') return requests;
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
    return requests.filter(r => r.createdAt >= cutoff);
  }, [requests, period]);

  const metrics = useMemo(() => {
    const total       = filtered.length;
    const validated   = filtered.filter(r => ['validada','liquidada'].includes(r.status)).length;
    const rejected    = filtered.filter(r => r.status === 'rechazada').length;
    const observed    = filtered.filter(r => r.status === 'observada').length;
    const pending     = filtered.filter(r => ['comprobante_subido','factura_subida','observada'].includes(r.status)).length;
    const totalAmount = filtered.reduce((s, r) => s + (r.approvedAmount || r.totalAmount || 0), 0);
    const validatedAmt= filtered.filter(r => ['validada','liquidada'].includes(r.status)).reduce((s, r) => s + (r.approvedAmount || r.totalAmount || 0), 0);
    const pendingAmt  = filtered.filter(r => ['comprobante_subido','factura_subida','observada'].includes(r.status)).reduce((s, r) => s + (r.approvedAmount || r.totalAmount || 0), 0);
    const approvalRate= total > 0 ? Math.round((validated / total) * 100) : 0;
    const validatedWithTime = filtered.filter(r => r.validatedAt && r.createdAt);
    const avgHours = validatedWithTime.length > 0
      ? validatedWithTime.reduce((s, r) => s + (new Date(r.validatedAt!).getTime() - new Date(r.createdAt).getTime()) / 3_600_000, 0) / validatedWithTime.length
      : 0;
    const avgDays = avgHours > 24 ? `${(avgHours / 24).toFixed(1)}d` : `${Math.round(avgHours)}h`;
    const byType: Record<string, { count: number; amount: number }> = {};
    filtered.forEach(r => {
      const t = r.type ?? 'otros';
      if (!byType[t]) byType[t] = { count: 0, amount: 0 };
      byType[t].count++; byType[t].amount += r.approvedAmount || r.totalAmount || 0;
    });
    const byStatus: Record<string, number> = {};
    filtered.forEach(r => { byStatus[r.status] = (byStatus[r.status] ?? 0) + 1; });
    const byUser: Record<string, { count: number; amount: number }> = {};
    filtered.forEach(r => {
      const u = r.userName ?? 'Desconocido';
      if (!byUser[u]) byUser[u] = { count: 0, amount: 0 };
      byUser[u].count++; byUser[u].amount += r.approvedAmount || r.totalAmount || 0;
    });
    const dailyMap: Record<string, number> = {};
    const amtMap: Record<string, number>   = {};
    for (let i = 13; i >= 0; i--) {
      const d   = new Date(Date.now() - i * 86400_000);
      const key = d.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit' });
      dailyMap[key] = 0; amtMap[key] = 0;
    }
    filtered.forEach(r => {
      const key = new Date(r.createdAt).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit' });
      if (key in dailyMap) { dailyMap[key]++; amtMap[key] += r.approvedAmount || r.totalAmount || 0; }
    });
    return { total, validated, rejected, observed, pending, totalAmount, validatedAmt, pendingAmt, approvalRate, avgDays, byType, byStatus, byUser, dailyMap, amtMap };
  }, [filtered]);

  const dailyBarData = useMemo(() => Object.entries(metrics.dailyMap).map(([label, value]) => ({ label: label.split('/')[0], value })), [metrics.dailyMap]);
  const typeDonut    = useMemo(() => Object.entries(metrics.byType).map(([type, d]) => ({ label: TYPE_LABELS[type] ?? type, value: d.count, color: TYPE_COLORS[type] ?? '#8b8ea0' })), [metrics.byType]);
  const statusDonut  = useMemo(() => Object.entries(metrics.byStatus).map(([status, count]) => ({ label: STATUS_CONFIG[status]?.label ?? status, value: count, color: STATUS_CONFIG[status]?.color ?? '#8b8ea0' })), [metrics.byStatus]);
  const topUsers     = useMemo(() => Object.entries(metrics.byUser).sort((a, b) => b[1].amount - a[1].amount).slice(0, 6), [metrics.byUser]);
  const maxUserAmt   = topUsers[0]?.[1].amount ?? 1;
  const sparkCounts  = useMemo(() => Object.values(metrics.dailyMap), [metrics.dailyMap]);

  /* Top user colors — blue/red palette */
  const USER_COLORS = ['#60a5fa','#93c5fd','#a78bfa','#34d399','#f87171','#f97316'];

  const handleExport = async () => {
    setExporting(true);
    try {
      const XLSX: any = await new Promise((resolve, reject) => {
        if ((window as any).XLSX) { resolve((window as any).XLSX); return; }
        const s = document.createElement('script');
        s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
        s.onload  = () => resolve((window as any).XLSX);
        s.onerror = () => reject(new Error('No se pudo cargar SheetJS'));
        document.head.appendChild(s);
      });
      const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-DO', { day:'2-digit', month:'2-digit', year:'numeric' });
      const wb = XLSX.utils.book_new();
      const addS = (data: any[][], name: string, cols: number[]) => {
        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = cols.map(w => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws, name);
      };
      addS([
        [`Reporte de Contabilidad — GastoFlow · ${fmtDate(new Date().toISOString())}`],
        [`Período: ${period === 'all' ? 'Todo' : period}`],
        [], ['MÉTRICAS GENERALES', ''],
        ['Total solicitudes', metrics.total],
        ['Monto total', formatCurrency(metrics.totalAmount)],
        ['Validadas', metrics.validated],
        ['Monto validado', formatCurrency(metrics.validatedAmt)],
        ['Rechazadas', metrics.rejected],
        ['Pendientes', metrics.pending],
        ['Tasa de aprobación', `${metrics.approvalRate}%`],
        ['Tiempo promedio', metrics.avgDays],
      ], 'Resumen Ejecutivo', [32, 18, 18, 14]);
      addS([
        ['Detalle de Solicitudes'], [],
        ['#', 'Número', 'Empleado', 'Tipo', 'Estado', 'Monto Solicitado', 'Monto Aprobado', 'Creada'],
        ...filtered.map((r, i) => [
          i + 1, r.numero ?? r.id, r.userName ?? '—',
          TYPE_LABELS[r.type] ?? r.type, STATUS_CONFIG[r.status]?.label ?? r.status,
          formatCurrency(r.totalAmount), formatCurrency(r.approvedAmount || r.totalAmount),
          fmtDate(r.createdAt),
        ]),
      ], 'Detalle Solicitudes', [5, 18, 22, 14, 16, 18, 18, 14]);
      const filename = `reporte-contabilidad-${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, filename);
      toast.success('✅ Reporte exportado a Excel');
    } catch (err: any) {
      toast.error(err?.message ?? 'Error al exportar');
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppShell requiredRole="contabilidad">
      <style>{STYLES}</style>
      <div className="rp-page">
        <div className="rp-topbar" />

        {/* Header */}
        <div className={`fu ${mounted ? 'in' : ''}`}>
          <div className="rp-eyebrow"><BarChart2 size={11} /> Contabilidad</div>
          <h1 className="rp-title">Reportes <em>& Analítica</em></h1>
          <p className="rp-sub">Visión financiera completa · datos en tiempo real</p>
        </div>

        {/* Controls */}
        <div className={`rp-controls fu d1 ${mounted ? 'in' : ''}`}>
          <div className="rp-period-group">
            {(['7d','30d','90d','all'] as Period[]).map(p => (
              <button key={p} className={`rp-period-btn ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>
                {p === 'all' ? 'Todo' : p === '7d' ? '7 días' : p === '30d' ? '30 días' : '90 días'}
              </button>
            ))}
          </div>
          <button className="rp-export-btn" onClick={handleExport} disabled={exporting || filtered.length === 0}>
            {exporting ? <><div className="rp-spin" /> Exportando...</> : <><Download size={13} /> Exportar Excel</>}
          </button>
        </div>

        {/* KPI Grid */}
        <div className={`rp-kpi-grid fu d1 ${mounted ? 'in' : ''}`}>
          <KpiCard label="Monto Total" value={loading ? '—' : formatCurrency(metrics.totalAmount)}
            sub={`${metrics.total} solicitudes`} trend="up" trendVal={`${metrics.approvalRate}% aprobadas`}
            color="#60a5fa" icon={<DollarSign size={15}/>} sparkData={sparkCounts} />
          <KpiCard label="Validadas" value={loading ? '—' : metrics.validated}
            sub={formatCurrency(metrics.validatedAmt)} trend="up"
            color="#22c55e" icon={<CheckCircle size={15}/>} sparkData={sparkCounts.map((v,i) => i%2===0 ? v : Math.round(v*.7))} />
          <KpiCard label="Pendientes" value={loading ? '—' : metrics.pending}
            sub={formatCurrency(metrics.pendingAmt)} trend={metrics.pending > 5 ? 'down' : 'neutral'}
            color="#93c5fd" icon={<FileText size={15}/>} />
          <KpiCard label="Observadas" value={loading ? '—' : metrics.observed}
            sub="requieren corrección" trend={metrics.observed > 0 ? 'down' : 'neutral'}
            color="#f97316" icon={<AlertTriangle size={15}/>} />
          <KpiCard label="Rechazadas" value={loading ? '—' : metrics.rejected}
            sub={`${metrics.total > 0 ? Math.round((metrics.rejected/metrics.total)*100) : 0}% del total`}
            color="#ef4444" icon={<X size={15}/>} />
          <KpiCard label="Tiempo Promedio" value={loading ? '—' : metrics.avgDays}
            sub="de creación a validación" trend="neutral"
            color="#a78bfa" icon={<Zap size={15}/>} />
        </div>

        {/* Charts Row 1 */}
        <div className={`rp-charts-row fu d2 ${mounted ? 'in' : ''}`}>
          <div className="rp-chart-card" style={{ flex: 2 }}>
            <div className="rp-chart-hd">
              <Activity size={13} style={{ color:'#60a5fa' }}/>
              Solicitudes por Día <span className="rp-chart-sub">últimas 2 semanas</span>
            </div>
            {loading ? <div className="rp-skeleton" style={{ height: 100 }} /> : <BarChart data={dailyBarData} color="#60a5fa" height={90} />}
          </div>

          <div className="rp-chart-card">
            <div className="rp-chart-hd"><PieChart size={13} style={{ color:'#93c5fd' }}/> Por Tipo</div>
            {loading ? <div className="rp-skeleton" style={{ height:120, borderRadius:'50%', width:120, margin:'0 auto' }} /> : (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'.75rem' }}>
                <DonutChart slices={typeDonut.length ? typeDonut : [{ label:'Sin datos', value:1, color:'#1a2030' }]} />
                <div style={{ width:'100%' }}>
                  {typeDonut.map((s,i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:'.4rem', marginBottom:'.25rem' }}>
                      <div style={{ width:7, height:7, borderRadius:'50%', background:s.color, flexShrink:0 }}/>
                      <span style={{ fontSize:'.67rem', color:'rgba(240,244,255,.55)', flex:1 }}>{s.label}</span>
                      <span style={{ fontSize:'.67rem', color:s.color, fontWeight:700 }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rp-chart-card">
            <div className="rp-chart-hd"><PieChart size={13} style={{ color:'#a78bfa' }}/> Por Estado</div>
            {loading ? <div className="rp-skeleton" style={{ height:120, borderRadius:'50%', width:120, margin:'0 auto' }} /> : (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'.75rem' }}>
                <DonutChart slices={statusDonut.length ? statusDonut : [{ label:'Sin datos', value:1, color:'#1a2030' }]} />
                <div style={{ width:'100%' }}>
                  {statusDonut.slice(0,6).map((s,i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:'.4rem', marginBottom:'.25rem' }}>
                      <div style={{ width:7, height:7, borderRadius:'50%', background:s.color, flexShrink:0 }}/>
                      <span style={{ fontSize:'.67rem', color:'rgba(240,244,255,.55)', flex:1 }}>{s.label}</span>
                      <span style={{ fontSize:'.67rem', color:s.color, fontWeight:700 }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className={`rp-charts-row fu d2 ${mounted ? 'in' : ''}`}>
          <div className="rp-chart-card" style={{ flex:1.5 }}>
            <div className="rp-chart-hd"><DollarSign size={13} style={{ color:'#22c55e' }}/> Monto por Tipo de Gasto</div>
            {loading ? <div className="rp-skeleton" style={{ height:140 }} /> :
              Object.entries(metrics.byType).length === 0 ? <div className="rp-empty-chart">Sin datos en este período</div> : (
                <div style={{ padding:'.25rem 0' }}>
                  {Object.entries(metrics.byType).sort((a,b)=>b[1].amount-a[1].amount).map(([type,d]) => (
                    <HBar key={type} label={TYPE_LABELS[type]??type} value={d.amount}
                      max={Object.values(metrics.byType).reduce((m,v)=>Math.max(m,v.amount),1)}
                      color={TYPE_COLORS[type]??'#8b8ea0'} sub={formatCurrency(d.amount)} />
                  ))}
                </div>
              )}
          </div>

          <div className="rp-chart-card" style={{ flex:1.5 }}>
            <div className="rp-chart-hd"><Users size={13} style={{ color:'#93c5fd' }}/> Top Empleados por Monto</div>
            {loading ? <div className="rp-skeleton" style={{ height:140 }} /> :
              topUsers.length === 0 ? <div className="rp-empty-chart">Sin datos en este período</div> : (
                <div style={{ padding:'.25rem 0' }}>
                  {topUsers.map(([name,d],i) => (
                    <HBar key={name} label={`${i+1}. ${name.split(' ')[0]}`}
                      value={d.amount} max={maxUserAmt}
                      color={USER_COLORS[i] ?? '#8b8ea0'} sub={formatCurrency(d.amount)} />
                  ))}
                </div>
              )}
          </div>

          <div className="rp-chart-card">
            <div className="rp-chart-hd"><TrendingUp size={13} style={{ color:'#60a5fa' }}/> Indicadores Clave</div>
            {loading ? <div className="rp-skeleton" style={{ height:140 }} /> : (
              <div style={{ display:'flex', flexDirection:'column', gap:'.9rem', padding:'.25rem 0' }}>
                {[
                  { label:'Tasa de aprobación', value:`${metrics.approvalRate}%`, pct:metrics.approvalRate,
                    color: metrics.approvalRate>=70?'#22c55e':metrics.approvalRate>=40?'#f97316':'#ef4444' },
                  { label:'Completitud documental',
                    value: metrics.total>0?`${Math.round(((metrics.validated+metrics.rejected)/metrics.total)*100)}%`:'0%',
                    pct:   metrics.total>0?Math.round(((metrics.validated+metrics.rejected)/metrics.total)*100):0,
                    color: '#60a5fa' },
                  { label:'Sin observaciones',
                    value: metrics.observed>0?`${metrics.observed} pendientes`:'✓ Sin obs.',
                    pct:   metrics.total>0?100-Math.round((metrics.observed/metrics.total)*100):100,
                    color: metrics.observed===0?'#22c55e':'#f97316' },
                ].map((item,i) => (
                  <div key={i}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'.3rem' }}>
                      <span style={{ fontSize:'.72rem', color:'rgba(240,244,255,.5)' }}>{item.label}</span>
                      <span style={{ fontSize:'.75rem', fontWeight:700, color:item.color }}>{item.value}</span>
                    </div>
                    <div style={{ height:4, background:'rgba(240,244,255,.05)', borderRadius:99 }}>
                      <div style={{ height:'100%', borderRadius:99, background:item.color, width:`${item.pct}%`, transition:'width .8s cubic-bezier(.22,1,.36,1)' }}/>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Monto diario */}
        <div className={`rp-chart-card fu d3 ${mounted ? 'in' : ''}`} style={{ marginBottom:'1rem' }}>
          <div className="rp-chart-hd">
            <DollarSign size={13} style={{ color:'#22c55e' }}/>
            Monto Diario Comprometido <span className="rp-chart-sub">últimas 2 semanas · RD$</span>
          </div>
          {loading ? <div className="rp-skeleton" style={{ height:90 }} /> :
            <BarChart data={Object.entries(metrics.amtMap).map(([label,value])=>({ label:label.split('/')[0], value }))} color="#22c55e" height={90} />}
        </div>

        {/* Solicitudes recientes */}
        <div className={`fu d3 ${mounted ? 'in' : ''}`}>
          <div className="rp-section-hd">
            <FileText size={12}/> Solicitudes Recientes
            <span className="rp-section-count">{filtered.slice(0,10).length}</span>
          </div>
          <div className="rp-table-card">
            {loading ? (
              Array.from({ length:5 }).map((_,i) => (
                <div key={i} style={{ padding:'.7rem 1rem', borderBottom:'1px solid rgba(240,244,255,.04)', display:'flex', gap:'1rem' }}>
                  <div className="rp-skeleton" style={{ flex:1, height:'.7rem' }}/>
                  <div className="rp-skeleton" style={{ width:'25%', height:'.7rem' }}/>
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="rp-empty-chart" style={{ padding:'2rem' }}>Sin solicitudes en este período</div>
            ) : (
              filtered.slice(0,10).map(req => {
                const cfg = STATUS_CONFIG[req.status] ?? { label:req.status, color:'#8b8ea0' };
                return (
                  <div key={req.id} className="rp-row">
                    <div style={{ display:'flex', flexDirection:'column', gap:'.2rem', flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'.5rem' }}>
                        <span style={{ fontSize:'.82rem', fontWeight:600, color:'#f0f4ff' }}>{req.numero ?? req.id.slice(0,12)}</span>
                        <span style={{ fontSize:'.58rem', fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase',
                          color:cfg.color, background:`${cfg.color}18`, border:`1px solid ${cfg.color}28`,
                          padding:'.1rem .45rem', borderRadius:99 }}>{cfg.label}</span>
                        <span style={{ fontSize:'.62rem', color:TYPE_COLORS[req.type]??'#8b8ea0',
                          background:`${TYPE_COLORS[req.type]??'#8b8ea0'}15`, padding:'.1rem .4rem', borderRadius:99,
                          border:`1px solid ${TYPE_COLORS[req.type]??'#8b8ea0'}28` }}>{TYPE_LABELS[req.type]??req.type}</span>
                      </div>
                      <span style={{ fontSize:'.68rem', color:'rgba(240,244,255,.35)' }}>
                        {req.userName??'—'} · {new Date(req.createdAt).toLocaleDateString('es-DO',{day:'2-digit',month:'short'})}
                      </span>
                    </div>
                    <span style={{ fontFamily:"'Playfair Display',serif", fontSize:'1.05rem', fontWeight:600, color:'#93c5fd', flexShrink:0 }}>
                      {formatCurrency(req.approvedAmount||req.totalAmount)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Outfit:wght@300;400;500;600&display=swap');

.rp-page {
  font-family: 'Outfit', sans-serif;
  padding: 1.5rem; max-width: 980px; margin: 0 auto; padding-bottom: 6rem;
  --blue: #3b82f6; --blue2: #60a5fa; --blue3: #93c5fd;
  --red: #ef4444;  --red2: #f87171;
  --blue-dim: rgba(59,130,246,.10); --blue-border: rgba(59,130,246,.35);
  --i3: #0a1120; --i4: #0e1828;
  --w: #f0f4ff;
  --w40: rgba(240,244,255,.40); --w20: rgba(240,244,255,.20); --w08: rgba(240,244,255,.08);
  background: #04080f; min-height: 100vh;
}
@media(min-width:768px) { .rp-page { padding: 2rem 2.5rem 3rem; } }

/* Top bar — blue → red */
.rp-topbar {
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--blue) 30%, var(--red) 70%, transparent);
  opacity: .75; border-radius: 99px; margin-bottom: 1.75rem;
}

.rp-eyebrow {
  font-size: .63rem; font-weight: 600; letter-spacing: .2em; text-transform: uppercase;
  color: var(--blue2); display: flex; align-items: center; gap: .45rem; margin-bottom: .35rem;
}
.rp-title {
  font-family: 'Playfair Display', serif;
  font-size: 1.9rem; font-weight: 500; color: var(--w);
  letter-spacing: -.01em; line-height: 1.12; margin-bottom: .3rem;
}
.rp-title em {
  font-style: italic;
  background: linear-gradient(125deg, var(--blue2) 20%, var(--blue3) 60%, var(--red2) 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
.rp-sub { font-size: .76rem; color: var(--w40); font-weight: 300; margin-bottom: 1.5rem; }

/* Controls */
.rp-controls {
  display: flex; align-items: center; justify-content: space-between;
  gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem;
}
.rp-period-group {
  display: flex; background: var(--i3); border: 1px solid var(--w08);
  border-radius: 10px; overflow: hidden; padding: 3px; gap: 2px;
}
.rp-period-btn {
  padding: .38rem .8rem; border-radius: 7px; border: none;
  background: none; font-family: 'Outfit', sans-serif;
  font-size: .75rem; font-weight: 500; color: var(--w40);
  cursor: pointer; transition: all .15s; white-space: nowrap;
}
.rp-period-btn.active {
  background: var(--blue-dim); color: var(--blue2);
  border: 1px solid var(--blue-border);
}
.rp-period-btn:hover:not(.active) { color: var(--w); background: var(--w08); }

/* Export button */
.rp-export-btn {
  display: flex; align-items: center; gap: .45rem;
  background: var(--blue-dim); border: 1px solid var(--blue-border);
  color: var(--blue2); border-radius: 10px; padding: .55rem 1rem;
  font-family: 'Outfit', sans-serif; font-size: .78rem; font-weight: 600;
  cursor: pointer; transition: all .2s; white-space: nowrap;
}
.rp-export-btn:hover:not(:disabled) { background: rgba(59,130,246,.18); transform: translateY(-1px); }
.rp-export-btn:disabled { opacity: .4; cursor: not-allowed; }
.rp-spin {
  width: 12px; height: 12px;
  border: 2px solid var(--blue2); border-top-color: transparent;
  border-radius: 50%; animation: rp-spin .7s linear infinite;
}
@keyframes rp-spin { to { transform: rotate(360deg); } }

/* KPI grid */
.rp-kpi-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: .65rem; margin-bottom: 1.25rem; }
@media(min-width:580px) { .rp-kpi-grid { grid-template-columns: repeat(3,1fr); } }
@media(min-width:860px) { .rp-kpi-grid { grid-template-columns: repeat(6,1fr); } }

.rp-kpi {
  background: var(--i3); border: 1px solid var(--w08);
  border-radius: 14px; padding: .875rem .875rem .75rem;
  transition: border-color .2s, transform .25s cubic-bezier(.22,1,.36,1);
}
.rp-kpi:hover { border-color: var(--blue-border); transform: translateY(-2px); }
.rp-kpi-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: .55rem; }
.rp-kpi-ico { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.rp-kpi-val { font-family: 'Playfair Display', serif; font-size: 1.25rem; font-weight: 600; color: var(--w); line-height: 1; margin-bottom: .18rem; }
.rp-kpi-lbl { font-size: .6rem; color: var(--w40); text-transform: uppercase; letter-spacing: .09em; margin-bottom: .35rem; }
.rp-kpi-meta { display: flex; align-items: center; justify-content: space-between; gap: .4rem; flex-wrap: wrap; }

/* Charts */
.rp-charts-row { display: flex; gap: .85rem; margin-bottom: .85rem; flex-wrap: wrap; }
.rp-chart-card { background: var(--i3); border: 1px solid var(--w08); border-radius: 16px; padding: 1rem 1.1rem; flex: 1; min-width: 200px; }
.rp-chart-hd {
  display: flex; align-items: center; gap: .45rem;
  font-size: .68rem; font-weight: 600; letter-spacing: .08em; text-transform: uppercase;
  color: var(--w40); margin-bottom: .85rem;
}
.rp-chart-sub { font-weight: 300; text-transform: none; letter-spacing: 0; color: rgba(240,244,255,.22); }
.rp-empty-chart { font-size: .76rem; color: rgba(240,244,255,.22); text-align: center; padding: 1.5rem 0; }

/* Table */
.rp-section-hd {
  display: flex; align-items: center; gap: .5rem;
  font-size: .68rem; font-weight: 600; color: var(--w40);
  text-transform: uppercase; letter-spacing: .1em; margin-bottom: .65rem;
}
.rp-section-count { margin-left: auto; background: var(--w08); border-radius: 99px; padding: .1rem .5rem; font-size: .63rem; }
.rp-table-card { background: var(--i3); border: 1px solid var(--w08); border-radius: 16px; overflow: hidden; }
.rp-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: .75rem 1.1rem; border-bottom: 1px solid rgba(240,244,255,.04);
  gap: 1rem; transition: background .15s;
}
.rp-row:last-child { border-bottom: none; }
.rp-row:hover { background: rgba(240,244,255,.02); }

/* Skeleton */
.rp-skeleton {
  background: linear-gradient(90deg, var(--i3) 25%, var(--i4) 50%, var(--i3) 75%);
  background-size: 200% 100%; animation: rp-shim 1.5s infinite; border-radius: 8px;
}
@keyframes rp-shim { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

.fu { opacity:0; transform:translateY(14px); transition:opacity .5s cubic-bezier(.22,1,.36,1),transform .5s cubic-bezier(.22,1,.36,1); }
.fu.in { opacity:1; transform:none; }
.d1{transition-delay:.07s} .d2{transition-delay:.14s} .d3{transition-delay:.21s}
`;