'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { AppShell } from '@/components/app-shell';
import { Switch } from '@/components/ui/switch';
import {
  Settings, Clock, AlertTriangle, Mic, ScanLine, Save, Users, DollarSign, CalendarDays, Fuel
} from 'lucide-react';
import { getConfig, updateConfig, getUsers, getUserPreferences, setUserPreference } from '@/lib/storage';
import { formatCurrency } from '@/lib/ocr';
import type { SystemConfig, UserPreference } from '@/lib/types';
import { toast } from 'sonner';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/* ─────────────────────────────────────────────
   WEEKLY CONFIG — Firestore helpers
───────────────────────────────────────────── */
interface WeeklyExpenseConfig {
  enabled: boolean;
  amount: number;
  type: string;
  description: string;
}

const DEFAULT_WEEKLY: WeeklyExpenseConfig = {
  enabled: true,
  amount: 2000,
  type: 'combustible',
  description: 'Gasto semanal de combustible',
};

async function getWeeklyConfig(): Promise<WeeklyExpenseConfig> {
  try {
    const ref  = doc(db, 'gastoflow_config', 'weekly_expense');
    const snap = await getDoc(ref);
    return snap.exists() ? (snap.data() as WeeklyExpenseConfig) : DEFAULT_WEEKLY;
  } catch {
    return DEFAULT_WEEKLY;
  }
}

async function saveWeeklyConfig(cfg: WeeklyExpenseConfig): Promise<void> {
  const ref = doc(db, 'gastoflow_config', 'weekly_expense');
  await setDoc(ref, cfg);
}

