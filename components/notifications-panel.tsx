"use client"

import { useState, useEffect, useRef } from 'react'
import { Bell, Check, CheckCheck, Trash2, AlertCircle, Info, AlertTriangle, CheckCircle, X } from 'lucide-react'
import {
  getNotificationsFirestore,
  markNotificationReadFirestore,
} from '@/lib/firestore-service'
import { initFCM, listenForegroundMessages } from '@/lib/Fcm'
import type { Notification } from '@/lib/types'

interface NotificationsPanelProps {
  userId: string;
}

export function NotificationsPanel({ userId }: NotificationsPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount]     = useState(0)
  const [open, setOpen]                   = useState(false)
  const panelRef                          = useRef<HTMLDivElement>(null)

  const load = async () => {
    if (!userId) return;
    const data = await getNotificationsFirestore(userId);
    setNotifications(data);
    setUnreadCount(data.filter(n => !n.read).length);
  };

  useEffect(() => {
    if (!userId) return;
    load();
    initFCM(userId);
    listenForegroundMessages(userId, () => { load(); });
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const read = async (id: string) => {
    await markNotificationReadFirestore(id);
    load();
  };

  const readAll = async () => {
    await Promise.all(
      notifications.filter(n => !n.read).map(n => markNotificationReadFirestore(n.id))
    );
    load();
  };

  const clear = () => setNotifications([]);

  const iconFor = (type: Notification['type']) => ({
    error:   <AlertCircle   size={13} style={{ color: '#f87171', flexShrink: 0 }} />,
    warning: <AlertTriangle size={13} style={{ color: '#fbbf24', flexShrink: 0 }} />,
    success: <CheckCircle   size={13} style={{ color: '#60a5fa', flexShrink: 0 }} />,
    info:    <Info          size={13} style={{ color: '#93c5fd', flexShrink: 0 }} />,
  }[type] ?? <Info size={13} style={{ color: '#93c5fd', flexShrink: 0 }} />);

  const colorFor = (type: Notification['type']) => ({
    error:   '#ef4444',
    warning: '#fbbf24',
    success: '#3b82f6',
    info:    '#60a5fa',
  }[type] ?? '#60a5fa');

  const timeAgo = (ts: string | number) => {
    const d = Date.now() - new Date(ts).getTime();
    if (d < 60000)    return 'Ahora';
    if (d < 3600000)  return `${Math.floor(d / 60000)}m`;
    if (d < 86400000) return `${Math.floor(d / 3600000)}h`;
    return `${Math.floor(d / 86400000)}d`;
  };

  return (
    <>
      <style>{`
        .np-wrap { position: relative; }

        /* Bell button */
        .np-btn {
          width: 36px; height: 36px; border-radius: 9px;
          border: 1px solid rgba(240,244,255,0.08);
          background: #060c18;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: rgba(240,244,255,0.35);
          transition: border-color .2s, color .2s, box-shadow .2s;
          position: relative;
        }
        .np-btn:hover {
          border-color: rgba(59,130,246,0.35);
          color: #60a5fa;
          box-shadow: 0 0 12px rgba(59,130,246,0.18);
        }
        .np-btn.has-unread {
          color: #60a5fa;
          border-color: rgba(59,130,246,0.35);
          box-shadow: 0 0 14px rgba(59,130,246,0.2);
        }

        /* Badge — blue→red gradient like the login button */
        .np-badge {
          position: absolute; top: -5px; right: -5px;
          min-width: 17px; height: 17px; border-radius: 99px;
          background: linear-gradient(135deg, #2563eb 0%, #b91c1c 100%);
          color: #fff; font-size: 0.58rem; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          padding: 0 4px; border: 2px solid #04080f;
          box-shadow: 0 2px 8px rgba(59,130,246,0.45);
          animation: np-pop .25s cubic-bezier(.22,1,.36,1);
        }
        @keyframes np-pop { from{transform:scale(0)} to{transform:scale(1)} }

        /* Panel */
        .np-panel {
          position: absolute; top: calc(100% + 10px); right: 0; width: 340px;
          background: #060c18;
          border: 1px solid rgba(59,130,246,0.12);
          border-radius: 16px; overflow: hidden;
          box-shadow:
            0 24px 64px rgba(0,0,0,0.7),
            0 0 0 1px rgba(59,130,246,0.06),
            0 1px 0 rgba(255,255,255,0.04) inset;
          z-index: 200;
          animation: np-appear .2s cubic-bezier(.22,1,.36,1);
        }
        @keyframes np-appear { from{opacity:0;transform:translateY(-8px) scale(.97)} to{opacity:1;transform:none} }

        /* Top accent bar — same blue→red as login */
        .np-topbar {
          height: 2px;
          background: linear-gradient(90deg, transparent 0%, #3b82f6 30%, #ef4444 70%, transparent 100%);
          opacity: .75;
        }

        /* Header */
        .np-header {
          padding: .875rem 1rem .75rem;
          border-bottom: 1px solid rgba(59,130,246,0.08);
          display: flex; align-items: center; justify-content: space-between;
        }
        .np-title {
          font-family: 'Playfair Display', serif;
          font-size: .95rem; font-weight: 500; color: #f0f4ff;
          display: flex; align-items: center; gap: .5rem;
        }
        .np-count-chip {
          font-family: 'Outfit', sans-serif;
          font-size: .6rem; font-weight: 700;
          background: rgba(59,130,246,0.10);
          border: 1px solid rgba(59,130,246,0.28);
          color: #60a5fa;
          padding: .15rem .45rem; border-radius: 99px;
        }

        /* Action buttons */
        .np-actions { display: flex; gap: .3rem; }
        .np-action-btn {
          display: flex; align-items: center; gap: .3rem;
          font-size: .65rem; font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
          color: rgba(240,244,255,0.28); background: none; border: none; cursor: pointer;
          padding: .3rem .5rem; border-radius: 6px;
          font-family: 'Outfit', sans-serif;
          transition: color .15s, background .15s;
        }
        .np-action-btn:hover {
          color: #60a5fa;
          background: rgba(59,130,246,0.08);
        }
        .np-action-btn.del:hover {
          color: #f87171;
          background: rgba(239,68,68,0.08);
        }

        /* List */
        .np-list {
          max-height: 340px; overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(59,130,246,0.12) transparent;
        }
        .np-item {
          display: flex; align-items: flex-start; gap: .7rem;
          padding: .8rem 1rem;
          border-bottom: 1px solid rgba(240,244,255,0.04);
          transition: background .15s; position: relative;
        }
        .np-item:last-child { border-bottom: none; }
        .np-item.unread { background: rgba(59,130,246,0.04); }
        .np-item:hover  { background: rgba(59,130,246,0.07); }

        /* Unread dot — blue glow */
        .np-unread-dot {
          position: absolute; left: .35rem; top: 50%; transform: translateY(-50%);
          width: 4px; height: 4px; border-radius: 50%;
          background: #3b82f6;
          box-shadow: 0 0 6px rgba(59,130,246,0.7);
        }

        .np-ico-wrap {
          width: 28px; height: 28px; border-radius: 7px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center; margin-top: .1rem;
        }
        .np-item-body { flex: 1; min-width: 0; }
        .np-item-row {
          display: flex; align-items: flex-start;
          justify-content: space-between; gap: .5rem; margin-bottom: .2rem;
        }
        .np-item-title {
          font-size: .8rem; font-weight: 600; color: #f0f4ff; line-height: 1.3;
        }
        .np-item-title.read {
          color: rgba(240,244,255,0.40); font-weight: 400;
        }
        .np-item-time {
          font-size: .62rem; color: rgba(240,244,255,0.22);
          white-space: nowrap; flex-shrink: 0;
        }
        .np-item-msg {
          font-size: .73rem; color: rgba(240,244,255,0.38); line-height: 1.45;
        }

        /* Mark-read button */
        .np-mark-btn {
          width: 22px; height: 22px; border-radius: 5px; flex-shrink: 0;
          border: 1px solid rgba(240,244,255,0.08); background: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: rgba(240,244,255,0.22);
          transition: border-color .15s, color .15s, background .15s;
          margin-top: .1rem;
        }
        .np-mark-btn:hover {
          border-color: rgba(59,130,246,0.35);
          color: #60a5fa;
          background: rgba(59,130,246,0.08);
        }

        /* Empty state */
        .np-empty {
          padding: 2.5rem 1rem; text-align: center;
          display: flex; flex-direction: column; align-items: center; gap: .75rem;
        }
        .np-empty-ico {
          width: 44px; height: 44px; border-radius: 11px;
          background: rgba(59,130,246,0.08);
          border: 1px solid rgba(59,130,246,0.22);
          display: flex; align-items: center; justify-content: center;
          color: #60a5fa;
          box-shadow: 0 0 16px rgba(59,130,246,0.14);
        }
        .np-empty p {
          font-size: .8rem; color: rgba(240,244,255,0.28); font-weight: 300;
        }

        /* Footer */
        .np-footer {
          padding: .5rem 1rem .75rem;
          border-top: 1px solid rgba(59,130,246,0.08);
          text-align: center;
          font-size: .65rem; color: rgba(240,244,255,0.18);
          font-weight: 300; font-family: 'Outfit', sans-serif;
        }

        @media(max-width:400px){
          .np-panel { width: calc(100vw - 2rem); right: -1rem; }
        }
      `}</style>

      <div className="np-wrap" ref={panelRef}>
        <button
          className={`np-btn ${unreadCount > 0 ? 'has-unread' : ''}`}
          onClick={() => setOpen(!open)}
          aria-label="Notificaciones"
        >
          <Bell size={16} />
          {unreadCount > 0 && (
            <span className="np-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
          )}
        </button>

        {open && (
          <div className="np-panel">
            <div className="np-topbar" />
            <div className="np-header">
              <div className="np-title">
                Notificaciones
                {unreadCount > 0 && <span className="np-count-chip">{unreadCount} nuevas</span>}
              </div>
              <div className="np-actions">
                {unreadCount > 0 && (
                  <button className="np-action-btn" onClick={readAll} title="Marcar todas como leídas">
                    <CheckCheck size={11} /> Todas
                  </button>
                )}
                {notifications.length > 0 && (
                  <button className="np-action-btn del" onClick={clear} title="Limpiar">
                    <Trash2 size={11} />
                  </button>
                )}
                <button className="np-action-btn" onClick={() => setOpen(false)}>
                  <X size={11} />
                </button>
              </div>
            </div>

            <div className="np-list">
              {notifications.length === 0 ? (
                <div className="np-empty">
                  <div className="np-empty-ico"><Bell size={20} /></div>
                  <p>Sin notificaciones por ahora</p>
                </div>
              ) : (
                notifications.map(n => {
                  const color = colorFor(n.type);
                  return (
                    <div key={n.id} className={`np-item ${!n.read ? 'unread' : ''}`}>
                      {!n.read && <div className="np-unread-dot" />}
                      <div className="np-ico-wrap" style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
                        {iconFor(n.type)}
                      </div>
                      <div className="np-item-body">
                        <div className="np-item-row">
                          <span className={`np-item-title ${n.read ? 'read' : ''}`}>{n.title}</span>
                          <span className="np-item-time">{timeAgo(n.createdAt)}</span>
                        </div>
                        <p className="np-item-msg">{n.message}</p>
                      </div>
                      {!n.read && (
                        <button className="np-mark-btn" onClick={() => read(n.id)} title="Marcar como leída">
                          <Check size={10} />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {notifications.length > 0 && (
              <div className="np-footer">Actualizado en tiempo real</div>
            )}
          </div>
        )}
      </div>
    </>
  );
}