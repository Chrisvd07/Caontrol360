'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { AppShell } from '@/components/app-shell';
import { OCRUpload } from '@/components/ocr-upload';
import {
  Inbox, CheckCircle, XCircle, User, Calendar,
  DollarSign, Send, History,
} from 'lucide-react';
import {
  getRequestsByStatusFirestore,
  updateRequestFirestore,
  addEvidenceToRequestFirestore,
  getRequestsByUserFirestore,
} from '@/lib/firestore-service';
import { notifyUser, notifyRole } from '@/lib/notify';
import { formatCurrency } from '@/lib/ocr';
import type { Request, Evidence } from '@/lib/types';
import { toast } from 'sonner';

const TYPE_LABELS: Record<string, string> = {
  combustible: 'Combustible', materiales: 'Materiales',
  viatico: 'Viático', gomera: 'Gomera', otros: 'Otros',
};

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    enviada:            { label: 'Enviada',      color: '#60a5fa' },
    aprobada:           { label: 'Aprobada',     color: '#22c55e' },
    transferida:        { label: 'Transferida',  color: '#60a5fa' },
    comprobante_subido: { label: 'Comprobante',  color: '#a78bfa' },
    rechazada:          { label: 'Rechazada',    color: '#ef4444' },
  };
  const cfg = map[status] ?? { label: status, color: '#8b8ea0' };
  return (
    <span style={{
      fontSize: '.6rem', fontWeight: 700, letterSpacing: '.09em',
      textTransform: 'uppercase' as const, color: cfg.color,
      background: `${cfg.color}18`, border: `1px solid ${cfg.color}28`,
      padding: '.18rem .55rem', borderRadius: 99, whiteSpace: 'nowrap' as const,
    }}>{cfg.label}</span>
  );
}

function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.72)',backdropFilter:'blur(6px)',zIndex:100 }} />
      <div style={{
        position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:101,
        width:'min(520px,calc(100vw - 2rem))',background:'#0a1120',
        border:'1px solid rgba(96,165,250,.12)',borderRadius:18,overflow:'hidden',
        boxShadow:'0 32px 80px rgba(0,0,0,.8)',
        animation:'m-in .25s cubic-bezier(.22,1,.36,1)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {children}
      </div>
      <style>{`@keyframes m-in{from{opacity:0;transform:translate(-50%,-54%) scale(.96)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}`}</style>
    </>
  );
}

