// lib/notifications.ts

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: number;
  read: boolean;
  targetUserId?: string; // undefined = broadcast a todos
}

export interface AddNotificationPayload {
  title: string;
  message: string;
  type: Notification['type'];
  targetUserId?: string;
}

// ─── storage keys ───────────────────────────────────────────────────────────

const GLOBAL_KEY = 'gf_notifications_global';

function keyFor(userId: string) {
  return `gf_notifications_${userId}`;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function readAll(key: string): Notification[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function writeAll(key: string, items: Notification[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(items.slice(0, 100)));
}

// ─── public API ─────────────────────────────────────────────────────────────

/**
 * Agrega una notificación.
 * - Si targetUserId está definido → guarda en la clave del usuario.
 * - Si no → guarda en GLOBAL_KEY como broadcast.
 */
export function addNotification(payload: AddNotificationPayload): Notification {
  const notification: Notification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: payload.title,
    message: payload.message,
    type: payload.type,
    timestamp: Date.now(),
    read: false,
    targetUserId: payload.targetUserId,
  };

  if (payload.targetUserId) {
    // Guardar en la clave personal del usuario
    const key = keyFor(payload.targetUserId);
    const existing = readAll(key);
    writeAll(key, [notification, ...existing]);

    // También en global para que admins puedan ver todo
    const global = readAll(GLOBAL_KEY);
    writeAll(GLOBAL_KEY, [notification, ...global]);
  } else {
    // Broadcast: solo en global
    const global = readAll(GLOBAL_KEY);
    writeAll(GLOBAL_KEY, [notification, ...global]);
  }

  return notification;
}

/**
 * Obtiene las notificaciones para un usuario específico.
 * Combina: personales del usuario + broadcasts (sin targetUserId).
 *
 * SIEMPRE pasa el userId del usuario autenticado.
 */
export function getNotifications(userId: string): Notification[] {
  const personal  = readAll(keyFor(userId));
  const broadcast = readAll(GLOBAL_KEY).filter(n => !n.targetUserId);

  // Merge y dedup por id (personal tiene prioridad sobre global para estado de lectura)
  const map = new Map<string, Notification>();
  // Primero broadcast, luego personal (personal sobreescribe si hay conflicto de id)
  [...broadcast, ...personal].forEach(n => map.set(n.id, n));
  return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
}

export function getUnreadCount(userId: string): number {
  return getNotifications(userId).filter(n => !n.read).length;
}

/**
 * Marca una notificación como leída en la clave personal Y en global.
 */
export function markAsRead(id: string, userId: string) {
  // Marcar en la clave personal
  const key = keyFor(userId);
  const personal = readAll(key).map(n => n.id === id ? { ...n, read: true } : n);
  writeAll(key, personal);

  // Si era broadcast (no está en personal), aseguramos que quede marcado en global también
  const global = readAll(GLOBAL_KEY).map(n => n.id === id ? { ...n, read: true } : n);
  writeAll(GLOBAL_KEY, global);
}

export function markAllAsRead(userId: string) {
  // Marcar todas las personales
  const key = keyFor(userId);
  writeAll(key, readAll(key).map(n => ({ ...n, read: true })));

  // Marcar broadcasts en global (los que no tienen targetUserId)
  // y también las personales de este usuario que estén en global
  const global = readAll(GLOBAL_KEY).map(n => {
    if (!n.targetUserId || n.targetUserId === userId) {
      return { ...n, read: true };
    }
    return n;
  });
  writeAll(GLOBAL_KEY, global);
}

/**
 * Limpia las notificaciones del usuario (personales + broadcasts que haya visto).
 * No toca las notificaciones de otros usuarios en global.
 */
export function clearNotifications(userId: string) {
  if (typeof window === 'undefined') return;
  // Limpiar clave personal
  localStorage.removeItem(keyFor(userId));
  // Limpiar del global las que pertenecen a este usuario
  const global = readAll(GLOBAL_KEY).filter(n => n.targetUserId && n.targetUserId !== userId);
  writeAll(GLOBAL_KEY, global);
  // Los broadcasts los dejamos (pueden ser vistos por otros usuarios)
}

// ─── permission ─────────────────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied')  return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

// ─── role-based helpers ──────────────────────────────────────────────────────

/**
 * Obtiene los IDs de todos los usuarios con un rol específico.
 * Lee del mismo localStorage que usa storage.ts.
 */
export function getUserIdsByRole(role: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const users = JSON.parse(localStorage.getItem('gastoflow_users') || '[]');
    return users
      .filter((u: { role: string }) => u.role === role)
      .map((u: { id: string }) => u.id);
  } catch {
    return [];
  }
}

/**
 * Envía una notificación a TODOS los usuarios de un rol específico.
 */
export function notifyRole(
  role: string,
  payload: Omit<AddNotificationPayload, 'targetUserId'>,
) {
  const userIds = getUserIdsByRole(role);
  userIds.forEach(uid => {
    addNotification({ ...payload, targetUserId: uid });
  });
}

// ─── trigger helpers ─────────────────────────────────────────────────────────

export function triggerStatusNotification(
  status: string,
  requestNumero: string,
  requestId: string,
  userId: string,
  approvedAmount?: number,
) {
  switch (status) {
    case 'aprobada':
      addNotification({
        title: `✅ Solicitud ${requestNumero} aprobada`,
        message: approvedAmount
          ? `Tu solicitud por ${formatAmt(approvedAmount)} fue aprobada. Pronto recibirás la transferencia.`
          : 'Tu solicitud fue aprobada por el área de pagos.',
        type: 'success', targetUserId: userId,
      });
      break;

    case 'rechazada':
      addNotification({
        title: `❌ Solicitud ${requestNumero} rechazada`,
        message: 'Tu solicitud fue rechazada. Revisa las observaciones para más detalles.',
        type: 'error', targetUserId: userId,
      });
      break;

    case 'transferida':
      addNotification({
        title: `💰 Transferencia enviada — ${requestNumero}`,
        message: approvedAmount
          ? `Recibiste ${formatAmt(approvedAmount)}. Recuerda subir tu comprobante y factura fiscal.`
          : 'La transferencia fue realizada. Recuerda subir tu comprobante y factura.',
        type: 'success', targetUserId: userId,
      });
      addNotification({
        title: `📎 Factura pendiente — ${requestNumero}`,
        message: 'Tienes una factura fiscal pendiente de subir para cerrar esta solicitud.',
        type: 'warning', targetUserId: userId,
      });
      break;

    case 'comprobante_subido':
      addNotification({
        title: `🧾 Comprobante disponible — ${requestNumero}`,
        message: 'El comprobante de transferencia fue subido. Solo falta tu factura fiscal.',
        type: 'info', targetUserId: userId,
      });
      break;

    case 'observada':
      addNotification({
        title: `⚠️ Observación en solicitud ${requestNumero}`,
        message: 'Contabilidad agregó una observación. Revisa el detalle de la solicitud.',
        type: 'warning', targetUserId: userId,
      });
      break;

    case 'validada':
      addNotification({
        title: `🎉 Solicitud ${requestNumero} completada`,
        message: 'Tu solicitud fue validada por contabilidad. El proceso está completo.',
        type: 'success', targetUserId: userId,
      });
      break;
  }
}

function formatAmt(n: number) {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n);
}