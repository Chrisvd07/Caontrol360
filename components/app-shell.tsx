'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { NotificationsPanel } from './notifications-panel';
import {
  LogOut, Settings, User, Home, FileText,
  CheckCircle, BarChart3, Menu, X, ChevronRight
} from 'lucide-react';
import Link from 'next/link';
import type { UserRole } from '@/lib/types';

interface AppShellProps {
  children: React.ReactNode;
  requiredRole?: UserRole | UserRole[];
}

const NAV_ITEMS: Record<UserRole, { label: string; href: string; icon: React.ReactNode }[]> = {
  tecnico: [
    { label: 'Inicio',          href: '/tecnico',             icon: <Home     size={18} /> },
    { label: 'Mis Solicitudes', href: '/tecnico/solicitudes', icon: <FileText size={18} /> },
  ],
  pagos: [
    { label: 'Inbox',     href: '/pagos',           icon: <Home        size={18} /> },
    { label: 'Aprobadas', href: '/pagos/aprobadas', icon: <CheckCircle size={18} /> },
  ],
  contabilidad: [
    { label: 'Validación', href: '/contabilidad',          icon: <Home     size={18} /> },
    { label: 'Reportes',   href: '/contabilidad/reportes', icon: <BarChart3 size={18} /> },
  ],
  admin: [
    { label: 'Dashboard',     href: '/admin',        icon: <Home     size={18} /> },
    { label: 'Configuración', href: '/admin/config', icon: <Settings size={18} /> },
    { label: 'Audit Log',     href: '/admin/audit',  icon: <FileText size={18} /> },
  ],
};

const ROLE_LABELS: Record<UserRole, string> = {
  tecnico:      'Técnico',
  pagos:        'Pagos',
  contabilidad: 'Contabilidad',
  admin:        'Administrador',
};

