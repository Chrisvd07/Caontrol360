'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

// ─── Tipo de usuario de la app ────────────────────────────────────────────────
export type User = {
  id: string;       // mismo que uid — para compatibilidad con el resto del código
  uid: string;
  name: string;
  email: string;
  role: string;
  nombre?: string;
  apellido?: string;
  telefono?: string;
};

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<User | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Fetch del perfil desde Firestore ─────────────────────────────────────────
async function fetchUserProfile(uid: string): Promise<User | null> {
  try {
    console.log('[Auth] fetchUserProfile uid:', uid);
    const snap = await getDoc(doc(db, 'users', uid));

    if (!snap.exists()) {
      console.warn('[Auth] No existe documento en users/', uid);
      return null;
    }

    const data = snap.data();
    console.log('[Auth] Perfil encontrado:', data);

    return {
      id:       uid,   // compatibilidad con código que usa user.id
      uid,
      name:     data.name     ?? `${data.nombre ?? ''} ${data.apellido ?? ''}`.trim(),
      email:    data.email    ?? '',
      role:     data.role     ?? 'tecnico',
      nombre:   data.nombre,
      apellido: data.apellido,
      telefono: data.telefono,
    };
  } catch (err) {
    console.group('🔴 [Auth] fetchUserProfile ERROR');
    console.error('uid:', uid);
    console.error('error:', err);
    console.groupEnd();
    return null;
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]           = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Escucha cambios de sesión Firebase (recarga de página, logout, etc.)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        console.log('[Auth] Sesión activa uid:', firebaseUser.uid);
        const profile = await fetchUserProfile(firebaseUser.uid);
        setUser(profile);
      } else {
        console.log('[Auth] Sin sesión activa');
        setUser(null);
      }
      setIsLoading(false);
    });
    return () => unsub();
  }, []);

  // Login con Firebase Auth
  const login = useCallback(async (email: string, password: string): Promise<User | null> => {
    console.log('[Auth] login:', email);
    // Si las credenciales son incorrectas, lanza error — lo captura el componente login
    const credential = await signInWithEmailAndPassword(auth, email, password);
    console.log('[Auth] Firebase Auth OK uid:', credential.user.uid);

    const profile = await fetchUserProfile(credential.user.uid);
    setUser(profile);
    return profile;
  }, []);

  // Logout
  const logout = useCallback(async () => {
    await signOut(auth);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: user !== null,
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}