'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { AppShell } from '@/components/app-shell';
import { OCRUpload } from '@/components/ocr-upload';
import {
  ArrowLeft, FileText, Image as ImageIcon,
  AlertCircle, History, ExternalLink, MessageSquare,
} from 'lucide-react';
import {
  getRequestFirestore,
  updateRequestFirestore,
  addEvidenceToRequestFirestore,
  getAuditLogsFirestore,
  notifyRoleFirestore,
} from '@/lib/firestore-service';
import { uploadImageToCloudinary } from '@/lib/cloudinary';
import { formatCurrency } from '@/lib/ocr';
import type { Request, Evidence, AuditLog } from '@/lib/types';
import { toast } from 'sonner';

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

function StatusPill({ status, large }: { status: string; large?: boolean }) {
  const cfg = STATUS_MAP[status] ?? { label: status, color: '#8b8ea0' };
  return (
    <span style={{
      fontSize: large ? '0.72rem' : '0.62rem', fontWeight: 600,
      letterSpacing: '0.08em', textTransform: 'uppercase' as const,
      color: cfg.color, background: `${cfg.color}18`,
      border: `1px solid ${cfg.color}35`,
      padding: large ? '0.3rem 0.75rem' : '0.2rem 0.55rem',
      borderRadius: '99px', display: 'inline-block', whiteSpace: 'nowrap' as const,
    }}>{cfg.label}</span>
  );
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,.9)',
      backdropFilter:'blur(8px)', zIndex:200,
      display:'flex', alignItems:'center', justifyContent:'center', padding:'1.5rem',
    }}>
      <img src={url} alt="Evidencia" onClick={e => e.stopPropagation()} style={{
        maxWidth:'100%', maxHeight:'90vh', borderRadius:12,
        boxShadow:'0 32px 80px rgba(0,0,0,.9)',
        border:'1px solid rgba(240,244,255,.1)',
      }} />
      <button onClick={onClose} style={{
        position:'fixed', top:20, right:20,
        background:'rgba(240,244,255,.1)', border:'1px solid rgba(240,244,255,.2)',
        borderRadius:8, color:'#f0f4ff', width:36, height:36,
        display:'flex', alignItems:'center', justifyContent:'center',
        cursor:'pointer', fontSize:'1.1rem',
      }}>✕</button>
    </div>
  );
}

