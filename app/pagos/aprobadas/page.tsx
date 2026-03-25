'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { AppShell } from '@/components/app-shell';
import { OCRUpload } from '@/components/ocr-upload';
import {
  CheckCircle, Send, Upload, User, Calendar,
  FileCheck, AlertCircle, ChevronRight, AlertTriangle, MessageSquare,
} from 'lucide-react';
import {
  getRequestsByStatusFirestore,
  updateRequestFirestore,
  addEvidenceToRequestFirestore,
} from '@/lib/firestore-service';
import { uploadImageToCloudinary } from '@/lib/cloudinary';
import { notifyUser, notifyRole } from '@/lib/notify';
import { formatCurrency } from '@/lib/ocr';
import type { Request, Evidence } from '@/lib/types';
import { toast } from 'sonner';

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    aprobada:           { label: 'Aprobada',    color: '#22c55e' },
    transferida:        { label: 'Transferida', color: '#60a5fa' },
    comprobante_subido: { label: 'Comprobante', color: '#a78bfa' },
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

function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.72)',backdropFilter:'blur(6px)',zIndex:100 }}/>
      <div style={{
        position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:101,
        width:'min(520px,calc(100vw - 2rem))',background:'#0a1120',
        border:'1px solid rgba(96,165,250,.12)',borderRadius:18,overflow:'hidden',
        boxShadow:'0 32px 80px rgba(0,0,0,.8)',
        animation:'m-in .25s cubic-bezier(.22,1,.36,1)',
        maxHeight:'90vh', overflowY:'auto',
      }}>
        {children}
      </div>
      <style>{`@keyframes m-in{from{opacity:0;transform:translate(-50%,-54%) scale(.96)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}`}</style>
    </>
  );
}

