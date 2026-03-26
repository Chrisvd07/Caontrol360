'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Fuel, Wrench, UtensilsCrossed, CircleDot, HelpCircle,
  Check, Volume2, VolumeX, Sparkles, Loader2, Mic, MicOff, ArrowRight,
} from 'lucide-react';
import { voiceService } from '@/lib/voice';
import { createRequestFirestore } from '@/lib/firestore-service';
import { notifyRole } from '@/lib/notify';
import type { ChatMessage, RequestType, Request } from '@/lib/types';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/ocr';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/* ─────────────────────────────────────────────
   CONSTANTES
───────────────────────────────────────────── */
// ✅ Ya no se necesita OPENAI_API_KEY aquí
const WHISPER_URL = '/api/openai/whisper';
const CHAT_URL    = '/api/openai';

/* ─────────────────────────────────────────────
   WEEKLY CONFIG
───────────────────────────────────────────── */
interface WeeklyExpenseConfig {
  enabled: boolean;
  amount: number;
  type: string;
  description: string;
}

async function getWeeklyConfig(): Promise<WeeklyExpenseConfig | null> {
  try {
    const ref  = doc(db, 'gastoflow_config', 'weekly_expense');
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data() as WeeklyExpenseConfig;
    return data.enabled ? data : null;
  } catch (err) {
    console.warn('[ChatBot] getWeeklyConfig:', err);
    return null;
  }
}

/* ─────────────────────────────────────────────
   WEEKLY INTENT DETECTOR
───────────────────────────────────────────── */
const WEEKLY_PATTERNS = [
  /\bseman(a|al)\b/i,
  /lo de (la )?seman/i,
  /gasto seman/i,
  /d[aá]me lo de/i,
  /solicitud seman/i,
  /mi (gasto|combustible|viat|vi[aá]t).{0,10}seman/i,
  /lo de siempre/i,
  /lo (acostumbrado|normal|habitual)/i,
  /mi rutina/i,
];

function isWeeklyRequest(text: string): boolean {
  return WEEKLY_PATTERNS.some(p => p.test(text));
}

/* ─────────────────────────────────────────────
   TYPES
───────────────────────────────────────────── */
interface ChatBotProps {
  onClose: () => void;
  onRequestCreated: (request: Request) => void;
}

interface SolicitudDraft {
  type: RequestType | null;
  amount: number | null;
  description: string | null;
}

interface GPTResponse {
  message: string;
  intent:
    | 'collecting'
    | 'ready_to_confirm'
    | 'confirmed'
    | 'cancelled'
    | 'faq'
    | 'chitchat'
    | 'out_of_scope';
  requestType: RequestType | null;
  amount: number | null;
  description: string | null;
  chips: string[];
}

/* ─────────────────────────────────────────────
   CATÁLOGO
───────────────────────────────────────────── */
const REQUEST_TYPES: { type: RequestType; label: string; icon: React.ReactNode }[] = [
  { type: 'combustible', label: 'Combustible', icon: <Fuel            size={13} /> },
  { type: 'materiales',  label: 'Materiales',  icon: <Wrench          size={13} /> },
  { type: 'viatico',     label: 'Viático',     icon: <UtensilsCrossed size={13} /> },
  { type: 'gomera',      label: 'Gomera',      icon: <CircleDot       size={13} /> },
  { type: 'otros',       label: 'Otros',       icon: <HelpCircle      size={13} /> },
];

