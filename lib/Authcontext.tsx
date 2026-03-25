'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

export type AppUser = {
  uid: string;
  name: string;
  email: string;
  role: string;
  nombre?: string;
  apellido?: string;
  telefono?: string;
};

type AuthContextType = {
  user: AppUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AppUser | null>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        console.log('[Auth] onAuthStateChanged uid:', firebaseUser.uid);
        const appUser = await fetchUserData(firebaseUser.uid);
        setUser(appUser);
      } else {
        console.log('[Auth] onAuthStateChanged: no user');
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => unsub();
  }, []);

  const fetchUserData = async (uid: string): Promise<AppUser | null> => {
    try {
      console.log('[Auth] fetchUserData → buscando users/', uid);

      const ref = doc(db, 'users', uid);
      const snap = await getDoc(ref);

      console.log('[Auth] fetchUserData → snap.exists():', snap.exists());

      if (!snap.exists()) {
        console.warn('[Auth] fetchUserData → documento NO encontrado para uid:', uid);
        return null;
      }

      const data = snap.data();
      console.log('[Auth] fetchUserData → data:', data);

      const appUser: AppUser = {
        uid,
        name: data.name ?? `${data.nombre ?? ''} ${data.apellido ?? ''}`.trim(),
        email: data.email ?? '',
        role: data.role ?? 'tecnico',
        nombre: data.nombre,
        apellido: data.apellido,
        telefono: data.telefono,
      };

      console.log('[Auth] fetchUserData → appUser construido:', appUser);
      return appUser;

    } catch (err: unknown) {
      console.group('🔴 [Auth] fetchUserData ERROR');
      console.error('uid intentado:', uid);
      console.error('Error completo:', err);

      // ✅ Manejo correcto del error (FIX)
      if (err && typeof err === 'object') {
        const e = err as { code?: string };

        if (e.code) {
          console.error('Firebase code:', e.code);
        }

        if (err instanceof Error) {
          console.error('Firebase message:', err.message);
        }
      }

      console.groupEnd();
      return null;
    }
  };

  const login = async (email: string, password: string): Promise<AppUser | null> => {
    console.log('[Auth] login → iniciando con email:', email);

    const credential = await signInWithEmailAndPassword(auth, email, password);

    console.log('[Auth] login → Firebase Auth OK, uid:', credential.user.uid);

    const appUser = await fetchUserData(credential.user.uid);

    console.log('[Auth] login → appUser resultado:', appUser);

    setUser(appUser);
    return appUser;
  };

  const logout = async () => {
    console.log('[Auth] logout');
    await signOut(auth);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}