/* ─── Logo Control 360 — fiel al logo real de la imagen ─── */
function BrandLogo({ height = 30 }: { height?: number }) {
  const uid = typeof height === 'number' ? `brand-${height}` : 'brand';
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

export function AppShell({ children, requiredRole }: AppShellProps) {
  const router   = useRouter();
  const pathname = usePathname();
  const { user, isLoading, logout, isAuthenticated } = useAuth();
  const [mobileOpen,   setMobileOpen]   = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push('/login');
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (user && requiredRole) {
      const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
      if (!roles.includes(user.role as UserRole)) router.push(`/${user.role}`);
    }
  }, [user, requiredRole, router]);

  useEffect(() => { setMobileOpen(false); setUserMenuOpen(false); }, [pathname]);

  if (isLoading) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#04080f' }}>
        <div style={{ width:32, height:32, border:'2px solid rgba(59,130,246,0.2)', borderTopColor:'#3b82f6', borderRadius:'50%', animation:'shell-spin .7s linear infinite' }} />
        <style>{`@keyframes shell-spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }
  if (!user) return null;

  const role     = user.role as UserRole;
  const navItems = NAV_ITEMS[role] ?? [];
  const initials = user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

  const handleLogout = () => { logout(); router.push('/login'); };

  const isActive = (href: string) =>
    pathname === href || (href !== `/${role}` && pathname.startsWith(href));

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&family=Outfit:wght@300;400;500;600;700;900&display=swap');

        :root {
          --sh-ink:  #04080f;
          --sh-ink2: #060c18;
          --sh-ink3: #0a1120;
          --sh-ink4: #0e1828;
          --sh-blue:  #3b82f6;
          --sh-blue2: #60a5fa;
          --sh-red:   #ef4444;
          --sh-red2:  #f87171;
          --sh-blue-dim:    rgba(59,130,246,0.10);
          --sh-blue-border: rgba(59,130,246,0.35);
          --sh-w:   #f0f4ff;
          --sh-w70: rgba(240,244,255,0.70);
          --sh-w40: rgba(240,244,255,0.40);
          --sh-w20: rgba(240,244,255,0.20);
          --sh-w08: rgba(240,244,255,0.08);
          --sat: env(safe-area-inset-top,    0px);
          --sar: env(safe-area-inset-right,  0px);
          --sab: env(safe-area-inset-bottom, 0px);
          --sal: env(safe-area-inset-left,   0px);
        }

        .sh-root { min-height:100vh; min-height:100dvh; display:flex; flex-direction:column; background:var(--sh-ink); font-family:'Outfit',sans-serif; }

        .sh-header {
          position:sticky; top:0; z-index:50;
          background:rgba(4,8,15,0.92); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px);
          border-bottom:1px solid var(--sh-w08);
          height:calc(56px + var(--sat)); padding-top:var(--sat);
          padding-left:max(1.25rem,var(--sal)); padding-right:max(1.25rem,var(--sar));
          display:flex; align-items:center; gap:1rem;
        }
        .sh-header-bar {
          position:absolute; top:0; left:0; right:0; height:2px;
          background:linear-gradient(90deg,transparent,#3b82f6 30%,#ef4444 70%,transparent);
          opacity:0.75;
        }

        .sh-logo { display:flex; align-items:center; gap:0.55rem; text-decoration:none; flex-shrink:0; }

        .sh-nav { display:none; align-items:center; gap:0.2rem; margin-left:1.25rem; }
        @media(min-width:768px){ .sh-nav { display:flex; } }

        .sh-nav-link {
          display:flex; align-items:center; gap:0.45rem; padding:0.4rem 0.75rem; border-radius:8px;
          font-size:0.82rem; font-weight:500; color:var(--sh-w40); text-decoration:none;
          border:1px solid transparent; transition:color 0.2s,background 0.2s,border-color 0.2s; white-space:nowrap;
        }
        .sh-nav-link:hover { color:var(--sh-w70); background:var(--sh-w08); }
        .sh-nav-link.active { color:var(--sh-blue2); background:var(--sh-blue-dim); border-color:var(--sh-blue-border); }

        .sh-right { display:flex; align-items:center; gap:0.5rem; margin-left:auto; }

        .sh-burger {
          width:36px; height:36px; border-radius:8px; border:1px solid var(--sh-w08); background:transparent;
          display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--sh-w40);
          transition:border-color 0.2s,color 0.2s; -webkit-tap-highlight-color:transparent;
        }
        .sh-burger:hover { border-color:var(--sh-blue-border); color:var(--sh-blue2); }
        @media(min-width:768px){ .sh-burger { display:none; } }

        .sh-user-btn {
          display:flex; align-items:center; gap:0.5rem; background:var(--sh-ink3); border:1px solid var(--sh-w08);
          border-radius:10px; padding:0.3rem 0.6rem 0.3rem 0.35rem; cursor:pointer;
          transition:border-color 0.2s; position:relative; -webkit-tap-highlight-color:transparent;
        }
        .sh-user-btn:hover { border-color:var(--sh-blue-border); }
        .sh-avatar {
          width:26px; height:26px; border-radius:6px; background:var(--sh-blue-dim); border:1px solid var(--sh-blue-border);
          display:flex; align-items:center; justify-content:center; font-size:0.65rem; font-weight:700; color:var(--sh-blue2); flex-shrink:0;
        }
        .sh-user-name { font-size:0.78rem; font-weight:500; color:var(--sh-w70); display:none; }
        @media(min-width:480px){ .sh-user-name { display:block; } }

        .sh-user-menu {
          position:absolute; top:calc(100% + 8px); right:0; width:220px;
          background:var(--sh-ink3); border:1px solid var(--sh-w08); border-radius:14px; overflow:hidden;
          box-shadow:0 16px 48px rgba(0,0,0,0.5),0 1px 0 rgba(255,255,255,0.04) inset;
          animation:sh-dropdown .18s cubic-bezier(.22,1,.36,1); z-index:60;
        }
        @keyframes sh-dropdown { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:none} }
        .sh-menu-header { padding:0.875rem 1rem; border-bottom:1px solid var(--sh-w08); }
        .sh-menu-name { font-size:0.875rem; font-weight:600; color:var(--sh-w); display:block; }
        .sh-menu-role { font-size:0.68rem; color:var(--sh-blue2); font-weight:500; letter-spacing:0.06em; text-transform:uppercase; }
        .sh-menu-item {
          display:flex; align-items:center; gap:0.65rem; padding:0.65rem 1rem; font-size:0.82rem; color:var(--sh-w40);
          cursor:pointer; transition:background 0.15s,color 0.15s; border:none; background:none; width:100%;
          text-align:left; font-family:'Outfit',sans-serif; text-decoration:none;
        }
        .sh-menu-item:hover { background:var(--sh-w08); color:var(--sh-w70); }
        .sh-menu-item.danger { color:#ef4444; }
        .sh-menu-item.danger:hover { background:rgba(239,68,68,0.08); color:#f87171; }
        .sh-menu-sep { height:1px; background:var(--sh-w08); margin:0.25rem 0; }

        .sh-drawer-overlay {
          position:fixed; inset:0; background:rgba(0,0,0,0.6);
          backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px);
          z-index:55; animation:sh-fade-in .2s ease;
        }
        @keyframes sh-fade-in { from{opacity:0} to{opacity:1} }
        .sh-drawer {
          position:fixed; top:0; left:0; bottom:0; width:260px;
          background:var(--sh-ink2); border-right:1px solid var(--sh-w08);
          z-index:56; display:flex; flex-direction:column;
          animation:sh-slide-in .25s cubic-bezier(.22,1,.36,1);
          box-shadow:8px 0 40px rgba(0,0,0,0.5);
          padding-top:var(--sat); padding-left:var(--sal); padding-bottom:var(--sab);
        }
        @keyframes sh-slide-in { from{transform:translateX(-100%)} to{transform:translateX(0)} }
        .sh-drawer-top { height:56px; display:flex; align-items:center; justify-content:space-between; padding:0 1.25rem; border-bottom:1px solid var(--sh-w08); flex-shrink:0; }
        .sh-drawer-close {
          width:30px; height:30px; border-radius:7px; border:1px solid var(--sh-w08); background:none;
          display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--sh-w40);
          transition:border-color 0.2s,color 0.2s; -webkit-tap-highlight-color:transparent;
        }
        .sh-drawer-close:hover { border-color:var(--sh-blue-border); color:var(--sh-blue2); }
        .sh-drawer-nav { flex:1; padding:1rem 0.75rem; display:flex; flex-direction:column; gap:0.3rem; overflow-y:auto; }
        .sh-drawer-link {
          display:flex; align-items:center; gap:0.7rem; padding:0.7rem 0.875rem; border-radius:10px;
          font-size:0.875rem; font-weight:500; color:var(--sh-w40); text-decoration:none;
          border:1px solid transparent; transition:all 0.18s; -webkit-tap-highlight-color:transparent;
        }
        .sh-drawer-link:hover { color:var(--sh-w70); background:var(--sh-w08); }
        .sh-drawer-link.active { color:var(--sh-blue2); background:var(--sh-blue-dim); border-color:var(--sh-blue-border); }
        .sh-drawer-footer { padding:0.75rem; border-top:1px solid var(--sh-w08); }
        .sh-drawer-logout {
          display:flex; align-items:center; gap:0.7rem; padding:0.7rem 0.875rem; border-radius:10px;
          font-size:0.875rem; font-weight:500; color:#ef4444; cursor:pointer; border:none; background:none;
          width:100%; font-family:'Outfit',sans-serif; transition:background 0.18s; -webkit-tap-highlight-color:transparent;
        }
        .sh-drawer-logout:hover { background:rgba(239,68,68,0.08); }

        .sh-bottom-nav {
          position:fixed; bottom:0; left:0; right:0;
          background:rgba(4,8,15,0.95); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px);
          border-top:1px solid var(--sh-w08); display:flex;
          height:calc(60px + var(--sab)); padding-bottom:var(--sab);
          padding-left:var(--sal); padding-right:var(--sar); z-index:40;
        }
        @media(min-width:768px){ .sh-bottom-nav { display:none; } }
        .sh-bottom-link {
          flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
          gap:0.2rem; color:var(--sh-w20); text-decoration:none;
          font-size:0.6rem; font-weight:600; letter-spacing:0.06em; text-transform:uppercase;
          transition:color 0.2s; border:none; background:none; cursor:pointer;
          font-family:'Outfit',sans-serif; -webkit-tap-highlight-color:transparent; min-height:44px;
        }
        .sh-bottom-link:hover  { color:var(--sh-w40); }
        .sh-bottom-link.active { color:var(--sh-blue2); }
        .sh-bottom-link.active svg { filter:drop-shadow(0 0 6px rgba(59,130,246,0.5)); }

        .sh-main { flex:1; padding-bottom:calc(60px + var(--sab)); }
        @media(min-width:768px){ .sh-main { padding-bottom:0; } }
      `}</style>

      <div className="sh-root">
        <header className="sh-header">
          <div className="sh-header-bar" />
          <button className="sh-burger" onClick={() => setMobileOpen(true)}><Menu size={18} /></button>

          <Link href={`/${role}`} className="sh-logo">
            <BrandLogo height={28} />
          </Link>

          <nav className="sh-nav">
            {navItems.map(item => (
              <Link key={item.href} href={item.href} className={`sh-nav-link ${isActive(item.href) ? 'active' : ''}`}>
                {item.icon}{item.label}
              </Link>
            ))}
          </nav>

          <div className="sh-right">
            <NotificationsPanel userId={user.id} />
            <div style={{ position:'relative' }}>
              <button className="sh-user-btn" onClick={() => setUserMenuOpen(!userMenuOpen)}>
                <div className="sh-avatar">{initials}</div>
                <span className="sh-user-name">{user.name.split(' ')[0]}</span>
              </button>
              {userMenuOpen && (
                <>
                  <div style={{ position:'fixed', inset:0, zIndex:59 }} onClick={() => setUserMenuOpen(false)} />
                  <div className="sh-user-menu">
                    <div className="sh-menu-header">
                      <span className="sh-menu-name">{user.name}</span>
                      <span className="sh-menu-role">{ROLE_LABELS[role]}</span>
                    </div>
                    <Link href="/perfil" className="sh-menu-item"><User size={14} /> Perfil</Link>
                    <button className="sh-menu-item"><Settings size={14} /> Configuración</button>
                    <div className="sh-menu-sep" />
                    <button className="sh-menu-item danger" onClick={handleLogout}><LogOut size={14} /> Cerrar Sesión</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {mobileOpen && (
          <>
            <div className="sh-drawer-overlay" onClick={() => setMobileOpen(false)} />
            <div className="sh-drawer">
              <div className="sh-drawer-top">
                <Link href={`/${role}`} className="sh-logo">
                  <BrandLogo height={26} />
                </Link>
                <button className="sh-drawer-close" onClick={() => setMobileOpen(false)}><X size={14} /></button>
              </div>
              <nav className="sh-drawer-nav">
                {navItems.map(item => (
                  <Link key={item.href} href={item.href} className={`sh-drawer-link ${isActive(item.href) ? 'active' : ''}`}>
                    {item.icon}{item.label}
                    {isActive(item.href) && <ChevronRight size={13} style={{ marginLeft:'auto', opacity:0.6 }} />}
                  </Link>
                ))}
              </nav>
              <div className="sh-drawer-footer">
                <button className="sh-drawer-logout" onClick={handleLogout}><LogOut size={16} /> Cerrar Sesión</button>
              </div>
            </div>
          </>
        )}

        <main className="sh-main">{children}</main>

        <nav className="sh-bottom-nav">
          {navItems.map(item => (
            <Link key={item.href} href={item.href} className={`sh-bottom-link ${isActive(item.href) ? 'active' : ''}`}>
              {item.icon}{item.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}