/* ─────────────────────────────────────────────
   SYSTEM PROMPT
───────────────────────────────────────────── */
const buildSystemPrompt = (draft: SolicitudDraft) => `
Eres el asistente de Control 360, una plataforma de gastos corporativos en República Dominicana.
Tu misión: ayudar a crear solicitudes de gastos mediante conversación natural, y responder preguntas sobre el proceso.

ESTADO ACTUAL DE LA CONVERSACIÓN:
- Tipo detectado hasta ahora: ${draft.type ?? 'ninguno'}
- Monto detectado hasta ahora: ${draft.amount ?? 'ninguno'}
- Descripción: ${draft.description ?? 'ninguna'}

TIPOS DE SOLICITUD:
- combustible: gasolina, diésel, repostar, tanquear
- materiales: insumos, herramientas, repuestos, suministros
- viatico: comida, transporte, taxi, uber, almuerzo, hotel, pasajes
- gomera: neumáticos, llantas, gomas, caucho, ruedas
- otros: cualquier gasto corporativo que no encaje arriba

REGLAS DE CONVERSACIÓN NATURAL:
1. Si el usuario cambia de opinión en cualquier momento, SIEMPRE actualiza requestType y/o amount con el nuevo valor.
2. Si el usuario ya había dado tipo+monto y ahora cambia algo, actualiza solo lo que cambió y vuelve a confirmar.
3. Nunca le digas al usuario que use palabras específicas o comandos. Entiende lenguaje natural.
4. Los montos pueden venir como texto ("mil quinientos", "dos mil pesos", "RD$3,000") — conviértelos a número.
5. Sé cálido, breve y directo. Máximo 2-3 oraciones.
6. Solo pide confirmación explícita cuando tengas AMBOS: tipo Y monto.
7. Si el usuario confirma ("sí", "dale", "correcto", "listo", "adelante", "ok"), usa intent: "confirmed".
8. Si el usuario cancela ("no", "cancela", "olvídalo"), usa intent: "cancelled".
9. Cuando tengas tipo+monto, usa intent: "ready_to_confirm" y haz un resumen claro.

CHIPS:
- Son atajos opcionales de respuesta rápida
- Máximo 4 chips, texto corto
- Para ready_to_confirm: chips: [] (los botones se muestran automáticamente)

RESPONDE SIEMPRE con JSON válido (sin markdown, sin texto extra):
{
  "message": "Tu respuesta conversacional aquí",
  "intent": "collecting" | "ready_to_confirm" | "confirmed" | "cancelled" | "faq" | "chitchat" | "out_of_scope",
  "requestType": "combustible" | "materiales" | "viatico" | "gomera" | "otros" | null,
  "amount": number | null,
  "description": "descripción breve del gasto o null",
  "chips": ["opción1", "opción2"]
}
`.trim();

