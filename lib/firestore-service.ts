// lib/firestore-service.ts
// Full Firestore service — drop-in replacement for lib/storage.ts

'use client';

import {
  collection, doc, setDoc, getDoc, getDocs,
  query, where, orderBy, updateDoc,
  Timestamp, runTransaction,
} from 'firebase/firestore';
import { db } from './firebase';
import type {
  Request as GastoRequest,
  AuditLog,
  Notification,
  UserPreference,
  Evidence,
  RequestStatus,
} from './types';

export type { GastoRequest as Request };

// ─── Collection names ────────────────────────────────────────────────────────
const C = {
  REQUESTS:      'requests',
  AUDIT_LOGS:    'auditLogs',
  USERS:         'users',
  NOTIFICATIONS: 'notifications',
  PREFERENCES:   'preferences',
  COUNTERS:      'counters',
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toISO(v: unknown): string {
  if (!v) return new Date().toISOString();
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (typeof v === 'string') return v;
  return new Date().toISOString();
}

function requestFromDoc(data: Record<string, unknown>): GastoRequest {
  return {
    ...(data as unknown as GastoRequest),
    createdAt: toISO(data.createdAt),
    updatedAt: toISO(data.updatedAt),
  };
}

function auditFromDoc(data: Record<string, unknown>): AuditLog {
  return {
    ...(data as unknown as AuditLog),
    timestamp: toISO(data.timestamp),
  };
}

function notifFromDoc(data: Record<string, unknown>): Notification {
  return {
    ...(data as unknown as Notification),
    createdAt: toISO(data.createdAt),
  };
}

// ─── Helper: elimina campos undefined (Firestore los rechaza) ────────────────
function cleanUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

// ─── Request number generator (atomic counter in Firestore) ──────────────────
export async function generateRequestNumberFirestore(): Promise<string> {
  const counterRef = doc(db, C.COUNTERS, 'requests');
  let counter = 1;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    counter = snap.exists() ? (snap.data().value as number) + 1 : 1;
    tx.set(counterRef, { value: counter }, { merge: true });
  });

  const date = new Date();
  const yy   = date.getFullYear().toString().slice(-2);
  const mm   = (date.getMonth() + 1).toString().padStart(2, '0');
  return `SOL-${yy}${mm}-${counter.toString().padStart(4, '0')}`;
}

// ─── CREATE Request ───────────────────────────────────────────────────────────
export async function createRequestFirestore(
  request: Omit<GastoRequest, 'id' | 'numero' | 'createdAt' | 'updatedAt'>
): Promise<GastoRequest> {
  const numero = await generateRequestNumberFirestore();
  const id     = `req-${Date.now()}`;
  const now    = new Date().toISOString();

  const newRequest: GastoRequest = {
    ...request,
    id,
    numero,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, C.REQUESTS, id), {
    ...newRequest,
    createdAt: Timestamp.fromDate(new Date(now)),
    updatedAt: Timestamp.fromDate(new Date(now)),
  });

  await createAuditLogFirestore({
    requestId: id,
    action: 'SOLICITUD_CREADA',
    newStatus: 'enviada',
    userId: request.userId,
    userName: request.userName,
    details: `Solicitud ${numero} creada por RD$${request.totalAmount}`,
  });

  return newRequest;
}

// ─── GET single Request ───────────────────────────────────────────────────────
export async function getRequestFirestore(id: string): Promise<GastoRequest | null> {
  try {
    const snap = await getDoc(doc(db, C.REQUESTS, id));
    if (!snap.exists()) return null;
    return requestFromDoc(snap.data());
  } catch (e) {
    console.error('getRequestFirestore', e);
    return null;
  }
}

// ─── GET by user ──────────────────────────────────────────────────────────────
export async function getRequestsByUserFirestore(userId: string): Promise<GastoRequest[]> {
  try {
    const q    = query(collection(db, C.REQUESTS), where('userId', '==', userId), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => requestFromDoc(d.data()));
  } catch (e) {
    console.error('getRequestsByUserFirestore', e);
    return [];
  }
}

// ─── GET by status (array) ────────────────────────────────────────────────────
export async function getRequestsByStatusFirestore(statuses: RequestStatus[]): Promise<GastoRequest[]> {
  try {
    const q    = query(collection(db, C.REQUESTS), where('status', 'in', statuses), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => requestFromDoc(d.data()));
  } catch (e) {
    console.error('getRequestsByStatusFirestore', e);
    return [];
  }
}

// ─── GET all ──────────────────────────────────────────────────────────────────
export async function getAllRequestsFirestore(): Promise<GastoRequest[]> {
  try {
    const q    = query(collection(db, C.REQUESTS), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => requestFromDoc(d.data()));
  } catch (e) {
    console.error('getAllRequestsFirestore', e);
    return [];
  }
}

// ─── UPDATE Request ───────────────────────────────────────────────────────────
export async function updateRequestFirestore(
  id: string,
  updates: Partial<GastoRequest>,
  userId: string,
  userName: string,
): Promise<GastoRequest | null> {
  try {
    const prev = await getRequestFirestore(id);
    if (!prev) return null;

    const now = new Date().toISOString();

    // Limpia undefined antes de enviar a Firestore
    const safeUpdates = cleanUndefined(updates);

    await updateDoc(doc(db, C.REQUESTS, id), {
      ...safeUpdates,
      updatedAt: Timestamp.fromDate(new Date(now)),
    });

    if (updates.status && updates.status !== prev.status) {
      await createAuditLogFirestore({
        requestId: id,
        action: 'ESTADO_CAMBIADO',
        previousStatus: prev.status,
        newStatus: updates.status,
        userId,
        userName,
        details: updates.observations?.length
          ? `Observacion: ${updates.observations[updates.observations.length - 1]}`
          : `Estado cambió de ${prev.status} a ${updates.status}`,
      });
    }

    return { ...prev, ...updates, updatedAt: now };
  } catch (e) {
    console.error('updateRequestFirestore', e);
    return null;
  }
}

