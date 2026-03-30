// lib/notify.ts
// ✅ ARCHIVO MEJORADO - Reemplaza el tuyo con este

type NotifType = 'info' | 'success' | 'warning' | 'error';

interface NotifyOptions {
  title:   string;
  message: string;
  type:    NotifType;
  data?:   Record<string, string>; // ej: { requestId: 'req-123', url: '/solicitudes/req-123' }
}

// ─── Notificar a un usuario específico ───────────────────────────────────────
export async function notifyUser(userId: string, opts: NotifyOptions) {
  return sendNotify({ userId, ...opts });
}

// ─── Notificar a todos los usuarios de un rol ─────────────────────────────────
export async function notifyRole(
  role: 'admin' | 'pagos' | 'contabilidad' | 'solicitante',
  opts: NotifyOptions,
) {
  return sendNotify({ role, ...opts });
}

// ─── Broadcast a todos ────────────────────────────────────────────────────────
export async function notifyAll(opts: NotifyOptions) {
  return sendNotify({ broadcast: true, ...opts });
}

// ─── Trigger de cambio de estado (el más usado en tu app) ────────────────────
export async function notifyStatusChange(params: {
  status:        string;
  requestNumero: string;
  requestId:     string;
  userId:        string;
  approvedAmount?: number;
}) {
  const { status, requestNumero, requestId, userId, approvedAmount } = params;
  const url = `/solicitudes/${requestId}`;

  const map: Record<string, { title: string; message: string; type: NotifType }> = {
    aprobada: {
      title:   `✅ Solicitud ${requestNumero} aprobada`,
      message: approvedAmount
        ? `Tu solicitud por ${fmt(approvedAmount)} fue aprobada.`
        : 'Tu solicitud fue aprobada por el área de pagos.',
      type: 'success',
    },
    rechazada: {
      title:   `❌ Solicitud ${requestNumero} rechazada`,
      message: 'Tu solicitud fue rechazada. Revisa las observaciones.',
      type:    'error',
    },
    transferida: {
      title:   `💰 Transferencia enviada — ${requestNumero}`,
      message: approvedAmount
        ? `Recibiste ${fmt(approvedAmount)}. Recuerda subir tu comprobante y factura.`
        : 'La transferencia fue realizada.',
      type: 'success',
    },
    observada: {
      title:   `⚠️ Observación en solicitud ${requestNumero}`,
      message: 'Contabilidad agregó una observación. Revisa el detalle.',
      type:    'warning',
    },
    validada: {
      title:   `🎉 Solicitud ${requestNumero} completada`,
      message: 'Tu solicitud fue validada por contabilidad.',
      type:    'success',
    },
  };

  const notif = map[status];
  if (!notif) {
    console.warn('[notify] Estado desconocido:', status);
    return false;
  }

  // ✅ Notificar al usuario
  const result = await notifyUser(userId, { ...notif, data: { requestId, url } });

  // ✅ Si se transfirió, también notificar a contabilidad
  if (status === 'transferida') {
    await notifyRole('contabilidad', {
      title:   `📎 Factura pendiente — ${requestNumero}`,
      message: 'Se realizó una transferencia. Pendiente de validación.',
      type:    'warning',
      data:    { requestId, url },
    });
  }

  return result;
}

// ─── Interno: Enviar notificación por API ──────────────────────────────────
async function sendNotify(body: Record<string, unknown>) {
  try {
    const res = await fetch('/api/notify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('[notify] Error en API:', res.status, errorText);
      return false;
    }

    const data = await res.json();
    console.log('[notify] ✅ Enviada:', {
      enviadas: data.sent,
      fallidas: data.failed,
      limpiadas: data.cleaned
    });

    return true;

  } catch (err) {
    console.error('[notify] Error en fetch:', err);
    return false;
  }
}

// ─── Formato de moneda ──────────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP'
  }).format(n);
}

// ─── Debug: Ver estado de FCM ──────────────────────────────────────────────
export async function debugFCMStatus(userId: string) {
  try {
    const response = await fetch('/api/debug/fcm-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });

    const data = await response.json();
    console.log('[notify] FCM Status:', data);
    return data;
  } catch (err) {
    console.error('[notify] Error checking FCM status:', err);
    return null;
  }
}