/* ─────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────── */
export function ChatBot({ onClose, onRequestCreated }: ChatBotProps) {
  const { user } = useAuth();

  const [messages, setMessages]             = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue]         = useState('');
  const [isMuted, setIsMuted]               = useState(false);
  const [isTyping, setIsTyping]             = useState(false);
  const [isSaving, setIsSaving]             = useState(false);
  const [done, setDone]                     = useState(false);

  const draftRef = useRef<SolicitudDraft>({ type: null, amount: null, description: null });

  const [isRecording, setIsRecording]       = useState(false);
  const [previewUrl, setPreviewUrl]         = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recTime, setRecTime]               = useState('0:00');
  const recordedBlobRef                     = useRef<Blob | null>(null);
  const mediaRecorderRef                    = useRef<MediaRecorder | null>(null);
  const audioChunksRef                      = useRef<Blob[]>([]);
  const recIntervalRef                      = useRef<ReturnType<typeof setInterval> | null>(null);
  const recSecsRef                          = useRef(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const gptHistory     = useRef<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const startTimeRef   = useRef<number>(Date.now());
  const textareaRef    = useRef<HTMLTextAreaElement>(null);

  /* ── helpers ── */
  const handleClose = useCallback(() => {
    voiceService.stopSpeaking?.();
    onClose();
  }, [onClose]);

  const speak = useCallback((text: string) => {
    if (!isMuted && voiceService.isSynthesisSupported()) {
      const clean = text.replace(/\*\*/g, '').replace(/[✅❌📥💡🎙️📝📅]/g, '');
      voiceService.speak(clean);
    }
  }, [isMuted]);

  const addBotMsg = useCallback((content: string, isConfirm?: boolean, chips?: string[]) => {
    const msg: ChatMessage = {
      id: `bot-${Date.now()}-${Math.random()}`,
      role: 'bot', content,
      timestamp: new Date().toISOString(), type: 'text',
      chips: isConfirm ? ['__confirm__'] : chips,
    };
    setMessages(prev => [...prev, msg]);
    speak(content);
  }, [speak]);

  const addUserMsg = useCallback((content: string, type: 'text' | 'audio' = 'text') => {
    const msg: ChatMessage = {
      id: `usr-${Date.now()}-${Math.random()}`,
      role: 'user', content,
      timestamp: new Date().toISOString(), type,
    };
    setMessages(prev => [...prev, msg]);
  }, []);

  /* ── greeting ── */
  useEffect(() => {
    const t = setTimeout(() => {
      const name     = user?.name?.split(' ')[0] ?? '';
      const greeting = `¡Hola${name ? `, ${name}` : ''}! 👋 Soy tu asistente de Control 360. Cuéntame qué necesitas — puedes cambiar lo que quieras en cualquier momento.`;
      addBotMsg(greeting);
      gptHistory.current.push({ role: 'assistant', content: greeting });
    }, 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── auto scroll ── */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  /* ══════════════════════════════════════════
     GPT CALL — ✅ sin Authorization header
  ══════════════════════════════════════════ */
  const callGPT = useCallback(async (userText: string): Promise<GPTResponse> => {
    gptHistory.current.push({ role: 'user', content: userText });

    const res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:       'gpt-4o-mini',
        max_tokens:  500,
        temperature: 0.3,
        messages: [
          { role: 'system', content: buildSystemPrompt(draftRef.current) },
          ...gptHistory.current,
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody?.error?.message ?? `OpenAI ${res.status}`);
    }

    const data    = await res.json();
    const raw     = (data.choices[0].message.content as string).trim();
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();

    gptHistory.current.push({ role: 'assistant', content: raw });

    try {
      const parsed = JSON.parse(cleaned) as GPTResponse;
      return {
        message:     parsed.message     ?? 'Entendido.',
        intent:      parsed.intent      ?? 'collecting',
        requestType: parsed.requestType ?? null,
        amount:      typeof parsed.amount === 'number' ? parsed.amount : null,
        description: parsed.description ?? null,
        chips:       Array.isArray(parsed.chips) ? parsed.chips : [],
      };
    } catch {
      return { message: raw, intent: 'collecting', requestType: null, amount: null, description: null, chips: [] };
    }
  }, []);

  /* ══════════════════════════════════════════
     CREAR SOLICITUD
  ══════════════════════════════════════════ */
  const createSolicitud = useCallback(async (
    overrideDraft?: { type: RequestType; amount: number; description: string }
  ) => {
    const current = overrideDraft ?? draftRef.current;
    if (!user || !current.type || !current.amount) return;
    setIsSaving(true);

    try {
      const tipoInfo = REQUEST_TYPES.find(t => t.type === current.type);
      const req = await createRequestFirestore({
        userId:      user.id,
        userName:    user.name,
        type:        current.type,
        items: [{
          id:          `item-${Date.now()}`,
          type:        current.type,
          description: current.description ?? tipoInfo?.label ?? current.type,
          amount:      current.amount,
        }],
        totalAmount: current.amount,
        status:      'enviada',
        evidences:   [],
      });

      const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
      addBotMsg(
        `✅ ¡Listo! Tu solicitud **${req.numero}** de ${tipoInfo?.label} por ${formatCurrency(current.amount)} fue enviada en ${elapsed}s. ¿Necesitas algo más?`,
      );
      setDone(true);
      draftRef.current = { type: null, amount: null, description: null };
      toast.success('Solicitud creada exitosamente');
      onRequestCreated(req);

      notifyRole('pagos', {
        title:   `📥 Nueva solicitud ${req.numero}`,
        message: `${user.name} solicitó ${tipoInfo?.label} por ${formatCurrency(current.amount)}.`,
        type:    'info',
      }).catch(err => console.warn('[ChatBot] notifyRole:', err?.message ?? err));

    } catch (err) {
      console.error('[ChatBot] createSolicitud:', err);
      toast.error('Error al guardar. Intenta de nuevo.');
      addBotMsg('Hubo un error al guardar. ¿Intentamos de nuevo?');
    } finally {
      setIsSaving(false);
    }
  }, [user, addBotMsg, onRequestCreated]);

  /* ══════════════════════════════════════════
     WEEKLY EXPENSE HANDLER
  ══════════════════════════════════════════ */
  const handleWeeklyRequest = useCallback(async (): Promise<boolean> => {
    let weeklyConfig: WeeklyExpenseConfig | null = null;
    try {
      weeklyConfig = await getWeeklyConfig();
    } catch (err) {
      console.warn('[ChatBot] handleWeeklyRequest fetch error:', err);
    }

    if (!weeklyConfig) {
      addBotMsg(
        'Parece que el gasto semanal no está configurado aún. Dile al administrador que lo active en Configuración. ¿Te ayudo con otra solicitud?'
      );
      return true;
    }

    const tipoLabel = REQUEST_TYPES.find(t => t.type === weeklyConfig!.type)?.label ?? weeklyConfig.type;

    draftRef.current = {
      type:        weeklyConfig.type as RequestType,
      amount:      weeklyConfig.amount,
      description: weeklyConfig.description,
    };

    addBotMsg(
      `📅 ¡Claro! Tu gasto semanal es de **${tipoLabel}** por **${formatCurrency(weeklyConfig.amount)}**.\n${weeklyConfig.description}\n\n¿Confirmo la solicitud?`,
      true,
    );

    return true;
  }, [addBotMsg]);

  /* ══════════════════════════════════════════
     PROCESAR RESPUESTA GPT
  ══════════════════════════════════════════ */
  const processGPTResponse = useCallback(async (gpt: GPTResponse) => {
    const { message, intent, requestType, amount, description, chips } = gpt;

    if (requestType !== undefined) draftRef.current.type = requestType;
    if (amount !== undefined)      draftRef.current.amount = amount;
    if (description !== undefined) draftRef.current.description = description;

    if (intent === 'confirmed') {
      addBotMsg(message);
      await createSolicitud();
      return;
    }

    if (intent === 'cancelled') {
      draftRef.current = { type: null, amount: null, description: null };
      setDone(false);
      addBotMsg(message, false, chips.length ? chips : undefined);
      return;
    }

    if (intent === 'ready_to_confirm') {
      addBotMsg(message, true);
      return;
    }

    addBotMsg(message, false, chips.length ? chips : undefined);
  }, [addBotMsg, createSolicitud]);

  /* ══════════════════════════════════════════
     MAIN INPUT HANDLER
  ══════════════════════════════════════════ */
  const handleInput = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping || isSaving) return;

    addUserMsg(trimmed);
    setIsTyping(true);

    if (done) {
      setDone(false);
      startTimeRef.current = Date.now();
    }

    let handledByWeekly = false;

    try {
      if (isWeeklyRequest(trimmed)) {
        handledByWeekly = await handleWeeklyRequest();
      }

      if (!handledByWeekly) {
        const gptResult = await callGPT(trimmed);
        await processGPTResponse(gptResult);
      }
    } catch (err: any) {
      console.error('[ChatBot] handleInput:', err);
      const msg =
        err?.message?.includes('401') ? '⚠️ API key inválida. Verifica la configuración.' :
        err?.message?.includes('429') ? '⏳ Demasiadas solicitudes. Espera un momento.' :
        '❌ Error de conexión. Intenta de nuevo.';
      addBotMsg(msg);
    } finally {
      setIsTyping(false);
    }
  }, [isTyping, isSaving, done, addUserMsg, callGPT, processGPTResponse, handleWeeklyRequest]);

  /* ── chip click ── */
  const handleChip = useCallback((chip: string) => {
    handleInput(chip);
  }, [handleInput]);

  /* ══════════════════════════════════════════
     CONFIRMAR desde botones visuales
  ══════════════════════════════════════════ */
  const handleConfirmAction = useCallback(async (confirm: boolean) => {
    if (confirm) {
      addUserMsg('Confirmar');
      if (draftRef.current.type && draftRef.current.amount) {
        setIsSaving(true);
        await createSolicitud();
      } else {
        addBotMsg('No hay solicitud pendiente por confirmar. ¿Qué necesitas?');
      }
    } else {
      addUserMsg('Cancelar');
      draftRef.current = { type: null, amount: null, description: null };
      setDone(false);
      addBotMsg('Cancelado. ¿Hay algo más en lo que pueda ayudarte?');
    }
  }, [addUserMsg, addBotMsg, createSolicitud]);

  const lastBotMsg = [...messages].reverse().find(m => m.role === 'bot');

  const toggleMute = () => { voiceService.stopSpeaking?.(); setIsMuted(m => !m); };

  /* ══════════════════════════════════════════
     WHISPER RECORDING
  ══════════════════════════════════════════ */
  const toggleRecord = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      if (recIntervalRef.current) clearInterval(recIntervalRef.current);
      return;
    }

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      toast.error(
        'El micrófono requiere conexión segura (HTTPS). Accede al sitio por https:// e intenta de nuevo.',
        { duration: 6000 }
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
        .find(m => MediaRecorder.isTypeSupported(m)) ?? '';
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      mediaRecorderRef.current = mr;
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mr.mimeType ?? 'audio/webm' });
        recordedBlobRef.current = blob;
        setPreviewUrl(URL.createObjectURL(blob));
      };
      mr.start(200);
      setIsRecording(true);
      recSecsRef.current = 0;
      setRecTime('0:00');
      recIntervalRef.current = setInterval(() => {
        recSecsRef.current++;
        const m = Math.floor(recSecsRef.current / 60);
        const s = recSecsRef.current % 60;
        setRecTime(`${m}:${s.toString().padStart(2, '0')}`);
        if (recSecsRef.current >= 120) {
          mr.stop();
          setIsRecording(false);
          if (recIntervalRef.current) clearInterval(recIntervalRef.current);
        }
      }, 1000);
    } catch (err: any) {
      const errName = err?.name ?? '';
      const msg =
        errName === 'NotAllowedError'      ? 'Permiso de micrófono denegado. Habilítalo en la configuración del navegador.' :
        errName === 'NotFoundError'        ? 'No se encontró ningún micrófono en este dispositivo.' :
        errName === 'NotReadableError'     ? 'El micrófono está en uso por otra aplicación.' :
        errName === 'OverconstrainedError' ? 'Las restricciones de audio no son compatibles con tu dispositivo.' :
        errName === 'SecurityError'        ? 'Acceso al micrófono bloqueado por política de seguridad del sitio.' :
        `No se pudo acceder al micrófono: ${err?.message ?? err}`;
      toast.error(msg, { duration: 5000 });
    }
  };

  const cancelAudio = () => { recordedBlobRef.current = null; setPreviewUrl(null); };

  /* ══════════════════════════════════════════
     SEND AUDIO — ✅ sin Authorization header
  ══════════════════════════════════════════ */
  const sendAudio = async () => {
    const blob = recordedBlobRef.current;
    if (!blob) return;
    const mime = blob.type ?? 'audio/webm';
    const ext  = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm';
    const file = new File([blob], `audio.${ext}`, { type: mime });

    addUserMsg('🎙️ Mensaje de voz', 'audio');
    cancelAudio();
    setIsTranscribing(true);

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('model', 'whisper-1');
      form.append('language', 'es');

      const wRes = await fetch(WHISPER_URL, {
        method: 'POST',
        body: form, // ✅ sin Authorization header
      });

      if (!wRes.ok) {
        const e = await wRes.json().catch(() => ({}));
        throw new Error(e?.error?.message ?? `Whisper ${wRes.status}`);
      }
      const wData      = await wRes.json();
      const transcript = wData.text?.trim();
      if (!transcript) throw new Error('No se obtuvo transcripción');

      addBotMsg(`📝 Escuché: *"${transcript}"*`);
      await handleInput(transcript);
    } catch (err: any) {
      console.error('[ChatBot] Whisper:', err);
      toast.error(err?.message ?? 'Error al transcribir el audio');
    } finally {
      setIsTranscribing(false);
    }
  };

  /* ── send text ── */
  const handleSend = () => {
    if (!inputValue.trim() || isTyping || isSaving) return;
    handleInput(inputValue.trim());
    setInputValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 110) + 'px';
  };

  /* ══════════════════════════════════════════
     RENDER — sin cambios
  ══════════════════════════════════════════ */
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap');

        .cb-panel {
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

        .cb-overlay {
          position:fixed; inset:0; z-index:49;
          background:rgba(4,8,15,.55);
          backdrop-filter:blur(4px);
          animation:cb-fade .2s ease;
        }
        @keyframes cb-fade { from{opacity:0} to{opacity:1} }

        .cb-wrap {
          position:fixed; z-index:50; inset:.75rem;
          display:flex; align-items:flex-end; justify-content:flex-end;
        }
        @media(min-width:520px){ .cb-wrap { inset:auto; bottom:1.5rem; right:1.5rem; } }

        .cb-panel {
          width:100%; max-width:400px;
          height:min(640px,calc(100vh - 1.5rem));
          background:var(--ink2);
          border:1px solid rgba(59,130,246,.12);
          border-radius:20px; overflow:hidden;
          display:flex; flex-direction:column;
          box-shadow:
            0 32px 80px rgba(0,0,0,.8),
            0 0 0 1px rgba(59,130,246,.06),
            0 1px 0 rgba(255,255,255,.04) inset;
          animation:cb-slide .3s cubic-bezier(.22,1,.36,1);
          font-family:'Outfit',sans-serif;
        }
        @keyframes cb-slide {
          from{opacity:0;transform:translateY(22px) scale(.97)}
          to{opacity:1;transform:none}
        }

        .cb-topbar {
          height:2px; flex-shrink:0;
          background:linear-gradient(90deg,transparent 0%,var(--blue) 30%,var(--red) 70%,transparent 100%);
          opacity:.75;
        }

        .cb-header {
          display:flex; align-items:center; gap:.75rem;
          padding:.875rem 1rem;
          border-bottom:1px solid rgba(59,130,246,.08);
          flex-shrink:0;
          background:rgba(6,12,24,.6);
        }
        .cb-avatar {
          width:36px; height:36px; border-radius:10px; flex-shrink:0;
          background:linear-gradient(135deg,#2563eb,#1d4ed8);
          display:flex; align-items:center; justify-content:center;
          box-shadow:0 4px 14px rgba(59,130,246,.32);
        }
        .cb-hdr-info { flex:1; min-width:0; }
        .cb-hdr-name { font-size:.875rem; font-weight:600; color:var(--w); display:block; }
        .cb-hdr-sub  { font-size:.62rem; color:rgba(240,244,255,.3); }

        .cb-hbtn {
          width:28px; height:28px; border-radius:7px; flex-shrink:0;
          border:1px solid var(--w08); background:none;
          display:flex; align-items:center; justify-content:center;
          cursor:pointer; color:var(--w2); transition:all .15s;
        }
        .cb-hbtn:hover { border-color:var(--blue-border); color:var(--blue2); background:var(--blue-dim); }
        .cb-hbtn.muted { color:var(--red2); border-color:var(--red-border); }
        .cb-hbtn.cls:hover { border-color:var(--red-border); color:var(--red2); background:var(--red-dim); }

        .cb-msgs {
          flex:1; overflow-y:auto; padding:1rem;
          display:flex; flex-direction:column; gap:.5rem;
          min-height:0; scroll-behavior:smooth;
        }
        .cb-msgs::-webkit-scrollbar { width:3px; }
        .cb-msgs::-webkit-scrollbar-thumb { background:rgba(59,130,246,.12); border-radius:999px; }

        .cb-msg { display:flex; max-width:88%; }
        .cb-msg.bot  { align-self:flex-start; }
        .cb-msg.user { align-self:flex-end; flex-direction:row-reverse; }

        .cb-bubble {
          padding:.6rem .875rem; border-radius:14px;
          font-size:.82rem; line-height:1.6;
          white-space:pre-wrap; word-break:break-word;
          animation:cb-up .25s ease forwards; opacity:0;
        }
        @keyframes cb-up { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }

        .cb-msg.bot .cb-bubble {
          background:var(--ink3);
          border:1px solid rgba(59,130,246,.1);
          color:var(--w7);
          border-radius:4px 14px 14px 14px;
        }
        .cb-msg.user .cb-bubble {
          background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 40%,#b91c1c 100%);
          color:#fff; font-weight:500;
          border-radius:14px 4px 14px 14px;
          box-shadow:0 4px 16px rgba(59,130,246,.25);
        }

        .cb-typing {
          display:flex; align-items:center; gap:4px;
          padding:.6rem .875rem;
          background:var(--ink3);
          border:1px solid rgba(59,130,246,.1);
          border-radius:4px 14px 14px 14px;
          width:fit-content;
          animation:cb-up .2s ease forwards; opacity:0;
        }
        .cb-typing span {
          width:6px; height:6px; border-radius:50%;
          background:var(--blue2); opacity:.35;
          animation:cb-dot 1.2s infinite;
        }
        .cb-typing span:nth-child(2) { animation-delay:.2s; }
        .cb-typing span:nth-child(3) { animation-delay:.4s; }
        @keyframes cb-dot {
          0%,60%,100%{opacity:.2;transform:translateY(0)}
          30%{opacity:1;transform:translateY(-4px)}
        }

        .cb-saving {
          display:flex; align-items:center; gap:.5rem;
          padding:.55rem .875rem;
          background:var(--ink3);
          border:1px solid var(--blue-border);
          border-radius:4px 14px 14px 14px;
          font-size:.78rem; color:var(--blue2);
          width:fit-content;
          animation:cb-up .2s ease forwards; opacity:0;
        }

        .cb-confirm-wrap {
          display:flex; flex-direction:column; gap:.4rem;
          align-self:flex-start;
          animation:cb-up .25s ease forwards; opacity:0;
          max-width:88%;
        }
        .cb-confirm-bubble {
          padding:.6rem .875rem;
          border-radius:4px 14px 14px 14px;
          font-size:.82rem; line-height:1.6;
          background:var(--ink3);
          border:1px solid var(--blue-border);
          color:var(--w7);
        }
        .cb-confirm-btns { display:flex; gap:.4rem; }
        .cb-cbtn {
          flex:1; padding:.42rem .5rem; border-radius:8px;
          font-size:.75rem; font-weight:600;
          font-family:'Outfit',sans-serif; cursor:pointer; border:none;
          transition:all .15s;
          display:flex; align-items:center; justify-content:center; gap:.35rem;
        }
        .cb-cbtn.yes {
          background:linear-gradient(135deg,#2563eb,#1d4ed8);
          color:#fff; box-shadow:0 2px 10px rgba(59,130,246,.28);
        }
        .cb-cbtn.yes:hover { filter:brightness(1.1); transform:translateY(-1px); }
        .cb-cbtn.yes:disabled { opacity:.5; cursor:not-allowed; transform:none; filter:none; }
        .cb-cbtn.no {
          background:var(--red-dim);
          border:1px solid var(--red-border);
          color:var(--red2);
        }
        .cb-cbtn.no:hover { background:rgba(239,68,68,.18); }
        .cb-cbtn.no:disabled { opacity:.5; cursor:not-allowed; }

        .cb-recbar {
          display:none; align-items:center; gap:8px;
          font-size:.7rem; color:var(--red2);
          background:var(--red-dim);
          border:1px solid var(--red-border);
          padding:5px 14px; border-radius:8px; margin-bottom:8px;
        }
        .cb-recbar.on { display:flex; }
        .cb-recdot {
          width:7px; height:7px; border-radius:50%;
          background:var(--red);
          animation:cb-blink 1s infinite; flex-shrink:0;
        }
        @keyframes cb-blink { 0%,100%{opacity:1} 50%{opacity:.2} }

        .cb-transcbar {
          display:none; align-items:center; gap:8px;
          font-size:.7rem; color:var(--blue2);
          background:var(--blue-dim);
          border:1px solid var(--blue-border);
          padding:5px 14px; border-radius:8px; margin-bottom:8px;
        }
        .cb-transcbar.on { display:flex; }
        .cb-tspin {
          width:11px; height:11px;
          border:2px solid var(--blue2); border-top-color:transparent;
          border-radius:50%; animation:cb-spin .7s linear infinite; flex-shrink:0;
        }
        @keyframes cb-spin { to{transform:rotate(360deg)} }

        .cb-audprev {
          display:none; align-items:center; gap:8px;
          background:var(--ink3);
          border:1px solid var(--blue-border);
          border-radius:10px; padding:7px 12px; margin-bottom:8px;
        }
        .cb-audprev.on { display:flex; }
        .cb-audprev audio { flex:1; height:26px; filter:invert(.85) hue-rotate(180deg); }
        .cb-aplbl { font-size:.68rem; color:var(--blue2); white-space:nowrap; }
        .cb-apok {
          background:linear-gradient(135deg,#2563eb,#1d4ed8);
          color:#fff; border:none; border-radius:6px;
          font-family:'Outfit',sans-serif; font-size:.7rem;
          padding:4px 10px; cursor:pointer; white-space:nowrap;
          transition:transform .15s;
        }
        .cb-apok:hover { transform:scale(1.04); }
        .cb-apx {
          background:none; border:1px solid var(--red-border);
          color:var(--red2); border-radius:6px;
          font-family:'Outfit',sans-serif; font-size:.7rem;
          padding:4px 8px; cursor:pointer; transition:all .15s;
        }
        .cb-apx:hover { background:var(--red-dim); }

        .cb-inputbar {
          padding:.7rem 1rem;
          border-top:1px solid rgba(59,130,246,.08);
          display:flex; flex-direction:column; flex-shrink:0;
          background:rgba(4,8,15,.6);
        }
        .cb-irow {
          display:flex; align-items:flex-end; gap:.4rem;
          background:var(--ink3);
          border:1px solid var(--w08);
          border-radius:11px; padding:.5rem .5rem;
          transition:border-color .2s, box-shadow .2s;
        }
        .cb-irow:focus-within {
          border-color:var(--blue-border);
          box-shadow:0 0 0 3px var(--blue-dim);
        }
        .cb-ta {
          flex:1; background:none; border:none; outline:none;
          color:var(--w); font-family:'Outfit',sans-serif;
          font-size:.82rem; resize:none;
          max-height:110px; min-height:20px; line-height:1.5;
        }
        .cb-ta::placeholder { color:var(--w2); }

        .cb-ib {
          width:32px; height:32px; border-radius:8px; flex-shrink:0;
          border:1px solid var(--w08); background:var(--ink4);
          display:flex; align-items:center; justify-content:center;
          cursor:pointer; color:var(--w2); transition:all .15s;
        }
        .cb-ib:hover { border-color:var(--blue-border); color:var(--blue2); background:var(--blue-dim); }
        .cb-ib:disabled { opacity:.28; cursor:not-allowed; }

        .cb-ib.rec {
          background:var(--red-dim); border-color:var(--red-border); color:var(--red2);
          animation:cb-pulsebtn 1s infinite;
        }
        @keyframes cb-pulsebtn {
          0%,100%{ box-shadow:0 0 0 0 rgba(239,68,68,.22); }
          50%{ box-shadow:0 0 0 5px rgba(239,68,68,0); }
        }

        .cb-send {
          background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 50%,#b91c1c 100%);
          border-color:transparent; color:#fff;
          box-shadow:0 2px 10px rgba(59,130,246,.25);
        }
        .cb-send:not(:disabled):hover { filter:brightness(1.1); transform:scale(1.05); }
        .cb-send:disabled { opacity:.32; cursor:not-allowed; transform:none; filter:none; }

        .cb-hint {
          text-align:center; font-size:.61rem;
          color:rgba(240,244,255,.18); margin-top:6px;
        }

        .cb-chips { display:flex; flex-wrap:wrap; gap:.35rem; }
        .cb-chip {
          display:inline-flex; align-items:center; gap:.3rem;
          padding:.32rem .7rem; border-radius:999px;
          font-size:.72rem; font-weight:500;
          border:1px solid var(--blue-border);
          background:var(--blue-dim); color:var(--blue2);
          cursor:pointer; font-family:'Outfit',sans-serif;
          transition:all .15s cubic-bezier(.22,1,.36,1);
        }
        .cb-chip:hover {
          background:rgba(59,130,246,.18);
          border-color:rgba(59,130,246,.55);
          transform:translateY(-1px);
        }

        @keyframes spin { to{transform:rotate(360deg)} }
      `}</style>

      <div className="cb-overlay" onClick={handleClose} />
      <div className="cb-wrap" onClick={e => e.stopPropagation()}>
        <div className="cb-panel">
          <div className="cb-topbar" />

          <div className="cb-header">
            <div className="cb-avatar"><Sparkles size={16} color="#fff" /></div>
            <div className="cb-hdr-info">
              <span className="cb-hdr-name">Asistente Control 360</span>
              <span className="cb-hdr-sub">Conversación libre · IA</span>
            </div>
            <button className={`cb-hbtn ${isMuted ? 'muted' : ''}`} onClick={toggleMute} title={isMuted ? 'Activar voz' : 'Silenciar'}>
              {isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
            </button>
            <button className="cb-hbtn cls" onClick={handleClose} title="Cerrar">
              <X size={12} />
            </button>
          </div>

          <div className="cb-msgs">
            {messages.map(msg => {
              const isConfirmMsg = msg.role === 'bot' && msg.chips?.[0] === '__confirm__';
              const hasChips     = msg.role === 'bot' && msg.chips && msg.chips.length > 0 && msg.chips[0] !== '__confirm__';
              const isLast       = msg === lastBotMsg;

              if (isConfirmMsg) {
                return (
                  <div key={msg.id} className="cb-confirm-wrap">
                    <div className="cb-confirm-bubble">{msg.content}</div>
                    {isLast && !isTyping && !isSaving && (
                      <div className="cb-confirm-btns">
                        <button className="cb-cbtn yes" disabled={isSaving} onClick={() => handleConfirmAction(true)}>
                          <Check size={12} /> Confirmar
                        </button>
                        <button className="cb-cbtn no" disabled={isSaving} onClick={() => handleConfirmAction(false)}>
                          <X size={12} /> Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={`cb-msg ${msg.role}`}
                  style={{ flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}
                >
                  <div className="cb-bubble">{msg.content}</div>
                  {hasChips && isLast && !isTyping && !isSaving && (
                    <div className="cb-chips" style={{ marginTop: '.35rem' }}>
                      {(msg.chips as string[]).map((c, i) => {
                        const tipoMatch = REQUEST_TYPES.find(t => t.label === c);
                        return (
                          <button key={i} className="cb-chip" onClick={() => handleChip(c)}>
                            {tipoMatch?.icon}{c}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {isTyping && <div className="cb-typing"><span /><span /><span /></div>}
            {isSaving && (
              <div className="cb-saving">
                <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                Guardando solicitud...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="cb-inputbar">
            <div className={`cb-recbar ${isRecording ? 'on' : ''}`}>
              <div className="cb-recdot" />
              <span>Grabando... {recTime} — presiona el mic para detener</span>
            </div>
            <div className={`cb-transcbar ${isTranscribing ? 'on' : ''}`}>
              <div className="cb-tspin" />
              <span>Transcribiendo con Whisper...</span>
            </div>
            {previewUrl && (
              <div className="cb-audprev on">
                <span className="cb-aplbl">🎙️</span>
                <audio controls src={previewUrl} />
                <button className="cb-apok" onClick={sendAudio}>Enviar</button>
                <button className="cb-apx" onClick={cancelAudio}>✕</button>
              </div>
            )}
            <div className="cb-irow">
              <textarea
                ref={textareaRef}
                className="cb-ta"
                value={inputValue}
                onChange={handleTextareaChange}
                onKeyDown={handleKey}
                placeholder={isTyping ? 'Procesando…' : isSaving ? 'Guardando…' : 'Escribe lo que necesitas...'}
                disabled={isTyping || isSaving}
                rows={1}
              />
              <button
                className={`cb-ib ${isRecording ? 'rec' : ''}`}
                onClick={toggleRecord}
                disabled={isSaving}
                title={isRecording ? 'Detener grabación' : 'Grabar mensaje de voz'}
              >
                {isRecording ? <MicOff size={13} /> : <Mic size={13} />}
              </button>
              <button
                className="cb-ib cb-send"
                onClick={handleSend}
                disabled={!inputValue.trim() || isTyping || isSaving}
              >
                {isTyping || isSaving
                  ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                  : <ArrowRight size={13} />}
              </button>
            </div>
            <div className="cb-hint">Di lo que necesitas · cambia de opinión cuando quieras</div>
          </div>
        </div>
      </div>
    </>
  );
}