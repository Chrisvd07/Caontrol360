// lib/firebase.ts
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getMessaging, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: "AIzaSyCqQ_RcL_OZN6xGTeJbyDtCC3MYuQl4MK4",
  authDomain: "gastos-c0221.firebaseapp.com",
  projectId: "gastos-c0221",
  storageBucket: "gastos-c0221.firebasestorage.app",
  messagingSenderId: "189538372541",
  appId: "1:189538372541:web:2e424568e080901722e0d4",
  measurementId: "G-Z2XPSXNV58"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db      = getFirestore(app);
export const auth    = getAuth(app);
export const storage = getStorage(app);

// Messaging solo está disponible en el navegador (no en SSR)
export const getMessagingInstance = async () => {
  const supported = await isSupported();
  if (!supported) return null;
  return getMessaging(app);
};

export default app;