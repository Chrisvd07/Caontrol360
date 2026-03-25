'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { AppShell } from '@/components/app-shell';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import { User, Mail, Phone, Shield, Edit3, Check, X } from 'lucide-react';

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0,3)}-${digits.slice(3)}`;
  return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6,10)}`;
}

function ProfileContent() {
  const { user } = useAuth();
  const [mounted,  setMounted]  = useState(false);
  const [saving,   setSaving]   = useState(false);

  const [nombre,   setNombre]   = useState('');
  const [apellido, setApellido] = useState('');
  const [telefono, setTelefono] = useState('');
  const [editing,  setEditing]  = useState<string | null>(null);

  const [tempNombre,   setTempNombre]   = useState('');
  const [tempApellido, setTempApellido] = useState('');
  const [tempTelefono, setTempTelefono] = useState('');

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (user) {
      setNombre(user.nombre   ?? user.name?.split(' ')[0] ?? '');
      setApellido(user.apellido ?? user.name?.split(' ').slice(1).join(' ') ?? '');
      setTelefono(user.telefono ?? '');
    }
  }, [user]);

  if (!user) return null;

  const initials  = [nombre[0], apellido[0]].filter(Boolean).join('').toUpperCase() || 'U';
  const fullName  = `${nombre} ${apellido}`.trim() || user.name;

  const ROLE_LABELS: Record<string, string> = {
    tecnico: 'Técnico', pagos: 'Pagos',
    contabilidad: 'Contabilidad', admin: 'Administrador',
  };
  const ROLE_COLORS: Record<string, string> = {
    tecnico:      '#60a5fa',
    pagos:        '#3b82f6',
    contabilidad: '#a78bfa',
    admin:        '#ef4444',
  };
  const roleColor = ROLE_COLORS[user.role] ?? '#60a5fa';

  const saveField = async (field: string, value: string) => {
    if (!user.uid) return;
    setSaving(true);
    try {
      const updates: Record<string, string> = { [field]: value };
      if (field === 'nombre')   updates.name = `${value} ${apellido}`.trim();
      if (field === 'apellido') updates.name = `${nombre} ${value}`.trim();
      await updateDoc(doc(db, 'users', user.uid), updates);
      if (field === 'nombre')   setNombre(value);
      if (field === 'apellido') setApellido(value);
      if (field === 'telefono') setTelefono(value);
      toast.success('Dato actualizado correctamente');
      setEditing(null);
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar el cambio');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (field: string) => {
    if (field === 'nombre')   setTempNombre(nombre);
    if (field === 'apellido') setTempApellido(apellido);
    if (field === 'telefono') setTempTelefono(telefono);
    setEditing(field);
  };

  const cancelEdit = () => setEditing(null);

  return (
    <AppShell>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Outfit:wght@300;400;500;600&display=swap');

        .pf-page {
          font-family: 'Outfit', sans-serif;
          padding: 1.5rem;
          max-width: 680px;
          margin: 0 auto;
          padding-bottom: 6rem;
          --ink:  #04080f; --ink2: #060c18; --ink3: #0a1120; --ink4: #0e1828;
          --blue: #3b82f6; --blue2: #60a5fa; --blue3: #93c5fd;
          --red:  #ef4444; --red2: #f87171;
          --w: #f0f4ff; --w70: rgba(240,244,255,.70); --w40: rgba(240,244,255,.40);
          --w20: rgba(240,244,255,.20); --w08: rgba(240,244,255,.08);
          --blue-dim: rgba(59,130,246,.10); --blue-border: rgba(59,130,246,.35);
          background: var(--ink); min-height: 100vh;
        }
        @media(min-width:768px) { .pf-page { padding: 2rem 2.5rem 3rem; } }

        .pf-topbar { height:2px; background:linear-gradient(90deg,transparent,var(--blue),var(--red),transparent); opacity:.75; margin-bottom:1.75rem; border-radius:99px; }

        .pf-hero {
          background: var(--ink3); border: 1px solid var(--w08);
          border-radius: 20px; padding: 2rem 1.5rem 1.5rem;
          margin-bottom: 1.25rem; position: relative; overflow: hidden; text-align: center;
        }
        .pf-hero::before {
          content:''; position:absolute; top:0; left:0; right:0; height:1px;
          background:linear-gradient(90deg,transparent,var(--blue),transparent); opacity:.5;
        }
        .pf-hero-bg {
          position:absolute; top:-60px; left:50%; transform:translateX(-50%);
          width:320px; height:320px; border-radius:50%;
          background:radial-gradient(circle,rgba(59,130,246,.07) 0%,transparent 65%);
          pointer-events:none;
        }
        .pf-avatar-wrap { position:relative; display:inline-block; margin-bottom:1.25rem; }
        .pf-avatar {
          width:88px; height:88px; border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          font-family:'Playfair Display',serif; font-size:1.75rem; font-weight:600;
          border:2px solid var(--blue-border);
          box-shadow:0 0 0 6px var(--blue-dim);
          position:relative; z-index:1;
          transition:transform .2s cubic-bezier(.22,1,.36,1);
        }
        .pf-avatar:hover { transform:scale(1.04); }
        .pf-avatar-ring {
          position:absolute; inset:-6px; border-radius:50%;
          border:1px solid rgba(59,130,246,.15);
          animation:pf-spin 12s linear infinite;
        }
        @keyframes pf-spin { to{transform:rotate(360deg)} }
        .pf-avatar-dot {
          position:absolute; bottom:4px; right:4px;
          width:14px; height:14px; border-radius:50%;
          background:#22c55e; border:2px solid var(--ink3);
          box-shadow:0 0 6px rgba(34,197,94,.5);
        }
        .pf-hero-name { font-family:'Playfair Display',serif; font-size:1.5rem; font-weight:500; color:var(--w); letter-spacing:-.01em; margin-bottom:.35rem; }
        .pf-hero-email { font-size:.82rem; color:var(--w40); font-weight:300; margin-bottom:.875rem; }
        .pf-role-badge { display:inline-flex; align-items:center; gap:.4rem; border-radius:99px; padding:.3rem .875rem; font-size:.72rem; font-weight:600; letter-spacing:.07em; text-transform:uppercase; border:1px solid; }
        .pf-role-dot { width:6px; height:6px; border-radius:50%; }

        .pf-card { background:var(--ink3); border:1px solid var(--w08); border-radius:16px; overflow:hidden; margin-bottom:1rem; }
        .pf-card-hd { padding:.875rem 1.25rem; border-bottom:1px solid var(--w08); display:flex; align-items:center; gap:.6rem; }
        .pf-card-hd-ico { width:28px; height:28px; border-radius:7px; background:var(--blue-dim); border:1px solid var(--blue-border); display:flex; align-items:center; justify-content:center; color:var(--blue2); flex-shrink:0; }
        .pf-card-title { font-size:.875rem; font-weight:600; color:var(--w); }
        .pf-card-sub { font-size:.7rem; color:var(--w40); font-weight:300; margin-top:.1rem; }

        .pf-fields { padding:.5rem 0; }
        .pf-field { display:flex; align-items:center; padding:.875rem 1.25rem; border-bottom:1px solid var(--w08); gap:1rem; transition:background .15s; min-height:62px; }
        .pf-field:last-child { border-bottom:none; }
        .pf-field:hover { background:rgba(240,244,255,.02); }
        .pf-field-label { display:flex; align-items:center; gap:.5rem; font-size:.7rem; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--w40); width:110px; flex-shrink:0; }
        .pf-field-ico { color:var(--blue2); display:flex; align-items:center; }
        .pf-field-value { font-size:.9rem; color:var(--w70); flex:1; }
        .pf-field-edit { flex:1; display:flex; align-items:center; gap:.5rem; }
        .pf-input {
          flex:1; background:var(--ink4); border:1px solid var(--blue-border);
          border-radius:8px; padding:.55rem .75rem;
          font-size:.875rem; color:var(--w); font-family:'Outfit',sans-serif;
          outline:none; box-shadow:0 0 0 3px var(--blue-dim); -webkit-appearance:none;
        }
        .pf-input::placeholder { color:var(--w20); }
        .pf-field-actions { display:flex; gap:.35rem; flex-shrink:0; }
        .pf-btn-save { width:30px; height:30px; border-radius:7px; border:none; background:rgba(34,197,94,.15); color:#22c55e; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background .15s; }
        .pf-btn-save:hover { background:rgba(34,197,94,.25); }
        .pf-btn-cancel { width:30px; height:30px; border-radius:7px; border:none; background:rgba(239,68,68,.1); color:#ef4444; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background .15s; }
        .pf-btn-cancel:hover { background:rgba(239,68,68,.2); }
        .pf-edit-btn { display:flex; align-items:center; gap:.35rem; font-size:.7rem; font-weight:600; color:var(--blue2); background:var(--blue-dim); border:1px solid var(--blue-border); border-radius:6px; padding:.25rem .6rem; cursor:pointer; transition:background .15s; margin-left:auto; flex-shrink:0; }
        .pf-edit-btn:hover { background:rgba(59,130,246,.18); }

        .pf-info-card { background:var(--blue-dim); border:1px solid var(--blue-border); border-radius:12px; padding:.875rem 1.1rem; display:flex; align-items:flex-start; gap:.6rem; font-size:.75rem; color:var(--blue3); line-height:1.5; margin-bottom:1rem; }

        .fu{opacity:0;transform:translateY(14px);transition:opacity .5s cubic-bezier(.22,1,.36,1),transform .5s cubic-bezier(.22,1,.36,1)}
        .fu.in{opacity:1;transform:none}
        .d1{transition-delay:.06s}.d2{transition-delay:.13s}.d3{transition-delay:.20s}

        @supports(padding-bottom:env(safe-area-inset-bottom)) {
          .pf-page { padding-bottom:calc(6rem + env(safe-area-inset-bottom)); }
        }
      `}</style>

      <div className="pf-page">
        <div className="pf-topbar" />

        {/* Hero */}
        <div className={`pf-hero fu ${mounted ? 'in' : ''}`}>
          <div className="pf-hero-bg" />
          <div className="pf-avatar-wrap">
            <div className="pf-avatar" style={{ background:`linear-gradient(135deg,${roleColor}22,${roleColor}44)`, color:roleColor }}>
              {initials}
            </div>
            <div className="pf-avatar-ring" style={{ borderColor:`${roleColor}30` }} />
            <div className="pf-avatar-dot" />
          </div>
          <div className="pf-hero-name">{fullName}</div>
          <div className="pf-hero-email">{user.email}</div>
          <div className="pf-role-badge" style={{ color:roleColor, background:`${roleColor}15`, borderColor:`${roleColor}35` }}>
            <div className="pf-role-dot" style={{ background:roleColor }} />
            {ROLE_LABELS[user.role] ?? user.role}
          </div>
        </div>

        {/* Info banner */}
        <div className={`pf-info-card fu d1 ${mounted ? 'in' : ''}`}>
          <Shield size={14} style={{ flexShrink:0, marginTop:2 }} />
          El correo electrónico y la contraseña se gestionan desde Firebase Authentication y no se pueden cambiar aquí.
        </div>

        {/* Datos personales */}
        <div className={`pf-card fu d2 ${mounted ? 'in' : ''}`}>
          <div className="pf-card-hd">
            <div className="pf-card-hd-ico"><User size={14} /></div>
            <div>
              <div className="pf-card-title">Datos Personales</div>
              <div className="pf-card-sub">Toca Editar para modificar un campo</div>
            </div>
          </div>
          <div className="pf-fields">

            {/* Nombre */}
            <div className="pf-field">
              <div className="pf-field-label"><span className="pf-field-ico"><User size={12}/></span>Nombre</div>
              {editing === 'nombre' ? (
                <div className="pf-field-edit">
                  <input className="pf-input" value={tempNombre} onChange={e => setTempNombre(e.target.value)} autoFocus />
                  <div className="pf-field-actions">
                    <button className="pf-btn-save" onClick={() => saveField('nombre', tempNombre)} disabled={saving}><Check size={13}/></button>
                    <button className="pf-btn-cancel" onClick={cancelEdit}><X size={13}/></button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="pf-field-value">{nombre || '—'}</div>
                  <button className="pf-edit-btn" onClick={() => startEdit('nombre')}><Edit3 size={11}/>Editar</button>
                </>
              )}
            </div>

            {/* Apellido */}
            <div className="pf-field">
              <div className="pf-field-label"><span className="pf-field-ico"><User size={12}/></span>Apellido</div>
              {editing === 'apellido' ? (
                <div className="pf-field-edit">
                  <input className="pf-input" value={tempApellido} onChange={e => setTempApellido(e.target.value)} autoFocus />
                  <div className="pf-field-actions">
                    <button className="pf-btn-save" onClick={() => saveField('apellido', tempApellido)} disabled={saving}><Check size={13}/></button>
                    <button className="pf-btn-cancel" onClick={cancelEdit}><X size={13}/></button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="pf-field-value">{apellido || '—'}</div>
                  <button className="pf-edit-btn" onClick={() => startEdit('apellido')}><Edit3 size={11}/>Editar</button>
                </>
              )}
            </div>

            {/* Teléfono */}
            <div className="pf-field">
              <div className="pf-field-label"><span className="pf-field-ico"><Phone size={12}/></span>Teléfono</div>
              {editing === 'telefono' ? (
                <div className="pf-field-edit">
                  <input
                    className="pf-input" type="tel" inputMode="numeric"
                    value={formatPhone(tempTelefono)}
                    onChange={e => { const digits = e.target.value.replace(/\D/g, '').slice(0, 10); setTempTelefono(digits); }}
                    autoFocus placeholder="809-552-3545" maxLength={12}
                  />
                  <div className="pf-field-actions">
                    <button className="pf-btn-save" onClick={() => saveField('telefono', tempTelefono)} disabled={saving}><Check size={13}/></button>
                    <button className="pf-btn-cancel" onClick={cancelEdit}><X size={13}/></button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="pf-field-value">{telefono ? formatPhone(telefono) : '—'}</div>
                  <button className="pf-edit-btn" onClick={() => startEdit('telefono')}><Edit3 size={11}/>Editar</button>
                </>
              )}
            </div>

          </div>
        </div>

        {/* Cuenta (solo lectura) */}
        <div className={`pf-card fu d3 ${mounted ? 'in' : ''}`}>
          <div className="pf-card-hd">
            <div className="pf-card-hd-ico"><Shield size={14} /></div>
            <div>
              <div className="pf-card-title">Cuenta</div>
              <div className="pf-card-sub">Datos gestionados por Firebase Auth</div>
            </div>
          </div>
          <div className="pf-fields">
            <div className="pf-field">
              <div className="pf-field-label"><span className="pf-field-ico"><Mail size={12}/></span>Correo</div>
              <div className="pf-field-value" style={{ color:'var(--w40)' }}>{user.email}</div>
              <div style={{ fontSize:'.65rem',color:'var(--w20)',marginLeft:'auto',flexShrink:0 }}>Solo lectura</div>
            </div>
            <div className="pf-field">
              <div className="pf-field-label"><span className="pf-field-ico"><Shield size={12}/></span>Rol</div>
              <div className="pf-field-value">
                <span style={{ color:roleColor, fontWeight:600 }}>{ROLE_LABELS[user.role] ?? user.role}</span>
              </div>
              <div style={{ fontSize:'.65rem',color:'var(--w20)',marginLeft:'auto',flexShrink:0 }}>Solo lectura</div>
            </div>
          </div>
        </div>

      </div>
    </AppShell>
  );
}

export default function ProfilePage() {
  return <ProfileContent />;
}