// ─── ADD Evidence to Request ──────────────────────────────────────────────────
export async function addEvidenceToRequestFirestore(
  requestId: string,
  evidence: Evidence,
  userId: string,
  userName: string,
): Promise<GastoRequest | null> {
  try {
    const req = await getRequestFirestore(requestId);
    if (!req) return null;

    // Construye el objeto evidence limpio — solo guarda la URL en Firebase,
    // elimina cualquier campo undefined que Firestore rechaza
    const cleanEvidence = cleanUndefined({
      id:         evidence.id,
      type:       evidence.type,
      url:        evidence.url,           // ← URL de Cloudinary
      uploadedAt: evidence.uploadedAt,
      uploadedBy: evidence.uploadedBy,
      // ocrData solo se incluye si existe y tiene campos válidos
      ...(evidence.ocrData
        ? { ocrData: cleanUndefined(evidence.ocrData as object) }
        : {}),
    }) as Evidence;

    const evidences = [...req.evidences, cleanEvidence];
    const now       = new Date().toISOString();

    await updateDoc(doc(db, C.REQUESTS, requestId), {
      evidences,
      updatedAt: Timestamp.fromDate(new Date(now)),
    });

    await createAuditLogFirestore({
      requestId,
      action: 'EVIDENCIA_SUBIDA',
      userId,
      userName,
      details: `Tipo: ${evidence.type}${evidence.ocrData ? ', OCR procesado' : ''}`,
    });

    return { ...req, evidences, updatedAt: now };
  } catch (e) {
    console.error('addEvidenceToRequestFirestore', e);
    return null;
  }
}

// ─── AUDIT LOGS ───────────────────────────────────────────────────────────────
export async function createAuditLogFirestore(
  log: Omit<AuditLog, 'id' | 'timestamp'>
): Promise<AuditLog> {
  const id  = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  const auditLog: AuditLog = { ...log, id, timestamp: now };

  await setDoc(doc(db, C.AUDIT_LOGS, id), {
    ...cleanUndefined(auditLog),
    timestamp: Timestamp.fromDate(new Date(now)),
  });

  return auditLog;
}

export async function getAuditLogsFirestore(requestId: string): Promise<AuditLog[]> {
  try {
    const q    = query(collection(db, C.AUDIT_LOGS), where('requestId', '==', requestId), orderBy('timestamp', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => auditFromDoc(d.data()));
  } catch (e) {
    console.error('getAuditLogsFirestore', e);
    return [];
  }
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
export async function createNotificationFirestore(
  notification: Omit<Notification, 'id' | 'createdAt' | 'read'>
): Promise<Notification> {
  const id  = `notif-${Date.now()}`;
  const now = new Date().toISOString();

  const newNotif: Notification = { ...notification, id, read: false, createdAt: now };

  await setDoc(doc(db, C.NOTIFICATIONS, id), {
    ...cleanUndefined(newNotif),
    createdAt: Timestamp.fromDate(new Date(now)),
  });

  return newNotif;
}

export async function getNotificationsFirestore(userId: string): Promise<Notification[]> {
  try {
    const q    = query(collection(db, C.NOTIFICATIONS), where('userId', '==', userId), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => notifFromDoc(d.data()));
  } catch (e) {
    console.error('getNotificationsFirestore', e);
    return [];
  }
}

export async function markNotificationReadFirestore(id: string): Promise<void> {
  await updateDoc(doc(db, C.NOTIFICATIONS, id), { read: true });
}

// ─── PREFERENCES ──────────────────────────────────────────────────────────────
export async function getUserPreferencesFirestore(userId: string): Promise<UserPreference[]> {
  try {
    const q    = query(collection(db, C.PREFERENCES), where('userId', '==', userId));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as UserPreference);
  } catch (e) {
    console.error('getUserPreferencesFirestore', e);
    return [];
  }
}

export async function getDefaultAmountFirestore(userId: string, type: string): Promise<number | null> {
  const prefs = await getUserPreferencesFirestore(userId);
  return prefs.find(p => p.type === type)?.defaultAmount ?? null;
}

export async function setUserPreferenceFirestore(pref: UserPreference): Promise<void> {
  const docId = `${pref.userId}-${pref.type}`;
  await setDoc(doc(db, C.PREFERENCES, docId), pref, { merge: true });
}

// ─── NOTIFY ROLE HELPER ───────────────────────────────────────────────────────
export async function notifyRoleFirestore(
  role: string,
  notification: { title: string; message: string; type: Notification['type'] }
): Promise<void> {
  try {
    const q    = query(collection(db, C.USERS), where('role', '==', role));
    const snap = await getDocs(q);
    await Promise.all(
      snap.docs.map(d =>
        createNotificationFirestore({ ...notification, userId: d.id })
      )
    );
  } catch (e) {
    console.error('notifyRoleFirestore', e);
  }
}

// ─── ADD NOTIFICATION for specific user ──────────────────────────────────────
export async function addNotificationFirestore(
  notification: Omit<Notification, 'id' | 'createdAt' | 'read'> & { targetUserId: string }
): Promise<void> {
  const { targetUserId, ...rest } = notification;
  await createNotificationFirestore({ ...rest, userId: targetUserId });
}