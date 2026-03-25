// app/api/notify/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { getFirestore } from 'firebase-admin/firestore';

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

    if (!title || !message) {
      return NextResponse.json({ error: 'title y message son requeridos' }, { status: 400 });
    }

    const app = getAdminApp();
    const db = getFirestore(app);
    const messaging = getMessaging(app);

    let tokens: string[] = [];

    if (body.userId) {
      tokens = await getTokensForUsers(db, [body.userId]);

    } else if (body.role) {
      const usersSnap = await db.collection('users')
        .where('role', '==', body.role)
        .get();

      const userIds = usersSnap.docs.map(d => d.id);
      tokens = await getTokensForUsers(db, userIds);

    } else if (body.broadcast) {
      const usersSnap = await db.collection('users')
        .where('fcmToken', '!=', '')
        .get();

      tokens = usersSnap.docs
        .map(d => d.data().fcmToken as string)
        .filter(Boolean);

    } else {
      return NextResponse.json(
        { error: 'Debes indicar userId, role o broadcast: true' },
        { status: 400 }
      );
    }

    tokens = [...new Set(tokens)];

    if (tokens.length === 0) {
      return NextResponse.json({ sent: 0, message: 'No hay tokens registrados' });
    }

    const now = new Date().toISOString();

    if (body.userId) {
      await saveNotificationFirestore(db, body.userId, { title, message, type, now });

    } else if (body.role) {
      const usersSnap = await db.collection('users').where('role', '==', body.role).get();

      await Promise.all(
        usersSnap.docs.map(d =>
          saveNotificationFirestore(db, d.id, { title, message, type, now })
        )
      );
    }

    // ✅ ENVÍO CORREGIDO (SOLO DATA)
    const response = await messaging.sendEachForMulticast({
      tokens,
      data: {
        title,
        message,
        type,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        url: data.url ?? '/',
        ...data,
      },
    });

    const invalidTokens: string[] = [];

    response.responses.forEach((r, i) => {
      if (!r.success && (
        r.error?.code === 'messaging/registration-token-not-registered' ||
        r.error?.code === 'messaging/invalid-registration-token'
      )) {
        invalidTokens.push(tokens[i]);
      }
    });

    if (invalidTokens.length > 0) {
      const batch = db.batch();
      const snap = await db.collection('users')
        .where('fcmToken', 'in', invalidTokens)
        .get();

      snap.docs.forEach(d => batch.update(d.ref, { fcmToken: '' }));
      await batch.commit();
    }

    return NextResponse.json({
      sent: response.successCount,
      failed: response.failureCount,
      cleaned: invalidTokens.length,
    });

  } catch (err) {
    console.error('[notify] Error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

// Helpers

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
    .filter(Boolean);
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
  });
}