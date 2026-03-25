'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';
import { Eye, EyeOff, ArrowRight, ChevronRight, Shield } from 'lucide-react';
import Link from 'next/link';

const DEMO_USERS = [
  { role: 'Tecnico',      email: 'tecnico@control360.com',      password: 'tecnico',      icon: '⚙️', desc: 'Soporte técnico' },
  { role: 'Pagos',        email: 'pagos@control360.com',        password: 'pagos',        icon: '💳', desc: 'Gestión de pagos' },
  { role: 'Contabilidad', email: 'contabilidad@control360.com', password: 'contabilidad', icon: '📊', desc: 'Reportes financieros' },
  { role: 'Admin',        email: 'admin@control360.com',        password: 'admin',        icon: '🛡️', desc: 'Control total' },
];

const FEATURES = [
  'Gestión centralizada de solicitudes',
  'Flujo de aprobaciones multi-nivel',
  'Reportes financieros en tiempo real',
  'Auditoría completa de transacciones',
];

const STATS = [
  { label: 'Solicitudes', value: '12,847' },
  { label: 'Usuarios',    value: '384'    },
  { label: 'Aprobación',  value: '98.2%'  },
];

/* ─── Logo Control 360 — fiel al logo real de la imagen ─── */
function BrandSVG({ height = 38 }: { height?: number }) {
  const uid = typeof height === 'number' ? `bsvg-${height}` : 'bsvg';
  return (
    <svg
      height={height}
      viewBox="0 0 340 70"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        {/* Gradiente principal para el 360 — azul brillante a oscuro */}
        <linearGradient id={`${uid}-360-grad`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#5db3ff" />
          <stop offset="30%"  stopColor="#2b8dd9" />
          <stop offset="70%"  stopColor="#1a5fa5" />
          <stop offset="100%" stopColor="#0f3d7a" />
        </linearGradient>
        
        {/* Gradiente para highlights/brillo */}
        <linearGradient id={`${uid}-shine`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#7ecfff" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#1a5fa5" stopOpacity="0.1"  />
        </linearGradient>
      </defs>

      {/* "Control" — azul marino sólido, peso 700 */}
      <text
        x="8" y="52"
        fontFamily="'Outfit', 'Segoe UI', sans-serif"
        fontWeight="700"
        fontSize="42"
        fill="#1a4d8f"
        letterSpacing="-0.8"
      >Control</text>

      {/* GRUPO DEL 360 — desplazado a la derecha con espacio moderado */}
      <g>
        {/* Líneas de viento superior izquierda (2 rayitas) */}
        <path
          d="M 165 8 Q 180 6 195 10"
          stroke="#5db3ff"
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
          opacity="0.8"
        />
        <path
          d="M 170 2 Q 190 0 205 5"
          stroke="#3a8bd9"
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
          opacity="0.6"
        />

        {/* "360" — itálico/cursivo con gradiente 3D */}
        {/* Primera capa: sombra para profundidad */}
        <text
          x="170" y="56"
          fontFamily="'Outfit', 'Segoe UI', sans-serif"
          fontWeight="900"
          fontSize="48"
          fill="#0a2d5a"
          letterSpacing="-2"
          fontStyle="italic"
          opacity="0.4"
        >360</text>

        {/* Segunda capa: gradiente principal */}
        <text
          x="168" y="54"
          fontFamily="'Outfit', 'Segoe UI', sans-serif"
          fontWeight="900"
          fontSize="48"
          fill={`url(#${uid}-360-grad)`}
          letterSpacing="-2"
          fontStyle="italic"
        >360</text>

        {/* Tercera capa: highlights brillantes */}
        <text
          x="168" y="54"
          fontFamily="'Outfit', 'Segoe UI', sans-serif"
          fontWeight="900"
          fontSize="48"
          fill={`url(#${uid}-shine)`}
          letterSpacing="-2"
          fontStyle="italic"
          style={{ pointerEvents: 'none' }}
        >360</text>

        {/* Elemento decorativo: línea curved inferior derecha */}
        <path
          d="M 195 54 Q 235 62 263 50"
          stroke="#3a7fb8"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.75"
        />
      </g>
    </svg>
  );
}

function useParticleCanvas(ref: React.RefObject<HTMLCanvasElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    window.addEventListener('resize', resize);
    type P = { x: number; y: number; vx: number; vy: number; r: number; o: number; isRed: boolean };
    const pts: P[] = Array.from({ length: 55 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.28,
      vy: (Math.random() - 0.5) * 0.28,
      r: Math.random() * 1.2 + 0.3,
      o: Math.random() * 0.45 + 0.08,
      isRed: Math.random() > 0.5,
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
            ctx.strokeStyle = `rgba(59,130,246,${0.09 * (1 - d / 110)})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
          }
        }
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, pts[i].r, 0, Math.PI * 2);
        ctx.fillStyle = pts[i].isRed
          ? `rgba(239,68,68,${pts[i].o})`
          : `rgba(96,165,250,${pts[i].o})`;
        ctx.fill();
        pts[i].x += pts[i].vx; pts[i].y += pts[i].vy;
        if (pts[i].x < 0 || pts[i].x > canvas.width)  pts[i].vx *= -1;
        if (pts[i].y < 0 || pts[i].y > canvas.height) pts[i].vy *= -1;
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [ref, active]);
}

const FIREBASE_ERRORS: Record<string, string> = {
  'auth/user-not-found':         'No existe una cuenta con ese correo',
  'auth/wrong-password':         'Contraseña incorrecta',
  'auth/invalid-email':          'Correo electrónico inválido',
  'auth/user-disabled':          'Esta cuenta ha sido deshabilitada',
  'auth/too-many-requests':      'Demasiados intentos fallidos. Intenta más tarde',
  'auth/invalid-credential':     'Credenciales inválidas. Verifica tu correo y contraseña',
  'auth/network-request-failed': 'Sin conexión. Verifica tu internet',
  'auth/operation-not-allowed':  'Método de autenticación no habilitado',
  'auth/popup-closed-by-user':   'Inicio de sesión cancelado',
};

/* ─────────────────────────────────────────────────────────────
   INTRO OVERLAY
───────────────────────────────────────────────────────────── */
function IntroOverlay({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<0 | 1 | 2 | 3>(0);

  useEffect(() => {
    const t0 = setTimeout(() => setPhase(1), 400);
    const t1 = setTimeout(() => setPhase(2), 3000);
    const t2 = setTimeout(() => setPhase(3), 4400);
    const t3 = setTimeout(() => onDone(),    4700);
    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  const tunnelEase = 'cubic-bezier(0.4, 0, 0.2, 1)';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#04080f',
      opacity: phase === 3 ? 0 : 1,
      transition: phase === 3 ? 'opacity 0.35s ease' : 'none',
      pointerEvents: phase === 3 ? 'none' : 'all',
      overflow: 'hidden',
    }}>

      {/* Grid sutil */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.025, pointerEvents: 'none' }}>
        <defs>
          <pattern id="ig" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ig)" />
      </svg>

      {/* Ambient glow */}
      <div style={{
        position: 'absolute',
        width: 500, height: 500,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59,130,246,0.18) 0%, rgba(59,130,246,0.06) 50%, transparent 70%)',
        filter: 'blur(80px)',
        pointerEvents: 'none',
        transform: phase >= 2 ? 'scale(8)' : 'scale(1)',
        transition: phase >= 2 ? `transform 1.4s ${tunnelEase}` : 'none',
      }} />

      {/* Grupo del logo — hace zoom */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2.2rem',
        transform: phase === 0
          ? 'scale(0.86) translateZ(0)'
          : phase >= 2
            ? 'scale(20) translateZ(0)'
            : 'scale(1) translateZ(0)',
        opacity: phase === 0
          ? 0
          : phase >= 2
            ? 0
            : 1,
        transition: phase >= 2
          ? `transform 1.4s ${tunnelEase}, opacity 0.6s ease 0.55s`
          : phase === 1
            ? 'transform 0.5s cubic-bezier(0.34,1.56,0.64,1), opacity 0.4s ease'
            : 'none',
        willChange: 'transform, opacity',
      }}>

        {/* Logo SVG animado */}
        <div style={{
          filter: phase >= 1
            ? 'drop-shadow(0 0 18px rgba(59,130,246,0.55)) drop-shadow(0 0 40px rgba(59,130,246,0.25))'
            : 'none',
          transition: 'filter 0.6s ease',
          animation: phase === 1 ? 'introLogoPulse 2s ease-in-out infinite 1s' : 'none',
        }}>
          <BrandSVG height={64} />
        </div>

        {/* Spinner + label */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.7rem',
          opacity: phase === 1 ? 1 : 0,
          transition: 'opacity 0.4s ease',
        }}>
          <div style={{
            width: 26, height: 26,
            borderRadius: '50%',
            border: '2px solid rgba(240,244,255,0.08)',
            borderTopColor: '#3b82f6',
            borderRightColor: '#1c3f94',
            animation: 'spinIntro 0.85s linear infinite',
          }} />
          <span style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: '0.6rem',
            fontWeight: 600,
            letterSpacing: '0.24em',
            textTransform: 'uppercase' as const,
            color: 'rgba(240,244,255,0.30)',
            animation: phase === 1 ? 'subtleFadeIn 0.6s ease 0.8s both' : 'none',
          }}>Cargando sistema</span>
        </div>
      </div>

      {/* Viñeta oscura — paredes del túnel */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 0%, transparent 30%, rgba(4,8,15,0.6) 65%, rgba(4,8,15,0.98) 100%)',
        opacity: phase >= 2 ? 1 : 0,
        transition: phase >= 2 ? `opacity 0.8s ${tunnelEase}` : 'none',
        pointerEvents: 'none',
      }} />

      {/* Blackout final */}
      <div style={{
        position: 'absolute', inset: 0,
        background: '#04080f',
        opacity: phase >= 2 ? 1 : 0,
        transition: phase >= 2 ? `opacity 0.5s ease 0.9s` : 'none',
        pointerEvents: 'none',
      }} />

      <style>{`
        @keyframes spinIntro {
          to { transform: rotate(360deg); }
        }
        @keyframes subtleFadeIn {
          from { opacity:0; transform:translateY(5px); }
          to   { opacity:1; transform:translateY(0);   }
        }
        @keyframes introLogoPulse {
          0%,100% { filter: drop-shadow(0 0 14px rgba(59,130,246,0.45)) drop-shadow(0 0 30px rgba(59,130,246,0.20)); }
          50%      { filter: drop-shadow(0 0 28px rgba(59,130,246,0.80)) drop-shadow(0 0 60px rgba(59,130,246,0.45)); }
        }
      `}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   PÁGINA PRINCIPAL
───────────────────────────────────────────────────────────── */
export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [introDone, setIntroDone]       = useState(false);
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading]       = useState(false);
  const [mounted, setMounted]           = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [errorDetail, setErrorDetail]   = useState<string | null>(null);

  const leftCanvasRef   = useRef<HTMLCanvasElement>(null);
  const mobileCanvasRef = useRef<HTMLCanvasElement>(null);

  useParticleCanvas(leftCanvasRef,   introDone);
  useParticleCanvas(mobileCanvasRef, introDone);

  const handleIntroDone = () => {
    setIntroDone(true);
    setTimeout(() => setMounted(true), 100);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorDetail(null);
    if (!email.trim()) { toast.error('Ingresa tu correo electrónico'); return; }
    if (!password)     { toast.error('Ingresa tu contraseña');         return; }

    setIsLoading(true);
    try {
      const user = await login(email, password);
      if (user) {
        toast.success(`Bienvenido, ${user.name}`);
        const routes: Record<string, string> = {
          tecnico: '/tecnico', pagos: '/pagos',
          contabilidad: '/contabilidad', admin: '/admin',
        };
        router.push(routes[user.role] ?? '/');
      } else {
        const msg = 'No se encontró el perfil del usuario. Contacta al administrador.';
        setErrorDetail(msg); toast.error(msg);
      }
    } catch (err: unknown) {
      let friendlyMsg = 'Error al iniciar sesión. Intenta de nuevo.';
      if (err && typeof err === 'object' && 'code' in err) {
        const code = (err as { code: string }).code;
        friendlyMsg = FIREBASE_ERRORS[code] ?? `Error desconocido (${code})`;
      } else if (err instanceof Error) {
        friendlyMsg = err.message;
      }
      setErrorDetail(friendlyMsg); toast.error(friendlyMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const quickLogin = (u: typeof DEMO_USERS[0]) => {
    setErrorDetail(null);
    setEmail(u.email);
    setPassword(u.password);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&family=Outfit:wght@300;400;500;600;700;900&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        :root {
          --ink:#04080f; --ink2:#060c18; --ink3:#0a1120; --ink4:#0e1828; --ink5:#121f32;
          --blue:#3b82f6; --blue2:#60a5fa; --blue3:#93c5fd;
          --red:#ef4444;  --red2:#f87171; --red3:#fca5a5;
          --w:#f0f4ff;
          --w70:rgba(240,244,255,0.70); --w40:rgba(240,244,255,0.40);
          --w20:rgba(240,244,255,0.20); --w08:rgba(240,244,255,0.08);
          --blue-dim:rgba(59,130,246,0.10); --blue-glow:rgba(59,130,246,0.22); --blue-border:rgba(59,130,246,0.35);
          --red-dim:rgba(239,68,68,0.10); --red-border:rgba(239,68,68,0.30);
        }

        .page-enter {
          opacity:0;
          transform:translateY(20px) scale(0.997);
        }
        .page-enter.page-visible {
          opacity:1;
          transform:translateY(0) scale(1);
          transition:opacity 0.75s cubic-bezier(0.22,1,0.36,1), transform 0.75s cubic-bezier(0.22,1,0.36,1);
        }

        .pg { font-family:'Outfit',sans-serif; min-height:100vh; display:grid; grid-template-columns:1fr 460px; background:var(--ink); overflow:hidden; }

        /* Panel izquierdo */
        .pg-left { position:relative; background:var(--ink2); overflow:hidden; display:flex; flex-direction:column; padding:2.5rem; }
        .pg-canvas { position:absolute; inset:0; width:100%; height:100%; }
        .blob { position:absolute; border-radius:50%; filter:blur(90px); pointer-events:none; animation:blobmove 10s ease-in-out infinite alternate; }
        .blob-blue { width:560px; height:560px; background:radial-gradient(circle,rgba(59,130,246,0.18) 0%,transparent 65%); bottom:-180px; left:-120px; }
        .blob-red  { width:380px; height:380px; background:radial-gradient(circle,rgba(239,68,68,0.12) 0%,transparent 65%); top:5%; right:0%; animation-direction:alternate-reverse; animation-duration:14s; }
        @keyframes blobmove { 0%{transform:translate(0,0) scale(1)} 100%{transform:translate(18px,12px) scale(1.1)} }
        .pg-diagonal { position:absolute; top:-20%; right:-8%; width:50%; height:140%; background:linear-gradient(155deg,rgba(59,130,246,0.04) 0%,transparent 55%); border-left:1px solid rgba(59,130,246,0.08); transform:rotate(-7deg); pointer-events:none; }
        .pg-grid-svg { position:absolute; inset:0; width:100%; height:100%; opacity:0.025; pointer-events:none; }
        .pg-left-content { position:relative; z-index:2; display:flex; flex-direction:column; height:100%; }
        .pg-brand { display:flex; align-items:center; gap:0.75rem; margin-bottom:auto; }
        .pg-hero { margin:auto 0; }
        .eyebrow { font-size:0.68rem; font-weight:600; letter-spacing:0.18em; text-transform:uppercase; color:var(--blue2); margin-bottom:1.1rem; display:flex; align-items:center; gap:0.6rem; }
        .eyebrow::before { content:''; display:block; width:24px; height:1px; background:var(--blue2); opacity:0.55; }
        .pg-hero-title { font-family:'Playfair Display',serif; font-size:clamp(2rem,3vw,2.8rem); font-weight:500; line-height:1.22; color:var(--w); margin-bottom:1.1rem; letter-spacing:-0.01em; }
        .pg-hero-title em { font-style:italic; background:linear-gradient(125deg,var(--blue2) 20%,var(--blue3) 60%,var(--red2) 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
        .pg-hero-desc { font-size:0.875rem; line-height:1.75; color:var(--w40); max-width:400px; margin-bottom:2.25rem; font-weight:300; }
        .pg-features { display:flex; flex-direction:column; gap:0.65rem; margin-bottom:2.75rem; }
        .pg-feature { display:flex; align-items:center; gap:0.7rem; font-size:0.82rem; color:var(--w70); font-weight:300; }
        .pg-feature-dot { width:5px; height:5px; border-radius:50%; background:var(--blue); flex-shrink:0; box-shadow:0 0 6px var(--blue-glow); }
        .pg-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:1px; background:var(--w08); border:1px solid var(--w08); border-radius:14px; overflow:hidden; }
        .pg-stat { background:var(--ink3); padding:1rem; text-align:center; transition:background 0.2s; }
        .pg-stat:hover { background:var(--ink4); }
        .pg-stat-val { font-family:'Playfair Display',serif; font-size:1.35rem; font-weight:600; color:var(--blue2); display:block; margin-bottom:0.15rem; }
        .pg-stat-lbl { font-size:0.65rem; color:var(--w40); text-transform:uppercase; letter-spacing:0.07em; }

        /* Panel derecho */
        .pg-right { position:relative; background:var(--ink); border-left:1px solid var(--w08); display:flex; flex-direction:column; overflow-y:auto; }
        .pg-right-bar { position:absolute; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent 0%,var(--blue) 30%,var(--red) 70%,transparent 100%); opacity:0.75; }
        .pg-live { position:absolute; top:1.2rem; right:1.2rem; display:flex; align-items:center; gap:0.35rem; font-size:0.62rem; font-weight:600; letter-spacing:0.14em; text-transform:uppercase; color:var(--w20); }
        .pg-live-dot { width:5px; height:5px; border-radius:50%; background:#22c55e; box-shadow:0 0 6px rgba(34,197,94,0.6); animation:liveblink 2.2s ease-in-out infinite; }
        @keyframes liveblink { 0%,100%{opacity:.5} 50%{opacity:1} }
        .pg-right-inner { flex:1; display:flex; flex-direction:column; justify-content:center; padding:2.5rem; min-height:100vh; }

        .fu { opacity:0; transform:translateY(16px); transition:opacity .65s cubic-bezier(.22,1,.36,1),transform .65s cubic-bezier(.22,1,.36,1); }
        .fu.in { opacity:1; transform:none; }
        .d1{transition-delay:.10s} .d2{transition-delay:.22s} .d3{transition-delay:.36s}

        .login-hd { margin-bottom:2rem; }
        .login-eyebrow { font-size:.67rem; font-weight:600; letter-spacing:.16em; text-transform:uppercase; color:var(--blue2); margin-bottom:.65rem; }
        .login-title { font-family:'Playfair Display',serif; font-size:1.65rem; font-weight:500; color:var(--w); letter-spacing:-.01em; margin-bottom:.4rem; line-height:1.2; }
        .login-sub { font-size:.8rem; color:var(--w40); font-weight:300; line-height:1.55; }

        .form-fields { display:flex; flex-direction:column; gap:1rem; margin-bottom:1.4rem; }
        .field-wrap { display:flex; flex-direction:column; gap:.45rem; }
        .field-lbl { font-size:.68rem; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--w40); transition:color .2s; }
        .field-wrap.foc .field-lbl { color:var(--blue2); }
        .input-shell { position:relative; }
        .input-ico { position:absolute; left:13px; top:50%; transform:translateY(-50%); color:var(--w20); width:14px; height:14px; pointer-events:none; transition:color .25s; }
        .field-wrap.foc .input-ico { color:var(--blue2); }
        .inp { width:100%; background:var(--ink3); border:1px solid var(--w08); border-radius:10px; padding:.78rem .875rem .78rem 2.5rem; font-size:.875rem; color:var(--w); font-family:'Outfit',sans-serif; font-weight:400; outline:none; transition:border-color .25s cubic-bezier(.22,1,.36,1),background .25s,box-shadow .25s cubic-bezier(.22,1,.36,1); -webkit-appearance:none; }
        .inp::placeholder { color:var(--w20); }
        .inp:focus { border-color:var(--blue-border); background:var(--ink4); box-shadow:0 0 0 3px var(--blue-dim); }
        .inp.rpad { padding-right:2.75rem; }
        .inp.err { border-color:var(--red-border); }
        .eye-btn { position:absolute; right:11px; top:50%; transform:translateY(-50%); background:none; border:none; padding:3px; color:var(--w20); cursor:pointer; display:flex; align-items:center; transition:color .2s; }
        .eye-btn:hover { color:var(--w70); }

        .sbtn { width:100%; position:relative; background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 35%,#b91c1c 100%); color:#ffffff; border:none; border-radius:10px; padding:.875rem 1.5rem; font-family:'Outfit',sans-serif; font-size:.875rem; font-weight:600; letter-spacing:.045em; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:.5rem; overflow:hidden; transition:transform .2s cubic-bezier(.22,1,.36,1),box-shadow .2s ease,filter .2s; box-shadow:0 4px 24px rgba(59,130,246,.28),0 1px 0 rgba(255,255,255,.10) inset; }
        .sbtn::after { content:''; position:absolute; inset:0; background:linear-gradient(180deg,rgba(255,255,255,.08) 0%,transparent 100%); }
        .sbtn:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 8px 36px rgba(59,130,246,.36),0 4px 16px rgba(185,28,28,.18),0 1px 0 rgba(255,255,255,.12) inset; filter:brightness(1.08); }
        .sbtn:active:not(:disabled) { transform:translateY(0); }
        .sbtn:disabled { opacity:.55; cursor:not-allowed; }
        .sbtn-arrow { width:16px; height:16px; transition:transform .25s cubic-bezier(.22,1,.36,1); flex-shrink:0; }
        .sbtn:hover:not(:disabled) .sbtn-arrow { transform:translateX(4px); }
        .spin { width:15px; height:15px; border:2px solid rgba(255,255,255,.25); border-top-color:#fff; border-radius:50%; animation:sp .65s linear infinite; }
        @keyframes sp { to{transform:rotate(360deg)} }

        .error-box { display:flex; align-items:flex-start; gap:.55rem; background:var(--red-dim); border:1px solid var(--red-border); border-radius:10px; padding:.75rem .9rem; margin-bottom:1rem; animation:errIn .3s cubic-bezier(.22,1,.36,1); }
        @keyframes errIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:none} }
        .error-box-dot { width:6px; height:6px; border-radius:50%; background:var(--red); flex-shrink:0; margin-top:5px; }
        .error-box-text { font-size:.78rem; color:var(--red2); line-height:1.5; font-weight:400; }

        .form-bottom { display:flex; align-items:center; justify-content:space-between; margin-top:.875rem; gap:1rem; }
        .sec-badge { display:flex; align-items:center; gap:.4rem; font-size:.68rem; color:var(--w20); flex-shrink:0; }
        .reg-pill { display:inline-flex; align-items:center; gap:.35rem; font-size:.75rem; font-weight:600; color:var(--blue2); text-decoration:none; background:var(--blue-dim); border:1px solid var(--blue-border); border-radius:99px; padding:.35rem .85rem; letter-spacing:.04em; white-space:nowrap; transition:background .2s,opacity .2s; flex-shrink:0; }
        .reg-pill:hover { background:rgba(59,130,246,.18); }

        .divider { height:1px; background:linear-gradient(90deg,transparent,var(--w08) 30%,var(--w08) 70%,transparent); margin:1.5rem 0; }

        .demo-box { border:1px solid var(--w08); border-radius:14px; overflow:hidden; }
        .demo-hd { background:var(--ink3); border-bottom:1px solid var(--w08); padding:.7rem 1rem; display:flex; align-items:center; justify-content:space-between; }
        .demo-hd-lbl { font-size:.67rem; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:var(--w40); }
        .demo-tag { font-size:.58rem; font-weight:600; letter-spacing:.08em; text-transform:uppercase; background:var(--blue-dim); border:1px solid var(--blue-border); color:var(--blue2); padding:.18rem .5rem; border-radius:99px; }
        .demo-grid { display:grid; grid-template-columns:1fr 1fr; gap:1px; background:var(--w08); }
        .demo-btn { background:var(--ink); padding:.8rem .9rem; cursor:pointer; display:flex; align-items:center; gap:.65rem; transition:background .18s; border:none; text-align:left; font-family:'Outfit',sans-serif; }
        .demo-btn:hover { background:var(--ink3); }
        .demo-btn:active { background:var(--ink4); }
        .demo-ico { font-size:.95rem; line-height:1; flex-shrink:0; }
        .demo-info { flex:1; min-width:0; }
        .demo-role { font-size:.78rem; font-weight:500; color:var(--w70); display:block; margin-bottom:.1rem; }
        .demo-desc-txt { font-size:.66rem; color:var(--w20); font-weight:300; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .demo-chev { width:11px; height:11px; color:var(--w20); flex-shrink:0; transition:transform .18s,color .18s; }
        .demo-btn:hover .demo-chev { transform:translateX(2px); color:var(--blue2); }
        .demo-ft { background:var(--ink3); border-top:1px solid var(--w08); padding:.55rem 1rem; text-align:center; font-size:.65rem; color:var(--w20); font-weight:300; }
        .demo-ft b { color:var(--blue2); font-weight:500; }

        @media (max-width:860px) {
          .pg-left { display:none; }
          .pg { grid-template-columns:1fr; }
          .pg-right { border-left:none; background:var(--ink2); min-height:100vh; }
          .mob-canvas { display:block !important; position:fixed; inset:0; width:100%; height:100%; pointer-events:none; z-index:0; }
          .mob-blob-blue { display:block !important; position:fixed; width:420px; height:420px; border-radius:50%; filter:blur(90px); background:radial-gradient(circle,rgba(59,130,246,0.18) 0%,transparent 65%); bottom:-140px; left:-100px; pointer-events:none; animation:blobmove 10s ease-in-out infinite alternate; z-index:0; }
          .mob-blob-red  { display:block !important; position:fixed; width:300px; height:300px; border-radius:50%; filter:blur(80px); background:radial-gradient(circle,rgba(239,68,68,0.12) 0%,transparent 65%); top:5%; right:-60px; pointer-events:none; animation:blobmove 14s ease-in-out infinite alternate-reverse; z-index:0; }
          .mob-grid { display:block !important; position:fixed; inset:0; width:100%; height:100%; opacity:0.022; pointer-events:none; z-index:0; }
          .pg-right-bar { position:fixed; z-index:2; }
          .pg-live,.pg-right-inner { position:relative; z-index:1; }
          .pg-right-inner { min-height:100vh; padding:3rem 1.5rem 3rem; justify-content:center; }
          .mob-brand { display:flex !important; align-items:center; gap:0.6rem; margin-bottom:2.25rem; }
          .inp { background:rgba(10,17,32,0.85); }
          .inp:focus { background:rgba(14,24,40,0.95); }
          .demo-btn { background:rgba(4,8,15,0.7); }
          .demo-btn:hover { background:rgba(10,17,32,0.85); }
          .form-bottom { flex-direction:column; align-items:stretch; gap:.6rem; }
          .reg-pill { justify-content:center; }
        }
        .mob-canvas,.mob-blob-blue,.mob-blob-red,.mob-grid,.mob-brand { display:none; }
      `}</style>

      {/* INTRO */}
      {!introDone && <IntroOverlay onDone={handleIntroDone} />}

      {/* APLICACIÓN PRINCIPAL */}
      <div className={`pg page-enter ${introDone ? 'page-visible' : ''}`}>

        {/* PANEL IZQUIERDO */}
        <div className="pg-left">
          <canvas ref={leftCanvasRef} className="pg-canvas" />
          <div className="blob blob-blue" /><div className="blob blob-red" />
          <div className="pg-diagonal" />
          <svg className="pg-grid-svg" xmlns="http://www.w3.org/2000/svg">
            <defs><pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="white" strokeWidth="0.5"/></pattern></defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
          <div className="pg-left-content">
            {/* Logo panel izquierdo */}
            <div className="pg-brand">
              <BrandSVG height={40} />
            </div>

            <div className="pg-hero">
              <div className="eyebrow">Plataforma Empresarial</div>
              <h1 className="pg-hero-title">Control total sobre<br />tus <em>flujos financieros</em></h1>
              <p className="pg-hero-desc">Gestiona solicitudes, aprobaciones y reportes desde un único sistema seguro y auditable, diseñado para equipos de alto rendimiento.</p>
              <div className="pg-features">
                {FEATURES.map((f, i) => (
                  <div key={i} className="pg-feature"><div className="pg-feature-dot" />{f}</div>
                ))}
              </div>
            </div>
            <div className="pg-stats">
              {STATS.map((s, i) => (
                <div key={i} className="pg-stat">
                  <span className="pg-stat-val">{s.value}</span>
                  <span className="pg-stat-lbl">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* PANEL DERECHO */}
        <div className="pg-right">
          <canvas ref={mobileCanvasRef} className="mob-canvas" />
          <div className="mob-blob-blue" /><div className="mob-blob-red" />
          <svg className="mob-grid" xmlns="http://www.w3.org/2000/svg">
            <defs><pattern id="mgrid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="white" strokeWidth="0.5"/></pattern></defs>
            <rect width="100%" height="100%" fill="url(#mgrid)" />
          </svg>
          <div className="pg-right-bar" />
          <div className="pg-live"><div className="pg-live-dot" />En línea</div>

          <div className="pg-right-inner">
            {/* Logo móvil */}
            <div className={`mob-brand fu ${mounted ? 'in' : ''}`}>
              <BrandSVG height={34} />
            </div>

            <div className={`login-hd fu ${mounted ? 'in' : ''}`}>
              <div className="login-eyebrow">Bienvenido de vuelta</div>
              <h2 className="login-title">Iniciar Sesión</h2>
              <p className="login-sub">Ingrese sus credenciales para acceder al panel de control</p>
            </div>

            <form onSubmit={handleSubmit}>
              <div className={`form-fields fu d1 ${mounted ? 'in' : ''}`}>
                {errorDetail && (
                  <div className="error-box">
                    <div className="error-box-dot" />
                    <span className="error-box-text">{errorDetail}</span>
                  </div>
                )}

                <div className={`field-wrap ${focusedField === 'email' ? 'foc' : ''}`}>
                  <label className="field-lbl">Correo Electrónico</label>
                  <div className="input-shell">
                    <svg className="input-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2"/>
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                    </svg>
                    <input
                      type="email" className={`inp ${errorDetail ? 'err' : ''}`}
                      placeholder="usuario@empresa.com" value={email}
                      onChange={e => { setEmail(e.target.value); setErrorDetail(null); }}
                      onFocus={() => setFocusedField('email')} onBlur={() => setFocusedField(null)}
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div className={`field-wrap ${focusedField === 'password' ? 'foc' : ''}`}>
                  <label className="field-lbl">Contraseña</label>
                  <div className="input-shell">
                    <svg className="input-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    <input
                      type={showPassword ? 'text' : 'password'} className={`inp rpad ${errorDetail ? 'err' : ''}`}
                      placeholder="••••••••" value={password}
                      onChange={e => { setPassword(e.target.value); setErrorDetail(null); }}
                      onFocus={() => setFocusedField('password')} onBlur={() => setFocusedField(null)}
                      autoComplete="current-password"
                    />
                    <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff style={{width:14,height:14}} /> : <Eye style={{width:14,height:14}} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className={`fu d2 ${mounted ? 'in' : ''}`}>
                <button type="submit" className="sbtn" disabled={isLoading}>
                  {isLoading
                    ? <><div className="spin" /> Verificando...</>
                    : <>Ingresar al Sistema <ArrowRight className="sbtn-arrow" /></>}
                </button>
                <div className="form-bottom">
                  <div className="sec-badge">
                    <Shield style={{width:10,height:10}} />
                    <span>SSL · Sesión segura</span>
                  </div>
                </div>
              </div>
            </form>

            <div className="divider" />

            <div className={`fu d3 ${mounted ? 'in' : ''}`}>
              <div className="demo-box">
                <div className="demo-hd">
                  <span className="demo-hd-lbl">Acceso Rápido</span>
                  <span className="demo-tag">Demo</span>
                </div>
                <div className="demo-grid">
                  {DEMO_USERS.map(u => (
                    <button key={u.role} className="demo-btn" onClick={() => quickLogin(u)}>
                      <span className="demo-ico">{u.icon}</span>
                      <span className="demo-info">
                        <span className="demo-role">{u.role}</span>
                        <span className="demo-desc-txt">{u.desc}</span>
                      </span>
                      <ChevronRight className="demo-chev" />
                    </button>
                  ))}
                </div>
                <div className="demo-ft">Contraseña = <b>nombre del rol</b> en minúsculas</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}