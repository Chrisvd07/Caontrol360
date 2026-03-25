'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { AppShell } from '@/components/app-shell';
import {
  CheckCircle, AlertTriangle, FileText, User, Image as ImageIcon,
  DollarSign, Eye, TrendingUp, TrendingDown, ChevronRight,
  ExternalLink, X,
} from 'lucide-react';
import {
  getRequestsByStatusFirestore,
  updateRequestFirestore,
  addEvidenceToRequestFirestore,
  notifyRoleFirestore,
  createNotificationFirestore,
} from '@/lib/firestore-service';
import { formatCurrency } from '@/lib/ocr';
import type { Request, Evidence } from '@/lib/types';
import { toast } from 'sonner';

const TYPE_LABELS: Record<string, string> = {
  combustible: 'Combustible', materiales: 'Materiales',
  viatico: 'Viático', gomera: 'Gomera', otros: 'Otros',
};

// ─── Status Pill ──────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    comprobante_subido: { label: 'Comprobante', color: '#60a5fa' },
    factura_subida:     { label: 'Factura',     color: '#93c5fd' },
    observada:          { label: 'Observada',   color: '#f87171' },
    validada:           { label: 'Validada',    color: '#60a5fa' },
    liquidada:          { label: 'Liquidada',   color: '#60a5fa' },
    rechazada:          { label: 'Rechazada',   color: '#ef4444' },
  };
  const cfg = map[status] ?? { label: status, color: '#8b8ea0' };
  return (
    <span style={{
      fontSize:'.6rem', fontWeight:700, letterSpacing:'.09em',
      textTransform:'uppercase' as const, color:cfg.color,
      background:`${cfg.color}18`, border:`1px solid ${cfg.color}28`,
      padding:'.18rem .55rem', borderRadius:99, whiteSpace:'nowrap' as const,
    }}>{cfg.label}</span>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
function Lightbox({ url, type, onClose }: { url: string; type: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{
      position:'fixed', inset:0, background:'rgba(4,8,15,.95)',
      backdropFilter:'blur(12px)', zIndex:300,
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      padding:'1.5rem',
    }}>
      <div style={{
        position:'absolute', top:20, left:0, right:0,
        display:'flex', alignItems:'center', justifyContent:'center', gap:'.5rem',
      }}>
        <span style={{
          background:'rgba(59,130,246,.1)', border:'1px solid rgba(59,130,246,.2)',
          borderRadius:99, padding:'.25rem .75rem',
          fontSize:'.7rem', fontWeight:700, color:'rgba(96,165,250,.8)',
          textTransform:'uppercase', letterSpacing:'.08em',
        }}>{type}</span>
      </div>
      <img
        src={url} alt={type}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth:'100%', maxHeight:'80vh',
          borderRadius:14, boxShadow:'0 32px 80px rgba(0,0,0,.95)',
          border:'1px solid rgba(59,130,246,.15)',
        }}
      />
      <button onClick={onClose} style={{
        position:'fixed', top:16, right:16,
        background:'rgba(240,244,255,.06)', border:'1px solid rgba(240,244,255,.12)',
        borderRadius:8, color:'rgba(240,244,255,.6)',
        width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center',
        cursor:'pointer', transition:'background .2s',
      }}><X size={16}/></button>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed',inset:0,background:'rgba(4,8,15,.75)',backdropFilter:'blur(6px)',zIndex:100 }}/>
      <div style={{
        position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:101,
        width:'min(680px,calc(100vw - 1.5rem))',maxHeight:'90vh',overflowY:'auto',
        background:'#060c18',border:'1px solid rgba(59,130,246,.12)',
        borderRadius:18,boxShadow:'0 32px 80px rgba(0,0,0,.85), 0 0 0 1px rgba(59,130,246,.06)',
        animation:'m-in .25s cubic-bezier(.22,1,.36,1)',
      }}>
        {children}
      </div>
      <style>{`@keyframes m-in{from{opacity:0;transform:translate(-50%,-54%) scale(.96)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}`}</style>
    </>
  );
}

// ─── Helpers de validación OCR ────────────────────────────────────────────────
function normalize(s: string) {
  return s.toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, '').trim();
}

function nombreCoincide(ocrName: string, expected: string): boolean {
  const a = normalize(ocrName).split(/\s+/).filter(w => w.length >= 4);
  const b = normalize(expected).split(/\s+/).filter(w => w.length >= 4);
  return a.some(w => b.includes(w));
}