export default function AprobadasPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<Request[]>([]);
  const [selected, setSelected] = useState<Request | null>(null);
  const [modal, setModal]       = useState<'transfer'|'upload'|null>(null);
  const [mounted, setMounted]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  const [montoAlerta, setMontoAlerta] = useState<{
    montoComprobante: number;
    montoSolicitado:  number;
    evidencePending:  Evidence;
  } | null>(null);

  // ── Motivo de monto menor ──
  const [motivoMenor, setMotivoMenor] = useState('');

  useEffect(() => { setMounted(true); load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const r = await getRequestsByStatusFirestore(['aprobada','transferida','comprobante_subido']);
      setRequests(r.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openModal  = (req: Request, m: typeof modal) => { setSelected(req); setModal(m); };
  const closeModal = () => { setModal(null); setMontoAlerta(null); setMotivoMenor(''); };

  const handleTransfer = async () => {
    if (!selected || !user || saving) return;
    setSaving(true);
    try {
      await updateRequestFirestore(selected.id, {
        status: 'transferida',
        transferredAt: new Date().toISOString(), transferredBy: user.id,
      }, user.id, user.name);
      await notifyUser(selected.userId, {
        title: `💰 Transferencia enviada — ${selected.numero}`,
        message: `Recibiste ${formatCurrency(selected.approvedAmount || selected.totalAmount)}. Recuerda subir tu factura fiscal.`,
        type: 'success',
        data: { requestId: selected.id, url: `/tecnico` },
      });
      toast.success(`Transferencia registrada para ${selected.numero}`);
      setModal('upload');
    } catch (err) {
      console.error(err); toast.error('Error al registrar transferencia');
    } finally {
      setSaving(false);
    }
  };

  const doUpload = async (evidence: Evidence, motivo?: string) => {
    if (!selected || !user) return;
    setSaving(true);
    try {
      let finalUrl = evidence.url;
      if ((evidence as any)._file) {
        finalUrl = await uploadImageToCloudinary((evidence as any)._file);
      }
      const evidenceToSave = { ...evidence, url: finalUrl, uploadedBy: user.id };
      delete (evidenceToSave as any)._file;

      await addEvidenceToRequestFirestore(selected.id, evidenceToSave, user.id, user.name);

      // Si hay motivo de monto menor, guardarlo en el request para que el técnico lo vea
      const updatePayload: Record<string, any> = { status: 'comprobante_subido' };
      if (motivo && motivo.trim()) {
        updatePayload.montoMenorMotivo = motivo.trim();
        updatePayload.montoMenorCantidad = montoAlerta?.montoComprobante ?? null;
      }

      await updateRequestFirestore(selected.id, updatePayload, user.id, user.name);

      await notifyRole('contabilidad', {
        title: `📄 Comprobante subido — ${selected.numero}`,
        message: `Se subió el comprobante de ${selected.userName}.`,
        type: 'info',
        data: { requestId: selected.id },
      });

      // Notificar al técnico si hay motivo de diferencia
      if (motivo && motivo.trim()) {
        await notifyUser(selected.userId, {
          title: `⚠️ Monto transferido menor — ${selected.numero}`,
          message: `El monto transferido (${formatCurrency(montoAlerta?.montoComprobante ?? 0)}) es menor al solicitado. Motivo: ${motivo.trim()}`,
          type: 'warning',
          data: { requestId: selected.id, url: `/tecnico/solicitudes/${selected.id}` },
        });
      }

      toast.success('Comprobante subido y validado correctamente');
      closeModal(); setSelected(null); await load();
    } catch (err) {
      console.error(err); toast.error('Error al subir comprobante');
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (evidence: Evidence) => {
    if (!selected || !user || saving) return;
    const montoSolicitado  = selected.approvedAmount ?? selected.totalAmount;
    const montoComprobante = evidence.ocrData?.total ?? null;
    if (montoComprobante !== null && montoComprobante !== undefined &&
        montoSolicitado  !== null && montoSolicitado  !== undefined &&
        montoComprobante < montoSolicitado) {
      setMontoAlerta({ montoComprobante, montoSolicitado, evidencePending: evidence });
      setMotivoMenor('');
      return;
    }
    await doUpload(evidence);
  };

  const handleConfirmarMontoMenor = async () => {
    if (!montoAlerta) return;
    const evidence = montoAlerta.evidencePending;
    await doUpload(evidence, motivoMenor);
    setMontoAlerta(null);
  };

  const byStatus     = (s: string) => requests.filter(r => r.status === s);
  const aprobadas    = byStatus('aprobada');
  const transferidas = byStatus('transferida');
  const conComp      = byStatus('comprobante_subido');

  return (
    <AppShell requiredRole="pagos">
      <style>{STYLES}</style>
      <div className="ap-page">
        <div className="ap-top-bar"/>

        <div className={`fu ${mounted ? 'in' : ''}`}>
          <div className="ap-eyebrow">Área de Pagos</div>
          <h1 className="ap-title">Solicitudes <em>Aprobadas</em></h1>
          <p className="ap-sub">Gestiona transferencias y comprobantes pendientes</p>
        </div>

        <div className={`ap-stats fu d1 ${mounted ? 'in' : ''}`}>
          {[
            { val: loading ? '…' : aprobadas.length,    lbl: 'Por transferir',  color: '#22c55e' },
            { val: loading ? '…' : transferidas.length, lbl: 'Sin comprobante', color: '#60a5fa' },
            { val: loading ? '…' : conComp.length,      lbl: 'Con comprobante', color: '#a78bfa' },
          ].map((s, i) => (
            <div key={i} className="ap-stat">
              <span className="ap-stat-val" style={{ color: s.color }}>{s.val}</span>
              <span className="ap-stat-lbl">{s.lbl}</span>
            </div>
          ))}
        </div>

        {/* Por Transferir */}
        {!loading && aprobadas.length > 0 && (
          <div className={`fu d1 ${mounted ? 'in' : ''}`}>
            <div className="ap-section-hd">
              <div className="ap-section-dot" style={{ background:'#22c55e' }}/>
              <span>Por Transferir</span>
              <span className="ap-section-count">{aprobadas.length}</span>
            </div>
            {aprobadas.map(req => (
              <div key={req.id} className="ap-card">
                <div className="ap-card-top">
                  <div className="ap-card-left">
                    <div className="ap-row">
                      <span className="ap-num">{req.numero}</span>
                      <StatusPill status={req.status}/>
                    </div>
                    <div className="ap-meta">
                      <span><User size={10}/> {req.userName}</span>
                      <span><Calendar size={10}/> {new Date(req.approvedAt||req.updatedAt).toLocaleDateString('es-DO',{day:'numeric',month:'short'})}</span>
                    </div>
                  </div>
                  <div className="ap-card-right">
                    <span className="ap-amt" style={{ color:'#22c55e' }}>{formatCurrency(req.approvedAmount||req.totalAmount)}</span>
                    <span className="ap-amt-lbl">aprobado</span>
                  </div>
                </div>
                <button className="ap-action-btn blue" onClick={() => openModal(req,'transfer')}>
                  <Send size={13}/> Registrar Transferencia <ChevronRight size={12} style={{ marginLeft:'auto' }}/>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Transferidas — Sin Comprobante */}
        {!loading && transferidas.length > 0 && (
          <div className={`fu d2 ${mounted ? 'in' : ''}`}>
            <div className="ap-section-hd">
              <div className="ap-section-dot" style={{ background:'#60a5fa' }}/>
              <span>Transferidas — Sin Comprobante</span>
              <span className="ap-section-count">{transferidas.length}</span>
            </div>
            {transferidas.map(req => (
              <div key={req.id} className="ap-card">
                <div className="ap-card-top">
                  <div className="ap-card-left">
                    <div className="ap-row">
                      <span className="ap-num">{req.numero}</span>
                      <StatusPill status={req.status}/>
                    </div>
                    <div className="ap-meta"><span><User size={10}/> {req.userName}</span></div>
                  </div>
                  <div className="ap-card-right">
                    <span className="ap-amt">{formatCurrency(req.approvedAmount||req.totalAmount)}</span>
                  </div>
                </div>
                <button className="ap-action-btn outline" onClick={() => openModal(req,'upload')}>
                  <Upload size={13}/> Subir Comprobante <ChevronRight size={12} style={{ marginLeft:'auto' }}/>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Con Comprobante */}
        {!loading && conComp.length > 0 && (
          <div className={`fu d3 ${mounted ? 'in' : ''}`}>
            <div className="ap-section-hd">
              <div className="ap-section-dot" style={{ background:'#a78bfa' }}/>
              <span>Con Comprobante — Factura Pendiente</span>
              <span className="ap-section-count">{conComp.length}</span>
            </div>
            {conComp.map(req => (
              <div key={req.id} className="ap-card">
                <div className="ap-card-top">
                  <div className="ap-card-left">
                    <div className="ap-row">
                      <span className="ap-num">{req.numero}</span>
                      <StatusPill status={req.status}/>
                    </div>
                    <div className="ap-meta"><span><User size={10}/> {req.userName}</span></div>
                  </div>
                  <div className="ap-card-right">
                    <span className="ap-amt">{formatCurrency(req.approvedAmount||req.totalAmount)}</span>
                  </div>
                </div>
                <div className="ap-waiting">
                  <FileCheck size={12} style={{ color:'#a78bfa', flexShrink:0 }}/>
                  Esperando factura fiscal del técnico
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && requests.length === 0 && (
          <div className={`ap-empty fu d1 ${mounted ? 'in' : ''}`}>
            <div className="ap-empty-ico"><CheckCircle size={22}/></div>
            <p>Todo al día</p>
            <span>No hay solicitudes aprobadas pendientes</span>
          </div>
        )}
      </div>

      {/* MODAL: TRANSFERIR */}
      <Modal open={modal === 'transfer'} onClose={closeModal}>
        <div className="m-bar"/>
        <div className="m-head">
          <div className="m-ico" style={{ background:'rgba(96,165,250,.12)', color:'#60a5fa' }}><Send size={15}/></div>
          <div>
            <div className="m-title">Registrar Transferencia</div>
            <div className="m-sub">{selected?.userName} · {selected?.numero}</div>
          </div>
        </div>
        <div className="m-body">
          <div className="m-amount-box">
            <span className="m-amount-lbl">Monto a Transferir</span>
            <span className="m-amount-val">{selected && formatCurrency(selected.approvedAmount||selected.totalAmount)}</span>
          </div>
          <div className="m-note"><AlertCircle size={12}/> Se notificará al técnico con recordatorio de subir la factura.</div>
        </div>
        <div className="m-footer">
          <button className="m-btn ghost" onClick={closeModal} disabled={saving}>Cancelar</button>
          <button className="m-btn blue" onClick={handleTransfer} disabled={saving}>
            <Send size={13}/> {saving ? 'Guardando…' : 'Confirmar'}
          </button>
        </div>
      </Modal>

      {/* MODAL: SUBIR COMPROBANTE */}
      <Modal open={modal === 'upload' && !montoAlerta} onClose={closeModal}>
        <div className="m-bar"/>
        <div className="m-head">
          <div className="m-ico" style={{ background:'rgba(167,139,250,.12)', color:'#a78bfa' }}><Upload size={15}/></div>
          <div>
            <div className="m-title">Subir Comprobante</div>
            <div className="m-sub">{selected?.numero} · {selected?.userName}</div>
          </div>
        </div>
        <div style={{ padding:'0 1rem 1rem' }}>
          <OCRUpload type="comprobante" onUpload={handleUpload} onCancel={closeModal} nombreSolicitante={selected?.userName ?? ''} />
          {saving && (
            <div style={{ textAlign:'center', padding:'.5rem', fontSize:'.78rem', color:'#a78bfa', fontFamily:'Outfit,sans-serif' }}>
              ☁️ Subiendo a Cloudinary…
            </div>
          )}
        </div>
      </Modal>

      {/* MODAL: ALERTA MONTO MENOR */}
      <Modal open={!!montoAlerta} onClose={() => { setMontoAlerta(null); setMotivoMenor(''); }}>
        <div className="m-bar-warn"/>
        <div className="m-head">
          <div className="m-ico" style={{ background:'rgba(249,115,22,.12)', color:'#f97316' }}>
            <AlertTriangle size={15}/>
          </div>
          <div>
            <div className="m-title">Monto inferior al solicitado</div>
            <div className="m-sub">{selected?.numero} · {selected?.userName}</div>
          </div>
        </div>
        <div className="m-body">
          {/* Comparación de montos */}
          <div className="m-monto-compare">
            <div className="m-monto-row">
              <span className="m-monto-lbl">Monto solicitado</span>
              <span className="m-monto-val expected">{montoAlerta && formatCurrency(montoAlerta.montoSolicitado)}</span>
            </div>
            <div className="m-monto-divider"/>
            <div className="m-monto-row">
              <span className="m-monto-lbl">Monto en comprobante</span>
              <span className="m-monto-val actual">{montoAlerta && formatCurrency(montoAlerta.montoComprobante)}</span>
            </div>
            {montoAlerta && (
              <div className="m-monto-diff">
                Diferencia: {formatCurrency(montoAlerta.montoSolicitado - montoAlerta.montoComprobante)} menos
              </div>
            )}
          </div>

          {/* Campo de motivo — visible para el técnico */}
          <div className="m-motivo-wrap">
            <div className="m-motivo-hd">
              <MessageSquare size={13} style={{ color:'#fb923c', flexShrink:0 }}/>
              <span>Explica el motivo al técnico</span>
              <span className="m-motivo-optional">opcional</span>
            </div>
            <textarea
              className="m-motivo-ta"
              placeholder="Ej: Solo se transfirieron RD$1,500 porque el proveedor no tenía cambio. La diferencia se completará la próxima semana..."
              value={motivoMenor}
              onChange={e => setMotivoMenor(e.target.value)}
              rows={3}
              maxLength={400}
            />
            <div className="m-motivo-counter">{motivoMenor.length}/400</div>
            <div className="m-motivo-note">
              <AlertCircle size={11} style={{ color:'rgba(251,146,60,.55)', flexShrink:0, marginTop:1 }}/>
              <span>Este mensaje aparecerá en la vista del técnico y en el historial de actividad.</span>
            </div>
          </div>

          <div className="m-note" style={{ marginTop:'.5rem' }}>
            <AlertCircle size={12} style={{ color:'#f97316', flexShrink:0, marginTop:1 }}/>
            <span>¿Deseas continuar de todas formas con el monto menor?</span>
          </div>
        </div>
        <div className="m-footer">
          <button className="m-btn ghost" onClick={() => { setMontoAlerta(null); setMotivoMenor(''); }} disabled={saving}>
            Cancelar
          </button>
          <button className="m-btn warn" onClick={handleConfirmarMontoMenor} disabled={saving}>
            <AlertTriangle size={13}/> {saving ? 'Subiendo…' : 'Continuar de todas formas'}
          </button>
        </div>
      </Modal>
    </AppShell>
  );
}

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Outfit:wght@300;400;500;600&display=swap');

.ap-page {
  font-family: 'Outfit', sans-serif;
  padding: 1.5rem;
  max-width: 860px;
  margin: 0 auto;
  padding-bottom: 5rem;
  --ink:  #04080f; --ink2: #060c18; --ink3: #0a1120; --ink4: #0e1828; --ink5: #121f32;
  --blue: #3b82f6; --blue2: #60a5fa; --blue3: #93c5fd;
  --red:  #ef4444; --red2: #f87171;
  --w: #f0f4ff; --w70: rgba(240,244,255,.70); --w40: rgba(240,244,255,.40);
  --w20: rgba(240,244,255,.20); --w08: rgba(240,244,255,.08);
  --blue-dim: rgba(59,130,246,.10); --blue-border: rgba(59,130,246,.35);
  --red-dim: rgba(239,68,68,.10); --red-border: rgba(239,68,68,.30);
  background: var(--ink); min-height: 100vh;
}
@media(min-width:768px) { .ap-page { padding: 2rem 2.5rem 3rem; } }

.ap-top-bar { height:2px; background:linear-gradient(90deg,transparent,var(--blue),var(--red),transparent); opacity:.75; border-radius:99px; margin-bottom:1.75rem; }

.ap-eyebrow { font-size:.66rem; font-weight:700; letter-spacing:.18em; text-transform:uppercase; color:var(--blue2); display:flex; align-items:center; gap:.5rem; margin-bottom:.4rem; }
.ap-eyebrow::before { content:''; width:18px; height:1px; background:var(--blue2); opacity:.55; display:block; }
.ap-title { font-family:'Playfair Display',serif; font-size:1.85rem; font-weight:500; color:var(--w); letter-spacing:-.01em; line-height:1.15; margin-bottom:.3rem; }
.ap-title em { font-style:italic; background:linear-gradient(125deg,var(--blue2) 30%,var(--blue3) 60%,var(--red2) 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
.ap-sub { font-size:.78rem; color:var(--w40); font-weight:300; margin-bottom:1.5rem; }

.ap-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:.75rem; margin-bottom:1.75rem; }
.ap-stat { background:var(--ink3); border:1px solid var(--w08); border-radius:14px; padding:.875rem .75rem; text-align:center; transition:border-color .2s, transform .3s cubic-bezier(.22,1,.36,1); }
.ap-stat:hover { border-color:var(--blue-border); transform:translateY(-2px); }
.ap-stat-val { font-family:'Playfair Display',serif; font-size:1.55rem; font-weight:600; display:block; line-height:1; margin-bottom:.25rem; }
.ap-stat-lbl { font-size:.6rem; color:var(--w40); text-transform:uppercase; letter-spacing:.08em; }

.ap-section-hd { display:flex; align-items:center; gap:.5rem; font-size:.72rem; font-weight:600; color:var(--w40); text-transform:uppercase; letter-spacing:.1em; margin-bottom:.75rem; margin-top:1.25rem; }
.ap-section-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
.ap-section-count { margin-left:auto; background:var(--w08); border:1px solid var(--w08); color:var(--w40); border-radius:99px; padding:.1rem .45rem; font-size:.65rem; }

.ap-card { background:var(--ink3); border:1px solid var(--w08); border-radius:14px; padding:1rem 1.1rem; margin-bottom:.6rem; transition:border-color .2s; }
.ap-card:hover { border-color:var(--blue-border); }
.ap-card-top { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; margin-bottom:.75rem; }
.ap-card-left { flex:1; min-width:0; }
.ap-row { display:flex; align-items:center; gap:.45rem; flex-wrap:wrap; margin-bottom:.3rem; }
.ap-num { font-size:.9rem; font-weight:700; color:var(--w); }
.ap-meta { display:flex; gap:.75rem; font-size:.7rem; color:var(--w40); align-items:center; }
.ap-meta span { display:flex; align-items:center; gap:.3rem; }
.ap-card-right { text-align:right; flex-shrink:0; }
.ap-amt { font-family:'Playfair Display',serif; font-size:1.4rem; font-weight:600; color:var(--w); display:block; line-height:1; }
.ap-amt-lbl { font-size:.6rem; color:var(--w40); text-transform:uppercase; letter-spacing:.07em; }

.ap-action-btn { width:100%; border-radius:10px; padding:.65rem .875rem; font-family:'Outfit',sans-serif; font-size:.8rem; font-weight:600; display:flex; align-items:center; gap:.5rem; cursor:pointer; transition:all .2s cubic-bezier(.22,1,.36,1); }
.ap-action-btn.blue { background:var(--blue-dim); border:1px solid var(--blue-border); color:var(--blue2); }
.ap-action-btn.blue:hover { background:rgba(59,130,246,.18); transform:translateY(-1px); }
.ap-action-btn.outline { background:rgba(240,244,255,.04); border:1px solid var(--w08); color:var(--w40); }
.ap-action-btn.outline:hover { border-color:rgba(240,244,255,.18); color:var(--w70); transform:translateY(-1px); }

.ap-waiting { display:flex; align-items:center; gap:.45rem; font-size:.72rem; color:rgba(167,139,250,.7); background:rgba(167,139,250,.06); border:1px solid rgba(167,139,250,.15); border-radius:9px; padding:.5rem .75rem; }
.ap-empty { background:var(--ink3); border:1px solid var(--w08); border-radius:16px; padding:3rem 1.5rem; text-align:center; }
.ap-empty-ico { width:48px; height:48px; border-radius:12px; background:var(--blue-dim); border:1px solid var(--blue-border); display:flex; align-items:center; justify-content:center; margin:0 auto .875rem; color:var(--blue2); }
.ap-empty p { font-size:.9rem; font-weight:600; color:var(--w70); margin-bottom:.25rem; }
.ap-empty span { font-size:.75rem; color:var(--w40); font-weight:300; }

.fu{opacity:0;transform:translateY(14px);transition:opacity .5s cubic-bezier(.22,1,.36,1),transform .5s cubic-bezier(.22,1,.36,1)}
.fu.in{opacity:1;transform:none}
.d1{transition-delay:.07s}.d2{transition-delay:.14s}.d3{transition-delay:.21s}

/* Modals */
.m-bar { height:2px; background:linear-gradient(90deg,transparent,var(--blue),var(--red),transparent); opacity:.7; }
.m-bar-warn { height:2px; background:linear-gradient(90deg,transparent,#f97316,#fb923c,transparent); opacity:.7; }
.m-head { display:flex; align-items:center; gap:.75rem; padding:.875rem 1.1rem; border-bottom:1px solid var(--w08); }
.m-ico { width:34px; height:34px; border-radius:9px; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
.m-title { font-family:'Playfair Display',serif; font-size:1rem; font-weight:500; color:var(--w); }
.m-sub { font-size:.7rem; color:var(--w40); font-weight:300; margin-top:.1rem; }
.m-body { padding:.875rem 1.1rem; }
.m-amount-box { background:var(--blue-dim); border:1px solid var(--blue-border); border-radius:12px; padding:1rem; text-align:center; margin-bottom:.75rem; }
.m-amount-lbl { font-size:.62rem; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--blue2); display:block; margin-bottom:.35rem; opacity:.8; }
.m-amount-val { font-family:'Playfair Display',serif; font-size:1.75rem; font-weight:600; color:var(--blue3); }
.m-note { display:flex; align-items:flex-start; gap:.45rem; font-size:.72rem; color:var(--w40); line-height:1.4; }
.m-footer { display:flex; gap:.6rem; padding:.875rem 1.1rem; border-top:1px solid var(--w08); }
.m-btn { flex:1; border-radius:10px; padding:.7rem; font-family:'Outfit',sans-serif; font-size:.82rem; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:.4rem; transition:all .2s cubic-bezier(.22,1,.36,1); }
.m-btn:disabled { opacity:.4; cursor:not-allowed; transform:none!important; }
.m-btn.ghost { background:var(--ink4); border:1px solid var(--w08); color:var(--w40); }
.m-btn.ghost:hover { border-color:rgba(240,244,255,.18); color:var(--w70); }
.m-btn.blue { background:linear-gradient(135deg,var(--blue),#1d4ed8); color:#fff; border:none; box-shadow:0 4px 14px rgba(59,130,246,.28); }
.m-btn.blue:not(:disabled):hover { filter:brightness(1.08); transform:translateY(-1px); }
.m-btn.warn { background:linear-gradient(135deg,#f97316,#c2410c); color:#fff; border:none; box-shadow:0 4px 14px rgba(249,115,22,.28); }
.m-btn.warn:not(:disabled):hover { filter:brightness(1.08); transform:translateY(-1px); }
.m-monto-compare { background:rgba(249,115,22,.06); border:1px solid rgba(249,115,22,.2); border-radius:12px; padding:1rem; display:flex; flex-direction:column; gap:.6rem; margin-bottom:.875rem; }
.m-monto-row { display:flex; justify-content:space-between; align-items:center; }
.m-monto-lbl { font-size:.72rem; color:var(--w40); }
.m-monto-val { font-family:'Playfair Display',serif; font-size:1.1rem; font-weight:600; }
.m-monto-val.expected { color:var(--w70); }
.m-monto-val.actual { color:#f97316; }
.m-monto-divider { height:1px; background:rgba(249,115,22,.15); }
.m-monto-diff { font-size:.7rem; color:rgba(249,115,22,.65); text-align:right; font-weight:500; }

/* Motivo field */
.m-motivo-wrap { background:rgba(251,146,60,.05); border:1px solid rgba(251,146,60,.18); border-radius:12px; padding:.875rem 1rem; margin-bottom:.75rem; }
.m-motivo-hd { display:flex; align-items:center; gap:.4rem; font-size:.75rem; font-weight:600; color:rgba(251,146,60,.85); margin-bottom:.6rem; }
.m-motivo-optional { margin-left:auto; font-size:.62rem; font-weight:400; color:rgba(240,244,255,.25); background:rgba(240,244,255,.06); border:1px solid rgba(240,244,255,.08); padding:.1rem .45rem; border-radius:99px; letter-spacing:.05em; }
.m-motivo-ta { width:100%; background:rgba(4,8,15,.55); border:1px solid rgba(251,146,60,.2); border-radius:9px; padding:.6rem .8rem; font-size:.8rem; color:rgba(240,244,255,.82); font-family:'Outfit',sans-serif; resize:none; outline:none; line-height:1.5; transition:border-color .2s,box-shadow .2s; box-sizing:border-box; }
.m-motivo-ta::placeholder { color:rgba(240,244,255,.18); }
.m-motivo-ta:focus { border-color:rgba(251,146,60,.45); box-shadow:0 0 0 3px rgba(251,146,60,.08); }
.m-motivo-counter { font-size:.62rem; color:rgba(240,244,255,.2); text-align:right; margin-top:.3rem; }
.m-motivo-note { display:flex; align-items:flex-start; gap:.35rem; font-size:.68rem; color:rgba(240,244,255,.3); line-height:1.4; margin-top:.5rem; }
`;