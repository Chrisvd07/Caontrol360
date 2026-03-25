'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Eye, EyeOff, ArrowRight, ArrowLeft, Shield, User, Phone, Mail, Lock, ChevronDown } from 'lucide-react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import Link from 'next/link';

const ROLES = [
  { value: 'tecnico',      label: 'Técnico',       icon: '⚙️', desc: 'Soporte técnico' },
  { value: 'pagos',        label: 'Pagos',          icon: '💳', desc: 'Gestión de pagos' },
  { value: 'contabilidad', label: 'Contabilidad',   icon: '📊', desc: 'Reportes financieros' },
  { value: 'admin',        label: 'Administrador',  icon: '🛡️', desc: 'Control total' },
];

function useParticleCanvas(ref: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener('resize', resize);
    type P = { x: number; y: number; vx: number; vy: number; r: number; o: number };
    const pts: P[] = Array.from({ length: 55 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      vx: (Math.random() - .5) * .28, vy: (Math.random() - .5) * .28,
      r: Math.random() * 1.2 + .3, o: Math.random() * .45 + .08,
    }));
    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 110) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(201,168,76,${.09 * (1 - d / 110)})`;
            ctx.lineWidth = .5;
            ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
          }
        }
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, pts[i].r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(201,168,76,${pts[i].o})`;
        ctx.fill();
        pts[i].x += pts[i].vx; pts[i].y += pts[i].vy;
        if (pts[i].x < 0 || pts[i].x > canvas.width) pts[i].vx *= -1;
        if (pts[i].y < 0 || pts[i].y > canvas.height) pts[i].vy *= -1;
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [ref]);
}

function getStrength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++; if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++; if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 1) return { score: s, label: 'Muy débil',   color: '#ef4444' };
  if (s === 2) return { score: s, label: 'Débil',       color: '#f97316' };
  if (s === 3) return { score: s, label: 'Regular',     color: '#eab308' };
  if (s === 4) return { score: s, label: 'Fuerte',      color: '#22c55e' };
  return        { score: s, label: 'Muy fuerte',  color: '#10b981' };
}