export default function PagosPage() {
  const { user } = useAuth();
  const [requests, setRequests]     = useState<Request[]>([]);
  const [selected, setSelected]     = useState<Request | null>(null);
  const [modal, setModal]           = useState<'approve'|'reject'|'transfer'|'upload'|null>(null);
  const [approveAmt, setApproveAmt] = useState('');
  const [rejectMsg, setRejectMsg]   = useState('');
  const [mounted, setMounted]       = useState(false);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);

  useEffect(() => { setMounted(true); load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const r = await getRequestsByStatusFirestore(['enviada']);
      setRequests(r.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openModal  = (req: Request, m: typeof modal) => {
    setSelected(req);
    setApproveAmt(req.totalAmount.toString());
    setModal(m);
  };
  const closeModal = () => { setModal(null); };

  const handleApprove = async () => {
    if (!selected || !user || saving) return;
    setSaving(true);
    try {
      const amount = parseFloat(approveAmt) || selected.totalAmount;
      await updateRequestFirestore(selected.id, {
        status: 'aprobada', approvedAmount: amount,
        approvedAt: new Date().toISOString(), approvedBy: user.id,
      }, user.id, user.name);
      await notifyUser(selected.userId, {
        title: `✅ Solicitud ${selected.numero} aprobada`,
        message: `Tu solicitud por ${formatCurrency(amount)} fue aprobada.`,
        type: 'success',
        data: { requestId: selected.id, url: `/tecnico` },
      });
      await notifyRole('admin', {
        title: `📋 Solicitud ${selected.numero} aprobada`,
        message: `${user.name} aprobó la solicitud de ${selected.userName} por ${formatCurrency(amount)}.`,
        type: 'info',
        data: { requestId: selected.id },
      });
      toast.success(`Solicitud ${selected.numero} aprobada`);
      closeModal(); setSelected(null); setApproveAmt('');
      await load();
    } catch (err) {
      console.error(err); toast.error('Error al aprobar');
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!selected || !user || !rejectMsg.trim() || saving) return;
    setSaving(true);
    try {
      await updateRequestFirestore(selected.id, {
        status: 'rechazada',
        observations: [...(selected.observations || []), rejectMsg],
      }, user.id, user.name);
      await notifyUser(selected.userId, {
        title: `❌ Solicitud ${selected.numero} rechazada`,
        message: rejectMsg,
        type: 'error',
        data: { requestId: selected.id, url: `/tecnico` },
      });
      toast.error(`Solicitud ${selected.numero} rechazada`);
      closeModal(); setSelected(null); setRejectMsg('');
      await load();
    } catch (err) {
      console.error(err); toast.error('Error al rechazar');
    } finally {
      setSaving(false);
    }
  };

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
        message: `Recibiste ${formatCurrency(selected.approvedAmount || selected.totalAmount)}.`,
        type: 'success',
        data: { requestId: selected.id, url: `/tecnico` },
      });
      toast.success('Transferencia registrada');
      setModal('upload');
    } catch (err) {
      console.error(err); toast.error('Error al registrar transferencia');
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (evidence: Evidence) => {
    if (!selected || !user || saving) return;
    setSaving(true);
    try {
      await addEvidenceToRequestFirestore(
        selected.id,
        { ...evidence, uploadedBy: user.id },
        user.id,
        user.name,
      );
      await updateRequestFirestore(selected.id, { status: 'comprobante_subido' }, user.id, user.name);
      await notifyRole('contabilidad', {
        title: `📄 Comprobante subido — ${selected.numero}`,
        message: `Se subió el comprobante de ${selected.userName}.`,
        type: 'info',
        data: { requestId: selected.id },
      });
      toast.success('Comprobante subido y validado correctamente');
      closeModal(); setSelected(null);
      await load();
    } catch (err) {
      console.error(err); toast.error('Error al subir comprobante');
    } finally {
      setSaving(false);
    }
  };

  const [historyCache, setHistoryCache] = useState<Record<string, { count: number; total: number }>>({});
  useEffect(() => {
    if (requests.length === 0) return;
    const unique = [...new Set(requests.map(r => r.userId))];
    unique.forEach(async uid => {
      if (historyCache[uid]) return;
      const all  = await getRequestsByUserFirestore(uid);
      const cut  = new Date(); cut.setDate(cut.getDate() - 30);
      const recent = all.filter(x => new Date(x.createdAt) >= cut);
      setHistoryCache(prev => ({
        ...prev,
        [uid]: { count: recent.length, total: recent.reduce((s, x) => s + x.totalAmount, 0) },
      }));
    });
  }, [requests]);

  const totalPending = requests.reduce((s, r) => s + r.totalAmount, 0);

  return (
    <AppShell requiredRole="pagos">
      <style>{STYLES}</style>
      <div className="pg-page">
        <div className="pg-top-bar" />

        <div className={`pg-hd fu ${mounted ? 'in' : ''}`}>
          <div className="pg-eyebrow">Área de Pagos</div>
          <h1 className="pg-title">Inbox de <em>Solicitudes</em></h1>
          <p className="pg-sub">
            {loading
              ? 'Cargando...'
              : `${requests.length} solicitud${requests.length !== 1 ? 'es' : ''} pendiente${requests.length !== 1 ? 's' : ''} de revisión`}
          </p>
        </div>

        <div className={`pg-stats fu d1 ${mounted ? 'in' : ''}`}>
          {[
            { icon: <Inbox size={16}/>,      val: loading ? '…' : requests.length,              lbl: 'Pendientes',      color: '#60a5fa' },
            { icon: <DollarSign size={16}/>, val: loading ? '…' : formatCurrency(totalPending), lbl: 'Total pendiente', color: '#ef4444', small: true },
          ].map((s, i) => (
            <div key={i} className="pg-stat">
              <div className="pg-stat-ico" style={{ background:`${s.color}15`, color:s.color }}>{s.icon}</div>
              <span className="pg-stat-val" style={s.small ? { fontSize:'1.1rem' } : {}}>{s.val}</span>
              <span className="pg-stat-lbl">{s.lbl}</span>
            </div>
          ))}
        </div>

        <div className={`fu d2 ${mounted ? 'in' : ''}`}>
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="pg-card" style={{ opacity:.5 }}>
                <div className="pg-card-body">
                  <div className="pg-card-left">
                    <div className="pg-skeleton" style={{ width:'55%', height:'.92rem', marginBottom:'.5rem', borderRadius:6 }} />
                    <div className="pg-skeleton" style={{ width:'40%', height:'.7rem', borderRadius:6 }} />
                  </div>
                  <div><div className="pg-skeleton" style={{ width:80, height:'1.55rem', borderRadius:6 }} /></div>
                </div>
              </div>
            ))
          ) : requests.length === 0 ? (
            <div className="pg-empty">
              <div className="pg-empty-ico"><Inbox size={22}/></div>
              <p>Inbox vacío</p>
              <span>No hay solicitudes pendientes de revisión</span>
            </div>
          ) : requests.map(req => {
            const h = historyCache[req.userId];
            return (
              <div key={req.id} className="pg-card">
                <div className="pg-card-body">
                  <div className="pg-card-left">
                    <div className="pg-card-row">
                      <span className="pg-card-num">{req.numero}</span>
                      <StatusPill status={req.status} />
                      <span className="pg-card-type">{TYPE_LABELS[req.type] ?? req.type}</span>
                    </div>
                    <div className="pg-card-meta">
                      <span><User size={11}/> {req.userName}</span>
                      <span><Calendar size={11}/> {new Date(req.createdAt).toLocaleDateString('es-DO', { day:'numeric', month:'short' })}</span>
                    </div>
                  </div>
                  <div className="pg-card-right">
                    <span className="pg-amt">{formatCurrency(req.totalAmount)}</span>
                    <span className="pg-amt-lbl">solicitado</span>
                  </div>
                </div>

                {h && (
                  <div className="pg-history">
                    <History size={10}/>
                    Últimos 30 días: <b>{h.count}</b> solicitudes · <b>{formatCurrency(h.total)}</b>
                  </div>
                )}

                <div className="pg-card-actions">
                  <button className="pg-btn green" onClick={() => openModal(req, 'approve')}>
                    <CheckCircle size={13}/> Aprobar
                  </button>
                  <button className="pg-btn red" onClick={() => openModal(req, 'reject')}>
                    <XCircle size={13}/> Rechazar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL: APROBAR */}
      <Modal open={modal === 'approve'} onClose={closeModal}>
        <div className="m-bar" />
        <div className="m-head">
          <div className="m-ico" style={{ background:'rgba(34,197,94,.12)', color:'#22c55e' }}><CheckCircle size={15}/></div>
          <div>
            <div className="m-title">Aprobar Solicitud</div>
            <div className="m-sub">{selected?.numero} · {selected?.userName}</div>
          </div>
        </div>
        <div className="m-body">
          <div className="m-field">
            <label className="m-lbl">Monto a Aprobar</label>
            <input className="m-input" type="number" value={approveAmt} onChange={e => setApproveAmt(e.target.value)} placeholder="Monto" />
            <span className="m-hint">Solicitado: {selected && formatCurrency(selected.totalAmount)}</span>
          </div>
          <div className="m-amount-box">
            <span className="m-amount-lbl">Aprobando</span>
            <span className="m-amount-val">{formatCurrency(parseFloat(approveAmt) || 0)}</span>
          </div>
        </div>
        <div className="m-footer">
          <button className="m-btn ghost" onClick={closeModal} disabled={saving}>Cancelar</button>
          <button className="m-btn green" onClick={handleApprove} disabled={saving}>
            <CheckCircle size={13}/> {saving ? 'Guardando…' : 'Confirmar'}
          </button>
        </div>
      </Modal>

      {/* MODAL: RECHAZAR */}
      <Modal open={modal === 'reject'} onClose={closeModal}>
        <div className="m-bar" style={{ background:'linear-gradient(90deg,transparent,#ef4444,transparent)' }}/>
        <div className="m-head">
          <div className="m-ico" style={{ background:'rgba(239,68,68,.12)', color:'#ef4444' }}><XCircle size={15}/></div>
          <div>
            <div className="m-title">Rechazar Solicitud</div>
            <div className="m-sub">{selected?.numero} · {selected?.userName}</div>
          </div>
        </div>
        <div className="m-body">
          <div className="m-field">
            <label className="m-lbl">Razón del Rechazo</label>
            <textarea className="m-input m-ta" rows={3} value={rejectMsg} onChange={e => setRejectMsg(e.target.value)} placeholder="Explica el motivo..." />
          </div>
        </div>
        <div className="m-footer">
          <button className="m-btn ghost" onClick={closeModal} disabled={saving}>Cancelar</button>
          <button className="m-btn red" onClick={handleReject} disabled={!rejectMsg.trim() || saving}>
            <XCircle size={13}/> {saving ? 'Guardando…' : 'Rechazar'}
          </button>
        </div>
      </Modal>

      {/* MODAL: TRANSFERIR */}
      <Modal open={modal === 'transfer'} onClose={closeModal}>
        <div className="m-bar"/>
        <div className="m-head">
          <div className="m-ico" style={{ background:'rgba(96,165,250,.12)', color:'#60a5fa' }}><Send size={15}/></div>
          <div>
            <div className="m-title">Registrar Transferencia</div>
            <div className="m-sub">{selected?.userName}</div>
          </div>
        </div>
        <div className="m-body">
          <div className="m-amount-box">
            <span className="m-amount-lbl">Monto Aprobado</span>
            <span className="m-amount-val">{selected && formatCurrency(selected.approvedAmount || selected.totalAmount)}</span>
          </div>
        </div>
        <div className="m-footer">
          <button className="m-btn ghost" onClick={closeModal} disabled={saving}>Cancelar</button>
          <button className="m-btn blue" onClick={handleTransfer} disabled={saving}>
            <Send size={13}/> {saving ? 'Guardando…' : 'Confirmar'}
          </button>
        </div>
      </Modal>

      {/* MODAL: SUBIR COMPROBANTE */}
      <Modal open={modal === 'upload'} onClose={closeModal}>
        <div className="m-bar"/>
        <div className="m-head">
          <div className="m-ico" style={{ background:'rgba(96,165,250,.12)', color:'#60a5fa' }}><Send size={15}/></div>
          <div>
            <div className="m-title">Subir Comprobante</div>
            <div className="m-sub">Comprobante de transferencia · {selected?.userName}</div>
          </div>
        </div>
        <div style={{ padding:'0 1rem 1rem' }}>
          <OCRUpload type="comprobante" onUpload={handleUpload} onCancel={closeModal} nombreSolicitante={selected?.userName ?? ''} />
          {saving && (
            <div style={{ textAlign:'center', padding:'.5rem', fontSize:'.78rem', color:'#60a5fa', fontFamily:'Outfit,sans-serif' }}>
              Guardando comprobante…
            </div>
          )}
        </div>
      </Modal>
    </AppShell>
  );
}

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Outfit:wght@300;400;500;600&display=swap');