function RequestDetailContent({ id }: { id: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const [request, setRequest]         = useState<Request | null>(null);
  const [auditLogs, setAuditLogs]     = useState<AuditLog[]>([]);
  const [showUpload, setShowUpload]   = useState(false);
  const [mounted, setMounted]         = useState(false);
  const [loading, setLoading]         = useState(true);
  const [uploading, setUploading]     = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [req, logs] = await Promise.all([
          getRequestFirestore(id),
          getAuditLogsFirestore(id),
        ]);
        if (req) { setRequest(req); setAuditLogs(logs); }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const canUploadFactura = request &&
    ['aprobada', 'transferida', 'comprobante_subido'].includes(request.status);
  const hasFactura = request?.evidences.some(e => e.type === 'factura');

  // ── Detectar si hay motivo de monto menor en este request ──
  const tieneMontoMenor = !!(request as any)?.montoMenorMotivo;
  const motivoMenor     = (request as any)?.montoMenorMotivo as string | undefined;
  const cantidadMenor   = (request as any)?.montoMenorCantidad as number | undefined;

  const handleEvidenceUpload = async (evidence: Evidence) => {
    if (!request || !user) return;
    setUploading(true);
    try {
      let finalUrl = evidence.url;
      if ((evidence as any)._file) {
        finalUrl = await uploadImageToCloudinary((evidence as any)._file);
      }
      const updatedEvidence: Evidence = { ...evidence, url: finalUrl, uploadedBy: user.id };
      delete (updatedEvidence as any)._file;

      const updated = await addEvidenceToRequestFirestore(request.id, updatedEvidence, user.id, user.name);
      if (updated) {
        await updateRequestFirestore(request.id, { status: 'factura_subida' }, user.id, user.name);
        await notifyRoleFirestore('contabilidad', {
          title: `🧾 Factura subida — ${request.numero}`,
          message: `${user.name} subió la factura fiscal. Lista para validación.`,
          type: 'info',
        });
        await notifyRoleFirestore('pagos', {
          title: `🧾 Factura subida — ${request.numero}`,
          message: `${user.name} subió la factura fiscal de ${request.numero}.`,
          type: 'info',
        });
        setRequest({ ...updated, status: 'factura_subida' });
        const freshLogs = await getAuditLogsFirestore(id);
        setAuditLogs(freshLogs);
        setShowUpload(false);
        toast.success('✅ Factura subida correctamente');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al subir la factura');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <AppShell requiredRole="tecnico">
        <style>{`
          .rd-sk{background:linear-gradient(90deg,#0a1120 25%,#0e1828 50%,#0a1120 75%);background-size:200% 100%;animation:rd-sh 1.5s infinite;border-radius:8px}
          @keyframes rd-sh{0%{background-position:200% 0}100%{background-position:-200% 0}}
        `}</style>
        <div style={{ padding:'1.5rem', maxWidth:760, margin:'0 auto' }}>
          <div style={{ display:'flex', gap:'.75rem', marginBottom:'1.5rem', alignItems:'center' }}>
            <div className="rd-sk" style={{ width:36, height:36, borderRadius:9 }} />
            <div style={{ flex:1 }}>
              <div className="rd-sk" style={{ width:'35%', height:'1.1rem', marginBottom:'.3rem' }} />
              <div className="rd-sk" style={{ width:'20%', height:'.72rem' }} />
            </div>
          </div>
          <div className="rd-sk" style={{ height:160, borderRadius:16, marginBottom:'1rem' }} />
          <div className="rd-sk" style={{ height:200, borderRadius:16, marginBottom:'1rem' }} />
          <div className="rd-sk" style={{ height:240, borderRadius:16 }} />
        </div>
      </AppShell>
    );
  }

  if (!request) {
    return (
      <AppShell requiredRole="tecnico">
        <div style={{ padding:'2rem', color:'rgba(240,244,255,0.4)', fontFamily:'Outfit,sans-serif' }}>
          Solicitud no encontrada
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell requiredRole="tecnico">
      <style>{PAGE_STYLES}</style>
      <div className="rd-page">
        <div className="rd-topbar" />

        {/* Nav */}
        <div className={`rd-nav fu ${mounted ? 'in' : ''}`}>
          <button className="rd-back" onClick={() => router.back()}><ArrowLeft size={16} /></button>
          <div className="rd-nav-info">
            <span className="rd-nav-num">{request.numero}</span>
            <span className="rd-nav-type">{request.type}</span>
          </div>
          <StatusPill status={request.status} large />
        </div>

        {/* Hero */}
        <div className={`rd-hero fu d1 ${mounted ? 'in' : ''}`}>
          <div className="rd-hero-top">
            <div>
              <div className="rd-hero-lbl">Monto Solicitado</div>
              <div className="rd-hero-amount">{formatCurrency(request.totalAmount)}</div>
            </div>
            {request.approvedAmount && request.approvedAmount !== request.totalAmount && (
              <div style={{ textAlign:'right' }}>
                <div className="rd-hero-lbl">Monto Aprobado</div>
                <div className="rd-hero-amount-approved">{formatCurrency(request.approvedAmount)}</div>
              </div>
            )}
          </div>
          <div className="rd-hero-dates">
            <div>
              <div className="rd-date-lbl">Creada</div>
              <div className="rd-date-val">
                {new Date(request.createdAt).toLocaleDateString('es-DO', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
              </div>
            </div>
            <div>
              <div className="rd-date-lbl">Actualizada</div>
              <div className="rd-date-val">
                {new Date(request.updatedAt).toLocaleDateString('es-DO', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
              </div>
            </div>
          </div>
        </div>

        {/* Observaciones */}
        {request.observations && request.observations.length > 0 && (
          <div className={`rd-obs fu d2 ${mounted ? 'in' : ''}`}>
            <div className="rd-obs-hd"><AlertCircle size={15} />Observaciones</div>
            {request.observations.map((obs, i) => (
              <div key={i} className="rd-obs-item">{obs}</div>
            ))}
          </div>
        )}

        {/* ── BANNER MONTO MENOR — visible solo para el técnico si pagos dejó un motivo ── */}
        {tieneMontoMenor && (
          <div className={`rd-monto-menor-banner fu d2 ${mounted ? 'in' : ''}`}>
            <div className="rd-mm-header">
              <div className="rd-mm-ico">
                <MessageSquare size={15} />
              </div>
              <div className="rd-mm-title-wrap">
                <span className="rd-mm-title">⚠️ Monto transferido menor al solicitado</span>
                {cantidadMenor !== undefined && request.totalAmount && (
                  <span className="rd-mm-amounts">
                    Recibiste <strong>{formatCurrency(cantidadMenor)}</strong>
                    {' '}de los{' '}
                    <strong>{formatCurrency(request.approvedAmount ?? request.totalAmount)}</strong> aprobados
                    {' '}·{' '}
                    <span className="rd-mm-diff">
                      diferencia: {formatCurrency((request.approvedAmount ?? request.totalAmount) - cantidadMenor)}
                    </span>
                  </span>
                )}
              </div>
            </div>
            {motivoMenor && (
              <div className="rd-mm-motivo">
                <span className="rd-mm-motivo-lbl">Mensaje del área de Pagos:</span>
                <p className="rd-mm-motivo-text">"{motivoMenor}"</p>
              </div>
            )}
          </div>
        )}

        <div className={`rd-info-banner fu d2 ${mounted ? 'in' : ''}`}>
          <FileText size={14} style={{ flexShrink:0 }} />
          El comprobante de transferencia lo sube el área de <strong style={{ margin:'0 .25rem' }}>Pagos</strong>. Tu responsabilidad es subir la factura fiscal.
        </div>

        {/* Factura */}
        {showUpload ? (
          <div className={`fu d2 ${mounted ? 'in' : ''}`}>
            <OCRUpload type="factura" onUpload={handleEvidenceUpload} onCancel={() => setShowUpload(false)} />
            {uploading && (
              <div style={{ textAlign:'center', padding:'.75rem', fontSize:'.8rem', color:'#60a5fa', fontFamily:'Outfit,sans-serif' }}>
                ☁️ Subiendo a Cloudinary…
              </div>
            )}
          </div>
        ) : hasFactura ? (
          <div className={`rd-factura-done fu d2 ${mounted ? 'in' : ''}`}>
            ✅ Factura fiscal subida correctamente — en revisión por contabilidad
          </div>
        ) : canUploadFactura ? (
          <div className={`rd-factura-banner fu d2 ${mounted ? 'in' : ''}`}>
            <div className="rd-factura-ico"><FileText size={18} /></div>
            <div className="rd-factura-info">
              <div className="rd-factura-title">Subir Factura Fiscal</div>
              <div className="rd-factura-sub">Extracción automática con IA · GPT-4o Vision</div>
            </div>
            <button className="rd-factura-btn" onClick={() => setShowUpload(true)} disabled={uploading}>
              <FileText size={13} /> Subir
            </button>
          </div>
        ) : null}

        {/* Evidencias */}
        {request.evidences.length > 0 && (
          <div className={`rd-card fu d3 ${mounted ? 'in' : ''}`}>
            <div className="rd-card-hd">
              <div className="rd-card-hd-ico"><ImageIcon size={14} /></div>
              <span className="rd-card-title">Evidencias ({request.evidences.length})</span>
            </div>
            <div className="rd-card-body">
              <div className="rd-ev-grid">
                {request.evidences.map(ev => (
                  <div key={ev.id} className="rd-ev-thumb" onClick={() => setLightboxUrl(ev.url)}>
                    <img src={ev.url} alt={ev.type} />
                    <div className="rd-ev-label">
                      <span className="rd-ev-type">{ev.type}</span>
                      <ExternalLink className="rd-ev-expand" />
                    </div>
                    {ev.ocrData && (
                      <div className="rd-ev-ocr">
                        {ev.ocrData.proveedor && <div><b>Prov:</b> {ev.ocrData.proveedor}</div>}
                        {ev.ocrData.total     && <div><b>Total:</b> {formatCurrency(ev.ocrData.total)}</div>}
                        {ev.ocrData.ncf       && <div><b>NCF:</b> {ev.ocrData.ncf}</div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Historial */}
        <div className={`rd-card fu d4 ${mounted ? 'in' : ''}`}>
          <div className="rd-card-hd">
            <div className="rd-card-hd-ico"><History size={14} /></div>
            <span className="rd-card-title">Historial de Actividad</span>
          </div>
          <div className="rd-card-body">
            {auditLogs.length === 0 ? (
              <p style={{ fontSize:'.78rem', color:'rgba(240,244,255,.3)', fontFamily:'Outfit,sans-serif' }}>Sin actividad registrada.</p>
            ) : (
              <div className="rd-timeline">
                {auditLogs.map(log => (
                  <div key={log.id} className="rd-tl-item">
                    <div className="rd-tl-dot"><div className="rd-tl-dot-inner" /></div>
                    <div className="rd-tl-action">{log.action.replace(/_/g, ' ')}</div>
                    <div className="rd-tl-meta">
                      {log.userName} · {new Date(log.timestamp).toLocaleDateString('es-DO', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                    </div>
                    {log.details && <div className="rd-tl-details">{log.details}</div>}
                    {/* Si el log tiene motivo de monto menor lo muestra destacado */}
                    {log.action === 'comprobante_subido' && tieneMontoMenor && motivoMenor && (
                      <div className="rd-tl-motivo">
                        <MessageSquare size={10} style={{ color:'#fb923c', flexShrink:0 }}/>
                        <span>{motivoMenor}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </AppShell>
  );
}

export default function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  return <RequestDetailContent id={resolvedParams.id} />;
}

const PAGE_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Outfit:wght@300;400;500;600&display=swap');

  .rd-page {
    font-family: 'Outfit', sans-serif;
    padding: 1.5rem; max-width: 760px; margin: 0 auto; padding-bottom: 6rem;
    --ink: #04080f; --ink2: #060c18; --ink3: #0a1120; --ink4: #0e1828;
    --blue: #3b82f6; --blue2: #60a5fa; --blue3: #93c5fd;
    --red: #ef4444; --red2: #f87171;
    --w: #f0f4ff; --w70: rgba(240,244,255,.70); --w40: rgba(240,244,255,.40);
    --w20: rgba(240,244,255,.20); --w08: rgba(240,244,255,.08);
    --blue-dim: rgba(59,130,246,.10); --blue-border: rgba(59,130,246,.35);
    background: var(--ink); min-height: 100vh;
  }
  @media(min-width:768px) { .rd-page { padding: 2rem 2.5rem 2.5rem; } }

  .rd-topbar { height:2px; background:linear-gradient(90deg,transparent,var(--blue),var(--red),transparent); opacity:.75; margin-bottom:1.75rem; border-radius:99px; }
  .rd-nav { display:flex; align-items:center; gap:.75rem; margin-bottom:1.5rem; }
  .rd-back { width:36px; height:36px; border-radius:9px; border:1px solid var(--w08); background:var(--ink3); display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--w40); transition:border-color .2s,color .2s; }
  .rd-back:hover { border-color:var(--blue-border); color:var(--blue2); }
  .rd-nav-info { flex:1; }
  .rd-nav-num { font-family:'Playfair Display',serif; font-size:1.1rem; font-weight:500; color:var(--w); display:block; }
  .rd-nav-type { font-size:.72rem; color:var(--w40); text-transform:capitalize; font-weight:300; }

  .rd-hero { background:var(--ink3); border:1px solid var(--w08); border-radius:16px; padding:1.5rem; margin-bottom:1rem; position:relative; overflow:hidden; }
  .rd-hero::before { content:''; position:absolute; top:0; left:0; right:0; height:1px; background:linear-gradient(90deg,transparent,var(--blue),transparent); opacity:.4; }
  .rd-hero-top { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:1.25rem; }
  .rd-hero-lbl { font-size:.67rem; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:var(--w40); margin-bottom:.4rem; }
  .rd-hero-amount { font-family:'Playfair Display',serif; font-size:2.25rem; font-weight:600; color:var(--w); line-height:1; }
  .rd-hero-amount-approved { font-family:'Playfair Display',serif; font-size:1.5rem; font-weight:500; color:var(--blue3); line-height:1; }
  .rd-hero-dates { display:grid; grid-template-columns:1fr 1fr; gap:1rem; padding-top:1.25rem; border-top:1px solid var(--w08); }
  .rd-date-lbl { font-size:.65rem; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--w20); margin-bottom:.3rem; }
  .rd-date-val { font-size:.8rem; color:var(--w70); font-weight:400; }

  .rd-obs { background:rgba(239,68,68,.06); border:1px solid rgba(239,68,68,.2); border-radius:14px; padding:1.1rem 1.25rem; margin-bottom:1rem; }
  .rd-obs-hd { display:flex; align-items:center; gap:.5rem; font-size:.78rem; font-weight:600; color:#ef4444; margin-bottom:.75rem; }
  .rd-obs-item { font-size:.8rem; color:rgba(240,244,255,.6); padding:.3rem 0; display:flex; gap:.5rem; }
  .rd-obs-item::before { content:'›'; color:#ef4444; flex-shrink:0; }

  /* ── Banner Monto Menor ── */
  .rd-monto-menor-banner {
    background: rgba(249,115,22,.07);
    border: 1px solid rgba(249,115,22,.28);
    border-radius: 14px;
    padding: 1rem 1.15rem;
    margin-bottom: 1rem;
    animation: rd-pulse-warn 3s ease infinite;
  }
  @keyframes rd-pulse-warn {
    0%,100% { box-shadow: 0 0 0 0 rgba(249,115,22,0); }
    50%      { box-shadow: 0 0 0 4px rgba(249,115,22,.07); }
  }
  .rd-mm-header { display:flex; align-items:flex-start; gap:.75rem; margin-bottom:.65rem; }
  .rd-mm-ico { width:32px; height:32px; border-radius:8px; background:rgba(249,115,22,.12); border:1px solid rgba(249,115,22,.25); display:flex; align-items:center; justify-content:center; color:#f97316; flex-shrink:0; }
  .rd-mm-title-wrap { flex:1; }
  .rd-mm-title { font-size:.82rem; font-weight:700; color:#fb923c; display:block; margin-bottom:.3rem; }
  .rd-mm-amounts { font-size:.74rem; color:rgba(240,244,255,.5); line-height:1.5; display:block; }
  .rd-mm-amounts strong { color:rgba(240,244,255,.8); }
  .rd-mm-diff { color:#f97316; font-weight:600; }
  .rd-mm-motivo { background:rgba(4,8,15,.5); border:1px solid rgba(249,115,22,.15); border-radius:10px; padding:.75rem .9rem; }
  .rd-mm-motivo-lbl { font-size:.65rem; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:rgba(249,115,22,.6); display:block; margin-bottom:.4rem; }
  .rd-mm-motivo-text { font-size:.82rem; color:rgba(240,244,255,.72); line-height:1.6; margin:0; font-style:italic; }

  .rd-info-banner { background:var(--blue-dim); border:1px solid var(--blue-border); border-radius:12px; padding:.8rem 1.1rem; margin-bottom:1rem; display:flex; align-items:center; gap:.6rem; font-size:.75rem; color:var(--blue3); }

  .rd-factura-banner { background:var(--blue-dim); border:1px solid var(--blue-border); border-radius:14px; padding:1.1rem 1.25rem; margin-bottom:1rem; display:flex; align-items:center; gap:1rem; }
  .rd-factura-ico { width:42px; height:42px; border-radius:10px; background:rgba(59,130,246,.15); border:1px solid var(--blue-border); display:flex; align-items:center; justify-content:center; color:var(--blue2); flex-shrink:0; }
  .rd-factura-info { flex:1; }
  .rd-factura-title { font-size:.9rem; font-weight:600; color:var(--w); margin-bottom:.2rem; }
  .rd-factura-sub { font-size:.72rem; color:var(--w40); }
  .rd-factura-btn { background:linear-gradient(135deg,var(--blue),#1d4ed8); color:#fff; border:none; border-radius:10px; padding:.6rem 1.1rem; font-family:'Outfit',sans-serif; font-size:.8rem; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:.4rem; flex-shrink:0; transition:filter .2s,transform .2s; }
  .rd-factura-btn:hover { filter:brightness(1.08); transform:translateY(-1px); }
  .rd-factura-btn:disabled { opacity:.4; cursor:not-allowed; transform:none; }
  .rd-factura-done { background:rgba(34,197,94,.06); border:1px solid rgba(34,197,94,.2); border-radius:14px; padding:.875rem 1.25rem; margin-bottom:1rem; display:flex; align-items:center; gap:.75rem; font-size:.8rem; color:rgba(34,197,94,.85); font-weight:500; }

  .rd-card { background:var(--ink3); border:1px solid var(--w08); border-radius:16px; overflow:hidden; margin-bottom:1rem; }
  .rd-card-hd { padding:1rem 1.25rem; border-bottom:1px solid var(--w08); display:flex; align-items:center; gap:.6rem; }
  .rd-card-hd-ico { width:28px; height:28px; border-radius:7px; background:var(--blue-dim); border:1px solid var(--blue-border); display:flex; align-items:center; justify-content:center; color:var(--blue2); flex-shrink:0; }
  .rd-card-title { font-size:.875rem; font-weight:600; color:var(--w); }
  .rd-card-body { padding:1.1rem 1.25rem; }

  .rd-ev-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:.75rem; }
  .rd-ev-thumb { position:relative; border-radius:10px; overflow:hidden; border:1px solid var(--w08); cursor:pointer; transition:transform .2s,border-color .2s; }
  .rd-ev-thumb:hover { transform:scale(1.02); border-color:var(--blue-border); }
  .rd-ev-thumb img { width:100%; height:110px; object-fit:cover; display:block; }
  .rd-ev-label { position:absolute; bottom:0; left:0; right:0; background:linear-gradient(transparent,rgba(0,0,0,.75)); padding:.4rem .55rem; display:flex; align-items:center; justify-content:space-between; }
  .rd-ev-type { font-size:.62rem; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:rgba(240,244,255,.85); }
  .rd-ev-expand { color:rgba(240,244,255,.5); width:12px; height:12px; }
  .rd-ev-ocr { padding:.6rem .75rem; background:rgba(10,17,32,.9); }
  .rd-ev-ocr div { font-size:.68rem; color:rgba(240,244,255,.4); line-height:1.5; }
  .rd-ev-ocr b { color:rgba(240,244,255,.65); font-weight:600; }

  .rd-timeline { position:relative; padding-left:1.5rem; }
  .rd-timeline::before { content:''; position:absolute; left:7px; top:8px; bottom:0; width:1px; background:var(--w08); }
  .rd-tl-item { position:relative; padding-bottom:1.25rem; }
  .rd-tl-item:last-child { padding-bottom:0; }
  .rd-tl-dot { position:absolute; left:-1.5rem; top:4px; width:15px; height:15px; border-radius:50%; background:var(--blue-dim); border:2px solid var(--blue-border); display:flex; align-items:center; justify-content:center; }
  .rd-tl-dot-inner { width:5px; height:5px; border-radius:50%; background:var(--blue2); }
  .rd-tl-action { font-size:.8rem; font-weight:600; color:var(--w); text-transform:capitalize; margin-bottom:.2rem; }
  .rd-tl-meta { font-size:.68rem; color:var(--w40); }
  .rd-tl-details { font-size:.72rem; color:var(--w20); margin-top:.2rem; }
  .rd-tl-motivo { display:flex; align-items:flex-start; gap:.35rem; font-size:.72rem; color:rgba(251,146,60,.65); line-height:1.4; margin-top:.35rem; font-style:italic; background:rgba(249,115,22,.06); border:1px solid rgba(249,115,22,.15); border-radius:7px; padding:.4rem .6rem; }

  .fu{opacity:0;transform:translateY(12px);transition:opacity .5s cubic-bezier(.22,1,.36,1),transform .5s cubic-bezier(.22,1,.36,1)}
  .fu.in{opacity:1;transform:none}
  .d1{transition-delay:.06s}.d2{transition-delay:.12s}.d3{transition-delay:.18s}.d4{transition-delay:.24s}
`;