export default function RegisterPage() {
  const router = useRouter();
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const mobCanvasRef = useRef<HTMLCanvasElement>(null);
  useParticleCanvas(canvasRef);
  useParticleCanvas(mobCanvasRef);

  const [mounted, setMounted]           = useState(false);
  const [step, setStep]                 = useState<1|2>(1);
  const [animDir, setAnimDir]           = useState<'forward'|'back'>('forward');
  const [animating, setAnimating]       = useState(false);
  const [visible, setVisible]           = useState(true);
  const [focusedField, setFocusedField] = useState<string|null>(null);
  const [isLoading, setIsLoading]       = useState(false);
  const [showPw, setShowPw]             = useState(false);
  const [showPw2, setShowPw2]           = useState(false);
  const [roleOpen, setRoleOpen]         = useState(false);

  const [nombre,    setNombre]    = useState('');
  const [apellido,  setApellido]  = useState('');
  const [email,     setEmail]     = useState('');
  const [telefono,  setTelefono]  = useState('');
  const [password,  setPassword]  = useState('');
  const [password2, setPassword2] = useState('');
  const [role,      setRole]      = useState('tecnico');

  useEffect(() => { setMounted(true); }, []);

  const selectedRole = ROLES.find(r => r.value === role)!;
  const strength     = getStrength(password);

  const goToStep = (n: 1|2) => {
    if (animating) return;
    if (n === 2) {
      if (!nombre.trim())   { toast.error('Ingresa tu nombre');   return; }
      if (!apellido.trim()) { toast.error('Ingresa tu apellido'); return; }
      if (!email.trim() || !email.includes('@')) { toast.error('Email inválido'); return; }
      if (!telefono.trim()) { toast.error('Ingresa tu teléfono'); return; }
    }
    setAnimDir(n > step ? 'forward' : 'back');
    setAnimating(true);
    setVisible(false);
    setTimeout(() => {
      setStep(n);
      setVisible(true);
      setTimeout(() => setAnimating(false), 400);
    }, 320);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password)              { toast.error('Ingresa una contraseña');         return; }
    if (password !== password2) { toast.error('Las contraseñas no coinciden');   return; }
    if (password.length < 6)    { toast.error('Mínimo 6 caracteres');            return; }
    setIsLoading(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = credential.user.uid;
      // Solo guardamos datos no sensibles — la contraseña la maneja Firebase Auth
      await setDoc(doc(db, 'users', uid), {
        uid, nombre, apellido,
        name: `${nombre} ${apellido}`,
        email, telefono, role,
        createdAt: Timestamp.now(),
        active: true,
      });
      toast.success(`Bienvenido, ${nombre}! Tu cuenta fue creada.`);
      const routes: Record<string,string> = { tecnico:'/tecnico', pagos:'/pagos', contabilidad:'/contabilidad', admin:'/admin' };
      router.push(routes[role] ?? '/');
    } catch (err: any) {
      const msg: Record<string,string> = {
        'auth/email-already-in-use': 'Este email ya está registrado',
        'auth/invalid-email':        'Email inválido',
        'auth/weak-password':        'Contraseña muy débil (mínimo 6 caracteres)',
      };
      toast.error(msg[err.code] ?? 'Error al crear la cuenta');
    } finally { setIsLoading(false); }
  };

  const panelStyle: React.CSSProperties = {
    opacity:   visible ? 1 : 0,
    transform: visible ? 'translateX(0)' : `translateX(${animDir === 'forward' ? '28px' : '-28px'})`,
    transition: 'opacity .32s cubic-bezier(.22,1,.36,1), transform .32s cubic-bezier(.22,1,.36,1)',
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="pg" onClick={() => roleOpen && setRoleOpen(false)}>

        {/* LEFT */}
        <div className="pg-left">
          <canvas ref={canvasRef} className="pg-canvas" />
          <div className="blob blob-gold"/><div className="blob blob-teal"/>
          <div className="pg-diagonal"/>
          <svg className="pg-grid-svg" xmlns="http://www.w3.org/2000/svg">
            <defs><pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="white" strokeWidth="0.5"/></pattern></defs>
            <rect width="100%" height="100%" fill="url(#grid)"/>
          </svg>
          <div className="pg-left-content">
            <div className="pg-brand">
              <div className="pg-brand-mark">◈</div>
              <span className="pg-brand-name">GastoFlow</span>
            </div>
            <div className="pg-hero">
              <div className="eyebrow">Nuevo en la plataforma</div>
              <h1 className="pg-hero-title">Únete al equipo<br/>de <em>control financiero</em></h1>
              <p className="pg-hero-desc">Crea tu cuenta en segundos y empieza a gestionar solicitudes, aprobaciones y reportes desde el primer día.</p>
              <div style={{ display:'flex', flexDirection:'column', gap:'.85rem' }}>
                {[
                  { n:1, title:'Datos personales', desc:'Nombre, email y teléfono' },
                  { n:2, title:'Seguridad y rol',  desc:'Contraseña y área de trabajo' },
                ].map(s => (
                  <div key={s.n} style={{ display:'flex', alignItems:'center', gap:'.75rem' }}>
                    <div style={{
                      width:28, height:28, borderRadius:'50%', flexShrink:0,
                      background: step >= s.n ? 'rgba(201,168,76,.1)' : 'transparent',
                      border: `1.5px solid ${step >= s.n ? 'rgba(201,168,76,.28)' : 'rgba(244,241,234,.08)'}`,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:'.72rem', fontWeight:700,
                      color: step >= s.n ? '#c9a84c' : 'rgba(244,241,234,.2)',
                      transition:'all .35s',
                    }}>{s.n}</div>
                    <div>
                      <div style={{ fontSize:'.82rem', fontWeight:500, color: step >= s.n ? 'rgba(244,241,234,.7)' : 'rgba(244,241,234,.4)', transition:'color .35s' }}>{s.title}</div>
                      <div style={{ fontSize:'.68rem', color:'rgba(244,241,234,.2)', fontWeight:300 }}>{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="pg-right">
          <canvas ref={mobCanvasRef} className="mob-canvas"/>
          <div className="mob-blob-gold"/><div className="mob-blob-teal"/>
          <svg className="mob-grid" xmlns="http://www.w3.org/2000/svg">
            <defs><pattern id="mgrid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="white" strokeWidth="0.5"/></pattern></defs>
            <rect width="100%" height="100%" fill="url(#mgrid)"/>
          </svg>
          <div className="pg-right-bar"/>
          <div className="pg-live"><div className="pg-live-dot"/>En línea</div>

          <div className="pg-right-inner">
            <div className={`mob-brand fu ${mounted?'in':''}`}>
              <div className="mob-brand-mark">◈</div>
              <span className="mob-brand-name">GastoFlow</span>
            </div>

            {/* Steps indicator */}
            <div className={`fu ${mounted?'in':''}`} style={{ marginBottom:'1.5rem' }}>
              <div className="steps-indicator">
                <div className="step-item">
                  <div className={`step-circle ${step===1?'active':'done'}`}>{step>1?'✓':'1'}</div>
                  <span className={`step-label ${step===1?'active':'done'}`}>Datos</span>
                </div>
                <div className={`step-line ${step>1?'done':''}`}/>
                <div className="step-item">
                  <div className={`step-circle ${step===2?'active':''}`}>2</div>
                  <span className={`step-label ${step===2?'active':''}`}>Seguridad</span>
                </div>
              </div>
            </div>

            {/* STEP 1 */}
            {step === 1 && (
              <div className={`fu ${mounted?'in':''}`} style={panelStyle}>
                <div className="reg-hd">
                  <div className="reg-eyebrow">Paso 1 de 2</div>
                  <h2 className="reg-title">Datos Personales</h2>
                  <p className="reg-sub">Ingresa tu información básica para crear la cuenta</p>
                </div>
                <div className="form-grid">
                  <div className={`field-wrap ${focusedField==='nombre'?'foc':''}`}>
                    <label className="field-lbl">Nombre</label>
                    <div className="input-shell">
                      <User className="input-ico"/>
                      <input className="inp" placeholder="Juan" value={nombre} onChange={e=>setNombre(e.target.value)}
                        onFocus={()=>setFocusedField('nombre')} onBlur={()=>setFocusedField(null)}/>
                    </div>
                  </div>
                  <div className={`field-wrap ${focusedField==='apellido'?'foc':''}`}>
                    <label className="field-lbl">Apellido</label>
                    <div className="input-shell">
                      <User className="input-ico"/>
                      <input className="inp" placeholder="Pérez" value={apellido} onChange={e=>setApellido(e.target.value)}
                        onFocus={()=>setFocusedField('apellido')} onBlur={()=>setFocusedField(null)}/>
                    </div>
                  </div>
                </div>
                <div className="form-grid single" style={{marginBottom:'.85rem'}}>
                  <div className={`field-wrap ${focusedField==='email'?'foc':''}`}>
                    <label className="field-lbl">Correo Electrónico</label>
                    <div className="input-shell">
                      <Mail className="input-ico"/>
                      <input type="email" className="inp" placeholder="juan@empresa.com" value={email} onChange={e=>setEmail(e.target.value)}
                        onFocus={()=>setFocusedField('email')} onBlur={()=>setFocusedField(null)} autoComplete="email"/>
                    </div>
                  </div>
                </div>
                <div className="form-grid single">
                  <div className={`field-wrap ${focusedField==='tel'?'foc':''}`}>
                    <label className="field-lbl">Teléfono <span style={{fontWeight:300,fontSize:'.6rem',textTransform:'none',letterSpacing:0,color:'rgba(244,241,234,.2)'}}>para recuperación</span></label>
                    <div className="input-shell">
                      <Phone className="input-ico"/>
                      <input type="tel" className="inp" placeholder="+1 (809) 000-0000" value={telefono} onChange={e=>setTelefono(e.target.value)}
                        onFocus={()=>setFocusedField('tel')} onBlur={()=>setFocusedField(null)}/>
                    </div>
                  </div>
                </div>
                <div className="btn-row">
                  <button type="button" className="sbtn" onClick={()=>goToStep(2)}>
                    Continuar <ArrowRight className="sbtn-arrow"/>
                  </button>
                </div>
                <div className="divider"/>
                <div className="login-link">¿Ya tienes cuenta? <Link href="/login">Inicia sesión aquí</Link></div>
              </div>
            )}

            {/* STEP 2 */}
            {step === 2 && (
              <form onSubmit={handleSubmit} className={`fu ${mounted?'in':''}`} style={panelStyle}>
                <div className="reg-hd">
                  <div className="reg-eyebrow">Paso 2 de 2</div>
                  <h2 className="reg-title">Seguridad y Rol</h2>
                  <p className="reg-sub">Elige una contraseña segura y tu área de trabajo</p>
                </div>

                {/* Password */}
                <div className="form-grid single" style={{marginBottom:'.85rem'}}>
                  <div className={`field-wrap ${focusedField==='pw'?'foc':''}`}>
                    <label className="field-lbl">Contraseña</label>
                    <div className="input-shell">
                      <Lock className="input-ico"/>
                      <input type={showPw?'text':'password'} className="inp rpad" placeholder="Mínimo 6 caracteres"
                        value={password} onChange={e=>setPassword(e.target.value)}
                        onFocus={()=>setFocusedField('pw')} onBlur={()=>setFocusedField(null)} autoComplete="new-password"/>
                      <button type="button" className="eye-btn" onClick={()=>setShowPw(!showPw)}>
                        {showPw?<EyeOff style={{width:14,height:14}}/>:<Eye style={{width:14,height:14}}/>}
                      </button>
                    </div>
                    {password && (
                      <div className="pw-strength">
                        <div className="pw-bars">
                          {[1,2,3,4,5].map(i=>(
                            <div key={i} className="pw-bar" style={{background:i<=strength.score?strength.color:undefined}}/>
                          ))}
                        </div>
                        <div className="pw-label" style={{color:strength.color}}>{strength.label}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Confirm password */}
                <div className="form-grid single" style={{marginBottom:'.85rem'}}>
                  <div className={`field-wrap ${focusedField==='pw2'?'foc':''}`}>
                    <label className="field-lbl">Confirmar Contraseña</label>
                    <div className="input-shell">
                      <Lock className="input-ico"/>
                      <input type={showPw2?'text':'password'} className="inp rpad" placeholder="Repite la contraseña"
                        value={password2} onChange={e=>setPassword2(e.target.value)}
                        onFocus={()=>setFocusedField('pw2')} onBlur={()=>setFocusedField(null)} autoComplete="new-password"/>
                      <button type="button" className="eye-btn" onClick={()=>setShowPw2(!showPw2)}>
                        {showPw2?<EyeOff style={{width:14,height:14}}/>:<Eye style={{width:14,height:14}}/>}
                      </button>
                    </div>
                    {password2 && password!==password2 && <div style={{fontSize:'.68rem',color:'#ef4444',marginTop:'.3rem'}}>Las contraseñas no coinciden</div>}
                    {password2 && password===password2 && <div style={{fontSize:'.68rem',color:'#22c55e',marginTop:'.3rem'}}>✓ Las contraseñas coinciden</div>}
                  </div>
                </div>

                {/* Role */}
                <div className="form-grid single">
                  <div className="field-wrap">
                    <label className="field-lbl">
                      Rol
                      <span style={{marginLeft:'.4rem',fontSize:'.6rem',color:'#c9a84c',background:'rgba(201,168,76,.1)',border:'1px solid rgba(201,168,76,.28)',borderRadius:99,padding:'.12rem .45rem',fontWeight:600,textTransform:'none',letterSpacing:0}}>
                        Por defecto: Técnico
                      </span>
                    </label>
                    <div className="role-selector" onClick={e=>e.stopPropagation()}>
                      <button type="button" className={`role-btn ${roleOpen?'open':''}`} onClick={()=>setRoleOpen(!roleOpen)}>
                        <User className="input-ico" style={{left:12}}/>
                        <span style={{fontSize:'.9rem'}}>{selectedRole.icon}</span>
                        <span style={{flex:1}}>{selectedRole.label}</span>
                        <ChevronDown style={{width:14,height:14,color:'rgba(244,241,234,.2)',transition:'transform .25s',transform:roleOpen?'rotate(180deg)':'none',position:'absolute',right:12}}/>
                      </button>
                      {roleOpen && (
                        <div className="role-dropdown">
                          {ROLES.map(r=>(
                            <div key={r.value} className={`role-option ${role===r.value?'selected':''}`} onClick={()=>{setRole(r.value);setRoleOpen(false);}}>
                              <span style={{fontSize:'.9rem'}}>{r.icon}</span>
                              <div style={{flex:1}}>
                                <span style={{fontSize:'.82rem',fontWeight:500,color:'rgba(244,241,234,1)',display:'block'}}>{r.label}</span>
                                <span style={{fontSize:'.67rem',color:'rgba(244,241,234,.4)'}}>{r.desc}</span>
                              </div>
                              <div style={{width:14,height:14,borderRadius:'50%',border:`1.5px solid ${role===r.value?'#c9a84c':'rgba(244,241,234,.2)'}`,background:role===r.value?'#c9a84c':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                                {role===r.value && <div style={{width:5,height:5,borderRadius:'50%',background:'#06040a'}}/>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="btn-row">
                  <button type="button" className="btn-back" onClick={()=>goToStep(1)}>
                    <ArrowLeft style={{width:14,height:14}}/> Volver
                  </button>
                  <button type="submit" className="sbtn" disabled={isLoading}>
                    {isLoading?<><div className="spin"/> Creando...</>:<>Crear Cuenta <ArrowRight className="sbtn-arrow"/></>}
                  </button>
                </div>
                <div className="sec-badge">
                  <Shield style={{width:10,height:10}}/>
                  <span>La contraseña se cifra con Firebase Auth · Nunca en texto plano</span>
                </div>
                <div className="divider"/>
                <div className="login-link">¿Ya tienes cuenta? <Link href="/login">Inicia sesión aquí</Link></div>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Outfit:wght@300;400;500;600&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --ink:#080a0e; --ink2:#0e1117; --ink3:#141820; --ink4:#1a2030;
  --gold:#c9a84c; --gold2:#e2bd6a; --gold3:#f0d080;
  --gold-dim:rgba(201,168,76,.10); --gold-glow:rgba(201,168,76,.22); --gold-border:rgba(201,168,76,.28);
  --w:#f4f1ea; --w70:rgba(244,241,234,.70); --w40:rgba(244,241,234,.40); --w20:rgba(244,241,234,.20); --w08:rgba(244,241,234,.08);
}
.pg { font-family:'Outfit',sans-serif; min-height:100vh; display:grid; grid-template-columns:1fr 500px; background:var(--ink); overflow:hidden; }
.pg-left { position:relative; background:var(--ink2); overflow:hidden; display:flex; flex-direction:column; padding:2.5rem; }
.pg-canvas { position:absolute; inset:0; width:100%; height:100%; }
.blob { position:absolute; border-radius:50%; filter:blur(90px); pointer-events:none; animation:blobmove 10s ease-in-out infinite alternate; }
.blob-gold { width:560px; height:560px; background:radial-gradient(circle,rgba(201,168,76,.16) 0%,transparent 65%); bottom:-180px; left:-120px; }
.blob-teal { width:380px; height:380px; background:radial-gradient(circle,rgba(45,212,191,.07) 0%,transparent 65%); top:5%; right:0; animation-direction:alternate-reverse; animation-duration:14s; }
@keyframes blobmove { 0%{transform:translate(0,0) scale(1)} 100%{transform:translate(18px,12px) scale(1.1)} }
.pg-diagonal { position:absolute; top:-20%; right:-8%; width:50%; height:140%; background:linear-gradient(155deg,rgba(201,168,76,.03) 0%,transparent 55%); border-left:1px solid rgba(201,168,76,.07); transform:rotate(-7deg); pointer-events:none; }
.pg-grid-svg { position:absolute; inset:0; width:100%; height:100%; opacity:.025; pointer-events:none; }
.pg-left-content { position:relative; z-index:2; display:flex; flex-direction:column; height:100%; }
.pg-brand { display:flex; align-items:center; gap:.75rem; margin-bottom:auto; }
.pg-brand-mark { width:36px; height:36px; background:linear-gradient(135deg,var(--gold),#7a5a10); border-radius:9px; display:flex; align-items:center; justify-content:center; font-size:15px; box-shadow:0 4px 20px var(--gold-glow); flex-shrink:0; }
.pg-brand-name { font-family:'Playfair Display',serif; font-size:1.2rem; color:var(--w); font-weight:500; letter-spacing:.02em; }
.pg-hero { margin:auto 0; }
.eyebrow { font-size:.68rem; font-weight:600; letter-spacing:.18em; text-transform:uppercase; color:var(--gold); margin-bottom:1.1rem; display:flex; align-items:center; gap:.6rem; }
.eyebrow::before { content:''; display:block; width:24px; height:1px; background:var(--gold); opacity:.55; }
.pg-hero-title { font-family:'Playfair Display',serif; font-size:clamp(2rem,3vw,2.8rem); font-weight:500; line-height:1.22; color:var(--w); margin-bottom:1.1rem; letter-spacing:-.01em; }
.pg-hero-title em { font-style:italic; background:linear-gradient(125deg,var(--gold2) 30%,var(--gold3)); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
.pg-hero-desc { font-size:.875rem; line-height:1.75; color:var(--w40); max-width:400px; margin-bottom:2rem; font-weight:300; }
.pg-right { position:relative; background:var(--ink); border-left:1px solid var(--w08); display:flex; flex-direction:column; overflow-y:auto; }
.pg-right-bar { position:absolute; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent 0%,var(--gold) 40%,var(--gold2) 60%,transparent 100%); opacity:.65; }
.pg-live { position:absolute; top:1.2rem; right:1.2rem; display:flex; align-items:center; gap:.35rem; font-size:.62rem; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:var(--w20); }
.pg-live-dot { width:5px; height:5px; border-radius:50%; background:#22c55e; box-shadow:0 0 6px rgba(34,197,94,.6); animation:liveblink 2.2s ease-in-out infinite; }
@keyframes liveblink { 0%,100%{opacity:.5} 50%{opacity:1} }
.pg-right-inner { flex:1; display:flex; flex-direction:column; justify-content:center; padding:2.5rem; min-height:100vh; }
.fu { opacity:0; transform:translateY(16px); transition:opacity .55s cubic-bezier(.22,1,.36,1),transform .55s cubic-bezier(.22,1,.36,1); }
.fu.in { opacity:1; transform:translateY(0); }
.steps-indicator { display:flex; align-items:center; gap:.75rem; }
.step-item { display:flex; align-items:center; gap:.5rem; }
.step-circle { width:28px; height:28px; border-radius:50%; border:1.5px solid var(--w08); display:flex; align-items:center; justify-content:center; font-size:.72rem; font-weight:700; color:var(--w40); transition:all .35s; flex-shrink:0; }
.step-circle.active { border-color:var(--gold); background:var(--gold-dim); color:var(--gold); box-shadow:0 0 12px var(--gold-dim); }
.step-circle.done { border-color:rgba(34,197,94,.4); background:rgba(34,197,94,.1); color:#22c55e; }
.step-label { font-size:.7rem; color:var(--w40); font-weight:500; transition:color .3s; }
.step-label.active { color:var(--gold); }
.step-label.done { color:rgba(34,197,94,.7); }
.step-line { flex:1; height:1px; background:var(--w08); transition:background .35s; }
.step-line.done { background:rgba(34,197,94,.3); }
.reg-hd { margin-bottom:1.75rem; }
.reg-eyebrow { font-size:.67rem; font-weight:600; letter-spacing:.16em; text-transform:uppercase; color:var(--gold); margin-bottom:.65rem; }
.reg-title { font-family:'Playfair Display',serif; font-size:1.55rem; font-weight:500; color:var(--w); letter-spacing:-.01em; margin-bottom:.4rem; line-height:1.2; }
.reg-sub { font-size:.78rem; color:var(--w40); font-weight:300; line-height:1.55; }
.form-grid { display:grid; grid-template-columns:1fr 1fr; gap:.85rem; margin-bottom:.85rem; }
.form-grid.single { grid-template-columns:1fr; }
.field-wrap { display:flex; flex-direction:column; gap:.4rem; }
.field-lbl { font-size:.67rem; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--w40); transition:color .2s; }
.field-wrap.foc .field-lbl { color:var(--gold); }
.input-shell { position:relative; }
.input-ico { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--w20); width:14px; height:14px; pointer-events:none; transition:color .25s; flex-shrink:0; }
.field-wrap.foc .input-ico { color:var(--gold); }
.inp { width:100%; background:var(--ink3); border:1px solid var(--w08); border-radius:10px; padding:.75rem .875rem .75rem 2.4rem; font-size:.855rem; color:var(--w); font-family:'Outfit',sans-serif; font-weight:400; outline:none; transition:border-color .25s,background .25s,box-shadow .25s; -webkit-appearance:none; }
.inp::placeholder { color:var(--w20); }
.inp:focus { border-color:var(--gold-border); background:var(--ink4); box-shadow:0 0 0 3px var(--gold-dim); }
.inp.rpad { padding-right:2.75rem; }
.eye-btn { position:absolute; right:11px; top:50%; transform:translateY(-50%); background:none; border:none; padding:3px; color:var(--w20); cursor:pointer; display:flex; align-items:center; transition:color .2s; }
.eye-btn:hover { color:var(--w70); }
.pw-strength { margin-top:.5rem; }
.pw-bars { display:flex; gap:.3rem; margin-bottom:.3rem; }
.pw-bar { flex:1; height:3px; border-radius:99px; background:var(--w08); transition:background .3s; }
.pw-label { font-size:.65rem; display:flex; justify-content:flex-end; }
.role-selector { position:relative; }
.role-btn { width:100%; background:var(--ink3); border:1px solid var(--w08); border-radius:10px; padding:.75rem 2.75rem .75rem 2.4rem; font-family:'Outfit',sans-serif; font-size:.855rem; color:var(--w); cursor:pointer; display:flex; align-items:center; gap:.6rem; text-align:left; transition:border-color .25s,background .25s,box-shadow .25s; position:relative; }
.role-btn:hover, .role-btn.open { border-color:var(--gold-border); background:var(--ink4); box-shadow:0 0 0 3px var(--gold-dim); }
.role-dropdown { position:absolute; top:calc(100% + 6px); left:0; right:0; background:var(--ink3); border:1px solid var(--gold-border); border-radius:12px; overflow:hidden; z-index:50; box-shadow:0 12px 40px rgba(0,0,0,.5); animation:dropIn .2s cubic-bezier(.22,1,.36,1); }
@keyframes dropIn { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:none} }
.role-option { display:flex; align-items:center; gap:.65rem; padding:.75rem 1rem; cursor:pointer; transition:background .15s; border-bottom:1px solid var(--w08); }
.role-option:last-child { border-bottom:none; }
.role-option:hover { background:var(--ink4); }
.role-option.selected { background:var(--gold-dim); }
.btn-row { display:flex; gap:.75rem; margin-top:1.25rem; }
.sbtn { flex:1; position:relative; background:linear-gradient(135deg,#c9a84c 0%,#9a7018 100%); color:#06040a; border:none; border-radius:10px; padding:.875rem 1.5rem; font-family:'Outfit',sans-serif; font-size:.875rem; font-weight:600; letter-spacing:.045em; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:.5rem; overflow:hidden; transition:transform .2s cubic-bezier(.22,1,.36,1),box-shadow .2s,filter .2s; box-shadow:0 4px 24px rgba(201,168,76,.32),0 1px 0 rgba(255,255,255,.14) inset; }
.sbtn::after { content:''; position:absolute; inset:0; background:linear-gradient(180deg,rgba(255,255,255,.1) 0%,transparent 100%); }
.sbtn:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 8px 36px rgba(201,168,76,.42); filter:brightness(1.06); }
.sbtn:disabled { opacity:.5; cursor:not-allowed; }
.sbtn-arrow { width:16px; height:16px; transition:transform .25s; flex-shrink:0; }
.sbtn:hover:not(:disabled) .sbtn-arrow { transform:translateX(4px); }
.btn-back { background:var(--ink3); border:1px solid var(--w08); border-radius:10px; padding:.875rem 1.1rem; color:var(--w40); font-family:'Outfit',sans-serif; font-size:.875rem; font-weight:500; cursor:pointer; display:flex; align-items:center; gap:.4rem; transition:border-color .2s,color .2s; white-space:nowrap; }
.btn-back:hover { border-color:var(--gold-border); color:var(--gold); }
.spin { width:15px; height:15px; border:2px solid rgba(0,0,0,.18); border-top-color:#06040a; border-radius:50%; animation:sp .65s linear infinite; }
@keyframes sp { to{transform:rotate(360deg)} }
.sec-badge { display:flex; align-items:center; justify-content:center; gap:.4rem; margin-top:.85rem; font-size:.68rem; color:var(--w20); }
.divider { height:1px; background:linear-gradient(90deg,transparent,var(--w08) 30%,var(--w08) 70%,transparent); margin:1.25rem 0; }
.login-link { text-align:center; font-size:.78rem; color:var(--w40); }
.login-link a { color:var(--gold); text-decoration:none; font-weight:500; transition:opacity .2s; }
.login-link a:hover { opacity:.75; }
@media (max-width:860px) {
  .pg-left { display:none; }
  .pg { grid-template-columns:1fr; }
  .pg-right { border-left:none; background:var(--ink2); min-height:100vh; }
  .mob-canvas { display:block !important; position:fixed; inset:0; width:100%; height:100%; pointer-events:none; z-index:0; }
  .mob-blob-gold { display:block !important; position:fixed; width:420px; height:420px; border-radius:50%; filter:blur(90px); background:radial-gradient(circle,rgba(201,168,76,.18) 0%,transparent 65%); bottom:-140px; left:-100px; pointer-events:none; animation:blobmove 10s ease-in-out infinite alternate; z-index:0; }
  .mob-blob-teal { display:block !important; position:fixed; width:300px; height:300px; border-radius:50%; filter:blur(80px); background:radial-gradient(circle,rgba(45,212,191,.08) 0%,transparent 65%); top:5%; right:-60px; pointer-events:none; animation:blobmove 14s ease-in-out infinite alternate-reverse; z-index:0; }
  .mob-grid { display:block !important; position:fixed; inset:0; width:100%; height:100%; opacity:.022; pointer-events:none; z-index:0; }
  .pg-right-bar { position:fixed; z-index:2; }
  .pg-live, .pg-right-inner { position:relative; z-index:1; }
  .pg-right-inner { min-height:100vh; padding:3rem 1.5rem; justify-content:center; }
  .mob-brand { display:flex !important; align-items:center; gap:.6rem; margin-bottom:1.75rem; }
  .mob-brand-mark { width:34px; height:34px; background:linear-gradient(135deg,var(--gold),#7a5a10); border-radius:9px; display:flex; align-items:center; justify-content:center; font-size:14px; box-shadow:0 4px 16px var(--gold-glow); }
  .mob-brand-name { font-family:'Playfair Display',serif; font-size:1.15rem; color:var(--w); font-weight:500; letter-spacing:.02em; }
  .form-grid { grid-template-columns:1fr; }
}
.mob-canvas,.mob-blob-gold,.mob-blob-teal,.mob-grid,.mob-brand { display:none; }
`;