/* ─────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────── */
function ConfigPage() {
  const [mounted, setMounted] = useState(false);
  const [config, setConfig] = useState<SystemConfig>({
    reminderIntervalHours: 24,
    escalationThresholdHours: 48,
    maxEscalationLevel: 3,
    requireOCRConfirmation: true,
    allowVoiceInput: true,
  });
  const [users, setUsers] = useState<{ id: string; name: string; role: string; preferences: UserPreference[] }[]>([]);
  const [weekly, setWeekly]             = useState<WeeklyExpenseConfig>(DEFAULT_WEEKLY);
  const [weeklySaving, setWeeklySaving] = useState(false);
  const [weeklyLoading, setWeeklyLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
    setConfig(getConfig());
    const allUsers = getUsers();
    setUsers(allUsers.map(u => ({
      id: u.id, name: u.name, role: u.role,
      preferences: getUserPreferences(u.id),
    })));
    getWeeklyConfig().then(cfg => { setWeekly(cfg); setWeeklyLoading(false); });
  }, []);

  const handleSave = () => { updateConfig(config); toast.success('Configuración guardada'); };

  const handleSaveWeekly = async () => {
    setWeeklySaving(true);
    try {
      await saveWeeklyConfig(weekly);
      toast.success('Gasto semanal guardado en Firestore ✓');
    } catch (err: any) {
      toast.error('Error al guardar: ' + (err?.message ?? err));
    } finally {
      setWeeklySaving(false);
    }
  };

  const handleUpdatePref = (userId: string, type: string, amount: number) => {
    const pref = users.find(u => u.id === userId)?.preferences.find(p => p.type === type);
    if (!pref) return;
    setUserPreference({ ...pref, defaultAmount: amount });
    setUsers(prev => prev.map(u => u.id !== userId ? u : {
      ...u, preferences: u.preferences.map(p => p.type === type ? { ...p, defaultAmount: amount } : p),
    }));
    toast.success('Preferencia actualizada');
  };

  return (
    <AppShell requiredRole="admin">
      <style>{STYLES}</style>
      <div className="cf-page">
        <div className="cf-top-bar" />

        <div className={`fu ${mounted ? 'in' : ''}`}>
          <div className="cf-eyebrow">Panel Administrativo</div>
          <h1 className="cf-title">Configuración <em>del Sistema</em></h1>
          <p className="cf-sub">Ajusta los parámetros operativos de GastoFlow</p>
        </div>

        {/* ── GASTO SEMANAL FIJO ── */}
        <div className={`cf-card fu d0 ${mounted ? 'in' : ''}`}>
          <div className="cf-card-hd">
            <div className="cf-card-ico" style={{ background:'var(--blue-dim)', color:'var(--blue2)' }}>
              <CalendarDays size={15}/>
            </div>
            <div>
              <div className="cf-card-title">Gasto Semanal Fijo</div>
              <div className="cf-card-sub">El chatbot usará este monto cuando un técnico pida "lo de la semana"</div>
            </div>
            <div className={`cf-badge ${weekly.enabled ? 'on' : 'off'}`}>
              {weekly.enabled ? 'Activo' : 'Inactivo'}
            </div>
          </div>

          {weeklyLoading ? (
            <div className="cf-loading">Cargando desde Firestore…</div>
          ) : (
            <>
              <div className="cf-weekly-body">
                <div className="cf-toggle" style={{ padding:'.75rem 1.1rem', background:'var(--blue-dim)', borderBottom:'1px solid var(--blue-border)' }}>
                  <div className="cf-toggle-left">
                    <div className="cf-toggle-ico" style={{ color:'var(--blue2)' }}><CalendarDays size={14}/></div>
                    <div>
                      <span className="cf-toggle-lbl">Habilitar gasto semanal</span>
                      <span className="cf-toggle-hint">El asistente IA reconocerá frases como "dame lo de la semana"</span>
                    </div>
                  </div>
                  <Switch checked={weekly.enabled} onCheckedChange={v => setWeekly({ ...weekly, enabled: v })} />
                </div>

                <div className="cf-weekly-fields">
                  <div className="cf-weekly-field">
                    <label className="cf-lbl" style={{ marginBottom:'.45rem', display:'flex', alignItems:'center', gap:'.35rem' }}>
                      <DollarSign size={12} style={{ color:'var(--blue2)', opacity:.7 }}/>
                      Monto fijo (RD$)
                    </label>
                    <div className="cf-weekly-input-wrap">
                      <span className="cf-weekly-prefix">RD$</span>
                      <input
                        type="number" className="cf-weekly-input"
                        value={weekly.amount} min={0}
                        onChange={e => setWeekly({ ...weekly, amount: parseFloat(e.target.value) || 0 })}
                        disabled={!weekly.enabled}
                      />
                    </div>
                    <p className="cf-hint" style={{ marginTop:'.3rem' }}>
                      El chatbot lo leerá directamente de Firestore al recibir la solicitud
                    </p>
                  </div>

                  <div className="cf-weekly-field">
                    <label className="cf-lbl" style={{ marginBottom:'.45rem', display:'flex', alignItems:'center', gap:'.35rem' }}>
                      <Fuel size={12} style={{ color:'var(--blue2)', opacity:.7 }}/>
                      Tipo de solicitud
                    </label>
                    <select
                      className="cf-weekly-select"
                      value={weekly.type}
                      onChange={e => setWeekly({ ...weekly, type: e.target.value })}
                      disabled={!weekly.enabled}
                    >
                      <option value="combustible">Combustible</option>
                      <option value="materiales">Materiales</option>
                      <option value="viatico">Viático</option>
                      <option value="gomera">Gomera</option>
                      <option value="otros">Otros</option>
                    </select>
                  </div>

                  <div className="cf-weekly-field" style={{ gridColumn:'1 / -1' }}>
                    <label className="cf-lbl" style={{ marginBottom:'.45rem' }}>Descripción de la solicitud</label>
                    <input
                      type="text" className="cf-weekly-input" style={{ paddingLeft:'.75rem' }}
                      value={weekly.description}
                      onChange={e => setWeekly({ ...weekly, description: e.target.value })}
                      disabled={!weekly.enabled}
                      placeholder="Ej: Gasto semanal de combustible"
                    />
                  </div>
                </div>

                {weekly.enabled && (
                  <div className="cf-weekly-preview">
                    <span className="cf-weekly-preview-ico">🤖</span>
                    <span>
                      Cuando un técnico diga <strong>"dame lo de la semana"</strong>, el chatbot creará automáticamente una solicitud de{' '}
                      <strong>{weekly.type}</strong> por{' '}
                      <strong>RD$ {weekly.amount.toLocaleString('es-DO')}</strong> — sin preguntar nada más.
                    </span>
                  </div>
                )}
              </div>

              <div className="cf-footer">
                <button className="cf-save-btn cf-save-weekly" onClick={handleSaveWeekly} disabled={weeklySaving}>
                  {weeklySaving
                    ? <><span className="cf-spin" /> Guardando…</>
                    : <><Save size={14}/> Guardar Gasto Semanal</>
                  }
                </button>
              </div>
            </>
          )}
        </div>

        {/* System params */}
        <div className={`cf-card fu d1 ${mounted ? 'in' : ''}`}>
          <div className="cf-card-hd">
            <div className="cf-card-ico" style={{ background:'var(--blue-dim)', color:'var(--blue2)' }}><Settings size={15}/></div>
            <div>
              <div className="cf-card-title">Parámetros del Sistema</div>
              <div className="cf-card-sub">Tiempos, recordatorios y escalaciones</div>
            </div>
          </div>

          <div className="cf-fields">
            <div className="cf-field">
              <div className="cf-field-ico" style={{ color:'var(--blue2)' }}><Clock size={14}/></div>
              <div className="cf-field-body">
                <label className="cf-lbl">Intervalo de Recordatorios</label>
                <p className="cf-hint">Cada cuántas horas se envía un recordatorio para solicitudes pendientes</p>
              </div>
              <div className="cf-num-wrap">
                <input type="number" className="cf-num"
                  value={config.reminderIntervalHours}
                  onChange={e => setConfig({ ...config, reminderIntervalHours: parseInt(e.target.value) || 24 })}
                />
                <span className="cf-num-unit">h</span>
              </div>
            </div>

            <div className="cf-divider" />

            <div className="cf-field">
              <div className="cf-field-ico" style={{ color:'#f97316' }}><AlertTriangle size={14}/></div>
              <div className="cf-field-body">
                <label className="cf-lbl">Umbral de Escalación</label>
                <p className="cf-hint">Horas sin actualización antes de escalar la solicitud</p>
              </div>
              <div className="cf-num-wrap">
                <input type="number" className="cf-num"
                  value={config.escalationThresholdHours}
                  onChange={e => setConfig({ ...config, escalationThresholdHours: parseInt(e.target.value) || 48 })}
                />
                <span className="cf-num-unit">h</span>
              </div>
            </div>

            <div className="cf-divider" />

            <div className="cf-field">
              <div className="cf-field-ico" style={{ color:'var(--red2)' }}><AlertTriangle size={14}/></div>
              <div className="cf-field-body">
                <label className="cf-lbl">Nivel Máximo de Escalación</label>
                <p className="cf-hint">Máximo de niveles que puede alcanzar una escalación (1–5)</p>
              </div>
              <div className="cf-num-wrap">
                <input type="number" className="cf-num" value={config.maxEscalationLevel} min={1} max={5}
                  onChange={e => setConfig({ ...config, maxEscalationLevel: parseInt(e.target.value) || 3 })}
                />
              </div>
            </div>
          </div>

          <div className="cf-toggles">
            <div className="cf-toggle">
              <div className="cf-toggle-left">
                <div className="cf-toggle-ico" style={{ color:'#a78bfa' }}><ScanLine size={14}/></div>
                <div>
                  <span className="cf-toggle-lbl">Confirmación OCR</span>
                  <span className="cf-toggle-hint">Requerir confirmación manual de datos extraídos</span>
                </div>
              </div>
              <Switch checked={config.requireOCRConfirmation} onCheckedChange={v => setConfig({ ...config, requireOCRConfirmation: v })} />
            </div>
            <div className="cf-divider" />
            <div className="cf-toggle">
              <div className="cf-toggle-left">
                <div className="cf-toggle-ico" style={{ color:'#22c55e' }}><Mic size={14}/></div>
                <div>
                  <span className="cf-toggle-lbl">Entrada de Voz</span>
                  <span className="cf-toggle-hint">Crear solicitudes mediante comandos de voz</span>
                </div>
              </div>
              <Switch checked={config.allowVoiceInput} onCheckedChange={v => setConfig({ ...config, allowVoiceInput: v })} />
            </div>
          </div>

          <div className="cf-footer">
            <button className="cf-save-btn" onClick={handleSave}><Save size={14}/> Guardar Configuración</button>
          </div>
        </div>

        {/* User preferences */}
        <div className={`cf-card fu d2 ${mounted ? 'in' : ''}`}>
          <div className="cf-card-hd">
            <div className="cf-card-ico" style={{ background:'var(--red-dim)', color:'var(--red2)' }}><Users size={15}/></div>
            <div>
              <div className="cf-card-title">Montos Acostumbrados por Técnico</div>
              <div className="cf-card-sub">Montos predeterminados que el chatbot IA usa como referencia</div>
            </div>
          </div>

          <div style={{ padding:'0 1.1rem 1.1rem' }}>
            <div className="cf-info-note">
              <span style={{ fontSize:'1rem' }}>💡</span>
              <span>Estos montos son leídos por el asistente IA. Cuando un técnico mencione un tipo de gasto sin especificar monto, el bot sugerirá automáticamente el monto configurado aquí.</span>
            </div>

            {users.filter(u => u.role === 'tecnico').map(tecnico => (
              <div key={tecnico.id} className="cf-tecnico">
                <div className="cf-tecnico-name">{tecnico.name}</div>
                <div className="cf-prefs-grid">
                  {tecnico.preferences.map(pref => (
                    <div key={pref.type} className="cf-pref">
                      <span className="cf-pref-type">{pref.type}</span>
                      <div className="cf-pref-input-wrap">
                        <DollarSign size={11} style={{ color:'var(--blue2)', opacity:.5, flexShrink:0 }}/>
                        <input type="number" className="cf-pref-input"
                          value={pref.defaultAmount}
                          onChange={e => handleUpdatePref(tecnico.id, pref.type, parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default function AdminConfigPage() { return <ConfigPage />; }

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Outfit:wght@300;400;500;600&display=swap');

.cf-page {
  font-family: 'Outfit', sans-serif;
  padding: 1.5rem; max-width: 860px; margin: 0 auto; padding-bottom: 5rem;
  --blue: #3b82f6; --blue2: #60a5fa; --blue3: #93c5fd;
  --red: #ef4444;  --red2: #f87171;  --red3: #fca5a5;
  --blue-dim: rgba(59,130,246,.10); --blue-border: rgba(59,130,246,.35);
  --red-dim:  rgba(239,68,68,.10);  --red-border:  rgba(239,68,68,.30);
  --i3: #0a1120; --i4: #0e1828;
  --w: #f0f4ff;
  --w7: rgba(240,244,255,.70); --w4: rgba(240,244,255,.40);
  --w2: rgba(240,244,255,.20); --w08: rgba(240,244,255,.08);
  background: #04080f; min-height: 100vh;
}
@media(min-width:768px) { .cf-page { padding: 2rem 2.5rem 3rem; } }

/* Top bar — same blue→red as login */
.cf-top-bar {
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--blue) 30%, var(--red) 70%, transparent);
  opacity: .75; border-radius: 99px; margin-bottom: 1.75rem;
}

.cf-eyebrow {
  font-size: .66rem; font-weight: 700; letter-spacing: .18em; text-transform: uppercase;
  color: var(--blue2); display: flex; align-items: center; gap: .5rem; margin-bottom: .4rem;
}
.cf-eyebrow::before { content:''; width:18px; height:1px; background:var(--blue2); opacity:.55; display:block; }

.cf-title {
  font-family: 'Playfair Display', serif;
  font-size: 1.85rem; font-weight: 500; color: var(--w);
  letter-spacing: -.01em; line-height: 1.15; margin-bottom: .3rem;
}
.cf-title em {
  font-style: italic;
  background: linear-gradient(125deg, var(--blue2) 20%, var(--blue3) 60%, var(--red2) 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
.cf-sub { font-size: .78rem; color: var(--w4); font-weight: 300; margin-bottom: 1.5rem; }

/* Cards */
.cf-card {
  background: var(--i3); border: 1px solid var(--w08);
  border-radius: 16px; overflow: hidden; margin-bottom: 1rem;
}
.cf-card-hd {
  display: flex; align-items: center; gap: .75rem;
  padding: .875rem 1.1rem; border-bottom: 1px solid var(--w08);
}
.cf-card-ico {
  width: 32px; height: 32px; border-radius: 9px;
  flex-shrink: 0; display: flex; align-items: center; justify-content: center;
}
.cf-card-title { font-family: 'Playfair Display', serif; font-size: .95rem; font-weight: 500; color: var(--w); }
.cf-card-sub { font-size: .7rem; color: var(--w4); font-weight: 300; margin-top: .1rem; }

/* Badge */
.cf-badge { margin-left: auto; font-size: .62rem; font-weight: 700; letter-spacing: .06em; padding: .22rem .65rem; border-radius: 999px; }
.cf-badge.on  { background: rgba(34,197,94,.12); color: #4ade80; border: 1px solid rgba(34,197,94,.22); }
.cf-badge.off { background: rgba(240,244,255,.06); color: rgba(240,244,255,.3); border: 1px solid rgba(240,244,255,.1); }

/* Weekly section */
.cf-weekly-body { padding: 0; }
.cf-weekly-fields { display: grid; grid-template-columns: 1fr 1fr; gap: .85rem; padding: 1rem 1.1rem; }
@media(max-width:480px) { .cf-weekly-fields { grid-template-columns: 1fr; } }

.cf-weekly-input-wrap {
  display: flex; align-items: center; gap: 0;
  background: rgba(4,8,15,.6); border: 1px solid var(--w08);
  border-radius: 9px; overflow: hidden;
  transition: border-color .2s, box-shadow .2s;
}
.cf-weekly-input-wrap:focus-within {
  border-color: var(--blue-border); box-shadow: 0 0 0 3px var(--blue-dim);
}
.cf-weekly-prefix {
  padding: .5rem .6rem; font-size: .7rem; font-weight: 700;
  color: rgba(96,165,250,.5); border-right: 1px solid var(--w08);
  white-space: nowrap; flex-shrink: 0;
}
.cf-weekly-input {
  flex: 1; background: none; border: none; outline: none;
  padding: .5rem .65rem; font-size: .875rem; font-weight: 600;
  color: var(--w); font-family: 'Outfit', sans-serif;
  -webkit-appearance: none; min-width: 0; width: 100%;
}
.cf-weekly-input:disabled { opacity: .35; cursor: not-allowed; }

.cf-weekly-select {
  width: 100%; background: rgba(4,8,15,.6); border: 1px solid var(--w08);
  border-radius: 9px; padding: .5rem .65rem; font-size: .875rem; font-weight: 600;
  color: var(--w); font-family: 'Outfit', sans-serif; outline: none; cursor: pointer;
  transition: border-color .2s;
}
.cf-weekly-select:focus { border-color: var(--blue-border); box-shadow: 0 0 0 3px var(--blue-dim); }
.cf-weekly-select:disabled { opacity: .35; cursor: not-allowed; }
.cf-weekly-select option { background: #0e1828; color: #f0f4ff; }

.cf-weekly-preview {
  display: flex; align-items: flex-start; gap: .55rem;
  background: var(--blue-dim); border: 1px solid var(--blue-border);
  border-radius: 10px; padding: .75rem .9rem; margin: 0 1.1rem 1rem;
  font-size: .75rem; color: rgba(240,244,255,.55); line-height: 1.5;
}
.cf-weekly-preview strong { color: var(--blue3); }
.cf-weekly-preview-ico { font-size: 1rem; flex-shrink: 0; margin-top: .05rem; }

/* Save weekly button — blue→red gradient like login */
.cf-save-weekly {
  background: linear-gradient(135deg, #2563eb, #1d4ed8 50%, #b91c1c) !important;
  box-shadow: 0 4px 18px rgba(59,130,246,.28) !important;
}
.cf-save-weekly:not(:disabled):hover {
  box-shadow: 0 8px 28px rgba(59,130,246,.38) !important;
}
.cf-save-weekly:disabled { opacity: .5; cursor: not-allowed; }

/* Loading state */
.cf-loading {
  padding: 1.5rem 1.1rem; font-size: .78rem; color: var(--w4);
  display: flex; align-items: center; gap: .5rem;
}
.cf-loading::before {
  content: ''; width: 12px; height: 12px;
  border: 2px solid rgba(96,165,250,.3); border-top-color: var(--blue2);
  border-radius: 50%; animation: cf-spin .7s linear infinite; flex-shrink: 0;
}
.cf-spin {
  display: inline-block; width: 12px; height: 12px;
  border: 2px solid rgba(255,255,255,.3); border-top-color: #fff;
  border-radius: 50%; animation: cf-spin .7s linear infinite; flex-shrink: 0;
}
@keyframes cf-spin { to { transform: rotate(360deg); } }

/* Fields */
.cf-fields { padding: .25rem 0; }
.cf-field { display: flex; align-items: flex-start; gap: .875rem; padding: .875rem 1.1rem; }
.cf-field-ico {
  width: 28px; height: 28px; border-radius: 7px;
  background: rgba(240,244,255,.05);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; margin-top: .1rem;
}
.cf-field-body { flex: 1; min-width: 0; }
.cf-lbl { font-size: .78rem; font-weight: 600; color: var(--w7); display: block; margin-bottom: .2rem; }
.cf-hint { font-size: .68rem; color: var(--w4); font-weight: 300; line-height: 1.45; }

.cf-num-wrap { display: flex; align-items: center; gap: .35rem; flex-shrink: 0; }
.cf-num {
  width: 64px; background: rgba(4,8,15,.6); border: 1px solid var(--w08);
  border-radius: 9px; padding: .5rem .65rem; font-size: .875rem; font-weight: 600;
  color: var(--w); font-family: 'Outfit', sans-serif; text-align: center; outline: none;
  transition: border-color .2s, box-shadow .2s; -webkit-appearance: none;
}
.cf-num:focus { border-color: var(--blue-border); box-shadow: 0 0 0 3px var(--blue-dim); }
.cf-num-unit { font-size: .72rem; color: var(--w4); font-weight: 600; }

.cf-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--w08) 20%, var(--w08) 80%, transparent);
  margin: 0 1.1rem;
}

/* Toggles */
.cf-toggles { padding: .25rem 0; }
.cf-toggle {
  display: flex; align-items: center; justify-content: space-between;
  gap: 1rem; padding: .875rem 1.1rem;
}
.cf-toggle-left { display: flex; align-items: flex-start; gap: .75rem; flex: 1; }
.cf-toggle-ico {
  width: 28px; height: 28px; border-radius: 7px;
  background: rgba(240,244,255,.05);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; margin-top: .1rem;
}
.cf-toggle-lbl { font-size: .8rem; font-weight: 600; color: var(--w7); display: block; margin-bottom: .15rem; }
.cf-toggle-hint { font-size: .68rem; color: var(--w4); font-weight: 300; }

/* Footer */
.cf-footer { padding: .875rem 1.1rem; border-top: 1px solid var(--w08); }
.cf-save-btn {
  background: linear-gradient(135deg, #2563eb, #1d4ed8 50%, #b91c1c);
  color: #fff; border: none; border-radius: 10px; padding: .7rem 1.5rem;
  font-family: 'Outfit', sans-serif; font-size: .82rem; font-weight: 600;
  letter-spacing: .04em; cursor: pointer;
  display: inline-flex; align-items: center; gap: .45rem;
  transition: transform .2s cubic-bezier(.22,1,.36,1), box-shadow .2s, filter .2s;
  box-shadow: 0 4px 18px rgba(59,130,246,.28);
}
.cf-save-btn:hover { transform: translateY(-2px); filter: brightness(1.07); box-shadow: 0 8px 28px rgba(59,130,246,.38); }

/* Info note */
.cf-info-note {
  display: flex; align-items: flex-start; gap: .55rem;
  background: var(--blue-dim); border: 1px solid var(--blue-border);
  border-radius: 10px; padding: .75rem .9rem; margin-bottom: 1rem;
  font-size: .75rem; color: rgba(240,244,255,.55); line-height: 1.5;
}

/* Tecnico prefs */
.cf-tecnico {
  background: rgba(240,244,255,.03); border: 1px solid var(--w08);
  border-radius: 12px; padding: .875rem 1rem; margin-bottom: .75rem;
}
.cf-tecnico-name {
  font-size: .82rem; font-weight: 600; color: var(--w7);
  margin-bottom: .75rem; padding-bottom: .5rem; border-bottom: 1px solid var(--w08);
}
.cf-prefs-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: .6rem; }
@media(min-width:480px) { .cf-prefs-grid { grid-template-columns: repeat(3,1fr); } }

.cf-pref { display: flex; flex-direction: column; gap: .3rem; }
.cf-pref-type { font-size: .65rem; color: var(--w4); text-transform: capitalize; font-weight: 500; letter-spacing: .04em; }
.cf-pref-input-wrap {
  display: flex; align-items: center; gap: .35rem;
  background: rgba(4,8,15,.6); border: 1px solid var(--w08);
  border-radius: 9px; padding: .4rem .6rem;
  transition: border-color .2s, box-shadow .2s;
}
.cf-pref-input-wrap:focus-within { border-color: var(--blue-border); box-shadow: 0 0 0 2px var(--blue-dim); }
.cf-pref-input {
  flex: 1; min-width: 0; background: none; border: none; outline: none;
  font-size: .82rem; font-weight: 600; color: var(--w);
  font-family: 'Outfit', sans-serif; -webkit-appearance: none;
}

/* Weekly field */
.cf-weekly-field {}

/* Fade-up */
.fu { opacity:0; transform:translateY(14px); transition:opacity .5s cubic-bezier(.22,1,.36,1),transform .5s cubic-bezier(.22,1,.36,1); }
.fu.in { opacity:1; transform:none; }
.d0{transition-delay:.04s} .d1{transition-delay:.09s} .d2{transition-delay:.16s}
`;