// ─── Tablita OCR inline ───────────────────────────────────────────────────────
function OcrTable({ ev, userName }: { ev: Evidence; userName: string }) {
  if (!ev.ocrData) return null;

  if (ev.type === 'comprobante') {
    const raw = ev.ocrData.rawText ? (() => { try { return JSON.parse(ev.ocrData!.rawText!); } catch { return null; } })() : null;
    const pagoa = raw?.pagoa ?? ev.ocrData.proveedor ?? null;
    const coincide = pagoa ? nombreCoincide(pagoa, userName) : false;

    const rows = [
      { lbl: 'Pago A',      val: pagoa,                   check: coincide,      required: true },
      { lbl: 'Monto',       val: raw?.monto ?? (ev.ocrData.total ? formatCurrency(ev.ocrData.total) : null), check: null, required: true },
      { lbl: 'Fecha',       val: raw?.fechaPago ?? ev.ocrData.fecha ?? null,     check: null, required: true },
      { lbl: 'Cuenta',      val: raw?.numeroCuenta ?? null,                      check: null, required: true },
      { lbl: 'Referencia',  val: raw?.nroReferencia ?? null,                     check: null, required: true },
      { lbl: 'Descripción', val: raw?.descripcion ?? null,                       check: null, required: false },
    ];

    return (
      <div style={{ marginTop: '.6rem' }}>
        {!coincide && pagoa && (
          <div style={{
            fontSize: '.67rem', color: '#f87171',
            background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)',
            borderRadius: 7, padding: '.35rem .6rem', marginBottom: '.5rem',
            display: 'flex', gap: '.4rem', alignItems: 'flex-start',
          }}>
            ✗ "{pagoa}" no coincide con el solicitante "{userName}"
          </div>
        )}
        {rows.map((r, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            padding: '.28rem 0',
            borderBottom: i < rows.length - 1 ? '1px solid rgba(240,244,255,.05)' : 'none',
            gap: '.5rem',
          }}>
            <span style={{ fontSize: '.62rem', color: 'rgba(240,244,255,.3)', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', flexShrink: 0 }}>
              {r.lbl}
            </span>
            <span style={{
              fontSize: '.68rem', textAlign: 'right',
              color: !r.val
                ? '#f87171'
                : r.check === false
                  ? '#f87171'
                  : r.check === true
                    ? '#60a5fa'
                    : 'rgba(240,244,255,.65)',
              fontWeight: r.check !== null ? 700 : 400,
              wordBreak: 'break-all',
            }}>
              {r.val
                ? (r.check === true ? '✓ ' : r.check === false ? '✗ ' : '') + r.val
                : '⚠ No detectado'}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (ev.type === 'factura') {
    const raw = ev.ocrData.rawText ? (() => { try { return JSON.parse(ev.ocrData!.rawText!); } catch { return null; } })() : null;

    const rows = [
      { lbl: 'Suplidor',   val: ev.ocrData.proveedor ?? null },
      { lbl: 'RNC',        val: ev.ocrData.rnc ?? null },
      { lbl: 'NCF',        val: ev.ocrData.ncf ?? null },
      { lbl: 'Fecha',      val: ev.ocrData.fecha ?? null },
      { lbl: 'Subtotal',   val: raw?.subtotal != null ? formatCurrency(raw.subtotal * (raw.tasaAplicada ?? 1)) : null },
      { lbl: 'ITBIS',      val: ev.ocrData.itbis != null ? formatCurrency(ev.ocrData.itbis) : null },
      { lbl: 'Total',      val: ev.ocrData.total != null ? formatCurrency(ev.ocrData.total) : null },
      { lbl: 'Moneda',     val: raw?.monedaOriginal ?? null },
      ...(raw?.tasaAplicada && raw.tasaAplicada !== 1
        ? [{ lbl: 'Tasa', val: `${raw.monedaOriginal} × ${raw.tasaAplicada}` }]
        : []),
    ];

    const rncStatus: 'confirmado' | 'no_encontrado' = raw?.rncCodeAlarmConfirmado ? 'confirmado' : 'no_encontrado';

    return (
      <div style={{ marginTop: '.6rem' }}>
        <div style={{
          fontSize: '.62rem', fontWeight: 700,
          color: rncStatus === 'confirmado' ? '#60a5fa' : '#fbbf24',
          background: rncStatus === 'confirmado' ? 'rgba(59,130,246,.07)' : 'rgba(251,191,36,.07)',
          border: `1px solid ${rncStatus === 'confirmado' ? 'rgba(59,130,246,.2)' : 'rgba(251,191,36,.2)'}`,
          borderRadius: 7, padding: '.3rem .6rem', marginBottom: '.5rem',
          display: 'flex', alignItems: 'center', gap: '.4rem',
        }}>
          {rncStatus === 'confirmado' ? '✓ RNC CodeAlarm confirmado' : '⚠ RNC CodeAlarm no verificado'}
        </div>
        {rows.map((r, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            padding: '.28rem 0',
            borderBottom: i < rows.length - 1 ? '1px solid rgba(240,244,255,.05)' : 'none',
            gap: '.5rem',
          }}>
            <span style={{ fontSize: '.62rem', color: 'rgba(240,244,255,.3)', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', flexShrink: 0 }}>
              {r.lbl}
            </span>
            <span style={{
              fontSize: '.68rem', textAlign: 'right', wordBreak: 'break-all',
              color: !r.val ? '#f87171' : 'rgba(240,244,255,.65)',
            }}>
              {r.val ?? '⚠ No detectado'}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

// ─── Lógica de validación para el botón Validar ───────────────────────────────
function canValidate(req: Request): { ok: boolean; reason: string } {
  const comprobante = req.evidences.find(e => e.type === 'comprobante');
  const factura     = req.evidences.find(e => e.type === 'factura');

  if (!comprobante) return { ok: false, reason: 'Falta comprobante de transferencia' };
  if (!factura)     return { ok: false, reason: 'Falta factura fiscal' };

  if (comprobante.ocrData) {
    const raw = comprobante.ocrData.rawText ? (() => { try { return JSON.parse(comprobante.ocrData!.rawText!); } catch { return null; } })() : null;
    const pagoa = raw?.pagoa ?? comprobante.ocrData.proveedor ?? null;
    if (pagoa && !nombreCoincide(pagoa, req.userName)) {
      return { ok: false, reason: `Nombre en comprobante ("${pagoa}") no coincide con ${req.userName}` };
    }
  }

  return { ok: true, reason: '' };
}

// ─── Evidence Gallery ─────────────────────────────────────────────────────────
function EvidenceGallery({ evidences, userName, onLightbox }: {
  evidences: Evidence[];
  userName: string;
  onLightbox: (url: string, type: string) => void;
}) {
  if (evidences.length === 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '.5rem',
        fontSize: '.8rem', color: 'rgba(240,244,255,.25)',
        background: 'rgba(59,130,246,.03)', border: '1px solid rgba(59,130,246,.08)',
        borderRadius: 10, padding: '.875rem',
      }}>
        <ImageIcon size={16}/> Sin evidencias aún
      </div>
    );
  }

  const comprobantes = evidences.filter(e => e.type === 'comprobante');
  const facturas     = evidences.filter(e => e.type === 'factura');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
      {[
        { label: 'Comprobante de transferencia', items: comprobantes, color: '#60a5fa' },
        { label: 'Factura fiscal',               items: facturas,     color: '#93c5fd' },
      ].map(group => group.items.length > 0 && (
        <div key={group.label}>
          <div style={{
            fontSize: '.62rem', fontWeight: 700, letterSpacing: '.1em',
            textTransform: 'uppercase', color: group.color,
            marginBottom: '.5rem', display: 'flex', alignItems: 'center', gap: '.4rem',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: group.color, display: 'inline-block', boxShadow: `0 0 6px ${group.color}` }}/>
            {group.label}
          </div>
          {group.items.map(ev => (
            <div key={ev.id} style={{
              display: 'grid',
              gridTemplateColumns: '140px 1fr',
              gap: '.75rem',
              background: 'rgba(6,12,24,.7)',
              border: '1px solid rgba(59,130,246,.08)',
              borderRadius: 12,
              overflow: 'hidden',
              marginBottom: '.5rem',
            }}>
              <div
                onClick={() => onLightbox(ev.url, ev.type)}
                style={{ position: 'relative', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '.85')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                <img src={ev.url} alt={ev.type} style={{ width: '100%', height: '100%', minHeight: 110, objectFit: 'cover', display: 'block' }}/>
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'linear-gradient(transparent,rgba(4,8,15,.8))',
                  padding: '.4rem .5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <span style={{ fontSize: '.58rem', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(240,244,255,.8)' }}>{ev.type}</span>
                  <ExternalLink size={10} style={{ color: 'rgba(96,165,250,.6)' }}/>
                </div>
              </div>
              <div style={{ padding: '.65rem .75rem .65rem 0', overflowY: 'auto', maxHeight: 200 }}>
                <OcrTable ev={ev} userName={userName} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ContabilidadPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<Request[]>([]);
  const [selected, setSelected] = useState<Request | null>(null);
  const [modal, setModal]       = useState<'detail' | 'observe' | null>(null);
  const [obsText, setObsText]   = useState('');
  const [mounted, setMounted]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; type: string } | null>(null);

  useEffect(() => { setMounted(true); load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const r = await getRequestsByStatusFirestore([
        'comprobante_subido', 'factura_subida', 'observada',
        'validada', 'liquidada', 'rechazada',
      ]);
      setRequests(r.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openDetail  = (req: Request) => { setSelected(req); setModal('detail'); };
  const closeModal  = () => { setModal(null); };

  // ── Validar ────────────────────────────────────────────────────────────────
  const handleValidate = async () => {
    if (!selected || !user || saving) return;
    setSaving(true);
    try {
      await updateRequestFirestore(
        selected.id,
        { status: 'validada', validatedAt: new Date().toISOString(), validatedBy: user.id },
        user.id, user.name,
      );
      await createNotificationFirestore({
        userId: selected.userId,
        title: `✅ Solicitud ${selected.numero} validada`,
        message: 'Tu solicitud fue validada por contabilidad. El proceso está completo.',
        type: 'success',
      });
      await notifyRoleFirestore('pagos', {
        title: `✅ ${selected.numero} validada`,
        message: `Contabilidad validó la solicitud de ${selected.userName}.`,
        type: 'success',
      });
      await notifyRoleFirestore('admin', {
        title: `✅ ${selected.numero} validada`,
        message: `${user.name} validó la solicitud de ${selected.userName}.`,
        type: 'success',
      });
      toast.success(`Solicitud ${selected.numero} validada`);
      closeModal(); setSelected(null); await load();
    } catch (err) {
      console.error(err); toast.error('Error al validar');
    } finally {
      setSaving(false);
    }
  };

  // ── Observar ───────────────────────────────────────────────────────────────
  const handleObserve = async () => {
    if (!selected || !user || !obsText.trim() || saving) return;
    setSaving(true);
    try {
      await updateRequestFirestore(
        selected.id,
        { status: 'observada', observations: [...(selected.observations || []), obsText] },
        user.id, user.name,
      );
      await createNotificationFirestore({
        userId: selected.userId,
        title: `⚠️ Observación en ${selected.numero}`,
        message: obsText,
        type: 'warning',
      });
      await notifyRoleFirestore('pagos', {
        title: `⚠️ Observación en ${selected.numero}`,
        message: `Contabilidad observó la solicitud de ${selected.userName}: ${obsText}`,
        type: 'warning',
      });
      toast.info(`Observación registrada en ${selected.numero}`);
      closeModal(); setObsText(''); setSelected(null); await load();
    } catch (err) {
      console.error(err); toast.error('Error al observar');
    } finally {
      setSaving(false);
    }
  };

  // ── Segmentos ──────────────────────────────────────────────────────────────
  const pending    = requests.filter(r => ['comprobante_subido','factura_subida','observada'].includes(r.status));
  const historical = requests.filter(r => ['validada','liquidada','rechazada'].includes(r.status));

  return (
    <AppShell requiredRole="contabilidad">
      <style>{STYLES}</style>
      <div className="ct-page">
        {/* Top bar — blue→red like login */}
        <div className="ct-top-bar"/>

        <div className={`fu ${mounted ? 'in' : ''}`}>
          <div className="ct-eyebrow">Contabilidad</div>
          <h1 className="ct-title">Validación <em>Contable</em></h1>
          <p className="ct-sub">Revisa evidencias y valida solicitudes con comprobante y factura</p>
        </div>

        {/* Stats */}
        <div className={`ct-stats fu d1 ${mounted ? 'in' : ''}`}>
          {[
            { ico: <FileText size={15}/>, val: loading ? '…' : pending.filter(r => r.status !== 'observada').length, lbl: 'Por validar', color: '#60a5fa', glow: 'rgba(59,130,246,.22)' },
            { ico: <AlertTriangle size={15}/>, val: loading ? '…' : pending.filter(r => r.status === 'observada').length, lbl: 'Observadas', color: '#f87171', glow: 'rgba(239,68,68,.22)' },
            { ico: <CheckCircle size={15}/>, val: loading ? '…' : historical.length, lbl: 'Historial', color: '#93c5fd', glow: 'rgba(147,197,253,.18)' },
          ].map((s, i) => (
            <div key={i} className="ct-stat" style={{ '--stat-glow': s.glow } as React.CSSProperties}>
              <div className="ct-stat-ico" style={{ background:`${s.color}15`, color:s.color, boxShadow:`0 0 12px ${s.glow}` }}>{s.ico}</div>
              <span className="ct-stat-val" style={{ color:s.color }}>{s.val}</span>
              <span className="ct-stat-lbl">{s.lbl}</span>
            </div>
          ))}
        </div>

        {/* ── Pendientes ── */}
        {!loading && pending.length > 0 && (
          <div className={`fu d1 ${mounted ? 'in' : ''}`}>
            <div className="ct-section-hd">
              <div className="ct-section-dot" style={{ background:'#60a5fa', boxShadow:'0 0 6px rgba(59,130,246,.6)' }}/>
              Pendientes de Validación
              <span className="ct-section-count">{pending.length}</span>
            </div>
            {pending.map(req => (
              <div key={req.id} className={`ct-card ${req.status === 'observada' ? 'observed' : ''}`} onClick={() => openDetail(req)}>
                <div className="ct-card-body">
                  <div className="ct-card-left">
                    <div className="ct-row">
                      <span className="ct-num">{req.numero}</span>
                      <StatusPill status={req.status}/>
                      <span className="ct-type">{TYPE_LABELS[req.type] ?? req.type}</span>
                    </div>
                    <div className="ct-meta">
                      <span><User size={10}/> {req.userName}</span>
                      <span><ImageIcon size={10}/> {req.evidences.length} evidencia{req.evidences.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="ct-card-right">
                    <span className="ct-amt">{formatCurrency(req.approvedAmount || req.totalAmount)}</span>
                  </div>
                </div>
                {req.observations && req.observations.length > 0 && (
                  <div className="ct-obs-preview">
                    <AlertTriangle size={10} style={{ flexShrink:0 }}/>
                    {req.observations[req.observations.length - 1]}
                  </div>
                )}
                <div className="ct-card-footer">
                  <span style={{ fontSize:'.7rem', color:'rgba(240,244,255,.3)' }}>Ver detalle y validar</span>
                  <ChevronRight size={13} style={{ color:'rgba(96,165,250,.4)' }}/>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Historial ── */}
        {!loading && historical.length > 0 && (
          <div className={`fu d2 ${mounted ? 'in' : ''}`}>
            <div className="ct-section-hd">
              <div className="ct-section-dot" style={{ background:'#93c5fd', boxShadow:'0 0 6px rgba(147,197,253,.5)' }}/>
              Historial de Solicitudes
              <span className="ct-section-count">{historical.length}</span>
            </div>
            {historical.map(req => (
              <div key={req.id} className="ct-card historical" onClick={() => openDetail(req)}>
                <div className="ct-card-body">
                  <div className="ct-card-left">
                    <div className="ct-row">
                      <span className="ct-num">{req.numero}</span>
                      <StatusPill status={req.status}/>
                      <span className="ct-type">{TYPE_LABELS[req.type] ?? req.type}</span>
                    </div>
                    <div className="ct-meta">
                      <span><User size={10}/> {req.userName}</span>
                      <span><ImageIcon size={10}/> {req.evidences.length} evidencia{req.evidences.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="ct-card-right">
                    <span className="ct-amt" style={{ opacity:.55 }}>{formatCurrency(req.approvedAmount || req.totalAmount)}</span>
                  </div>
                </div>
                <div className="ct-card-footer">
                  <span style={{ fontSize:'.7rem', color:'rgba(240,244,255,.2)' }}>Ver evidencias</span>
                  <ChevronRight size={13} style={{ color:'rgba(96,165,250,.3)' }}/>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && requests.length === 0 && (
          <div className={`ct-empty fu d1 ${mounted ? 'in' : ''}`}>
            <div className="ct-empty-ico"><CheckCircle size={22}/></div>
            <p>Sin pendientes</p>
            <span>No hay solicitudes por validar</span>
          </div>
        )}
      </div>

      {/* ── DETAIL MODAL ── */}
      <Modal open={modal === 'detail'} onClose={closeModal}>
        {selected && (
          <>
            <div className="m-bar"/>
            <div className="m-head">
              <div className="m-ico" style={{ background:'rgba(59,130,246,.12)', color:'#60a5fa', boxShadow:'0 0 14px rgba(59,130,246,.15)' }}><Eye size={15}/></div>
              <div>
                <div className="m-title">Detalle · {selected.numero}</div>
                <div className="m-sub">{selected.userName} · {TYPE_LABELS[selected.type] ?? selected.type}</div>
              </div>
              <StatusPill status={selected.status}/>
            </div>

            <div className="m-body">
              <div className="m-amt-grid">
                <div className="m-amt-cell">
                  <span className="m-amt-lbl">Solicitado</span>
                  <span className="m-amt-val dim">{formatCurrency(selected.totalAmount)}</span>
                </div>
                <div className="m-amt-cell blue">
                  <span className="m-amt-lbl">Aprobado</span>
                  <span className="m-amt-val blue">{formatCurrency(selected.approvedAmount || selected.totalAmount)}</span>
                </div>
              </div>

              <div className="m-sec-title">
                <ImageIcon size={12}/>
                Evidencias ({selected.evidences.length}) — clic para ampliar
              </div>
              <EvidenceGallery
                evidences={selected.evidences}
                userName={selected.userName}
                onLightbox={(url, type) => setLightbox({ url, type })}
              />

              {selected.observations && selected.observations.length > 0 && (
                <>
                  <div className="m-sec-title" style={{ marginTop:'1rem' }}>
                    <AlertTriangle size={12}/> Observaciones previas
                  </div>
                  {selected.observations.map((obs, i) => (
                    <div key={i} className="m-obs-item"><span>›</span> {obs}</div>
                  ))}
                </>
              )}
            </div>

            {['comprobante_subido','factura_subida','observada'].includes(selected.status) && (
              <div className="m-footer">
                <button className="m-btn red" onClick={() => { closeModal(); setModal('observe'); }} disabled={saving}>
                  <AlertTriangle size={13}/> Observar
                </button>
                {(() => {
                  const { ok, reason } = canValidate(selected);
                  return (
                    <button
                      className="m-btn blue"
                      onClick={handleValidate}
                      disabled={saving || !ok}
                      title={!ok ? reason : ''}
                      style={!ok ? { opacity: .35, cursor: 'not-allowed', filter: 'none' } : {}}
                    >
                      <CheckCircle size={13}/>
                      {saving ? 'Validando…' : ok ? 'Validar' : 'Incompleto'}
                    </button>
                  );
                })()}
              </div>
            )}

            {['validada','liquidada','rechazada'].includes(selected.status) && (
              <div className="m-footer">
                <button className="m-btn ghost" onClick={closeModal} style={{ flex:'unset', minWidth:120 }}>
                  Cerrar
                </button>
              </div>
            )}
          </>
        )}
      </Modal>

      {/* ── OBSERVE MODAL ── */}
      <Modal open={modal === 'observe'} onClose={closeModal}>
        <div className="m-bar" style={{ background:'linear-gradient(90deg,transparent,#ef4444,#f87171,transparent)' }}/>
        <div className="m-head">
          <div className="m-ico" style={{ background:'rgba(239,68,68,.12)', color:'#f87171', boxShadow:'0 0 14px rgba(239,68,68,.15)' }}><AlertTriangle size={15}/></div>
          <div><div className="m-title">Agregar Observación</div><div className="m-sub">{selected?.numero}</div></div>
        </div>
        <div className="m-body">
          <div className="m-field">
            <label className="m-lbl">Describe el problema encontrado</label>
            <textarea
              className="m-input m-ta" rows={4}
              value={obsText} onChange={e => setObsText(e.target.value)}
              placeholder="Ej: La factura no tiene NCF válido..."
            />
          </div>
          <div className="m-note"><AlertTriangle size={11}/> Se notificará al técnico con el detalle.</div>
        </div>
        <div className="m-footer">
          <button className="m-btn ghost" onClick={closeModal} disabled={saving}>Cancelar</button>
          <button className="m-btn red" onClick={handleObserve} disabled={!obsText.trim() || saving}>
            <AlertTriangle size={13}/> {saving ? 'Enviando…' : 'Enviar Observación'}
          </button>
        </div>
      </Modal>

      {lightbox && <Lightbox url={lightbox.url} type={lightbox.type} onClose={() => setLightbox(null)}/>}
    </AppShell>
  );
}

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Outfit:wght@300;400;500;600&display=swap');

.ct-page {
  font-family: 'Outfit', sans-serif;
  padding: 1.5rem;
  max-width: 860px;
  margin: 0 auto;
  padding-bottom: 5rem;

  /* ── Blue/Red palette from login ── */
  --ink:  #04080f;
  --ink2: #060c18;
  --ink3: #0a1120;
  --ink4: #0e1828;
  --blue: #3b82f6;
  --blue2: #60a5fa;
  --blue3: #93c5fd;
  --red:  #ef4444;
  --red2: #f87171;
  --w:    rgba(240,244,255,1);
  --w7:   rgba(240,244,255,.70);
  --w4:   rgba(240,244,255,.40);
  --w2:   rgba(240,244,255,.20);
  --w08:  rgba(240,244,255,.08);
  --blue-dim:    rgba(59,130,246,.10);
  --blue-glow:   rgba(59,130,246,.22);
  --blue-border: rgba(59,130,246,.35);
  --red-dim:     rgba(239,68,68,.10);
  --red-border:  rgba(239,68,68,.30);
}

@media(min-width:768px){ .ct-page { padding: 2rem 2.5rem 3rem; } }

/* Top accent bar — identical gradient to login right-panel bar */
.ct-top-bar {
  height: 2px;
  background: linear-gradient(90deg, transparent 0%, var(--blue) 30%, var(--red) 70%, transparent 100%);
  opacity: .75;
  border-radius: 99px;
  margin-bottom: 1.75rem;
}

/* Eyebrow */
.ct-eyebrow {
  font-size: .66rem; font-weight: 700; letter-spacing: .18em;
  text-transform: uppercase; color: var(--blue2);
  display: flex; align-items: center; gap: .5rem; margin-bottom: .4rem;
}
.ct-eyebrow::before {
  content: ''; width: 18px; height: 1px;
  background: var(--blue2); opacity: .55; display: block;
}

/* Title */
.ct-title {
  font-family: 'Playfair Display', serif;
  font-size: 1.85rem; font-weight: 500;
  color: var(--w); letter-spacing: -.01em;
  line-height: 1.15; margin-bottom: .3rem;
}
.ct-title em {
  font-style: italic;
  background: linear-gradient(125deg, var(--blue2) 20%, var(--blue3) 60%, var(--red2) 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
.ct-sub { font-size: .78rem; color: var(--w4); font-weight: 300; margin-bottom: 1.5rem; }

/* Stats */
.ct-stats { display: grid; grid-template-columns: repeat(3,1fr); gap: .75rem; margin-bottom: 1.75rem; }
.ct-stat {
  background: var(--ink3); border: 1px solid var(--w08);
  border-radius: 14px; padding: 1rem .875rem;
  transition: border-color .2s, transform .3s cubic-bezier(.22,1,.36,1), box-shadow .3s;
}
.ct-stat:hover {
  border-color: var(--blue-border);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px var(--blue-glow);
}
.ct-stat-ico {
  width: 30px; height: 30px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: .6rem;
}
.ct-stat-val {
  font-family: 'Playfair Display', serif;
  font-size: 1.55rem; font-weight: 600;
  display: block; line-height: 1; margin-bottom: .2rem;
}
.ct-stat-lbl { font-size: .6rem; color: var(--w4); text-transform: uppercase; letter-spacing: .09em; }

/* Section headers */
.ct-section-hd {
  display: flex; align-items: center; gap: .5rem;
  font-size: .7rem; font-weight: 700; color: var(--w4);
  text-transform: uppercase; letter-spacing: .1em;
  margin-bottom: .75rem; margin-top: 1.25rem;
}
.ct-section-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.ct-section-count {
  margin-left: auto;
  background: var(--blue-dim); border: 1px solid rgba(59,130,246,.15);
  color: var(--blue2); border-radius: 99px;
  padding: .1rem .45rem; font-size: .65rem;
}

/* Cards */
.ct-card {
  background: var(--ink3); border: 1px solid var(--w08);
  border-radius: 14px; padding: 1rem 1.1rem; margin-bottom: .6rem;
  cursor: pointer;
  transition: border-color .2s, transform .25s cubic-bezier(.22,1,.36,1), box-shadow .25s;
}
.ct-card:hover {
  border-color: var(--blue-border);
  transform: translateX(2px);
  box-shadow: 0 4px 20px var(--blue-glow);
}
.ct-card.observed { border-color: var(--red-border); }
.ct-card.observed:hover { border-color: rgba(239,68,68,.45); box-shadow: 0 4px 20px rgba(239,68,68,.15); }
.ct-card.historical { opacity: .65; }
.ct-card.historical:hover { opacity: 1; }
.ct-card-body { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: .6rem; }
.ct-card-left { flex: 1; min-width: 0; }
.ct-row { display: flex; align-items: center; gap: .45rem; flex-wrap: wrap; margin-bottom: .3rem; }
.ct-num { font-size: .9rem; font-weight: 700; color: var(--w); }
.ct-type { font-size: .68rem; color: var(--w4); font-weight: 300; }
.ct-meta { display: flex; gap: .75rem; font-size: .7rem; color: var(--w4); align-items: center; }
.ct-meta span { display: flex; align-items: center; gap: .3rem; }
.ct-card-right { text-align: right; flex-shrink: 0; }
.ct-amt {
  font-family: 'Playfair Display', serif;
  font-size: 1.4rem; font-weight: 600;
  color: var(--blue2); display: block; line-height: 1;
}
.ct-card-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding-top: .5rem; border-top: 1px solid var(--w08);
}
.ct-obs-preview {
  font-size: .72rem; color: var(--red2);
  background: var(--red-dim); border: 1px solid var(--red-border);
  border-radius: 8px; padding: .45rem .75rem;
  display: flex; align-items: flex-start; gap: .4rem;
  margin-top: .5rem; margin-bottom: .5rem;
}

/* Empty state */
.ct-empty {
  background: var(--ink3); border: 1px solid var(--w08);
  border-radius: 16px; padding: 3rem 1.5rem; text-align: center;
}
.ct-empty-ico {
  width: 48px; height: 48px; border-radius: 12px;
  background: var(--blue-dim); border: 1px solid var(--blue-border);
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto .875rem; color: var(--blue2);
  box-shadow: 0 0 20px var(--blue-glow);
}
.ct-empty p { font-size: .9rem; font-weight: 600; color: var(--w7); margin-bottom: .25rem; }
.ct-empty span { font-size: .75rem; color: var(--w4); font-weight: 300; }

/* Fade-up animation */
.fu { opacity: 0; transform: translateY(14px); transition: opacity .5s cubic-bezier(.22,1,.36,1), transform .5s cubic-bezier(.22,1,.36,1); }
.fu.in { opacity: 1; transform: none; }
.d1 { transition-delay: .07s; }
.d2 { transition-delay: .14s; }

/* ── Modal ── */
.m-bar {
  height: 2px;
  background: linear-gradient(90deg, transparent 0%, var(--blue) 30%, var(--red) 70%, transparent 100%);
  opacity: .75;
}
.m-head {
  display: flex; align-items: center; gap: .75rem;
  padding: .875rem 1.1rem;
  border-bottom: 1px solid rgba(59,130,246,.08);
}
.m-ico {
  width: 34px; height: 34px; border-radius: 9px;
  flex-shrink: 0; display: flex; align-items: center; justify-content: center;
}
.m-title {
  font-family: 'Playfair Display', serif;
  font-size: 1rem; font-weight: 500; color: var(--w); flex: 1;
}
.m-sub { font-size: .7rem; color: var(--w4); font-weight: 300; margin-top: .1rem; }
.m-body { padding: .875rem 1.1rem; }

/* Amount grid */
.m-amt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: .6rem; margin-bottom: .875rem; }
.m-amt-cell {
  background: var(--ink3); border: 1px solid rgba(240,244,255,.07);
  border-radius: 10px; padding: .75rem .875rem;
}
.m-amt-cell.blue { border-color: rgba(59,130,246,.2); background: rgba(59,130,246,.05); }
.m-amt-lbl {
  font-size: .62rem; font-weight: 700; letter-spacing: .09em;
  text-transform: uppercase; color: var(--w4);
  display: block; margin-bottom: .3rem;
}
.m-amt-val {
  font-family: 'Playfair Display', serif;
  font-size: 1.35rem; font-weight: 600; display: block; line-height: 1;
}
.m-amt-val.dim  { color: rgba(240,244,255,.45); }
.m-amt-val.blue { color: var(--blue2); text-shadow: 0 0 20px var(--blue-glow); }

/* Section title */
.m-sec-title {
  font-size: .65rem; font-weight: 700; letter-spacing: .12em;
  text-transform: uppercase; color: var(--w4);
  margin-bottom: .65rem; margin-top: .875rem;
  display: flex; align-items: center; gap: .4rem;
}

/* Observation items */
.m-obs-item {
  font-size: .78rem; color: var(--red2);
  padding: .45rem .75rem;
  background: var(--red-dim);
  border-left: 2px solid var(--red-border);
  border-radius: 0 8px 8px 0; margin-bottom: .4rem;
}

/* Form */
.m-field { display: flex; flex-direction: column; gap: .35rem; }
.m-lbl { font-size: .65rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--w4); }
.m-input {
  background: var(--ink3); border: 1px solid var(--w08);
  border-radius: 10px; padding: .65rem .875rem;
  font-size: .875rem; color: var(--w);
  font-family: 'Outfit', sans-serif; outline: none; width: 100%;
  transition: border-color .25s cubic-bezier(.22,1,.36,1), box-shadow .25s;
  -webkit-appearance: none;
}
.m-input:focus {
  border-color: var(--blue-border);
  box-shadow: 0 0 0 3px var(--blue-dim);
}
.m-ta { resize: none; line-height: 1.5; }
.m-note {
  display: flex; align-items: flex-start; gap: .45rem;
  font-size: .72rem; color: var(--w4); line-height: 1.4; margin-top: .5rem;
}

/* Footer */
.m-footer {
  display: flex; gap: .6rem;
  padding: .875rem 1.1rem;
  border-top: 1px solid rgba(240,244,255,.06);
}
.m-btn {
  flex: 1; border-radius: 10px; padding: .7rem;
  font-family: 'Outfit', sans-serif; font-size: .82rem; font-weight: 600;
  cursor: pointer; display: flex; align-items: center; justify-content: center; gap: .4rem;
  transition: all .2s cubic-bezier(.22,1,.36,1);
}
.m-btn.ghost {
  background: var(--ink3); border: 1px solid var(--w08); color: var(--w4);
}
.m-btn.ghost:hover { border-color: rgba(240,244,255,.18); color: var(--w7); }

/* Blue validate button — mirrors login's gradient button */
.m-btn.blue {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 50%, #1e40af 100%);
  color: #fff; border: none;
  box-shadow: 0 4px 20px rgba(59,130,246,.28), 0 1px 0 rgba(255,255,255,.10) inset;
}
.m-btn.blue:not(:disabled):hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
  box-shadow: 0 8px 32px rgba(59,130,246,.38);
}

/* Red observe button */
.m-btn.red {
  background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
  color: #fff; border: none;
  box-shadow: 0 4px 20px rgba(239,68,68,.22), 0 1px 0 rgba(255,255,255,.08) inset;
}
.m-btn.red:not(:disabled):hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
  box-shadow: 0 8px 32px rgba(239,68,68,.32);
}
.m-btn:disabled { opacity: .35; cursor: not-allowed; transform: none !important; }
`;