'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, AlertTriangle, BellRing, CheckCircle2, Info } from 'lucide-react';
import {
  IN_APP_NOTIFICATION_EVENT,
  type InAppNotificationPayload,
} from '@/lib/Fcm';

const DISPLAY_MS = 4500;
const EXIT_MS = 320;

function toneFor(type: InAppNotificationPayload['type']) {
  if (type === 'success') return { color: 'var(--clr-success)', bg: 'rgba(34,197,94,0.12)' };
  if (type === 'warning') return { color: 'var(--clr-warning)', bg: 'rgba(249,115,22,0.12)' };
  if (type === 'error') return { color: 'var(--clr-error)', bg: 'rgba(239,68,68,0.12)' };
  return { color: 'var(--gold2)', bg: 'rgba(201,168,76,0.12)' };
}

function iconFor(type: InAppNotificationPayload['type']) {
  if (type === 'success') return <CheckCircle2 size={17} />;
  if (type === 'warning') return <AlertTriangle size={17} />;
  if (type === 'error') return <AlertCircle size={17} />;
  return <Info size={17} />;
}

export function InAppNotificationBanner() {
  const router = useRouter();
  const [current, setCurrent] = useState<InAppNotificationPayload | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const hideTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  const clearTimers = useCallback(() => {
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    hideTimerRef.current = null;
    closeTimerRef.current = null;
  }, []);

  const closeBanner = useCallback(() => {
    setIsVisible(false);
    closeTimerRef.current = window.setTimeout(() => setCurrent(null), EXIT_MS);
  }, []);

  const showBanner = useCallback((payload: InAppNotificationPayload) => {
    clearTimers();
    setCurrent(payload);
    const audio = audioRef.current;
    if (audio) {
      if (audioCtxRef.current?.state === 'suspended') {
        void audioCtxRef.current.resume().catch(() => {
          // Si falla resume, intentamos igual el play normal.
        });
      }
      audio.currentTime = 0;
      void audio.play().catch(() => {
        // Algunos navegadores bloquean autoplay hasta interacción del usuario.
      });
    }
    requestAnimationFrame(() => setIsVisible(true));
    hideTimerRef.current = window.setTimeout(closeBanner, DISPLAY_MS);
  }, [clearTimers, closeBanner]);

  useEffect(() => {
    const audio = new Audio('/Control360.mpeg');
    audio.preload = 'auto';
    audio.volume = 1;
    audioRef.current = audio;
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextCtor) {
      const ctx = new AudioContextCtor();
      const source = ctx.createMediaElementSource(audio);
      const gain = ctx.createGain();
      gain.gain.value = 1.8;
      source.connect(gain);
      gain.connect(ctx.destination);
      audioCtxRef.current = ctx;
      gainRef.current = gain;
      sourceRef.current = source;
    }

    const handleIncoming = (event: Event) => {
      const customEvent = event as CustomEvent<InAppNotificationPayload>;
      if (!customEvent.detail) return;
      showBanner(customEvent.detail);
    };

    window.addEventListener(IN_APP_NOTIFICATION_EVENT, handleIncoming as EventListener);
    return () => {
      window.removeEventListener(IN_APP_NOTIFICATION_EVENT, handleIncoming as EventListener);
      clearTimers();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      gainRef.current = null;
      sourceRef.current = null;
      if (audioCtxRef.current) {
        void audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    };
  }, [clearTimers, showBanner]);

  if (!current) return null;

  const tone = toneFor(current.type);

  return (
    <>
      <style>{`
        .iab-wrap {
          position: fixed;
          top: calc(env(safe-area-inset-top, 0px) + 10px);
          left: 50%;
          transform: translateX(-50%);
          width: min(620px, calc(100vw - 1.25rem));
          z-index: 80;
          pointer-events: none;
        }

        .iab-banner {
          pointer-events: auto;
          background: linear-gradient(180deg, rgba(20,24,32,0.98), rgba(14,17,23,0.98));
          border: 1px solid var(--gold-border);
          border-radius: 14px;
          box-shadow: 0 18px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(201,168,76,0.08) inset;
          overflow: hidden;
          cursor: pointer;
          transform: translateY(-140%);
          opacity: 0;
          transition:
            transform 380ms cubic-bezier(0.22, 1, 0.36, 1),
            opacity 260ms ease;
        }
        .iab-banner.show {
          transform: translateY(0);
          opacity: 1;
        }
        .iab-banner.hide {
          transform: translateY(-140%);
          opacity: 0;
        }

        .iab-topbar {
          height: 2px;
          background: linear-gradient(90deg, transparent 0%, var(--gold2) 45%, transparent 100%);
          opacity: 0.75;
        }

        .iab-content {
          display: flex;
          align-items: flex-start;
          gap: 0.8rem;
          padding: 0.8rem 0.9rem 0.78rem;
        }

        .iab-icon {
          width: 31px;
          height: 31px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          border: 1px solid color-mix(in srgb, ${tone.color} 35%, transparent);
          color: ${tone.color};
          background: ${tone.bg};
        }

        .iab-body { min-width: 0; }
        .iab-title {
          color: var(--foreground);
          font-size: 0.86rem;
          font-weight: 600;
          line-height: 1.35;
          margin-bottom: 0.15rem;
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }
        .iab-text {
          color: var(--w70);
          font-size: 0.76rem;
          line-height: 1.45;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .iab-hint {
          margin-left: auto;
          font-size: 0.64rem;
          color: var(--w40);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          white-space: nowrap;
          padding-top: 0.12rem;
        }
      `}</style>

      <div className="iab-wrap" role="status" aria-live="polite">
        <div
          className={`iab-banner ${isVisible ? 'show' : 'hide'}`}
          onClick={() => {
            closeBanner();
            if (current.url) router.push(current.url);
          }}
        >
          <div className="iab-topbar" />
          <div className="iab-content">
            <div className="iab-icon">{iconFor(current.type)}</div>
            <div className="iab-body">
              <div className="iab-title">
                <BellRing size={14} />
                {current.title}
              </div>
              <p className="iab-text">{current.message || 'Tienes una nueva notificación.'}</p>
            </div>
            <span className="iab-hint">Abrir</span>
          </div>
        </div>
      </div>
    </>
  );
}