.pg-page {
  font-family: 'Outfit', sans-serif;
  padding: 1.5rem;
  max-width: 860px;
  margin: 0 auto;
  padding-bottom: 5rem;
  --ink:  #04080f;
  --ink2: #060c18;
  --ink3: #0a1120;
  --ink4: #0e1828;
  --ink5: #121f32;
  --blue: #3b82f6;
  --blue2: #60a5fa;
  --blue3: #93c5fd;
  --red:  #ef4444;
  --red2: #f87171;
  --w:    #f0f4ff;
  --w70:  rgba(240,244,255,.70);
  --w40:  rgba(240,244,255,.40);
  --w20:  rgba(240,244,255,.20);
  --w08:  rgba(240,244,255,.08);
  --blue-dim:    rgba(59,130,246,.10);
  --blue-glow:   rgba(59,130,246,.22);
  --blue-border: rgba(59,130,246,.35);
  --red-dim:     rgba(239,68,68,.10);
  --red-border:  rgba(239,68,68,.30);
  background: var(--ink);
  min-height: 100vh;
}
@media(min-width:768px) { .pg-page { padding: 2rem 2.5rem 3rem; } }

.pg-top-bar {
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--blue), var(--red), transparent);
  opacity: .75;
  border-radius: 99px;
  margin-bottom: 1.75rem;
}

