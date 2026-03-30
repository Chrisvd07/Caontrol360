// app/api/notify/route.ts
// ✅ ARCHIVO CORREGIDO - Reemplaza el tuyo con este

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { getFirestore } from 'firebase-admin/firestore';

const ANDROID_CHANNEL_ID = 'caontrol360_alerts';

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

interface NotifyBody {
  userId?: string;
  role?: string;
  broadcast?: boolean;

  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';

  data?: Record<string, string>;
}

export async function POST(req: NextRequest) {
  try {
    const body: NotifyBody = await req.json();
    const { title, message, type, data = {} } = body;

    // ✅ Validación
    if (!title || !message) {
      return NextResponse.json(
        { error: 'title y message son requeridos' },
        { status: 400 }
      );
    }

    const app = getAdminApp();
    const db = getFirestore(app);
    const messaging = getMessaging(app);

    let tokens: string[] = [];
    let userIds: string[] = [];

    // ─── Obtener tokens según el destino ─────────────────────────────────────

    if (body.userId) {
      // 👤 A un usuario específico
      tokens = await getTokensForUsers(db, [body.userId]);
      userIds = [body.userId];

    } else if (body.role) {
      // 👥 A todos los usuarios de un rol
      const usersSnap = await db.collection('users')
        .where('role', '==', body.role)
        .get();

      userIds = usersSnap.docs.map(d => d.id);
      tokens = await getTokensForUsers(db, userIds);

    } else if (body.broadcast) {
      // 📢 A todos
      const usersSnap = await db.collection('users')
        .where('fcmToken', '!=', '')
        .get();

      userIds = usersSnap.docs.map(d => d.id);
      tokens = usersSnap.docs
        .map(d => d.data().fcmToken as string)
        .filter(Boolean);

    } else {
      return NextResponse.json(
        { error: 'Debes indicar userId, role o broadcast: true' },
        { status: 400 }
      );
    }

    // ─── Deduplicar tokens ───────────────────────────────────────────────────
    tokens = [...new Set(tokens)];

    if (tokens.length === 0) {
      return NextResponse.json({ 
        sent: 0, 
        message: 'No hay tokens registrados'
      });
    }

    const now = new Date().toISOString();

    // ─── Guardar en Firestore ANTES de enviar ────────────────────────────────
    // (para que el usuario vea la notificación aunque FCM falle)
    if (body.userId) {
      await saveNotificationFirestore(db, body.userId, { title, message, type, now });
    } else if (body.role) {
      await Promise.all(
        userIds.map(userId =>
          saveNotificationFirestore(db, userId, { title, message, type, now })
        )
      );
    }

    // ─── Enviar notificación por FCM ─────────────────────────────────────────
    // ✅ IMPORTANTE: Enviar AMBOS notification y data para máxima compatibilidad

    console.log(`[notify] Enviando a ${tokens.length} dispositivos:`, {
      title,
      message,
      type,
      recipients: body.userId ? 'user' : body.role ? 'role' : 'broadcast'
    });

    const response = await messaging.sendEachForMulticast({
      tokens,
      
      // ✅ Notification: aparece en el panel de notificaciones
      notification: {
        title: title,
        body: message,
      },

      // ✅ Data: datos adicionales que tu app puede procesar
      data: {
        title,
        message,
        type,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        url: data.url ?? '/',
        ...data,
      },

      // ✅ Webpush: configuración específica para navegadores
      webpush: {
        fcmOptions: {
          link: data.url ?? '/',
        },
        notification: {
          title: title,
          body: message,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          requireInteraction: type === 'error' || type === 'warning',
        },
        data: {
          title,
          message,
          type,
          url: data.url ?? '/',
        },
      },
      android: {
        priority: 'high',
        notification: {
          channelId: ANDROID_CHANNEL_ID,
          sound: 'control360',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        },
      },
    });

    console.log(`[notify] Resultado del envío:`, {
      exitosas: response.successCount,
      fallidas: response.failureCount,
      total: tokens.length
    });

    // ─── Limpiar tokens inválidos ───────────────────────────────────────────
    const invalidTokens: string[] = [];

    response.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code;
        const isInvalid = code && (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/mismatched-credential' ||
          code === 'messaging/third-party-auth-error' ||
          code === 'messaging/instance-id-error'
        );

        if (isInvalid) {
          invalidTokens.push(tokens[i]);
          console.warn(`[notify] Token inválido: ${tokens[i].substring(0, 20)}...`);
        } else {
          console.warn(`[notify] Error en token ${tokens[i].substring(0, 20)}... código:`, code);
        }
      }
    });

    // ✅ LIMPIAR tokens inválidos INMEDIATAMENTE
    if (invalidTokens.length > 0) {
      const batch = db.batch();
      const snap = await db.collection('users')
        .where('fcmToken', 'in', invalidTokens)
        .get();

      snap.docs.forEach(d => {
        batch.update(d.ref, { fcmToken: '' });
      });

      await batch.commit();
      console.log(`[notify] ✅ Limpiados ${invalidTokens.length} tokens inválidos`);
    }

    return NextResponse.json({
      sent: response.successCount,
      failed: response.failureCount,
      cleaned: invalidTokens.length,
      message: `Enviadas ${response.successCount} notificaciones`
    });

  } catch (err) {
    console.error('[notify] Error:', err);
    return NextResponse.json(
      { 
        error: 'Error interno del servidor',
        details: err instanceof Error ? err.message : String(err)
      },
      { status: 500 }
    );
  }
}

// ─── Helper Functions ────────────────────────────────────────────────────────

async function getTokensForUsers(
  db: FirebaseFirestore.Firestore,
  userIds: string[],
): Promise<string[]> {
  if (userIds.length === 0) return [];

  const snaps = await Promise.all(
    userIds.map(id => db.collection('users').doc(id).get())
  );

  return snaps
    .map(s => s.data()?.fcmToken as string)
    .filter(token => token && token.length > 0);
}

async function saveNotificationFirestore(
  db: FirebaseFirestore.Firestore,
  userId: string,
  payload: { title: string; message: string; type: string; now: string },
) {
  const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  await db.collection('notifications').doc(id).set({
    id,
    userId,
    title: payload.title,
    message: payload.message,
    type: payload.type,
    read: false,
    createdAt: payload.now,
    updatedAt: payload.now,
  });
}