.pg-eyebrow {
  font-size: .66rem; font-weight: 700; letter-spacing: .18em;
  text-transform: uppercase; color: var(--blue2);
  display: flex; align-items: center; gap: .5rem; margin-bottom: .4rem;
}
.pg-eyebrow::before { content:''; width:18px; height:1px; background:var(--blue2); opacity:.55; display:block; }

.pg-title {
  font-family: 'Playfair Display', serif;
  font-size: 1.85rem; font-weight: 500; color: var(--w);
  letter-spacing: -.01em; line-height: 1.15; margin-bottom: .3rem;
}
.pg-title em {
  font-style: italic;
  background: linear-gradient(125deg, var(--blue2) 30%, var(--blue3) 60%, var(--red2) 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
.pg-sub { font-size: .78rem; color: var(--w40); font-weight: 300; margin-bottom: 1.5rem; }

.pg-stats { display: grid; grid-template-columns: repeat(2,1fr); gap: .75rem; margin-bottom: 1.5rem; }
.pg-stat {
  background: var(--ink3); border: 1px solid var(--w08); border-radius: 14px;
  padding: 1rem .875rem; transition: border-color .2s, transform .3s cubic-bezier(.22,1,.36,1);
}
.pg-stat:hover { border-color: var(--blue-border); transform: translateY(-2px); }
.pg-stat-ico { width:30px; height:30px; border-radius:8px; display:flex; align-items:center; justify-content:center; margin-bottom:.6rem; }
.pg-stat-val { font-family:'Playfair Display',serif; font-size:1.55rem; font-weight:600; color:var(--w); display:block; line-height:1; margin-bottom:.2rem; }
.pg-stat-lbl { font-size:.6rem; color:var(--w40); text-transform:uppercase; letter-spacing:.09em; }

.pg-skeleton {
  background: linear-gradient(90deg, var(--ink3) 25%, var(--ink4) 50%, var(--ink3) 75%);
  background-size: 200% 100%; animation: pg-shimmer 1.5s infinite;
}
@keyframes pg-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

.pg-empty {
  background: var(--ink3); border: 1px solid var(--w08); border-radius: 16px;
  padding: 3rem 1.5rem; text-align: center;
}
.pg-empty-ico {
  width:48px; height:48px; border-radius:12px;
  background: var(--blue-dim); border: 1px solid var(--blue-border);
  display:flex; align-items:center; justify-content:center;
  margin: 0 auto .875rem; color: var(--blue2);
}
.pg-empty p { font-size:.9rem; font-weight:600; color:var(--w70); margin-bottom:.25rem; }
.pg-empty span { font-size:.75rem; color:var(--w40); font-weight:300; }

.pg-card {
  background: var(--ink3); border: 1px solid var(--w08); border-radius: 16px;
  padding: 1.1rem 1.2rem; margin-bottom: .75rem;
  transition: border-color .2s, transform .25s cubic-bezier(.22,1,.36,1);
}
.pg-card:hover { border-color: var(--blue-border); transform: translateX(2px); }
.pg-card-body { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; margin-bottom:.75rem; }
.pg-card-left { flex:1; min-width:0; }
.pg-card-row { display:flex; align-items:center; gap:.45rem; flex-wrap:wrap; margin-bottom:.35rem; }
.pg-card-num { font-size:.92rem; font-weight:700; color:var(--w); }
.pg-card-type { font-size:.68rem; color:var(--w40); font-weight:300; }
.pg-card-meta { display:flex; gap:.875rem; font-size:.7rem; color:var(--w40); align-items:center; }
.pg-card-meta span { display:flex; align-items:center; gap:.3rem; }
.pg-card-right { text-align:right; flex-shrink:0; }
.pg-amt { font-family:'Playfair Display',serif; font-size:1.55rem; font-weight:600; color:var(--w); display:block; line-height:1; }
.pg-amt-lbl { font-size:.6rem; color:var(--w40); text-transform:uppercase; letter-spacing:.07em; }

.pg-history {
  font-size:.68rem; color:var(--w40);
  background: rgba(240,244,255,.04); border: 1px solid var(--w08);
  border-radius:8px; padding:.4rem .75rem; margin-bottom:.75rem;
  display:flex; align-items:center; gap:.4rem;
}
.pg-history b { color:var(--blue3); font-weight:600; }

.pg-card-actions { display:flex; gap:.6rem; }
.pg-btn {
  flex:1; border-radius:10px; padding:.65rem;
  font-family:'Outfit',sans-serif; font-size:.78rem; font-weight:600;
  display:flex; align-items:center; justify-content:center; gap:.4rem;
  cursor:pointer; transition:all .2s cubic-bezier(.22,1,.36,1); border:1px solid transparent;
}
.pg-btn:disabled { opacity:.5; cursor:not-allowed; transform:none!important; }
.pg-btn.green { background:rgba(34,197,94,.10); border-color:rgba(34,197,94,.22); color:#22c55e; }
.pg-btn.green:not(:disabled):hover { background:rgba(34,197,94,.18); transform:translateY(-1px); }
.pg-btn.red { background:var(--red-dim); border-color:var(--red-border); color:var(--red2); }
.pg-btn.red:not(:disabled):hover { background:rgba(239,68,68,.16); transform:translateY(-1px); }

.fu { opacity:0; transform:translateY(14px); transition:opacity .5s cubic-bezier(.22,1,.36,1),transform .5s cubic-bezier(.22,1,.36,1); }
.fu.in { opacity:1; transform:none; }
.d1{transition-delay:.07s} .d2{transition-delay:.14s}

/* Modals */
.m-bar { height:2px; background:linear-gradient(90deg,transparent,var(--blue),var(--red),transparent); opacity:.7; }
.m-head { display:flex; align-items:center; gap:.75rem; padding:.875rem 1.1rem; border-bottom:1px solid var(--w08); }
.m-ico { width:34px; height:34px; border-radius:9px; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
.m-title { font-family:'Playfair Display',serif; font-size:1rem; font-weight:500; color:var(--w); }
.m-sub { font-size:.7rem; color:var(--w40); font-weight:300; margin-top:.1rem; }
.m-body { padding:.875rem 1.1rem; }
.m-field { display:flex; flex-direction:column; gap:.35rem; margin-bottom:.875rem; }
.m-lbl { font-size:.65rem; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--w40); }
.m-input {
  background:var(--ink4); border:1px solid var(--w08); border-radius:10px;
  padding:.65rem .875rem; font-size:.875rem; color:var(--w);
  font-family:'Outfit',sans-serif; outline:none; width:100%;
  transition:border-color .2s,box-shadow .2s; -webkit-appearance:none;
}
.m-input:focus { border-color:var(--blue-border); box-shadow:0 0 0 3px var(--blue-dim); }
.m-ta { resize:none; line-height:1.5; }
.m-hint { font-size:.68rem; color:var(--w20); }
.m-amount-box {
  background:var(--blue-dim); border:1px solid var(--blue-border);
  border-radius:12px; padding:1rem; text-align:center;
}
.m-amount-lbl { font-size:.62rem; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--blue2); display:block; margin-bottom:.35rem; opacity:.8; }
.m-amount-val { font-family:'Playfair Display',serif; font-size:1.75rem; font-weight:600; color:var(--blue3); }
.m-footer { display:flex; gap:.6rem; padding:.875rem 1.1rem; border-top:1px solid var(--w08); }
.m-btn {
  flex:1; border-radius:10px; padding:.7rem;
  font-family:'Outfit',sans-serif; font-size:.82rem; font-weight:600;
  cursor:pointer; display:flex; align-items:center; justify-content:center; gap:.4rem;
  transition:all .2s cubic-bezier(.22,1,.36,1);
}
.m-btn:disabled { opacity:.4; cursor:not-allowed; transform:none!important; }
.m-btn.ghost { background:var(--ink4); border:1px solid var(--w08); color:var(--w40); }
.m-btn.ghost:hover { border-color:rgba(240,244,255,.18); color:var(--w70); }
.m-btn.blue {
  background:linear-gradient(135deg,var(--blue),#1d4ed8); color:#fff; border:none;
  box-shadow:0 4px 14px rgba(59,130,246,.28);
}
.m-btn.blue:not(:disabled):hover { filter:brightness(1.08); transform:translateY(-1px); }
.m-btn.green { background:linear-gradient(135deg,#22c55e,#15803d); color:#fff; border:none; box-shadow:0 4px 14px rgba(34,197,94,.18); }
.m-btn.green:not(:disabled):hover { filter:brightness(1.08); transform:translateY(-1px); }
.m-btn.red { background:linear-gradient(135deg,var(--red),#b91c1c); color:#fff; border:none; box-shadow:0 4px 14px rgba(239,68,68,.18); }
.m-btn.red:not(:disabled):hover { filter:brightness(1.08); transform:translateY(-1px); }
`;